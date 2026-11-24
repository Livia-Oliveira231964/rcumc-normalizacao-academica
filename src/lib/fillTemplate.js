/* ============================================================
 * PREENCHIMENTO DE MODELO DOCX (RCUMC)
 * ------------------------------------------------------------
 * Preenche o modelo .docx oficial preservando estilos,
 * cabeçalho, rodapé, margens e formatação do template.
 *
 * Estratégia: clona parágrafos do template por papel (título,
 * heading de seção, corpo) e substitui apenas o texto,
 * mantendo pPr/rPr/estilos do modelo.
 * ============================================================ */

import JSZip from 'jszip';
import { promises as fs } from 'fs';
import path from 'path';
import { DOC_TYPES } from './normalize.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WT = `<w:t xml:space="preserve">`;

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function parseSections(text) {
  const patterns = {
    titulo_pt: /^(t[íi]tulo\s+em\s+portugu[eê]s)\s*[:\-]?$/i,
    titulo_en: /^(t[íi]tulo\s+em\s+ingl[eê]s|title\s+in\s+english)\s*[:\-]?$/i,
    titulo_es: /^(t[íi]tulo\s+en\s+espa[nñ]ol|t[íi]tulo\s+em\s+espanhol)\s*[:\-]?$/i,
    resumo: /^resumo\s*[:\-]?$/i,
    palavras_chave: /^palavras[- ]chave\s*[:\-]?$/i,
    abstract: /^abstract\s*[:\-]?$/i,
    keywords: /^keywords?\s*[:\-]?$/i,
    resumen: /^resumen\s*[:\-]?$/i,
    palabras_clave: /^palabras\s+clave\s*[:\-]?$/i,
    introducao: /^introdu[cç][aã]o\s*[:\-]?$/i,
    metodos: /^(material\s+e\s+m[eé]todos|metodologia|m[eé]todos)\s*[:\-]?$/i,
    resultados: /^(resultados(\s+e\s+discuss[aã]o)?|discuss[aã]o)\s*[:\-]?$/i,
    conclusao: /^(conclus[aã]o|considera[cç][oõ]es\s+finais)\s*[:\-]?$/i,
    referencias: /^refer[eê]ncias\s*[:\-]?$/i,
    agradecimentos: /^agradecimentos(\s+e\s+financiamentos)?\s*[:\-]?$/i,
    conflito: /^conflito\s+de\s+interesses?\s*[:\-]?$/i,
    dados: /^disponibilidade\s+dos\s+dados\s*[:\-]?$/i,
  };
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const sections = { _preamble: [] };
  let cur = '_preamble';
  for (const raw of lines) {
    const s = raw.trim();
    let matched = null;
    for (const [k, re] of Object.entries(patterns)) { if (re.test(s)) { matched = k; break; } }
    if (matched) { cur = matched; if (!sections[cur]) sections[cur] = []; }
    else { (sections[cur] ||= []).push(raw); }
  }
  for (const k of Object.keys(sections)) {
    let v = sections[k];
    while (v.length && !v[0].trim()) v.shift();
    while (v.length && !v[v.length - 1].trim()) v.pop();
    sections[k] = v.join('\n').trim();
  }
  // Remove header/footer artifacts that may have leaked into extracted text
  for (const k of Object.keys(sections)) {
    sections[k] = sections[k]
      .replace(/Revista\s+Cientifica\s+UMC\s*\|\s*RCUMC\s*\|\s*ISSN:\s*2525-5150/gi, '')
      .replace(/RCUMC\s*\|\s*Vol\.\s*\d+\s*\|\s*N\.\s*\d+\s*\|\s*Ano\s*\d+\s*\|?/gi, '')
      .trim();
  }
  return sections;
}

/* ---- XML helpers ---- */
function getParaText(pXml) {
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let m, out = '';
  while ((m = re.exec(pXml))) out += m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
  return out;
}

function getPPr(pXml) {
  const m = pXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/);
  return m ? m[0] : '<w:pPr/>';
}

function getPStyle(pXml) {
  const m = pXml.match(/<w:pStyle[^>]*w:val="([^"]+)"/);
  return m ? m[1] : '';
}

/* get first run rPr, stripping highlight (template instructional highlight) */
function getCleanRPr(pXml) {
  const m = pXml.match(/<w:rPr[\s\S]*?<\/w:rPr>/);
  if (!m) return '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/></w:rPr>';
  return m[0].replace(/<w:highlight[^>]*\/>/g, '').replace(/<w:highlight[\s\S]*?<\/w:highlight>/g, '');
}

function makeParaFromTemplate(templateParaXml, text) {
  const pPr = getPPr(templateParaXml);
  const rPr = getCleanRPr(templateParaXml);
  const lines = String(text ?? '').split('\n');
  const runs = lines.map((line, i) => {
    const br = i < lines.length - 1 ? '<w:br/>' : '';
    return `<w:r>${rPr}${WT}${esc(line)}</w:t>${br}</w:r>`;
  }).join('');
  // keep any bookmarks/rPrChange? no, safer to rebuild para with pPr + runs
  // but preserve w:p attributes? rare. keep simple.
  const pAttrs = (templateParaXml.match(/^<w:p(\s[^>]*)?>/) || ['<w:p>'])[0];
  const openTag = pAttrs.startsWith('<w:p ') ? pAttrs : '<w:p>';
  return `${openTag}${pPr}${runs}</w:p>`;
}

function splitBodyParas(bodyInner) {
  const paras = [];
  const re = /<w:p\b[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(bodyInner))) paras.push({ xml: m[0], index: m.index });
  return paras;
}

function extractSectPr(bodyInner) {
  const m = bodyInner.match(/(<w:sectPr[\s\S]*?<\/w:sectPr>)/);
  return m ? m[1] : '';
}

function classifyPara(p) {
  const txt = getParaText(p.xml).trim();
  const style = getPStyle(p.xml).toLowerCase();
  const norm = txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return { ...p, txt, norm, style };
}

function findPara(paras, pred) { return paras.find(pred); }
function findAll(paras, pred) { return paras.filter(pred); }

/* ---- Resumo Simples builder using template paragraphs ---- */
function buildResumoSimplesFromTemplate(paras, sections) {
  const byNorm = (n) => paras.find(p => p.norm === n);
  const byNormIncl = (n) => paras.find(p => p.norm.includes(n));

  // identify template paragraphs
  const pTituloPtH = byNorm('titulo em portugues');
  const pTituloPtV = byNormIncl('titulo do artigo em portugues');
  const pResumoH = byNorm('resumo');
  const pResumoV = paras.find(p => p.norm.includes('estruturado em um unico paragrafo') && p.norm.includes('250'));
  const pKwH = byNorm('palavras-chave') || byNorm('palavras chave');
  const pKwV = paras.find(p => p.norm.includes('cinco descritores') && (p.norm.includes('tematica') || p.norm.includes('tema do trabalho')));
  const pTitleEnH = byNorm('title in english');
  const pTitleEnV = byNormIncl('title of the article in english');
  const pAbsH = byNorm('abstract');
  const pAbsV = paras.find(p => p.norm.includes('structured in a single paragraph'));
  const pKwsH = byNorm('keywords');
  const pKwsV = paras.find(p => p.norm.includes('five descriptors') && (p.norm.includes('study') || p.norm.includes('theme')));
  const pTituloEsH = byNorm('titulo en espanol') || byNorm('titulo em espanhol');
  const pTituloEsV = byNormIncl('titulo del articulo en espanol');
  const pResH = byNorm('resumen');
  const pResV = paras.find(p => p.norm.includes('estructurado en un solo parrafo'));
  const pPcH = byNorm('palabras clave');
  const pPcV = paras.find(p => p.norm.includes('cinco descriptores') && (p.norm.includes('tematica del estudio') || p.norm.includes('tema del trabajo')));

  // pick a blank spacer template (prefer body/no-style blank)
  // blank spacer: prefer truly empty body paragraph (no pStyle)
  const blank = paras.find(p => !p.txt && !p.style) || paras.find(p => !p.txt && !/ttulo|titulo|heading/i.test(p.style)) || pResumoV;

  const out = [];
  const emit = (tpl, text) => { if (tpl) out.push(makeParaFromTemplate(tpl.xml, text)); };
  const emitBlank = () => { if (blank) out.push(makeParaFromTemplate(blank.xml, '')); };

  emit(pTituloPtH, 'Título em Português');
  emit(pTituloPtV, sections.titulo_pt || sections._preamble || 'Título do artigo em português.');
  emitBlank();
  emit(pResumoH, 'Resumo');
  emit(pResumoV, sections.resumo || '');
  emitBlank();
  emit(pKwH, 'Palavras-chave');
  emit(pKwV, sections.palavras_chave || '');
  emitBlank();
  emit(pTitleEnH, 'Title in English');
  emit(pTitleEnV, sections.titulo_en || 'Title of the article in english.');
  emitBlank();
  emit(pAbsH, 'Abstract');
  emit(pAbsV, sections.abstract || '');
  emitBlank();
  emit(pKwsH, 'Keywords');
  emit(pKwsV, sections.keywords || '');
  emitBlank();
  emit(pTituloEsH, 'Título en Español');
  emit(pTituloEsV, sections.titulo_es || 'Título del artículo en español.');
  emitBlank();
  emit(pResH, 'Resumen');
  emit(pResV, sections.resumen || '');
  emitBlank();
  emit(pPcH, 'Palabras clave');
  emit(pPcV, sections.palabras_clave || '');

  return out.join('');
}

function buildResumoExpandidoFromTemplate(paras, sections) {
  const byNorm = (n) => paras.find(p => p.norm === n);
  const byNormIncl = (n) => paras.find(p => p.norm.includes(n));
  const blank = paras.find(p => !p.txt) || paras[paras.length-1];
  const heading = paras.find(p => p.style.toLowerCase().includes('ttulo2') || p.style.toLowerCase().includes('titulo2')) || paras.find(p => p.norm==='resumo');
  const body = paras.find(p => p.norm.includes('estruturado em um unico paragrafo') || p.norm.includes('o resumo expandido')) || paras.find(p => !p.style && p.txt.length>30);

  const out = [];
  const emit = (tpl, text) => { if (tpl) out.push(makeParaFromTemplate(tpl.xml, text)); };
  const emitBlank = () => { if (blank) out.push(makeParaFromTemplate(blank.xml, '')); };

  emit(byNorm('titulo em portugues') || heading, 'Título em Português');
  emit(byNormIncl('titulo do artigo em portugues') || body, sections.titulo_pt || sections._preamble || 'Título do artigo em português.');
  emitBlank();
  emit(byNorm('title in english') || heading, 'Title in English');
  emit(byNormIncl('title of the article in english') || body, sections.titulo_en || 'Title of the article in english.');
  emitBlank();
  emit(byNorm('titulo en espanol') || byNorm('titulo em espanhol') || heading, 'Título en Español');
  emit(byNormIncl('titulo del articulo en espanol') || body, sections.titulo_es || 'Título del artículo en español.');
  emitBlank();

  const map = [['introducao','Introdução'],['metodos','Material e Métodos'],['resultados','Resultados e Discussão'],['conclusao','Conclusão'],['agradecimentos','Agradecimentos e Financiamentos'],['conflito','Conflito de Interesses'],['dados','Disponibilidade dos Dados'],['referencias','Referências']];
  for (const [k,label] of map) {
    if (!sections[k]) continue;
    emit(heading, label);
    emit(body, sections[k]);
    emitBlank();
  }
  if (out.length && !getParaText(out[out.length-1]).trim()) out.pop();
  return out.join('');
}

function buildGenericFromTemplate(paras, sections) {
  const body = paras.find(p => p.txt && !getPStyle(p.xml).toLowerCase().includes('ttulo')) || paras[0];
  const heading = paras.find(p => getPStyle(p.xml).toLowerCase().includes('ttulo')) || body;
  const out = [];
  for (const [k,v] of Object.entries(sections)) {
    if (!v) continue;
    if (k !== '_preamble') out.push(makeParaFromTemplate(heading.xml, k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())));
    out.push(makeParaFromTemplate(body.xml, v));
  }
  return out.join('') || (body ? makeParaFromTemplate(body.xml, '') : '');
}

export async function preencherModeloDocx(tipoDocumento, texto) {
  const modelMap = {
    [DOC_TYPES.RESUMO_SIMPLES]: 'Modelo-Resumo-simples.docx',
    [DOC_TYPES.RESUMO_EXPANDIDO]: 'Resumo-estruturado.docx',
    [DOC_TYPES.FOLHA_ROSTO]: 'Folha-de-Rosto.docx',
    [DOC_TYPES.CARTA_APRESENTACAO]: 'Folha-de-Rosto.docx',
  };
  const modelName = modelMap[tipoDocumento] || 'Modelo-Resumo-simples.docx';
  const modelPath = path.join(process.cwd(), 'models', modelName);
  const templateBytes = await fs.readFile(modelPath);

  const zip = await JSZip.loadAsync(templateBytes);
  const docXmlPath = 'word/document.xml';
  let docXml = await zip.file(docXmlPath).async('string');

  const bodyMatch = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error('document.xml sem <w:body>');
  const bodyInner = bodyMatch[1];
  const sectPr = extractSectPr(bodyInner);
  const paras = splitBodyParas(bodyInner).map(classifyPara);

  const sections = parseSections(texto);
  let bodyContent = '';
  if (tipoDocumento === DOC_TYPES.RESUMO_SIMPLES) bodyContent = buildResumoSimplesFromTemplate(paras, sections);
  else if (tipoDocumento === DOC_TYPES.RESUMO_EXPANDIDO) bodyContent = buildResumoExpandidoFromTemplate(paras, sections);
  else bodyContent = buildGenericFromTemplate(paras, sections);

  const sectPara = sectPr ? `<w:p><w:pPr>${sectPr}</w:pPr></w:p>` : '';
  const newBody = `<w:body>${bodyContent}${sectPara}</w:body>`;
  docXml = docXml.replace(/<w:body>[\s\S]*<\/w:body>/, newBody);

  zip.file(docXmlPath, docXml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

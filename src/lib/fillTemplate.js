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
      .replace(/Revista\s+Cient[ií]fica\s+UMC\s*\|\s*RCUMC\s*\|\s*ISSN:\s*2525-5150/gi, '')
      .replace(/RCUMC\s*\|\s*Vol\.\s*\d+\s*\|\s*N\.\s*\d+\s*\|\s*Ano\s*\d+\s*\|?/gi, '')
      .replace(/^\s*\d+\s*$/gm, '') // isolated page numbers
      .replace(/\n{3,}/g, '\n\n')
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
  let rPr = m ? m[0] : '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/></w:rPr>';
  rPr = rPr.replace(/<w:highlight[^>]*\/>/g, '').replace(/<w:highlight[\s\S]*?<\/w:highlight>/g, '');
  // Heading styles in templates rely on style for bold; ensure explicit bold for headings
  const style = getPStyle(pXml).toLowerCase();
  // don't force bold - rely on template style/rPr to avoid "tudo em negrito"

  return rPr;
}

function isCleanBlank(p) {
  if (p.txt) return false;
  const rPr = (p.xml.match(/<w:rPr[\s\S]*?<\/w:rPr>/) || [''])[0];
  // avoid blanks carrying large title font sizes
  if (/w:val="(28|32|36|40|48)"/.test(rPr)) return false;
  return true;
}

function makeParaFromTemplate(templateParaXml, text) {
  const pPr = getPPr(templateParaXml);
  const rPr = getCleanRPr(templateParaXml);
  const lines = String(text ?? '').split('\n');
  const runs = lines.map((line, i) => {
    const br = i < lines.length - 1 ? '<w:br/>' : '';
    return `<w:r>${rPr}${WT}${esc(line)}</w:t>${br}</w:r>`;
  }).join('');
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
  // blank spacer: prefer clean body blank without title font sizing
  const blank = paras.find(p => isCleanBlank(p) && !p.style) || paras.find(p => isCleanBlank(p)) || paras.find(p => !p.txt) || pResumoV;

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
  const blank = paras.find(p => isCleanBlank(p)) || paras.find(p => !p.txt) || paras[paras.length-1];
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

function fillParaTextKeepStyle(pXml, text) {
  const pPr = getPPr(pXml);
  const rPr = getCleanRPr(pXml);
  const lines = String(text ?? '').split('\n');
  const runs = lines.map((line, i) => {
    const br = i < lines.length - 1 ? '<w:br/>' : '';
    return `<w:r>${rPr}${WT}${esc(line)}</w:t>${br}</w:r>`;
  }).join('');
  const pAttrs = (pXml.match(/^<w:p(\s[^>]*)?>/) || ['<w:p>'])[0];
  const openTag = pAttrs.startsWith('<w:p ') ? pAttrs : '<w:p>';
  return `${openTag}${pPr}${runs}</w:p>`;
}

function replaceTableCellText(tblXml, rowIdx, colIdx, text) {
  // simplistic: replace text in nth row/col tc
  let trCount = -1;
  return tblXml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (tr) => {
    trCount++;
    if (trCount !== rowIdx) return tr;
    let tcCount = -1;
    return tr.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (tc) => {
      tcCount++;
      if (tcCount !== colIdx) return tc;
      // replace all <w:p> inside tc with one paragraph keeping first para style
      const firstP = (tc.match(/<w:p\b[\s\S]*?<\/w:p>/) || ['<w:p><w:pPr/><w:r><w:rPr/><w:t></w:t></w:r></w:p>'])[0];
      const newP = fillParaTextKeepStyle(firstP, text);
      return tc.replace(/<w:p\b[\s\S]*?<\/w:p>/g, '').replace(/(<w:tcPr[\s\S]*?<\/w:tcPr>)/, `$1${newP}`).replace(/(<w:tc\b[^>]*>)/, (m, open) => tc.includes('<w:tcPr') ? m : m);
    });
  });
}

function buildFolhaRostoFromTemplate(bodyInner, paras, sections) {
  const blockRe = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>|<w:sectPr\b[\s\S]*?<\/w:sectPr>/g;
  const blocks = bodyInner.match(blockRe) || [];
  const getText = (b) => { const re=/<w:t[^>]*>([\s\S]*?)<\/w:t>/g; let m,out=''; while((m=re.exec(b))) out+=m[1]; return out.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim(); };
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  const raw = String(Object.entries(sections).map(([k,v]) => v ? `${k}\n${v}` : '').join('\n'));
  const rawLines = raw.split(/\n/).map(l=>l.trim()).filter(Boolean);
  const findField = (res) => {
    for (const re of res) {
      const m = raw.match(re);
      if (m && m[1]) return m[1].trim();
    }
    return '';
  };

  const tituloPt = findField([/T[íi]tulo em Portugu[eê]s\s*[:\-]\s*(.+)/i]) || sections.titulo_pt || sections._preamble?.split('\n')[0] || '';
  const tituloEn = findField([/T[íi]tulo em Ingl[eê]s\s*[:\-]\s*(.+)/i, /Title in English\s*[:\-]\s*(.+)/i]) || sections.titulo_en || '';
  const tituloEs = findField([/T[íi]tulo em Espanhol\s*[:\-]\s*(.+)/i, /T[íi]tulo en Espa[nñ]ol\s*[:\-]\s*(.+)/i]) || sections.titulo_es || '';
  const categoria = findField([/Categoria de Publica[cç][aã]o\s*[:\-]\s*(.+)/i]);
  const tipoPub = findField([/Tipo de Publica[cç][aã]o\s*[:\-]\s*(.+)/i]);
  const area = findField([/[ÁA]rea do Conhecimento\s*[:\-]\s*(.+)/i]);

  // Parse authors from lines containing email/orcid/name patterns
  const authors = [];
  for (const line of rawLines) {
    const email = (line.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)||[''])[0];
    const orcid = (line.match(/https?:\/\/orcid\.org\/[\dXx-]+/i)||line.match(/\b\d{4}-\d{4}-\d{4}-[\dXx]{4}\b/)||[''])[0];
    if (email || orcid) {
      let name = line.replace(email,'').replace(orcid,'').replace(/Nome\s*[:\-]/i,'').replace(/E-?mail\s*[:\-]/i,'').replace(/ORCID\s*[:\-]/i,'').replace(/[;|]+/g,' ').replace(/\s{2,}/g,' ').replace(/^[\s\-*,]+|[\s\-*,]+$/g,'').trim();
      authors.push({ name, email, orcid: orcid && !orcid.startsWith('http') ? `https://orcid.org/${orcid}` : orcid });
    }
  }

  // Remove instruction section and trailing notes
  let cutIdx = blocks.findIndex(b => norm(getText(b)).includes('instrucoes para preenchimento'));
  if (cutIdx === -1) cutIdx = blocks.findIndex(b => norm(getText(b)).includes('essa pagina pode ser removida'));
  let kept = cutIdx > 0 ? blocks.slice(0, cutIdx) : blocks.slice();
  kept = kept.filter(b => {
    const t = norm(getText(b));
    if (t.includes('essa pagina pode ser removida')) return false;
    if (t.startsWith('observacao: a formatacao e o conteudo')) return false;
    return true;
  });
  while (kept.length && /<w:p\b/.test(kept[kept.length-1]) && !getText(kept[kept.length-1]).trim()) kept.pop();

  const filled = kept.map(b => {
    if (/<w:tbl\b/.test(b)) {
      let tbl = b;
      if (authors.length) {
        // clear template sample rows 1..n and fill with authors
        const trMatches = [...tbl.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
        // Replace rows after header (index 0) - rebuild table: keep header row, add author rows
        if (trMatches.length > 1) {
          const header = trMatches[0][0];
          // build author rows by cloning row 1 as template
          const rowTpl = trMatches[1][0];
          const authorRows = authors.slice(0, 12).map(a => {
            let row = rowTpl;
            row = replaceTableCellText(row, 0, 0, a.name || '');
            row = replaceTableCellText(row, 0, 1, a.email || '');
            row = replaceTableCellText(row, 0, 2, a.orcid || '');
            return row;
          }).join('');
          tbl = tbl.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (m) => {
            // replace first occurrence with header+authors, drop rest
            return '\x00';
          });
          const parts = tbl.split('\x00');
          // parts[0] before first tr, parts[1] between tr1-tr2 etc., last after last tr
          tbl = parts[0] + header + authorRows + parts[parts.length - 1];
        }
      }
      return tbl;
    }
    const t = getText(b);
    const n = norm(t);
    if (n.startsWith('titulo em portugues:') || n.startsWith('titulo em portugues :')) {
      return fillParaTextKeepStyle(b, `Título em Português: ${tituloPt || t.replace(/^[^:]*:\s*/,'')}`);
    }
    if (n.startsWith('titulo em ingles:') || n.startsWith('titulo em ingles :')) {
      return fillParaTextKeepStyle(b, `Título em Inglês: ${tituloEn || t.replace(/^[^:]*:\s*/,'')}`);
    }
    if (n.startsWith('titulo em espanhol:') || n.startsWith('titulo em espanhol :')) {
      return fillParaTextKeepStyle(b, `Título em Espanhol: ${tituloEs || t.replace(/^[^:]*:\s*/,'')}`);
    }
    if (n.startsWith('categoria de publicacao')) {
      return categoria ? fillParaTextKeepStyle(b, `Categoria de Publicação: ${categoria}`) : b;
    }
    if (n.startsWith('tipo de publicacao')) {
      return tipoPub ? fillParaTextKeepStyle(b, `Tipo de Publicação: ${tipoPub}`) : b;
    }
    if (n.startsWith('area do conhecimento')) {
      return area ? fillParaTextKeepStyle(b, `Área do Conhecimento: ${area}`) : b;
    }
    return b;
  });

  return filled.join('');
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
  else if (tipoDocumento === DOC_TYPES.FOLHA_ROSTO || tipoDocumento === DOC_TYPES.CARTA_APRESENTACAO) bodyContent = buildFolhaRostoFromTemplate(bodyInner, paras, sections);
  else bodyContent = buildGenericFromTemplate(paras, sections);

  const sectPara = sectPr ? `<w:p><w:pPr>${sectPr}</w:pPr></w:p>` : '';
  const newBody = `<w:body>${bodyContent}${sectPara}</w:body>`;
  docXml = docXml.replace(/<w:body>[\s\S]*<\/w:body>/, newBody);

  zip.file(docXmlPath, docXml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

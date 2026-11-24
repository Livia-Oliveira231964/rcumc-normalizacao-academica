/* ============================================================
 * PREENCHIMENTO DE MODELO DOCX (RCUMC)
 * ------------------------------------------------------------
 * Abre o modelo .docx oficial (ZIP/XML), substitui o corpo do
 * documento pelo conteúdo extraído, preservando cabeçalho,
 * rodapé, estilos, tema, margens e configurações de página.
 *
 * Retorna Buffer do DOCX preenchido.
 * ============================================================ */

import JSZip from 'jszip';
import { promises as fs } from 'fs';
import path from 'path';
import { DOC_TYPES } from './normalize.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function esc(s='') {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function parseSections(text) {
  const patterns = {
    titulo_pt: /^(t[íi]tulo\s+em\s+portugu[eê]s)\s*[:\-]?$/i,
    titulo_en: /^(t[íi]tulo\s+em\s+ingl[eê]s|title\s+in\s+english)\s*[:\-]?$/i,
    titulo_es: /^(t[íi]tulo\s+en\s+espa[nñ]ol|t[íi]tulo\s+em\s+espanhol)\s*[:\-]?$/i,
    resumo: /^resumo\s*[:\-]?$/i,
    palavras_chave: /^palavras[- ]chave\s*[:\-]?$/i,
    abstract: /^abstract\s*[:\-]?$/i,
    keywords: /^keywords\s*[:\-]?$/i,
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
  const lines = String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const sections = { _preamble: [] };
  let cur = '_preamble';
  for (const raw of lines) {
    const s = raw.trim();
    let matched = null;
    for (const [k, re] of Object.entries(patterns)) { if (re.test(s)) { matched = k; break; } }
    if (matched) { cur = matched; if (!sections[cur]) sections[cur] = []; }
    else { if (!sections[cur]) sections[cur] = []; sections[cur].push(raw); }
  }
  for (const k of Object.keys(sections)) {
    let v = sections[k];
    while (v.length && !v[0].trim()) v.shift();
    while (v.length && !v[v.length-1].trim()) v.pop();
    sections[k] = v.join('\n').trim();
  }
  return sections;
}

/* Constrói XML de parágrafo */
function pXml(text, opts={}) {
  const {
    sizeHalfPt=24, color='000000', bold=false, italic=false,
    align='both', spaceBefore=0, spaceAfter=120, line=360,
    font='Times New Roman',
  } = opts;
  const jc = align === 'center' ? 'center' : align === 'right' ? 'right' : align === 'left' ? 'left' : 'both';
  // split text by newlines into separate runs with breaks? simpler: one run per paragraph, breaks for \n
  const parts = String(text||'').split('\n');
  const runs = parts.map((part, i) => {
    const br = i < parts.length - 1 ? `<w:br/>` : '';
    return `<w:r><w:rPr><w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}"/><w:color w:val="${esc(color)}"/><w:sz w:val="${sizeHalfPt}"/><w:szCs w:val="${sizeHalfPt}"/>${bold?'<w:b/>':''}${italic?'<w:i/>':''}</w:rPr><w:t xml:space="preserve">${esc(part)}</w:t>${br}</w:r>`;
  }).join('');
  return `<w:p><w:pPr><w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="${line}" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>${runs}</w:p>`;
}

function headingXml(text, sizeHalfPt=24) {
  return pXml(text, { sizeHalfPt, color:'31849B', align:'left', spaceBefore:0, spaceAfter:120, line:360 });
}
function bodyXml(text, sizeHalfPt=24, line=360) {
  return pXml(text, { sizeHalfPt, color:'000000', align:'both', spaceBefore:0, spaceAfter:120, line });
}

function buildResumoSimples(sections) {
  const parts = [];
  const add = (h, hv, b, bs=24) => {
    parts.push(headingXml(h, 24)); // headings 12pt = 24 half-pts, color 31849B
    // title headings in model are 12pt color 31849B; actual title text is 14pt
    if (hv) parts.push(pXml(hv, { sizeHalfPt: bs, color:'000000', align:'both', spaceAfter:120, line:360 }));
    parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));
  };
  // Título PT - heading 16pt in model? model shows "Título em Português" sz=32 (16pt) color 31849B
  parts.push(pXml('Título em Português', { sizeHalfPt:32, color:'31849B', align:'left', spaceAfter:120, line:360 }));
  parts.push(pXml(sections.titulo_pt || sections._preamble || 'Título do artigo em português.', { sizeHalfPt:28, align:'both', spaceAfter:120, line:360 }));
  parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));

  parts.push(headingXml('Resumo',24));
  parts.push(bodyXml(sections.resumo || '',24));
  parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));

  parts.push(headingXml('Palavras-chave',24));
  parts.push(bodyXml(sections.palavras_chave || '',24));
  parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));

  parts.push(headingXml('Title in English',24));
  parts.push(pXml(sections.titulo_en || 'Title of the article in english.', { sizeHalfPt:28, align:'left', spaceAfter:120, line:360 }));
  parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));

  parts.push(headingXml('Abstract',24));
  parts.push(bodyXml(sections.abstract || '',24));
  parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));

  parts.push(headingXml('Keywords',24));
  parts.push(bodyXml(sections.keywords || '',24));
  parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));

  parts.push(headingXml('Título en Español',24));
  parts.push(pXml(sections.titulo_es || 'Título del artículo en español.', { sizeHalfPt:28, align:'left', spaceAfter:120, line:360 }));
  parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));

  parts.push(headingXml('Resumen',24));
  parts.push(bodyXml(sections.resumen || '',24));
  parts.push(pXml('', { sizeHalfPt:24, spaceAfter:0 }));

  parts.push(headingXml('Palabras clave',24));
  parts.push(bodyXml(sections.palabras_clave || '',24));

  return parts.join('');
}

function buildResumoExpandido(sections) {
  const parts = [];
  parts.push(pXml('Título em Português', { sizeHalfPt:32, color:'31849B', align:'left', spaceAfter:120, line:360 }));
  parts.push(pXml(sections.titulo_pt || sections._preamble || 'Título do artigo em português.', { sizeHalfPt:28, align:'both', spaceAfter:120, line:360 }));
  parts.push(pXml('', { sizeHalfPt:22, spaceAfter:0 }));
  parts.push(headingXml('Title in English',24));
  parts.push(pXml(sections.titulo_en || 'Title of the article in english.', { sizeHalfPt:28, align:'left', spaceAfter:120, line:360 }));
  parts.push(pXml('', { sizeHalfPt:22, spaceAfter:0 }));
  parts.push(headingXml('Título en Español',24));
  parts.push(pXml(sections.titulo_es || 'Título del artículo en español.', { sizeHalfPt:28, align:'left', spaceAfter:120, line:360 }));
  parts.push(pXml('', { sizeHalfPt:22, spaceAfter:0 }));

  const map = [
    ['introducao','Introdução'], ['metodos','Material e Métodos'],
    ['resultados','Resultados e Discussão'], ['conclusao','Conclusão'],
    ['agradecimentos','Agradecimentos e Financiamentos'],
    ['conflito','Conflito de Interesses'], ['dados','Disponibilidade dos Dados'],
  ];
  for (const [k,label] of map) {
    if (sections[k]) {
      parts.push(headingXml(label,24));
      parts.push(bodyXml(sections[k],22,360)); // 11pt
      parts.push(pXml('', { sizeHalfPt:22, spaceAfter:0 }));
    }
  }
  parts.push(headingXml('Referências',24));
  parts.push(pXml(sections.referencias || '', { sizeHalfPt:20, align:'both', spaceAfter:120, line:240 })); // 10pt, single
  return parts.join('');
}

function buildGeneric(sections) {
  const parts = [];
  for (const [k,v] of Object.entries(sections)) {
    if (!v) continue;
    if (k !== '_preamble') parts.push(headingXml(k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),24));
    parts.push(bodyXml(v,24,360));
  }
  return parts.join('') || bodyXml('',24);
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

  const sections = parseSections(texto);
  let bodyContent = '';
  if (tipoDocumento === DOC_TYPES.RESUMO_SIMPLES) bodyContent = buildResumoSimples(sections);
  else if (tipoDocumento === DOC_TYPES.RESUMO_EXPANDIDO) bodyContent = buildResumoExpandido(sections);
  else bodyContent = buildGeneric(sections);

  // Replace body content, preserving sectPr
  const bodyMatch = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error('document.xml sem <w:body>');
  const bodyInner = bodyMatch[1];
  // capture sectPr (usually inside last w:p/w:pPr or directly in body)
  const sectPrMatch = bodyInner.match(/(<w:sectPr[\s\S]*?<\/w:sectPr>)/);
  const sectPr = sectPrMatch ? sectPrMatch[1] : '';
  // wrap sectPr in a paragraph as in templates
  const sectPara = sectPr ? `<w:p><w:pPr>${sectPr}</w:pPr></w:p>` : '';
  const newBody = `<w:body>${bodyContent}${sectPara}</w:body>`;
  docXml = docXml.replace(/<w:body>[\s\S]*<\/w:body>/, newBody);

  zip.file(docXmlPath, docXml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

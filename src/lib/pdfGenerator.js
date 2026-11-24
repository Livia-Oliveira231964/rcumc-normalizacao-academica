/* ============================================================
 * MÓDULO DE GERAÇÃO DE PDF - PADRÃO RCUMC
 * ------------------------------------------------------------
 * Gera PDF seguindo FIELMENTE o layout dos modelos institucionais
 * da Revista Científica UMC (RCUMC).
 *
 * Referências de layout extraídas dos modelos em /models:
 *   - Margens: 2,5 cm (superior, inferior, esquerda, direita)
 *   - Cabeçalho: 1,27 cm da borda superior
 *   - Rodapé: 1,27 cm da borda inferior
 *   - Cabeçalho: "Revista Cientifica UMC | RCUMC | ISSN: 2525-5150"
 *     (direita, Times New Roman, 8pt, cor preta)
 *   - Rodapé: "RCUMC | Vol. XX | N. XX | Ano XXXX | Página X de Y"
 *     (direita, Times New Roman, 8pt, RCUMC em negrito)
 *   - Cor de títulos/seções: #31849B
 *   - Fonte: Times New Roman (TimesRoman no pdf-lib)
 *
 * IMPORTANTE: Processamento em memória, sem persistência.
 * ============================================================ */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DOC_TYPES, DOC_TYPE_LABELS, UMC_RULES, limparTexto } from './normalize.js';

/* ------------------------------------------------------------
 * CONSTANTES DE LAYOUT
 * ------------------------------------------------------------ */
const CM = 28.3465;
const A4_W = 595.28;
const A4_H = 841.89;

const MARGIN = 2.5 * CM;        // 2,5 cm
const HEADER_DIST = 1.27 * CM;  // 1,27 cm da borda superior
const FOOTER_DIST = 1.27 * CM;  // 1,27 cm da borda inferior

// Cor institucional dos títulos de seção (#31849B)
const COLOR_SECTION = rgb(0x31 / 255, 0x84 / 255, 0x9b / 255);
const COLOR_TEXT = rgb(0, 0, 0);
const COLOR_MUTED = rgb(0.25, 0.25, 0.25);

// Texto padrão de cabeçalho e rodapé (conforme modelos)
const HEADER_TEXT = 'Revista Cientifica UMC | RCUMC | ISSN: 2525-5150';
const FOOTER_PREFIX = 'RCUMC';
const FOOTER_MID = ' | Vol. XX | N. XX | Ano XXXX | ';

/* ------------------------------------------------------------
 * SANITIZAÇÃO PARA WinAnsi (pdf-lib StandardFonts)
 * ------------------------------------------------------------ */
function sanitize(text) {
  if (!text) return '';
  const map = {
    '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'",
    '\u201C': '"', '\u201D': '"', '\u2022': '-', '\u2026': '...',
    '\u00A0': ' ', '\t': ' ',
  };
  let s = String(text);
  for (const [k, v] of Object.entries(map)) s = s.split(k).join(v);
  // mantém latin-1 imprimível
  return s.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
}

/* ------------------------------------------------------------
 * QUEBRA DE LINHA
 * ------------------------------------------------------------ */
function wrapText(text, font, size, maxWidth) {
  const out = [];
  const paras = text.split('\n');
  for (const para of paras) {
    if (para.trim() === '') { out.push(''); continue; }
    const words = para.replace(/\s+/g, ' ').trim().split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      let width;
      try { width = font.widthOfTextAtSize(test, size); } catch { width = test.length * size * 0.5; }
      if (width > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/* ------------------------------------------------------------
 * HELPERS DE DESENHO
 * ------------------------------------------------------------ */
function drawHeader(page, font) {
  const size = 8;
  const text = HEADER_TEXT;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: A4_W - MARGIN - w,
    y: A4_H - HEADER_DIST - size,
    size, font, color: COLOR_TEXT,
  });
}

function drawFooter(page, font, fontBold, pageNum, totalPages) {
  const size = 8;
  const y = FOOTER_DIST;
  const suffix = `Página ${pageNum} de ${totalPages}`;
  const mid = FOOTER_MID;
  // monta da direita pra esquerda: suffix, mid, RCUMC(bold)
  const wSuffix = font.widthOfTextAtSize(suffix, size);
  const wMid = font.widthOfTextAtSize(mid, size);
  const wPrefix = fontBold.widthOfTextAtSize(FOOTER_PREFIX, size);
  const totalW = wPrefix + wMid + wSuffix;
  let x = A4_W - MARGIN - totalW;
  page.drawText(FOOTER_PREFIX, { x, y, size, font: fontBold, color: COLOR_TEXT });
  x += wPrefix;
  page.drawText(mid, { x, y, size, font, color: COLOR_TEXT });
  x += wMid;
  page.drawText(suffix, { x, y, size, font, color: COLOR_TEXT });
}

function newPage(pdfDoc, font) {
  const page = pdfDoc.addPage([A4_W, A4_H]);
  drawHeader(page, font);
  return { page, y: A4_H - MARGIN };
}

function ensureSpace(state, pdfDoc, font, needed) {
  const bottom = MARGIN;
  if (state.y - needed < bottom) {
    const n = newPage(pdfDoc, font);
    state.page = n.page;
    state.y = n.y;
  }
}

/* ------------------------------------------------------------
 * DESENHO DE TEXTO COM WRAP
 * ------------------------------------------------------------ */
function drawWrapped(state, pdfDoc, font, fontBold, fontItalic, text, opts) {
  const {
    size = 12, color = COLOR_TEXT, lineSpacing = 1.5,
    fontUsed = font, align = 'left', spaceAfter = 6,
  } = opts;
  const maxW = A4_W - MARGIN * 2;
  const lh = size * lineSpacing;
  const lines = wrapText(text, fontUsed, size, maxW);
  for (const line of lines) {
    if (line === '') { state.y -= lh * 0.5; continue; }
    ensureSpace(state, pdfDoc, font, lh);
    let x = MARGIN;
    if (align === 'center') {
      const lw = fontUsed.widthOfTextAtSize(line, size);
      x = MARGIN + (maxW - lw) / 2;
    } else if (align === 'right') {
      const lw = fontUsed.widthOfTextAtSize(line, size);
      x = A4_W - MARGIN - lw;
    }
    state.page.drawText(line, { x, y: state.y - size, size, font: fontUsed, color });
    state.y -= lh;
  }
  state.y -= spaceAfter;
}

function drawSectionTitle(state, pdfDoc, fonts, title, size = 12) {
  state.y -= 4;
  drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, title, {
    size, color: COLOR_SECTION, lineSpacing: 1.5, fontUsed: fonts.regular, spaceAfter: 2,
  });
}

/* ------------------------------------------------------------
 * PARSING DE SEÇÕES DO TEXTO EXTRAÍDO
 * ------------------------------------------------------------ */
function parseSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = { heading: null, body: [] };
  // padrões de heading conhecidos
  const headingRe = /^(t[ií]tulo\s+(em\s+portugu[eê]s|em\s+ingl[eê]s|en\s+espa[nñ]ol|in\s+english|en\s+español)|resumo|abstract|resumen|palavras[- ]chave|keywords|palabras\s+clave|introdu[cç][aã]o|material\s+e\s+m[eé]todos|metodologia|resultados(\s+e\s+discuss[aã]o)?|discuss[aã]o|conclus[aã]o|considera[cç][oõ]es\s+finais|refer[eê]ncias|agradecimentos(\s+e\s+financiamentos)?|conflito\s+de\s+interesses|disponibilidade\s+dos\s+dados|figuras\s+e\s+gr[aá]ficos|tabelas\s+e\s+quadros|autores?|institui[cç][oõ]es|informa[cç][oõ]es)\s*[:\-]?$/i;
  for (const raw of lines) {
    const l = raw.trim();
    if (headingRe.test(l)) {
      if (current.heading || current.body.some(b => b.trim())) sections.push(current);
      current = { heading: l.replace(/[:\-]\s*$/, ''), body: [] };
    } else {
      current.body.push(raw);
    }
  }
  if (current.heading || current.body.some(b => b.trim())) sections.push(current);
  return sections;
}

/* ------------------------------------------------------------
 * GERAÇÃO POR TIPO
 * ------------------------------------------------------------ */
function renderResumoSimples(state, pdfDoc, fonts, text) {
  const sections = parseSections(text);
  const { regular } = fonts;
  const maxW = A4_W - MARGIN * 2;

  // Se não conseguiu parsear seções, renderiza como texto corrido com formatação simples
  if (sections.length <= 1 && !sections[0]?.heading) {
    drawSectionTitle(state, pdfDoc, fonts, 'Título em Português', 16);
    drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, text, { size: 12, lineSpacing: 1.5, spaceAfter: 8 });
    return;
  }

  for (const sec of sections) {
    const body = sec.body.join('\n').trim();
    const h = (sec.heading || '').toLowerCase();
    if (!sec.heading) {
      drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 12, lineSpacing: 1.5, spaceAfter: 6 });
      continue;
    }
    // Título PT
    if (/t[ií]tulo\s+em\s+portugu[eê]s/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Título em Português', 16);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 14, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/^resumo$/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Resumo', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 12, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/^palavras[- ]chave$/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Palavras-chave', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 12, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/title\s+in\s+english|t[ií]tulo\s+em\s+ingl[eê]s/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Title in English', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 14, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/^abstract$/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Abstract', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 12, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/^keywords$/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Keywords', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 12, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/t[ií]tulo\s+en\s+espa[nñ]ol/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Título en Español', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 14, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/^resumen$/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Resumen', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 12, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/palabras\s+clave/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Palabras clave', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 12, lineSpacing: 1.5, spaceAfter: 8 });
    } else {
      drawSectionTitle(state, pdfDoc, fonts, sec.heading, 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 12, lineSpacing: 1.5, spaceAfter: 8 });
    }
  }
}

function renderResumoExpandido(state, pdfDoc, fonts, text) {
  const sections = parseSections(text);
  if (sections.length <= 1 && !sections[0]?.heading) {
    drawSectionTitle(state, pdfDoc, fonts, 'Título em Português', 16);
    drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, text, { size: 11, lineSpacing: 1.5, spaceAfter: 8 });
    return;
  }
  for (const sec of sections) {
    const body = sec.body.join('\n').trim();
    const h = (sec.heading || '').toLowerCase();
    if (!sec.heading) {
      drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 11, lineSpacing: 1.5, spaceAfter: 6 });
      continue;
    }
    if (/t[ií]tulo\s+em\s+portugu[eê]s/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Título em Português', 16);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 14, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/title\s+in\s+english|t[ií]tulo\s+em\s+ingl[eê]s/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Title in English', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 14, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/t[ií]tulo\s+en\s+espa[nñ]ol/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, 'Título en Español', 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 14, lineSpacing: 1.5, spaceAfter: 8 });
    } else if (/refer[eê]ncias|figuras\s+e\s+gr[aá]ficos|tabelas\s+e\s+quadros/.test(h)) {
      drawSectionTitle(state, pdfDoc, fonts, sec.heading, 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 10, lineSpacing: 1.0, spaceAfter: 6 });
    } else {
      drawSectionTitle(state, pdfDoc, fonts, sec.heading, 12);
      if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: 11, lineSpacing: 1.5, spaceAfter: 8 });
    }
  }
}

function renderGenerico(state, pdfDoc, fonts, text, docType) {
  const sections = parseSections(text);
  const bodySize = docType === DOC_TYPES.RESUMO_EXPANDIDO ? 11 : 12;
  if (sections.length <= 1 && !sections[0]?.heading) {
    drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, text, { size: bodySize, lineSpacing: 1.5, spaceAfter: 6 });
    return;
  }
  for (const sec of sections) {
    const body = sec.body.join('\n').trim();
    if (sec.heading) drawSectionTitle(state, pdfDoc, fonts, sec.heading, sec.heading.length < 40 ? 14 : 12);
    if (body) drawWrapped(state, pdfDoc, fonts.regular, fonts.bold, fonts.italic, body, { size: bodySize, lineSpacing: 1.5, spaceAfter: 6 });
  }
}

/* ------------------------------------------------------------
 * FUNÇÃO PRINCIPAL
 * ------------------------------------------------------------ */
export async function gerarPdfPadronizado(texto, tipoDocumento, metadata = {}) {
  const textoLimpo = sanitize(limparTexto(texto));
  const docType = tipoDocumento || DOC_TYPES.RESUMO_SIMPLES;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${DOC_TYPE_LABELS[docType] || 'Documento'} - RCUMC`);
  pdfDoc.setSubject('Documento padronizado conforme normas RCUMC/UMC');
  pdfDoc.setCreator('RCUMC - Sistema de Normalização Acadêmica UMC');
  pdfDoc.setProducer('pdf-lib');

  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
  };

  const state = newPage(pdfDoc, fonts.regular);

  // Renderiza conforme tipo
  if (docType === DOC_TYPES.RESUMO_SIMPLES) {
    renderResumoSimples(state, pdfDoc, fonts, textoLimpo);
  } else if (docType === DOC_TYPES.RESUMO_EXPANDIDO) {
    renderResumoExpandido(state, pdfDoc, fonts, textoLimpo);
  } else {
    renderGenerico(state, pdfDoc, fonts, textoLimpo, docType);
  }

  // Aplica rodapé em todas as páginas
  const pages = pdfDoc.getPages();
  const total = pages.length;
  pages.forEach((p, i) => drawFooter(p, fonts.regular, fonts.bold, i + 1, total));

  return await pdfDoc.save();
}

/* ------------------------------------------------------------
 * NOME DE SAÍDA
 * ------------------------------------------------------------ */
export function gerarNomeArquivoSaida(nomeOriginal) {
  if (!nomeOriginal) return 'documento_padronizado.pdf';
  const base = nomeOriginal.replace(/\.(pdf|docx)$/i, '');
  const safe = base.replace(/[^a-zA-Z0-9_\-\u00C0-\u00FF ]/g, '_');
  return `${safe}_padronizado.pdf`;
}

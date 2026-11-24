/* ============================================================
 * MÓDULO DE GERAÇÃO DE PDF
 * ------------------------------------------------------------
 * Responsável por gerar o PDF final padronizado a partir do
 * texto extraído do documento enviado pelo aluno.
 *
 * Usa pdf-lib para criar o documento PDF em memória.
 * Não persiste arquivos em disco - tudo é processado em memória
 * e retornado como buffer para download direto.
 * ============================================================ */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DOC_TYPES, DOC_TYPE_LABELS, UMC_RULES, limparTexto, contarPalavras } from './normalize.js';

/* ------------------------------------------------------------
 * CONSTANTES DE LAYOUT (conversão cm -> pontos PDF)
 * ------------------------------------------------------------
 * 1 cm = 28.3465 pontos
 * ------------------------------------------------------------ */
const CM_TO_PT = 28.3465;
const A4_WIDTH = 595.28;  // pontos
const A4_HEIGHT = 841.89; // pontos

/* ------------------------------------------------------------
 * FUNÇÃO: cmToPt
 * ------------------------------------------------------------ */
function cmToPt(cm) {
  return cm * CM_TO_PT;
}

/* ------------------------------------------------------------
 * FUNÇÃO: wrapText
 * ------------------------------------------------------------
 * Quebra texto em linhas que cabem na largura disponível,
 * respeitando a fonte e tamanho especificados.
 * ------------------------------------------------------------ */
function wrapText(text, font, fontSize, maxWidth) {
  const paragraphs = text.split('\n');
  const lines = [];

  for (const paragraph of paragraphs) {
    // Preserva linhas vazias como espaçamento entre parágrafos
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/).filter(Boolean);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/* ------------------------------------------------------------
 * FUNÇÃO: sanitizeForWinAnsi
 * ------------------------------------------------------------
 * pdf-lib StandardFonts usam WinAnsiEncoding, que não suporta
 * todos os caracteres Unicode. Esta função faz substituições
 * seguras para caracteres comuns em português que podem causar
 * problemas, e remove caracteres não representáveis.
 * ------------------------------------------------------------ */
function sanitizeForWinAnsi(text) {
  if (!text) return '';
  // Substituições comuns
  const replacements = {
    '\u2013': '-',   // en dash
    '\u2014': '-',   // em dash
    '\u2018': "'",   // left single quote
    '\u2019': "'",   // right single quote
    '\u201C': '"',   // left double quote
    '\u201D': '"',   // right double quote
    '\u2022': '-',   // bullet
    '\u2026': '...', // ellipsis
    '\u00A0': ' ',   // non-breaking space
  };
  let result = text;
  for (const [from, to] of Object.entries(replacements)) {
    result = result.split(from).join(to);
  }
  // Remove caracteres fora do range WinAnsi básico (mantém latin-1 supplement)
  // WinAnsi suporta 0x20-0x7E e 0xA0-0xFF
  result = result.replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
  return result;
}

/* ------------------------------------------------------------
 * FUNÇÃO: gerarPdfPadronizado
 * ------------------------------------------------------------
 * Gera um PDF A4 padronizado com base no texto e tipo de
 * documento. Aplica margens, fonte e espaçamento conforme
 * as regras UMC.
 *
 * Parâmetros:
 *   - texto: conteúdo textual extraído
 *   - tipoDocumento: um dos DOC_TYPES
 *   - metadata: informações adicionais (nome arquivo original, etc.)
 *
 * Retorna: Uint8Array (bytes do PDF)
 * ------------------------------------------------------------ */
export async function gerarPdfPadronizado(texto, tipoDocumento, metadata = {}) {
  const textoLimpo = sanitizeForWinAnsi(limparTexto(texto));
  const docType = tipoDocumento || DOC_TYPES.RESUMO_SIMPLES;
  const rules = getRulesForType(docType);

  // Cria o documento PDF em memória
  const pdfDoc = await PDFDocument.create();

  // Metadados do PDF (não contêm dados sensíveis do aluno)
  pdfDoc.setTitle(`${DOC_TYPE_LABELS[docType] || 'Documento'} - Padronizado UMC`);
  pdfDoc.setSubject('Documento acadêmico padronizado conforme normas UMC');
  pdfDoc.setCreator('RCUMC - Sistema de Normalização Acadêmica UMC');
  pdfDoc.setProducer('pdf-lib');

  // Fontes padrão (Times-like: TimesRoman / TimesBold / TimesItalic)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  // Configurações de página
  const margin = cmToPt(rules.margemCm);
  const contentWidth = A4_WIDTH - margin * 2;
  const fontSize = rules.tamanhoCorpo;
  const lineHeight = fontSize * rules.espacamentoLinhas;

  // Área útil
  const yStart = A4_HEIGHT - margin;
  const yMin = margin;

  /* ----------------------------------------------------------
   * HELPER: adicionar nova página
   * ---------------------------------------------------------- */
  function addPage() {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    return { page, y: yStart };
  }

  /* ----------------------------------------------------------
   * HELPER: garantir espaço na página
   * ---------------------------------------------------------- */
  function ensureSpace(state, needed = lineHeight) {
    if (state.y - needed < yMin) {
      const newState = addPage();
      state.page = newState.page;
      state.y = newState.y;
    }
  }

  /* ----------------------------------------------------------
   * RENDERIZAÇÃO DO CABEÇALHO
   * ---------------------------------------------------------- */
  let state = addPage();

  // Título do documento
  const titulo = DOC_TYPE_LABELS[docType] || 'Documento Acadêmico';
  const tituloSize = rules.tamanhoTitulo || 16;
  const tituloLines = wrapText(titulo, fontBold, tituloSize, contentWidth);

  for (const line of tituloLines) {
    ensureSpace(state, tituloSize * 1.4);
    state.page.drawText(line, {
      x: margin,
      y: state.y,
      size: tituloSize,
      font: fontBold,
      color: rgb(0.1, 0.14, 0.2),
    });
    state.y -= tituloSize * 1.4;
  }

  // Subtítulo com indicação de padronização
  state.y -= 4;
  const subtitulo = 'Documento padronizado conforme diretrizes UMC';
  state.page.drawText(subtitulo, {
    x: margin,
    y: state.y,
    size: 9,
    font: fontItalic,
    color: rgb(0.36, 0.42, 0.51),
  });
  state.y -= 20;

  // Linha separadora
  state.page.drawLine({
    start: { x: margin, y: state.y },
    end: { x: A4_WIDTH - margin, y: state.y },
    thickness: 0.8,
    color: rgb(0.78, 0.84, 0.91),
  });
  state.y -= 24;

  /* ----------------------------------------------------------
   * RENDERIZAÇÃO DO CORPO DO TEXTO
   * ---------------------------------------------------------- */
  const bodyLines = wrapText(textoLimpo, fontRegular, fontSize, contentWidth);

  for (const line of bodyLines) {
    if (line === '') {
      // Linha vazia = espaçamento de parágrafo
      state.y -= lineHeight * 0.6;
      continue;
    }

    ensureSpace(state, lineHeight);
    state.page.drawText(line, {
      x: margin,
      y: state.y,
      size: fontSize,
      font: fontRegular,
      color: rgb(0.1, 0.14, 0.2),
    });
    state.y -= lineHeight;
  }

  /* ----------------------------------------------------------
   * RODAPÉ EM TODAS AS PÁGINAS
   * ---------------------------------------------------------- */
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const dataGeracao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  pages.forEach((page, index) => {
    const footerText = `RCUMC - Normalização Acadêmica UMC | ${dataGeracao} | Página ${index + 1}/${totalPages}`;
    const footerSize = 8;
    const footerWidth = fontRegular.widthOfTextAtSize(footerText, footerSize);
    page.drawText(footerText, {
      x: (A4_WIDTH - footerWidth) / 2,
      y: margin / 2,
      size: footerSize,
      font: fontRegular,
      color: rgb(0.45, 0.5, 0.58),
    });
  });

  // Serializa o PDF para bytes (em memória)
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/* ------------------------------------------------------------
 * FUNÇÃO: getRulesForType
 * ------------------------------------------------------------
 * Retorna as regras de formatação conforme o tipo de documento.
 * ------------------------------------------------------------ */
function getRulesForType(tipoDocumento) {
  if (tipoDocumento === DOC_TYPES.RESUMO_EXPANDIDO) {
    return {
      margemCm: UMC_RULES.resumoExpandido.margemCm,
      tamanhoTitulo: UMC_RULES.resumoExpandido.tamanhoTituloPT,
      tamanhoCorpo: UMC_RULES.resumoExpandido.tamanhoCorpo,
      espacamentoLinhas: UMC_RULES.resumoExpandido.espacamentoLinhas,
    };
  }

  // Default: Resumo Simples / Folha de Rosto / Carta
  return {
    margemCm: UMC_RULES.resumoSimples.margemCm,
    tamanhoTitulo: 14,
    tamanhoCorpo: UMC_RULES.resumoSimples.tamanhoFonte,
    espacamentoLinhas: UMC_RULES.resumoSimples.espacamentoLinhas,
  };
}

/* ------------------------------------------------------------
 * FUNÇÃO: gerarNomeArquivoSaida
 * ------------------------------------------------------------
 * Cria nome de arquivo de saída com sufixo _padronizado.
 * ------------------------------------------------------------ */
export function gerarNomeArquivoSaida(nomeOriginal) {
  if (!nomeOriginal) return 'documento_padronizado.pdf';
  const base = nomeOriginal.replace(/\.(pdf|docx)$/i, '');
  // Sanitiza o nome para evitar caracteres problemáticos
  const safeBase = base.replace(/[^a-zA-Z0-9_\-\u00C0-\u00FF ]/g, '_');
  return `${safeBase}_padronizado.pdf`;
}

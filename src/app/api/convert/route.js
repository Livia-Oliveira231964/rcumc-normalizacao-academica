/* ============================================================
 * API ROUTE: /api/convert
 * ------------------------------------------------------------
 * Recebe um arquivo (PDF ou DOCX) via multipart/form-data,
 * extrai o texto, aplica validação/normalização básica e
 * retorna um PDF padronizado para download.
 *
 * IMPORTANTE: Nenhum dado é persistido em disco ou banco.
 * Todo processamento ocorre em memória durante a requisição.
 * ============================================================ */

import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import {
  detectarTipoDocumento,
  validarDocumento,
  normalizarTextoBasico,
  DOC_TYPES,
  DOC_TYPE_LABELS,
} from '@/lib/normalize';
import { gerarPdfPadronizado, gerarNomeArquivoSaida } from '@/lib/pdfGenerator';

/* ------------------------------------------------------------
 * CONFIGURAÇÃO DA ROTA
 * ------------------------------------------------------------
 * Força runtime Node.js (necessário para libs de parsing).
 * ------------------------------------------------------------ */
export const runtime = 'nodejs';

/* ------------------------------------------------------------
 * CONSTANTES
 * ------------------------------------------------------------ */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/* ------------------------------------------------------------
 * FUNÇÃO: extrairTextoDeDOCX
 * ------------------------------------------------------------
 * Usa mammoth para extrair texto bruto do DOCX.
 * ------------------------------------------------------------ */
async function extrairTextoDeDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/* ------------------------------------------------------------
 * FUNÇÃO: extrairTextoDePDF
 * ------------------------------------------------------------
 * Usa pdf-parse para extrair texto de um PDF.
 * Import dinâmico para evitar problemas de bundling no Next.js.
 * ------------------------------------------------------------ */
async function extrairTextoDePDF(buffer) {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text || '';
}

/* ------------------------------------------------------------
 * FUNÇÃO: getExtensao
 * ------------------------------------------------------------ */
function getExtensao(nome) {
  const idx = nome.lastIndexOf('.');
  return idx >= 0 ? nome.slice(idx).toLowerCase() : '';
}

/* ------------------------------------------------------------
 * HANDLER POST
 * ------------------------------------------------------------
 * Recebe o arquivo, valida, extrai texto, gera PDF padronizado.
 * ------------------------------------------------------------ */
export async function POST(request) {
  try {
    /* ----------------------------------------------------------
     * 1. LEITURA DO FORM DATA
     * ---------------------------------------------------------- */
    const formData = await request.formData();
    const file = formData.get('file');
    const tipoDocumentoForm = formData.get('tipoDocumento');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'Nenhum arquivo enviado. Envie um arquivo PDF ou DOCX.' },
        { status: 400 }
      );
    }

    /* ----------------------------------------------------------
     * 2. VALIDAÇÃO DO ARQUIVO (tipo, tamanho)
     * ---------------------------------------------------------- */
    const nomeOriginal = file.name || 'documento';
    const extensao = getExtensao(nomeOriginal);
    const mimeType = file.type || '';

    if (!ALLOWED_EXTENSIONS.includes(extensao)) {
      return NextResponse.json(
        { error: 'Formato inválido. Envie um arquivo .pdf ou .docx.' },
        { status: 400 }
      );
    }

    if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
      console.warn(`MIME type inesperado: ${mimeType} para ${nomeOriginal}`);
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. O limite é 10 MB.' },
        { status: 400 }
      );
    }

    /* ----------------------------------------------------------
     * 3. LEITURA DO ARQUIVO EM MEMÓRIA
     * ---------------------------------------------------------- */
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    /* ----------------------------------------------------------
     * 4. EXTRAÇÃO DE TEXTO
     * ---------------------------------------------------------- */
    let textoExtraido = '';
    if (extensao === '.docx') {
      textoExtraido = await extrairTextoDeDOCX(buffer);
    } else if (extensao === '.pdf') {
      textoExtraido = await extrairTextoDePDF(buffer);
    }

    textoExtraido = normalizarTextoBasico(textoExtraido);

    if (!textoExtraido || textoExtraido.trim().length < 10) {
      return NextResponse.json(
        {
          error:
            'Não foi possível extrair texto do arquivo. Verifique se o documento contém texto selecionável (não apenas imagens escaneadas).',
        },
        { status: 422 }
      );
    }

    /* ----------------------------------------------------------
     * 5. DETERMINAÇÃO DO TIPO DE DOCUMENTO
     * ---------------------------------------------------------- */
    let tipoDocumento = tipoDocumentoForm;
    const tiposValidos = Object.values(DOC_TYPES);
    if (!tiposValidos.includes(tipoDocumento)) {
      tipoDocumento = detectarTipoDocumento(textoExtraido) || DOC_TYPES.RESUMO_SIMPLES;
    }

    /* ----------------------------------------------------------
     * 6. VALIDAÇÃO (diagnóstico, não bloqueante)
     * ---------------------------------------------------------- */
    const diagnostico = validarDocumento(textoExtraido, tipoDocumento);

    /* ----------------------------------------------------------
     * 7. GERAÇÃO DO PDF PADRONIZADO
     * ---------------------------------------------------------- */
    const pdfBytes = await gerarPdfPadronizado(textoExtraido, tipoDocumento, {
      nomeOriginal,
    });

    const nomeSaida = gerarNomeArquivoSaida(nomeOriginal);

    /* ----------------------------------------------------------
     * 8. RESPOSTA - PDF PARA DOWNLOAD
     * ---------------------------------------------------------- */
    const diagnosticoHeader = Buffer.from(
      JSON.stringify({
        tipo: tipoDocumento,
        tipoLabel: DOC_TYPE_LABELS[tipoDocumento],
        naoConformidades: diagnostico.naoConformidades,
        avisos: diagnostico.avisos,
        conformidades: diagnostico.conformidades,
      }),
      'utf-8'
    ).toString('base64');

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(nomeSaida)}"`,
        'Content-Length': String(pdfBytes.length),
        'X-Diagnostico': diagnosticoHeader,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Erro na conversão:', error);
    return NextResponse.json(
      {
        error:
          'Erro interno ao processar o documento. Verifique se o arquivo não está corrompido ou protegido por senha.',
      },
      { status: 500 }
    );
  }
}

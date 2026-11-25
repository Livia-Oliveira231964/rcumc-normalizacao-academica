/* ============================================================
 * API ROUTE: /api/convert
 * ------------------------------------------------------------
 * Recebe PDF/DOCX, extrai texto e preenche o MODELO OFICIAL
 * RCUMC (.docx) da pasta /models preservando cabeçalho,
 * rodapé, margens, cores e estilos do template.
 *
 * Retorna o documento no formato DOCX para manter a formatação
 * fiel ao modelo institucional.
 *
 * Sem persistência: processamento em memória, sem gravação.
 * CORS habilitado para chamadas do frontend Vercel.
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
import { preencherModeloDocx } from '@/lib/fillTemplate';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

/* CORS - permite que o frontend (Vercel) chame esta API */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'Content-Disposition, X-Diagnostico, Content-Length',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function getExtensao(nome) {
  const i = nome.lastIndexOf('.');
  return i >= 0 ? nome.slice(i).toLowerCase() : '';
}

async function extrairTextoDeDOCX(buffer) {
  const r = await mammoth.extractRawText({ buffer });
  return r.value || '';
}

async function extrairTextoDePDF(buffer) {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text || '';
}

/* Gera nome de saída com sufixo _padronizado.docx */
function gerarNomeSaidaDocx(nomeOriginal) {
  if (!nomeOriginal) return 'documento_padronizado.docx';
  const base = nomeOriginal.replace(/\.(pdf|docx)$/i, '');
  const safe = base.replace(/[^a-zA-Z0-9_\-\u00C0-\u00FF ]/g, '_');
  return `${safe}_padronizado.docx`;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const tipoDocumentoForm = formData.get('tipoDocumento');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Nenhum arquivo enviado. Envie um arquivo PDF ou DOCX.' }, { status: 400, headers: CORS_HEADERS });
    }
    const nomeOriginal = file.name || 'documento';
    const extensao = getExtensao(nomeOriginal);
    if (!ALLOWED_EXTENSIONS.includes(extensao)) {
      return NextResponse.json({ error: 'Formato inválido. Envie um arquivo .pdf ou .docx.' }, { status: 400, headers: CORS_HEADERS });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Arquivo muito grande. O limite é 10 MB.' }, { status: 400, headers: CORS_HEADERS });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let textoExtraido = extensao === '.docx' ? await extrairTextoDeDOCX(buffer) : await extrairTextoDePDF(buffer);
    textoExtraido = normalizarTextoBasico(textoExtraido);
    if (!textoExtraido || textoExtraido.trim().length < 10) {
      return NextResponse.json({ error: 'Não foi possível extrair texto do arquivo. Verifique se o documento contém texto selecionável (não apenas imagens escaneadas).' }, { status: 422, headers: CORS_HEADERS });
    }

    let tipoDocumento = tipoDocumentoForm;
    if (!Object.values(DOC_TYPES).includes(tipoDocumento)) {
      const hintNome = (nomeOriginal || '').toLowerCase();
      if (hintNome.includes('folha') && hintNome.includes('rosto')) tipoDocumento = DOC_TYPES.FOLHA_ROSTO;
      else if (hintNome.includes('carta') && hintNome.includes('apresent')) tipoDocumento = DOC_TYPES.CARTA_APRESENTACAO;
      else if (hintNome.includes('expandido')) tipoDocumento = DOC_TYPES.RESUMO_EXPANDIDO;
      else if (hintNome.includes('resumo')) tipoDocumento = DOC_TYPES.RESUMO_SIMPLES;
      else tipoDocumento = detectarTipoDocumento(textoExtraido) || DOC_TYPES.RESUMO_SIMPLES;
    }

    const diagnostico = validarDocumento(textoExtraido, tipoDocumento);

    // Preenche o modelo DOCX oficial da pasta /models (preserva formatação)
    const docxBuffer = await preencherModeloDocx(tipoDocumento, textoExtraido);

    const nomeSaida = gerarNomeSaidaDocx(nomeOriginal);
    const diagnosticoHeader = Buffer.from(JSON.stringify({
      tipo: tipoDocumento,
      tipoLabel: DOC_TYPE_LABELS[tipoDocumento],
      naoConformidades: diagnostico.naoConformidades,
      avisos: diagnostico.avisos,
      conformidades: diagnostico.conformidades,
    }), 'utf-8').toString('base64');

    return new NextResponse(docxBuffer, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(nomeSaida)}"`,
        'Content-Length': String(docxBuffer.length),
        'X-Diagnostico': diagnosticoHeader,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache', 'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Erro na conversão:', error);
    return NextResponse.json({ error: 'Erro interno ao processar o documento. Verifique se o arquivo não está corrompido ou protegido por senha.' }, { status: 500, headers: CORS_HEADERS });
  }
}

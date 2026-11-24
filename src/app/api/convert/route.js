/* ============================================================
 * API ROUTE: /api/convert
 * ------------------------------------------------------------
 * Recebe PDF/DOCX, preenche o MODELO OFICIAL RCUMC (.docx)
 * da pasta /models preservando cabeçalho, rodapé, margens,
 * cores e estilos, e retorna PDF para download.
 *
 * Conversão DOCX->PDF: usa LibreOffice (soffice) quando
 * disponível; caso contrário (ex.: Vercel serverless), usa
 * gerador PDF fiel ao layout do modelo (pdf-lib).
 *
 * Sem persistência: temporários em /tmp removidos no finally.
 * ============================================================ */

import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  detectarTipoDocumento,
  validarDocumento,
  normalizarTextoBasico,
  DOC_TYPES,
  DOC_TYPE_LABELS,
} from '@/lib/normalize';
import { gerarPdfPadronizado, gerarNomeArquivoSaida } from '@/lib/pdfGenerator';
import { preencherModeloDocx } from '@/lib/fillTemplate';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

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

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} ${code}: ${err || out}`)));
  });
}

async function hasLibreOffice() {
  try { await run('soffice', ['--version'], { timeout: 5000 }); return true; }
  catch { return false; }
}

async function docxParaPdf(docxBuffer, tmpDir) {
  const docxPath = path.join(tmpDir, 'preenchido.docx');
  await fs.writeFile(docxPath, docxBuffer);
  const env = { ...process.env, HOME: tmpDir };
  await run('soffice', [
    '--headless','--norestore','--nolockcheck','--nodefault','--nofirststartwizard',
    '--convert-to','pdf','--outdir',tmpDir, docxPath,
  ], { env, timeout: 60000 });
  const pdfPath = path.join(tmpDir, 'preenchido.pdf');
  return await fs.readFile(pdfPath);
}

async function safeRm(dir) { try { await fs.rm(dir, { recursive: true, force: true }); } catch {} }

export async function POST(request) {
  const tmpDir = path.join(os.tmpdir(), `rcumc-${crypto.randomUUID()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const formData = await request.formData();
    const file = formData.get('file');
    const tipoDocumentoForm = formData.get('tipoDocumento');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Nenhum arquivo enviado. Envie um arquivo PDF ou DOCX.' }, { status: 400 });
    }
    const nomeOriginal = file.name || 'documento';
    const extensao = getExtensao(nomeOriginal);
    if (!ALLOWED_EXTENSIONS.includes(extensao)) {
      return NextResponse.json({ error: 'Formato inválido. Envie um arquivo .pdf ou .docx.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Arquivo muito grande. O limite é 10 MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let textoExtraido = extensao === '.docx' ? await extrairTextoDeDOCX(buffer) : await extrairTextoDePDF(buffer);
    textoExtraido = normalizarTextoBasico(textoExtraido);
    if (!textoExtraido || textoExtraido.trim().length < 10) {
      return NextResponse.json({ error: 'Não foi possível extrair texto do arquivo. Verifique se o documento contém texto selecionável (não apenas imagens escaneadas).' }, { status: 422 });
    }

    let tipoDocumento = tipoDocumentoForm;
    if (!Object.values(DOC_TYPES).includes(tipoDocumento)) {
      tipoDocumento = detectarTipoDocumento(textoExtraido) || DOC_TYPES.RESUMO_SIMPLES;
    }

    const diagnostico = validarDocumento(textoExtraido, tipoDocumento);

    // 1) Preenche o modelo DOCX oficial da pasta /models
    const docxBuffer = await preencherModeloDocx(tipoDocumento, textoExtraido);

    // 2) Converte para PDF: LibreOffice (fiel ao modelo) ou fallback pdf-lib
    let pdfBytes;
    if (await hasLibreOffice()) {
      try {
        pdfBytes = await docxParaPdf(docxBuffer, tmpDir);
      } catch (e) {
        console.warn('Falha LibreOffice, usando fallback pdf-lib:', e.message);
        pdfBytes = Buffer.from(await gerarPdfPadronizado(textoExtraido, tipoDocumento, { nomeOriginal }));
      }
    } else {
      pdfBytes = Buffer.from(await gerarPdfPadronizado(textoExtraido, tipoDocumento, { nomeOriginal }));
    }

    const nomeSaida = gerarNomeArquivoSaida(nomeOriginal);
    const diagnosticoHeader = Buffer.from(JSON.stringify({
      tipo: tipoDocumento,
      tipoLabel: DOC_TYPE_LABELS[tipoDocumento],
      naoConformidades: diagnostico.naoConformidades,
      avisos: diagnostico.avisos,
      conformidades: diagnostico.conformidades,
    }), 'utf-8').toString('base64');

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(nomeSaida)}"`,
        'Content-Length': String(pdfBytes.length),
        'X-Diagnostico': diagnosticoHeader,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache', 'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Erro na conversão:', error);
    return NextResponse.json({ error: 'Erro interno ao processar o documento. Verifique se o arquivo não está corrompido ou protegido por senha.' }, { status: 500 });
  } finally {
    await safeRm(tmpDir);
  }
}

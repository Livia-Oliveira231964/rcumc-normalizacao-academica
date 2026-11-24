/* ============================================================
 * PÁGINA PRINCIPAL (HOME)
 * ------------------------------------------------------------
 * Interface para o aluno:
 *   1. Selecionar tipo de documento
 *   2. Enviar arquivo PDF ou DOCX
 *   3. Baixar o PDF padronizado
 *
 * Nenhum arquivo é armazenado - o processamento é feito
 * em memória pela API /api/convert e o resultado é baixado.
 * ============================================================ */

'use client';

import { useState, useRef } from 'react';

/* ------------------------------------------------------------
 * CONSTANTES DE UI
 * ------------------------------------------------------------ */
const DOC_TYPES = [
  { value: 'auto', label: 'Detectar automaticamente' },
  { value: 'folha_rosto', label: 'Folha de Rosto' },
  { value: 'carta_apresentacao', label: 'Carta de Apresentação' },
  { value: 'resumo_simples', label: 'Resumo Simples' },
  { value: 'resumo_expandido', label: 'Resumo Expandido' },
];

const ACCEPTED_EXTENSIONS = '.pdf,.docx';
const MAX_SIZE_MB = 10;

/* ------------------------------------------------------------
 * COMPONENTE PRINCIPAL
 * ------------------------------------------------------------ */
export default function HomePage() {
  // --- Estado do formulário ---
  const [tipoDocumento, setTipoDocumento] = useState('auto');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [diagnostico, setDiagnostico] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadName, setDownloadName] = useState('');
  const fileInputRef = useRef(null);

  /* ----------------------------------------------------------
   * HANDLER: seleção de arquivo
   * ---------------------------------------------------------- */
  function handleFileChange(e) {
    const selected = e.target.files?.[0] || null;
    setError('');
    setDiagnostico(null);
    clearDownload();

    if (!selected) {
      setFile(null);
      return;
    }

    // Validação client-side: extensão
    const name = selected.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      setError('Formato inválido. Selecione um arquivo .pdf ou .docx.');
      setFile(null);
      return;
    }

    // Validação client-side: tamanho
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Arquivo muito grande. O limite é ${MAX_SIZE_MB} MB.`);
      setFile(null);
      return;
    }

    setFile(selected);
  }

  /* ----------------------------------------------------------
   * HELPER: limpar URL de download anterior
   * ---------------------------------------------------------- */
  function clearDownload() {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl('');
    setDownloadName('');
  }

  /* ----------------------------------------------------------
   * HELPER: decodificar diagnóstico do header
   * ---------------------------------------------------------- */
  function parseDiagnosticoHeader(response) {
    const header = response.headers.get('X-Diagnostico');
    if (!header) return null;
    try {
      // Decodifica base64 UTF-8 de forma segura
      const binary = atob(header);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const json = new TextDecoder('utf-8').decode(bytes);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  /* ----------------------------------------------------------
   * HANDLER: enviar para conversão
   * ---------------------------------------------------------- */
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setDiagnostico(null);
    clearDownload();

    if (!file) {
      setError('Selecione um arquivo PDF ou DOCX para continuar.');
      return;
    }

    setLoading(true);

    try {
      // Monta o form data para envio à API
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipoDocumento', tipoDocumento === 'auto' ? '' : tipoDocumento);

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      // Se a resposta não for OK, tenta ler JSON de erro
      if (!response.ok) {
        let msg = 'Erro ao processar o documento.';
        try {
          const errData = await response.json();
          msg = errData.error || msg;
        } catch {
          // ignora erro de parse
        }
        throw new Error(msg);
      }

      // Lê diagnóstico do header (se disponível)
      const diag = parseDiagnosticoHeader(response);
      if (diag) setDiagnostico(diag);

      // Converte resposta em blob para download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Extrai nome do arquivo do header Content-Disposition
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const nomeSaida = match ? decodeURIComponent(match[1]) : 'documento_padronizado.pdf';

      setDownloadUrl(url);
      setDownloadName(nomeSaida);
    } catch (err) {
      setError(err.message || 'Erro inesperado ao converter o documento.');
    } finally {
      setLoading(false);
    }
  }

  /* ----------------------------------------------------------
   * HANDLER: limpar formulário
   * ---------------------------------------------------------- */
  function handleReset() {
    setFile(null);
    setTipoDocumento('auto');
    setError('');
    setDiagnostico(null);
    clearDownload();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /* ----------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------- */
  return (
    <div className="page">
      {/* Cabeçalho */}
      <header className="header">
        <div className="container">
          <span className="badge">UMC • Normalização Acadêmica</span>
          <h1>Padronize seu documento acadêmico</h1>
          <p>
            Envie seu arquivo em PDF ou DOCX e receba uma versão padronizada em PDF,
            seguindo as diretrizes institucionais da UMC. Seus arquivos não são armazenados.
          </p>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="main">
        <div className="container">
          <section className="card">
            <h2 className="section-title">Enviar documento</h2>
            <p className="section-desc">
              Selecione o tipo de documento (ou deixe em detecção automática), envie o
              arquivo e clique em &quot;Converter e baixar PDF&quot;.
            </p>

            <form onSubmit={handleSubmit} className="form-grid">
              {/* Seleção do tipo de documento */}
              <div className="field">
                <label htmlFor="tipoDocumento">Tipo de documento</label>
                <select
                  id="tipoDocumento"
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value)}
                  disabled={loading}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  Se não tiver certeza, use a detecção automática.
                </p>
              </div>

              {/* Upload de arquivo */}
              <div className="field">
                <label htmlFor="arquivo">Arquivo (PDF ou DOCX)</label>
                <div className="dropzone">
                  <input
                    ref={fileInputRef}
                    id="arquivo"
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                  <div className="dropzone-icon" aria-hidden="true">📄</div>
                  <p className="dropzone-title">Clique ou arraste o arquivo aqui</p>
                  <p className="dropzone-sub">Formatos aceitos: PDF, DOCX • Máx. {MAX_SIZE_MB} MB</p>
                </div>
                {file && (
                  <div className="file-name" role="status">
                    Arquivo selecionado: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>

              {/* Botões de ação */}
              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={loading || !file}>
                  {loading && <span className="spinner" aria-hidden="true" />}
                  {loading ? 'Convertendo...' : 'Converter e baixar PDF'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleReset}
                  disabled={loading}
                >
                  Limpar
                </button>
              </div>
            </form>

            {/* Mensagem de erro */}
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}

            {/* Resultado e download */}
            {downloadUrl && (
              <div className="result">
                <div className="result-header">
                  <div>
                    <p className="result-title">Documento convertido com sucesso</p>
                    <p className="result-meta">
                      Arquivo: {downloadName}
                      {diagnostico?.tipoLabel ? ` • Tipo: ${diagnostico.tipoLabel}` : ''}
                    </p>
                  </div>
                  <a
                    className="btn btn-primary"
                    href={downloadUrl}
                    download={downloadName}
                  >
                    Baixar PDF
                  </a>
                </div>

                {/* Diagnóstico resumido */}
                {diagnostico && (
                  <div>
                    {diagnostico.naoConformidades?.length > 0 && (
                      <div className="alert alert-error" role="status">
                        <strong>Não conformidades detectadas:</strong>
                        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                          {diagnostico.naoConformidades.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {diagnostico.avisos?.length > 0 && (
                      <div className="alert alert-info" role="status">
                        <strong>Avisos:</strong>
                        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                          {diagnostico.avisos.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {diagnostico.naoConformidades?.length === 0 && diagnostico.avisos?.length === 0 && (
                      <div className="alert alert-success" role="status">
                        Nenhuma não conformidade óbvia detectada na análise automática do texto.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Informações sobre privacidade e regras */}
          <section className="card">
            <h2 className="section-title">Como funciona</h2>
            <div className="info-grid">
              <div className="info-item">
                <h3>1. Envie</h3>
                <p>Faça upload de um arquivo PDF ou DOCX do seu trabalho acadêmico.</p>
              </div>
              <div className="info-item">
                <h3>2. Processamento</h3>
                <p>O sistema extrai o texto e aplica padronização conforme regras UMC.</p>
              </div>
              <div className="info-item">
                <h3>3. Baixe</h3>
                <p>Receba o PDF padronizado pronto para download. Nada é armazenado.</p>
              </div>
            </div>
            <div className="alert alert-info" style={{ marginTop: '1rem' }}>
              <strong>Privacidade:</strong> os arquivos são processados apenas em memória durante a
              conversão e não são salvos no servidor. O diagnóstico automático é indicativo e não
              substitui a revisão final conforme o modelo oficial.
            </div>
          </section>
        </div>
      </main>

      {/* Rodapé */}
      <footer className="footer">
        <div className="container">
          <p>Sistema de Normalização Acadêmica • UMC</p>
          <p>Os documentos enviados não são armazenados.</p>
        </div>
      </footer>
    </div>
  );
}

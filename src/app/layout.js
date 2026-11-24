/* ============================================================
 * LAYOUT RAIZ DA APLICAÇÃO
 * ------------------------------------------------------------
 * Define a estrutura HTML base, metadados e estilos globais.
 * Todos os componentes/páginas são renderizados dentro deste layout.
 * ============================================================ */

import './globals.css';

/* ------------------------------------------------------------
 * METADADOS DA PÁGINA
 * ------------------------------------------------------------
 * Informações usadas pelo navegador e mecanismos de busca.
 * ------------------------------------------------------------ */
export const metadata = {
  title: 'RCUMC - Normalização Acadêmica UMC',
  description:
    'RCUMC - Sistema de normalização de documentos acadêmicos da UMC. Envie seu arquivo PDF ou DOCX e baixe o documento padronizado.',
};

/* ------------------------------------------------------------
 * COMPONENTE DE LAYOUT
 * ------------------------------------------------------------
 * Envolve todas as páginas com HTML base e idioma pt-BR.
 * ------------------------------------------------------------ */
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

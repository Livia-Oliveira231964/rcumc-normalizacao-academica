/** @type {import('next').NextConfig} */
const nextConfig = {
  // ============================================================
  // CONFIGURAÇÃO DO NEXT.JS
  // ============================================================
  // Desabilita o header x-powered-by por segurança
  poweredByHeader: false,

  // Configuração experimental para API routes com body maior (uploads)
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
};

export default nextConfig;

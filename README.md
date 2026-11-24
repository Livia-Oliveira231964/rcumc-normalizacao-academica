# RCUM - Normalização Acadêmica UMC

Sistema web para normalização de documentos acadêmicos da UMC. Permite que o aluno envie um arquivo **PDF** ou **DOCX** e baixe uma versão **PDF padronizada**.

## Funcionalidades

- Upload de arquivos `.pdf` e `.docx`
- Detecção automática (ou seleção manual) do tipo de documento:
  - Folha de Rosto
  - Carta de Apresentação
  - Resumo Simples
  - Resumo Expandido
- Validação automática com diagnóstico de não conformidades
- Geração de PDF padronizado para download
- **Sem armazenamento de dados**: arquivos processados apenas em memória

## Estrutura do Projeto

```
RCUM/
├── .vscode/                 # Configurações do VSCode
├── models/                  # Modelos institucionais UMC (.docx)
├── public/                  # Assets públicos
├── src/
│   ├── app/
│   │   ├── api/convert/     # API de conversão (POST)
│   │   ├── globals.css      # Estilos globais
│   │   ├── layout.js        # Layout raiz
│   │   └── page.js          # Página principal (UI)
│   └── lib/
│       ├── normalize.js     # Regras e validação UMC
│       └── pdfGenerator.js  # Geração de PDF padronizado
├── .gitignore
├── jsconfig.json
├── next.config.mjs
├── package.json
├── vercel.json
└── README.md
```

## Tecnologias

- [Next.js 14](https://nextjs.org/) (App Router)
- [pdf-lib](https://pdf-lib.js.org/) - geração de PDF
- [mammoth](https://github.com/mwilliamson/mammoth.js) - extração de texto de DOCX
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) - extração de texto de PDF

## Executando localmente

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev
```

Acesse `http://localhost:3000`.

## Deploy na Vercel

1. Faça push do repositório para o GitHub
2. Importe o projeto na [Vercel](https://vercel.com/new)
3. A Vercel detectará Next.js automaticamente
4. Deploy sem variáveis de ambiente obrigatórias

## Privacidade

Os arquivos enviados são processados **apenas em memória** durante a requisição. Nenhum documento é salvo em disco, banco de dados ou serviço externo.

## Modelos

Os modelos institucionais de referência estão em `models/`:
- `Folha-de-Rosto.docx`
- `Modelo-Resumo-simples.docx`
- `Resumo-estruturado.docx`

# RCUMC - Normalização Acadêmica UMC

Sistema web para normalização de documentos acadêmicos da UMC. Permite que o aluno envie um arquivo **PDF** ou **DOCX** e baixe uma versão **PDF padronizada**, conforme as diretrizes institucionais.

## Site

- **Acesso**: https://rcum-normalizacao-academica.vercel.app

## O que o sistema faz

- Recebe arquivos em **PDF** ou **DOCX**
- Detecta ou permite selecionar o tipo de documento (Folha de Rosto, Carta de Apresentação, Resumo Simples, Resumo Expandido)
- Realiza validação automática com diagnóstico de não conformidades
- Gera um **PDF padronizado** para download
- **Não armazena dados**: os arquivos são processados apenas em memória durante a conversão

## Tipos de documento suportados

- Folha de Rosto
- Carta de Apresentação
- Resumo Simples
- Resumo Expandido

## Privacidade

Os documentos enviados não são salvos em disco, banco de dados ou serviços externos. O processamento ocorre em memória apenas durante a requisição.

## Tecnologias

- Next.js (App Router)
- pdf-lib
- mammoth
- pdf-parse

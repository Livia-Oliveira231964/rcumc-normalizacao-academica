/* ============================================================
 * MÓDULO DE NORMALIZAÇÃO ACADÊMICA - UMC
 * ------------------------------------------------------------
 * Contém as regras e funções para validar e normalizar
 * documentos acadêmicos conforme as diretrizes institucionais.
 *
 * Tipos suportados:
 *   - Folha de Rosto / Carta de Apresentação
 *   - Resumo Simples
 *   - Resumo Expandido
 *
 * IMPORTANTE: Este módulo NÃO persiste dados. Todo processamento
 * é feito em memória.
 * ============================================================ */

/* ------------------------------------------------------------
 * CONSTANTES - REGRAS INSTITUCIONAIS UMC
 * ------------------------------------------------------------
 * Valores de referência extraídos do SKILL de normalização
 * acadêmica e dos modelos institucionais.
 * ------------------------------------------------------------ */
export const UMC_RULES = {
  // Endereço institucional oficial (Carta de Apresentação)
  enderecoInstitucional:
    'Av. Dr. Cândido Xavier de Almeida e Souza, 200 – Centro Cívico, Mogi das Cruzes – SP, CEP 08780-911',

  // Categorias de publicação válidas
  categorias: ['pesquisa', 'inovação', 'extensão'],
  modalidades: ['PIBIC', 'SUMMIT'],

  // Áreas do conhecimento válidas
  areasConhecimento: [
    'Ciências Agrárias',
    'Ciências Biológicas',
    'Ciências da Saúde',
    'Ciências Exatas e da Terra',
    'Engenharias',
    'Ciências Humanas',
    'Ciências Sociais Aplicadas',
    'Linguística, Letras e Artes',
  ],

  // Regras de formatação - Resumo Simples
  resumoSimples: {
    margemCm: 2.5,
    fonte: 'Times New Roman',
    tamanhoFonte: 12,
    alinhamento: 'Justificado',
    espacamentoLinhas: 1.5,
    maxPalavras: 500,
    maxPalavrasChave: 5,
  },

  // Regras de formatação - Resumo Expandido
  resumoExpandido: {
    margemCm: 2.5,
    fonteTitulo: 'Times New Roman',
    tamanhoTituloPT: 16,
    tamanhoTituloTraduzido: 14,
    fonteCorpo: 'Times New Roman',
    tamanhoCorpo: 11,
    alinhamento: 'Justificado',
    espacamentoLinhas: 1.5,
    fonteElementos: 'Times New Roman',
    tamanhoElementos: 10,
    espacamentoElementos: 1.0,
  },
};

/* ------------------------------------------------------------
 * TIPOS DE DOCUMENTO SUPORTADOS
 * ------------------------------------------------------------ */
export const DOC_TYPES = {
  FOLHA_ROSTO: 'folha_rosto',
  CARTA_APRESENTACAO: 'carta_apresentacao',
  RESUMO_SIMPLES: 'resumo_simples',
  RESUMO_EXPANDIDO: 'resumo_expandido',
};

export const DOC_TYPE_LABELS = {
  [DOC_TYPES.FOLHA_ROSTO]: 'Folha de Rosto',
  [DOC_TYPES.CARTA_APRESENTACAO]: 'Carta de Apresentação',
  [DOC_TYPES.RESUMO_SIMPLES]: 'Resumo Simples',
  [DOC_TYPES.RESUMO_EXPANDIDO]: 'Resumo Expandido',
};

/* ------------------------------------------------------------
 * FUNÇÃO: contarPalavras
 * ------------------------------------------------------------
 * Conta palavras em um texto, ignorando espaços extras.
 * ------------------------------------------------------------ */
export function contarPalavras(texto) {
  if (!texto || typeof texto !== 'string') return 0;
  const palavras = texto
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((p) => p.length > 0);
  return palavras.length;
}

/* ------------------------------------------------------------
 * FUNÇÃO: limparTexto
 * ------------------------------------------------------------
 * Normaliza espaços em branco e remove caracteres de controle,
 * preservando acentos e cedilhas (UTF-8).
 * ------------------------------------------------------------ */
export function limparTexto(texto) {
  if (!texto || typeof texto !== 'string') return '';
  return texto
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------------------------------------
 * FUNÇÃO: detectarTipoDocumento
 * ------------------------------------------------------------
 * Tenta identificar o tipo de documento com base no conteúdo
 * textual extraído. Retorna null se não conseguir identificar.
 * ------------------------------------------------------------ */
export function detectarTipoDocumento(texto) {
  const t = (texto || '').toLowerCase();

  // Heurísticas simples baseadas em palavras-chave comuns
  if (t.includes('carta de apresentação') || t.includes('carta de apresentacao')) {
    return DOC_TYPES.CARTA_APRESENTACAO;
  }
  if (t.includes('folha de rosto') || (t.includes('capa do artigo') && t.includes('autores') && t.includes('instituições'))) {
    return DOC_TYPES.FOLHA_ROSTO;
  }
  if (t.includes('resumo expandido') || (t.includes('abstract') && t.includes('resumen') && t.includes('introdução'))) {
    return DOC_TYPES.RESUMO_EXPANDIDO;
  }
  if (t.includes('resumo simples')) {
    return DOC_TYPES.RESUMO_SIMPLES;
  }

  // Fallback heurístico: folha de rosto costuma ter tabela de autores/instituições/categoria
  if ((t.includes('autores') || t.includes('autor correspondente')) && t.includes('instituições') && t.includes('área do conhecimento')) {
    return DOC_TYPES.FOLHA_ROSTO;
  }
  if (t.includes('abstract') && t.includes('resumen')) {
    return DOC_TYPES.RESUMO_EXPANDIDO;
  }
  if (t.includes('palavras-chave') && t.includes('resumo')) {
    return DOC_TYPES.RESUMO_SIMPLES;
  }

  return null;
}

/* ------------------------------------------------------------
 * FUNÇÃO: validarDocumento
 * ------------------------------------------------------------
 * Executa validações básicas conforme o tipo de documento.
 * Retorna um relatório com não conformidades e avisos.
 * Não modifica o conteúdo - apenas diagnostica.
 * ------------------------------------------------------------ */
export function validarDocumento(texto, tipoDocumento) {
  const resultado = {
    tipo: tipoDocumento,
    tipoLabel: DOC_TYPE_LABELS[tipoDocumento] || 'Desconhecido',
    conformidades: [],
    naoConformidades: [],
    avisos: [],
  };

  const textoLimpo = limparTexto(texto);

  // --- Validações comuns ---
  if (!textoLimpo) {
    resultado.naoConformidades.push('Documento vazio ou sem texto extraível.');
    return resultado;
  }

  // --- Regras para Carta de Apresentação ---
  if (tipoDocumento === DOC_TYPES.CARTA_APRESENTACAO) {
    const temEndereco = textoLimpo.includes('Av. Dr. Cândido Xavier de Almeida e Souza');
    if (!temEndereco) {
      resultado.naoConformidades.push(
        `Endereço institucional ausente ou incorreto. Esperado: "${UMC_RULES.enderecoInstitucional}"`
      );
    } else {
      resultado.conformidades.push('Endereço institucional da UMC encontrado.');
    }

    const temEmailUmc = /@umc\.br/i.test(textoLimpo);
    if (!temEmailUmc) {
      resultado.avisos.push('Não foi identificado e-mail institucional @umc.br para o orientador.');
    } else {
      resultado.conformidades.push('E-mail institucional @umc.br identificado.');
    }
  }

  // --- Regras para Resumo Simples ---
  if (tipoDocumento === DOC_TYPES.RESUMO_SIMPLES) {
    const palavras = contarPalavras(textoLimpo);
    if (palavras > UMC_RULES.resumoSimples.maxPalavras) {
      resultado.naoConformidades.push(
        `Corpo do texto excede ${UMC_RULES.resumoSimples.maxPalavras} palavras (encontrado: ${palavras}).`
      );
    } else {
      resultado.conformidades.push(
        `Contagem de palavras dentro do limite (${palavras}/${UMC_RULES.resumoSimples.maxPalavras}).`
      );
    }

    // Verifica palavras-chave (heurística: linha contendo "palavras-chave" ou "keywords")
    const matchKw = textoLimpo.match(/palavras[- ]chave\s*[:\-]?\s*(.+)/i);
    if (matchKw) {
      const kws = matchKw[1].split(/[,;]/).map((k) => k.trim()).filter(Boolean);
      if (kws.length > UMC_RULES.resumoSimples.maxPalavrasChave) {
        resultado.naoConformidades.push(
          `Excesso de palavras-chave (${kws.length}). Máximo permitido: ${UMC_RULES.resumoSimples.maxPalavrasChave}.`
        );
      } else {
        resultado.conformidades.push(`Palavras-chave dentro do limite (${kws.length}/5).`);
      }
    } else {
      resultado.avisos.push('Não foi possível identificar a linha de palavras-chave automaticamente.');
    }
  }

  // --- Regras para Resumo Expandido ---
  if (tipoDocumento === DOC_TYPES.RESUMO_EXPANDIDO) {
    const temAbstract = /abstract/i.test(textoLimpo);
    const temResumen = /resumen/i.test(textoLimpo);
    if (!temAbstract) resultado.avisos.push('Seção "Abstract" (inglês) não identificada.');
    if (!temResumen) resultado.avisos.push('Seção "Resumen" (espanhol) não identificada.');
    if (temAbstract && temResumen) {
      resultado.conformidades.push('Títulos traduzidos (Abstract/Resumen) identificados.');
    }
  }

  // --- Regras para Folha de Rosto ---
  if (tipoDocumento === DOC_TYPES.FOLHA_ROSTO) {
    const temEmailUmc = /@umc\.br/i.test(textoLimpo);
    if (!temEmailUmc) {
      resultado.avisos.push('Não foi identificado e-mail institucional @umc.br para o orientador.');
    }
  }

  return resultado;
}

/* ------------------------------------------------------------
 * FUNÇÃO: normalizarTextoBasico
 * ------------------------------------------------------------
 * Aplica normalizações textuais seguras e não-destrutivas:
 * - Limpa espaços excessivos
 * - Garante encoding UTF-8 consistente (já tratado em JS)
 * - Normaliza quebras de linha
 * ------------------------------------------------------------ */
export function normalizarTextoBasico(texto) {
  return limparTexto(texto);
}

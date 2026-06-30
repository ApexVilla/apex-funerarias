export type TipoDocumentoReceber =
    | 'servico_avulso'
    | 'mensalidade'
    | 'taxa_adesao'
    | 'multa'
    | 'renegociacao'
    | 'boleto'
    | 'outros';

export type TipoDocumentoPagar =
    | 'fornecedor'
    | 'conta_luz'
    | 'conta_agua'
    | 'internet'
    | 'aluguel'
    | 'imposto'
    | 'salario'
    | 'servico'
    | 'taxa_bancaria'
    | 'seguro'
    | 'combustivel'
    | 'frete'
    | 'honorario'
    | 'manutencao'
    | 'material'
    | 'outros';

const textoUnificado = (...parts: (string | null | undefined)[]): string =>
    parts
        .filter((p) => p != null && String(p).trim() !== '')
        .join(' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');

export interface InferirTipoDocumentoReceberInput {
    assinaturaId?: string | null;
    descricao?: string | null;
    planoContaNome?: string | null;
    planoContaCodigo?: string | null;
}

/** Infere tipo_documento de contas a receber a partir do contexto do lançamento. */
export function inferirTipoDocumentoReceber(input: InferirTipoDocumentoReceberInput): TipoDocumentoReceber {
    if (input.assinaturaId) return 'mensalidade';

    const text = textoUnificado(input.descricao, input.planoContaNome, input.planoContaCodigo);

    if (text.includes('renegoci')) return 'renegociacao';
    if (text.includes('adesao') || text.includes('adesão')) return 'taxa_adesao';
    if (text.includes('multa')) return 'multa';
    if (text.includes('boleto')) return 'boleto';
    if (text.includes('mensalidade') || text.includes('assinatura') || text.includes('plano')) return 'mensalidade';

    return 'servico_avulso';
}

export interface InferirTipoDocumentoPagarInput {
    fornecedorId?: string | null;
    descricao?: string | null;
    planoContaNome?: string | null;
    planoContaCodigo?: string | null;
    naturezaFinanceira?: string | null;
}

/** Infere tipo_documento de contas a pagar a partir do plano de contas, fornecedor e descrição. */
export function inferirTipoDocumentoPagar(input: InferirTipoDocumentoPagarInput): TipoDocumentoPagar {
    const text = textoUnificado(
        input.descricao,
        input.planoContaNome,
        input.planoContaCodigo,
        input.naturezaFinanceira,
    );

    if (
        text.includes('salari') ||
        text.includes('folha') ||
        text.includes('pro-labore') ||
        text.includes('pro labore') ||
        text.includes('ferias') ||
        text.includes('férias') ||
        text.includes('rescis')
    ) {
        return 'salario';
    }
    if (text.includes('aluguel')) return 'aluguel';
    if (text.includes('luz') || text.includes('energia') || text.includes('eletric')) return 'conta_luz';
    if (text.includes('agua') || text.includes('água') || text.includes('saneamento')) return 'conta_agua';
    if (text.includes('internet') || text.includes('telefone') || text.includes('telecom')) return 'internet';
    if (
        text.includes('imposto') ||
        text.includes('iptu') ||
        text.includes(' iss') ||
        text.includes('icms') ||
        text.includes('darf') ||
        text.includes('simples nacional')
    ) {
        return 'imposto';
    }
    if (text.includes('taxa banc') || text.includes('tarifa banc') || text.includes('iof')) return 'taxa_bancaria';
    if (text.includes('seguro')) return 'seguro';
    if (text.includes('combust') || text.includes('gasolina') || text.includes('diesel')) return 'combustivel';
    if (text.includes('frete') || text.includes('transporte')) return 'frete';
    if (
        text.includes('honorar') ||
        text.includes('advogad') ||
        text.includes('contador') ||
        text.includes('contabil')
    ) {
        return 'honorario';
    }
    if (text.includes('manuten')) return 'manutencao';
    if (text.includes('material') || text.includes('insumo') || text.includes('materia')) return 'material';
    if (text.includes('servico') || text.includes('serviço')) return 'servico';
    if (input.fornecedorId || text.includes('fornecedor')) return 'fornecedor';

    return 'outros';
}

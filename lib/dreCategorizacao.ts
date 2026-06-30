export type DRECategoriaDespesa =
    | 'custo'
    | 'pessoal'
    | 'administrativa'
    | 'comercial'
    | 'financeira'
    | 'outras';

export type DRESecaoDespesa =
    | 'custos'
    | 'desp_admin'
    | 'desp_pessoal'
    | 'desp_comerciais'
    | 'desp_financeiras'
    | 'outras_desp';

export const SECAO_PARA_CATEGORIA_DESPESA: Record<DRESecaoDespesa, DRECategoriaDespesa> = {
    custos: 'custo',
    desp_admin: 'administrativa',
    desp_pessoal: 'pessoal',
    desp_comerciais: 'comercial',
    desp_financeiras: 'financeira',
    outras_desp: 'outras',
};

export interface DreDespesaInput {
    tipo_documento?: string | null;
    descricao?: string | null;
    plano_conta?: PlanoContaDRE | null;
}

export interface PlanoContaDRE {
    codigo?: string | null;
    nome?: string | null;
    tipo?: string | null;
}

const CODIGOS_PESSOAL_52 = new Set(['1', '2', '13']);

/** Classifica despesa/custo para linha do DRE com base no plano de contas. */
export function categorizarDespesaPorPlano(plano?: PlanoContaDRE | null): DRECategoriaDespesa | null {
    if (!plano?.codigo && !plano?.tipo && !plano?.nome) return null;

    const tipo = (plano?.tipo || '').toLowerCase();
    const codigo = (plano?.codigo || '').trim();
    const nome = (plano?.nome || '').toLowerCase();

    if (tipo === 'custo') return 'custo';

    const parts = codigo.split('.').filter(Boolean);
    const g1 = parts[0] || '';
    const g2 = parts[1] || '';
    const g3 = parts[2] || '';

    if (g1 === '5') {
        if (g2 === '1') return 'custo';
        if (g2 === '2') {
            if (CODIGOS_PESSOAL_52.has(g3) || contemPalavraPessoal(nome)) return 'pessoal';
            return 'administrativa';
        }
        if (g2 === '3') return 'comercial';
        if (g2 === '4') return 'financeira';
        if (g2 === '5') return 'custo';
    }

    if (g1 === '2' && g2 === '1' && parts.length >= 3) return 'pessoal';
    if (g1 === '2' && g2 === '2' && parts.length >= 3) return 'administrativa';
    if (g1 === '6') return 'custo';

    if (contemPalavraPessoal(nome)) return 'pessoal';

    return tipo === 'despesa' ? 'outras' : null;
}

function contemPalavraPessoal(texto: string): boolean {
    return (
        texto.includes('salár') ||
        texto.includes('salari') ||
        texto.includes('adiantamento') ||
        texto.includes('pró-labore') ||
        texto.includes('pro-labore') ||
        texto.includes('folha') ||
        texto.includes('encargo')
    );
}

/** Rótulo de detalhe no DRE: prioriza natureza (plano de contas). */
export function rotuloDetalheDRE(
    plano?: PlanoContaDRE | null,
    descricao?: string | null,
    tipoDocumento?: string | null,
): string {
    const nome = (plano?.nome || '').trim();
    if (nome) return nome;
    const desc = (descricao || tipoDocumento || 'Sem natureza').trim();
    return desc.length > 60 ? `${desc.substring(0, 57)}...` : desc;
}

/** Fallback por palavras-chave quando não há plano de contas. */
export function categorizarDespesaPorTexto(
    doc: string,
    descricao: string,
): { categoria: DRECategoriaDespesa; label: string } {
    const text = `${doc} ${descricao}`.toLowerCase();
    if (
        text.includes('salário') ||
        text.includes('salario') ||
        text.includes('folha') ||
        text.includes('inss') ||
        text.includes('fgts') ||
        text.includes('férias') ||
        text.includes('13') ||
        text.includes('vale') ||
        text.includes('beneficio') ||
        text.includes('benefício') ||
        text.includes('rescisão') ||
        text.includes('rescisao') ||
        text.includes('adiantamento')
    ) {
        return { categoria: 'pessoal', label: 'Despesas com Pessoal' };
    }
    if (
        text.includes('aluguel') ||
        text.includes('água') ||
        text.includes('agua') ||
        text.includes('luz') ||
        text.includes('energia') ||
        text.includes('internet') ||
        text.includes('telefone') ||
        text.includes('limpeza') ||
        text.includes('manutenção') ||
        text.includes('manutencao') ||
        text.includes('material') ||
        text.includes('escritório') ||
        text.includes('escritorio') ||
        text.includes('seguro') ||
        text.includes('iptu') ||
        text.includes('contador') ||
        text.includes('contabil') ||
        text.includes('contábil') ||
        text.includes('dedetiz')
    ) {
        return { categoria: 'administrativa', label: 'Despesas Administrativas' };
    }
    if (
        text.includes('marketing') ||
        text.includes('publicidade') ||
        text.includes('propaganda') ||
        text.includes('anúncio') ||
        text.includes('anuncio') ||
        text.includes('comissão') ||
        text.includes('comissao') ||
        text.includes('vendedor')
    ) {
        return { categoria: 'comercial', label: 'Despesas Comerciais' };
    }
    if (
        text.includes('juro') ||
        text.includes('taxa') ||
        text.includes('tarifa') ||
        text.includes('iof') ||
        text.includes('banco') ||
        text.includes('bancária') ||
        text.includes('bancaria') ||
        text.includes('cartão') ||
        text.includes('cartao')
    ) {
        return { categoria: 'financeira', label: 'Despesas Financeiras' };
    }
    if (
        text.includes('fornecedor') ||
        text.includes('custo') ||
        text.includes('insumo') ||
        text.includes('matéria') ||
        text.includes('materia') ||
        text.includes('embalsamamento') ||
        text.includes('translado') ||
        text.includes('motorista') ||
        text.includes('combustível') ||
        text.includes('combustivel') ||
        text.includes('veículo') ||
        text.includes('veiculo') ||
        text.includes('servico') ||
        text.includes('serviço')
    ) {
        return { categoria: 'custo', label: 'Custos dos Serviços' };
    }
    return { categoria: 'outras', label: 'Outras Despesas' };
}

/** Classifica receita operacional para linha do DRE (contas a receber baixadas). */
export function categorizarReceitaPorTexto(doc: string): string {
    const d = (doc || '').toLowerCase();
    if (d.includes('mensalidade') || d.includes('plano') || d.includes('assinatura')) {
        return 'Mensalidades e Planos';
    }
    if (d.includes('servico') || d.includes('serviço') || d.includes('funeral') || d.includes('obito') || d.includes('óbito')) {
        return 'Serviços Funerários';
    }
    if (d.includes('venda') || d.includes('produto') || d.includes('urna') || d.includes('caixão')) {
        return 'Venda de Produtos';
    }
    if (d.includes('jazigo') || d.includes('cemiterio') || d.includes('cemitério')) {
        return 'Jazigos e Cemitério';
    }
    if (d.includes('cremação') || d.includes('cremacao')) {
        return 'Cremação';
    }
    return 'Outras Receitas Operacionais';
}

/** Classifica despesa/custo (plano de contas + fallback por texto). */
export function categorizarDespesaItem(item: DreDespesaInput): DRECategoriaDespesa {
    const porPlano = categorizarDespesaPorPlano(item.plano_conta);
    if (porPlano) return porPlano;
    return categorizarDespesaPorTexto(item.tipo_documento || '', item.descricao || '').categoria;
}

import {
    categorizarDespesaItem,
    categorizarReceitaPorTexto,
    rotuloDetalheDRE,
    SECAO_PARA_CATEGORIA_DESPESA,
    type DRESecaoDespesa,
    type PlanoContaDRE,
} from './dreCategorizacao';

export type DREDrilldownContext =
    | { kind: 'receita'; categoria: string }
    | { kind: 'despesa'; secao: DRESecaoDespesa; rotulo?: string }
    | { kind: 'outras_receitas'; rotulo: string };

export interface DREDrilldownRecebivel {
    id: string;
    codigo?: string | null;
    valor_pago_centavos: number;
    tipo_documento?: string | null;
    descricao?: string | null;
    empresa_id?: string;
    data_competencia: string;
    data_pagamento?: string | null;
    cliente_nome?: string | null;
}

export interface DREDrilldownPagavel {
    id: string;
    valor_pago_centavos: number;
    empresa_id?: string;
    data_baixa: string;
    conta_codigo?: string | null;
    tipo_documento?: string | null;
    descricao?: string | null;
    fornecedor_nome?: string | null;
    plano_conta?: PlanoContaDRE | null;
}

export interface DREDrilldownMovimentacao {
    id?: string;
    tipo: string;
    descricao?: string | null;
    valor_centavos: number;
    empresa_id?: string;
    data_competencia: string;
}

export type DREDrilldownLinha =
    | {
          origem: 'conta_receber';
          id: string;
          data: string;
          codigo: string;
          referencia: string;
          natureza: string;
          valor_centavos: number;
      }
    | {
          origem: 'conta_pagar_baixa';
          id: string;
          data: string;
          codigo: string;
          referencia: string;
          natureza: string;
          valor_centavos: number;
      }
    | {
          origem: 'movimentacao';
          id: string;
          data: string;
          codigo: string;
          referencia: string;
          natureza: string;
          valor_centavos: number;
      };

function noPeriodo(data: string | undefined | null, inicio: string, fim: string): boolean {
    if (!data) return false;
    return data >= inicio && data <= fim;
}

function empresaOk(empresaId: string | undefined, ids: string[]): boolean {
    return ids.includes(empresaId || '');
}

function rotuloPagavel(p: DREDrilldownPagavel): string {
    return rotuloDetalheDRE(p.plano_conta, p.descricao, p.tipo_documento);
}

function tipoDocLabel(tipo?: string | null): string {
    return (tipo || 'outros').replace(/_/g, ' ');
}

export function filtrarLinhasDREDrilldown(
    ctx: DREDrilldownContext,
    recebiveis: DREDrilldownRecebivel[],
    pagaveis: DREDrilldownPagavel[],
    movimentacoes: DREDrilldownMovimentacao[],
    periodo: { inicio: string; fim: string },
    empresaIds: string[],
): DREDrilldownLinha[] {
    if (ctx.kind === 'receita') {
        return recebiveis
            .filter((r) => {
                if (!empresaOk(r.empresa_id, empresaIds)) return false;
                if (!noPeriodo(r.data_competencia, periodo.inicio, periodo.fim)) return false;
                const cat = categorizarReceitaPorTexto(r.tipo_documento || r.descricao || '');
                return cat === ctx.categoria;
            })
            .map((r) => ({
                origem: 'conta_receber' as const,
                id: r.id,
                data: r.data_pagamento || r.data_competencia,
                codigo: r.codigo || '—',
                referencia: r.cliente_nome || r.descricao || '—',
                natureza: tipoDocLabel(r.tipo_documento),
                valor_centavos: r.valor_pago_centavos,
            }))
            .sort((a, b) => b.data.localeCompare(a.data) || b.valor_centavos - a.valor_centavos);
    }

    if (ctx.kind === 'outras_receitas') {
        return movimentacoes
            .filter((m) => {
                if (!empresaOk(m.empresa_id, empresaIds)) return false;
                if (!noPeriodo(m.data_competencia, periodo.inicio, periodo.fim)) return false;
                if (m.tipo !== 'ajuste_credito') return false;
                const duplicado = recebiveis.some(
                    (r) => r.descricao === m.descricao && r.valor_pago_centavos === m.valor_centavos,
                );
                return !duplicado;
            })
            .map((m, i) => ({
                origem: 'movimentacao' as const,
                id: m.id || `mov-${i}`,
                data: m.data_competencia,
                codigo: '—',
                referencia: m.descricao || 'Ajuste de crédito',
                natureza: m.tipo.replace(/_/g, ' '),
                valor_centavos: m.valor_centavos,
            }))
            .sort((a, b) => b.data.localeCompare(a.data) || b.valor_centavos - a.valor_centavos);
    }

    const categoria = SECAO_PARA_CATEGORIA_DESPESA[ctx.secao];
    return pagaveis
        .filter((p) => {
            if (!empresaOk(p.empresa_id, empresaIds)) return false;
            if (!noPeriodo(p.data_baixa, periodo.inicio, periodo.fim)) return false;
            if (categorizarDespesaItem(p) !== categoria) return false;
            if (ctx.rotulo && rotuloPagavel(p) !== ctx.rotulo) return false;
            return true;
        })
        .map((p) => ({
            origem: 'conta_pagar_baixa' as const,
            id: p.id,
            data: p.data_baixa,
            codigo: p.conta_codigo || '—',
            referencia: p.fornecedor_nome || p.descricao || '—',
            natureza: rotuloPagavel(p),
            valor_centavos: p.valor_pago_centavos,
        }))
        .sort((a, b) => b.data.localeCompare(a.data) || b.valor_centavos - a.valor_centavos);
}

export function secaoDespesaPorTituloGrupo(titulo: string): DRESecaoDespesa | null {
    const map: Record<string, DRESecaoDespesa> = {
        'Despesas Administrativas': 'desp_admin',
        'Despesas com Pessoal': 'desp_pessoal',
        'Despesas Comerciais': 'desp_comerciais',
        'Despesas Financeiras': 'desp_financeiras',
        'Outras Despesas': 'outras_desp',
        '(-) CUSTOS DOS SERVIÇOS PRESTADOS': 'custos',
    };
    return map[titulo] || null;
}

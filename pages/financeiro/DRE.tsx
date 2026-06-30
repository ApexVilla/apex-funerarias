import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, DollarSign, Calendar,
    Download, ChevronDown, Minus, BarChart3,
    ArrowUpRight, ArrowDownRight, Printer, FileSpreadsheet, FileText, Table2,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    ResponsiveContainer,
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import { PageHeader } from '../../components/common/PageHeader';
import { Card, Button, Select, Input } from '../../components/ui/Components';
import { useFinanceiro, formatCentavos } from '../../lib/FinanceiroStore';
import { FinanceiroLoading } from '../../components/financeiro/FinanceiroComponents';
import { supabase } from '../../lib/supabase';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useFilial } from '../../lib/FilialContext';
import {
    categorizarDespesaItem,
    categorizarReceitaPorTexto,
    rotuloDetalheDRE,
    type PlanoContaDRE,
} from '../../lib/dreCategorizacao';
import {
    type DREDrilldownContext,
    type DREDrilldownMovimentacao,
    type DREDrilldownPagavel,
    type DREDrilldownRecebivel,
    secaoDespesaPorTituloGrupo,
} from '../../lib/dreDrilldown';
import { DREDrilldownModal } from '../../components/financeiro/DREDrilldownModal';


interface DRELinha {
    id: string;
    codigo: string;
    descricao: string;
    tipo: 'grupo' | 'conta' | 'subtotal' | 'total';
    natureza: 'receita' | 'despesa' | 'resultado';
    nivel: number;
    valor_centavos: number;
    percentual_receita: number;
    filhos?: DRELinha[];
    conta_ids?: string[];
}

interface DREPeriodo {
    label: string;
    mes: number;
    ano: number;
    inicio: string;
    fim: string;
}

function getMeses(ano: number): DREPeriodo[] {
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return meses.map((label, i) => {
        const mes = i + 1;
        const ultimoDia = new Date(ano, mes, 0).getDate();
        return {
            label,
            mes,
            ano,
            inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
            fim: `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
        };
    });
}

function getAnoAtual() {
    return new Date().getFullYear();
}

function getMesAtual() {
    return new Date().getMonth() + 1;
}

type ModoVisualizacao = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'personalizado';

interface PeriodoSelecionado {
    inicio: string;
    fim: string;
    label: string;
}

function calcularPeriodo(
    modo: ModoVisualizacao,
    ano: number,
    mes: number,
    inicioCustom?: string,
    fimCustom?: string
): PeriodoSelecionado {
    switch (modo) {
        case 'personalizado': {
            const formatarDataBr = (dataSql?: string) => {
                if (!dataSql) return '';
                const parts = dataSql.split('-');
                if (parts.length !== 3) return dataSql;
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            };
            return {
                inicio: inicioCustom || '',
                fim: fimCustom || '',
                label: `Período: ${formatarDataBr(inicioCustom)} a ${formatarDataBr(fimCustom)}`,
            };
        }
        case 'mensal': {
            const ultimoDia = new Date(ano, mes, 0).getDate();
            return {
                inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
                fim: `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
                label: `${getMeses(ano)[mes - 1].label} ${ano}`,
            };
        }
        case 'trimestral': {
            const trimestre = Math.ceil(mes / 3);
            const mesInicio = (trimestre - 1) * 3 + 1;
            const mesFim = trimestre * 3;
            const ultimoDia = new Date(ano, mesFim, 0).getDate();
            return {
                inicio: `${ano}-${String(mesInicio).padStart(2, '0')}-01`,
                fim: `${ano}-${String(mesFim).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
                label: `${trimestre}º Trimestre ${ano}`,
            };
        }
        case 'semestral': {
            const semestre = mes <= 6 ? 1 : 2;
            const mesInicio = semestre === 1 ? 1 : 7;
            const mesFim = semestre === 1 ? 6 : 12;
            const ultimoDia = new Date(ano, mesFim, 0).getDate();
            return {
                inicio: `${ano}-${String(mesInicio).padStart(2, '0')}-01`,
                fim: `${ano}-${String(mesFim).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
                label: `${semestre}º Semestre ${ano}`,
            };
        }
        case 'anual': {
            return {
                inicio: `${ano}-01-01`,
                fim: `${ano}-12-31`,
                label: `Ano ${ano}`,
            };
        }
    }
}

interface DREData {
    receita_bruta: number;
    /** Soma das baixas de contas a pagar no período (regime de caixa). */
    total_pago: number;
    deducoes_receita: number;
    receita_liquida: number;
    custos_servicos: number;
    lucro_bruto: number;
    despesas_administrativas: number;
    despesas_pessoal: number;
    despesas_comerciais: number;
    despesas_financeiras: number;
    outras_despesas: number;
    total_despesas_operacionais: number;
    resultado_operacional: number;
    outras_receitas: number;
    resultado_antes_ir: number;
    provisao_ir: number;
    resultado_liquido: number;

    detalhes_receitas: { descricao: string; valor: number }[];
    detalhes_deducoes: { descricao: string; valor: number }[];
    detalhes_custos: { descricao: string; valor: number }[];
    detalhes_desp_admin: { descricao: string; valor: number }[];
    detalhes_desp_pessoal: { descricao: string; valor: number }[];
    detalhes_desp_comerciais: { descricao: string; valor: number }[];
    detalhes_desp_financeiras: { descricao: string; valor: number }[];
    detalhes_outras_despesas: { descricao: string; valor: number }[];
    detalhes_outras_receitas: { descricao: string; valor: number }[];
}

function emptyDREData(): DREData {
    return {
        receita_bruta: 0, total_pago: 0, deducoes_receita: 0, receita_liquida: 0,
        custos_servicos: 0, lucro_bruto: 0,
        despesas_administrativas: 0, despesas_pessoal: 0, despesas_comerciais: 0,
        despesas_financeiras: 0, outras_despesas: 0, total_despesas_operacionais: 0,
        resultado_operacional: 0, outras_receitas: 0, resultado_antes_ir: 0,
        provisao_ir: 0, resultado_liquido: 0,
        detalhes_receitas: [], detalhes_deducoes: [], detalhes_custos: [],
        detalhes_desp_admin: [], detalhes_desp_pessoal: [], detalhes_desp_comerciais: [],
        detalhes_desp_financeiras: [], detalhes_outras_despesas: [], detalhes_outras_receitas: [],
    };
}

function mergeDetalhes(
    a: { descricao: string; valor: number }[],
    b: { descricao: string; valor: number }[],
) {
    const map = new Map<string, number>();
    [...a, ...b].forEach((d) => map.set(d.descricao, (map.get(d.descricao) || 0) + d.valor));
    return Array.from(map.entries())
        .map(([descricao, valor]) => ({ descricao, valor }))
        .sort((x, y) => y.valor - x.valor);
}

function consolidarDRE(lista: DREData[]): DREData {
    if (lista.length === 0) return emptyDREData();
    if (lista.length === 1) return lista[0];
    return lista.reduce((acc, d) => ({
        receita_bruta: acc.receita_bruta + d.receita_bruta,
        total_pago: acc.total_pago + d.total_pago,
        deducoes_receita: acc.deducoes_receita + d.deducoes_receita,
        receita_liquida: acc.receita_liquida + d.receita_liquida,
        custos_servicos: acc.custos_servicos + d.custos_servicos,
        lucro_bruto: acc.lucro_bruto + d.lucro_bruto,
        despesas_administrativas: acc.despesas_administrativas + d.despesas_administrativas,
        despesas_pessoal: acc.despesas_pessoal + d.despesas_pessoal,
        despesas_comerciais: acc.despesas_comerciais + d.despesas_comerciais,
        despesas_financeiras: acc.despesas_financeiras + d.despesas_financeiras,
        outras_despesas: acc.outras_despesas + d.outras_despesas,
        total_despesas_operacionais: acc.total_despesas_operacionais + d.total_despesas_operacionais,
        resultado_operacional: acc.resultado_operacional + d.resultado_operacional,
        outras_receitas: acc.outras_receitas + d.outras_receitas,
        resultado_antes_ir: acc.resultado_antes_ir + d.resultado_antes_ir,
        provisao_ir: acc.provisao_ir + d.provisao_ir,
        resultado_liquido: acc.resultado_liquido + d.resultado_liquido,
        detalhes_receitas: mergeDetalhes(acc.detalhes_receitas, d.detalhes_receitas),
        detalhes_deducoes: mergeDetalhes(acc.detalhes_deducoes, d.detalhes_deducoes),
        detalhes_custos: mergeDetalhes(acc.detalhes_custos, d.detalhes_custos),
        detalhes_desp_admin: mergeDetalhes(acc.detalhes_desp_admin, d.detalhes_desp_admin),
        detalhes_desp_pessoal: mergeDetalhes(acc.detalhes_desp_pessoal, d.detalhes_desp_pessoal),
        detalhes_desp_comerciais: mergeDetalhes(acc.detalhes_desp_comerciais, d.detalhes_desp_comerciais),
        detalhes_desp_financeiras: mergeDetalhes(acc.detalhes_desp_financeiras, d.detalhes_desp_financeiras),
        detalhes_outras_despesas: mergeDetalhes(acc.detalhes_outras_despesas, d.detalhes_outras_despesas),
        detalhes_outras_receitas: mergeDetalhes(acc.detalhes_outras_receitas, d.detalhes_outras_receitas),
    }), emptyDREData());
}

type RawRecebivel = DREDrilldownRecebivel;

type RawPagavel = DREDrilldownPagavel & {
    plano_conta_id?: string | null;
};

type RawMovimentacao = DREDrilldownMovimentacao;

/** Baixa de conta a pagar com título (inner join) — fonte do DRE por data de pagamento. */
type RawBaixaPagar = {
    id: string;
    valor_pago_centavos: number;
    empresa_id?: string;
    data_baixa: string;
    fin_contas_pagar: {
        id?: string;
        codigo?: string | null;
        tipo_documento?: string | null;
        descricao?: string | null;
        fornecedor_nome?: string | null;
        plano_conta_id?: string | null;
        filial_id?: string | null;
        deleted_at?: string | null;
        fin_plano_contas?: PlanoContaDRE | PlanoContaDRE[] | null;
    } | null;
};

function extrairPlanoConta(raw: PlanoContaDRE | PlanoContaDRE[] | null | undefined): PlanoContaDRE | null {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw[0] || null;
    return raw;
}

function baixasPagarParaRawPagaveis(baixas: RawBaixaPagar[]): RawPagavel[] {
    return baixas.map((b) => {
        const cp = b.fin_contas_pagar;
        return {
            id: b.id,
            valor_pago_centavos: b.valor_pago_centavos,
            tipo_documento: cp?.tipo_documento,
            descricao: cp?.descricao,
            conta_codigo: cp?.codigo,
            fornecedor_nome: cp?.fornecedor_nome,
            plano_conta: extrairPlanoConta(cp?.fin_plano_contas),
            empresa_id: b.empresa_id,
            data_baixa: b.data_baixa,
        };
    });
}

type RawMovimentacaoLegacy = RawMovimentacao;

function computeDREFromRaw(
    recebiveis: RawRecebivel[],
    pagaveis: RawPagavel[],
    movimentacoes: RawMovimentacaoLegacy[],
): DREData {
    const receitasPorCategoria = new Map<string, number>();
    let totalReceitaBruta = 0;

    recebiveis.forEach((r) => {
        const cat = categorizarReceitaPorTexto(r.tipo_documento || r.descricao || '');
        receitasPorCategoria.set(cat, (receitasPorCategoria.get(cat) || 0) + r.valor_pago_centavos);
        totalReceitaBruta += r.valor_pago_centavos;
    });

    movimentacoes.forEach((m) => {
        if (m.tipo === 'receita' || m.tipo === 'ajuste_credito') {
            const recebivelJaContado = recebiveis.some(
                (r) => r.descricao === m.descricao && r.valor_pago_centavos === m.valor_centavos,
            );
            if (!recebivelJaContado && m.tipo === 'ajuste_credito') {
                const cat = 'Outras Receitas';
                receitasPorCategoria.set(cat, (receitasPorCategoria.get(cat) || 0) + m.valor_centavos);
            }
        }
    });

    const despPessoal = new Map<string, number>();
    const despAdmin = new Map<string, number>();
    const despComercial = new Map<string, number>();
    const despFinanceira = new Map<string, number>();
    const despCustos = new Map<string, number>();
    const despOutras = new Map<string, number>();

    pagaveis.forEach((p) => {
        const categoria = categorizarDespesaItem(p);
        const desc = rotuloDetalheDRE(p.plano_conta, p.descricao, p.tipo_documento);
        const map = {
            pessoal: despPessoal,
            administrativa: despAdmin,
            comercial: despComercial,
            financeira: despFinanceira,
            custo: despCustos,
            outras: despOutras,
        }[categoria] || despOutras;
        map.set(desc, (map.get(desc) || 0) + p.valor_pago_centavos);
    });

    const mapToDetalhes = (map: Map<string, number>) =>
        Array.from(map.entries())
            .map(([descricao, valor]) => ({ descricao, valor }))
            .sort((a, b) => b.valor - a.valor);

    const totalDeducoes = 0;
    const totalCustos = Array.from(despCustos.values()).reduce((s, v) => s + v, 0);
    const totalDespAdmin = Array.from(despAdmin.values()).reduce((s, v) => s + v, 0);
    const totalDespPessoal = Array.from(despPessoal.values()).reduce((s, v) => s + v, 0);
    const totalDespComercial = Array.from(despComercial.values()).reduce((s, v) => s + v, 0);
    const totalDespFinanceira = Array.from(despFinanceira.values()).reduce((s, v) => s + v, 0);
    const totalOutrasDesp = Array.from(despOutras.values()).reduce((s, v) => s + v, 0);
    const totalPago = pagaveis.reduce((s, p) => s + p.valor_pago_centavos, 0);

    const receitaLiquida = totalReceitaBruta - totalDeducoes;
    const lucroBruto = receitaLiquida - totalCustos;
    const totalDespOperacionais = totalDespAdmin + totalDespPessoal + totalDespComercial + totalDespFinanceira + totalOutrasDesp;
    const resultadoOperacional = lucroBruto - totalDespOperacionais;

    const outrasReceitasMap = new Map<string, number>();
    const outrasReceitasVal = receitasPorCategoria.get('Outras Receitas') || 0;
    if (outrasReceitasVal > 0) {
        outrasReceitasMap.set('Receitas não operacionais', outrasReceitasVal);
    }
    const totalOutrasReceitas = outrasReceitasVal;

    receitasPorCategoria.delete('Outras Receitas');

    const resultadoAntesIR = resultadoOperacional + totalOutrasReceitas;
    const provisaoIR = 0;
    const resultadoLiquido = resultadoAntesIR - provisaoIR;

    return {
        receita_bruta: totalReceitaBruta,
        total_pago: totalPago,
        deducoes_receita: totalDeducoes,
        receita_liquida: receitaLiquida,
        custos_servicos: totalCustos,
        lucro_bruto: lucroBruto,
        despesas_administrativas: totalDespAdmin,
        despesas_pessoal: totalDespPessoal,
        despesas_comerciais: totalDespComercial,
        despesas_financeiras: totalDespFinanceira,
        outras_despesas: totalOutrasDesp,
        total_despesas_operacionais: totalDespOperacionais,
        resultado_operacional: resultadoOperacional,
        outras_receitas: totalOutrasReceitas,
        resultado_antes_ir: resultadoAntesIR,
        provisao_ir: provisaoIR,
        resultado_liquido: resultadoLiquido,
        detalhes_receitas: mapToDetalhes(receitasPorCategoria),
        detalhes_deducoes: [],
        detalhes_custos: mapToDetalhes(despCustos),
        detalhes_desp_admin: mapToDetalhes(despAdmin),
        detalhes_desp_pessoal: mapToDetalhes(despPessoal),
        detalhes_desp_comerciais: mapToDetalhes(despComercial),
        detalhes_desp_financeiras: mapToDetalhes(despFinanceira),
        detalhes_outras_despesas: mapToDetalhes(despOutras),
        detalhes_outras_receitas: mapToDetalhes(outrasReceitasMap),
    };
}

function formatPercent(value: number): string {
    if (!isFinite(value) || isNaN(value)) return '0,0%';
    return value.toFixed(1).replace('.', ',') + '%';
}

const DRE_SECOES_EXPANDIVEIS = [
    'receitas',
    'deducoes',
    'custos',
    'desp_admin',
    'desp_pessoal',
    'desp_comerciais',
    'desp_financeiras',
    'outras_desp',
    'outras_rec',
] as const;

interface DRELinhaRowProps {
    descricao: string;
    valor: number;
    receitaRef: number;
    nivel: number;
    tipo: 'grupo' | 'detalhe' | 'subtotal' | 'total' | 'resultado';
    isNegative?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
    onDrilldown?: () => void;
    hasChildren?: boolean;
    qtdDetalhes?: number;
}

const DRELinhaRow: React.FC<DRELinhaRowProps> = ({
    descricao, valor, receitaRef, nivel, tipo,
    isNegative = false, expanded, onToggle, onDrilldown, hasChildren, qtdDetalhes = 0,
}) => {
    const pct = receitaRef !== 0 ? (valor / receitaRef) * 100 : 0;
    const displayValor = isNegative ? -Math.abs(valor) : valor;

    const bgClasses: Record<string, string> = {
        grupo: nivel === 0 ? 'bg-gray-100 dark:bg-slate-800 font-bold' : 'bg-gray-50 dark:bg-slate-800/40 font-semibold',
        subtotal: 'bg-blue-50/50 dark:bg-blue-950/30 font-semibold border-t border-blue-100 dark:border-blue-900/50',
        total: 'bg-gray-900 dark:bg-slate-950 text-white font-bold',
        resultado: valor >= 0 ? 'bg-green-50 dark:bg-green-950/30 font-bold border-t-2 border-green-200 dark:border-green-900/50' : 'bg-red-50 dark:bg-red-950/30 font-bold border-t-2 border-red-200 dark:border-red-900/50',
        detalhe: 'hover:bg-gray-50/50 dark:hover:bg-slate-800/40',
    };

    const valorColorClass = tipo === 'total'
        ? 'text-white'
        : tipo === 'resultado'
            ? valor >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
            : isNegative
                ? 'text-red-600'
                : valor > 0 ? 'text-gray-900 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500';

    const pctColorClass = tipo === 'total'
        ? 'text-gray-300'
        : tipo === 'resultado'
            ? valor >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            : 'text-gray-400 dark:text-slate-500';

    const padLeft = tipo === 'detalhe' ? 16 + nivel * 20 : 12 + nivel * 16;
    const podeExpandir = Boolean(hasChildren && onToggle);
    const podeDrilldown = Boolean(onDrilldown && valor !== 0);
    const qtd = qtdDetalhes > 0 ? qtdDetalhes : 0;

    const handleRowClick = () => {
        if (podeExpandir) onToggle?.();
        else if (podeDrilldown) onDrilldown?.();
    };

    const toggleBtnClass = tipo === 'total'
        ? expanded
            ? 'border-white/50 bg-white/20 text-white shadow-sm'
            : 'border-white/25 bg-white/10 text-white/90 hover:bg-white/20 hover:border-white/40'
        : expanded
            ? 'border-blue-400 bg-blue-100 text-blue-800 shadow-sm ring-2 ring-blue-200/60 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900/40'
            : 'border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:bg-blue-950/30';

    return (
        <tr
            className={`transition-colors ${bgClasses[tipo] || ''} ${(podeExpandir || podeDrilldown) ? 'cursor-pointer hover:brightness-[0.98] dark:hover:brightness-110' : ''}`}
            onClick={handleRowClick}
        >
            <td
                className="py-2.5 px-3 text-sm"
                style={{ paddingLeft: `${padLeft}px` }}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    {podeExpandir ? (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggle?.();
                            }}
                            aria-expanded={expanded}
                            aria-label={expanded ? `Recolher detalhes de ${descricao}` : `Expandir detalhes de ${descricao}`}
                            title={expanded ? 'Recolher detalhes' : `Ver ${qtd} ${qtd === 1 ? 'item' : 'itens'}`}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${toggleBtnClass}`}
                        >
                            <ChevronDown
                                className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
                                aria-hidden
                            />
                        </button>
                    ) : tipo === 'detalhe' ? (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
                            <Minus className="h-3 w-3 text-gray-300 dark:text-slate-600" />
                        </span>
                    ) : (
                        <span className="w-8 shrink-0" aria-hidden />
                    )}
                    <span className={`min-w-0 ${tipo === 'total' ? 'text-white' : 'text-gray-900 dark:text-slate-100'} ${podeDrilldown ? 'underline decoration-dotted decoration-slate-300 underline-offset-2' : ''}`}>
                        {descricao}
                    </span>
                    {podeDrilldown && (
                        podeExpandir ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDrilldown?.();
                                }}
                                className="shrink-0 text-[10px] font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
                            >
                                ver lançamentos
                            </button>
                        ) : (
                            <span className="shrink-0 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                ver lançamentos
                            </span>
                        )
                    )}
                    {podeExpandir && qtd > 0 && (
                        <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                                expanded
                                    ? 'bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            }`}
                        >
                            {expanded ? 'detalhes abertos' : `${qtd} ${qtd === 1 ? 'item' : 'itens'}`}
                        </span>
                    )}
                </div>
            </td>
            <td className={`py-2.5 px-3 text-sm text-right tabular-nums ${valorColorClass}`}>
                {formatCentavos(displayValor)}
            </td>
            <td className={`py-2.5 px-3 text-xs text-right tabular-nums ${pctColorClass}`}>
                {tipo !== 'total' && formatPercent(Math.abs(pct))}
            </td>
        </tr>
    );
};

function obterMesesNoPeriodo(inicio: string, fim: string): { label: string; mesYm: string; receitas: number; despesas: number; resultado: number }[] {
    const dInicio = new Date(inicio + 'T00:00:00');
    const dFim = new Date(fim + 'T00:00:00');
    const result: { label: string; mesYm: string; receitas: number; despesas: number; resultado: number }[] = [];
    
    let current = new Date(dInicio.getFullYear(), dInicio.getMonth(), 1);
    const end = new Date(dFim.getFullYear(), dFim.getMonth(), 1);
    
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    while (current <= end) {
        const y = current.getFullYear();
        const m = current.getMonth();
        const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
        const label = `${nomesMeses[m]}/${y}`;
        result.push({ label, mesYm: ym, receitas: 0, despesas: 0, resultado: 0 });
        current.setMonth(current.getMonth() + 1);
    }
    return result;
}

export const DRE: React.FC = () => {
    const { filialId, isTodasFiliais, dataRevision } = useFilial();
    const {
        empresaIdEfetivo,
        empresaIdsParaFiltro,
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        dataRevisionEmpresa,
    } = useEmpresaContextoAtivo();
    const shouldFilterByFilial =
        Boolean(filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais);
    const empresaId = empresaIdEfetivo || '';
    const empresaIdsScope = useMemo(
        () => (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean),
        [empresaIdsParaFiltro],
    );
    const [loading, setLoading] = useState(true);
    const [ano, setAno] = useState(getAnoAtual());
    const [mes, setMes] = useState(getMesAtual());
    const [modo, setModo] = useState<ModoVisualizacao>('mensal');
    const [dataInicioCustom, setDataInicioCustom] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [dataFimCustom, setDataFimCustom] = useState<string>(() => {
        const d = new Date();
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    });
    const [drePorUnidade, setDrePorUnidade] = useState<Map<string, DREData>>(new Map());
    const [dreConsolidado, setDreConsolidado] = useState<DREData | null>(null);
    const [abaAtiva, setAbaAtiva] = useState<'consolidado' | string>('consolidado');
    const [allRecebiveis, setAllRecebiveis] = useState<RawRecebivel[]>([]);
    const [allPagaveis, setAllPagaveis] = useState<RawPagavel[]>([]);
    const [allMovimentacoes, setAllMovimentacoes] = useState<RawMovimentacao[]>([]);
    const [vista, setVista] = useState<'tabela' | 'grafico'>('tabela');
    const [expanded, setExpanded] = useState<Set<string>>(new Set(DRE_SECOES_EXPANDIVEIS));
    const [drilldown, setDrilldown] = useState<DREDrilldownContext | null>(null);
    const [drilldownTitulo, setDrilldownTitulo] = useState('');

    const empresaNomePorId = useMemo(() => {
        const map = new Map<string, string>();
        empresasDoGrupo.forEach((e) => map.set(e.id, e.nome));
        return map;
    }, [empresasDoGrupo]);

    const multiUnidade = visaoTodasEmpresasGrupo && empresaIdsScope.length > 1;

    const unidadesOrdenadas = useMemo(() => {
        return empresaIdsScope
            .map((id) => ({
                id,
                nome: empresaNomePorId.get(id) || id,
                dre: drePorUnidade.get(id) || emptyDREData(),
            }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [empresaIdsScope, empresaNomePorId, drePorUnidade]);

    const periodo = useMemo(() => 
        calcularPeriodo(modo, ano, mes, dataInicioCustom, dataFimCustom), 
        [modo, ano, mes, dataInicioCustom, dataFimCustom]
    );

    const toggleSection = (section: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    const expandAll = () => {
        setExpanded(new Set(DRE_SECOES_EXPANDIVEIS));
    };

    const collapseAll = () => {
        setExpanded(new Set());
    };

    const abrirDrilldown = (titulo: string, ctx: DREDrilldownContext) => {
        setDrilldownTitulo(titulo);
        setDrilldown(ctx);
    };

    const abrirDrilldownDespesaGrupo = (titulo: string) => {
        const secao = secaoDespesaPorTituloGrupo(titulo);
        if (!secao) return;
        abrirDrilldown(titulo, { kind: 'despesa', secao });
    };

    const empresaIdsDrilldown = useMemo(() => {
        if (!multiUnidade || abaAtiva === 'consolidado') return empresaIdsScope.length ? empresaIdsScope : [empresaId];
        return [abaAtiva];
    }, [multiUnidade, abaAtiva, empresaIdsScope, empresaId]);

    const recebiveisDrilldown = useMemo(() => {
        const { inicio, fim } = periodo;
        return allRecebiveis.filter(
            (r) => r.data_competencia && r.data_competencia >= inicio && r.data_competencia <= fim
                && empresaIdsDrilldown.includes(r.empresa_id || ''),
        );
    }, [allRecebiveis, periodo, empresaIdsDrilldown]);

    const pagaveisDrilldown = useMemo(() => {
        const { inicio, fim } = periodo;
        return allPagaveis.filter(
            (p) => p.data_baixa && p.data_baixa >= inicio && p.data_baixa <= fim
                && empresaIdsDrilldown.includes(p.empresa_id || ''),
        );
    }, [allPagaveis, periodo, empresaIdsDrilldown]);

    const movimentacoesDrilldown = useMemo(() => {
        const { inicio, fim } = periodo;
        return allMovimentacoes.filter(
            (m) => m.data_competencia && m.data_competencia >= inicio && m.data_competencia <= fim
                && empresaIdsDrilldown.includes(m.empresa_id || ''),
        );
    }, [allMovimentacoes, periodo, empresaIdsDrilldown]);

    const loadDRE = useCallback(async () => {
        setLoading(true);
        try {
            const { inicio, fim } = periodo;
            const idsAlvo = multiUnidade ? empresaIdsScope : [empresaId];

            let queryInicio = inicio;
            let queryFim = fim;

            if (modo !== 'personalizado') {
                queryInicio = `${ano}-01-01`;
                queryFim = `${ano}-12-31`;
            }

            const [recRes, despRes, movRes] = await Promise.all([
                (() => {
                    let q = supabase
                        .from('fin_contas_receber')
                        .select('id, codigo, valor_pago_centavos, tipo_documento, descricao, data_competencia, data_pagamento, status, empresa_id, clientes ( nome )')
                        .in('empresa_id', idsAlvo)
                        .is('deleted_at', null)
                        .in('status', ['pago', 'pago_parcial'])
                        .gte('data_competencia', queryInicio)
                        .lte('data_competencia', queryFim);
                    if (shouldFilterByFilial) q = q.eq('filial_id', filialId);
                    return q;
                })(),
                (() => {
                    let q = supabase
                        .from('fin_contas_pagar_baixas')
                        .select(`
                            id,
                            valor_pago_centavos,
                            empresa_id,
                            data_baixa,
                            fin_contas_pagar!inner (
                                id,
                                codigo,
                                tipo_documento,
                                descricao,
                                fornecedor_nome,
                                plano_conta_id,
                                filial_id,
                                deleted_at,
                                fin_plano_contas ( codigo, nome, tipo )
                            )
                        `)
                        .in('empresa_id', idsAlvo)
                        .eq('estornada', false)
                        .is('fin_contas_pagar.deleted_at', null)
                        .gte('data_baixa', queryInicio)
                        .lte('data_baixa', queryFim);
                    if (shouldFilterByFilial && filialId) {
                        q = q.eq('fin_contas_pagar.filial_id', filialId);
                    }
                    return q;
                })(),
                (() => {
                    let q = supabase
                        .from('fin_movimentacoes')
                        .select('id, tipo, descricao, valor_centavos, data_competencia, empresa_id')
                        .in('empresa_id', idsAlvo)
                        .gte('data_competencia', queryInicio)
                        .lte('data_competencia', queryFim);
                    if (shouldFilterByFilial && filialId) q = q.eq('filial_id', filialId);
                    return q;
                })(),
            ]);

            const recebiveis = ((recRes.data || []) as Array<RawRecebivel & { clientes?: { nome?: string } | { nome?: string }[] | null }>).map((r) => {
                const cli = r.clientes;
                const cliente_nome = Array.isArray(cli) ? cli[0]?.nome : cli?.nome;
                const { clientes: _c, ...rest } = r;
                return { ...rest, cliente_nome: cliente_nome || null };
            });
            const pagaveis = baixasPagarParaRawPagaveis((despRes.data || []) as RawBaixaPagar[]);
            const movimentacoes = (movRes.data || []) as RawMovimentacao[];

            setAllRecebiveis(recebiveis);
            setAllPagaveis(pagaveis);
            setAllMovimentacoes(movimentacoes);

            const recFiltrados = recebiveis.filter(r => r.data_competencia && r.data_competencia >= inicio && r.data_competencia <= fim);
            const pagFiltrados = pagaveis.filter(p => p.data_baixa && p.data_baixa >= inicio && p.data_baixa <= fim);
            const movFiltrados = movimentacoes.filter(m => m.data_competencia && m.data_competencia >= inicio && m.data_competencia <= fim);

            const porEmpresa = new Map<string, DREData>();
            idsAlvo.forEach((id) => {
                const recEmp = recFiltrados.filter((r) => r.empresa_id === id);
                const pagEmp = pagFiltrados.filter((p) => p.empresa_id === id);
                const movEmp = movFiltrados.filter((m) => m.empresa_id === id);
                porEmpresa.set(id, computeDREFromRaw(recEmp, pagEmp, movEmp));
            });

            const consolidado = consolidarDRE([...porEmpresa.values()]);
            setDrePorUnidade(porEmpresa);
            setDreConsolidado(consolidado);
        } catch (err) {
            console.error('[DRE] Erro ao carregar dados:', err);
            setDrePorUnidade(new Map());
            setDreConsolidado(emptyDREData());
        } finally {
            setLoading(false);
        }
    }, [
        empresaId,
        empresaIdsScope,
        multiUnidade,
        periodo,
        shouldFilterByFilial,
        filialId,
        dataRevision,
        dataRevisionEmpresa,
        modo,
        ano,
    ]);

    useEffect(() => {
        loadDRE();
    }, [loadDRE]);

    useEffect(() => {
        if (!multiUnidade) setAbaAtiva('consolidado');
    }, [multiUnidade]);

    const dreAtiva = useMemo(() => {
        if (!multiUnidade) {
            return dreConsolidado || drePorUnidade.get(empresaId) || emptyDREData();
        }
        if (abaAtiva === 'consolidado') {
            return dreConsolidado || emptyDREData();
        }
        return drePorUnidade.get(abaAtiva) || emptyDREData();
    }, [multiUnidade, abaAtiva, dreConsolidado, drePorUnidade, empresaId]);

    const tituloAbaAtiva = useMemo(() => {
        if (!multiUnidade) {
            return empresaNomePorId.get(empresaId) || 'Unidade';
        }
        if (abaAtiva === 'consolidado') return 'Consolidado — Todas as unidades';
        return empresaNomePorId.get(abaAtiva) || 'Unidade';
    }, [multiUnidade, abaAtiva, empresaId, empresaNomePorId]);

    const chartData = useMemo(() => {
        const queryInicio = modo === 'personalizado' ? periodo.inicio : `${ano}-01-01`;
        const queryFim = modo === 'personalizado' ? periodo.fim : `${ano}-12-31`;
        
        if (!queryInicio || !queryFim) return [];
        
        const pontos = obterMesesNoPeriodo(queryInicio, queryFim);
        const idsAlvo = abaAtiva === 'consolidado' 
            ? (multiUnidade ? empresaIdsScope : [empresaId])
            : [abaAtiva];
            
        pontos.forEach((p) => {
            const recMes = allRecebiveis.filter(r => idsAlvo.includes(r.empresa_id || '') && r.data_competencia && r.data_competencia.startsWith(p.mesYm));
            const pagMes = allPagaveis.filter(pPay => idsAlvo.includes(pPay.empresa_id || '') && pPay.data_baixa && pPay.data_baixa.startsWith(p.mesYm));
            const movMes = allMovimentacoes.filter(m => idsAlvo.includes(m.empresa_id || '') && m.data_competencia && m.data_competencia.startsWith(p.mesYm));
            
            const dreMes = computeDREFromRaw(recMes, pagMes, movMes);
            p.receitas = dreMes.receita_bruta;
            p.despesas = dreMes.total_pago;
            p.resultado = dreMes.resultado_liquido;
        });
        
        return pontos;
    }, [modo, ano, periodo, abaAtiva, multiUnidade, empresaIdsScope, empresaId, allRecebiveis, allPagaveis, allMovimentacoes]);

    const exportPDF = () => {
        const d = dreAtiva;
        if (!d) return;
        
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const refValor = d.receita_bruta || 1;
        
        doc.setFillColor(30, 41, 59); // slate-800
        doc.rect(0, 0, 210, 35, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Demonstracao do Resultado do Exercito (DRE)', 14, 15);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(226, 232, 240);
        doc.text(`Periodo: ${periodo.label}`, 14, 23);
        doc.text(`Unidade: ${tituloAbaAtiva}`, 14, 29);
        
        const rows: any[] = [];
        const formatCurrencyBrl = (val: number) => {
            return (val / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        };
        const formatPct = (val: number) => {
            return ((val / refValor) * 100).toFixed(1).replace('.', ',') + '%';
        };
        
        const addRow = (desc: string, val: number, isGroup: boolean, isSubtotal: boolean, isNegative = false) => {
            const v = isNegative ? -Math.abs(val) : val;
            rows.push([
                desc,
                formatCurrencyBrl(v),
                isSubtotal ? '' : formatPct(val),
                isGroup ? 'group' : isSubtotal ? 'subtotal' : 'normal'
            ]);
        };
        
        addRow('RECEITA OPERACIONAL BRUTA', d.receita_bruta, true, false);
        d.detalhes_receitas.forEach(r => addRow(`  ${r.descricao}`, r.valor, false, false));
        addRow('(-) DEDUCOES DA RECEITA', d.deducoes_receita, true, false, true);
        d.detalhes_deducoes.forEach(r => addRow(`  ${r.descricao}`, r.valor, false, false, true));
        addRow('= RECEITA OPERACIONAL LIQUIDA', d.receita_liquida, false, true);
        addRow('(-) CUSTOS DOS SERVICOS PRESTADOS', d.custos_servicos, true, false, true);
        d.detalhes_custos.forEach(r => addRow(`  ${r.descricao}`, r.valor, false, false, true));
        addRow('= LUCRO BRUTO', d.lucro_bruto, false, true);
        addRow('(-) DESPESAS OPERACIONAIS', d.total_despesas_operacionais, true, false, true);
        addRow('  Despesas Administrativas', d.despesas_administrativas, false, false, true);
        addRow('  Despesas com Pessoal', d.despesas_pessoal, false, false, true);
        addRow('  Despesas Comerciais', d.despesas_comerciais, false, false, true);
        addRow('  Despesas Financeiras', d.despesas_financeiras, false, false, true);
        addRow('  Outras Despesas', d.outras_despesas, false, false, true);
        addRow('= RESULTADO OPERACIONAL', d.resultado_operacional, false, true);
        addRow('(+) Outras Receitas', d.outras_receitas, false, false);
        addRow('= RESULTADO ANTES DO IR', d.resultado_antes_ir, false, true);
        addRow('(-) Provisao IR/CSLL', d.provisao_ir, false, false, true);
        addRow('= RESULTADO LIQUIDO DO EXERCICIO', d.resultado_liquido, false, true);
        
        autoTable(doc, {
            startY: 42,
            head: [['Descricao', 'Valor (R$)', '% AV']],
            body: rows.map(r => [r[0], r[1], r[2]]),
            theme: 'plain',
            headStyles: {
                fillColor: [30, 41, 59],
                textColor: [255, 255, 255],
                fontSize: 10,
                fontStyle: 'bold',
                halign: 'left'
            },
            columnStyles: {
                0: { cellWidth: 110 },
                1: { cellWidth: 50, halign: 'right' },
                2: { cellWidth: 30, halign: 'right' }
            },
            didParseCell: function(data) {
                const rowIndex = data.row.index;
                const rowData = rows[rowIndex];
                const type = rowData[3];
                
                if (type === 'group') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fontSize = 9.5;
                    data.cell.styles.fillColor = [241, 245, 249];
                } else if (type === 'subtotal') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fontSize = 10;
                    data.cell.styles.fillColor = [219, 234, 254];
                    if (data.column.index === 1) {
                        data.cell.styles.textColor = [30, 64, 175];
                    }
                }
                
                if (rowIndex === rows.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fontSize = 11;
                    const val = d.resultado_liquido;
                    if (val >= 0) {
                        data.cell.styles.fillColor = [209, 250, 229];
                        data.cell.styles.textColor = [6, 95, 70];
                    } else {
                        data.cell.styles.fillColor = [254, 226, 226];
                        data.cell.styles.textColor = [153, 27, 27];
                    }
                }
            },
            margin: { left: 14, right: 14 },
            styles: {
                fontSize: 9,
                cellPadding: 2.5,
                textColor: [30, 41, 59]
            }
        });
        
        const pageCount = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            const hoje = new Date().toLocaleString('pt-BR');
            doc.text(`Relatorio gerado em: ${hoje}`, 14, 287);
            doc.text(`Pagina ${i} de ${pageCount}`, 196, 287, { align: 'right' });
        }
        
        doc.save(`DRE_${tituloAbaAtiva.replace(/\s+/g, '_')}_${periodo.label.replace(/\s+/g, '_')}.pdf`);
    };

    const exportCSV = () => {
        const d = dreAtiva;
        if (!d) return;
        const ref = d.receita_bruta || 1;
        const lines: string[] = [
            `DRE - ${periodo.label} - ${tituloAbaAtiva}`,
            '',
            'Descrição;Valor;% Receita',
        ];

        const addLine = (desc: string, val: number, neg = false) => {
            const v = neg ? -Math.abs(val) : val;
            const pct = ((val / ref) * 100).toFixed(1) + '%';
            lines.push(`${desc};${(v / 100).toFixed(2).replace('.', ',')};${pct}`);
        };

        addLine('RECEITA OPERACIONAL BRUTA', d.receita_bruta);
        d.detalhes_receitas.forEach(r => addLine(`  ${r.descricao}`, r.valor));
        lines.push('');
        addLine('(-) DEDUÇÕES DA RECEITA', d.deducoes_receita, true);
        lines.push('');
        addLine('= RECEITA OPERACIONAL LÍQUIDA', d.receita_liquida);
        lines.push('');
        addLine('(-) CUSTOS DOS SERVIÇOS PRESTADOS', d.custos_servicos, true);
        d.detalhes_custos.forEach(r => addLine(`  ${r.descricao}`, r.valor, true));
        lines.push('');
        addLine('= LUCRO BRUTO', d.lucro_bruto);
        lines.push('');
        addLine('(-) DESPESAS OPERACIONAIS', d.total_despesas_operacionais, true);
        addLine('  Despesas Administrativas', d.despesas_administrativas, true);
        addLine('  Despesas com Pessoal', d.despesas_pessoal, true);
        addLine('  Despesas Comerciais', d.despesas_comerciais, true);
        addLine('  Despesas Financeiras', d.despesas_financeiras, true);
        addLine('  Outras Despesas', d.outras_despesas, true);
        lines.push('');
        addLine('= RESULTADO OPERACIONAL', d.resultado_operacional);
        addLine('(+) Outras Receitas', d.outras_receitas);
        addLine('= RESULTADO ANTES DO IR', d.resultado_antes_ir);
        addLine('(-) Provisão IR/CSLL', d.provisao_ir, true);
        lines.push('');
        addLine('= RESULTADO LÍQUIDO DO EXERCÍCIO', d.resultado_liquido);

        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DRE_${tituloAbaAtiva.replace(/\s+/g, '_')}_${periodo.label.replace(/\s+/g, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <FinanceiroLoading />;

    const d = dreAtiva;

    const ref = d.receita_bruta || 1;
    const margemBruta = d.receita_bruta ? (d.lucro_bruto / d.receita_bruta) * 100 : 0;
    const margemOperacional = d.receita_bruta ? (d.resultado_operacional / d.receita_bruta) * 100 : 0;
    const margemLiquida = d.receita_bruta ? (d.resultado_liquido / d.receita_bruta) * 100 : 0;
    const pctTotalPago = d.receita_bruta ? (d.total_pago / d.receita_bruta) * 100 : 0;
    const dreGrupo = dreConsolidado || emptyDREData();
    const margemLiquidaGrupo = dreGrupo.receita_bruta
        ? (dreGrupo.resultado_liquido / dreGrupo.receita_bruta) * 100
        : 0;

    const anos = Array.from({ length: 5 }, (_, i) => getAnoAtual() - 2 + i);
    const meses = getMeses(ano);

    return (
        <>
        <div className="space-y-6 print:space-y-4">
            <PageHeader
                title="DRE"
                subtitle={
                    multiUnidade
                        ? `${periodo.label} · Visão consolidada do grupo (${unidadesOrdenadas.length} unidades)`
                        : `${periodo.label} · ${empresaNomePorId.get(empresaId) || 'Unidade'}`
                }
                actionButton={
                    <div className="flex gap-2 print:hidden">
                        <Button variant="outline" size="sm" onClick={collapseAll}>
                            Recolher
                        </Button>
                        <Button variant="outline" size="sm" onClick={expandAll}>
                            Expandir
                        </Button>
                        <Button variant="outline" size="sm" onClick={handlePrint}>
                            <Printer className="h-4 w-4 mr-1.5" />
                            Imprimir
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportCSV}>
                            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                            CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportPDF}>
                            <FileText className="h-4 w-4 mr-1.5" />
                            PDF
                        </Button>
                    </div>
                }
            />

            {/* Filtros */}
            <div className="flex flex-col md:flex-row md:items-end gap-3 bg-white p-4 rounded-lg shadow-sm border print:hidden">
                <div className="w-full md:w-44">
                    <Select value={modo} onChange={(e) => setModo(e.target.value as ModoVisualizacao)}>
                        <option value="mensal">Mensal</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="semestral">Semestral</option>
                        <option value="anual">Anual</option>
                        <option value="personalizado">Período Personalizado</option>
                    </Select>
                </div>
                {modo !== 'personalizado' && (
                    <div className="w-full md:w-32">
                        <Select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                            {anos.map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </Select>
                    </div>
                )}
                {modo !== 'anual' && modo !== 'personalizado' && (
                    <div className="w-full md:w-44">
                        <Select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                            {modo === 'mensal' && meses.map(m => (
                                <option key={m.mes} value={m.mes}>{m.label}</option>
                            ))}
                            {modo === 'trimestral' && [1, 2, 3, 4].map(t => (
                                <option key={t} value={t * 3 - 2}>{t}º Trimestre</option>
                            ))}
                            {modo === 'semestral' && [1, 2].map(s => (
                                <option key={s} value={s === 1 ? 1 : 7}>{s}º Semestre</option>
                            ))}
                        </Select>
                    </div>
                )}
                {modo === 'personalizado' && (
                    <>
                        <div className="w-full md:w-44">
                            <Input
                                type="date"
                                label="Data Inicial"
                                value={dataInicioCustom}
                                onChange={(e) => setDataInicioCustom(e.target.value)}
                            />
                        </div>
                        <div className="w-full md:w-44">
                            <Input
                                type="date"
                                label="Data Final"
                                value={dataFimCustom}
                                onChange={(e) => setDataFimCustom(e.target.value)}
                            />
                        </div>
                    </>
                )}
            </div>

            {multiUnidade && (
                <Card className="overflow-hidden border-indigo-100">
                    <div className="p-4 border-b bg-indigo-900 text-white">
                        <h3 className="font-semibold">Resumo por Unidade — {periodo.label}</h3>
                        <p className="text-xs text-indigo-100 mt-0.5">
                            Comparativo dos principais indicadores para a diretoria
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-indigo-800 text-indigo-50 uppercase text-xs tracking-wider">
                                <tr>
                                    <th className="text-left py-3 px-4 font-semibold">Unidade</th>
                                    <th className="text-right py-3 px-4 font-semibold">Receita Bruta</th>
                                    <th className="text-right py-3 px-4 font-semibold">Lucro Bruto</th>
                                    <th className="text-right py-3 px-4 font-semibold">Res. Operacional</th>
                                    <th className="text-right py-3 px-4 font-semibold">Res. Líquido</th>
                                    <th className="text-right py-3 px-4 font-semibold">Margem Líq.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {unidadesOrdenadas.map((u) => {
                                    const margem = u.dre.receita_bruta
                                        ? (u.dre.resultado_liquido / u.dre.receita_bruta) * 100
                                        : 0;
                                    return (
                                        <tr
                                            key={u.id}
                                            className={`hover:bg-indigo-50/40 cursor-pointer ${abaAtiva === u.id ? 'bg-indigo-50/70' : ''}`}
                                            onClick={() => setAbaAtiva(u.id)}
                                        >
                                            <td className="py-3 px-4 font-medium text-slate-900">{u.nome}</td>
                                            <td className="py-3 px-4 text-right tabular-nums">{formatCentavos(u.dre.receita_bruta)}</td>
                                            <td className={`py-3 px-4 text-right tabular-nums ${u.dre.lucro_bruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCentavos(u.dre.lucro_bruto)}
                                            </td>
                                            <td className={`py-3 px-4 text-right tabular-nums ${u.dre.resultado_operacional >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCentavos(u.dre.resultado_operacional)}
                                            </td>
                                            <td className={`py-3 px-4 text-right tabular-nums font-semibold ${u.dre.resultado_liquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {formatCentavos(u.dre.resultado_liquido)}
                                            </td>
                                            <td className={`py-3 px-4 text-right tabular-nums text-xs ${margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {formatPercent(margem)}
                                            </td>
                                        </tr>
                                    );
                                })}
                                <tr
                                    className={`bg-indigo-50/80 font-bold hover:bg-indigo-100/60 cursor-pointer ${abaAtiva === 'consolidado' ? 'ring-2 ring-inset ring-indigo-300' : ''}`}
                                    onClick={() => setAbaAtiva('consolidado')}
                                >
                                    <td className="py-3 px-4 text-indigo-950">Consolidado — Todas as unidades</td>
                                    <td className="py-3 px-4 text-right tabular-nums">{formatCentavos(dreGrupo.receita_bruta)}</td>
                                    <td className={`py-3 px-4 text-right tabular-nums ${dreGrupo.lucro_bruto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        {formatCentavos(dreGrupo.lucro_bruto)}
                                    </td>
                                    <td className={`py-3 px-4 text-right tabular-nums ${dreGrupo.resultado_operacional >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        {formatCentavos(dreGrupo.resultado_operacional)}
                                    </td>
                                    <td className={`py-3 px-4 text-right tabular-nums ${dreGrupo.resultado_liquido >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {formatCentavos(dreGrupo.resultado_liquido)}
                                    </td>
                                    <td className={`py-3 px-4 text-right tabular-nums text-xs ${margemLiquidaGrupo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {formatPercent(margemLiquidaGrupo)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {multiUnidade && (
                <div className="flex flex-wrap gap-2 print:hidden">
                    <Button
                        variant="outline"
                        size="sm"
                        className={abaAtiva === 'consolidado' ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : ''}
                        onClick={() => setAbaAtiva('consolidado')}
                    >
                        Consolidado
                    </Button>
                    {unidadesOrdenadas.map((u) => (
                        <Button
                            key={u.id}
                            variant="outline"
                            size="sm"
                            className={abaAtiva === u.id ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : ''}
                            onClick={() => setAbaAtiva(u.id)}
                        >
                            {u.nome}
                        </Button>
                    ))}
                </div>
            )}

            {/* KPI Cards — usa DRE da aba ativa; em multi-unidade, cards refletem seleção */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 print:grid-cols-5 print:gap-2">
                <Card className="p-4 border-l-4 border-l-blue-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Receita Bruta</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-slate-100 mt-1">{formatCentavos(d.receita_bruta)}</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <TrendingUp className="h-5 w-5 text-blue-600" />
                        </div>
                    </div>
                </Card>
                <Card className="p-4 border-l-4 border-l-red-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Pago</p>
                            <p className="text-xl font-bold text-red-600 mt-1">{formatCentavos(d.total_pago)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {d.receita_bruta > 0 ? `${formatPercent(pctTotalPago)} da receita` : 'Contas pagas no período'}
                            </p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                            <TrendingDown className="h-5 w-5 text-red-600" />
                        </div>
                    </div>
                </Card>
                <Card className="p-4 border-l-4 border-l-green-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Lucro Bruto</p>
                            <p className={`text-xl font-bold mt-1 ${d.lucro_bruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCentavos(d.lucro_bruto)}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">Margem: {formatPercent(margemBruta)}</p>
                        </div>
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${d.lucro_bruto >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                            {d.lucro_bruto >= 0
                                ? <ArrowUpRight className="h-5 w-5 text-green-600" />
                                : <ArrowDownRight className="h-5 w-5 text-red-600" />
                            }
                        </div>
                    </div>
                </Card>
                <Card className="p-4 border-l-4 border-l-purple-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resultado Operacional</p>
                            <p className={`text-xl font-bold mt-1 ${d.resultado_operacional >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCentavos(d.resultado_operacional)}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">Margem: {formatPercent(margemOperacional)}</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <BarChart3 className="h-5 w-5 text-purple-600" />
                        </div>
                    </div>
                </Card>
                <Card className={`p-4 border-l-4 ${d.resultado_liquido >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resultado Líquido</p>
                            <p className={`text-xl font-bold mt-1 ${d.resultado_liquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCentavos(d.resultado_liquido)}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">Margem: {formatPercent(margemLiquida)}</p>
                        </div>
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${d.resultado_liquido >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                            <DollarSign className={`h-5 w-5 ${d.resultado_liquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Abas Tabela / Gráfico */}
            <div className="print:hidden mt-4 flex justify-start">
                <div
                    className="inline-flex rounded-xl border border-slate-200 bg-slate-100/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
                    role="tablist"
                    aria-label="Visualização do DRE"
                >
                    {([
                        { id: 'tabela' as const, label: 'Tabela DRE', icon: Table2 },
                        { id: 'grafico' as const, label: 'Gráfico Mensal', icon: BarChart3 },
                    ]).map((tab) => {
                        const Icon = tab.icon;
                        const selected = vista === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => setVista(tab.id)}
                                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                                    selected
                                        ? 'bg-white text-blue-700 shadow-md ring-1 ring-blue-100 dark:bg-slate-800 dark:text-blue-300 dark:ring-blue-900/50'
                                        : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                                }`}
                            >
                                <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-blue-600 dark:text-blue-400' : ''}`} aria-hidden />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tabela DRE */}
            <div className={vista === 'tabela' ? 'block' : 'block print:block hidden'}>
            <Card className="overflow-hidden">
                {multiUnidade && (
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 text-sm font-semibold text-gray-800 dark:text-slate-200">
                        Demonstração detalhada: {tituloAbaAtiva}
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-800 text-white">
                                <th className="text-left py-3 px-4 font-semibold text-sm">Descrição</th>
                                <th className="text-right py-3 px-4 font-semibold text-sm w-44">Valor (R$)</th>
                                <th className="text-right py-3 px-4 font-semibold text-sm w-24">% AV</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {/* === RECEITA OPERACIONAL BRUTA === */}
                            <DRELinhaRow
                                descricao="RECEITA OPERACIONAL BRUTA"
                                valor={d.receita_bruta}
                                receitaRef={ref}
                                nivel={0}
                                tipo="grupo"
                                hasChildren={d.detalhes_receitas.length > 0}
                                qtdDetalhes={d.detalhes_receitas.length}
                                expanded={expanded.has('receitas')}
                                onToggle={() => toggleSection('receitas')}
                            />
                            {expanded.has('receitas') && d.detalhes_receitas.map((r, i) => (
                                <DRELinhaRow
                                    key={`rec-${i}`}
                                    descricao={r.descricao}
                                    valor={r.valor}
                                    receitaRef={ref}
                                    nivel={1}
                                    tipo="detalhe"
                                    onDrilldown={() => abrirDrilldown(r.descricao, { kind: 'receita', categoria: r.descricao })}
                                />
                            ))}

                            {/* === DEDUÇÕES === */}
                            <DRELinhaRow
                                descricao="(-) DEDUÇÕES DA RECEITA"
                                valor={d.deducoes_receita}
                                receitaRef={ref}
                                nivel={0}
                                tipo="grupo"
                                isNegative
                                hasChildren={d.detalhes_deducoes.length > 0}
                                qtdDetalhes={d.detalhes_deducoes.length}
                                expanded={expanded.has('deducoes')}
                                onToggle={() => toggleSection('deducoes')}
                            />
                            {expanded.has('deducoes') && d.detalhes_deducoes.map((r, i) => (
                                <DRELinhaRow
                                    key={`ded-${i}`}
                                    descricao={r.descricao}
                                    valor={r.valor}
                                    receitaRef={ref}
                                    nivel={1}
                                    tipo="detalhe"
                                    isNegative
                                />
                            ))}

                            {/* === RECEITA LÍQUIDA === */}
                            <DRELinhaRow
                                descricao="= RECEITA OPERACIONAL LÍQUIDA"
                                valor={d.receita_liquida}
                                receitaRef={ref}
                                nivel={0}
                                tipo="subtotal"
                            />

                            {/* === CUSTOS DOS SERVIÇOS === */}
                            <DRELinhaRow
                                descricao="(-) CUSTOS DOS SERVIÇOS PRESTADOS"
                                valor={d.custos_servicos}
                                receitaRef={ref}
                                nivel={0}
                                tipo="grupo"
                                isNegative
                                hasChildren={d.detalhes_custos.length > 0}
                                qtdDetalhes={d.detalhes_custos.length}
                                expanded={expanded.has('custos')}
                                onToggle={() => toggleSection('custos')}
                                onDrilldown={d.custos_servicos > 0 ? () => abrirDrilldownDespesaGrupo('(-) CUSTOS DOS SERVIÇOS PRESTADOS') : undefined}
                            />
                            {expanded.has('custos') && d.detalhes_custos.map((r, i) => (
                                <DRELinhaRow
                                    key={`cst-${i}`}
                                    descricao={r.descricao}
                                    valor={r.valor}
                                    receitaRef={ref}
                                    nivel={1}
                                    tipo="detalhe"
                                    isNegative
                                    onDrilldown={() => abrirDrilldown(r.descricao, { kind: 'despesa', secao: 'custos', rotulo: r.descricao })}
                                />
                            ))}

                            {/* === LUCRO BRUTO === */}
                            <DRELinhaRow
                                descricao="= LUCRO BRUTO"
                                valor={d.lucro_bruto}
                                receitaRef={ref}
                                nivel={0}
                                tipo="resultado"
                            />

                            {/* === DESPESAS OPERACIONAIS === */}
                            <tr className="bg-gray-100">
                                <td colSpan={3} className="py-2.5 px-4 font-bold text-sm text-gray-700">
                                    (-) DESPESAS OPERACIONAIS
                                </td>
                            </tr>

                            {/* Administrativas */}
                            <DRELinhaRow
                                descricao="Despesas Administrativas"
                                valor={d.despesas_administrativas}
                                receitaRef={ref}
                                nivel={1}
                                tipo="grupo"
                                isNegative
                                hasChildren={d.detalhes_desp_admin.length > 0}
                                qtdDetalhes={d.detalhes_desp_admin.length}
                                expanded={expanded.has('desp_admin')}
                                onToggle={() => toggleSection('desp_admin')}
                                onDrilldown={d.despesas_administrativas > 0 ? () => abrirDrilldownDespesaGrupo('Despesas Administrativas') : undefined}
                            />
                            {expanded.has('desp_admin') && d.detalhes_desp_admin.map((r, i) => (
                                <DRELinhaRow
                                    key={`da-${i}`}
                                    descricao={r.descricao}
                                    valor={r.valor}
                                    receitaRef={ref}
                                    nivel={2}
                                    tipo="detalhe"
                                    isNegative
                                    onDrilldown={() => abrirDrilldown(r.descricao, { kind: 'despesa', secao: 'desp_admin', rotulo: r.descricao })}
                                />
                            ))}

                            {/* Pessoal */}
                            <DRELinhaRow
                                descricao="Despesas com Pessoal"
                                valor={d.despesas_pessoal}
                                receitaRef={ref}
                                nivel={1}
                                tipo="grupo"
                                isNegative
                                hasChildren={d.detalhes_desp_pessoal.length > 0}
                                qtdDetalhes={d.detalhes_desp_pessoal.length}
                                expanded={expanded.has('desp_pessoal')}
                                onToggle={() => toggleSection('desp_pessoal')}
                                onDrilldown={d.despesas_pessoal > 0 ? () => abrirDrilldownDespesaGrupo('Despesas com Pessoal') : undefined}
                            />
                            {expanded.has('desp_pessoal') && d.detalhes_desp_pessoal.map((r, i) => (
                                <DRELinhaRow
                                    key={`dp-${i}`}
                                    descricao={r.descricao}
                                    valor={r.valor}
                                    receitaRef={ref}
                                    nivel={2}
                                    tipo="detalhe"
                                    isNegative
                                    onDrilldown={() => abrirDrilldown(r.descricao, { kind: 'despesa', secao: 'desp_pessoal', rotulo: r.descricao })}
                                />
                            ))}

                            {/* Comerciais */}
                            <DRELinhaRow
                                descricao="Despesas Comerciais"
                                valor={d.despesas_comerciais}
                                receitaRef={ref}
                                nivel={1}
                                tipo="grupo"
                                isNegative
                                hasChildren={d.detalhes_desp_comerciais.length > 0}
                                qtdDetalhes={d.detalhes_desp_comerciais.length}
                                expanded={expanded.has('desp_comerciais')}
                                onToggle={() => toggleSection('desp_comerciais')}
                                onDrilldown={d.despesas_comerciais > 0 ? () => abrirDrilldownDespesaGrupo('Despesas Comerciais') : undefined}
                            />
                            {expanded.has('desp_comerciais') && d.detalhes_desp_comerciais.map((r, i) => (
                                <DRELinhaRow
                                    key={`dc-${i}`}
                                    descricao={r.descricao}
                                    valor={r.valor}
                                    receitaRef={ref}
                                    nivel={2}
                                    tipo="detalhe"
                                    isNegative
                                    onDrilldown={() => abrirDrilldown(r.descricao, { kind: 'despesa', secao: 'desp_comerciais', rotulo: r.descricao })}
                                />
                            ))}

                            {/* Financeiras */}
                            <DRELinhaRow
                                descricao="Despesas Financeiras"
                                valor={d.despesas_financeiras}
                                receitaRef={ref}
                                nivel={1}
                                tipo="grupo"
                                isNegative
                                hasChildren={d.detalhes_desp_financeiras.length > 0}
                                qtdDetalhes={d.detalhes_desp_financeiras.length}
                                expanded={expanded.has('desp_financeiras')}
                                onToggle={() => toggleSection('desp_financeiras')}
                                onDrilldown={d.despesas_financeiras > 0 ? () => abrirDrilldownDespesaGrupo('Despesas Financeiras') : undefined}
                            />
                            {expanded.has('desp_financeiras') && d.detalhes_desp_financeiras.map((r, i) => (
                                <DRELinhaRow
                                    key={`df-${i}`}
                                    descricao={r.descricao}
                                    valor={r.valor}
                                    receitaRef={ref}
                                    nivel={2}
                                    tipo="detalhe"
                                    isNegative
                                    onDrilldown={() => abrirDrilldown(r.descricao, { kind: 'despesa', secao: 'desp_financeiras', rotulo: r.descricao })}
                                />
                            ))}

                            {/* Outras Despesas */}
                            <DRELinhaRow
                                descricao="Outras Despesas"
                                valor={d.outras_despesas}
                                receitaRef={ref}
                                nivel={1}
                                tipo="grupo"
                                isNegative
                                hasChildren={d.detalhes_outras_despesas.length > 0}
                                qtdDetalhes={d.detalhes_outras_despesas.length}
                                expanded={expanded.has('outras_desp')}
                                onToggle={() => toggleSection('outras_desp')}
                                onDrilldown={d.outras_despesas > 0 ? () => abrirDrilldownDespesaGrupo('Outras Despesas') : undefined}
                            />
                            {expanded.has('outras_desp') && d.detalhes_outras_despesas.map((r, i) => (
                                <DRELinhaRow
                                    key={`od-${i}`}
                                    descricao={r.descricao}
                                    valor={r.valor}
                                    receitaRef={ref}
                                    nivel={2}
                                    tipo="detalhe"
                                    isNegative
                                    onDrilldown={() => abrirDrilldown(r.descricao, { kind: 'despesa', secao: 'outras_desp', rotulo: r.descricao })}
                                />
                            ))}

                            {/* Total Despesas Operacionais */}
                            <DRELinhaRow
                                descricao="= TOTAL DESPESAS OPERACIONAIS"
                                valor={d.total_despesas_operacionais}
                                receitaRef={ref}
                                nivel={0}
                                tipo="subtotal"
                                isNegative
                            />

                            {/* === RESULTADO OPERACIONAL === */}
                            <DRELinhaRow
                                descricao="= RESULTADO OPERACIONAL"
                                valor={d.resultado_operacional}
                                receitaRef={ref}
                                nivel={0}
                                tipo="resultado"
                            />

                            {/* === OUTRAS RECEITAS === */}
                            {d.outras_receitas > 0 && (
                                <>
                                    <DRELinhaRow
                                        descricao="(+) OUTRAS RECEITAS"
                                        valor={d.outras_receitas}
                                        receitaRef={ref}
                                        nivel={0}
                                        tipo="grupo"
                                        hasChildren={d.detalhes_outras_receitas.length > 0}
                                        qtdDetalhes={d.detalhes_outras_receitas.length}
                                        expanded={expanded.has('outras_rec')}
                                        onToggle={() => toggleSection('outras_rec')}
                                    />
                                    {expanded.has('outras_rec') && d.detalhes_outras_receitas.map((r, i) => (
                                        <DRELinhaRow
                                            key={`or-${i}`}
                                            descricao={r.descricao}
                                            valor={r.valor}
                                            receitaRef={ref}
                                            nivel={1}
                                            tipo="detalhe"
                                            onDrilldown={() => abrirDrilldown(r.descricao, { kind: 'outras_receitas', rotulo: r.descricao })}
                                        />
                                    ))}
                                </>
                            )}

                            {/* === RESULTADO ANTES IR === */}
                            <DRELinhaRow
                                descricao="= RESULTADO ANTES DO IR/CSLL"
                                valor={d.resultado_antes_ir}
                                receitaRef={ref}
                                nivel={0}
                                tipo="subtotal"
                            />

                            {/* === PROVISÃO IR === */}
                            {d.provisao_ir > 0 && (
                                <DRELinhaRow
                                    descricao="(-) Provisão IR/CSLL"
                                    valor={d.provisao_ir}
                                    receitaRef={ref}
                                    nivel={0}
                                    tipo="grupo"
                                    isNegative
                                />
                            )}

                            {/* === RESULTADO LÍQUIDO === */}
                            <DRELinhaRow
                                descricao="RESULTADO LÍQUIDO DO EXERCÍCIO"
                                valor={d.resultado_liquido}
                                receitaRef={ref}
                                nivel={0}
                                tipo="total"
                            />
                        </tbody>
                    </table>
                </div>
            </Card>
            </div>

            {/* Gráfico Mensal */}
            <div className={vista === 'grafico' ? 'block print:hidden' : 'hidden'}>
                <Card className="p-6">
                    <h3 className="text-base font-bold text-gray-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-blue-600" />
                        Histórico Mensal de Receitas vs Despesas — {tituloAbaAtiva}
                    </h3>
                    
                    {chartData.length === 0 || chartData.every(c => c.receitas === 0 && c.despesas === 0) ? (
                        <div className="h-72 flex items-center justify-center text-sm text-gray-400 italic">
                            Nenhuma movimentação encontrada para gerar o gráfico no período selecionado.
                        </div>
                    ) : (
                        <div className="w-full overflow-hidden bg-slate-50/50 dark:bg-slate-900/30 p-4 rounded-xl border border-gray-100 dark:border-slate-800/80">
                            <ResponsiveContainer width="100%" height={340}>
                                <ComposedChart data={chartData} margin={{ top: 16, right: 16, left: 16, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
                                    <YAxis 
                                        tick={{ fill: '#64748b', fontSize: 11 }} 
                                        tickFormatter={(v) => `R$ ${(v / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
                                        width={80} 
                                    />
                                    <Tooltip
                                        formatter={(value: number, name: string) => [formatCentavos(value), name]}
                                        contentStyle={{ 
                                            borderRadius: '8px', 
                                            border: '1px solid #e2e8f0', 
                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            backgroundColor: '#ffffff'
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                                    <Bar dataKey="receitas" name="Receita Bruta" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="despesas" name="Total Pago (Despesas)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                    <Line type="monotone" dataKey="resultado" name="Resultado Líquido" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>
            </div>

            {/* Barra de Composição Visual */}
            {d.receita_bruta > 0 && (
                <Card className="p-6 print:p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Composição do Resultado</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                                <span>Custos e Despesas vs Receita</span>
                                <span>{formatPercent(((d.custos_servicos + d.total_despesas_operacionais) / d.receita_bruta) * 100)} consumido</span>
                            </div>
                            <div className="h-6 bg-gray-100 rounded-full overflow-hidden flex">
                                {d.custos_servicos > 0 && (
                                    <div
                                        className="bg-amber-400 h-full transition-all duration-500"
                                        style={{ width: `${Math.min((d.custos_servicos / d.receita_bruta) * 100, 100)}%` }}
                                        title={`Custos: ${formatCentavos(d.custos_servicos)}`}
                                    />
                                )}
                                {d.despesas_pessoal > 0 && (
                                    <div
                                        className="bg-blue-400 h-full transition-all duration-500"
                                        style={{ width: `${Math.min((d.despesas_pessoal / d.receita_bruta) * 100, 100)}%` }}
                                        title={`Pessoal: ${formatCentavos(d.despesas_pessoal)}`}
                                    />
                                )}
                                {d.despesas_administrativas > 0 && (
                                    <div
                                        className="bg-purple-400 h-full transition-all duration-500"
                                        style={{ width: `${Math.min((d.despesas_administrativas / d.receita_bruta) * 100, 100)}%` }}
                                        title={`Administrativas: ${formatCentavos(d.despesas_administrativas)}`}
                                    />
                                )}
                                {d.despesas_comerciais > 0 && (
                                    <div
                                        className="bg-pink-400 h-full transition-all duration-500"
                                        style={{ width: `${Math.min((d.despesas_comerciais / d.receita_bruta) * 100, 100)}%` }}
                                        title={`Comerciais: ${formatCentavos(d.despesas_comerciais)}`}
                                    />
                                )}
                                {d.despesas_financeiras > 0 && (
                                    <div
                                        className="bg-red-400 h-full transition-all duration-500"
                                        style={{ width: `${Math.min((d.despesas_financeiras / d.receita_bruta) * 100, 100)}%` }}
                                        title={`Financeiras: ${formatCentavos(d.despesas_financeiras)}`}
                                    />
                                )}
                                {d.outras_despesas > 0 && (
                                    <div
                                        className="bg-gray-400 h-full transition-all duration-500"
                                        style={{ width: `${Math.min((d.outras_despesas / d.receita_bruta) * 100, 100)}%` }}
                                        title={`Outras: ${formatCentavos(d.outras_despesas)}`}
                                    />
                                )}
                                {d.resultado_liquido > 0 && (
                                    <div
                                        className="bg-green-400 h-full transition-all duration-500"
                                        style={{ width: `${Math.min((d.resultado_liquido / d.receita_bruta) * 100, 100)}%` }}
                                        title={`Lucro: ${formatCentavos(d.resultado_liquido)}`}
                                    />
                                )}
                            </div>
                            <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                                {d.custos_servicos > 0 && (
                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Custos</span>
                                )}
                                {d.despesas_pessoal > 0 && (
                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Pessoal</span>
                                )}
                                {d.despesas_administrativas > 0 && (
                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-400" /> Administrativas</span>
                                )}
                                {d.despesas_comerciais > 0 && (
                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-pink-400" /> Comerciais</span>
                                )}
                                {d.despesas_financeiras > 0 && (
                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Financeiras</span>
                                )}
                                {d.outras_despesas > 0 && (
                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> Outras</span>
                                )}
                                {d.resultado_liquido > 0 && (
                                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-400" /> Lucro</span>
                                )}
                            </div>
                        </div>

                        {/* Indicadores de Margem */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                            <div className="text-center">
                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Margem Bruta</p>
                                <p className={`text-2xl font-bold ${margemBruta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatPercent(margemBruta)}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Margem Operacional</p>
                                <p className={`text-2xl font-bold ${margemOperacional >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatPercent(margemOperacional)}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Margem Líquida</p>
                                <p className={`text-2xl font-bold ${margemLiquida >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {formatPercent(margemLiquida)}
                                </p>
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>

        {drilldown && (
            <DREDrilldownModal
                titulo={drilldownTitulo}
                periodoLabel={periodo.label}
                unidadeLabel={tituloAbaAtiva}
                context={drilldown}
                recebiveis={recebiveisDrilldown}
                pagaveis={pagaveisDrilldown}
                movimentacoes={movimentacoesDrilldown}
                periodo={periodo}
                empresaIds={empresaIdsDrilldown}
                onClose={() => setDrilldown(null)}
            />
        )}
        </>
    );
};

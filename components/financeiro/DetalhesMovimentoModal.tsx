import React, { useEffect, useMemo, useState } from 'react';
import {
    X, ArrowDownCircle, ArrowUpCircle, Plus, Minus, FileText, User, Calendar,
    DollarSign, Hash, Building, CreditCard, Receipt, Clock, Landmark, Tag,
    Printer, Eye, ExternalLink, RotateCcw, CheckCircle2,
} from 'lucide-react';
import { Button } from '../ui/Components';
import { supabase } from '../../lib/supabase';
import { formatCentavos } from '../../lib/FinanceiroStore';
import type { CaixaMovimento } from '../../lib/CaixaStore';

interface DetalhesMovimentoModalProps {
    movimento: CaixaMovimento;
    onClose: () => void;
    onEstornarConciliacao?: () => void;
    onEstornarBaixa?: () => void;
}

interface MovimentoDetalhado {
    usuarioResponsavel?: string | null;
    sessao?: {
        id: string;
        status: string;
        data_abertura: string;
        data_fechamento: string | null;
        conta_bancaria_id: string;
    };
    contaBancaria?: {
        id: string;
        nome: string;
        tipo: string;
        banco_nome?: string | null;
    };
    movFinanceira?: {
        id: string;
        codigo: string;
        descricao: string;
        valor_centavos: number;
        data_movimentacao: string;
        observacoes?: string | null;
        plano_conta_nome?: string | null;
        centro_custo_nome?: string | null;
        usuario_nome?: string | null;
    };
    contaReceber?: {
        id: string;
        codigo: string;
        descricao: string;
        valor_total_centavos: number;
        data_vencimento: string;
        cliente_nome?: string | null;
        cliente_cpf?: string | null;
    };
    contaPagar?: {
        id: string;
        codigo: string;
        descricao: string;
        valor_total_centavos: number;
        data_vencimento: string;
        numero_nota_fiscal?: string | null;
        fornecedor_nome?: string | null;
    };
    formaPagamentoNome?: string | null;
    conciliadoPorNome?: string | null;
}

const tipoConfig: Record<CaixaMovimento['tipo'], { label: string; icon: React.ReactNode; cor: string; bg: string }> = {
    entrada: { label: 'Entrada', icon: <ArrowDownCircle className="h-5 w-5" />, cor: 'text-emerald-700', bg: 'from-emerald-50 to-emerald-100 border-emerald-200' },
    saida: { label: 'Saída', icon: <ArrowUpCircle className="h-5 w-5" />, cor: 'text-red-700', bg: 'from-red-50 to-red-100 border-red-200' },
    sangria: { label: 'Sangria', icon: <Minus className="h-5 w-5" />, cor: 'text-orange-700', bg: 'from-orange-50 to-orange-100 border-orange-200' },
    suprimento: { label: 'Suprimento', icon: <Plus className="h-5 w-5" />, cor: 'text-blue-700', bg: 'from-blue-50 to-blue-100 border-blue-200' },
};

const InfoLine: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }> = ({
    icon, label, value, mono,
}) => (
    <div className="flex items-start gap-3 py-2.5">
        <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            <p className={`text-sm text-gray-900 mt-0.5 break-words ${mono ? 'font-mono' : ''}`}>
                {value || <span className="text-gray-400 italic">—</span>}
            </p>
        </div>
    </div>
);

export const DetalhesMovimentoModal: React.FC<DetalhesMovimentoModalProps> = ({
    movimento, onClose, onEstornarConciliacao, onEstornarBaixa,
}) => {
    const [detalhes, setDetalhes] = useState<MovimentoDetalhado>({});
    const [loading, setLoading] = useState(true);

    const cfg = tipoConfig[movimento.tipo] || tipoConfig.entrada;
    const isNegative = movimento.tipo === 'saida' || movimento.tipo === 'sangria';

    useEffect(() => {
        let cancelled = false;

        const carregar = async () => {
            setLoading(true);
            const acumulador: MovimentoDetalhado = {};

            try {
                // Usuário responsável (preferência: usuario_id direto na movimentação)
                if (movimento.usuario_id && !movimento.usuario_nome) {
                    const { data: u } = await supabase
                        .from('users')
                        .select('nome')
                        .eq('id', movimento.usuario_id)
                        .maybeSingle();
                    if (u && (u as any).nome) {
                        // anexa para uso no render
                        (acumulador as any).usuarioResponsavel = (u as any).nome;
                    }
                } else if (movimento.usuario_nome) {
                    (acumulador as any).usuarioResponsavel = movimento.usuario_nome;
                }

                // Sessão de caixa + conta bancária
                if (movimento.sessao_id) {
                    const { data: sessao } = await supabase
                        .from('fin_caixa_sessoes')
                        .select('id, status, data_abertura, data_fechamento, conta_bancaria_id, usuario_abertura_id')
                        .eq('id', movimento.sessao_id)
                        .maybeSingle();
                    if (sessao) {
                        acumulador.sessao = sessao as any;
                        if (sessao.conta_bancaria_id) {
                            const { data: conta } = await supabase
                                .from('fin_contas_bancarias')
                                .select('id, nome, tipo, banco_nome')
                                .eq('id', sessao.conta_bancaria_id)
                                .maybeSingle();
                            if (conta) acumulador.contaBancaria = conta as any;
                        }
                        // Fallback de usuário responsável: quem abriu o caixa
                        if (!acumulador.usuarioResponsavel && (sessao as any).usuario_abertura_id) {
                            const { data: u } = await supabase
                                .from('users')
                                .select('nome')
                                .eq('id', (sessao as any).usuario_abertura_id)
                                .maybeSingle();
                            if (u && (u as any).nome) {
                                acumulador.usuarioResponsavel = (u as any).nome;
                            }
                        }
                    }
                }

                // Forma de pagamento (apenas formata o que veio em fin_caixa_movimentos)
                acumulador.formaPagamentoNome = movimento.forma_pagamento
                    ? movimento.forma_pagamento.replace(/_/g, ' ')
                    : null;

                if (movimento.conciliado) {
                    acumulador.conciliadoPorNome = movimento.conciliado_por_nome ?? null;
                    if (!acumulador.conciliadoPorNome && movimento.conciliado_por) {
                        const { data: uConc } = await supabase
                            .from('users')
                            .select('nome')
                            .eq('id', movimento.conciliado_por)
                            .maybeSingle();
                        if (uConc && (uConc as { nome?: string }).nome) {
                            acumulador.conciliadoPorNome = (uConc as { nome: string }).nome;
                        }
                    }
                }

                // Movimentação financeira completa (fin_movimentacoes) e referência
                if (movimento.referencia_id && movimento.referencia_tipo) {
                    const colunaRef = movimento.referencia_tipo === 'fin_contas_receber'
                        ? 'conta_receber_id'
                        : movimento.referencia_tipo === 'fin_contas_pagar'
                            ? 'conta_pagar_id'
                            : null;

                    if (colunaRef) {
                        const { data: movFin } = await supabase
                            .from('fin_movimentacoes')
                            .select('id, codigo, descricao, valor_centavos, data_movimentacao, observacoes, plano_conta_id, centro_custo_id, created_by')
                            .eq(colunaRef, movimento.referencia_id)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (movFin) {
                            const m = movFin as any;
                            // Buscas auxiliares em paralelo
                            const [planoRes, centroRes, userRes] = await Promise.all([
                                m.plano_conta_id
                                    ? supabase.from('fin_plano_contas').select('nome').eq('id', m.plano_conta_id).maybeSingle()
                                    : Promise.resolve({ data: null }),
                                m.centro_custo_id
                                    ? supabase.from('fin_centros_custo').select('nome').eq('id', m.centro_custo_id).maybeSingle()
                                    : Promise.resolve({ data: null }),
                                m.created_by
                                    ? supabase.from('users').select('nome').eq('id', m.created_by).maybeSingle()
                                    : Promise.resolve({ data: null }),
                            ]);

                            acumulador.movFinanceira = {
                                id: m.id,
                                codigo: m.codigo,
                                descricao: m.descricao,
                                valor_centavos: m.valor_centavos,
                                data_movimentacao: m.data_movimentacao,
                                observacoes: m.observacoes,
                                plano_conta_nome: (planoRes.data as any)?.nome || null,
                                centro_custo_nome: (centroRes.data as any)?.nome || null,
                                usuario_nome: (userRes.data as any)?.nome || null,
                            };
                        }
                    }

                    // Conta a receber
                    if (movimento.referencia_tipo === 'fin_contas_receber') {
                        const { data: cr } = await supabase
                            .from('fin_contas_receber')
                            .select('id, codigo, descricao, valor_total_centavos, data_vencimento, cliente_id')
                            .eq('id', movimento.referencia_id)
                            .maybeSingle();
                        if (cr) {
                            const c = cr as any;
                            let cliente_nome: string | null = null;
                            let cliente_cpf: string | null = null;
                            if (c.cliente_id) {
                                const { data: cli } = await supabase
                                    .from('clientes')
                                    .select('nome, cpf')
                                    .eq('id', c.cliente_id)
                                    .maybeSingle();
                                cliente_nome = (cli as any)?.nome || null;
                                cliente_cpf = (cli as any)?.cpf || null;
                            }
                            acumulador.contaReceber = {
                                id: c.id,
                                codigo: c.codigo,
                                descricao: c.descricao,
                                valor_total_centavos: c.valor_total_centavos,
                                data_vencimento: c.data_vencimento,
                                cliente_nome,
                                cliente_cpf,
                            };
                        }
                    }

                    // Conta a pagar
                    if (movimento.referencia_tipo === 'fin_contas_pagar') {
                        const { data: cp } = await supabase
                            .from('fin_contas_pagar')
                            .select('id, codigo, descricao, valor_total_centavos, data_vencimento, numero_nota_fiscal, fornecedor_id, fornecedor_nome')
                            .eq('id', movimento.referencia_id)
                            .maybeSingle();
                        if (cp) {
                            const p = cp as any;
                            let fornecedor_nome: string | null = p.fornecedor_nome || null;
                            if (p.fornecedor_id && !fornecedor_nome) {
                                const { data: forn } = await supabase
                                    .from('fornecedores')
                                    .select('nome')
                                    .eq('id', p.fornecedor_id)
                                    .maybeSingle();
                                fornecedor_nome = (forn as any)?.nome || null;
                            }
                            acumulador.contaPagar = {
                                id: p.id,
                                codigo: p.codigo,
                                descricao: p.descricao,
                                valor_total_centavos: p.valor_total_centavos,
                                data_vencimento: p.data_vencimento,
                                numero_nota_fiscal: p.numero_nota_fiscal,
                                fornecedor_nome,
                            };
                        }
                    }
                }
            } catch (err) {
                console.error('[DetalhesMovimentoModal] Erro ao carregar detalhes:', err);
            } finally {
                if (!cancelled) {
                    setDetalhes(acumulador);
                    setLoading(false);
                }
            }
        };

        void carregar();
        return () => {
            cancelled = true;
        };
    }, [movimento]);

    const formatDataBr = (iso?: string | null) => {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        } catch {
            return '';
        }
    };

    const formatDataHoraBr = (iso?: string | null) => {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        } catch {
            return '';
        }
    };

    const tituloOrigem = useMemo(() => {
        if (detalhes.contaReceber) return `Recebimento — ${detalhes.contaReceber.codigo}`;
        if (detalhes.contaPagar) return `Pagamento — ${detalhes.contaPagar.codigo}`;
        return 'Lançamento manual no caixa';
    }, [detalhes]);

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className={`bg-gradient-to-r ${cfg.bg} border-b px-6 py-5`}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className={`h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-sm ${cfg.cor}`}>
                                {cfg.icon}
                            </div>
                            <div className="min-w-0">
                                <p className={`text-xs font-bold uppercase tracking-wider ${cfg.cor}`}>
                                    {cfg.label}
                                </p>
                                <h2 className="text-lg font-bold text-gray-900 truncate">
                                    {movimento.descricao}
                                </h2>
                                <p className="text-xs text-gray-600 mt-0.5">{tituloOrigem}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 hover:bg-white/60 rounded-full transition-colors shrink-0"
                            aria-label="Fechar"
                        >
                            <X className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>

                    <div className="mt-4 flex items-baseline gap-3">
                        <span className={`text-3xl font-bold tabular-nums ${isNegative ? 'text-red-700' : 'text-emerald-700'}`}>
                            {isNegative ? '-' : '+'}{formatCentavos(movimento.valor_centavos)}
                        </span>
                        <span className="text-sm text-gray-500">
                            {formatDataHoraBr(movimento.created_at)}
                        </span>
                    </div>

                    {movimento.conciliado && (
                        <div className="mt-3 inline-flex flex-col gap-0.5 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2 text-xs text-emerald-900">
                            <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wide text-[10px] text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Conciliado
                            </span>
                            <span>
                                Por: {detalhes.conciliadoPorNome || movimento.conciliado_por_nome || '—'}
                            </span>
                            <span>
                                Em: {movimento.conciliado_em ? formatDataHoraBr(movimento.conciliado_em) : '—'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-6">
                    {loading && (
                        <div className="text-center py-8 text-sm text-gray-500">
                            Carregando detalhes...
                        </div>
                    )}

                    {!loading && (
                        <>
                            {/* Origem do lançamento */}
                            {(detalhes.contaReceber || detalhes.contaPagar) && (
                                <section>
                                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                                        <Receipt className="h-3.5 w-3.5" />
                                        Origem do lançamento
                                    </h3>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 divide-y divide-gray-100">
                                        {detalhes.contaReceber && (
                                            <>
                                                <InfoLine
                                                    icon={<Hash className="h-4 w-4" />}
                                                    label="Código do título"
                                                    value={detalhes.contaReceber.codigo}
                                                    mono
                                                />
                                                <InfoLine
                                                    icon={<User className="h-4 w-4" />}
                                                    label="Cliente"
                                                    value={
                                                        <>
                                                            {detalhes.contaReceber.cliente_nome || '—'}
                                                            {detalhes.contaReceber.cliente_cpf && (
                                                                <span className="block text-[11px] text-gray-500 font-mono mt-0.5">
                                                                    CPF: {detalhes.contaReceber.cliente_cpf}
                                                                </span>
                                                            )}
                                                        </>
                                                    }
                                                />
                                                <InfoLine
                                                    icon={<FileText className="h-4 w-4" />}
                                                    label="Descrição"
                                                    value={detalhes.contaReceber.descricao}
                                                />
                                                <InfoLine
                                                    icon={<DollarSign className="h-4 w-4" />}
                                                    label="Valor total do título"
                                                    value={formatCentavos(detalhes.contaReceber.valor_total_centavos)}
                                                />
                                                <InfoLine
                                                    icon={<Calendar className="h-4 w-4" />}
                                                    label="Vencimento"
                                                    value={formatDataBr(detalhes.contaReceber.data_vencimento)}
                                                />
                                            </>
                                        )}

                                        {detalhes.contaPagar && (
                                            <>
                                                <InfoLine
                                                    icon={<Hash className="h-4 w-4" />}
                                                    label="Código do título"
                                                    value={detalhes.contaPagar.codigo}
                                                    mono
                                                />
                                                <InfoLine
                                                    icon={<Building className="h-4 w-4" />}
                                                    label="Fornecedor"
                                                    value={detalhes.contaPagar.fornecedor_nome}
                                                />
                                                <InfoLine
                                                    icon={<FileText className="h-4 w-4" />}
                                                    label="Descrição"
                                                    value={detalhes.contaPagar.descricao}
                                                />
                                                {detalhes.contaPagar.numero_nota_fiscal && (
                                                    <InfoLine
                                                        icon={<Receipt className="h-4 w-4" />}
                                                        label="Nota fiscal"
                                                        value={detalhes.contaPagar.numero_nota_fiscal}
                                                        mono
                                                    />
                                                )}
                                                <InfoLine
                                                    icon={<DollarSign className="h-4 w-4" />}
                                                    label="Valor total do título"
                                                    value={formatCentavos(detalhes.contaPagar.valor_total_centavos)}
                                                />
                                                <InfoLine
                                                    icon={<Calendar className="h-4 w-4" />}
                                                    label="Vencimento"
                                                    value={formatDataBr(detalhes.contaPagar.data_vencimento)}
                                                />
                                            </>
                                        )}
                                    </div>
                                </section>
                            )}

                            {/* Movimento financeiro */}
                            <section>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                                    <DollarSign className="h-3.5 w-3.5" />
                                    Movimentação financeira
                                </h3>
                                <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 divide-y divide-gray-100">
                                    {detalhes.movFinanceira?.codigo && (
                                        <InfoLine
                                            icon={<Hash className="h-4 w-4" />}
                                            label="Código da movimentação"
                                            value={detalhes.movFinanceira.codigo}
                                            mono
                                        />
                                    )}
                                    <InfoLine
                                        icon={<Tag className="h-4 w-4" />}
                                        label="Forma de pagamento"
                                        value={detalhes.formaPagamentoNome || movimento.forma_pagamento || '—'}
                                    />
                                    {detalhes.movFinanceira?.plano_conta_nome && (
                                        <InfoLine
                                            icon={<CreditCard className="h-4 w-4" />}
                                            label="Plano de contas"
                                            value={detalhes.movFinanceira.plano_conta_nome}
                                        />
                                    )}
                                    {detalhes.movFinanceira?.centro_custo_nome && (
                                        <InfoLine
                                            icon={<Landmark className="h-4 w-4" />}
                                            label="Centro de custo"
                                            value={detalhes.movFinanceira.centro_custo_nome}
                                        />
                                    )}
                                    <InfoLine
                                        icon={<Calendar className="h-4 w-4" />}
                                        label="Data da movimentação"
                                        value={formatDataBr(detalhes.movFinanceira?.data_movimentacao || movimento.created_at)}
                                    />
                                    {detalhes.movFinanceira?.observacoes && (
                                        <InfoLine
                                            icon={<FileText className="h-4 w-4" />}
                                            label="Observações"
                                            value={detalhes.movFinanceira.observacoes}
                                        />
                                    )}
                                </div>
                            </section>

                            {/* Caixa e responsável */}
                            <section>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                                    <Eye className="h-3.5 w-3.5" />
                                    Caixa e responsável
                                </h3>
                                <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 divide-y divide-gray-100">
                                    {detalhes.contaBancaria && (
                                        <InfoLine
                                            icon={<Landmark className="h-4 w-4" />}
                                            label="Conta / Caixa"
                                            value={
                                                <>
                                                    {detalhes.contaBancaria.nome}
                                                    <span className="block text-[11px] text-gray-500 mt-0.5 capitalize">
                                                        {detalhes.contaBancaria.tipo}
                                                        {detalhes.contaBancaria.banco_nome && ` • ${detalhes.contaBancaria.banco_nome}`}
                                                    </span>
                                                </>
                                            }
                                        />
                                    )}
                                    <InfoLine
                                        icon={<User className="h-4 w-4" />}
                                        label="Lançado por"
                                        value={
                                            detalhes.usuarioResponsavel
                                            || movimento.usuario_nome
                                            || detalhes.movFinanceira?.usuario_nome
                                            || 'Sistema'
                                        }
                                    />
                                    <InfoLine
                                        icon={<Clock className="h-4 w-4" />}
                                        label="Data e hora do registro"
                                        value={formatDataHoraBr(movimento.created_at)}
                                    />
                                    {movimento.conciliado && (
                                        <InfoLine
                                            icon={<CheckCircle2 className="h-4 w-4" />}
                                            label="Conciliação"
                                            value={
                                                <>
                                                    {detalhes.conciliadoPorNome || movimento.conciliado_por_nome || '—'}
                                                    {movimento.conciliado_em && (
                                                        <span className="block text-[11px] text-gray-500 mt-0.5">
                                                            {formatDataHoraBr(movimento.conciliado_em)}
                                                        </span>
                                                    )}
                                                </>
                                            }
                                        />
                                    )}
                                    {detalhes.sessao && (
                                        <InfoLine
                                            icon={<Receipt className="h-4 w-4" />}
                                            label="Sessão de caixa"
                                            value={
                                                <>
                                                    Aberta em {formatDataHoraBr(detalhes.sessao.data_abertura)}
                                                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                        detalhes.sessao.status === 'aberto'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {detalhes.sessao.status}
                                                    </span>
                                                    {detalhes.sessao.data_fechamento && (
                                                        <span className="block text-[11px] text-gray-500 mt-0.5">
                                                            Fechada em {formatDataHoraBr(detalhes.sessao.data_fechamento)}
                                                        </span>
                                                    )}
                                                </>
                                            }
                                        />
                                    )}
                                </div>
                            </section>

                            {/* Identificação técnica */}
                            <section>
                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                                    Identificação técnica
                                </h3>
                                <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                                    <div>
                                        <p className="text-gray-500 uppercase font-semibold tracking-wide mb-0.5">Movimento (caixa)</p>
                                        <p className="font-mono text-gray-700 break-all">{movimento.id}</p>
                                    </div>
                                    {movimento.referencia_id && (
                                        <div>
                                            <p className="text-gray-500 uppercase font-semibold tracking-wide mb-0.5">
                                                Referência
                                            </p>
                                            <p className="font-mono text-gray-700 break-all">
                                                {movimento.referencia_id}
                                            </p>
                                            {movimento.referencia_tipo && (
                                                <p className="text-gray-400 mt-0.5">{movimento.referencia_tipo}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-gray-50/50 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        {onEstornarConciliacao && movimento.conciliado && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-amber-200 text-amber-800 hover:bg-amber-50"
                                onClick={onEstornarConciliacao}
                            >
                                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                Estornar conciliação
                            </Button>
                        )}
                        {onEstornarBaixa && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                                onClick={onEstornarBaixa}
                            >
                                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                                Estornar baixa
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                    {detalhes.contaReceber && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                window.location.hash = '#/financeiro/contas-receber';
                            }}
                        >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Ver título
                        </Button>
                    )}
                    {detalhes.contaPagar && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                window.location.hash = '#/financeiro/contas-pagar';
                            }}
                        >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Ver título
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.print()}
                    >
                        <Printer className="h-3.5 w-3.5 mr-1.5" />
                        Imprimir
                    </Button>
                    <Button size="sm" onClick={onClose}>
                        Fechar
                    </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

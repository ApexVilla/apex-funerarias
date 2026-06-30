import React, { useCallback, useEffect, useState } from 'react';
import {
    X,
    FileText,
    Calendar,
    DollarSign,
    Tag,
    CreditCard,
    Building,
    Wallet,
    Landmark,
    User,
    Clock,
    Receipt,
    Loader2,
    Printer,
    History,
    FileCheck,
    Coins,
    Sparkles,
} from 'lucide-react';
import { ContaPagar, formatCentavos } from '../../lib/FinanceiroStore';
import { StatusFinanceiroBadge } from './FinanceiroComponents';
import { supabase } from '../../lib/supabase';
import { rotuloFormaPagamento } from '../../lib/caixaFormaPagamento';
import { imprimirReciboContaPagar } from '../../lib/ReciboService';

interface DetalhesContaPagarModalProps {
    conta: ContaPagar;
    onClose: () => void;
}

interface BaixaRow {
    id: string;
    created_at: string;
    data_baixa?: string | null;
    valor_pago_centavos: number;
    valor_desconto_centavos: number;
    valor_juros_centavos: number;
    valor_multa_centavos: number;
    observacoes?: string | null;
    tipo: string;
    forma_pagamento_id?: string | null;
    conta_bancaria_id?: string | null;
    created_by?: string | null;
}

interface CaixaMovRow {
    id: string;
    sessao_id: string;
    tipo: string;
    descricao: string;
    valor_centavos: number;
    forma_pagamento?: string | null;
    usuario_id?: string | null;
    created_at: string;
}

interface MovFinRow {
    id: string;
    codigo: string;
    descricao: string | null;
    valor_centavos: number;
    data_movimentacao: string;
    conta_bancaria_id?: string | null;
    created_at: string;
    created_by?: string | null;
}

async function mapaNomesUsuarios(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (uniq.length === 0) return map;
    const { data } = await supabase.from('users').select('id, nome').in('id', uniq);
    (data ?? []).forEach((u: { id: string; nome: string }) => map.set(u.id, u.nome));
    return map;
}

async function mapaContasBancarias(ids: string[]): Promise<Map<string, { nome: string; codigo: string }>> {
    const map = new Map<string, { nome: string; codigo: string }>();
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (uniq.length === 0) return map;
    const { data } = await supabase.from('fin_contas_bancarias').select('id, nome, codigo').in('id', uniq);
    (data ?? []).forEach((c: { id: string; nome: string; codigo: string }) => map.set(c.id, { nome: c.nome, codigo: c.codigo }));
    return map;
}

async function mapaFormasPagamento(ids: string[]): Promise<Map<string, { nome: string; tipo: string }>> {
    const map = new Map<string, { nome: string; tipo: string }>();
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (uniq.length === 0) return map;
    const { data } = await supabase.from('fin_formas_pagamento').select('id, nome, tipo').in('id', uniq);
    (data ?? []).forEach((f: { id: string; nome: string; tipo: string }) => map.set(f.id, { nome: f.nome, tipo: f.tipo }));
    return map;
}

function formatarDataHora(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}

function labelTipoBaixa(t: string): string {
    if (t === 'parcial') return 'Parcial';
    if (t === 'normal') return 'Integral';
    return t;
}

export const DetalhesContaPagarModal: React.FC<DetalhesContaPagarModalProps> = ({ conta, onClose }) => {
    const [loadingExtra, setLoadingExtra] = useState(true);
    const [erroExtra, setErroExtra] = useState<string | null>(null);
    const [baixas, setBaixas] = useState<BaixaRow[]>([]);
    const [movCaixa, setMovCaixa] = useState<CaixaMovRow[]>([]);
    const [movFin, setMovFin] = useState<MovFinRow[]>([]);
    const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
    const [contaMap, setContaMap] = useState<Map<string, { nome: string; codigo: string }>>(new Map());
    const [formaMap, setFormaMap] = useState<Map<string, { nome: string; tipo: string }>>(new Map());
    const [sessaoPorId, setSessaoPorId] = useState<Map<string, {
        data_abertura: string;
        status: string;
        data_fechamento: string | null;
        conta_bancaria_id: string | null;
    }>>(new Map());

    const [activeTab, setActiveTab] = useState<'geral' | 'pagamentos' | 'auditoria'>('geral');

    const carregar = useCallback(async () => {
        setLoadingExtra(true);
        setErroExtra(null);
        try {
            const [resBaixas, resCaixa, resFin] = await Promise.all([
                supabase
                    .from('fin_contas_pagar_baixas')
                    .select('id, created_at, data_baixa, valor_pago_centavos, valor_desconto_centavos, valor_juros_centavos, valor_multa_centavos, observacoes, tipo, forma_pagamento_id, conta_bancaria_id, created_by')
                    .eq('conta_pagar_id', conta.id)
                    .eq('empresa_id', conta.empresa_id)
                    .order('created_at', { ascending: true }),
                supabase
                    .from('fin_caixa_movimentos')
                    .select('id, sessao_id, tipo, descricao, valor_centavos, forma_pagamento, usuario_id, created_at')
                    .eq('referencia_id', conta.id)
                    .eq('referencia_tipo', 'fin_contas_pagar')
                    .order('created_at', { ascending: true }),
                supabase
                    .from('fin_movimentacoes')
                    .select('id, codigo, descricao, valor_centavos, data_movimentacao, conta_bancaria_id, created_at, created_by')
                    .eq('conta_pagar_id', conta.id)
                    .order('created_at', { ascending: true }),
            ]);

            if (resBaixas.error) throw resBaixas.error;
            if (resCaixa.error) throw resCaixa.error;
            if (resFin.error) throw resFin.error;

            const listaBaixas = (resBaixas.data ?? []) as BaixaRow[];
            const listaCaixa = (resCaixa.data ?? []) as CaixaMovRow[];
            const listaFin = (resFin.data ?? []) as MovFinRow[];

            setBaixas(listaBaixas);
            setMovCaixa(listaCaixa);
            setMovFin(listaFin);

            const userIds: string[] = [];
            listaBaixas.forEach(b => {
                if (b.created_by) userIds.push(b.created_by);
            });
            listaCaixa.forEach(m => {
                if (m.usuario_id) userIds.push(m.usuario_id);
            });
            listaFin.forEach(m => {
                if (m.created_by) userIds.push(m.created_by);
            });

            const contaIds: string[] = [];
            listaBaixas.forEach(b => {
                if (b.conta_bancaria_id) contaIds.push(b.conta_bancaria_id);
            });
            listaFin.forEach(m => {
                if (m.conta_bancaria_id) contaIds.push(m.conta_bancaria_id);
            });

            const formaIds = listaBaixas.map(b => b.forma_pagamento_id).filter(Boolean) as string[];

            const sessaoIds = Array.from(new Set(listaCaixa.map(m => m.sessao_id).filter(Boolean)));
            let sessoes: { id: string; data_abertura: string; status: string; data_fechamento: string | null; conta_bancaria_id: string | null }[] = [];
            if (sessaoIds.length > 0) {
                const { data: sData, error: sErr } = await supabase
                    .from('fin_caixa_sessoes')
                    .select('id, data_abertura, status, data_fechamento, conta_bancaria_id')
                    .in('id', sessaoIds);
                if (sErr) throw sErr;
                sessoes = (sData ?? []) as typeof sessoes;
                sessoes.forEach(s => {
                    if (s.conta_bancaria_id) contaIds.push(s.conta_bancaria_id);
                });
            }

            const [uMap, cMap, fMap] = await Promise.all([
                mapaNomesUsuarios(userIds),
                mapaContasBancarias(contaIds),
                mapaFormasPagamento(formaIds),
            ]);

            const sMap = new Map<string, (typeof sessoes)[0]>();
            sessoes.forEach(s => sMap.set(s.id, s));

            setUserMap(uMap);
            setContaMap(cMap);
            setFormaMap(fMap);
            setSessaoPorId(sMap);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Não foi possível carregar o histórico de baixas e caixa.';
            setErroExtra(msg);
        } finally {
            setLoadingExtra(false);
        }
    }, [conta.id, conta.empresa_id]);

    useEffect(() => {
        void carregar();
    }, [carregar]);

    const handleImprimirReciboBaixa = async (b: BaixaRow) => {
        const forma = b.forma_pagamento_id ? formaMap.get(b.forma_pagamento_id) : null;
        const cb = b.conta_bancaria_id ? contaMap.get(b.conta_bancaria_id) : null;
        await imprimirReciboContaPagar({
            codigo: conta.codigo,
            descricao: conta.descricao,
            tipo_documento: conta.tipo_documento,
            fornecedor_nome: conta.fornecedor_nome,
            numero_nota_fiscal: conta.numero_nota_fiscal,
            data_vencimento: conta.data_vencimento,
            valor_pago_centavos: b.valor_pago_centavos,
            data_pagamento: b.data_baixa?.slice(0, 10) || b.created_at.slice(0, 10),
            situacao: 'quitado',
            forma_pagamento: forma?.nome,
            conta_bancaria: cb?.nome,
        });
    };

    // Calcular o percentual de quitação para a barra de progresso premium
    const percentPago = conta.valor_total_centavos > 0
        ? Math.min(100, Math.round((conta.valor_pago_centavos / conta.valor_total_centavos) * 100))
        : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-md shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header Premium (Dark Gradient Styling) */}
                <div className="relative px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 border-b border-slate-700/80 text-white flex items-center justify-between">
                    <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-amber-500" />
                    
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="p-2.5 bg-slate-800/80 rounded-md border border-slate-700/50 hidden sm:block shadow-inner">
                            <Sparkles className="h-5 w-5 text-amber-400" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5">
                                <span className="text-[9px] font-extrabold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
                                    CONTA A PAGAR
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold font-mono tracking-wider">
                                    {conta.codigo}
                                </span>
                            </div>
                            <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide truncate mt-0.5" title={conta.descricao}>
                                {conta.descricao}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 bg-slate-800/60 hover:bg-slate-700/80 rounded-md transition text-slate-400 hover:text-white border border-slate-700/40 outline-none"
                            aria-label="Fechar"
                        >
                            <X className="h-4.5 w-4.5" />
                        </button>
                    </div>
                </div>

                {/* Tab Navigation (Premium Flat Slate Styling) */}
                <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1.5 shadow-inner">
                    <button
                        onClick={() => setActiveTab('geral')}
                        className={`flex-1 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wider transition duration-150 flex items-center justify-center gap-2 rounded-md outline-none cursor-pointer border ${
                            activeTab === 'geral'
                                ? 'bg-white border-slate-200 text-slate-900 shadow-sm font-black'
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                        }`}
                    >
                        <FileCheck className="h-4 w-4" />
                        Ficha Geral
                    </button>
                    <button
                        onClick={() => setActiveTab('pagamentos')}
                        className={`flex-1 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wider transition duration-150 flex items-center justify-center gap-2 rounded-md outline-none cursor-pointer border ${
                            activeTab === 'pagamentos'
                                ? 'bg-white border-slate-200 text-slate-900 shadow-sm font-black'
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                        }`}
                    >
                        <History className="h-4 w-4" />
                        Pagamentos Realizados ({baixas.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('auditoria')}
                        className={`flex-1 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wider transition duration-150 flex items-center justify-center gap-2 rounded-md outline-none cursor-pointer border ${
                            activeTab === 'auditoria'
                                ? 'bg-white border-slate-200 text-slate-900 shadow-sm font-black'
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                        }`}
                    >
                        <Receipt className="h-4 w-4" />
                        Auditoria & Conciliação
                    </button>
                </div>

                {/* Modal Scrollable Container */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    
                    {/* Tab 1: Geral (High-Fidelity Double Column Layout) */}
                    {activeTab === 'geral' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-150">
                            
                            {/* LEFT COLUMN: IDENTIFICAÇÃO E CLASSIFICAÇÃO */}
                            <div className="lg:col-span-7 space-y-6">
                                <div className="bg-white rounded-md border border-slate-200/80 p-5 shadow-sm space-y-5">
                                    <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-3 flex items-center gap-2">
                                        <div className="w-1.5 h-3.5 bg-slate-900 rounded-sm" />
                                        Identificação do Título
                                    </h4>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="bg-slate-50/60 p-3 rounded-md border border-slate-200/60 flex items-start gap-3">
                                            <Building className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Fornecedor / Favorecido</span>
                                                <span className="text-xs font-bold text-slate-800 break-words mt-0.5 block">{conta.fornecedor_nome || '—'}</span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50/60 p-3 rounded-md border border-slate-200/60 flex items-start gap-3">
                                            <Tag className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Tipo de Despesa</span>
                                                <span className="text-xs font-bold text-slate-800 capitalize mt-0.5 block">{conta.tipo_documento.replace(/_/g, ' ')}</span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50/60 p-3 rounded-md border border-slate-200/60 flex items-start gap-3">
                                            <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Data de Vencimento</span>
                                                <span className="text-xs font-bold text-rose-800 font-mono mt-0.5 block">
                                                    {new Date(conta.data_vencimento + 'T05:00').toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50/60 p-3 rounded-md border border-slate-200/60 flex items-start gap-3">
                                            <Calendar className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Mês de Competência</span>
                                                <span className="text-xs font-semibold text-slate-700 font-mono mt-0.5 block">
                                                    {new Date(conta.data_competencia + 'T05:00').toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center py-2.5 px-4 bg-slate-50 rounded-md border border-slate-200/80 text-xs">
                                        <span className="text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-slate-400" /> Nota Fiscal / Registro
                                        </span>
                                        <span className="font-mono font-bold text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded shadow-sm">
                                            {conta.numero_nota_fiscal || '— N/A —'}
                                        </span>
                                    </div>

                                    {/* Observações Gerais */}
                                    {((conta as any).observacoes || conta.descricao) && (
                                        <div className="pt-2">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Comentários e Detalhes</span>
                                            <div className="text-xs text-slate-650 bg-slate-50 p-3.5 rounded-md border border-slate-250/70 leading-relaxed font-medium">
                                                {(conta as any).observacoes || 'Nenhuma observação cadastrada para este título.'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT COLUMN: VALORES, PROGRESSO DE QUITAÇÃO E BADGES */}
                            <div className="lg:col-span-5 space-y-6">
                                
                                {/* Status Card & Progresso */}
                                <div className="bg-white rounded-md border border-slate-200/80 p-5 shadow-sm space-y-4">
                                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                        <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest">Situação do Título</span>
                                        <StatusFinanceiroBadge status={conta.status} />
                                    </div>

                                    {/* Progresso de Quitação Premium */}
                                    <div className="space-y-2 py-1">
                                        <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                                            <span>Quitação Acumulada</span>
                                            <span className={percentPago === 100 ? 'text-emerald-600 font-bold' : 'text-slate-850'}>{percentPago}%</span>
                                        </div>
                                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    conta.status === 'pago' || conta.status === 'quitado' 
                                                        ? 'bg-emerald-500' 
                                                        : conta.status === 'parcial' 
                                                        ? 'bg-amber-500' 
                                                        : 'bg-rose-500'
                                                }`}
                                                style={{ width: `${percentPago}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Planilha Financeira Estilo Ledger */}
                                <div className="bg-white rounded-md border border-slate-250 p-5 shadow-md space-y-3.5 relative overflow-hidden">
                                    <div className="absolute right-0 top-0 w-24 h-24 bg-slate-50 rounded-full -mr-10 -mt-10 opacity-50 pointer-events-none" />
                                    
                                    <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-3 flex items-center gap-2">
                                        <div className="w-1.5 h-3.5 bg-slate-900 rounded-sm" />
                                        Balanço do Título
                                    </h4>

                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between items-center text-slate-500 font-semibold uppercase tracking-wider">
                                            <span>Valor Original</span>
                                            <span className="font-mono font-bold text-slate-700">{formatCentavos(conta.valor_original_centavos)}</span>
                                        </div>

                                        <div className="flex justify-between items-center text-slate-500 font-semibold uppercase tracking-wider">
                                            <span>Juros & Multas (+)</span>
                                            <span className="font-mono font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px] border border-rose-100">
                                                {formatCentavos(conta.valor_juros_centavos + conta.valor_multa_centavos)}
                                            </span>
                                        </div>

                                        <div className="flex justify-between items-center text-slate-500 font-semibold uppercase tracking-wider">
                                            <span>Descontos (-)</span>
                                            <span className="font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-100">
                                                {formatCentavos(conta.valor_desconto_centavos)}
                                            </span>
                                        </div>

                                        <div className="flex justify-between items-center pt-3 border-t border-slate-150 font-bold text-slate-900">
                                            <span className="uppercase tracking-wide text-[11px]">Valor Consolidado</span>
                                            <span className="font-mono text-sm">{formatCentavos(conta.valor_total_centavos)}</span>
                                        </div>
                                    </div>

                                    {/* Duplo Ledger Card de Saldo */}
                                    <div className="grid grid-cols-2 gap-2.5 pt-4 border-t border-dashed border-slate-200">
                                        <div className="bg-emerald-50/50 p-3 rounded border border-emerald-200/80 flex flex-col">
                                            <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider">Total Pago</span>
                                            <span className="text-sm font-mono font-black text-emerald-700 mt-1">{formatCentavos(conta.valor_pago_centavos)}</span>
                                        </div>
                                        <div className="bg-rose-50/40 p-3 rounded border border-rose-200/80 flex flex-col">
                                            <span className="text-[9px] font-bold text-rose-800 uppercase tracking-wider">Total Aberto</span>
                                            <span className="text-sm font-mono font-black text-rose-700 mt-1">{formatCentavos(conta.valor_aberto_centavos)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab 2: Pagamentos (Modern Receipt Ledger cards) */}
                    {activeTab === 'pagamentos' && (
                        <div className="space-y-5 animate-in fade-in duration-150">
                            {loadingExtra && (
                                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                    <Loader2 className="h-7 w-7 animate-spin text-slate-900" />
                                    <span>Buscando histórico de pagamentos…</span>
                                </div>
                            )}

                            {!loadingExtra && erroExtra && (
                                <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-md text-xs font-semibold">
                                    {erroExtra}
                                </div>
                            )}

                            {!loadingExtra && !erroExtra && baixas.length === 0 && (
                                <div className="text-center py-16 bg-white rounded-md border border-dashed border-slate-200 p-8 shadow-sm">
                                    <Wallet className="h-10 w-10 text-slate-350 mx-auto mb-4" />
                                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Nenhum Pagamento Registrado</h4>
                                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-2">
                                        Este título está aguardando quitação. Assim que baixar a conta, as transações detalhadas aparecerão listadas aqui.
                                    </p>
                                </div>
                            )}

                            {!loadingExtra && !erroExtra && baixas.length > 0 && (
                                <div className="grid grid-cols-1 gap-5">
                                    {baixas.map((b, idx) => {
                                        const forma = b.forma_pagamento_id ? formaMap.get(b.forma_pagamento_id) : null;
                                        const cb = b.conta_bancaria_id ? contaMap.get(b.conta_bancaria_id) : null;
                                        const quem = b.created_by ? userMap.get(b.created_by) : null;
                                        
                                        return (
                                            <div
                                                key={b.id}
                                                className="bg-white rounded-md border border-slate-250 p-6 shadow-sm space-y-5 relative overflow-hidden hover:shadow-md hover:border-slate-300 transition duration-200"
                                            >
                                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                                                
                                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-150 uppercase tracking-widest">
                                                            BAIXA #{idx + 1}
                                                        </span>
                                                        <span className="text-[9px] font-extrabold text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 uppercase tracking-widest">
                                                            {labelTipoBaixa(b.tipo)}
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] text-slate-500 flex items-center gap-1.5 font-bold uppercase tracking-wider bg-slate-50 border border-slate-200 px-2.5 py-1 rounded font-mono">
                                                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                            {b.data_baixa
                                                                ? new Date(`${b.data_baixa.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
                                                                : formatarDataHora(b.created_at)}
                                                        </span>
                                                        
                                                        <button
                                                            onClick={() => handleImprimirReciboBaixa(b)}
                                                            className="h-8 px-3.5 text-[10px] bg-slate-900 hover:bg-slate-800 text-white font-extrabold uppercase tracking-wider rounded transition flex items-center gap-2 outline-none cursor-pointer shadow-sm"
                                                        >
                                                            <Printer className="h-3.5 w-3.5" />
                                                            Gerar Recibo
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-baseline py-1">
                                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Valor Liquidado</span>
                                                    <span className="text-xl font-mono font-black text-emerald-800">{formatCentavos(b.valor_pago_centavos)}</span>
                                                </div>

                                                <div className="grid grid-cols-3 gap-3">
                                                    <div className="bg-slate-50/50 p-2.5 rounded border border-slate-200/80">
                                                        <span className="text-slate-400 block font-extrabold uppercase tracking-wider text-[8px]">Juros (+)</span>
                                                        <span className="font-mono text-xs font-bold text-slate-800 mt-0.5 block">{formatCentavos(b.valor_juros_centavos)}</span>
                                                    </div>
                                                    <div className="bg-slate-50/50 p-2.5 rounded border border-slate-200/80">
                                                        <span className="text-slate-400 block font-extrabold uppercase tracking-wider text-[8px]">Multa (+)</span>
                                                        <span className="font-mono text-xs font-bold text-slate-800 mt-0.5 block">{formatCentavos(b.valor_multa_centavos)}</span>
                                                    </div>
                                                    <div className="bg-slate-50/50 p-2.5 rounded border border-slate-200/80">
                                                        <span className="text-slate-400 block font-extrabold uppercase tracking-wider text-[8px]">Desconto (-)</span>
                                                        <span className="font-mono text-xs font-bold text-emerald-800 mt-0.5 block">{formatCentavos(b.valor_desconto_centavos)}</span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 border-t border-slate-100 pt-4">
                                                    <div className="flex gap-2.5">
                                                        <div className="p-1.5 bg-slate-100 rounded shrink-0 self-start text-slate-500">
                                                            <CreditCard className="h-3.5 w-3.5" />
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[8px] block">Forma de Pagamento</span>
                                                            <p className="font-bold text-slate-900 text-xs mt-0.5">{forma ? `${forma.nome} (${forma.tipo.toUpperCase()})` : '—'}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2.5">
                                                        <div className="p-1.5 bg-slate-100 rounded shrink-0 self-start text-slate-500">
                                                            <Landmark className="h-3.5 w-3.5" />
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[8px] block">Caixa de Liquidação</span>
                                                            <p className="font-bold text-slate-900 text-xs mt-0.5">{cb ? `${cb.nome} · ${cb.codigo}` : '—'}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {(quem || b.observacoes) && (
                                                    <div className="pt-3 border-t border-slate-150/70 flex flex-col gap-2.5 text-xs">
                                                        {quem && (
                                                            <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
                                                                 <User className="h-3.5 w-3.5 text-slate-400" />
                                                                 <span>Efetuado por: <strong className="text-slate-800 font-bold">{quem}</strong></span>
                                                            </div>
                                                        )}
                                                        {b.observacoes && (
                                                            <div className="bg-slate-50 p-3 rounded border border-slate-200 text-slate-700 leading-relaxed font-medium">
                                                                <strong className="text-slate-900 uppercase text-[8px] tracking-widest block mb-1">Notas do Operador</strong>
                                                                {b.observacoes}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 3: Auditoria (Vertical Interactive Timeline Masterpiece) */}
                    {activeTab === 'auditoria' && (
                        <div className="space-y-6 animate-in fade-in duration-150">
                            <div className="p-4 bg-slate-900 text-slate-200 border border-slate-850 rounded-md flex items-start gap-3 shadow-inner">
                                <Receipt className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-100">Linha do Tempo e Conciliação Técnica</h4>
                                    <p className="text-[11px] text-slate-350 leading-relaxed mt-1">
                                        Rastreamento transacional ponta a ponta. Logs técnicos gerados de forma automática em segundo plano para cada movimentação física de caixa e movimentação bancária.
                                    </p>
                                </div>
                            </div>

                            {loadingExtra && (
                                <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                    <Loader2 className="h-7 w-7 animate-spin text-slate-900" />
                                    <span>Reestruturando dados de conciliação…</span>
                                </div>
                            )}

                            {!loadingExtra && erroExtra && (
                                <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-md text-xs font-semibold">
                                    {erroExtra}
                                </div>
                            )}

                            {!loadingExtra && !erroExtra && (
                                <div className="bg-white rounded-md border border-slate-200 p-6 sm:p-8 shadow-sm">
                                    
                                    {/* Timeline Layout */}
                                    <div className="relative border-l-2 border-slate-200 pl-6 ml-3.5 space-y-8 py-2">
                                        
                                        {/* 1. Lançamento do Título (Creation Milestone) */}
                                        <div className="relative">
                                            <div className="absolute -left-[35px] top-0 bg-slate-900 border-2 border-white rounded-md p-1.5 text-white shadow-md">
                                                <FileCheck className="h-3.5 w-3.5 text-amber-400" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between items-center text-[9px] text-slate-400 font-extrabold uppercase tracking-widest font-mono">
                                                    <span>Lançamento do Título</span>
                                                    <span>{formatarDataHora(conta.created_at || new Date().toISOString())}</span>
                                                </div>
                                                <p className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                                                    Registro Original da Despesa
                                                </p>
                                                <p className="text-xs text-slate-600 font-medium">
                                                    Título classificado como despesa de <strong className="text-slate-800">{conta.tipo_documento.replace(/_/g, ' ')}</strong> com valor original de <strong className="text-slate-850 font-bold">{formatCentavos(conta.valor_original_centavos)}</strong>.
                                                </p>
                                            </div>
                                        </div>

                                        {/* 2. Baixas / Pagamentos (Quitações Milestones) */}
                                        {baixas.map((b, idx) => (
                                            <div key={b.id} className="relative animate-in slide-in-from-left-2 duration-200">
                                                <div className="absolute -left-[35px] top-0 bg-emerald-600 border-2 border-white rounded-md p-1.5 text-white shadow-md">
                                                    <Coins className="h-3.5 w-3.5 text-emerald-200" />
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-[9px] text-slate-400 font-extrabold uppercase tracking-widest font-mono">
                                                        <span>Registro de Quitação</span>
                                                        <span>{formatarDataHora(b.created_at)}</span>
                                                    </div>
                                                    <p className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                                                        Baixa #{idx + 1} ({labelTipoBaixa(b.tipo)})
                                                    </p>
                                                    <p className="text-xs text-slate-600 font-medium">
                                                        Pagamento efetuado na importância de <strong className="text-emerald-700 font-bold">{formatCentavos(b.valor_pago_centavos)}</strong>.
                                                    </p>
                                                    
                                                    {b.observacoes && (
                                                        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-2 mt-1">
                                                            Nota: "{b.observacoes}"
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {/* 3. Lançamentos no Caixa Físico (Gavetas Milestones) */}
                                        {movCaixa.map((m, idx) => {
                                            const sess = sessaoPorId.get(m.sessao_id);
                                            const quem = m.usuario_id ? userMap.get(m.usuario_id) : null;
                                            
                                            return (
                                                <div key={m.id} className="relative">
                                                    <div className="absolute -left-[35px] top-0 bg-amber-500 border-2 border-white rounded-md p-1.5 text-white shadow-md">
                                                        <Wallet className="h-3.5 w-3.5 text-amber-100" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-extrabold uppercase tracking-widest font-mono">
                                                            <span>Auditoria de Caixa</span>
                                                            <span>{formatarDataHora(m.created_at)}</span>
                                                        </div>
                                                        <p className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                                                            Movimento de Gaveta #{idx + 1} (Saída)
                                                        </p>
                                                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                                                            Saída de caixa físico no valor de <strong className="text-slate-850 font-bold">{formatCentavos(m.valor_centavos)}</strong>. Lançamento: "{m.descricao}"
                                                        </p>
                                                        
                                                        <div className="bg-slate-50/60 p-2.5 rounded border border-slate-200 text-[10px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1.5 font-bold uppercase tracking-wider">
                                                            <span>Gaveta: <strong className="text-slate-800">{rotuloFormaPagamento(m.forma_pagamento)}</strong></span>
                                                            {quem && <span>Operador: <strong className="text-slate-800">{quem}</strong></span>}
                                                            {sess && <span>Status Sessão: <strong className="text-slate-800">{sess.status}</strong></span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* 4. Movimentações Financeiras / Livro Caixa (Bank Milestones) */}
                                        {movFin.map((mf, idx) => {
                                            const cb = mf.conta_bancaria_id ? contaMap.get(mf.conta_bancaria_id) : null;
                                            const quem = mf.created_by ? userMap.get(mf.created_by) : null;
                                            
                                            return (
                                                <div key={mf.id} className="relative">
                                                    <div className="absolute -left-[35px] top-0 bg-blue-600 border-2 border-white rounded-md p-1.5 text-white shadow-md">
                                                        <Landmark className="h-3.5 w-3.5 text-blue-200" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-extrabold uppercase tracking-widest font-mono">
                                                            <span>Conciliação Bancária</span>
                                                            <span>{formatarDataHora(mf.created_at)}</span>
                                                        </div>
                                                        <p className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                                                            Lançamento no Livro de Contas ({mf.codigo})
                                                        </p>
                                                        {mf.descricao && (
                                                            <p className="text-xs text-slate-600 font-medium">
                                                                Transação bancária: "{mf.descricao}" debitada na importância de <strong className="text-red-700 font-bold">{formatCentavos(mf.valor_centavos)}</strong>.
                                                            </p>
                                                        )}
                                                        
                                                        <div className="bg-slate-50/60 p-2.5 rounded border border-slate-200 text-[10px] text-slate-550 flex flex-wrap gap-x-4 gap-y-1.5 font-bold uppercase tracking-wider">
                                                            <span>Conta: <strong className="text-slate-800">{cb ? `${cb.nome} · ${cb.codigo}` : '—'}</strong></span>
                                                            {quem && <span>Operador: <strong className="text-slate-800">{quem}</strong></span>}
                                                            <span>Data Comp.: {new Date(mf.data_movimentacao + 'T12:00').toLocaleDateString('pt-BR')}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center shadow-inner">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Contas a Pagar &middot; Fênix Administradora</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-10 px-5 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md text-sm transition outline-none cursor-pointer shadow-sm hover:shadow"
                    >
                        Fechar Detalhes
                    </button>
                </div>
            </div>
        </div>
    );
};

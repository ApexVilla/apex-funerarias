import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Clock, ChevronDown, AlertTriangle, CheckCircle2, X, TrendingUp,
    TrendingDown, Wallet, Plus, Minus, RefreshCw, History,
    Banknote, Receipt, ChevronRight, MoreVertical, ArrowDownCircle, ArrowUpCircle,
    DollarSign, Landmark, Lock, Unlock, Printer, Eye, Calendar, RotateCcw, Hand, CheckSquare
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Textarea } from '../../components/ui/Components';
import { useFinanceiro, formatCentavos, type ContaBancaria } from '../../lib/FinanceiroStore';
import { StatCard, FinanceiroLoading } from '../../components/financeiro/FinanceiroComponents';
import { useCaixa, type CaixaSessao, type CaixaMovimento } from '../../lib/CaixaStore';
import { parseValorReaisParaCentavos } from '../../lib/parseValorReais';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { montarPdfCaixaBlob, mensagemErroDesconhecido } from '../../lib/caixaRelatorioPdf';
import { abrirPdfNaJanelaReservada } from '../../lib/printPdfBlob';
import { supabase } from '../../lib/supabase';
import { DetalhesMovimentoModal } from '../../components/financeiro/DetalhesMovimentoModal';
import { ContaBancariaMenuAcoes } from '../../components/financeiro/ContaBancariaMenuAcoes';
import { NovaContaReceberModal } from '../../components/financeiro/NovaContaReceberModal';
import { NovaContaPagarModal } from '../../components/financeiro/NovaContaPagarModal';
import {
    normalizarFormaPagamento,
    rotuloFormaPagamento,
    calcularSaldoFisicoFromMovimentos,
    calcularSaldoSessaoFromMovimentos,
    contaSaldoFinalSomenteEspecie,
    movimentoImpactaSaldoFisicoCaixa,
    acumularRecebimentoResumoTesouraria,
    acumularPagamentoResumoTesouraria,
    coletarDescricoesEntradasEstornadas,
    entradaCaixaJaEstornada,
    movimentoEhSaidaEstornoRecebimento,
    formaMovimentoParaChaveFechamento,
    calcularSistemaPorFormaFechamento,
    contagemFechamentoFromSistema,
    somaSistemaPorFormaFechamento,
    type ChaveFormaFechamento,
} from '../../lib/caixaFormaPagamento';
import {
    movimentoEhBaixaContaReceber,
    resolverContaReceberIdDoMovimentoCaixa,
    usuarioPodeEstornarBaixaReceber,
    usuarioPodeOperarConta,
    usuarioPodeTransferirConta,
    usuarioPodeVerTodosCaixas,
} from '../../lib/finCaixaPermissoes';
import { enriquecerMovimentosCaixaComRecebimento } from '../../lib/finCaixaRecebimentoLabel';
import {
    dataCalendarioSp,
    dataIsoSessao,
    dataMovimentoEfetiva,
    movimentoPertenceSessao,
} from '../../lib/finCaixaSessaoMovimento';

// ==================== TYPES ====================
type ModalType = 'abrir' | 'fechar' | 'sangria' | 'suprimento' | null;

const toUtcBoundary = (dateIso: string, endOfDay = false) => {
    const local = new Date(`${dateIso}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
    return local.toISOString();
};

const formatDateBr = (iso?: string | null) => {
    const cal = dataCalendarioSp(iso);
    if (!cal) return '—';
    const [y, m, d] = cal.split('-');
    return `${d}/${m}/${y}`;
};

/** Botão de expandir/recolher nós da árvore da Tesouraria (unidade, tipo, conta). */
function TesourariaNoExpansao({
    expanded,
    onToggle,
    label,
    size = 'md',
}: {
    expanded: boolean;
    onToggle: (e: React.MouseEvent) => void;
    label: string;
    size?: 'sm' | 'md';
}) {
    const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Recolher ${label}` : `Expandir ${label}`}
            title={expanded ? 'Recolher' : 'Expandir'}
            className={`flex shrink-0 items-center justify-center rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${dim} ${
                expanded
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm ring-2 ring-emerald-200/50'
                    : 'border-slate-300 bg-white text-slate-500 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
        >
            <ChevronDown
                className={`${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
                aria-hidden
            />
        </button>
    );
}

const movimentoEstaConciliado = (mov: CaixaMovimento) => mov.conciliado === true;

const rotuloStatusSessao = (status: string) => {
    if (status === 'aberto') return 'Aberto';
    if (status === 'cancelado') return 'Cancelado';
    return 'Fechado';
};

const classesBadgeDataSessao = (status: string) => {
    if (status === 'aberto') {
        return 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-sm shadow-emerald-100/50';
    }
    if (status === 'cancelado') {
        return 'bg-blue-50 border-blue-400 text-blue-800 shadow-sm shadow-blue-100/50';
    }
    return 'bg-slate-100 border-slate-300 text-slate-600 shadow-sm';
};

async function saldoDisponivelSessaoCaixa(sessaoId: string): Promise<number> {
    const { data: sessao, error: sessaoErr } = await supabase
        .from('fin_caixa_sessoes')
        .select('saldo_abertura_centavos')
        .eq('id', sessaoId)
        .maybeSingle();
    if (sessaoErr) throw sessaoErr;

    const { data: movs, error: movsErr } = await supabase
        .from('fin_caixa_movimentos')
        .select('tipo, valor_centavos')
        .eq('sessao_id', sessaoId);
    if (movsErr) throw movsErr;

    let entradas = 0;
    let saidas = 0;
    let sangrias = 0;
    let suprimentos = 0;
    for (const m of movs ?? []) {
        const v = Number(m.valor_centavos) || 0;
        switch (m.tipo) {
            case 'entrada': entradas += v; break;
            case 'saida': saidas += v; break;
            case 'sangria': sangrias += v; break;
            case 'suprimento': suprimentos += v; break;
            default: break;
        }
    }

    return Number(sessao?.saldo_abertura_centavos ?? 0) + entradas + suprimentos - saidas - sangrias;
}

const iconBadgeDataSessao = (status: string) => {
    if (status === 'aberto') return 'text-emerald-600';
    if (status === 'cancelado') return 'text-blue-600';
    return 'text-slate-500';
};

const classesIndicadorStatusSessao = (status: string) => {
    if (status === 'aberto') return 'text-emerald-600 font-extrabold';
    if (status === 'cancelado') return 'text-blue-600 font-bold';
    return 'text-slate-500 font-bold';
};

const classesPillStatusSessao = (status: string) => {
    if (status === 'aberto') {
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }
    if (status === 'cancelado') {
        return 'bg-blue-50 text-blue-700 border border-blue-200';
    }
    return 'bg-slate-100 text-slate-600 border border-slate-200';
};

const formatDateTimeBr = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const dataIsoLocal = (iso?: string | null) => String(iso || '').slice(0, 10);

const sessaoRelevanteNoPeriodo = (
    sessao: { id: string; data_abertura?: string | null },
    periodoInicio: string,
    periodoFim: string,
    sessaoIdsComMovimento: Set<string>,
) => {
    if (sessaoIdsComMovimento.has(sessao.id)) return true;
    const abertura = dataCalendarioSp(sessao.data_abertura);
    return abertura >= periodoInicio && abertura <= periodoFim;
};

const tipoMovLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    entrada: { label: 'Entrada', color: 'text-green-600 bg-green-50', icon: <ArrowDownCircle className="h-4 w-4" /> },
    saida: { label: 'Saída', color: 'text-red-600 bg-red-50', icon: <ArrowUpCircle className="h-4 w-4" /> },
    sangria: { label: 'Sangria', color: 'text-orange-600 bg-orange-50', icon: <Minus className="h-4 w-4" /> },
    suprimento: { label: 'Suprimento', color: 'text-blue-600 bg-blue-50', icon: <Plus className="h-4 w-4" /> },
};

type TreeTotals = {
    saldoAnterior: number;
    recebimentos: number;
    pagamentos: number;
    transfEntrada: number;
    transfSaida: number;
    saldoFinal: number;
};

const movimentoNoPeriodo = (mov: CaixaMovimento, periodoInicio: string, periodoFim: string) => {
    const data = dataMovimentoEfetiva(mov);
    return data >= periodoInicio && data <= periodoFim;
};

const movimentoAntesDoPeriodo = (mov: CaixaMovimento, periodoInicio: string) =>
    dataMovimentoEfetiva(mov) < periodoInicio;

const calcularDeltaSaldoResumoTesouraria = (movs: CaixaMovimento[]): number => {
    const entradasEstornadas = coletarDescricoesEntradasEstornadas(movs);
    const totais = movs.reduce(
        (acc, m) => {
            acumularRecebimentoResumoTesouraria(acc, m, entradasEstornadas);
            acumularPagamentoResumoTesouraria(acc, m);
            if (m.tipo === 'suprimento') acc.transfEntrada += m.valor_centavos;
            if (m.tipo === 'sangria') acc.transfSaida += m.valor_centavos;
            return acc;
        },
        { recebimentos: 0, pagamentos: 0, transfEntrada: 0, transfSaida: 0 },
    );
    return (
        totais.recebimentos +
        totais.transfEntrada -
        totais.pagamentos -
        totais.transfSaida
    );
};

/** Saldo da conta no início do dia `periodoInicio`, considerando todo o histórico anterior. */
const calcularSaldoAnteriorConta = (
    todasSessoesConta: CaixaSessao[],
    movsAntesPeriodo: CaixaMovimento[],
    periodoInicio: string,
    somenteEspecie = false,
): number => {
    const contaIdPorSessao = new Map(
        todasSessoesConta.map((s) => [s.id, s.conta_bancaria_id]),
    );
    const ordenadas = [...todasSessoesConta].sort((a, b) => {
        const ta = new Date(a.data_abertura).getTime();
        const tb = new Date(b.data_abertura).getTime();
        if (ta !== tb) return ta - tb;
        return (a.id || '').localeCompare(b.id || '');
    });

    let saldoCarry: number | null = null;
    let teveSessaoAntesDoPeriodo = false;

    for (const sessao of ordenadas) {
        const abertura = dataCalendarioSp(sessao.data_abertura);
        if (abertura >= periodoInicio) break;

        teveSessaoAntesDoPeriodo = true;
        const movsSessao = movsAntesPeriodo.filter((m) =>
            movimentoPertenceSessao(m, sessao, contaIdPorSessao),
        );
        const base =
            saldoCarry != null ? saldoCarry : Number(sessao.saldo_abertura_centavos || 0);
        saldoCarry = somenteEspecie
            ? calcularSaldoFisicoFromMovimentos(base, movsSessao)
            : base + calcularDeltaSaldoResumoTesouraria(movsSessao);

        const fechamento = dataCalendarioSp(sessao.data_fechamento);
        if (
            sessao.status !== 'aberto' &&
            fechamento &&
            fechamento < periodoInicio &&
            sessao.saldo_sistema_centavos != null
        ) {
            saldoCarry = Number(sessao.saldo_sistema_centavos);
        }
    }

    if (saldoCarry != null) return saldoCarry;

    if (!teveSessaoAntesDoPeriodo) {
        const primeiraNoPeriodo = ordenadas.find((s) => dataCalendarioSp(s.data_abertura) >= periodoInicio);
        if (primeiraNoPeriodo) {
            return Number(primeiraNoPeriodo.saldo_abertura_centavos || 0);
        }
    }

    return 0;
};

export const Tesouraria: React.FC = () => {
    const { empresa, user } = useAuth();
    const [printingCaixa, setPrintingCaixa] = useState(false);
    const [searchParams] = useSearchParams();
    const contaIdUrl = searchParams.get('contaId') || '';
    const userPermissoes = user?.permissoes as Record<string, unknown> | undefined;
    const verTodosCaixas = usuarioPodeVerTodosCaixas(user?.role, userPermissoes);
    const [menuContaCtx, setMenuContaCtx] = useState<{ id: string; openSession?: CaixaSessao | null } | null>(null);
    const {
        empresasDoGrupo,
        empresaIdsParaFiltro,
        visaoTodasEmpresasGrupo,
        dataRevisionEmpresa,
    } = useEmpresaContextoAtivo();
    const { contasBancarias, loadContasBancarias, loading: finLoading, estornarContaReceber, error: finError } = useFinanceiro();
    const {
        sessaoAtual, movimentos, totaisDia, loading: caixaLoading,
        loadSessaoAtual, abrirCaixa, fecharCaixa, registrarSangria,
        registrarSuprimento, loadSessoes, sessoes, verificarStatusCaixa
    } = useCaixa();

    const loading = finLoading || caixaLoading;

    // Selected caixa account
    const [selectedContaId, setSelectedContaId] = useState('');
    const [modal, setModal] = useState<ModalType>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [periodoInicio, setPeriodoInicio] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    });
    const [periodoFim, setPeriodoFim] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    });
    const [treeMovimentos, setTreeMovimentos] = useState<CaixaMovimento[]>([]);
    const [treeMovimentosAnteriores, setTreeMovimentosAnteriores] = useState<CaixaMovimento[]>([]);
    const [treeAllSessoes, setTreeAllSessoes] = useState<CaixaSessao[]>([]);
    const [treeSessoesDetalhes, setTreeSessoesDetalhes] = useState<CaixaSessao[]>([]);
    const [expandedEmpresas, setExpandedEmpresas] = useState<Set<string>>(new Set());
    const [expandedTipos, setExpandedTipos] = useState<Set<string>>(new Set());
    const [expandedContas, setExpandedContas] = useState<Set<string>>(new Set());

    // Modal form state
    const [modalValor, setModalValor] = useState('');
    const [modalContaDestinoId, setModalContaDestinoId] = useState('');
    const [modalContaOrigemId, setModalContaOrigemId] = useState('');
    const [modalObs, setModalObs] = useState('');
    const [modalDataRef, setModalDataRef] = useState(new Date().toISOString().slice(0, 10));
    const [modalLoading, setModalLoading] = useState(false);
    const [showNovaReceberCaixa, setShowNovaReceberCaixa] = useState(false);
    const [showNovaPagarCaixa, setShowNovaPagarCaixa] = useState(false);
    const [viewingSessaoId, setViewingSessaoId] = useState<string | null>(null);
    const [viewingSessaoInfo, setViewingSessaoInfo] = useState<CaixaSessao | null>(null);
    const [viewingSessoesLista, setViewingSessoesLista] = useState<CaixaSessao[]>([]);
    const [selectedSessoesIds, setSelectedSessoesIds] = useState<Set<string>>(() => new Set());
    const viewingSessoesListaRef = useRef<CaixaSessao[]>([]);
    const sessaoMovimentosLoadSeqRef = useRef(0);
    const [treeReloadToken, setTreeReloadToken] = useState(0);
    const [sessaoMovimentos, setSessaoMovimentos] = useState<CaixaMovimento[]>([]);
    const [sessaoSearch, setSessaoSearch] = useState('');
    const [sessaoTipoFilter, setSessaoTipoFilter] = useState('todos');
    const [sessaoFormaFilter, setSessaoFormaFilter] = useState('todos');
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [loadingSessaoMovs, setLoadingSessaoMovs] = useState(false);
    const [openSessionsMap, setOpenSessionsMap] = useState<Map<string, CaixaSessao>>(new Map());
    const [sessoesAbertas, setSessoesAbertas] = useState<CaixaSessao[]>([]);
    const [fechamentoSessaoAlvo, setFechamentoSessaoAlvo] = useState<CaixaSessao | null>(null);
    const [fechamentoMovimentos, setFechamentoMovimentos] = useState<CaixaMovimento[]>([]);
    const [movimentosPeriodo, setMovimentosPeriodo] = useState<CaixaMovimento[]>([]);
    const [movPeriodoSessaoContaMap, setMovPeriodoSessaoContaMap] = useState<Map<string, string>>(new Map());
    const [loadingMovsPeriodo, setLoadingMovsPeriodo] = useState(false);
    const [activeTab, setActiveTab] = useState<'contas' | 'movimentos' | 'historico'>('contas');
    const [movSearchQuery, setMovSearchQuery] = useState('');
    const [movTipoFilter, setMovTipoFilter] = useState('todos');
    const [movCurrentPage, setMovCurrentPage] = useState(1);
    const [modalError, setModalError] = useState('');
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
    const [movimentoDetalhe, setMovimentoDetalhe] = useState<CaixaMovimento | null>(null);
    const [estornoMovimentoAlvo, setEstornoMovimentoAlvo] = useState<CaixaMovimento | null>(null);
    const [conciliandoMovId, setConciliandoMovId] = useState<string | null>(null);
    const [estornoMotivo, setEstornoMotivo] = useState('');
    const [estornoErro, setEstornoErro] = useState('');
    const [estornoLoading, setEstornoLoading] = useState(false);
    const [contagemFechamento, setContagemFechamento] = useState<Record<string, string>>({
        especie: '',
        cartao_credito: '',
        cartao_debito: '',
        cheque: '',
        pix_outros: '',
    });

    const [quickDropdownEntradaOpen, setQuickDropdownEntradaOpen] = useState(false);
    const [quickDropdownSaidaOpen, setQuickDropdownSaidaOpen] = useState(false);
    const [detailDropdownEntradaOpen, setDetailDropdownEntradaOpen] = useState(false);
    const [detailDropdownSaidaOpen, setDetailDropdownSaidaOpen] = useState(false);

    const enriquecerMovimentosComUsuario = useCallback(async (baseMovs: CaixaMovimento[]) => {
        const userIds = Array.from(new Set(
            baseMovs.flatMap((m) => [m.usuario_id, m.conciliado_por].filter(Boolean)),
        )) as string[];
        if (userIds.length === 0) return baseMovs;

        const { data: users, error } = await supabase
            .from('users')
            .select('id, nome')
            .in('id', userIds);
        if (error) return baseMovs;

        const userMap = new Map<string, string>();
        (users || []).forEach((u: { id: string; nome: string }) => userMap.set(u.id, u.nome));

        return baseMovs.map((m) => ({
            ...m,
            usuario_nome: m.usuario_id ? userMap.get(m.usuario_id) || m.usuario_nome : m.usuario_nome,
            conciliado_por_nome: m.conciliado_por
                ? userMap.get(m.conciliado_por) || m.conciliado_por_nome
                : m.conciliado_por_nome,
        }));
    }, []);

    const enriquecerMovimentosCompletos = useCallback(async (baseMovs: CaixaMovimento[]) => {
        const comUsuario = await enriquecerMovimentosComUsuario(baseMovs);
        return enriquecerMovimentosCaixaComRecebimento(comUsuario);
    }, [enriquecerMovimentosComUsuario]);

    const empresaIdsScope = useMemo(
        () => (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean),
        [empresaIdsParaFiltro],
    );

    const empresaNomePorId = useMemo(() => {
        const map = new Map<string, string>();
        empresasDoGrupo.forEach((e) => map.set(e.id, e.nome));
        if (empresa?.id) map.set(empresa.id, empresa.nome);
        return map;
    }, [empresasDoGrupo, empresa?.id, empresa?.nome]);

    const contaPorId = useMemo(
        () => new Map(contasBancarias.map((c) => [c.id, c])),
        [contasBancarias],
    );

    const contasAtivasPorEmpresa = useMemo(() => {
        const map = new Map<string, ContaBancaria[]>();
        contasBancarias
            .filter((c) => c.ativo)
            .forEach((conta) => {
                const key = conta.empresa_id || 'sem-empresa';
                const list = map.get(key) || [];
                list.push(conta);
                map.set(key, list);
            });
        return [...map.entries()]
            .map(([empresaId, contas]) => ({
                empresaId,
                empresaNome: empresaNomePorId.get(empresaId) || empresaId,
                contas: contas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
            }))
            .sort((a, b) => a.empresaNome.localeCompare(b.empresaNome, 'pt-BR'));
    }, [contasBancarias, empresaNomePorId]);

    const fetchOpenSessions = useCallback(async () => {
        let queryAbertas = supabase
            .from('fin_caixa_sessoes')
            .select('*')
            .eq('status', 'aberto')
            .order('data_abertura', { ascending: true });
        if (empresaIdsScope.length > 0) {
            queryAbertas = queryAbertas.in('empresa_id', empresaIdsScope);
        }
        const { data: sessoes, error: err } = await queryAbertas;
        if (err) return;

        const lista = (sessoes ?? []) as CaixaSessao[];
        setSessoesAbertas(lista);
        const map = new Map<string, CaixaSessao>();
        lista.forEach((s) => {
            const atual = map.get(s.conta_bancaria_id);
            if (!atual || new Date(s.data_abertura).getTime() > new Date(atual.data_abertura).getTime()) {
                map.set(s.conta_bancaria_id, s);
            }
        });
        setOpenSessionsMap(map);
    }, [empresaIdsScope]);

    const sessaoPendenteConferencia = (sessao: CaixaSessao) =>
        sessao.saldo_informado_centavos == null;

    // Load bank accounts and open sessions
    useEffect(() => {
        loadContasBancarias();
        void fetchOpenSessions();
    }, [loadContasBancarias, fetchOpenSessions, dataRevisionEmpresa]);

    const loadMovimentosPeriodo = useCallback(async () => {
        setLoadingMovsPeriodo(true);
        try {
            const inicio = toUtcBoundary(periodoInicio);
            const fim = toUtcBoundary(periodoFim, true);

            let query = supabase
                .from('fin_caixa_movimentos')
                .select('*')
                .gte('data_movimentacao', periodoInicio)
                .lte('data_movimentacao', periodoFim)
                .order('data_movimentacao', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(800);

            if (empresaIdsScope.length > 0) {
                query = query.in('empresa_id', empresaIdsScope);
            }
            const { data, error: err } = await query;

            if (err) throw err;
            const baseMovs = (data ?? []) as CaixaMovimento[];

            const sessaoIds = Array.from(new Set(baseMovs.map((m) => m.sessao_id).filter(Boolean)));
            if (sessaoIds.length > 0) {
                const { data: sessoesInfo } = await supabase
                    .from('fin_caixa_sessoes')
                    .select('id, conta_bancaria_id, data_abertura')
                    .in('id', sessaoIds);
                const map = new Map<string, string>();
                (sessoesInfo || []).forEach((s: { id: string; conta_bancaria_id: string; data_abertura: string }) => {
                    map.set(s.id, s.conta_bancaria_id);
                });
                const movsEnriquecidos = await enriquecerMovimentosCompletos(baseMovs);
                setMovimentosPeriodo(movsEnriquecidos);
                setMovPeriodoSessaoContaMap(map);
            } else {
                setMovimentosPeriodo([]);
                setMovPeriodoSessaoContaMap(new Map());
            }
        } catch (err) {
            console.error('Erro ao carregar movimentos do período:', err);
        } finally {
            setLoadingMovsPeriodo(false);
        }
    }, [enriquecerMovimentosCompletos, empresaIdsScope, periodoInicio, periodoFim]);

    useEffect(() => {
        void loadMovimentosPeriodo();
    }, [loadMovimentosPeriodo, sessaoAtual, movimentos, dataRevisionEmpresa]);

    useEffect(() => {
        const atualizarCaixa = () => {
            if (selectedContaId) void loadSessaoAtual(selectedContaId);
            void loadMovimentosPeriodo();
            void fetchOpenSessions();
            setTreeReloadToken((t) => t + 1);
        };
        window.addEventListener('fin-caixa-updated', atualizarCaixa);
        return () => window.removeEventListener('fin-caixa-updated', atualizarCaixa);
    }, [selectedContaId, loadSessaoAtual, loadMovimentosPeriodo, fetchOpenSessions]);

    const validarPodeOperar = useCallback((contaId?: string): boolean => {
        const id = contaId || selectedContaId;
        const conta = contaPorId.get(id);
        if (!conta) {
            setModalError('Selecione uma conta de caixa.');
            return false;
        }
        if (!usuarioPodeOperarConta(conta, user?.id, verTodosCaixas)) {
            setModalError(
                'Você não está autorizado a operar este caixa. O gestor deve vincular seu usuário em Contas Bancárias → Editar → aba Permissões (Operar), ou liberar «Ver todos os caixas» no seu perfil em Configurações.',
            );
            return false;
        }
        setModalError('');
        return true;
    }, [selectedContaId, contaPorId, user?.id, verTodosCaixas]);

    const validarPodeTransferir = useCallback((contaId?: string): boolean => {
        const id = contaId || selectedContaId;
        const conta = contaPorId.get(id);
        if (!conta) return false;
        if (!usuarioPodeTransferirConta(conta, user?.id, verTodosCaixas)) {
            setModalError('Você não está autorizado a fazer sangria/suprimento nesta conta.');
            return false;
        }
        return true;
    }, [selectedContaId, contaPorId, user?.id, verTodosCaixas]);

    const selecionarConta = useCallback((contaId: string) => {
        setSelectedContaId(contaId);
        setSelectedRowId(contaId);
        setExpandedContas((prev) => new Set(prev).add(contaId));
    }, []);

    const abrirMenuConta = useCallback((
        conta: { id: string; openSession?: CaixaSessao | null },
        event: React.MouseEvent,
    ) => {
        event.preventDefault();
        event.stopPropagation();
        selecionarConta(conta.id);
        setMenuContaCtx(conta);
        setOpenMenuId(conta.id);
        setMenuPosition({ x: event.clientX, y: event.clientY });
    }, [selecionarConta]);

    const fecharMenuConta = useCallback(() => {
        setOpenMenuId(null);
        setMenuPosition(null);
        setMenuContaCtx(null);
    }, []);

    // URL ?contaId= ou primeira conta caixa
    useEffect(() => {
        const ativas = contasBancarias.filter((c) => c.ativo);
        if (ativas.length === 0) {
            if (selectedContaId) setSelectedContaId('');
            return;
        }
        if (contaIdUrl && ativas.some((c) => c.id === contaIdUrl)) {
            if (selectedContaId !== contaIdUrl) setSelectedContaId(contaIdUrl);
            return;
        }
        if (selectedContaId && ativas.some((c) => c.id === selectedContaId)) return;
        const caixa = ativas.find((c) => c.tipo === 'caixa');
        setSelectedContaId(caixa?.id || ativas[0]?.id || '');
    }, [contasBancarias, selectedContaId, contaIdUrl, dataRevisionEmpresa]);

    // Load session when selected account changes
    useEffect(() => {
        if (selectedContaId) {
            loadSessaoAtual(selectedContaId);
        }
    }, [selectedContaId, loadSessaoAtual]);

    const selectedConta = contasBancarias.find(c => c.id === selectedContaId);
    const isOpen =
        !!sessaoAtual &&
        sessaoAtual.conta_bancaria_id === selectedContaId &&
        sessaoAtual.status === 'aberto';
    const permiteSaldoNegativoConta = !!selectedConta?.permite_saldo_negativo;
    const saldoFinalSomenteEspecie = contaSaldoFinalSomenteEspecie(selectedConta?.tipo);

    // System balance calculation
    const saldoSistema = useMemo(() => {
        if (!sessaoAtual) return 0;
        return sessaoAtual.saldo_abertura_centavos +
            totaisDia.entradas + totaisDia.suprimentos -
            totaisDia.saidas - totaisDia.sangrias;
    }, [sessaoAtual, totaisDia]);

    const movimentosFiltrados = useMemo(() => {
        const inicio = new Date(toUtcBoundary(periodoInicio)).getTime();
        const fim = new Date(toUtcBoundary(periodoFim, true)).getTime();
        return movimentos.filter((mov) => {
            const ts = new Date(mov.created_at).getTime();
            return ts >= inicio && ts <= fim;
        });
    }, [movimentos, periodoInicio, periodoFim]);

    const totaisPeriodo = useMemo(() => {
        const entradasEstornadas = coletarDescricoesEntradasEstornadas(movimentosFiltrados);
        return movimentosFiltrados.reduce((acc, m) => {
            const contaEntradaSaida =
                !saldoFinalSomenteEspecie
                || m.tipo === 'suprimento'
                || m.tipo === 'sangria'
                || movimentoImpactaSaldoFisicoCaixa(m);
            if (contaEntradaSaida) {
                acumularRecebimentoResumoTesouraria(acc, m, entradasEstornadas);
                acumularPagamentoResumoTesouraria(acc, m);
            }
            if (m.tipo === 'suprimento') acc.transferenciaEntrada += m.valor_centavos;
            if (m.tipo === 'sangria') acc.transferenciaSaida += m.valor_centavos;
            return acc;
        }, { recebimentos: 0, pagamentos: 0, transferenciaEntrada: 0, transferenciaSaida: 0 });
    }, [movimentosFiltrados, saldoFinalSomenteEspecie]);

    const saldoAnteriorPeriodo = useMemo(() => {
        if (!sessaoAtual) return 0;
        const inicio = new Date(toUtcBoundary(periodoInicio)).getTime();
        const movsAntes = movimentos.filter((mov) => new Date(mov.created_at).getTime() < inicio);
        if (saldoFinalSomenteEspecie) {
            return calcularSaldoFisicoFromMovimentos(sessaoAtual.saldo_abertura_centavos, movsAntes);
        }
        const deltaAntes = movsAntes.reduce((acc, mov) => {
            if (mov.tipo === 'entrada') return acc + mov.valor_centavos;
            if (mov.tipo === 'suprimento') return acc + mov.valor_centavos;
            if (mov.tipo === 'saida') return acc - mov.valor_centavos;
            if (mov.tipo === 'sangria') return acc - mov.valor_centavos;
            return acc;
        }, 0);
        return sessaoAtual.saldo_abertura_centavos + deltaAntes;
    }, [movimentos, periodoInicio, sessaoAtual, saldoFinalSomenteEspecie]);

    const saldoFinalPeriodo = useMemo(() => {
        return saldoAnteriorPeriodo +
            totaisPeriodo.recebimentos +
            totaisPeriodo.transferenciaEntrada -
            totaisPeriodo.pagamentos -
            totaisPeriodo.transferenciaSaida;
    }, [saldoAnteriorPeriodo, totaisPeriodo]);

    const sessaoEmFechamento = fechamentoSessaoAlvo ?? sessaoAtual;
    const movimentosEmFechamento = fechamentoSessaoAlvo ? fechamentoMovimentos : movimentos;

    const sistemaPorForma = useMemo(() => {
        if (!sessaoEmFechamento) {
            return {
                especie: 0,
                cartao_credito: 0,
                cartao_debito: 0,
                cheque: 0,
                pix_outros: 0,
            } satisfies Record<ChaveFormaFechamento, number>;
        }
        return calcularSistemaPorFormaFechamento(
            sessaoEmFechamento.saldo_abertura_centavos,
            movimentosEmFechamento,
        );
    }, [movimentosEmFechamento, sessaoEmFechamento]);

    const saldoAberturaFechamento = Number(sessaoEmFechamento?.saldo_abertura_centavos || 0);

    const saldoFinalSistemaFechamento = useMemo(() => {
        if (saldoFinalSomenteEspecie) {
            return sistemaPorForma.especie;
        }
        return somaSistemaPorFormaFechamento(sistemaPorForma);
    }, [sistemaPorForma, saldoFinalSomenteEspecie]);

    const totalContagemFechamentoCentavos = useMemo(
        () => {
            const total = (Object.values(contagemFechamento) as string[]).reduce((acc, valor) => {
                const parsed = parseFloat(valor || '0') || 0;
                return acc + (permiteSaldoNegativoConta ? parsed : Math.max(0, parsed));
            }, 0);
            return Math.round(total * 100);
        },
        [contagemFechamento, permiteSaldoNegativoConta]
    );

    useEffect(() => {
        if (modal !== 'fechar' || !sessaoEmFechamento) return;
        setContagemFechamento(contagemFechamentoFromSistema(sistemaPorForma, permiteSaldoNegativoConta));
    }, [modal, sistemaPorForma, permiteSaldoNegativoConta, sessaoEmFechamento?.id]);

    const [treeSessaoMap, setTreeSessaoMap] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        const loadTreeData = async () => {
            if (!contasBancarias.length) {
                setTreeMovimentos([]);
                setTreeMovimentosAnteriores([]);
                setTreeAllSessoes([]);
                return;
            }
            const inicioIso = toUtcBoundary(periodoInicio);
            const fimIso = toUtcBoundary(periodoFim, true);
            const contaIds = contasBancarias.filter((c) => c.ativo).map((c) => c.id);

            const { data: sessoesContas, error: sessaoErr } = await supabase
                .from('fin_caixa_sessoes')
                .select('id, conta_bancaria_id, status, data_abertura, data_fechamento, saldo_abertura_centavos, saldo_sistema_centavos, saldo_informado_centavos')
                .in('conta_bancaria_id', contaIds);

            if (sessaoErr) {
                setTreeMovimentos([]);
                return;
            }

            const allSessaoIds = (sessoesContas ?? []).map((s: { id: string }) => s.id);
            if (!allSessaoIds.length) {
                setTreeMovimentos([]);
                setTreeMovimentosAnteriores([]);
                setTreeAllSessoes([]);
                setTreeSessoesDetalhes([]);
                setTreeSessaoMap(new Map());
                return;
            }

            const sessoesAbertas = (sessoesContas ?? []).filter(
                (s: { status?: string }) => s.status === 'aberto',
            );
            const sessoesNoPeriodo = (sessoesContas ?? []).filter(
                (s: { data_abertura?: string | null }) => {
                    const abertura = dataCalendarioSp(s.data_abertura);
                    return abertura >= periodoInicio && abertura <= periodoFim;
                },
            );
            const idsSync = new Set<string>([
                ...sessoesAbertas.map((s: { id: string }) => s.id),
                ...sessoesNoPeriodo.map((s: { id: string }) => s.id),
            ]);
            await Promise.all(
                [...idsSync].map((id) =>
                    supabase.rpc('fin_sync_baixas_caixa_sessao', { p_sessao_id: id }),
                ),
            );

            // Movimentos COM data_movimentacao no período
            const { data: movsComData, error: movErr } = await supabase
                .from('fin_caixa_movimentos')
                .select('*')
                .in('sessao_id', allSessaoIds)
                .gte('data_movimentacao', periodoInicio)
                .lte('data_movimentacao', periodoFim);

            if (movErr) {
                setTreeMovimentos([]);
                return;
            }

            // Movimentos SEM data_movimentacao (sangrias/suprimentos/entradas manuais legados)
            // usa created_at como fallback de data
            const { data: movsSemData } = await supabase
                .from('fin_caixa_movimentos')
                .select('*')
                .in('sessao_id', allSessaoIds)
                .is('data_movimentacao', null)
                .gte('created_at', inicioIso)
                .lte('created_at', fimIso);

            const movsList = [
                ...((movsComData ?? []) as CaixaMovimento[]),
                ...((movsSemData ?? []) as CaixaMovimento[]),
            ];
            setTreeMovimentos(movsList);
            setTreeAllSessoes((sessoesContas ?? []) as CaixaSessao[]);

            const { data: movsAntesComData } = await supabase
                .from('fin_caixa_movimentos')
                .select('*')
                .in('sessao_id', allSessaoIds)
                .lt('data_movimentacao', periodoInicio);

            const { data: movsAntesSemData } = await supabase
                .from('fin_caixa_movimentos')
                .select('*')
                .in('sessao_id', allSessaoIds)
                .is('data_movimentacao', null)
                .lt('created_at', inicioIso);

            const movsAntesList = [
                ...((movsAntesComData ?? []) as CaixaMovimento[]),
                ...((movsAntesSemData ?? []) as CaixaMovimento[]),
            ].filter((m) => movimentoAntesDoPeriodo(m, periodoInicio));
            setTreeMovimentosAnteriores(movsAntesList);

            const sessaoIdsComMov = new Set(movsList.map((m) => m.sessao_id));
            const sessoesRelevantes = (sessoesContas ?? []).filter(
                (s: { id: string; status?: string; data_abertura?: string | null }) =>
                    sessaoRelevanteNoPeriodo(s, periodoInicio, periodoFim, sessaoIdsComMov),
            );

            const map = new Map<string, string>();
            sessoesRelevantes.forEach((s: { id: string; conta_bancaria_id: string }) => {
                map.set(s.id, s.conta_bancaria_id);
            });
            setTreeSessaoMap(map);
            setTreeSessoesDetalhes(sessoesRelevantes as CaixaSessao[]);
        };

        loadTreeData();
    }, [contasBancarias, periodoInicio, periodoFim, movimentos, dataRevisionEmpresa, treeReloadToken]);

    const sessaoContaMap = useMemo(() => {
        const map = new Map<string, string>(treeSessaoMap);
        // Add current session history mapping as fallback
        sessoes.forEach((s) => map.set(s.id, s.conta_bancaria_id));
        return map;
    }, [sessoes, treeSessaoMap]);


    const treeData = useMemo(() => {
        const tipoLabel: Record<string, string> = {
            caixa: 'Contas de Caixa',
            corrente: 'Contas Correntes',
            poupanca: 'Contas de Ahorro',
            investimento: 'Inversão / Outras Cuentas',
            digital: 'Contas Digitais',
            cartao_credito: 'Cartões de Crédito',
        };

        const emptyTotals = (): TreeTotals => ({
            saldoAnterior: 0,
            recebimentos: 0,
            pagamentos: 0,
            transfEntrada: 0,
            transfSaida: 0,
            saldoFinal: 0,
        });

        const sumTotals = (items: TreeTotals[]): TreeTotals =>
            items.reduce(
                (acc, item) => {
                    acc.saldoAnterior += item.saldoAnterior;
                    acc.recebimentos += item.recebimentos;
                    acc.pagamentos += item.pagamentos;
                    acc.transfEntrada += item.transfEntrada;
                    acc.transfSaida += item.transfSaida;
                    acc.saldoFinal += item.saldoFinal;
                    return acc;
                },
                emptyTotals(),
            );

        const contaRows = contasBancarias
            .filter((c) => c.ativo)
            .map((conta) => {
                const todasSessoesConta = treeAllSessoes.filter((s) => s.conta_bancaria_id === conta.id);
                const movsAntesConta = treeMovimentosAnteriores.filter(
                    (m) => todasSessoesConta.some((s) => s.id === m.sessao_id),
                );
                const somenteEspecie = contaSaldoFinalSomenteEspecie(conta.tipo);
                const saldoAnteriorConta = calcularSaldoAnteriorConta(
                    todasSessoesConta,
                    movsAntesConta,
                    periodoInicio,
                    somenteEspecie,
                );

                const sessoesConta = treeSessoesDetalhes
                    .filter((s) => s.conta_bancaria_id === conta.id)
                    .sort((a, b) => {
                        const ta = new Date(a.data_abertura).getTime();
                        const tb = new Date(b.data_abertura).getTime();
                        if (ta !== tb) return ta - tb;
                        return (a.id || '').localeCompare(b.id || '');
                    });

                const contaPorSessaoId = new Map(
                    treeAllSessoes.map((s) => [s.id, s.conta_bancaria_id]),
                );

                const sessoesComTotaisBase = sessoesConta.map((sessao) => {
                    const movsSessao = treeMovimentos.filter((m) =>
                        movimentoPertenceSessao(m, sessao, contaPorSessaoId),
                    );
                    const entradasEstornadas = coletarDescricoesEntradasEstornadas(movsSessao);
                    const totaisSessao = movsSessao.reduce((acc, m) => {
                        acumularRecebimentoResumoTesouraria(acc, m, entradasEstornadas);
                        acumularPagamentoResumoTesouraria(acc, m);
                        if (m.tipo === 'suprimento') acc.transfEntrada += m.valor_centavos;
                        if (m.tipo === 'sangria') acc.transfSaida += m.valor_centavos;
                        return acc;
                    }, { recebimentos: 0, pagamentos: 0, transfEntrada: 0, transfSaida: 0 });

                    const saldoFinalSistemaSessao = somenteEspecie
                        ? calcularSaldoFisicoFromMovimentos(
                            sessao.saldo_abertura_centavos,
                            movsSessao,
                        )
                        : calcularSaldoSessaoFromMovimentos(
                            sessao.saldo_abertura_centavos,
                            movsSessao,
                            false,
                        );

                    const saldoFinalSessao = Number(
                        sessao.saldo_sistema_centavos != null
                            ? sessao.saldo_sistema_centavos
                            : saldoFinalSistemaSessao
                    );

                    return {
                        ...sessao,
                        ...totaisSessao,
                        saldoFinalSessaoSistema: saldoFinalSessao,
                    };
                });

                let ultimoSaldoEncadeado: number | null = null;
                const sessoesComTotais = sessoesComTotaisBase.map((sessao) => {
                    const movsSessao = treeMovimentos.filter((m) =>
                        movimentoPertenceSessao(m, sessao, contaPorSessaoId),
                    );
                    const saldoAberturaCalculado =
                        ultimoSaldoEncadeado != null
                            ? ultimoSaldoEncadeado
                            : saldoAnteriorConta;
                    const saldoFinalCalculado = calcularSaldoSessaoFromMovimentos(
                        saldoAberturaCalculado,
                        movsSessao,
                        somenteEspecie,
                    );
                    ultimoSaldoEncadeado = saldoFinalCalculado;
                    return {
                        ...sessao,
                        saldoAberturaCalculado,
                        saldoFinalCalculado,
                    };
                });

                const totaisConta = sessoesComTotais.reduce((acc, s) => {
                    acc.recebimentos += s.recebimentos;
                    acc.pagamentos += s.pagamentos;
                    acc.transfEntrada += s.transfEntrada;
                    acc.transfSaida += s.transfSaida;
                    return acc;
                }, { recebimentos: 0, pagamentos: 0, transfEntrada: 0, transfSaida: 0 });

                const saldoAnterior = saldoAnteriorConta;
                const saldoFinal = sessoesComTotais.length > 0
                    ? sessoesComTotais[sessoesComTotais.length - 1].saldoFinalCalculado
                    : somenteEspecie
                        ? saldoAnterior
                        : saldoAnterior +
                            totaisConta.recebimentos +
                            totaisConta.transfEntrada -
                            totaisConta.pagamentos -
                            totaisConta.transfSaida;

                const openSession = openSessionsMap.get(conta.id);

                return {
                    id: conta.id,
                    empresaId: conta.empresa_id,
                    nome: `${conta.codigo} — ${conta.nome}`,
                    tipo: conta.tipo,
                    saldoAnterior,
                    recebimentos: totaisConta.recebimentos,
                    pagamentos: totaisConta.pagamentos,
                    transfEntrada: totaisConta.transfEntrada,
                    transfSaida: totaisConta.transfSaida,
                    saldoFinal,
                    openSession,
                    sessoesConta: sessoesComTotais,
                };
            });

        const empresaIds = Array.from(new Set(contaRows.map((c) => c.empresaId).filter(Boolean))).sort((a, b) =>
            (empresaNomePorId.get(a) || a).localeCompare(empresaNomePorId.get(b) || b, 'pt-BR'),
        );

        const empresas = empresaIds.map((empresaId) => {
            const contasEmpresa = contaRows.filter((c) => c.empresaId === empresaId);
            const tipos = Array.from(new Set(contasEmpresa.map((c) => c.tipo)));
            const tiposGrouped = tipos.map((tipo) => {
                const contas = contasEmpresa.filter((c) => c.tipo === tipo);
                return {
                    id: `tipo-${empresaId}-${tipo}`,
                    label: tipoLabel[String(tipo)] ?? String(tipo),
                    contas,
                    ...sumTotals(contas),
                };
            });

            return {
                empresaId,
                empresaNome: empresaNomePorId.get(empresaId) || empresaId,
                tipos: tiposGrouped,
                ...sumTotals(tiposGrouped),
            };
        });

        const consolidado = sumTotals(empresas);

        return {
            multiUnidade: visaoTodasEmpresasGrupo && empresas.length > 1,
            consolidado,
            empresas,
        };
    }, [
        contasBancarias,
        treeMovimentos,
        treeMovimentosAnteriores,
        treeAllSessoes,
        treeSessoesDetalhes,
        empresaNomePorId,
        openSessionsMap,
        visaoTodasEmpresasGrupo,
        periodoInicio,
        periodoFim,
    ]);

    const statsSelected = useMemo(() => {
        if (selectedContaId) {
            const conta = treeData.empresas
                .flatMap((e) => e.tipos)
                .flatMap((t) => t.contas)
                .find((c) => c.id === selectedContaId);
            if (conta) {
                return {
                    saldoAnterior: conta.saldoAnterior,
                    entradas: conta.recebimentos + conta.transfEntrada,
                    saidas: conta.pagamentos + conta.transfSaida,
                    saldoFinal: conta.saldoFinal,
                };
            }
        }
        return {
            saldoAnterior: treeData.consolidado.saldoAnterior,
            entradas: treeData.consolidado.recebimentos + treeData.consolidado.transfEntrada,
            saidas: treeData.consolidado.pagamentos + treeData.consolidado.transfSaida,
            saldoFinal: treeData.consolidado.saldoFinal,
        };
    }, [selectedContaId, treeData]);

    const saldoDiaAtualCentavos = saldoSistema;
    const saldoPeriodoContaCentavos = statsSelected.saldoFinal;
    const saldoCabecalhoCentavos = selectedContaId ? saldoPeriodoContaCentavos : saldoDiaAtualCentavos;
    const saldoCabecalhoDivergeDoDia = selectedContaId
        && isOpen
        && saldoDiaAtualCentavos !== saldoPeriodoContaCentavos;

    useEffect(() => {
        setSelectedSessoesIds(new Set());
    }, [periodoInicio, periodoFim]);

    useEffect(() => {
        if (treeData.empresas.length === 0) return;
        setExpandedEmpresas(new Set(treeData.empresas.map((e) => e.empresaId)));
    }, [treeData.empresas.map((e) => e.empresaId).join('|')]);

    const movimentosPeriodoPorUnidade = useMemo(() => {
        const groups = new Map<string, CaixaMovimento[]>();
        movimentosPeriodo.forEach((mov) => {
            const key = mov.empresa_id || 'sem-empresa';
            const list = groups.get(key) || [];
            list.push(mov);
            groups.set(key, list);
        });
        return [...groups.entries()].sort((a, b) =>
            (empresaNomePorId.get(a[0]) || a[0]).localeCompare(empresaNomePorId.get(b[0]) || b[0], 'pt-BR'),
        );
    }, [movimentosPeriodo, empresaNomePorId]);

    const itemsPerPage = 15;

    const countsPeriodo = useMemo(() => {
        const counts = { todos: movimentosPeriodo.length, entrada: 0, saida: 0, sangria: 0, suprimento: 0 };
        movimentosPeriodo.forEach((m) => {
            if (m.tipo in counts) {
                counts[m.tipo as 'entrada' | 'saida' | 'sangria' | 'suprimento']++;
            }
        });
        return counts;
    }, [movimentosPeriodo]);

    const movimentosFiltradosPeriodo = useMemo(() => {
        return movimentosPeriodo.filter((mov) => {
            const matchTipo = movTipoFilter === 'todos' || mov.tipo === movTipoFilter;
            const matchSearch = !movSearchQuery.trim() || 
                (mov.descricao || '').toLowerCase().includes(movSearchQuery.toLowerCase()) ||
                (mov.usuario_nome || '').toLowerCase().includes(movSearchQuery.toLowerCase()) ||
                (empresaNomePorId.get(mov.empresa_id) || '').toLowerCase().includes(movSearchQuery.toLowerCase());
            return matchTipo && matchSearch;
        });
    }, [movimentosPeriodo, movTipoFilter, movSearchQuery, empresaNomePorId]);

    const totalPages = Math.ceil(movimentosFiltradosPeriodo.length / itemsPerPage);

    const paginatedMovimentos = useMemo(() => {
        const startIndex = (movCurrentPage - 1) * itemsPerPage;
        return movimentosFiltradosPeriodo.slice(startIndex, startIndex + itemsPerPage);
    }, [movimentosFiltradosPeriodo, movCurrentPage]);

    useEffect(() => {
        setMovCurrentPage(1);
    }, [movSearchQuery, movTipoFilter, periodoInicio, periodoFim]);

    const rotuloContaMovimento = useCallback(
        (mov: CaixaMovimento) => {
            const contaId = movPeriodoSessaoContaMap.get(mov.sessao_id);
            const conta = contaId ? contaPorId.get(contaId) : undefined;
            return conta ? `${conta.codigo} — ${conta.nome}` : '—';
        },
        [movPeriodoSessaoContaMap, contaPorId],
    );

    const toggleEmpresa = (id: string) => {
        setExpandedEmpresas((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleTipo = (id: string) => {
        setExpandedTipos((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleConta = (id: string) => {
        setExpandedContas((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const arvoreIds = useMemo(() => {
        const empresaIds: string[] = [];
        const tipoIds: string[] = [];
        const contaIds: string[] = [];
        treeData.empresas.forEach((empresa) => {
            empresaIds.push(empresa.empresaId);
            empresa.tipos.forEach((tipo) => {
                tipoIds.push(tipo.id);
                tipo.contas.forEach((conta) => contaIds.push(conta.id));
            });
        });
        return { empresaIds, tipoIds, contaIds };
    }, [treeData]);

    const expandirArvoreToda = useCallback(() => {
        setExpandedEmpresas(new Set(arvoreIds.empresaIds));
        setExpandedTipos(new Set(arvoreIds.tipoIds));
        setExpandedContas(new Set(arvoreIds.contaIds));
    }, [arvoreIds]);

    const recolherArvoreToda = useCallback(() => {
        setExpandedEmpresas(new Set());
        setExpandedTipos(new Set());
        setExpandedContas(new Set());
    }, []);

    const arvoreTodaExpandida =
        arvoreIds.empresaIds.length > 0
        && arvoreIds.empresaIds.every((id) => expandedEmpresas.has(id))
        && arvoreIds.tipoIds.every((id) => expandedTipos.has(id))
        && arvoreIds.contaIds.every((id) => expandedContas.has(id));

    const arvoreTodaRecolhida =
        expandedEmpresas.size === 0 && expandedTipos.size === 0 && expandedContas.size === 0;

    // ==================== MODAL HANDLERS ====================
    const resetModal = () => {
        setModal(null);
        setModalValor('');
        setModalContaDestinoId('');
        setModalContaOrigemId('');
        setModalObs('');
        setModalError('');
        setModalLoading(false);
        setModalDataRef(new Date().toISOString().slice(0, 10));
        setFechamentoSessaoAlvo(null);
        setFechamentoMovimentos([]);
    };

    const prepararFechamentoSessao = useCallback(async (sessao: CaixaSessao, contaId: string) => {
        if (!validarPodeOperar(contaId)) return;
        setModalError('');
        setFechamentoSessaoAlvo(sessao);
        setSelectedContaId(contaId);
        const conta = contaPorId.get(contaId);
        const permiteNeg = !!conta?.permite_saldo_negativo;

        const { data, error } = await supabase
            .from('fin_caixa_movimentos')
            .select('*')
            .eq('sessao_id', sessao.id)
            .order('created_at', { ascending: false });
        if (error) {
            setModalError('Não foi possível carregar os movimentos desta sessão.');
            setFechamentoSessaoAlvo(null);
            setFechamentoMovimentos([]);
            return;
        }
        const movs = (data ?? []) as CaixaMovimento[];
        setFechamentoMovimentos(movs);
        const sistema = calcularSistemaPorFormaFechamento(sessao.saldo_abertura_centavos, movs);
        setContagemFechamento(contagemFechamentoFromSistema(sistema, permiteNeg));
        setModal('fechar');
    }, [validarPodeOperar, contaPorId]);

    const reabrirSessaoParaConferencia = useCallback(async (sessao: CaixaSessao): Promise<CaixaSessao | null> => {
        if (sessao.status === 'aberto') return sessao;
        if (sessao.saldo_informado_centavos != null) return null;
        const { data, error } = await supabase
            .from('fin_caixa_sessoes')
            .update({
                status: 'aberto',
                data_fechamento: null,
                usuario_fechamento_id: null,
                observacoes_fechamento: null,
            })
            .eq('id', sessao.id)
            .select('*')
            .maybeSingle();
        if (error || !data) return null;
        const reaberta = data as CaixaSessao;
        setTreeSessoesDetalhes((prev) =>
            prev.map((s) => (s.id === sessao.id ? reaberta : s)),
        );
        await fetchOpenSessions();
        setTreeReloadToken((t) => t + 1);
        return reaberta;
    }, [fetchOpenSessions]);

    const reabrirSessaoDia = useCallback(async (sessao: CaixaSessao, contaId: string): Promise<boolean> => {
        if (sessao.status === 'aberto') return true;
        if (!validarPodeOperar(contaId)) return false;

        const outraAberta = sessoesAbertas.find(
            (s) => s.conta_bancaria_id === contaId && s.id !== sessao.id,
        );
        if (outraAberta) {
            setModalError(
                `Já existe outro dia aberto nesta conta (${formatDateBr(outraAberta.data_abertura)}). Feche-o antes de reabrir ${formatDateBr(sessao.data_abertura)}.`,
            );
            return false;
        }

        const diaLabel = formatDateBr(sessao.data_abertura);
        const confirmou = window.confirm(
            sessao.saldo_informado_centavos != null
                ? `Reabrir o dia ${diaLabel}? O fechamento conferido será desfeito para permitir ajustes.`
                : `Reabrir o dia ${diaLabel}?`,
        );
        if (!confirmou) return false;

        const { data, error } = await supabase
            .from('fin_caixa_sessoes')
            .update({
                status: 'aberto',
                data_fechamento: null,
                usuario_fechamento_id: null,
                observacoes_fechamento: null,
                saldo_informado_centavos: null,
                diferenca_centavos: null,
            })
            .eq('id', sessao.id)
            .select('*')
            .maybeSingle();

        if (error || !data) {
            setModalError(`Não foi possível reabrir o dia ${diaLabel}.`);
            return false;
        }

        const reaberta = data as CaixaSessao;

        setTreeSessoesDetalhes((prev) =>
            prev.map((s) => (s.id === sessao.id ? reaberta : s)),
        );
        setSessoesAbertas((prev) => {
            const semConta = prev.filter((s) => s.conta_bancaria_id !== contaId);
            return [...semConta, reaberta];
        });
        setOpenSessionsMap((prev) => {
            const next = new Map(prev);
            next.set(contaId, reaberta);
            return next;
        });

        await fetchOpenSessions();
        setTreeReloadToken((t) => t + 1);
        if (selectedContaId === contaId) await loadSessaoAtual(contaId);
        if (viewingSessaoInfo?.id === sessao.id) setViewingSessaoInfo(reaberta);
        setViewingSessoesLista((prev) =>
            prev.map((s) => (s.id === sessao.id ? reaberta : s)),
        );
        window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
        return true;
    }, [
        validarPodeOperar,
        sessoesAbertas,
        fetchOpenSessions,
        selectedContaId,
        loadSessaoAtual,
        viewingSessaoInfo?.id,
    ]);

    const conferirSessao = useCallback(async (sessao: CaixaSessao, contaId: string) => {
        const alvo = sessao.status === 'aberto' ? sessao : await reabrirSessaoParaConferencia(sessao);
        if (!alvo) {
            setModalError('Esta sessão já foi conferida ou não pode ser reaberta.');
            return;
        }
        await prepararFechamentoSessao(alvo, contaId);
    }, [reabrirSessaoParaConferencia, prepararFechamentoSessao]);

    const garantirCaixaAbertoParaConta = useCallback(async (contaId: string, dataRef?: string): Promise<boolean> => {
        let sessaoId = await verificarStatusCaixa(contaId);
        if (!sessaoId) {
            const dataParaAbrir = dataRef || new Date().toISOString().slice(0, 10);
            const dataFormatada = dataParaAbrir.split('-').reverse().join('/');
            const abrirAgora = window.confirm(`O dia está encerrado. Deseja abrir o dia ${dataFormatada} para continuar o lançamento?`);
            if (!abrirAgora) return false;

            const okAbrir = await abrirCaixa(contaId, undefined, 'Abertura automática via lançamento', dataParaAbrir);
            if (!okAbrir) {
                setModalError('Não foi possível abrir o dia para esta conta.');
                return false;
            }
            sessaoId = await verificarStatusCaixa(contaId);
            if (!sessaoId) {
                setModalError('Dia aberto, mas a sessão ainda não foi identificada. Tente novamente em instantes.');
                return false;
            }
        }
        await loadSessaoAtual(contaId);
        return true;
    }, [verificarStatusCaixa, abrirCaixa, loadSessaoAtual]);

    const handleOpenCaixa = async () => {
        if (!selectedContaId) return;
        setModalLoading(true);
        setModalError('');

        const ok = await abrirCaixa(selectedContaId, undefined, modalObs || undefined, modalDataRef || undefined);
        if (ok) {
            resetModal();
            void fetchOpenSessions();
            if (selectedContaId) void loadSessaoAtual(selectedContaId);
            setTreeReloadToken((t) => t + 1);
        } else {
            setModalError('Erro ao abrir o caixa.');
            setModalLoading(false);
        }
    };

    const handleCloseCaixa = async () => {
        const sessaoId = fechamentoSessaoAlvo?.id ?? sessaoAtual?.id;
        if (!sessaoId) {
            setModalError('Nenhum dia selecionado para fechamento.');
            return;
        }
        setModalLoading(true);
        setModalError('');
        const saldoInformadoFechamento = totalContagemFechamentoCentavos;
        const ok = await fecharCaixa(sessaoId, saldoInformadoFechamento, modalObs || undefined);
        if (ok) {
            resetModal();
            void fetchOpenSessions();
            if (selectedContaId) void loadSessaoAtual(selectedContaId);
            void loadMovimentosPeriodo();
        } else {
            setModalError('Erro ao fechar o dia.');
            setModalLoading(false);
        }
    };

    const handleSangria = async () => {
        if (!selectedContaId) {
            setModalError('Selecione a conta de origem.');
            return;
        }
        const valor = parseValorReaisParaCentavos(modalValor);
        if (valor <= 0) { setModalError('Informe um valor válido.'); return; }
        if (!modalContaDestinoId) { setModalError('Selecione uma conta de destino.'); return; }

        setModalLoading(true);
        setModalError('');

        const okOrigem = await garantirCaixaAbertoParaConta(selectedContaId);
        if (!okOrigem) {
            setModalLoading(false);
            return;
        }

        const sessaoOrigemId = await verificarStatusCaixa(selectedContaId);
        if (!sessaoOrigemId) {
            setModalError('Não foi possível abrir o dia na conta de origem.');
            setModalLoading(false);
            return;
        }

        try {
            const balanceAvailable = await saldoDisponivelSessaoCaixa(sessaoOrigemId);
            if (valor > balanceAvailable && !selectedConta?.permite_saldo_negativo) {
                setModalError(`Saldo insuficiente. O caixa atual possui apenas R$ ${formatCentavos(balanceAvailable).replace('R$', '').trim()} disponíveis e não permite saldo negativo.`);
                setModalLoading(false);
                return;
            }
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'Erro ao verificar saldo do caixa.');
            setModalLoading(false);
            return;
        }

        const contaDestino = contasBancarias.find(c => c.id === modalContaDestinoId);
        if (contaDestino && ['caixa', 'corrente'].includes(contaDestino.tipo)) {
            const sessaoDestinoId = await verificarStatusCaixa(modalContaDestinoId);
            if (!sessaoDestinoId) {
                const shouldOpen = window.confirm(`Atenção: A conta de destino "${contaDestino.nome}" está com o dia encerrado.\n\nPara realizar esta sangria e registrar a entrada no destino, é necessário abrir o dia primeiro.\n\nDeseja abrir o dia e registrar a entrada automaticamente?`);

                if (shouldOpen) {
                    const saldoInicial = contaDestino.saldo_atual_centavos;
                    const opened = await abrirCaixa(modalContaDestinoId, saldoInicial, 'Abertura automática via Sangria');

                    if (!opened) {
                        setModalError('Não foi possível abrir o dia na conta de destino. A operação foi cancelada.');
                        setModalLoading(false);
                        return;
                    }
                } else {
                    setModalError('Operação cancelada. O dia na conta de destino precisa estar aberto para registrar a entrada.');
                    setModalLoading(false);
                    return;
                }
            }
        }

        const erroSangria = await registrarSangria(
            sessaoOrigemId,
            valor,
            modalObs || 'Sangria de caixa',
            modalContaDestinoId,
        );
        if (erroSangria === null) {
            resetModal();
        } else {
            setModalError(erroSangria);
            setModalLoading(false);
        }
    };

    const handleSuprimento = async () => {
        if (!selectedContaId) {
            setModalError('Selecione a conta de destino.');
            return;
        }
        const valor = parseValorReaisParaCentavos(modalValor);
        if (valor <= 0) { setModalError('Informe um valor válido.'); return; }
        if (!modalContaOrigemId) { setModalError('Selecione uma conta de origem.'); return; }

        setModalLoading(true);
        setModalError('');

        const okDestino = await garantirCaixaAbertoParaConta(selectedContaId);
        if (!okDestino) {
            setModalLoading(false);
            return;
        }

        const sessaoDestinoId = await verificarStatusCaixa(selectedContaId);
        if (!sessaoDestinoId) {
            setModalError('Não foi possível abrir o dia na conta de destino.');
            setModalLoading(false);
            return;
        }

        const contaOrigem = contasBancarias.find(c => c.id === modalContaOrigemId);
        if (contaOrigem && ['caixa', 'corrente'].includes(contaOrigem.tipo)) {
            const sessaoOrigemId = await verificarStatusCaixa(modalContaOrigemId);
            if (!sessaoOrigemId) {
                // Prompt user
                const shouldOpen = window.confirm(`Atenção: A conta de origem "${contaOrigem.nome}" está com o dia encerrado.\n\nPara realizar este suprimento e registrar a saída na origem, é necessário abrir o dia primeiro.\n\nDeseja abrir o dia e registrar a saída automaticamente?`);

                if (shouldOpen) {
                    setModalLoading(true);
                    // Use current balance to open
                    const saldoInicial = contaOrigem.saldo_atual_centavos;
                    const opened = await abrirCaixa(modalContaOrigemId, saldoInicial, 'Abertura automática via Suprimento');

                    if (!opened) {
                        setModalError('Não foi possível abrir o dia na conta de origem. A operação foi cancelada.');
                        setModalLoading(false);
                        return;
                    }
                } else {
                    setModalError('Operação cancelada. O dia na conta de origem precisa estar aberto para registrar a saída.');
                    setModalLoading(false);
                    return;
                }
            }
        }

        const erroSuprimento = await registrarSuprimento(
            sessaoDestinoId,
            valor,
            modalObs || 'Suprimento de caixa',
            modalContaOrigemId,
        );
        if (erroSuprimento === null) {
            resetModal();
        } else {
            setModalError(erroSuprimento);
            setModalLoading(false);
        }
    };

    const handleHistoryToggle = () => {
        if (!showHistory) {
            loadSessoes(selectedContaId || undefined);
        }
        setShowHistory(!showHistory);
    };

    const abrirModalReceitaCaixa = useCallback(async (contaId?: string) => {
        const cid = contaId || selectedContaId;
        if (!cid) {
            setModalError('Selecione uma conta de caixa.');
            return;
        }
        if (!validarPodeOperar(cid)) return;
        setSelectedContaId(cid);
        const ok = await garantirCaixaAbertoParaConta(cid);
        if (!ok) return;
        setShowNovaReceberCaixa(true);
    }, [selectedContaId, garantirCaixaAbertoParaConta, validarPodeOperar]);

    const abrirModalDespesaCaixa = useCallback(async (contaId?: string) => {
        const cid = contaId || selectedContaId;
        if (!cid) {
            setModalError('Selecione uma conta de caixa.');
            return;
        }
        if (!validarPodeOperar(cid)) return;
        setSelectedContaId(cid);
        const ok = await garantirCaixaAbertoParaConta(cid);
        if (!ok) return;
        setShowNovaPagarCaixa(true);
    }, [selectedContaId, garantirCaixaAbertoParaConta, validarPodeOperar]);

    const iniciarAcaoRapidaConta = async (
        contaId: string,
        acao: 'entrada' | 'saida' | 'suprimento' | 'sangria',
    ) => {
        selecionarConta(contaId);
        if (!validarPodeOperar(contaId)) return;
        if (acao === 'entrada') {
            const ok = await garantirCaixaAbertoParaConta(contaId);
            if (!ok) return;
            setShowNovaReceberCaixa(true);
            return;
        }
        if (acao === 'saida') {
            const ok = await garantirCaixaAbertoParaConta(contaId);
            if (!ok) return;
            setShowNovaPagarCaixa(true);
            return;
        }
        if (!validarPodeTransferir(contaId)) return;
        const ok = await garantirCaixaAbertoParaConta(contaId);
        if (!ok) return;
        setModal(acao);
    };

    const SESSAO_MOV_SELECT = 'id, empresa_id, sessao_id, tipo, descricao, valor_centavos, forma_pagamento, referencia_id, referencia_tipo, data_movimentacao, created_at, usuario_id, conciliado, conciliado_em, conciliado_por';

    const resolverSessoesSelecionadas = useCallback((): CaixaSessao[] => {
        const sessoes: CaixaSessao[] = [];
        treeData.empresas.forEach((emp) => {
            emp.tipos.forEach((tipo) => {
                tipo.contas.forEach((conta) => {
                    conta.sessoesConta.forEach((s) => {
                        if (selectedSessoesIds.has(s.id)) sessoes.push(s);
                    });
                });
            });
        });
        return sessoes.sort(
            (a, b) => new Date(a.data_abertura).getTime() - new Date(b.data_abertura).getTime(),
        );
    }, [treeData, selectedSessoesIds]);

    const handleViewSessoesMovimentos = useCallback(async (sessoes: CaixaSessao[]) => {
        if (!sessoes.length) return;
        const ordenadas = [...sessoes].sort(
            (a, b) => new Date(a.data_abertura).getTime() - new Date(b.data_abertura).getTime(),
        );
        const loadSeq = ++sessaoMovimentosLoadSeqRef.current;

        viewingSessoesListaRef.current = ordenadas;
        setViewingSessoesLista(ordenadas);
        setViewingSessaoId(ordenadas[0].id);
        setViewingSessaoInfo(ordenadas[0]);
        setSessaoSearch('');
        setSessaoTipoFilter('todos');
        setSessaoFormaFilter('todos');
        setLoadingSessaoMovs(true);
        try {
            const contaIds = [...new Set(ordenadas.map((s) => s.conta_bancaria_id).filter(Boolean))];
            const sessaoIdsPorConta = new Map<string, string[]>();

            await Promise.all(
                contaIds.map(async (contaId) => {
                    const { data, error: sessErr } = await supabase
                        .from('fin_caixa_sessoes')
                        .select('id')
                        .eq('conta_bancaria_id', contaId);
                    if (sessErr) throw sessErr;
                    sessaoIdsPorConta.set(
                        contaId,
                        (data ?? []).map((s: { id: string }) => s.id),
                    );
                }),
            );

            const contaPorSessaoId = new Map<string, string>();
            sessaoIdsPorConta.forEach((ids, contaId) => {
                ids.forEach((id) => contaPorSessaoId.set(id, contaId));
            });

            const porSessao = await Promise.all(
                ordenadas.map(async (sessao) => {
                    const dia = dataIsoSessao(sessao);
                    const idsConta = sessaoIdsPorConta.get(sessao.conta_bancaria_id) ?? [sessao.id];
                    const inicioIso = toUtcBoundary(dia);
                    const fimIso = toUtcBoundary(dia, true);

                    const [comData, semData] = await Promise.all([
                        supabase
                            .from('fin_caixa_movimentos')
                            .select(SESSAO_MOV_SELECT)
                            .in('sessao_id', idsConta)
                            .eq('data_movimentacao', dia)
                            .order('created_at', { ascending: true }),
                        supabase
                            .from('fin_caixa_movimentos')
                            .select(SESSAO_MOV_SELECT)
                            .in('sessao_id', idsConta)
                            .is('data_movimentacao', null)
                            .gte('created_at', inicioIso)
                            .lte('created_at', fimIso)
                            .order('created_at', { ascending: true }),
                    ]);
                    if (comData.error) throw comData.error;
                    if (semData.error) throw semData.error;

                    const raw = [
                        ...((comData.data ?? []) as CaixaMovimento[]),
                        ...((semData.data ?? []) as CaixaMovimento[]),
                    ];
                    return raw.filter((m) =>
                        movimentoPertenceSessao(m, sessao, contaPorSessaoId),
                    );
                }),
            );
            if (loadSeq !== sessaoMovimentosLoadSeqRef.current) return;

            const merged = porSessao
                .flat()
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            const movsEnriquecidos = await enriquecerMovimentosCompletos(merged);
            if (loadSeq !== sessaoMovimentosLoadSeqRef.current) return;
            setSessaoMovimentos(movsEnriquecidos);
        } catch (err) {
            console.error('Erro ao carregar movimentos da sessão:', err);
        } finally {
            if (loadSeq === sessaoMovimentosLoadSeqRef.current) {
                setLoadingSessaoMovs(false);
            }
        }
    }, [enriquecerMovimentosCompletos]);

    const handleViewSessaoMovimentos = useCallback(
        (sessao: CaixaSessao) => handleViewSessoesMovimentos([sessao]),
        [handleViewSessoesMovimentos],
    );

    const abrirMovimentacoesSessaoOuSelecionadas = useCallback((sessao: CaixaSessao) => {
        if (selectedSessoesIds.size > 1 && selectedSessoesIds.has(sessao.id)) {
            const sessoes = resolverSessoesSelecionadas();
            if (sessoes.length > 1) {
                void handleViewSessoesMovimentos(sessoes);
                return;
            }
        }
        void handleViewSessoesMovimentos([sessao]);
    }, [selectedSessoesIds, resolverSessoesSelecionadas, handleViewSessoesMovimentos]);

    const marcarSessaoSelecionada = (sessaoId: string, marcada: boolean) => {
        setSelectedSessoesIds((prev) => {
            const next = new Set(prev);
            if (marcada) next.add(sessaoId);
            else next.delete(sessaoId);
            return next;
        });
    };

    const selecionarSessoesConta = (contaId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const conta = treeData.empresas
            .flatMap((emp) => emp.tipos)
            .flatMap((tipo) => tipo.contas)
            .find((c) => c.id === contaId);
        if (!conta?.sessoesConta.length) return;
        setSelectedSessoesIds((prev) => {
            const next = new Set(prev);
            conta.sessoesConta.forEach((s) => next.add(s.id));
            return next;
        });
    };

    const abrirMovimentacoesSelecionadas = useCallback(() => {
        const sessoes = resolverSessoesSelecionadas();
        if (!sessoes.length) return;
        void handleViewSessoesMovimentos(sessoes);
    }, [resolverSessoesSelecionadas, handleViewSessoesMovimentos]);

    const aplicarMesInteiro = () => {
        const ref = periodoInicio ? new Date(`${periodoInicio}T12:00:00`) : new Date();
        const y = ref.getFullYear();
        const m = ref.getMonth();
        const mes = String(m + 1).padStart(2, '0');
        const ultimoDia = new Date(y, m + 1, 0).getDate();
        setPeriodoInicio(`${y}-${mes}-01`);
        setPeriodoFim(`${y}-${mes}-${String(ultimoDia).padStart(2, '0')}`);
    };

    const fecharModalMovimentacoes = () => {
        sessaoMovimentosLoadSeqRef.current += 1;
        viewingSessoesListaRef.current = [];
        setViewingSessaoId(null);
        setViewingSessaoInfo(null);
        setViewingSessoesLista([]);
    };

    const recarregarSessaoVisualizada = useCallback(async () => {
        const lista = viewingSessoesListaRef.current;
        if (lista.length > 0) {
            await handleViewSessoesMovimentos(lista);
            return;
        }
        if (viewingSessaoInfo) await handleViewSessoesMovimentos([viewingSessaoInfo]);
    }, [handleViewSessoesMovimentos, viewingSessaoInfo]);

    useEffect(() => {
        if (!viewingSessaoId) return;
        const onCaixaUpdated = () => {
            void recarregarSessaoVisualizada();
        };
        window.addEventListener('fin-caixa-updated', onCaixaUpdated);
        return () => window.removeEventListener('fin-caixa-updated', onCaixaUpdated);
    }, [viewingSessaoId, recarregarSessaoVisualizada]);

    const abrirMenuMovimento = (mov: CaixaMovimento, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedRowId(mov.id);
        setOpenMenuId(mov.id);
        setMenuPosition({ x: e.clientX, y: e.clientY });
    };

    const aplicarPatchConciliacaoLocal = useCallback((movId: string, patch: Partial<CaixaMovimento>) => {
        const atualizar = (lista: CaixaMovimento[]) =>
            lista.map((m) => (m.id === movId ? { ...m, ...patch } : m));
        setSessaoMovimentos((prev) => atualizar(prev));
        setTreeMovimentos((prev) => atualizar(prev));
        setMovimentosPeriodo((prev) => atualizar(prev));
        setFechamentoMovimentos((prev) => atualizar(prev));
        setMovimentoDetalhe((prev) => (prev?.id === movId ? { ...prev, ...patch } : prev));
    }, []);

    const marcarMovimentoConciliado = useCallback(async (mov: CaixaMovimento) => {
        if (movimentoEstaConciliado(mov)) return;
        setConciliandoMovId(mov.id);
        try {
            const { data, error } = await supabase.rpc('fin_conciliar_caixa_movimento', {
                p_movimento_id: mov.id,
            });
            if (error) throw error;
            const atualizado = (Array.isArray(data) ? data[0] : data) as CaixaMovimento | null;
            if (!atualizado) throw new Error('Resposta vazia ao conciliar movimento.');
            const [enriquecido] = await enriquecerMovimentosComUsuario([atualizado]);
            aplicarPatchConciliacaoLocal(mov.id, {
                conciliado: true,
                conciliado_em: enriquecido.conciliado_em,
                conciliado_por: enriquecido.conciliado_por,
                conciliado_por_nome: enriquecido.conciliado_por_nome,
            });
        } catch (err) {
            console.error('Erro ao conciliar movimento:', err);
            setModalError(`Não foi possível marcar como conciliado. ${mensagemErroDesconhecido(err)}`);
        } finally {
            setConciliandoMovId(null);
        }
    }, [aplicarPatchConciliacaoLocal, enriquecerMovimentosComUsuario]);

    const estornarConciliacaoMovimento = useCallback(async (mov: CaixaMovimento) => {
        if (!movimentoEstaConciliado(mov)) return;
        if (!window.confirm('Estornar a conciliação deste lançamento? Ele voltará para "Não conciliado".')) return;
        setConciliandoMovId(mov.id);
        try {
            const { data, error } = await supabase.rpc('fin_estornar_conciliacao_caixa_movimento', {
                p_movimento_id: mov.id,
            });
            if (error) throw error;
            aplicarPatchConciliacaoLocal(mov.id, {
                conciliado: false,
                conciliado_em: null,
                conciliado_por: null,
                conciliado_por_nome: undefined,
            });
        } catch (err) {
            console.error('Erro ao estornar conciliação:', err);
            setModalError(`Não foi possível estornar a conciliação. ${mensagemErroDesconhecido(err)}`);
        } finally {
            setConciliandoMovId(null);
        }
    }, [aplicarPatchConciliacaoLocal]);

    const podeEstornarMovimento = useCallback((
        mov: CaixaMovimento,
        contextoMovimentos?: CaixaMovimento[],
    ) => {
        const lista = contextoMovimentos ?? sessaoMovimentos;
        return usuarioPodeEstornarBaixaReceber(user?.role, userPermissoes)
            && movimentoEhBaixaContaReceber(mov)
            && !!resolverContaReceberIdDoMovimentoCaixa(mov)
            && !entradaCaixaJaEstornada(mov, lista);
    }, [user?.role, userPermissoes, sessaoMovimentos]);

    const iniciarEstornoBaixaMovimento = (mov: CaixaMovimento) => {
        if (!podeEstornarMovimento(mov)) return;
        setEstornoMovimentoAlvo(mov);
        setEstornoMotivo('');
        setEstornoErro('');
        setOpenMenuId(null);
    };

    const confirmarEstornoBaixaMovimento = async () => {
        if (!estornoMovimentoAlvo) return;
        const contaReceberId = resolverContaReceberIdDoMovimentoCaixa(estornoMovimentoAlvo);
        const motivo = estornoMotivo.trim();
        if (!contaReceberId) {
            setEstornoErro('Não foi possível identificar o título financeiro desta movimentação.');
            return;
        }
        if (!motivo) {
            setEstornoErro('Informe o motivo do estorno.');
            return;
        }
        setEstornoLoading(true);
        setEstornoErro('');
        try {
            const ok = await estornarContaReceber(contaReceberId, motivo);
            if (!ok) {
                setEstornoErro(
                    finError
                    || 'Não foi possível estornar o recebimento. Verifique se o título ainda está pago.',
                );
                return;
            }
            setEstornoMovimentoAlvo(null);
            setEstornoMotivo('');
            window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
            setTreeReloadToken((t) => t + 1);
            if (viewingSessaoInfo) await recarregarSessaoVisualizada();
            void loadMovimentosPeriodo();
            if (selectedContaId) await loadSessaoAtual(selectedContaId);
        } finally {
            setEstornoLoading(false);
        }
    };

    const renderMenuAcoesMovimento = (mov: CaixaMovimento, contextoMovimentos?: CaixaMovimento[]) => {
        const contextoLista = contextoMovimentos
            ?? (sessaoMovimentos.some((m) => m.sessao_id === mov.sessao_id)
                ? sessaoMovimentos
                : treeMovimentos.filter((m) => m.sessao_id === mov.sessao_id));
        return (
        openMenuId === mov.id ? (
            <DropdownMenuContent
                isOpen
                onClose={() => setOpenMenuId(null)}
                position={menuPosition}
            >
                <DropdownMenuItem onClick={() => { setMovimentoDetalhe(mov); setOpenMenuId(null); }}>
                    <Eye className="h-4 w-4 mr-2" /> Ver detalhes
                </DropdownMenuItem>
                {movimentoEstaConciliado(mov) && (
                    <DropdownMenuItem
                        variant="danger"
                        onClick={() => { void estornarConciliacaoMovimento(mov); setOpenMenuId(null); }}
                    >
                        <RotateCcw className="h-4 w-4 mr-2" /> Estornar conciliação
                    </DropdownMenuItem>
                )}
                {podeEstornarMovimento(mov, contextoLista) && (
                    <DropdownMenuItem
                        variant="danger"
                        onClick={() => iniciarEstornoBaixaMovimento(mov)}
                    >
                        <RotateCcw className="h-4 w-4 mr-2" /> Estornar baixa
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { window.print(); setOpenMenuId(null); }}>
                    <Printer className="h-4 w-4 mr-2" /> Imprimir comprovante
                </DropdownMenuItem>
            </DropdownMenuContent>
        ) : null);
    };

    if (loading && contasBancarias.length === 0) return <FinanceiroLoading />;

    const sessaoConta = viewingSessaoInfo
        ? contasBancarias.find((c) => c.id === viewingSessaoInfo.conta_bancaria_id)
        : null;
    const sessaoSomenteEspecie = contaSaldoFinalSomenteEspecie(sessaoConta?.tipo);
    const sessaoMovimentosFiltrados = sessaoMovimentos.filter((mov) => {
        const termo = sessaoSearch.trim().toLowerCase();
        const formaNormalizada = normalizarFormaPagamento(mov.forma_pagamento);
        const formaBruta = String(mov.forma_pagamento || '').toLowerCase().trim();
        const texto = `${mov.descricao} ${mov.usuario_nome || ''} ${mov.referencia_id || ''} ${formaBruta} ${formaNormalizada}`.toLowerCase();
        const okBusca = !termo || texto.includes(termo);
        const okTipo = sessaoTipoFilter === 'todos' || mov.tipo === sessaoTipoFilter;
        const okForma = sessaoFormaFilter === 'todos'
            || (sessaoFormaFilter === 'sem_forma' && !formaNormalizada)
            || formaNormalizada === sessaoFormaFilter;
        return okBusca && okTipo && okForma;
    });
    const sessaoTotais = sessaoMovimentos.reduce((acc, mov) => {
        const contaNoSaldo =
            !sessaoSomenteEspecie
            || mov.tipo === 'suprimento'
            || mov.tipo === 'sangria'
            || movimentoImpactaSaldoFisicoCaixa(mov);
        if ((mov.tipo === 'entrada' || mov.tipo === 'suprimento') && contaNoSaldo) {
            acc.entradas += mov.valor_centavos;
        }
        if ((mov.tipo === 'saida' || mov.tipo === 'sangria') && contaNoSaldo) {
            acc.saidas += mov.valor_centavos;
        }
        return acc;
    }, { entradas: 0, saidas: 0 });
    const sessaoSaldoAnterior = (() => {
        const lista = viewingSessoesLista.length > 0
            ? [...viewingSessoesLista].sort(
                (a, b) => new Date(a.data_abertura).getTime() - new Date(b.data_abertura).getTime(),
            )
            : viewingSessaoInfo
                ? [viewingSessaoInfo]
                : [];
        const primeira = lista[0];
        if (!primeira) return 0;
        const contaId = primeira.conta_bancaria_id;
        const contaTree = treeData.empresas
            .flatMap((e) => e.tipos)
            .flatMap((t) => t.contas)
            .find((c) => c.id === contaId);
        const sessaoTree = contaTree?.sessoesConta.find((s) => s.id === primeira.id) as
            | (CaixaSessao & { saldoAberturaCalculado?: number })
            | undefined;
        if (sessaoTree?.saldoAberturaCalculado != null) {
            return Number(sessaoTree.saldoAberturaCalculado);
        }
        return Number(primeira.saldo_abertura_centavos || 0);
    })();
    const sessaoSaldoFinal = calcularSaldoSessaoFromMovimentos(
        sessaoSaldoAnterior,
        sessaoMovimentos,
        sessaoSomenteEspecie,
    );
    const sessaoAberta = viewingSessoesLista.length > 0
        ? viewingSessoesLista.some((s) => s.status === 'aberto')
        : viewingSessaoInfo?.status === 'aberto';
    const sessaoVisualizadaUnica = viewingSessoesLista.length === 1
        ? viewingSessoesLista[0]
        : viewingSessoesLista.length === 0
            ? viewingSessaoInfo
            : null;
    const multiSessaoVisualizada = viewingSessoesLista.length > 1;
    const sessaoDataPorId = new Map(viewingSessoesLista.map((s) => [s.id, s.data_abertura]));
    const rotuloPeriodoSessoes = (() => {
        const lista = viewingSessoesLista.length > 0
            ? viewingSessoesLista
            : viewingSessaoInfo
                ? [viewingSessaoInfo]
                : [];
        if (!lista.length) return '—';
        const dias = lista
            .map((s) => dataIsoSessao(s))
            .filter(Boolean)
            .sort();
        const primeiro = dias[0];
        const ultimo = dias[dias.length - 1];
        return primeiro === ultimo
            ? formatDateBr(primeiro)
            : `${formatDateBr(primeiro)} a ${formatDateBr(ultimo)}`;
    })();
    const sessaoTotaisPorForma = (() => {
        const map = new Map<string, { entradas: number; saidas: number }>();
        const ensure = (chave: string) => {
            if (!map.has(chave)) map.set(chave, { entradas: 0, saidas: 0 });
            return map.get(chave)!;
        };
        sessaoMovimentos.forEach((mov) => {
            const label = rotuloFormaPagamento(mov.forma_pagamento);
            const chave = label === '—' ? 'Sem forma informada' : label;
            if (['entrada', 'suprimento'].includes(mov.tipo)) {
                ensure(chave).entradas += mov.valor_centavos;
            }
            if (['saida', 'sangria'].includes(mov.tipo)) {
                ensure(chave).saidas += mov.valor_centavos;
            }
        });
        return Array.from(map.entries())
            .map(([forma, totais]) => ({ forma, ...totais }))
            .sort((a, b) => a.forma.localeCompare(b.forma, 'pt-BR'));
    })();
    const sessaoFiltrosAtivos =
        sessaoSearch.trim() !== '' || sessaoTipoFilter !== 'todos' || sessaoFormaFilter !== 'todos';

    const imprimirPdfSessaoVisualizada = async () => {
        if (!viewingSessaoId || !viewingSessaoInfo) {
            alert('Abra os movimentos de um caixa antes de gerar o PDF.');
            return;
        }
        if (multiSessaoVisualizada) {
            alert('O PDF está disponível para um único dia. Selecione apenas um dia ou use Imprimir do navegador.');
            return;
        }
        const janelaPdf = window.open('', '_blank');
        setPrintingCaixa(true);
        try {
            const filialNome =
                empresaNomePorId.get(viewingSessaoInfo.empresa_id) || empresa?.nome || '';
            const blob = montarPdfCaixaBlob({
                data_abertura: rotuloPeriodoSessoes,
                status: viewingSessaoInfo.status,
                saldo_abertura_centavos: sessaoSaldoAnterior,
                conta_nome: sessaoConta?.nome || 'Conta',
                banco_nome: sessaoConta?.banco_nome,
                filial_nome: filialNome,
                somente_especie: sessaoSomenteEspecie,
                movimentos: sessaoMovimentos.map((m) => ({
                    created_at: m.created_at,
                    tipo: m.tipo,
                    valor_centavos: m.valor_centavos,
                    forma_pagamento: m.forma_pagamento,
                    descricao: m.descricao,
                    usuario_nome: m.usuario_nome,
                })),
            });
            const ok = await abrirPdfNaJanelaReservada(janelaPdf, blob);
            if (!ok) {
                alert('Não foi possível abrir o PDF. Permita pop-ups neste site e tente de novo.');
            }
        } catch (e: unknown) {
            if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
            console.error('[Tesouraria PDF caixa]', e);
            alert(`Erro ao gerar PDF: ${mensagemErroDesconhecido(e)}`);
        } finally {
            setPrintingCaixa(false);
        }
    };

    return (
        <div className="space-y-6 bg-slate-50/30 p-2 sm:p-0 rounded-2xl">
            <PageHeader
                title="Tesouraria"
                subtitle={
                    treeData.multiUnidade
                        ? 'Visão consolidada de todas as unidades — controle de caixa por estabelecimento'
                        : `Unidade: ${selectedConta ? empresaNomePorId.get(selectedConta.empresa_id) || empresa?.nome : empresa?.nome || '—'}`
                }
                actionButton={
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            onClick={handleHistoryToggle}
                            className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-semibold shadow-sm transition-all duration-200"
                        >
                            <History className="h-4 w-4 mr-2 text-slate-500" />
                            Histórico
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => {
                                loadContasBancarias();
                                void fetchOpenSessions();
                                void loadMovimentosPeriodo();
                                if (selectedContaId) void loadSessaoAtual(selectedContaId);
                            }}
                            disabled={loading}
                            className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-semibold shadow-sm transition-all duration-200"
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                    </div>
                }
            />

            {/* Caixa Selector & Period Filters Card */}
            <Card className="p-5 border border-slate-100 shadow-md shadow-slate-100/50 bg-gradient-to-br from-white to-slate-50/30 rounded-2xl transition-all duration-300">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                    <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0">
                            <Landmark className="h-5 w-5 text-accent" />
                            Caixa / Conta:
                        </div>
                        <div className="flex-1">
                            <Select
                                value={selectedContaId}
                                onChange={(e) => setSelectedContaId(e.target.value)}
                                className="font-semibold text-slate-800 border-slate-200 bg-white rounded-xl shadow-sm focus:ring-2 focus:ring-accent/20 focus:border-accent hover:border-slate-300 transition-all duration-200"
                            >
                                <option value="">Selecione o caixa...</option>
                                {contasAtivasPorEmpresa.map((grupo) => (
                                    <optgroup key={grupo.empresaId} label={grupo.empresaNome}>
                                        {grupo.contas.map((conta) => (
                                            <option key={conta.id} value={conta.id}>
                                                {conta.nome} ({conta.tipo}) — {formatCentavos(conta.saldo_atual_centavos)}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </Select>
                        </div>
                    </div>

                    <div className="lg:col-span-6 flex flex-wrap items-center justify-start lg:justify-end gap-3">
                        {selectedConta && (
                            <span className="text-xs font-bold text-slate-500 bg-slate-100/80 px-3 py-2 rounded-xl border border-slate-200/50 shadow-sm">
                                Unidade: {empresaNomePorId.get(selectedConta.empresa_id) || '—'}
                            </span>
                        )}
                        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1 shadow-sm hover:border-slate-300 transition-colors">
                            <div className="w-[155px] shrink-0">
                                <Input
                                    type="date"
                                    pickerOnly
                                    helperText=""
                                    value={periodoInicio}
                                    onChange={(e) => setPeriodoInicio(e.target.value)}
                                    className="border-0 bg-transparent h-9 pl-2 pr-8 text-xs font-bold text-slate-700 focus:ring-0 [&~svg]:hidden"
                                />
                            </div>
                            <span className="text-slate-300 text-xs font-bold" aria-hidden>
                                a
                            </span>
                            <div className="w-[155px] shrink-0">
                                <Input
                                    type="date"
                                    pickerOnly
                                    helperText=""
                                    value={periodoFim}
                                    onChange={(e) => setPeriodoFim(e.target.value)}
                                    className="border-0 bg-transparent h-9 pl-2 pr-8 text-xs font-bold text-slate-700 focus:ring-0 [&~svg]:hidden"
                                />
                            </div>
                            <Calendar className="h-4 w-4 text-gray-400 dark:text-slate-500 mr-2 shrink-0 pointer-events-none" />
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 text-xs font-bold shrink-0"
                            onClick={aplicarMesInteiro}
                            title="Ajustar o período para o mês inteiro da data inicial"
                        >
                            <Calendar className="h-3.5 w-3.5 mr-1" />
                            Mês inteiro
                        </Button>
                        <div
                            className={`flex h-11 shrink-0 items-center gap-1.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all duration-300 ${
                                isOpen 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 shadow-sm shadow-emerald-50/50' 
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                        >
                            {isOpen ? (
                                <span className="relative flex h-2 w-2 mr-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                            ) : (
                                <Lock className="h-3.5 w-3.5 mr-1" />
                            )}
                            {isOpen ? 'Aberto' : 'Dia encerrado'}
                        </div>
                    </div>
                </div>
            </Card>

            {modalError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-950 flex items-start justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-1">
                    <span className="font-semibold">{modalError}</span>
                    <button type="button" className="text-amber-700 hover:text-amber-900 transition-colors p-0.5 rounded-lg hover:bg-amber-100" onClick={() => setModalError('')}>
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4 w-full">
                <div className={`lg:w-2/3 rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-300 ${
                    isOpen 
                        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/40 via-emerald-50/10 to-transparent shadow-sm shadow-emerald-100/10' 
                        : 'border-slate-200 bg-gradient-to-br from-slate-50/60 to-transparent shadow-sm'
                }`}>
                    <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-xl border flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 ${
                            isOpen ? 'bg-emerald-100/80 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-400'
                        }`}>
                            {isOpen ? <Unlock className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
                        </div>
                        <div>
                            <h3 className={`text-base font-bold tracking-tight ${isOpen ? 'text-emerald-950' : 'text-slate-800'}`}>
                                {isOpen 
                                    ? `Caixa da Sessão Ativo — ${selectedConta?.nome || 'Caixa'}` 
                                    : `Dia encerrado ${selectedConta ? `— ${selectedConta.nome}` : ''}`
                                }
                            </h3>
                            <p className={`text-xs mt-1 font-medium leading-relaxed ${isOpen ? 'text-emerald-800/90' : 'text-slate-500'}`}>
                                {isOpen
                                    ? (
                                        <>
                                            Iniciado em {formatDateTimeBr(sessaoAtual!.data_abertura)}
                                            {' — '}
                                            Saldo no período ({formatDateBr(periodoInicio)} a {formatDateBr(periodoFim)}):{' '}
                                            <span className="font-bold">{formatCentavos(saldoCabecalhoCentavos)}</span>
                                            {saldoCabecalhoDivergeDoDia && (
                                                <span className="block text-[11px] text-emerald-700/80 mt-0.5">
                                                    Dia atual ({formatDateBr(sessaoAtual!.data_abertura)}): {formatCentavos(saldoDiaAtualCentavos)}
                                                </span>
                                            )}
                                        </>
                                    )
                                    : 'Abra o dia para habilitar lançamentos de movimentações e transferências.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {isOpen ? (
                            <Button
                                size="sm"
                                className="bg-rose-600 hover:bg-rose-700 text-white border-0 shadow-sm text-xs font-semibold px-4 h-9.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                                onClick={() => {
                                    if (!validarPodeOperar() || !sessaoAtual) return;
                                    void prepararFechamentoSessao(sessaoAtual, selectedContaId);
                                }}
                            >
                                <Lock className="h-3.5 w-3.5 mr-1.5" /> Fechar o dia
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm text-xs font-semibold px-4 h-9.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                                onClick={() => { if (validarPodeOperar()) { setModalValor(''); setModal('abrir'); } }}
                                disabled={!selectedContaId}
                            >
                                <Unlock className="h-3.5 w-3.5 mr-1.5" /> Abrir Caixa
                            </Button>
                        )}
                    </div>
                </div>

                <div className="lg:w-1/3 rounded-2xl border border-slate-200 p-5 bg-white flex flex-col justify-between shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Ações Rápidas</span>
                        <Banknote className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="flex gap-2 mt-4">
                        <DropdownMenu className="flex-1">
                            <DropdownMenuTrigger className="w-full">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-xs font-bold h-9.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-1.5"
                                    disabled={!selectedContaId}
                                    onClick={() => setQuickDropdownEntradaOpen(true)}
                                >
                                    <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" /> Entrada
                                    <ChevronDown className="h-3 w-3 text-slate-450" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                isOpen={quickDropdownEntradaOpen}
                                onClose={() => setQuickDropdownEntradaOpen(false)}
                                align="left"
                            >
                                <DropdownMenuItem onClick={() => { setQuickDropdownEntradaOpen(false); void abrirModalReceitaCaixa(); }}>
                                    <ArrowDownCircle className="h-4 w-4 mr-2 text-emerald-600" /> Entrada de Caixa
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setQuickDropdownEntradaOpen(false); void iniciarAcaoRapidaConta(selectedContaId, 'suprimento'); }}>
                                    <Plus className="h-4 w-4 mr-2 text-blue-600" /> Suprimento (Entrada)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu className="flex-1">
                            <DropdownMenuTrigger className="w-full">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-xs font-bold h-9.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-1.5"
                                    disabled={!selectedContaId}
                                    onClick={() => setQuickDropdownSaidaOpen(true)}
                                >
                                    <ArrowUpCircle className="h-3.5 w-3.5 text-rose-600" /> Saída
                                    <ChevronDown className="h-3 w-3 text-slate-455" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                isOpen={quickDropdownSaidaOpen}
                                onClose={() => setQuickDropdownSaidaOpen(false)}
                                align="left"
                            >
                                <DropdownMenuItem onClick={() => { setQuickDropdownSaidaOpen(false); void abrirModalDespesaCaixa(); }}>
                                    <ArrowUpCircle className="h-4 w-4 mr-2 text-rose-600" /> Saída de Caixa
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setQuickDropdownSaidaOpen(false); void iniciarAcaoRapidaConta(selectedContaId, 'sangria'); }}>
                                    <Minus className="h-4 w-4 mr-2 text-orange-600" /> Sangria (Saída)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            {/* Premium Period Statistics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-md shadow-slate-100/30 flex items-center justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                    <div className="space-y-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Saldo Anterior</span>
                        <h4 className="text-lg font-bold font-mono text-slate-700 tabular-nums truncate">
                            {formatCentavos(statsSelected.saldoAnterior)}
                        </h4>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100/30 flex items-center justify-center text-indigo-600 shrink-0">
                        <Landmark className="h-4 w-4" />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-md shadow-slate-100/30 flex items-center justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                    <div className="space-y-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Total Entradas</span>
                        <h4 className="text-lg font-bold font-mono text-emerald-600 tabular-nums truncate">
                            {formatCentavos(statsSelected.entradas)}
                        </h4>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100/30 flex items-center justify-center text-emerald-600 shrink-0">
                        <TrendingUp className="h-4 w-4" />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-md shadow-slate-100/30 flex items-center justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                    <div className="space-y-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Total Saídas</span>
                        <h4 className="text-lg font-bold font-mono text-rose-600 tabular-nums truncate">
                            {formatCentavos(statsSelected.saidas)}
                        </h4>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-100/30 flex items-center justify-center text-rose-600 shrink-0">
                        <TrendingDown className="h-4 w-4" />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-md shadow-slate-100/30 flex items-center justify-between hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                    <div className="space-y-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Saldo Final</span>
                        <h4 className="text-lg font-bold font-mono text-slate-900 tabular-nums truncate">
                            {formatCentavos(statsSelected.saldoFinal)}
                        </h4>
                    </div>
                    <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100/30 flex items-center justify-center text-blue-600 shrink-0">
                        <Banknote className="h-4 w-4" />
                    </div>
                </div>
            </div>

            {/* Main Tabs Container */}
            <Card className="overflow-hidden border border-slate-100 shadow-md">
                <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-emerald-400" />
                            Fluxo de Caixa do Período
                        </h3>
                        <p className="text-xs text-slate-300 mt-1 font-medium">
                            {formatDateBr(periodoInicio)} a {formatDateBr(periodoFim)}
                            {' · '}
                            Entradas e saídas agrupadas por conta e data de referência
                        </p>
                    </div>
                    <div
                        className="flex bg-slate-950/40 p-1 rounded-xl border border-slate-700/80 shrink-0 self-start sm:self-center"
                        role="tablist"
                        aria-label="Visualização do fluxo de caixa"
                    >
                        {([
                            { id: 'contas' as const, label: 'Resumo Contas', icon: Landmark, count: arvoreIds.contaIds.length },
                            { id: 'movimentos' as const, label: 'Movimentações', icon: Receipt, count: countsPeriodo.todos },
                        ]).map((tab) => {
                            const Icon = tab.icon;
                            const selected = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={selected}
                                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                                        selected
                                            ? 'bg-white text-slate-900 shadow-md ring-1 ring-white/20'
                                            : 'text-slate-300 hover:text-white hover:bg-white/10'
                                    }`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-emerald-600' : ''}`} aria-hidden />
                                    <span className="uppercase tracking-wider">{tab.label}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold tabular-nums ${
                                        selected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-800 text-slate-300'
                                    }`}>
                                        {tab.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {activeTab === 'contas' ? (
                    <div className="overflow-x-auto p-4 bg-slate-50/30">
                        {selectedSessoesIds.size > 0 && (
                            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3">
                                <CheckSquare className="h-4 w-4 text-indigo-600 shrink-0" />
                                <span className="text-sm font-semibold text-indigo-900">
                                    {selectedSessoesIds.size} dia(s) selecionado(s)
                                </span>
                                <Button
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={abrirMovimentacoesSelecionadas}
                                >
                                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                                    Ver movimentações consolidadas
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    onClick={() => setSelectedSessoesIds(new Set())}
                                >
                                    Limpar seleção
                                </Button>
                                <span className="text-xs text-indigo-700/80 ml-auto hidden sm:inline">
                                    Marque os dias na árvore ou use &quot;Selecionar dias&quot; na conta
                                </span>
                            </div>
                        )}
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                            <p className="text-xs text-slate-500">
                                <span className="font-semibold text-slate-700">{expandedEmpresas.size}</span> de{' '}
                                <span className="font-semibold text-slate-700">{arvoreIds.empresaIds.length}</span> unidades abertas
                                {' · '}
                                <span className="font-semibold text-slate-700">{expandedContas.size}</span> de{' '}
                                <span className="font-semibold text-slate-700">{arvoreIds.contaIds.length}</span> contas expandidas
                            </p>
                            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 shrink-0" role="group" aria-label="Expandir ou recolher árvore de contas">
                                <button
                                    type="button"
                                    disabled={arvoreTodaExpandida}
                                    onClick={expandirArvoreToda}
                                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                                        arvoreTodaExpandida
                                            ? 'bg-emerald-50 text-emerald-700 cursor-default'
                                            : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm'
                                    }`}
                                >
                                    <ChevronDown className="h-3.5 w-3.5 -rotate-90" aria-hidden />
                                    Expandir tudo
                                </button>
                                <button
                                    type="button"
                                    disabled={arvoreTodaRecolhida}
                                    onClick={recolherArvoreToda}
                                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                                        arvoreTodaRecolhida
                                            ? 'bg-slate-200/80 text-slate-700 cursor-default'
                                            : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm'
                                    }`}
                                >
                                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                                    Recolher tudo
                                </button>
                            </div>
                        </div>
                        <table className="w-full text-sm border-separate border-spacing-y-2 border-spacing-x-0">
                            <thead className="text-slate-400 uppercase text-[10px] tracking-wider font-extrabold select-none">
                                <tr>
                                    <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[280px]">Unidade / Tipo / Conta</th>
                                    <th className="text-right pb-2 pt-1 px-4 font-bold min-w-[125px]">Saldo Anterior</th>
                                    <th className="text-right pb-2 pt-1 px-4 font-bold min-w-[125px] text-emerald-600">(+ ) Recebimento</th>
                                    <th className="text-right pb-2 pt-1 px-4 font-bold min-w-[125px] text-rose-600">(-) Pagamento</th>
                                    <th className="text-right pb-2 pt-1 px-4 font-bold min-w-[125px] text-blue-600">(+ ) Transf. Entrada</th>
                                    <th className="text-right pb-2 pt-1 px-4 font-bold min-w-[125px] text-orange-600">(-) Transf. Saída</th>
                                    <th className="text-right pb-2 pt-1 px-4 font-bold min-w-[125px]">Saldo Final</th>
                                    <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[105px]">Situação</th>
                                    <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[130px]">Abertura</th>
                                    <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[130px]">Fechamento</th>
                                </tr>
                            </thead>
                            <tbody>
                                {treeData.multiUnidade && (
                                    <tr className="font-bold bg-indigo-50/60 hover:bg-indigo-100/50 hover:shadow-xs transition-all [&>td]:py-3 [&>td]:px-4 [&>td]:border-y [&>td]:border-r [&>td]:border-indigo-100 last:[&>td]:border-r-0 [&>td:first-child]:rounded-l-xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-xl [&>td:last-child]:border-r">
                                        <td>
                                            <span className="inline-flex items-center gap-2 text-indigo-950 font-bold uppercase text-[11px] tracking-wide">
                                                <Landmark className="h-4 w-4 text-indigo-600" />
                                                Consolidado — Todas as unidades
                                            </span>
                                        </td>
                                        <td className="text-right font-mono text-xs tabular-nums font-bold text-slate-900">{formatCentavos(treeData.consolidado.saldoAnterior)}</td>
                                        <td className="text-right font-mono text-xs tabular-nums font-bold text-emerald-600">{formatCentavos(treeData.consolidado.recebimentos)}</td>
                                        <td className="text-right font-mono text-xs tabular-nums font-bold text-rose-600">{formatCentavos(treeData.consolidado.pagamentos)}</td>
                                        <td className="text-right font-mono text-xs tabular-nums font-bold text-blue-600">{formatCentavos(treeData.consolidado.transfEntrada)}</td>
                                        <td className="text-right font-mono text-xs tabular-nums font-bold text-orange-600">{formatCentavos(treeData.consolidado.transfSaida)}</td>
                                        <td className="text-right font-mono text-xs tabular-nums font-bold text-slate-950">{formatCentavos(treeData.consolidado.saldoFinal)}</td>
                                        <td colSpan={3}></td>
                                    </tr>
                                )}
                                {treeData.empresas.map((empresa) => (
                                    <React.Fragment key={empresa.empresaId}>
                                        <tr
                                            className="font-bold bg-slate-50 hover:bg-slate-100/70 hover:shadow-xs transition-all cursor-pointer [&>td]:py-3 [&>td]:px-4 [&>td]:border-y [&>td]:border-r [&>td]:border-slate-200/80 last:[&>td]:border-r-0 [&>td:first-child]:rounded-l-xl [&>td:first-child]:border-l [&>td:first-child]:border-l-4 [&>td:first-child]:border-l-accent [&>td:last-child]:rounded-r-xl [&>td:last-child]:border-r"
                                            onClick={() => toggleEmpresa(empresa.empresaId)}
                                        >
                                            <td>
                                                <div className="inline-flex items-center gap-2 text-slate-800 hover:text-accent font-extrabold text-xs uppercase tracking-wide select-none">
                                                    <TesourariaNoExpansao
                                                        expanded={expandedEmpresas.has(empresa.empresaId)}
                                                        label={empresa.empresaNome}
                                                        onToggle={(e) => {
                                                            e.stopPropagation();
                                                            toggleEmpresa(empresa.empresaId);
                                                        }}
                                                    />
                                                    {empresa.empresaNome}
                                                    <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 normal-case tracking-normal">
                                                        {empresa.tipos.length} {empresa.tipos.length === 1 ? 'grupo' : 'grupos'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="text-right font-mono text-xs tabular-nums font-bold text-slate-900">{formatCentavos(empresa.saldoAnterior)}</td>
                                            <td className="text-right font-mono text-xs tabular-nums font-bold text-emerald-600">{formatCentavos(empresa.recebimentos)}</td>
                                            <td className="text-right font-mono text-xs tabular-nums font-bold text-rose-600">{formatCentavos(empresa.pagamentos)}</td>
                                            <td className="text-right font-mono text-xs tabular-nums font-semibold text-blue-600">{formatCentavos(empresa.transfEntrada)}</td>
                                            <td className="text-right font-mono text-xs tabular-nums font-semibold text-orange-600">{formatCentavos(empresa.transfSaida)}</td>
                                            <td className="text-right font-mono text-xs tabular-nums font-bold text-slate-950">{formatCentavos(empresa.saldoFinal)}</td>
                                            <td colSpan={3}></td>
                                        </tr>
                                        {expandedEmpresas.has(empresa.empresaId) && empresa.tipos.map((tipo) => (
                                            <React.Fragment key={tipo.id}>
                                                <tr
                                                    className="bg-slate-50/40 hover:bg-slate-50/80 hover:shadow-xs transition-all cursor-pointer [&>td]:py-2.5 [&>td]:px-4 [&>td]:border-y [&>td]:border-r [&>td]:border-slate-100 last:[&>td]:border-r-0 [&>td:first-child]:rounded-l-xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-xl [&>td:last-child]:border-r"
                                                    onClick={() => toggleTipo(tipo.id)}
                                                >
                                                    <td className="align-middle">
                                                        <div className="flex items-center gap-2 pl-3">
                                                            <div className="flex items-center h-full">
                                                                <div className="w-[1px] h-5 bg-slate-200 relative mr-1.5">
                                                                    <div className="absolute top-1/2 left-0 w-2 h-[1px] bg-slate-200" />
                                                                </div>
                                                            </div>
                                                            <div className="inline-flex items-center gap-2 text-slate-650 hover:text-accent font-bold text-xs uppercase tracking-wide select-none">
                                                                <TesourariaNoExpansao
                                                                    size="sm"
                                                                    expanded={expandedTipos.has(tipo.id)}
                                                                    label={tipo.label}
                                                                    onToggle={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleTipo(tipo.id);
                                                                    }}
                                                                />
                                                                {tipo.label}
                                                                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 normal-case tracking-normal border border-slate-200">
                                                                    {tipo.contas.length} {tipo.contas.length === 1 ? 'conta' : 'contas'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-right font-mono text-xs tabular-nums text-slate-700">{formatCentavos(tipo.saldoAnterior)}</td>
                                                    <td className="text-right font-mono text-xs tabular-nums text-emerald-600">{formatCentavos(tipo.recebimentos)}</td>
                                                    <td className="text-right font-mono text-xs tabular-nums text-rose-600">{formatCentavos(tipo.pagamentos)}</td>
                                                    <td className="text-right font-mono text-xs tabular-nums text-blue-600">{formatCentavos(tipo.transfEntrada)}</td>
                                                    <td className="text-right font-mono text-xs tabular-nums text-orange-600">{formatCentavos(tipo.transfSaida)}</td>
                                                    <td className="text-right font-mono text-xs tabular-nums font-bold text-slate-900">{formatCentavos(tipo.saldoFinal)}</td>
                                                    <td colSpan={3}></td>
                                                </tr>
                                                {expandedTipos.has(tipo.id) && tipo.contas.map((conta) => (
                                                    <React.Fragment key={conta.id}>
                                                        <tr 
                                                            className={`cursor-pointer transition-all hover:shadow-sm [&>td]:py-2.5 [&>td]:px-4 [&>td]:border-y [&>td]:border-r last:[&>td]:border-r-0 [&>td:first-child]:rounded-l-xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-xl [&>td:last-child]:border-r ${
                                                                selectedContaId === conta.id 
                                                                    ? 'bg-blue-50/70 hover:bg-blue-100/50 [&>td]:border-blue-200' 
                                                                    : openMenuId === conta.id 
                                                                        ? 'bg-slate-50 [&>td]:border-slate-300' 
                                                                        : 'bg-white hover:bg-slate-50/70 [&>td]:border-slate-200'
                                                            }`}
                                                            onClick={(e) => abrirMenuConta(conta, e)}
                                                            onContextMenu={(e) => abrirMenuConta(conta, e)}
                                                            title="Clique para ver ações"
                                                        >
                                                            <td className="align-middle">
                                                                <div className="flex items-center gap-2 pl-7">
                                                                    <div className="flex items-center h-full">
                                                                        {/* Two vertical guide lines */}
                                                                        <div className="w-[1px] h-6 bg-slate-200 mr-2" />
                                                                        <div className="w-[1px] h-6 bg-slate-200 relative mr-1.5">
                                                                            <div className="absolute top-1/2 left-0 w-2 h-[1px] bg-slate-200" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                        <TesourariaNoExpansao
                                                                            expanded={expandedContas.has(conta.id)}
                                                                            label={conta.nome}
                                                                            onToggle={(e) => {
                                                                                e.stopPropagation();
                                                                                toggleConta(conta.id);
                                                                            }}
                                                                        />
                                                                        <span className="text-slate-800 font-bold hover:text-accent transition-colors flex-1 text-xs whitespace-normal break-words leading-relaxed">
                                                                            {conta.nome}
                                                                        </span>
                                                                        {expandedContas.has(conta.id) && conta.sessoesConta.length > 0 && (
                                                                            <button
                                                                                type="button"
                                                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0"
                                                                                onClick={(e) => selecionarSessoesConta(conta.id, e)}
                                                                                title="Selecionar todos os dias desta conta no período"
                                                                            >
                                                                                Selecionar dias
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="text-right font-mono text-xs tabular-nums font-medium text-slate-900">{formatCentavos(conta.saldoAnterior)}</td>
                                                            <td className="text-right font-mono text-xs tabular-nums font-bold text-emerald-600">{formatCentavos(conta.recebimentos)}</td>
                                                            <td className="text-right font-mono text-xs tabular-nums font-bold text-rose-600">{formatCentavos(conta.pagamentos)}</td>
                                                            <td className="text-right font-mono text-xs tabular-nums text-blue-600">{formatCentavos(conta.transfEntrada)}</td>
                                                            <td className="text-right font-mono text-xs tabular-nums text-orange-600">{formatCentavos(conta.transfSaida)}</td>
                                                            <td className="text-right font-mono text-xs tabular-nums font-bold text-slate-900">{formatCentavos(conta.saldoFinal)}</td>
                                                            <td>
                                                                {conta.openSession ? (
                                                                    <div className="flex flex-col">
                                                                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[10px] uppercase">
                                                                            <Unlock className="h-3 w-3" /> Aberto
                                                                        </span>
                                                                        <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                                                            {new Date(conta.openSession.data_abertura).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 text-slate-500 text-[10px] uppercase font-bold">
                                                                        <Lock className="h-3 w-3" /> Fechado
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="text-xs text-slate-600 whitespace-normal break-words">
                                                                {conta.openSession?.data_abertura
                                                                    ? formatDateTimeBr(conta.openSession.data_abertura)
                                                                    : '—'}
                                                            </td>
                                                            <td className="text-xs text-slate-600 whitespace-normal break-words">
                                                                {conta.openSession?.data_fechamento
                                                                    ? formatDateTimeBr(conta.openSession.data_fechamento)
                                                                    : '—'}
                                                            </td>
                                                        </tr>
                                                        {expandedContas.has(conta.id) && conta.sessoesConta.map((sessao: CaixaSessao & { recebimentos: number; pagamentos: number; transfEntrada: number; transfSaida: number; saldoAberturaCalculado: number; saldoFinalCalculado: number }) => (
                                                            <tr
                                                                key={sessao.id}
                                                                className={`cursor-pointer transition-all hover:shadow-xs [&>td]:py-1.5 [&>td]:px-4 [&>td]:border-y [&>td]:border-r last:[&>td]:border-r-0 [&>td:first-child]:rounded-l-xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-xl [&>td:last-child]:border-r ${
                                                                    selectedSessoesIds.has(sessao.id)
                                                                        ? 'bg-indigo-50/60 [&>td]:border-indigo-300'
                                                                        : openMenuId === sessao.id || selectedRowId === sessao.id
                                                                        ? 'bg-indigo-50/40 [&>td]:border-indigo-200'
                                                                        : 'bg-slate-50/50 hover:bg-slate-100/60 [&>td]:border-slate-200/50'
                                                                }`}
                                                                title="Marque o dia, clique duplo para ver movimentações ou clique direito para ações"
                                                                onClick={() => {
                                                                    setSelectedRowId(sessao.id);
                                                                    setOpenMenuId(null);
                                                                }}
                                                                onDoubleClick={() => { void handleViewSessoesMovimentos([sessao]); }}
                                                                onContextMenu={(e) => {
                                                                    e.preventDefault();
                                                                    setSelectedRowId(sessao.id);
                                                                    setOpenMenuId(sessao.id);
                                                                    setMenuPosition({ x: e.clientX, y: e.clientY });
                                                                    setSelectedContaId(conta.id);
                                                                }}
                                                            >
                                                                <td className="align-middle relative">
                                                                    <div className="flex items-center justify-between pl-11">
                                                                        <div className="flex items-center h-full">
                                                                            {/* Three vertical guide lines */}
                                                                            <div className="w-[1px] h-5 bg-slate-200 mr-2" />
                                                                            <div className="w-[1px] h-5 bg-slate-200 mr-2" />
                                                                            <div className="w-[1px] h-5 bg-slate-300 relative mr-1.5">
                                                                                <div className="absolute top-1/2 left-0 w-2 h-[1px] bg-slate-300" />
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center justify-between flex-1 gap-2">
                                                                            <label
                                                                                className="flex items-center shrink-0 cursor-pointer"
                                                                                title="Selecionar este dia para ver movimentações consolidadas"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={selectedSessoesIds.has(sessao.id)}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    onChange={(e) => {
                                                                                        e.stopPropagation();
                                                                                        marcarSessaoSelecionada(sessao.id, e.target.checked);
                                                                                    }}
                                                                                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                                                />
                                                                            </label>
                                                                            <span
                                                                                className={`font-extrabold text-[10px] flex items-center gap-1 border px-2 py-0.5 rounded-md ${classesBadgeDataSessao(sessao.status)}`}
                                                                                title={rotuloStatusSessao(sessao.status)}
                                                                            >
                                                                                <Calendar className={`h-3 w-3 shrink-0 ${iconBadgeDataSessao(sessao.status)}`} />
                                                                                {formatDateBr(sessao.data_abertura)}
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer"
                                                                                title="Ações da sessão"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                                    setSelectedRowId(sessao.id);
                                                                                    setSelectedContaId(conta.id);
                                                                                    setOpenMenuId(sessao.id);
                                                                                    setMenuPosition({ x: rect.right, y: rect.bottom + 4 });
                                                                                }}
                                                                            >
                                                                                <MoreVertical className="h-3 w-3" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    {openMenuId === sessao.id && (
                                                                        <DropdownMenuContent
                                                                            isOpen={true}
                                                                            onClose={() => setOpenMenuId(null)}
                                                                            position={menuPosition}
                                                                        >
                                                                            <DropdownMenuItem onClick={() => { void abrirMovimentacoesSessaoOuSelecionadas(sessao); setOpenMenuId(null); }}>
                                                                                <Eye className="h-4 w-4 mr-2" /> Abrir movimentações
                                                                            </DropdownMenuItem>
                                                                            {sessao.status === 'fechado' && (
                                                                                <DropdownMenuItem onClick={() => { void reabrirSessaoDia(sessao, conta.id); setOpenMenuId(null); }}>
                                                                                    <Unlock className="h-4 w-4 mr-2 text-indigo-600" /> Reabrir dia
                                                                                </DropdownMenuItem>
                                                                            )}
                                                                            {sessaoPendenteConferencia(sessao) && (
                                                                                <DropdownMenuItem onClick={() => { void conferirSessao(sessao, conta.id); setOpenMenuId(null); }}>
                                                                                    <Lock className="h-4 w-4 mr-2 text-amber-600" /> Conferir e fechar o dia
                                                                                </DropdownMenuItem>
                                                                            )}
                                                                            <DropdownMenuItem onClick={() => { void iniciarAcaoRapidaConta(conta.id, 'entrada'); setOpenMenuId(null); }}>
                                                                                <ArrowDownCircle className="h-4 w-4 mr-2 text-emerald-600" /> Lançar entrada
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => { void iniciarAcaoRapidaConta(conta.id, 'saida'); setOpenMenuId(null); }}>
                                                                                <ArrowUpCircle className="h-4 w-4 mr-2 text-red-600" /> Lançar saída
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => { void iniciarAcaoRapidaConta(conta.id, 'suprimento'); setOpenMenuId(null); }}>
                                                                                <Plus className="h-4 w-4 mr-2 text-blue-600" /> Transferência (entrada)
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => { void iniciarAcaoRapidaConta(conta.id, 'sangria'); setOpenMenuId(null); }}>
                                                                                <Minus className="h-4 w-4 mr-2 text-orange-600" /> Transferência (saída)
                                                                            </DropdownMenuItem>
                                                                            {sessao.status === 'aberto' && (
                                                                                <DropdownMenuItem
                                                                                    variant="danger"
                                                                                    onClick={() => {
                                                                                        const dataSessao = formatDateBr(sessao.data_abertura);
                                                                                        const ok = window.confirm(`Confirma fechar o dia ${dataSessao}?`);
                                                                                        if (!ok) return;
                                                                                        void prepararFechamentoSessao(sessao, conta.id);
                                                                                        setOpenMenuId(null);
                                                                                    }}
                                                                                >
                                                                                    <Lock className="h-4 w-4 mr-2" /> Fechar o dia
                                                                                </DropdownMenuItem>
                                                                            )}
                                                                        </DropdownMenuContent>
                                                                    )}
                                                                </td>
                                                                <td className="text-right font-mono text-[11px] tabular-nums text-slate-650">{formatCentavos(sessao.saldoAberturaCalculado)}</td>
                                                                <td className="text-right font-mono text-[11px] tabular-nums text-emerald-600">{formatCentavos(sessao.recebimentos)}</td>
                                                                <td className="text-right font-mono text-[11px] tabular-nums text-rose-600">{formatCentavos(sessao.pagamentos)}</td>
                                                                <td className="text-right font-mono text-[11px] tabular-nums text-blue-600">{formatCentavos(sessao.transfEntrada)}</td>
                                                                <td className="text-right font-mono text-[11px] tabular-nums text-orange-600">{formatCentavos(sessao.transfSaida)}</td>
                                                                <td className="text-right font-mono text-[11px] tabular-nums font-bold text-slate-900">
                                                                    {formatCentavos(sessao.saldoFinalCalculado)}
                                                                </td>
                                                                <td className="text-xs font-semibold uppercase">
                                                                    <span className={`inline-flex items-center gap-1 text-[9px] ${classesIndicadorStatusSessao(sessao.status)}`}>
                                                                        {sessao.status === 'aberto' ? <Unlock className="h-2.5 w-2.5 animate-pulse" /> : <Lock className="h-2.5 w-2.5" />}
                                                                        {rotuloStatusSessao(sessao.status)}
                                                                    </span>
                                                                </td>
                                                                <td className="text-[10px] text-slate-600 whitespace-nowrap">
                                                                    {formatDateTimeBr(sessao.data_abertura)}
                                                                </td>
                                                                <td className="text-[10px] text-slate-600 whitespace-nowrap">
                                                                    {formatDateTimeBr(sessao.data_fechamento)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* ── Painel de Filtros e Busca ──────────────────── */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100/80">
                            {/* Busca */}
                            <div className="flex-1 max-w-md relative">
                                <input
                                    type="text"
                                    placeholder="Buscar por descrição, operador ou unidade..."
                                    value={movSearchQuery}
                                    onChange={(e) => setMovSearchQuery(e.target.value)}
                                    className="w-full h-10 pl-10 pr-4 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent hover:border-slate-300 transition-all duration-200"
                                />
                                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                {movSearchQuery && (
                                    <button
                                        onClick={() => setMovSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-full hover:bg-slate-100"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>

                            {/* Categoria Pills */}
                            <div className="flex flex-wrap gap-1.5 items-center">
                                {[
                                    { id: 'todos', label: 'Todos', count: countsPeriodo.todos, activeClass: 'bg-slate-900 text-white shadow-md shadow-slate-900/10', inactiveClass: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60' },
                                    { id: 'entrada', label: 'Entradas', count: countsPeriodo.entrada, activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10', inactiveClass: 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-100' },
                                    { id: 'saida', label: 'Saídas', count: countsPeriodo.saida, activeClass: 'bg-rose-600 text-white shadow-md shadow-rose-600/10', inactiveClass: 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-100' },
                                    { id: 'sangria', label: 'Sangrias', count: countsPeriodo.sangria, activeClass: 'bg-amber-600 text-white shadow-md shadow-amber-600/10', inactiveClass: 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-100' },
                                    { id: 'suprimento', label: 'Suprimentos', count: countsPeriodo.suprimento, activeClass: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10', inactiveClass: 'bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-100' },
                                ].map((pill) => {
                                    const isSelected = movTipoFilter === pill.id;
                                    return (
                                        <button
                                            key={pill.id}
                                            onClick={() => setMovTipoFilter(pill.id)}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none ${
                                                isSelected ? pill.activeClass : pill.inactiveClass
                                            }`}
                                        >
                                            {pill.label}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${
                                                isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {pill.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── Tabela de Movimentações ──────────────────── */}
                        <div className="overflow-x-auto p-4 bg-slate-50/30 rounded-xl border border-slate-100/60 shadow-xs">
                            {loadingMovsPeriodo ? (
                                <div className="p-16 text-center flex flex-col items-center justify-center bg-white rounded-xl">
                                    <RefreshCw className="h-10 w-10 text-accent animate-spin mb-3" />
                                    <p className="text-sm font-semibold text-slate-600">Carregando movimentações do período...</p>
                                </div>
                            ) : paginatedMovimentos.length > 0 ? (
                                <table className="w-full text-sm border-separate border-spacing-y-2 border-spacing-x-0">
                                    <thead className="text-slate-400 uppercase text-[10px] tracking-wider font-extrabold select-none">
                                        <tr>
                                            <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[110px]">Data/Hora</th>
                                            <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[150px]">Unidade</th>
                                            <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[200px]">Caixa / Conta</th>
                                            <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[110px]">Tipo</th>
                                            <th className="text-left pb-2 pt-1 px-4 font-bold min-w-[300px]">Descrição</th>
                                            <th className="text-right pb-2 pt-1 px-4 font-bold min-w-[125px]">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedMovimentos.map((mov) => {
                                            const config = tipoMovLabels[mov.tipo] || tipoMovLabels.entrada;
                                            const isNegative = ["saida", "sangria"].includes(mov.tipo);
                                            return (
                                                <tr 
                                                    key={mov.id} 
                                                    onClick={() => {
                                                        setSelectedRowId(mov.id);
                                                        setOpenMenuId(null);
                                                    }}
                                                    onContextMenu={(e) => abrirMenuMovimento(mov, e)}
                                                    className={`cursor-pointer transition-all hover:shadow-xs [&>td]:py-3 [&>td]:px-4 [&>td]:border-y [&>td]:border-r last:[&>td]:border-r-0 [&>td:first-child]:rounded-l-xl [&>td:first-child]:border-l [&>td:last-child]:rounded-r-xl [&>td:last-child]:border-r ${
                                                        openMenuId === mov.id || selectedRowId === mov.id
                                                            ? 'bg-slate-100 [&>td]:border-slate-350 shadow-xs'
                                                            : 'bg-white hover:bg-slate-50/70 [&>td]:border-slate-200/60'
                                                    }`}
                                                >
                                                    <td className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                                                        {mov.data_movimentacao
                                                            ? new Date(`${mov.data_movimentacao}T12:00:00`).toLocaleDateString('pt-BR')
                                                            : new Date(mov.created_at).toLocaleString('pt-BR', {
                                                                  day: '2-digit',
                                                                  month: '2-digit',
                                                                  hour: '2-digit',
                                                                  minute: '2-digit',
                                                              })}
                                                    </td>
                                                    <td className="text-xs font-medium text-slate-600 whitespace-normal break-words">
                                                        {empresaNomePorId.get(mov.empresa_id) || '—'}
                                                    </td>
                                                    <td className="text-xs font-medium text-slate-700 whitespace-normal break-words">
                                                        {rotuloContaMovimento(mov)}
                                                    </td>
                                                    <td>
                                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${config.color}`}>
                                                            {config.label}
                                                        </span>
                                                    </td>
                                                    <td className="relative whitespace-normal break-words text-xs text-slate-900 leading-relaxed">
                                                        <div className="font-semibold">{mov.descricao}</div>
                                                        {mov.usuario_nome && (
                                                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                                Operador: {mov.usuario_nome}
                                                            </div>
                                                        )}

                                                        {renderMenuAcoesMovimento(mov)}
                                                    </td>
                                                    <td className={`text-right font-mono text-xs tabular-nums font-bold ${isNegative ? "text-rose-600" : "text-emerald-600"}`}>
                                                        {isNegative ? "-" : "+"}{formatCentavos(mov.valor_centavos)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-16 text-center bg-white rounded-xl border border-slate-200/60 shadow-xs">
                                    <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                                    <p className="text-sm font-semibold text-slate-500">Nenhuma movimentação encontrada com os filtros aplicados.</p>
                                </div>
                            )}
                        </div>

                        {/* ── Paginação ──────────────────── */}
                        {!loadingMovsPeriodo && totalPages > 1 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100/80 mt-2">
                                <span className="text-xs font-semibold text-slate-500">
                                    Exibindo {((movCurrentPage - 1) * itemsPerPage) + 1} a {Math.min(movCurrentPage * itemsPerPage, movimentosFiltradosPeriodo.length)} de {movimentosFiltradosPeriodo.length} movimentações
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        disabled={movCurrentPage === 1}
                                        onClick={() => setMovCurrentPage((p) => Math.max(1, p - 1))}
                                        className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer select-none"
                                    >
                                        Anterior
                                    </button>
                                    {Array.from({ length: totalPages }).map((_, idx) => {
                                        const pNum = idx + 1;
                                        if (totalPages > 5 && Math.abs(pNum - movCurrentPage) > 1 && pNum !== 1 && pNum !== totalPages) {
                                            if (pNum === 2 || pNum === totalPages - 1) {
                                                return <span key={pNum} className="text-slate-400 text-xs px-1">...</span>;
                                            }
                                            return null;
                                        }
                                        return (
                                            <button
                                                key={pNum}
                                                onClick={() => setMovCurrentPage(pNum)}
                                                className={`h-8 w-8 rounded-lg text-xs font-bold border transition-all cursor-pointer select-none ${
                                                    movCurrentPage === pNum
                                                        ? 'bg-accent text-white border-accent shadow-sm shadow-accent/15'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                {pNum}
                                            </button>
                                        );
                                    })}
                                    <button
                                        disabled={movCurrentPage === totalPages}
                                        onClick={() => setMovCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer select-none"
                                    >
                                        Próximo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {/* Session History Container */}
            {showHistory && (
                <Card className="overflow-hidden shadow-md border border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <History className="h-5 w-5 text-slate-500" />
                            Histórico de dias encerrados
                        </h3>
                        <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-150">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {sessoes.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-[10px] tracking-wider font-bold">
                                    <tr>
                                        <th className="text-left py-3 px-4 font-bold min-w-[130px]">Abertura</th>
                                        <th className="text-left py-3 px-4 font-bold min-w-[130px]">Fechamento</th>
                                        <th className="text-right py-3 px-4 font-bold min-w-[125px]">Saldo Abertura</th>
                                        <th className="text-right py-3 px-4 font-bold min-w-[125px]">Saldo Sistema</th>
                                        <th className="text-right py-3 px-4 font-bold min-w-[125px]">Saldo Informado</th>
                                        <th className="text-right py-3 px-4 font-bold min-w-[125px]">Diferença</th>
                                        <th className="text-center py-3 px-4 font-bold min-w-[105px]">Status</th>
                                        <th className="text-right py-3 px-4 font-bold min-w-[150px]">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sessoes.map(s => (
                                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="py-3 px-4 text-slate-800 font-semibold whitespace-nowrap">
                                                {formatDateTimeBr(s.data_abertura)}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 font-medium whitespace-nowrap">
                                                {s.data_fechamento ? formatDateTimeBr(s.data_fechamento) : '—'}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">{formatCentavos(s.saldo_abertura_centavos)}</td>
                                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700">{formatCentavos(s.saldo_sistema_centavos)}</td>
                                            <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 font-medium">
                                                {s.saldo_informado_centavos != null ? formatCentavos(s.saldo_informado_centavos) : '—'}
                                            </td>
                                            <td className={`py-3 px-4 text-right font-mono text-xs tabular-nums font-bold ${(s.diferenca_centavos ?? 0) === 0 ? 'text-emerald-600' :
                                                (s.diferenca_centavos ?? 0) > 0 ? 'text-accent' : 'text-rose-600'
                                                }`}>
                                                {s.diferenca_centavos != null ? formatCentavos(s.diferenca_centavos) : '—'}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${classesPillStatusSessao(s.status)}`}>
                                                    {s.status === 'aberto' ? <Unlock className="h-3 w-3 animate-pulse" /> : <Lock className="h-3 w-3" />}
                                                    {rotuloStatusSessao(s.status)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex justify-end gap-1.5">
                                                    {s.status === 'fechado' && selectedContaId && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8.5 px-3 border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-semibold rounded-lg shadow-sm"
                                                            onClick={() => { void reabrirSessaoDia(s, selectedContaId); }}
                                                        >
                                                            <Unlock className="h-3.5 w-3.5 mr-1.5" />
                                                            Reabrir
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8.5 px-3 border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg shadow-sm"
                                                        onClick={() => handleViewSessaoMovimentos(s)}
                                                    >
                                                        <Receipt className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                                                        Movimentos
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-16 text-center text-slate-500">
                            Nenhum dia encerrado no histórico.
                        </div>
                    )}
                </Card>
            )}

{/* ==================== MODALS ==================== */}
            {modal && (
                <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[96vh] animate-in zoom-in-95 duration-200">

                        {/* ── Header ──────────────────────────────── */}
                        <div className={`flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4.5 rounded-t-2xl flex-shrink-0 ${
                            modal === 'abrir'      ? 'bg-gradient-to-br from-emerald-500 to-green-600' :
                            modal === 'fechar'     ? 'bg-gradient-to-br from-slate-700 to-slate-900' :
                            modal === 'sangria'    ? 'bg-gradient-to-br from-orange-500 to-amber-600' :
                                                    'bg-gradient-to-br from-blue-500 to-blue-700'
                        }`}>
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                                    {modal === 'abrir'      && <Unlock className="h-5.5 w-5.5 text-white" />}
                                    {modal === 'fechar'     && <Lock   className="h-5.5 w-5.5 text-white" />}
                                    {modal === 'sangria'    && <Minus  className="h-5.5 w-5.5 text-white" />}
                                    {modal === 'suprimento' && <Plus   className="h-5.5 w-5.5 text-white" />}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                                        {modal === 'abrir'      && 'Abrir Caixa'}
                                        {modal === 'fechar'     && 'Fechar o dia'}
                                        {modal === 'sangria'    && 'Sangria de Caixa'}
                                        {modal === 'suprimento' && 'Suprimento de Caixa'}
                                    </h2>
                                    <p className="text-white/70 text-xs mt-0.5 whitespace-normal break-words leading-relaxed max-w-xs sm:max-w-md">
                                        {selectedConta?.nome || 'Caixa'}
                                        {modal === 'fechar' && sessaoEmFechamento && (
                                            <> · sessão de {formatDateTimeBr(sessaoEmFechamento.data_abertura)}</>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={resetModal}
                                className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/15 transition-colors flex-shrink-0 ml-3"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* ── Body (scrollável) ──────────────────── */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">

                            {/* Saldo disponível para Sangria/Suprimento */}
                            {(modal === 'sangria' || modal === 'suprimento') && sessaoAtual && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-2.5">
                                        <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                                            <Wallet className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saldo Disponível no Caixa</p>
                                            <p className="text-sm font-bold text-slate-700 mt-0.5">{selectedConta?.nome || 'Caixa'}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold font-mono text-emerald-650 tabular-nums">
                                            {formatCentavos(saldoSistema)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Tabela de conferência — só no fechamento */}
                            {modal === 'fechar' && (
                                <div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Saldo de abertura</p>
                                            <p className="text-lg font-bold font-mono text-slate-800 tabular-nums mt-1">
                                                {formatCentavos(saldoAberturaFechamento)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                                            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Saldo final (sistema)</p>
                                            <p className="text-lg font-bold font-mono text-blue-900 tabular-nums mt-1">
                                                {formatCentavos(saldoFinalSistemaFechamento)}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Sua contagem (total)</p>
                                            <p className="text-lg font-bold font-mono text-emerald-900 tabular-nums mt-1">
                                                {formatCentavos(totalContagemFechamentoCentavos)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2.5">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            Conferência por forma de recebimento
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setContagemFechamento({
                                                    especie: ((permiteSaldoNegativoConta ? sistemaPorForma.especie : Math.max(0, sistemaPorForma.especie)) / 100).toFixed(2),
                                                    cartao_credito: ((permiteSaldoNegativoConta ? sistemaPorForma.cartao_credito : Math.max(0, sistemaPorForma.cartao_credito)) / 100).toFixed(2),
                                                    cartao_debito: ((permiteSaldoNegativoConta ? sistemaPorForma.cartao_debito : Math.max(0, sistemaPorForma.cartao_debito)) / 100).toFixed(2),
                                                    cheque: ((permiteSaldoNegativoConta ? sistemaPorForma.cheque : Math.max(0, sistemaPorForma.cheque)) / 100).toFixed(2),
                                                    pix_outros: ((permiteSaldoNegativoConta ? sistemaPorForma.pix_outros : Math.max(0, sistemaPorForma.pix_outros)) / 100).toFixed(2),
                                                });
                                            }}
                                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 border border-slate-300 rounded-lg transition-colors outline-none cursor-pointer select-none"
                                        >
                                            ⚡ Preencher todos com o Sistema
                                        </button>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                        {/* Cabeçalho */}
                                        <div className="grid grid-cols-12 bg-slate-800 px-3 sm:px-4 py-2 text-[10px] sm:text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                                            <div className="col-span-4">Forma</div>
                                            <div className="col-span-5 text-center">Contagem manual</div>
                                            <div className="col-span-3 text-right">Sistema</div>
                                        </div>
                                        {/* Linhas */}
                                        {([
                                            { key: 'especie',        label: 'Espécie',       icon: '💵' },
                                            { key: 'cartao_credito', label: 'Crédito',        icon: '💳' },
                                            { key: 'cartao_debito',  label: 'Débito',         icon: '💳' },
                                            { key: 'cheque',         label: 'Cheque',         icon: '📄' },
                                            { key: 'pix_outros',     label: 'PIX / Outros',   icon: '📲' },
                                        ] as { key: string; label: string; icon: string }[]).map((row, idx) => (
                                            <div
                                                key={row.key}
                                                className={`grid grid-cols-12 items-center px-3 sm:px-4 py-1.5 sm:py-2 border-b last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                                            >
                                                <div className="col-span-4 flex items-center gap-1.5 text-xs sm:text-sm text-slate-700 font-medium min-w-0">
                                                    <span className="text-sm sm:text-base leading-none">{row.icon}</span>
                                                    <span className="truncate">{row.label}</span>
                                                </div>
                                                <div className="col-span-5 px-1.5 flex items-center gap-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min={permiteSaldoNegativoConta ? undefined : '0'}
                                                        value={contagemFechamento[row.key] ?? ''}
                                                        onChange={(e) =>
                                                            setContagemFechamento((prev) => ({ ...prev, [row.key]: e.target.value }))
                                                        }
                                                        className="h-8 sm:h-9 text-xs sm:text-sm font-semibold text-center tabular-nums flex-1 px-1 sm:px-2"
                                                        placeholder="0,00"
                                                    />
                                                    <button
                                                        type="button"
                                                        title="Copiar valor do sistema"
                                                        onClick={() => {
                                                            const val = sistemaPorForma[row.key as keyof typeof sistemaPorForma];
                                                            const valFormat = ((permiteSaldoNegativoConta ? val : Math.max(0, val)) / 100).toFixed(2);
                                                            setContagemFechamento((prev) => ({ ...prev, [row.key]: valFormat }));
                                                        }}
                                                        className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0 cursor-pointer text-xs sm:text-sm select-none"
                                                    >
                                                        ⚡
                                                    </button>
                                                </div>
                                                <div className="col-span-3 text-right text-xs sm:text-sm font-semibold tabular-nums text-slate-600">
                                                    {formatCentavos(sistemaPorForma[row.key as keyof typeof sistemaPorForma])}
                                                </div>
                                            </div>
                                        ))}
                                        {/* Total */}
                                        <div className="grid grid-cols-12 items-center px-3 sm:px-4 py-2.5 bg-slate-800">
                                            <div className="col-span-4 text-xs sm:text-sm font-bold text-white">Total / Saldo final</div>
                                            <div className="col-span-5 text-center text-xs sm:text-sm font-bold text-white tabular-nums">
                                                {formatCentavos(totalContagemFechamentoCentavos)}
                                            </div>
                                            <div className="col-span-3 text-right text-xs sm:text-sm font-bold text-slate-300 tabular-nums">
                                                {formatCentavos(saldoFinalSistemaFechamento)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Data de referência — só na abertura */}
                            {modal === 'abrir' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Data de Referência <span className="text-red-500">*</span>
                                    </label>
                                    <Input
                                        type="date"
                                        value={modalDataRef}
                                        onChange={(e) => setModalDataRef(e.target.value)}
                                        className="text-sm font-semibold"
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-400 mt-1.5">
                                        Use uma data anterior para lançamentos retroativos.
                                    </p>
                                </div>
                            )}

                            {/* Valor — Sangria e Suprimento */}
                            {(modal === 'sangria' || modal === 'suprimento') && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        {modal === 'sangria'    && 'Valor da Sangria (R$)'}
                                        {modal === 'suprimento' && 'Valor do Suprimento (R$)'}
                                    </label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={modalValor}
                                        onChange={(e) => setModalValor(e.target.value)}
                                        className="text-lg font-semibold"
                                        placeholder="0.00"
                                        autoFocus
                                    />
                                </div>
                            )}

                            {/* Conta de destino — Sangria */}
                            {modal === 'sangria' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Conta de Destino
                                        <span className="text-gray-400 font-normal ml-1">(Para onde vai?)</span>
                                    </label>
                                    <Select
                                        value={modalContaDestinoId}
                                        onChange={(e) => setModalContaDestinoId(e.target.value)}
                                        className="w-full"
                                    >
                                        <option value="">Selecione a conta...</option>
                                        {contasBancarias
                                            .filter(c => c.id !== selectedContaId && c.ativo)
                                            .map(conta => (
                                                <option key={conta.id} value={conta.id}>
                                                    {conta.nome} ({conta.tipo})
                                                </option>
                                            ))}
                                    </Select>
                                </div>
                            )}

                            {/* Conta de origem — Suprimento */}
                            {modal === 'suprimento' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Conta de Origem
                                        <span className="text-gray-400 font-normal ml-1">(De onde vem?)</span>
                                    </label>
                                    <Select
                                        value={modalContaOrigemId}
                                        onChange={(e) => setModalContaOrigemId(e.target.value)}
                                        className="w-full"
                                    >
                                        <option value="">Selecione a conta...</option>
                                        {contasBancarias
                                            .filter(c => c.id !== selectedContaId && c.ativo)
                                            .map(conta => (
                                                <option key={conta.id} value={conta.id}>
                                                    {conta.nome} ({conta.tipo})
                                                </option>
                                            ))}
                                    </Select>
                                </div>
                            )}

                            {/* Card de diferença — fechamento */}
                            {modal === 'fechar' && (
                                <div className={`rounded-xl px-5 py-4 border-2 flex items-start gap-3 ${
                                    totalContagemFechamentoCentavos === saldoFinalSistemaFechamento
                                        ? 'bg-emerald-50 border-emerald-200'
                                        : 'bg-amber-50 border-amber-200'
                                }`}>
                                    <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                                        totalContagemFechamentoCentavos === saldoFinalSistemaFechamento ? 'bg-emerald-100' : 'bg-amber-100'
                                    }`}>
                                        {totalContagemFechamentoCentavos === saldoFinalSistemaFechamento
                                            ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                            : <AlertTriangle className="h-5 w-5 text-amber-600" />
                                        }
                                    </div>
                                    <div>
                                        <p className={`text-sm font-semibold ${
                                            totalContagemFechamentoCentavos === saldoFinalSistemaFechamento ? 'text-emerald-800' : 'text-amber-800'
                                        }`}>
                                            {totalContagemFechamentoCentavos === saldoFinalSistemaFechamento
                                                ? 'Conferência sem divergência'
                                                : `Divergência: ${formatCentavos(totalContagemFechamentoCentavos - saldoFinalSistemaFechamento)}`
                                            }
                                        </p>
                                        <p className={`text-xs mt-0.5 ${
                                            totalContagemFechamentoCentavos === saldoFinalSistemaFechamento ? 'text-emerald-600' : 'text-amber-700'
                                        }`}>
                                            {totalContagemFechamentoCentavos === saldoFinalSistemaFechamento
                                                ? 'Valores batem com o sistema. Pode encerrar o dia.'
                                                : 'Registre a ressalva nas observações.'}
                                        </p>
                                        {permiteSaldoNegativoConta && (
                                            <span className="inline-block mt-1.5 text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                                                Conta permite saldo negativo
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Observações */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Observações
                                    {modal !== 'fechar' && <span className="text-gray-400 font-normal"> (opcional)</span>}
                                </label>
                                <textarea
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-shadow"
                                    rows={2}
                                    placeholder={
                                        modal === 'sangria'    ? 'Motivo da sangria...' :
                                        modal === 'suprimento' ? 'Motivo do suprimento...' :
                                        modal === 'fechar'     ? 'Ressalvas, observações do fechamento...' :
                                                                 'Observações...'
                                    }
                                    value={modalObs}
                                    onChange={(e) => setModalObs(e.target.value)}
                                />
                                {modal === 'fechar' && (
                                    <ul className="mt-2 text-[11px] text-gray-400 space-y-0.5 list-disc list-inside">
                                        <li>Confira os lançamentos de entrada e saída do dia.</li>
                                        <li>Realize a contagem manual por forma de recebimento.</li>
                                        <li>Registre ressalva em caso de divergência.</li>
                                    </ul>
                                )}
                            </div>

                            {/* Erro */}
                            {modalError && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                    <span>{modalError}</span>
                                </div>
                            )}
                        </div>

                        {/* ── Footer ──────────────────────────────── */}
                        <div className="flex items-center gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
                            <Button variant="outline" className="flex-1" onClick={resetModal} disabled={modalLoading}>
                                Cancelar
                            </Button>
                            <Button
                                className={`flex-1 text-white font-semibold shadow-md ${
                                    modal === 'abrir'      ? 'bg-gradient-to-r from-emerald-600 to-green-500' :
                                    modal === 'fechar'     ? 'bg-gradient-to-r from-slate-700 to-slate-600'   :
                                    modal === 'sangria'    ? 'bg-gradient-to-r from-orange-600 to-amber-500'  :
                                                            'bg-gradient-to-r from-blue-600 to-blue-500'
                                }`}
                                onClick={
                                    modal === 'abrir'      ? handleOpenCaixa  :
                                    modal === 'fechar'     ? handleCloseCaixa :
                                    modal === 'sangria'    ? handleSangria    :
                                                            handleSuprimento
                                }
                                loading={modalLoading}
                            >
                                {modal === 'abrir'      && <><Unlock className="h-4 w-4 mr-2" />Abrir Caixa</>}
                                {modal === 'fechar'     && <><Lock   className="h-4 w-4 mr-2" />Confirmar fechamento do dia</>}
                                {modal === 'sangria'    && <><Minus  className="h-4 w-4 mr-2" />Registrar Sangria</>}
                                {modal === 'suprimento' && <><Plus   className="h-4 w-4 mr-2" />Registrar Suprimento</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}


            {/* ==================== MOVEMENTS MODAL ==================== */}
            {viewingSessaoId && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" id="printable-session-report-root">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-[98vw] w-full max-h-[92vh] flex flex-col" id="printable-session-report">
                        <div className="flex items-center justify-between p-4 border-b no-print">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                    <Receipt className="h-5 w-5 text-blue-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-base sm:text-lg font-bold text-gray-900 whitespace-normal break-words py-0.5 leading-snug">
                                        Conta: {sessaoConta?.nome || 'Conta não identificada'}
                                        {sessaoConta?.banco_nome ? ` - ${sessaoConta.banco_nome}` : ''}
                                        {' '} - {multiSessaoVisualizada ? 'Período' : 'Data do Caixa'}: {rotuloPeriodoSessoes}
                                    </h2>
                                    <p className="text-gray-500 text-xs sm:text-sm whitespace-normal break-words py-0.5 leading-relaxed">
                                        {multiSessaoVisualizada
                                            ? `${viewingSessoesLista.length} sessões consolidadas`
                                            : `Sessão ${viewingSessaoId?.slice(0, 8)}...`}
                                        {sessaoConta?.agencia ? ` • AG ${sessaoConta.agencia}` : ''} {sessaoConta?.conta ? ` • C/C ${sessaoConta.conta}` : ''}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button 
                                    onClick={imprimirPdfSessaoVisualizada}
                                    variant="outline" 
                                    size="sm"
                                    disabled={printingCaixa}
                                >
                                    <Printer className={`h-4 w-4 mr-2 ${printingCaixa ? 'animate-pulse' : ''}`} />
                                    {printingCaixa ? 'Gerando...' : 'PDF'}
                                </Button>
                                <button onClick={fecharModalMovimentacoes} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="hidden print:block px-4 py-3 border-b print-only-header">
                            <h1 className="text-lg font-bold text-gray-900">Relatório de movimentações do caixa</h1>
                            <p className="text-sm text-gray-700 mt-1">
                                Conta: {sessaoConta?.nome || '—'}
                                {sessaoConta?.banco_nome ? ` — ${sessaoConta.banco_nome}` : ''}
                            </p>
                            <p className="text-sm text-gray-700">
                                {multiSessaoVisualizada ? 'Período' : 'Data do caixa'}: {rotuloPeriodoSessoes}
                                {' · '}
                                Status: {sessaoAberta ? 'Aberto' : 'Dia encerrado'}
                                {' · '}
                                Impresso em: {formatDateTimeBr(new Date().toISOString())}
                            </p>
                            <div className="grid grid-cols-4 gap-2 mt-3 text-sm">
                                <div><span className="text-gray-500">Saldo anterior</span><br /><strong>{formatCentavos(sessaoSaldoAnterior)}</strong></div>
                                <div><span className="text-gray-500">Total entrada</span><br /><strong className="text-emerald-700">{formatCentavos(sessaoTotais.entradas)}</strong></div>
                                <div><span className="text-gray-500">Total saída</span><br /><strong className="text-red-700">{formatCentavos(sessaoTotais.saidas)}</strong></div>
                                <div><span className="text-gray-500">Saldo final</span><br /><strong>{formatCentavos(sessaoSaldoFinal)}</strong></div>
                            </div>
                        </div>

                        <div className="px-4 py-3 border-b bg-gray-50 grid grid-cols-1 md:grid-cols-4 gap-2 no-print">
                            <Input
                                placeholder="Cliente / fornecedor / histórico / usuário"
                                value={sessaoSearch}
                                onChange={(e) => setSessaoSearch(e.target.value)}
                            />
                            <Select value={sessaoTipoFilter} onChange={(e) => setSessaoTipoFilter(e.target.value)}>
                                <option value="todos">-- Tipos --</option>
                                <option value="entrada">Entrada</option>
                                <option value="saida">Saída</option>
                                <option value="suprimento">Transferência Entrada</option>
                                <option value="sangria">Transferência Saída</option>
                            </Select>
                            <Select value={sessaoFormaFilter} onChange={(e) => setSessaoFormaFilter(e.target.value)}>
                                <option value="todos">-- Forma de Pagamento --</option>
                                <option value="sem_forma">Sem forma informada</option>
                                <option value="especie">Espécie</option>
                                <option value="pix">PIX</option>
                                <option value="cartao_credito">Cartão Crédito</option>
                                <option value="cartao_debito">Cartão Débito</option>
                                <option value="cheque">Cheque</option>
                                <option value="boleto">Boleto</option>
                            </Select>
                            <Button variant="outline" onClick={() => { setSessaoSearch(''); setSessaoTipoFilter('todos'); setSessaoFormaFilter('todos'); }}>
                                Limpar filtros
                            </Button>
                        </div>

                        <div className="flex-1 overflow-x-auto overflow-y-auto p-0" id="printable-session-history">
                            {sessaoFiltrosAtivos && (
                                <p className="no-print px-3 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-200">
                                    Filtros ativos: exibindo {sessaoMovimentosFiltrados.length} de {sessaoMovimentos.length} lançamentos.
                                    Os totais do rodapé consideram todos os lançamentos do dia selecionado.
                                </p>
                            )}
                            {loadingSessaoMovs ? (
                                <div className="flex items-center justify-center py-12">
                                    <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
                                </div>
                            ) : sessaoMovimentosFiltrados.length > 0 ? (
                                <table className="w-full text-sm min-w-[1380px] print:hidden">
                                    <thead>
                                        <tr className="text-left border-b bg-slate-800 text-slate-100 text-[11px] uppercase tracking-wider">
                                            {multiSessaoVisualizada && (
                                                <th className="py-2 px-3 font-semibold whitespace-nowrap">Data caixa</th>
                                            )}
                                            <th className="py-2 px-3 font-semibold">Dt.Créd./Débito</th>
                                            <th className="py-2 px-3 font-semibold">Documento</th>
                                            <th className="py-2 px-3 font-semibold">Forma Pagamento</th>
                                            <th className="py-2 px-3 font-semibold">Natureza</th>
                                            <th className="py-2 px-3 font-semibold text-right">Entrada</th>
                                            <th className="py-2 px-3 font-semibold text-right">Saída</th>
                                            <th className="py-2 px-3 font-semibold">Histórico</th>
                                            <th className="py-2 px-3 font-semibold text-center min-w-[110px]">Conciliação</th>
                                            <th className="py-2 px-3 font-semibold min-w-[120px]">Usuário conciliação</th>
                                            <th className="py-2 px-3 font-semibold min-w-[130px] whitespace-nowrap">Data conciliação</th>
                                            <th className="py-2 px-3 font-semibold">Usuário lançamento</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {sessaoMovimentosFiltrados.map(mov => {
                                            const config = tipoMovLabels[mov.tipo] || tipoMovLabels.entrada;
                                            const isEntrada = ['entrada', 'suprimento'].includes(mov.tipo);
                                            const formaLabel = rotuloFormaPagamento(mov.forma_pagamento);
                                            return (
                                                <tr
                                                    key={mov.id}
                                                    onClick={() => {
                                                        setSelectedRowId(mov.id);
                                                        setOpenMenuId(null);
                                                    }}
                                                    onContextMenu={(e) => abrirMenuMovimento(mov, e)}
                                                    className={`cursor-pointer transition-colors hover:bg-blue-50/60 ${
                                                        openMenuId === mov.id || selectedRowId === mov.id ? 'bg-blue-50/80' : ''
                                                    }`}
                                                    title="Clique com o botão direito para ver as opções"
                                                >
                                                    {multiSessaoVisualizada && (
                                                        <td className="py-2 px-3 text-gray-600 whitespace-nowrap text-xs font-semibold">
                                                            {formatDateBr(sessaoDataPorId.get(mov.sessao_id) || mov.created_at)}
                                                        </td>
                                                    )}
                                                    <td className="py-2 px-3 text-gray-700 whitespace-nowrap">
                                                        <span className="print:hidden">{formatDateBr(dataMovimentoEfetiva(mov))}</span>
                                                        <span className="hidden print:inline">{formatDateTimeBr(mov.created_at)}</span>
                                                    </td>
                                                    <td className="py-2 px-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                                                        {mov.referencia_id ? mov.referencia_id.slice(0, 8) : mov.id.slice(0, 8)}
                                                    </td>
                                                    <td className="py-2 px-3 text-gray-700 capitalize whitespace-nowrap">
                                                        {formaLabel}
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${config.color}`}>
                                                            {config.label}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                                                        {isEntrada ? formatCentavos(mov.valor_centavos) : 'R$ 0,00'}
                                                    </td>
                                                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-red-600 whitespace-nowrap">
                                                        {!isEntrada ? formatCentavos(mov.valor_centavos) : 'R$ 0,00'}
                                                    </td>
                                                    <td className="relative py-2 px-3 text-gray-900 font-medium min-w-[200px] max-w-[320px] whitespace-normal break-words leading-relaxed" title={mov.descricao}>
                                                        {mov.descricao}
                                                        {renderMenuAcoesMovimento(mov)}
                                                    </td>
                                                    <td
                                                        className="py-2 px-3 text-center text-xs"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {movimentoEstaConciliado(mov) ? (
                                                            <div className="inline-flex flex-col items-center gap-1">
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                                    Conciliado
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    title="Estornar conciliação"
                                                                    disabled={conciliandoMovId === mov.id}
                                                                    onClick={() => void estornarConciliacaoMovimento(mov)}
                                                                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                                                                >
                                                                    <RotateCcw className="h-3 w-3" />
                                                                    {conciliandoMovId === mov.id ? 'Salvando…' : 'Estornar'}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="inline-flex flex-col items-center gap-1">
                                                                <span className="text-[10px] font-semibold text-amber-700">Não conciliado</span>
                                                                <button
                                                                    type="button"
                                                                    title="Confirmar conciliação"
                                                                    disabled={conciliandoMovId === mov.id}
                                                                    onClick={() => void marcarMovimentoConciliado(mov)}
                                                                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                                                                >
                                                                    <Hand className="h-3.5 w-3.5" />
                                                                    {conciliandoMovId === mov.id ? 'Salvando…' : 'Conciliar'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3 text-xs text-gray-800 min-w-[120px] whitespace-normal break-words leading-relaxed">
                                                        {movimentoEstaConciliado(mov)
                                                            ? (mov.conciliado_por_nome || '—')
                                                            : '—'}
                                                    </td>
                                                    <td className="py-2 px-3 text-xs text-gray-800 whitespace-nowrap">
                                                        {movimentoEstaConciliado(mov)
                                                            ? formatDateTimeBr(mov.conciliado_em || mov.created_at)
                                                            : '—'}
                                                    </td>
                                                    <td className="py-2 px-3 text-xs text-gray-700 min-w-[120px] max-w-[200px] whitespace-normal break-words leading-relaxed" title={mov.usuario_nome || 'Sistema'}>
                                                        {mov.usuario_nome || 'Sistema'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="text-center py-12">
                                    <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500">
                                        Nenhuma movimentação registrada no período selecionado.
                                    </p>
                                </div>
                            )}

                            {sessaoMovimentos.length > 0 && (
                                <div className="hidden print:block px-2 pb-2" id="printable-session-history-full">
                                    <p className="text-xs font-bold uppercase text-slate-600 mb-2">
                                        Lançamentos do período ({sessaoMovimentos.length})
                                    </p>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b text-left">
                                                <th className="py-1 pr-2">Data/Hora</th>
                                                <th className="py-1 pr-2">Forma</th>
                                                <th className="py-1 pr-2">Tipo</th>
                                                <th className="py-1 pr-2 text-right">Entrada</th>
                                                <th className="py-1 pr-2 text-right">Saída</th>
                                                <th className="py-1">Histórico</th>
                                                <th className="py-1">Usuário</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {sessaoMovimentos.map((mov) => {
                                                const isEntrada = ['entrada', 'suprimento'].includes(mov.tipo);
                                                const config = tipoMovLabels[mov.tipo] || tipoMovLabels.entrada;
                                                return (
                                                    <tr key={`print-${mov.id}`}>
                                                        <td className="py-1 pr-2 whitespace-nowrap">{formatDateTimeBr(mov.created_at)}</td>
                                                        <td className="py-1 pr-2">{rotuloFormaPagamento(mov.forma_pagamento)}</td>
                                                        <td className="py-1 pr-2">{config.label}</td>
                                                        <td className="py-1 pr-2 text-right tabular-nums">
                                                            {isEntrada ? formatCentavos(mov.valor_centavos) : '—'}
                                                        </td>
                                                        <td className="py-1 pr-2 text-right tabular-nums">
                                                            {!isEntrada ? formatCentavos(mov.valor_centavos) : '—'}
                                                        </td>
                                                        <td className="py-1 min-w-[150px] max-w-[320px] whitespace-normal break-words leading-relaxed">{mov.descricao}</td>
                                                        <td className="py-1">{mov.usuario_nome || 'Sistema'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 text-sm print:hidden">
                                <div className="rounded border bg-white px-3 py-2">
                                    <p className="text-[11px] text-gray-500">Saldo Anterior</p>
                                    <p className="font-semibold tabular-nums">{formatCentavos(sessaoSaldoAnterior)}</p>
                                </div>
                                <div className="rounded border bg-white px-3 py-2">
                                    <p className="text-[11px] text-gray-500">Total Entrada</p>
                                    <p className="font-semibold tabular-nums text-emerald-600">{formatCentavos(sessaoTotais.entradas)}</p>
                                </div>
                                <div className="rounded border bg-white px-3 py-2">
                                    <p className="text-[11px] text-gray-500">Total Saída</p>
                                    <p className="font-semibold tabular-nums text-red-600">{formatCentavos(sessaoTotais.saidas)}</p>
                                </div>
                                <div className="rounded border bg-white px-3 py-2">
                                    <p className="text-[11px] text-gray-500">Saldo Final</p>
                                    <p className="font-semibold tabular-nums">{formatCentavos(sessaoSaldoFinal)}</p>
                                </div>
                                <div className="rounded border bg-white px-3 py-2">
                                    <p className="text-[11px] text-gray-500">Lançamentos</p>
                                    <p className="font-semibold tabular-nums">{sessaoMovimentos.length}</p>
                                    {multiSessaoVisualizada && (
                                        <p className="text-[10px] text-gray-400">{viewingSessoesLista.length} dias</p>
                                    )}
                                </div>
                            </div>

                            {sessaoTotaisPorForma.length > 0 && (
                                <div className="mb-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
                                    <div className="px-3 py-2 bg-slate-100 border-b">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                                            Totais por forma de pagamento (conferência / fechamento)
                                        </p>
                                    </div>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-[11px] uppercase text-slate-500 border-b">
                                                <th className="py-2 px-3">Forma</th>
                                                <th className="py-2 px-3 text-right">Entradas</th>
                                                <th className="py-2 px-3 text-right">Saídas</th>
                                                <th className="py-2 px-3 text-right">Líquido</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {sessaoTotaisPorForma.map((row) => (
                                                <tr key={row.forma}>
                                                    <td className="py-2 px-3 font-medium text-gray-900">{row.forma}</td>
                                                    <td className="py-2 px-3 text-right tabular-nums text-emerald-700">
                                                        {row.entradas > 0 ? formatCentavos(row.entradas) : '—'}
                                                    </td>
                                                    <td className="py-2 px-3 text-right tabular-nums text-red-700">
                                                        {row.saidas > 0 ? formatCentavos(row.saidas) : '—'}
                                                    </td>
                                                    <td className="py-2 px-3 text-right tabular-nums font-semibold">
                                                        {formatCentavos(row.entradas - row.saidas)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-50 font-semibold border-t">
                                                <td className="py-2 px-3">Total geral</td>
                                                <td className="py-2 px-3 text-right tabular-nums text-emerald-700">
                                                    {formatCentavos(sessaoTotais.entradas)}
                                                </td>
                                                <td className="py-2 px-3 text-right tabular-nums text-red-700">
                                                    {formatCentavos(sessaoTotais.saidas)}
                                                </td>
                                                <td className="py-2 px-3 text-right tabular-nums">
                                                    {formatCentavos(sessaoTotais.entradas - sessaoTotais.saidas)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            <div className="mb-2 text-[11px] text-gray-500 no-print">
                                Use a barra horizontal da tabela para mover para o lado e ver o restante das informações.
                            </div>
                            <div className="flex flex-wrap justify-between items-center gap-3">
                                <div className="flex flex-wrap gap-2 no-print">
                                    {sessaoAberta && sessaoConta && (
                                        <>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="border-green-300 text-green-700 hover:bg-green-50 flex items-center gap-1 h-9.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                        onClick={() => setDetailDropdownEntradaOpen(true)}
                                                    >
                                                        <ArrowDownCircle className="h-4 w-4 mr-1 text-emerald-600" />
                                                        Entrada
                                                        <ChevronDown className="h-3 w-3 text-green-650" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent
                                                    isOpen={detailDropdownEntradaOpen}
                                                    onClose={() => setDetailDropdownEntradaOpen(false)}
                                                    align="left"
                                                >
                                                    <DropdownMenuItem onClick={() => { setDetailDropdownEntradaOpen(false); void iniciarAcaoRapidaConta(sessaoConta.id, 'entrada'); }}>
                                                        <ArrowDownCircle className="h-4 w-4 mr-2 text-emerald-605" /> Entrada de Caixa
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => { setDetailDropdownEntradaOpen(false); void iniciarAcaoRapidaConta(sessaoConta.id, 'suprimento'); }}>
                                                        <Plus className="h-4 w-4 mr-2 text-blue-605" /> Suprimento
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="border-red-300 text-red-700 hover:bg-red-50 flex items-center gap-1 h-9.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                        onClick={() => setDetailDropdownSaidaOpen(true)}
                                                    >
                                                        <ArrowUpCircle className="h-4 w-4 mr-1 text-rose-600" />
                                                        Saída
                                                        <ChevronDown className="h-3 w-3 text-rose-650" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent
                                                    isOpen={detailDropdownSaidaOpen}
                                                    onClose={() => setDetailDropdownSaidaOpen(false)}
                                                    align="left"
                                                >
                                                    <DropdownMenuItem onClick={() => { setDetailDropdownSaidaOpen(false); void iniciarAcaoRapidaConta(sessaoConta.id, 'saida'); }}>
                                                        <ArrowUpCircle className="h-4 w-4 mr-2 text-rose-605" /> Saída de Caixa
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => { setDetailDropdownSaidaOpen(false); void iniciarAcaoRapidaConta(sessaoConta.id, 'sangria'); }}>
                                                        <Minus className="h-4 w-4 mr-2 text-orange-605" /> Sangria
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </>
                                    )}
                                    {!sessaoAberta && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                            <span className="text-xs text-gray-500">
                                                Dia encerrado — estorne recebimentos pelo menu do lançamento (botão direito). Não precisa reabrir o caixa.
                                            </span>
                                            {sessaoVisualizadaUnica
                                                && sessaoVisualizadaUnica.status === 'fechado'
                                                && sessaoConta && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 text-xs shrink-0"
                                                    onClick={() => { void reabrirSessaoDia(sessaoVisualizadaUnica, sessaoConta.id); }}
                                                >
                                                    <Unlock className="h-3.5 w-3.5 mr-1.5" />
                                                    Reabrir este dia
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <Button 
                                        variant="outline" 
                                        onClick={imprimirPdfSessaoVisualizada}
                                        disabled={printingCaixa}
                                    >
                                        <Printer className={`h-4 w-4 mr-2 ${printingCaixa ? 'animate-pulse' : ''}`} />
                                        {printingCaixa ? 'Gerando...' : 'Imprimir relatório'}
                                    </Button>
                                    <Button onClick={fecharModalMovimentacoes}>
                                        Fechar
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showNovaReceberCaixa && selectedContaId && (
                <NovaContaReceberModal
                    caixaDireto={{
                        contaBancariaId: selectedContaId,
                        contaLabel: selectedConta?.nome,
                    }}
                    onClose={() => setShowNovaReceberCaixa(false)}
                    onSuccess={() => {
                        setShowNovaReceberCaixa(false);
                        void loadSessaoAtual(selectedContaId);
                        void loadMovimentosPeriodo();
                        void recarregarSessaoVisualizada();
                    }}
                />
            )}
            {showNovaPagarCaixa && selectedContaId && (
                <NovaContaPagarModal
                    caixaDireto={{
                        contaBancariaId: selectedContaId,
                        contaLabel: selectedConta?.nome,
                    }}
                    onClose={() => setShowNovaPagarCaixa(false)}
                    onSuccess={() => {
                        setShowNovaPagarCaixa(false);
                        void loadSessaoAtual(selectedContaId);
                        void loadMovimentosPeriodo();
                        void recarregarSessaoVisualizada();
                    }}
                />
            )}

            {/* Modal de detalhes da movimentação */}
            {movimentoDetalhe && (
                <DetalhesMovimentoModal
                    movimento={movimentoDetalhe}
                    onClose={() => setMovimentoDetalhe(null)}
                    onEstornarConciliacao={
                        movimentoEstaConciliado(movimentoDetalhe)
                            ? () => void estornarConciliacaoMovimento(movimentoDetalhe)
                            : undefined
                    }
                    onEstornarBaixa={
                        podeEstornarMovimento(
                            movimentoDetalhe,
                            treeMovimentos.filter((m) => m.sessao_id === movimentoDetalhe.sessao_id),
                        )
                            ? () => {
                                iniciarEstornoBaixaMovimento(movimentoDetalhe);
                                setMovimentoDetalhe(null);
                            }
                            : undefined
                    }
                />
            )}

            {estornoMovimentoAlvo && (
                <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between px-5 py-4 border-b bg-rose-50 rounded-t-2xl">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                                    <RotateCcw className="h-5 w-5 text-rose-700" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-rose-900">Estornar baixa</h2>
                                    <p className="text-xs text-rose-700/80 mt-0.5">
                                        A parcela volta para em aberto e o recebimento é removido do extrato do caixa (sem lançamento de saída).
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setEstornoMovimentoAlvo(null); setEstornoErro(''); }}
                                className="text-rose-400 hover:text-rose-700 p-2 rounded-xl hover:bg-rose-100 transition-colors"
                                disabled={estornoLoading}
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
                                <p className="text-slate-600">
                                    <span className="font-semibold text-slate-800">Histórico:</span>{' '}
                                    {estornoMovimentoAlvo.descricao}
                                </p>
                                <p className="text-slate-600">
                                    <span className="font-semibold text-slate-800">Valor:</span>{' '}
                                    <span className="font-mono text-emerald-700 font-bold">
                                        {formatCentavos(estornoMovimentoAlvo.valor_centavos)}
                                    </span>
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Motivo do estorno *
                                </label>
                                <Textarea
                                    value={estornoMotivo}
                                    onChange={(e) => setEstornoMotivo(e.target.value)}
                                    placeholder="Descreva o motivo do estorno..."
                                    rows={3}
                                    disabled={estornoLoading}
                                />
                            </div>
                            {estornoErro && (
                                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                    <span>{estornoErro}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-2xl">
                            <Button
                                variant="outline"
                                onClick={() => { setEstornoMovimentoAlvo(null); setEstornoErro(''); }}
                                disabled={estornoLoading}
                            >
                                Cancelar
                            </Button>
                            <Button
                                className="bg-rose-600 hover:bg-rose-700 text-white"
                                onClick={() => void confirmarEstornoBaixaMovimento()}
                                disabled={estornoLoading || !estornoMotivo.trim()}
                            >
                                {estornoLoading ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                        Estornando...
                                    </>
                                ) : (
                                    <>
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                        Confirmar estorno
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {menuContaCtx && openMenuId && menuPosition && contaPorId.get(menuContaCtx.id) && (
                <ContaBancariaMenuAcoes
                    conta={contaPorId.get(menuContaCtx.id)!}
                    isOpen={true}
                    onClose={fecharMenuConta}
                    position={menuPosition}
                    variant="tesouraria"
                    sessaoAberta={!!menuContaCtx.openSession}
                    userId={user?.id}
                    isGestor={verTodosCaixas}
                    onVerMovimentos={
                        menuContaCtx.openSession
                            ? () => void handleViewSessaoMovimentos(menuContaCtx.openSession!)
                            : undefined
                    }
                    onEntrada={() => void abrirModalReceitaCaixa(menuContaCtx.id)}
                    onSaida={() => void abrirModalDespesaCaixa(menuContaCtx.id)}
                    onSangria={() => {
                        fecharMenuConta();
                        void iniciarAcaoRapidaConta(menuContaCtx.id, 'sangria');
                    }}
                    onSuprimento={() => {
                        fecharMenuConta();
                        void iniciarAcaoRapidaConta(menuContaCtx.id, 'suprimento');
                    }}
                    onAbrirCaixa={() => {
                        if (validarPodeOperar(menuContaCtx.id)) {
                            setSelectedContaId(menuContaCtx.id);
                            setModal('abrir');
                        }
                    }}
                    onFecharCaixa={() => {
                        const contaId = menuContaCtx.id;
                        if (!validarPodeOperar(contaId)) return;
                        const abertasNaConta = sessoesAbertas
                            .filter((s) => s.conta_bancaria_id === contaId)
                            .sort(
                                (a, b) =>
                                    new Date(a.data_abertura).getTime() - new Date(b.data_abertura).getTime(),
                            );
                        const alvo = abertasNaConta[0] ?? menuContaCtx.openSession;
                        if (alvo) void prepararFechamentoSessao(alvo, contaId);
                    }}
                />
            )}

            {/* Print Styles */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body * { visibility: hidden !important; }
                    #printable-session-report-root,
                    #printable-session-report-root * { visibility: visible !important; }
                    #printable-session-report-root {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        background: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        display: block !important;
                    }
                    #printable-session-report {
                        box-shadow: none !important;
                        border-radius: 0 !important;
                        max-width: 100% !important;
                        width: 100% !important;
                        max-height: none !important;
                        height: auto !important;
                        position: relative !important;
                        border: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .no-print, .print\\:hidden { display: none !important; }
                    #printable-session-history {
                        overflow: visible !important;
                        max-height: none !important;
                    }
                    #printable-session-report table { font-size: 9px !important; line-height: 1.2 !important; width: 100% !important; }
                    #printable-session-report th,
                    #printable-session-report td { padding: 3px 4px !important; }
                }
            ` }} />
        </div>
    );
};

export default Tesouraria;

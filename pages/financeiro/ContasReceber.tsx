import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { normalizeSearchText, SEARCH_STOPWORDS } from '../../lib/textUtils';
import {
    Clock, CheckCircle2, CheckCircle, RefreshCw, ChevronLeft, ChevronRight,
    AlertTriangle, Calendar, DollarSign, Search, Plus, Filter, TrendingUp,
    ChevronDown, ChevronUp, MoreVertical, Undo2, Trash2, Printer, Eye, FileSearch,
    CreditCard, Banknote, QrCode, Wallet,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { nomeExibicaoContaReceber, descricaoLimpaContaReceber } from '../../lib/finContaReceberDisplay';
import { contratoCodigoMatch } from '../../lib/buscaContrato';
import { Button, Input, Select, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import {
    useFinanceiro, formatCentavos,
    type ContaReceberDetalhada,
} from '../../lib/FinanceiroStore';
import {
    StatusFinanceiroBadge, EmptyFinanceiro, FinanceiroLoading, MoneyDisplay, StatCard,
} from '../../components/financeiro/FinanceiroComponents';
import { ReceberPagamentoModal } from '../../components/financeiro/ReceberPagamentoModal';
import { DetalhesBaixaParcelaModal } from '../../components/financeiro/DetalhesBaixaParcelaModal';
import { NovaContaReceberModal } from '../../components/financeiro/NovaContaReceberModal';
import { generateReciboPDF } from '../../lib/ReciboService';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useFilial, FILIAL_TODAS_ID } from '../../lib/FilialContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';

const getLocalToday = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const formatarDataBR = (valor?: string | null) => {
    if (!valor) return '—';
    const dt = new Date(`${valor}T00:00`);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('pt-BR');
};

const formatarMesReferencia = (valor?: string | null) => {
    if (!valor) return '—';
    const dt = new Date(`${valor}T00:00`);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
};

type FormaHojeChave = 'especie' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'boleto';

type ResumoFormaHoje = {
    chave: FormaHojeChave;
    label: string;
    total: number;
    qtd: number;
    contaIds: string[];
};

type FiltroDataCampo = 'vencimento' | 'recebimento';

function primeiroDiaMes(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ultimoDiaMes(): string {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

type BaixasResumoState = {
    total: number;
    qtd: number;
    porForma: ResumoFormaHoje[];
    todasContaIds: Set<string>;
    porConta: Map<string, { valorCentavos: number; formaLabel: string; usuarioNome: string }>;
};

const BAIXAS_VAZIAS: BaixasResumoState = {
    total: 0,
    qtd: 0,
    porForma: [],
    todasContaIds: new Set(),
    porConta: new Map(),
};

const FORMA_HOJE_LABEL: Record<FormaHojeChave, string> = {
    especie: 'Dinheiro',
    pix: 'PIX',
    cartao_credito: 'Cartão crédito',
    cartao_debito: 'Cartão débito',
    boleto: 'Boleto',
};

const FORMA_HOJE_ORDEM: FormaHojeChave[] = [
    'especie',
    'pix',
    'cartao_credito',
    'cartao_debito',
    'boleto',
];

function formaChaveFromBaixa(fp?: { codigo?: string; nome?: string; tipo?: string } | null): FormaHojeChave | 'outros' {
    const tipo = (fp?.tipo || '').toLowerCase().trim();
    if (tipo === 'boleto' || tipo === 'duplicata' || tipo === 'debito_automatico') return 'boleto';
    if (tipo === 'pix') return 'pix';
    if (tipo === 'dinheiro' || tipo === 'especie' || tipo === 'espécie') return 'especie';
    if (tipo === 'cartao_credito' || tipo === 'credito' || tipo === 'crédito') return 'cartao_credito';
    if (tipo === 'cartao_debito' || tipo === 'debito' || tipo === 'débito') return 'cartao_debito';
    if (tipo === 'cartao') {
        const nomeTipo = (fp?.nome || '').toLowerCase();
        if (nomeTipo.includes('débito') || nomeTipo.includes('debito')) return 'cartao_debito';
        if (nomeTipo.includes('crédito') || nomeTipo.includes('credito')) return 'cartao_credito';
    }
    const c = (fp?.codigo || '').toUpperCase();
    if (c === 'FP-004') return 'cartao_credito';
    if (c === 'FP-005') return 'cartao_debito';
    if (c === 'FP-003') return 'boleto';
    if (c === 'FP-002') return 'pix';
    if (c === 'FP-001') return 'especie';
    const nome = (fp?.nome || '').toLowerCase();
    if (nome.includes('crédito') || nome.includes('credito')) return 'cartao_credito';
    if (nome.includes('débito') || nome.includes('debito')) return 'cartao_debito';
    if (nome.includes('boleto') || nome.includes('duplicata') || nome.includes('cobrança') || nome.includes('cobranca')) return 'boleto';
    if (nome.includes('pix')) return 'pix';
    if (nome.includes('dinheiro') || nome.includes('espécie') || nome.includes('especie')) return 'especie';
    return 'outros';
}

function processarLinhasBaixa(
    data: Array<Record<string, unknown>>,
    userMap: Map<string, string>,
): BaixasResumoState {
    const mapForma = new Map<FormaHojeChave, ResumoFormaHoje>();
    const todasContaIds = new Set<string>();
    const porConta = new Map<string, { valorCentavos: number; formaLabel: string; usuarioNome: string }>();
    let total = 0;

    const juntarNomes = (atual: string, novo: string) => {
        if (!atual) return novo;
        if (!novo || atual.includes(novo)) return atual;
        return `${atual}, ${novo}`;
    };

    for (const row of data) {
        const valor = Number(row.valor_pago_centavos) || 0;
        const contaId = String(row.conta_receber_id || '').trim();
        const createdBy = String(row.created_by || '').trim();
        const usuarioNome = createdBy ? (userMap.get(createdBy) || 'Usuário') : '—';
        const fpRaw = row.forma_pagamento as { codigo?: string; nome?: string; tipo?: string } | { codigo?: string; nome?: string; tipo?: string }[] | null;
        const fp = Array.isArray(fpRaw) ? fpRaw[0] : fpRaw;
        const chave = formaChaveFromBaixa(fp);
        total += valor;
        if (contaId) todasContaIds.add(contaId);

        const formaLabel = chave === 'outros'
            ? (fp?.nome?.trim() || 'Outros')
            : FORMA_HOJE_LABEL[chave];

        if (contaId) {
            const atual = porConta.get(contaId);
            porConta.set(contaId, {
                valorCentavos: (atual?.valorCentavos ?? 0) + valor,
                formaLabel: atual?.formaLabel === formaLabel
                    ? formaLabel
                    : atual
                      ? `${atual.formaLabel}, ${formaLabel}`
                      : formaLabel,
                usuarioNome: juntarNomes(atual?.usuarioNome || '', usuarioNome),
            });
        }

        if (chave === 'outros') continue;

        const atualForma = mapForma.get(chave) || {
            chave,
            label: FORMA_HOJE_LABEL[chave],
            total: 0,
            qtd: 0,
            contaIds: [],
        };
        atualForma.total += valor;
        atualForma.qtd += 1;
        if (contaId && !atualForma.contaIds.includes(contaId)) atualForma.contaIds.push(contaId);
        mapForma.set(chave, atualForma);
    }

    const porForma = FORMA_HOJE_ORDEM.map((k) =>
        mapForma.get(k) ?? {
            chave: k,
            label: FORMA_HOJE_LABEL[k],
            total: 0,
            qtd: 0,
            contaIds: [],
        },
    );

    return { total, qtd: data.length, porForma, todasContaIds, porConta };
}

interface ClienteAgrupado {
    cliente_id: string;
    cliente_nome: string;
    cliente_cpf?: string;
    /** Código comercial (carteirinha), ex. CLI-… */
    cliente_codigo?: string;
    titulos: ContaReceberDetalhada[];
    valorTotal: number;
    valorPago: number;
    valorAberto: number;
    qtdAberto: number;
    qtdVencido: number;
    qtdPago: number;
    recebidoHoje: number;
    qtdHoje: number;
}

// normalizeSearchText e SEARCH_STOPWORDS importados de ../../lib/textUtils
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 1000, 5000];

type ColumnFilterKey = 'cliente' | 'codigo' | 'natureza' | 'tipo' | 'vencimento' | 'referencia' | 'recebimento' | 'valor' | 'status';

const COLUMN_FILTER_LABELS: Record<ColumnFilterKey, string> = {
    cliente: 'Cliente',
    codigo: 'Código',
    natureza: 'Natureza',
    tipo: 'Tipo',
    vencimento: 'Vencimento',
    referencia: 'Mês ref.',
    recebimento: 'Recebimento',
    valor: 'Valor',
    status: 'Status',
};

const TIPOS_DOCUMENTO_CR: Array<{ value: string; label: string }> = [
    { value: 'mensalidade', label: 'Mensalidade' },
    { value: 'taxa_adesao', label: 'Taxa de Adesão' },
    { value: 'servico_avulso', label: 'Serviço Avulso' },
    { value: 'multa', label: 'Multa' },
    { value: 'renegociacao', label: 'Renegociação' },
    { value: 'boleto', label: 'Boleto' },
    { value: 'outros', label: 'Outros' },
];

const labelTipoDocumentoCr = (tipo?: string | null) =>
    TIPOS_DOCUMENTO_CR.find((t) => t.value === tipo)?.label || (tipo || '—').replace(/_/g, ' ');

const STATUS_CR_LABELS: Record<string, string> = {
    aberto: 'Aberto',
    pago: 'Pago',
    pago_parcial: 'Parcial',
    vencido: 'Vencido',
    cancelado: 'Cancelado',
    renegociado: 'Renegociado',
    pendente: 'Pendente',
};

const formatDataBr = (iso?: string | null) =>
    iso ? new Date(iso + 'T00:00').toLocaleDateString('pt-BR') : '—';

const EMPTY_COLUMN_FILTERS: Record<ColumnFilterKey, string[]> = {
    cliente: [],
    codigo: [],
    natureza: [],
    tipo: [],
    vencimento: [],
    referencia: [],
    recebimento: [],
    valor: [],
    status: [],
};

export const ContasReceber: React.FC = () => {
    const {
        contasReceberDetalhadas, loadContasReceberDetalhado,
        estornarContaReceber, excluirContaReceber,
        loading,
    } = useFinanceiro();
    const { user } = useAuth();
    const { dataRevision, filialId, isTodasFiliais } = useFilial();
    const shouldFilterByFilial = Boolean(
        filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais,
    );
    const { dataRevisionEmpresa, empresaIdsParaFiltro } = useEmpresaContextoAtivo();
    const empresaIdsBaixas = useMemo(
        () => (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean),
        [empresaIdsParaFiltro],
    );

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [filtroDataCampo, setFiltroDataCampo] = useState<FiltroDataCampo>('vencimento');
    const [dataInicio, setDataInicio] = useState(primeiroDiaMes());
    const [dataFim, setDataFim] = useState(ultimoDiaMes());
    const [formaHojeFilter, setFormaHojeFilter] = useState<FormaHojeChave | ''>('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedConta, setSelectedConta] = useState<ContaReceberDetalhada | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [showNovaConta, setShowNovaConta] = useState(false);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const [contaDetalheBaixa, setContaDetalheBaixa] = useState<ContaReceberDetalhada | null>(null);
    const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set());
    const [columnFilters, setColumnFilters] = useState<Record<ColumnFilterKey, string[]>>(EMPTY_COLUMN_FILTERS);
    const [filterMenuColumn, setFilterMenuColumn] = useState<ColumnFilterKey | null>(null);
    const [filterMenuPosition, setFilterMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);
    const [dropdownSearch, setDropdownSearch] = useState('');

    /** Baixas de hoje (data de recebimento) — resumo por forma. */
    const [baixasHoje, setBaixasHoje] = useState<BaixasResumoState>(BAIXAS_VAZIAS);
    /** Baixas do período ativo (quando filtro por recebimento). */
    const [baixasPeriodo, setBaixasPeriodo] = useState<BaixasResumoState>(BAIXAS_VAZIAS);
    /** Usuário/forma por título na lista visível (independente do filtro de data dos cards). */
    const [baixasPorContaLista, setBaixasPorContaLista] = useState<
        Map<string, { valorCentavos: number; formaLabel: string; usuarioNome: string }>
    >(new Map());
    const [refreshTick, setRefreshTick] = useState(0);

    const today = useMemo(() => getLocalToday(), []);
    const buscaAtiva = searchTerm.trim().length >= 2;
    const periodoEhSoHoje = dataInicio === today && dataFim === today;
    const baixasAtivas = filtroDataCampo === 'recebimento' ? baixasPeriodo : baixasHoje;
    /** Resumo por forma: período quando filtro recebimento ≠ só hoje; senão recebimentos de hoje. */
    const baixasFormaResumo =
        filtroDataCampo === 'recebimento' && !periodoEhSoHoje && !buscaAtiva
            ? baixasPeriodo
            : baixasHoje;

    const openRowMenuFromElement = (cr: ContaReceberDetalhada, element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        setMenuPosition({
            y: rect.bottom,
            x: Math.max(8, rect.right - 200), // alinhamento à direita
        });
        setSelectedConta(cr);
        setActiveMenuId(cr.id);
    };

    const openRowMenu = (cr: ContaReceberDetalhada, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        openRowMenuFromElement(cr, event.currentTarget as HTMLElement);
    };

    const selectRowOnly = (cr: ContaReceberDetalhada) => {
        setSelectedConta(cr);
        setActiveMenuId(null);
    };

    // Fechar menu ao rolar/redimensionar
    useEffect(() => {
        const close = () => activeMenuId && setActiveMenuId(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [activeMenuId]);

    const recarregar = useCallback(() => {
        const filters: Record<string, string> = {};
        const term = searchTerm.trim();
        if (term.length >= 2) {
            filters.search_term = term;
        } else {
            if (statusFilter) filters.status = statusFilter;
            filters.filtro_data_campo = filtroDataCampo;
            if (dataInicio) filters.data_inicio = dataInicio;
            if (dataFim) filters.data_fim = dataFim;
        }
        loadContasReceberDetalhado(filters);
    }, [
        loadContasReceberDetalhado,
        statusFilter,
        filtroDataCampo,
        dataInicio,
        dataFim,
        searchTerm,
        dataRevision,
        dataRevisionEmpresa,
    ]);

    useEffect(() => {
        const term = searchTerm.trim();
        const delay = term.length >= 2 ? 350 : 0;
        const timer = window.setTimeout(() => recarregar(), delay);
        return () => window.clearTimeout(timer);
    }, [recarregar, searchTerm]);

    useEffect(() => {
        const atualizar = () => setRefreshTick((t) => t + 1);
        window.addEventListener('fin-contas-receber-updated', atualizar);
        return () => window.removeEventListener('fin-contas-receber-updated', atualizar);
    }, []);

    useEffect(() => {
        if (refreshTick > 0) recarregar();
    }, [refreshTick, recarregar]);

    const carregarBaixas = useCallback(async (de: string, ate: string): Promise<BaixasResumoState> => {
        if (!empresaIdsBaixas.length) return BAIXAS_VAZIAS;
        let q = supabase
            .from('fin_contas_receber_baixas')
            .select(
                'valor_pago_centavos, conta_receber_id, data_baixa, created_by, forma_pagamento:fin_formas_pagamento(codigo, nome, tipo)',
            )
            .eq('estornada', false)
            .gte('data_baixa', de)
            .lte('data_baixa', ate)
            .limit(5000);
        if (empresaIdsBaixas.length === 1) q = q.eq('empresa_id', empresaIdsBaixas[0]);
        else q = q.in('empresa_id', empresaIdsBaixas);
        const { data, error } = await q;
        if (error) throw error;

        const userIds = Array.from(new Set(
            (data ?? [])
                .map((row) => String((row as { created_by?: string }).created_by || '').trim())
                .filter(Boolean),
        ));
        const userMap = new Map<string, string>();
        if (userIds.length > 0) {
            const { data: users } = await supabase
                .from('users')
                .select('id, nome')
                .in('id', userIds);
            (users ?? []).forEach((u: { id: string; nome?: string }) => {
                userMap.set(u.id, u.nome || 'Usuário');
            });
        }

        return processarLinhasBaixa((data ?? []) as Array<Record<string, unknown>>, userMap);
    }, [empresaIdsBaixas]);

    const carregarBaixasPorContaIds = useCallback(async (
        contaIds: string[],
    ): Promise<Map<string, { valorCentavos: number; formaLabel: string; usuarioNome: string }>> => {
        const ids = Array.from(new Set(contaIds.map((id) => id.trim()).filter(Boolean)));
        if (!empresaIdsBaixas.length || ids.length === 0) return new Map();

        const BAIXA_SELECT =
            'valor_pago_centavos, conta_receber_id, data_baixa, created_by, forma_pagamento:fin_formas_pagamento(codigo, nome, tipo)';
        const allRows: Array<Record<string, unknown>> = [];

        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            let q = supabase
                .from('fin_contas_receber_baixas')
                .select(BAIXA_SELECT)
                .eq('estornada', false)
                .in('conta_receber_id', chunk)
                .limit(5000);
            if (empresaIdsBaixas.length === 1) q = q.eq('empresa_id', empresaIdsBaixas[0]);
            else q = q.in('empresa_id', empresaIdsBaixas);
            const { data, error } = await q;
            if (error) throw error;
            allRows.push(...((data ?? []) as Array<Record<string, unknown>>));
        }

        const userIds = Array.from(new Set(
            allRows
                .map((row) => String(row.created_by || '').trim())
                .filter(Boolean),
        ));
        const userMap = new Map<string, string>();
        if (userIds.length > 0) {
            const { data: users } = await supabase
                .from('users')
                .select('id, nome')
                .in('id', userIds);
            (users ?? []).forEach((u: { id: string; nome?: string }) => {
                userMap.set(u.id, u.nome || 'Usuário');
            });
        }

        return processarLinhasBaixa(allRows, userMap).porConta;
    }, [empresaIdsBaixas]);

    // Recebimentos de hoje (data de recebimento = data_baixa na baixa)
    useEffect(() => {
        let cancelled = false;
        carregarBaixas(today, today)
            .then((res) => { if (!cancelled) setBaixasHoje(res); })
            .catch((err) => {
                console.error('Erro ao carregar baixas do dia:', err);
                if (!cancelled) setBaixasHoje(BAIXAS_VAZIAS);
            });
        return () => { cancelled = true; };
    }, [carregarBaixas, today, refreshTick, dataRevisionEmpresa]);

    // Baixas do período quando filtro por data de recebimento
    useEffect(() => {
        if (filtroDataCampo !== 'recebimento' || buscaAtiva) {
            setBaixasPeriodo(BAIXAS_VAZIAS);
            return;
        }
        const de = dataInicio || today;
        const ate = dataFim || de;
        let cancelled = false;
        carregarBaixas(de, ate)
            .then((res) => { if (!cancelled) setBaixasPeriodo(res); })
            .catch((err) => {
                console.error('Erro ao carregar baixas do período:', err);
                if (!cancelled) setBaixasPeriodo(BAIXAS_VAZIAS);
            });
        return () => { cancelled = true; };
    }, [carregarBaixas, filtroDataCampo, dataInicio, dataFim, today, buscaAtiva, refreshTick, dataRevisionEmpresa]);

    const getRowValueForFilter = (cr: ContaReceberDetalhada, columnKey: ColumnFilterKey): string => {
        switch (columnKey) {
            case 'cliente':
                return nomeExibicaoContaReceber(cr.descricao, cr.cliente_nome);
            case 'codigo':
                return (cr.codigo || '').trim() || '—';
            case 'natureza':
                return (cr.natureza_financeira || '').trim() || '—';
            case 'tipo':
                return labelTipoDocumentoCr(cr.tipo_documento);
            case 'vencimento':
                return formatDataBr(cr.data_vencimento);
            case 'referencia':
                return formatarMesReferencia((cr as { data_competencia?: string }).data_competencia);
            case 'recebimento':
                return formatDataBr(cr.data_pagamento);
            case 'valor':
                return String(cr.valor_total_centavos ?? 0);
            case 'status':
                return cr.status || '—';
            default:
                return '';
        }
    };

    const getFriendlyFilterLabel = (columnKey: ColumnFilterKey, val: string): string => {
        if (columnKey === 'status') return STATUS_CR_LABELS[val] || val;
        if (columnKey === 'valor') {
            const centavos = Number(val);
            return formatCentavos(Number.isFinite(centavos) ? centavos : 0);
        }
        return val;
    };

    const getUniqueValuesForColumn = (columnKey: ColumnFilterKey): string[] => {
        const set = new Set<string>();
        contasReceberDetalhadas.forEach((cr) => set.add(getRowValueForFilter(cr, columnKey)));
        const values = Array.from(set);
        if (columnKey === 'valor') {
            return values.sort((a, b) => Number(a) - Number(b));
        }
        return values.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    };

    const handleOpenFilterMenu = (columnKey: ColumnFilterKey, event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        if (filterMenuColumn === columnKey) {
            setFilterMenuColumn(null);
            setFilterMenuPosition(undefined);
            setDropdownSearch('');
        } else {
            const rect = event.currentTarget.getBoundingClientRect();
            const popupWidth = 256;
            let left = rect.left;
            if (rect.left + popupWidth > window.innerWidth) left = Math.max(8, rect.right - popupWidth);
            setFilterMenuPosition({ x: left, y: rect.bottom + 4 });
            setFilterMenuColumn(columnKey);
            setDropdownSearch('');
        }
    };

    const handleToggleColumnFilter = (columnKey: ColumnFilterKey, value: string) => {
        setColumnFilters((prev) => {
            const current = prev[columnKey];
            const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
            return { ...prev, [columnKey]: updated };
        });
    };

    const clearAllColumnFilters = () => setColumnFilters(EMPTY_COLUMN_FILTERS);
    const hasActiveColumnFilters = Object.values(columnFilters).some((arr) => arr.length > 0);

    const ThComFiltro: React.FC<{
        label: string;
        columnKey?: ColumnFilterKey;
        align?: 'left' | 'right' | 'center';
    }> = ({ label, columnKey, align = 'left' }) => {
        const active = columnKey ? columnFilters[columnKey].length > 0 : false;
        const alignCls =
            align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'text-left';
        return (
            <th className={align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}>
                {columnKey ? (
                    <div className={`flex items-center gap-1 select-none ${alignCls}`}>
                        <span>{label}</span>
                        <button
                            type="button"
                            onClick={(e) => handleOpenFilterMenu(columnKey, e)}
                            className={`p-1 rounded transition-colors ${
                                active
                                    ? 'text-white bg-white/25 ring-1 ring-white/40'
                                    : 'text-blue-100 hover:text-white hover:bg-white/15'
                            }`}
                            title={`Filtrar ${label}`}
                        >
                            <Filter className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ) : (
                    label
                )}
            </th>
        );
    };

    // Lista filtrada — base para totais e tabela
    const filtered = useMemo(() => {
        const baseList = contasReceberDetalhadas;
        const term = normalizeSearchText(searchTerm);
        const termDigits = searchTerm.replace(/\D/g, '');
        const termTokens = term
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length >= 2 && !SEARCH_STOPWORDS.has(t));

        const idsForma = formaHojeFilter
            ? baixasFormaResumo.porForma.find((f) => f.chave === formaHojeFilter)?.contaIds ?? []
            : [];

        const filtradas = baseList.filter((cr) => {
            const codigoNorm = normalizeSearchText(cr.codigo);
            const descricaoNorm = normalizeSearchText(descricaoLimpaContaReceber(cr.descricao));
            const clienteNomeNorm = normalizeSearchText(cr.cliente_nome);
            const clienteCodigoNorm = normalizeSearchText(cr.cliente_codigo);
            const naturezaNorm = normalizeSearchText(cr.natureza_financeira);
            const contraparteNorm = normalizeSearchText(nomeExibicaoContaReceber(cr.descricao, cr.cliente_nome));
            const haystack = [codigoNorm, descricaoNorm, contraparteNorm, clienteNomeNorm, clienteCodigoNorm, naturezaNorm].join(' ');
            const matchesSearch = !searchTerm ||
                codigoNorm.includes(term) ||
                descricaoNorm.includes(term) ||
                contraparteNorm.includes(term) ||
                clienteNomeNorm.includes(term) ||
                clienteCodigoNorm.includes(term) ||
                contratoCodigoMatch(cr.contrato_codigo, searchTerm) ||
                naturezaNorm.includes(term) ||
                (termTokens.length > 0 && termTokens.every((token) => haystack.includes(token))) ||
                (termDigits.length > 0 && (cr.cliente_cpf || '').replace(/\D/g, '').includes(termDigits));

            const matchesForma =
                !formaHojeFilter || idsForma.includes(cr.id);

            return matchesSearch && matchesForma;
        });

        let rows = filtradas;
        for (const [key, selectedValues] of Object.entries(columnFilters) as [ColumnFilterKey, string[]][]) {
            if (selectedValues.length === 0) continue;
            rows = rows.filter((cr) => selectedValues.includes(getRowValueForFilter(cr, key)));
        }

        const orderCol = filtroDataCampo === 'recebimento' ? 'data_pagamento' : 'data_vencimento';
        return rows.sort((a, b) => {
            const aVal = (orderCol === 'data_pagamento' ? a.data_pagamento : a.data_vencimento)?.slice(0, 10) || '';
            const bVal = (orderCol === 'data_pagamento' ? b.data_pagamento : b.data_vencimento)?.slice(0, 10) || '';
            if (aVal !== bVal) return bVal.localeCompare(aVal);
            return a.data_vencimento.localeCompare(b.data_vencimento);
        });
    }, [contasReceberDetalhadas, searchTerm, formaHojeFilter, baixasAtivas, baixasFormaResumo, filtroDataCampo, columnFilters]);

    const contaIdsComPagamento = useMemo(
        () => filtered
            .filter((cr) => cr.status === 'pago' || cr.status === 'pago_parcial' || cr.valor_pago_centavos > 0)
            .map((cr) => cr.id),
        [filtered],
    );

    useEffect(() => {
        let cancelled = false;
        carregarBaixasPorContaIds(contaIdsComPagamento)
            .then((map) => { if (!cancelled) setBaixasPorContaLista(map); })
            .catch((err) => {
                console.error('Erro ao carregar usuários das baixas:', err);
                if (!cancelled) setBaixasPorContaLista(new Map());
            });
        return () => { cancelled = true; };
    }, [carregarBaixasPorContaIds, contaIdsComPagamento, refreshTick, dataRevisionEmpresa]);

    const baixaInfoPorConta = useMemo(() => {
        const map = new Map(baixasAtivas.porConta);
        baixasPorContaLista.forEach((info, contaId) => map.set(contaId, info));
        return map;
    }, [baixasAtivas, baixasPorContaLista]);

    const groupedView = false;

    // Agrupa por cliente
    const clientesAgrupados = useMemo<ClienteAgrupado[]>(() => {
        if (!groupedView) return [];
        const map = new Map<string, ClienteAgrupado>();

        for (const cr of filtered) {
            const key = (cr as any).cliente_id || cr.cliente_nome;
            let g = map.get(key);
            if (!g) {
                g = {
                    cliente_id: key,
                    cliente_nome: cr.cliente_nome,
                    cliente_cpf: cr.cliente_cpf,
                    cliente_codigo: cr.cliente_codigo,
                    titulos: [],
                    valorTotal: 0,
                    valorPago: 0,
                    valorAberto: 0,
                    qtdAberto: 0,
                    qtdVencido: 0,
                    qtdPago: 0,
                    recebidoHoje: 0,
                    qtdHoje: 0,
                };
                map.set(key, g);
            }
            g.titulos.push(cr);
            g.valorTotal += cr.valor_total_centavos;
            g.valorPago += cr.valor_pago_centavos;
            g.valorAberto += cr.valor_aberto_centavos;
            if (cr.status === 'aberto' || cr.status === 'pago_parcial') g.qtdAberto++;
            else if (cr.status === 'vencido') g.qtdVencido++;
            else if (cr.status === 'pago') g.qtdPago++;
            if (cr.data_pagamento && cr.data_pagamento.slice(0, 10) === today) {
                g.recebidoHoje += cr.valor_pago_centavos;
                g.qtdHoje++;
            }
        }

        return Array.from(map.values()).sort((a, b) => {
            // Quem recebeu hoje primeiro, depois quem tem aberto, depois alfabético
            if (a.qtdHoje !== b.qtdHoje) return b.qtdHoje - a.qtdHoje;
            if (a.valorAberto !== b.valorAberto) return b.valorAberto - a.valorAberto;
            return a.cliente_nome.localeCompare(b.cliente_nome);
        });
    }, [filtered, groupedView, today]);

    // Paginação dual: flat ou agrupado
    const visibleCount = groupedView ? clientesAgrupados.length : filtered.length;
    const totalPages = Math.max(1, Math.ceil(visibleCount / pageSize));

    const paginatedFlat = useMemo(
        () => filtered.slice((page - 1) * pageSize, page * pageSize),
        [filtered, page, pageSize]
    );

    const paginatedGroups = useMemo(
        () => clientesAgrupados.slice((page - 1) * pageSize, page * pageSize),
        [clientesAgrupados, page, pageSize]
    );

    const aplicarFiltroFormaHoje = (chave: FormaHojeChave) => {
        setFiltroDataCampo('recebimento');
        if (periodoEhSoHoje || filtroDataCampo !== 'recebimento') {
            setDataInicio(today);
            setDataFim(today);
        }
        setStatusFilter('');
        setSearchTerm('');
        setFormaHojeFilter(chave);
        setPageSize(100);
        setPage(1);
    };

    const aplicarRecebimentosHoje = () => {
        setFiltroDataCampo('recebimento');
        setDataInicio(today);
        setDataFim(today);
        setStatusFilter('');
        setSearchTerm('');
        setFormaHojeFilter('');
        setPage(1);
    };

    useEffect(() => {
        setPage(1);
    }, [searchTerm, statusFilter, filtroDataCampo, dataInicio, dataFim, formaHojeFilter, pageSize, JSON.stringify(columnFilters)]);

    useEffect(() => {
        if (filtroDataCampo !== 'recebimento' || dataInicio !== today || dataFim !== today) {
            setFormaHojeFilter('');
        }
    }, [filtroDataCampo, dataInicio, dataFim, today]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    // Totais — sempre baseados no `filtered`
    const totais = useMemo(() => {
        const aberto = filtered
            .filter(c => c.status === 'aberto' || c.status === 'pago_parcial')
            .reduce((s, c) => s + c.valor_aberto_centavos, 0);
        const vencido = filtered
            .filter(c => c.status === 'vencido')
            .reduce((s, c) => s + c.valor_aberto_centavos, 0);
        const pago = filtered
            .filter(c => c.status === 'pago')
            .reduce((s, c) => s + c.valor_pago_centavos, 0);

        const recebimentosHojePorTitulo = contasReceberDetalhadas
            .filter(c => c.data_pagamento && c.data_pagamento.slice(0, 10) === today)
            .reduce((s, c) => s + c.valor_pago_centavos, 0);
        const qtdHojePorTitulo = contasReceberDetalhadas
            .filter(c => c.data_pagamento && c.data_pagamento.slice(0, 10) === today).length;

        const recebimentosHoje = baixasHoje.total > 0 ? baixasHoje.total : recebimentosHojePorTitulo;
        const qtdHoje = baixasHoje.qtd > 0 ? baixasHoje.qtd : qtdHojePorTitulo;

        const recebidoPeriodo = filtroDataCampo === 'recebimento' ? baixasPeriodo.total : pago;

        const total = filtered.length;
        const emAberto = filtered.filter(c => ['aberto', 'vencido', 'pago_parcial'].includes(c.status)).length;
        return { aberto, vencido, pago, recebimentosHoje, qtdHoje, recebidoPeriodo, total, emAberto };
    }, [filtered, contasReceberDetalhadas, today, baixasHoje, baixasPeriodo, filtroDataCampo]);

    const handleReceber = (conta: ContaReceberDetalhada) => {
        setSelectedConta(conta);
        setShowModal(true);
    };

    const handlePrintRecibo = (cr: ContaReceberDetalhada) => {
        generateReciboPDF({
            numero: cr.codigo,
            data: cr.data_pagamento ? new Date(cr.data_pagamento).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR'),
            clienteNome: cr.cliente_nome,
            valor: cr.valor_pago_centavos / 100,
            referencia: cr.descricao || `Pagamento de ${cr.tipo_documento.replace(/_/g, ' ')}`,
            descricao: cr.descricao || 'Mensalidade / Parcela',
            vencimento: new Date(cr.data_vencimento + 'T00:00').toLocaleDateString('pt-BR'),
            empresaId: cr.empresa_id,
        });
    };

    const handlePaymentSuccess = () => {
        setShowModal(false);
        setSelectedConta(null);
        setRefreshTick(t => t + 1);
    };

    const handleRefresh = () => {
        setRefreshTick(t => t + 1);
        recarregar();
    };

    const handleEstornar = async (cr: ContaReceberDetalhada) => {
        if (!window.confirm(`Estornar o recebimento do título ${cr.codigo}? O valor será debitado do caixa/conta bancária.`)) return;
        const motivo = window.prompt('Qual o motivo do estorno?');
        if (!motivo) return;
        const ok = await estornarContaReceber(cr.id, motivo);
        if (ok) {
            window.alert('Recebimento estornado com sucesso!');
            setRefreshTick(t => t + 1);
        } else {
            window.alert('Erro ao estornar o recebimento.');
        }
    };

    const handleExcluir = async (cr: ContaReceberDetalhada) => {
        if (!window.confirm(`Excluir o título ${cr.codigo}? Esta ação não pode ser desfeita.`)) return;
        const ok = await excluirContaReceber(cr.id);
        if (ok) {
            window.alert('Título excluído com sucesso.');
            setRefreshTick(t => t + 1);
        } else {
            window.alert('Não foi possível excluir o título.');
        }
    };

    const toggleCliente = (clienteKey: string) => {
        setExpandedClientes((prev) => {
            const next = new Set(prev);
            if (next.has(clienteKey)) next.delete(clienteKey);
            else next.add(clienteKey);
            return next;
        });
    };

    if (loading && contasReceberDetalhadas.length === 0 && !showNovaConta && !showModal) return <FinanceiroLoading />;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Contas a Receber"
                subtitle="Gerencie mensalidades, recebimentos e baixas"
                backTo="/financeiro"
                accentColor="#1e40af"
                icon={<TrendingUp className="h-5 w-5 text-blue-700" />}
                actionButton={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                        <Button onClick={() => setShowNovaConta(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nova receita
                        </Button>
                    </div>
                }
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                    type="button"
                    onClick={aplicarRecebimentosHoje}
                    className="text-left"
                    title="Filtrar recebimentos de hoje (data de recebimento)"
                >
                    <StatCard
                        label="Recebimentos do Dia"
                        value={formatCentavos(totais.recebimentosHoje)}
                        sublabel={`${totais.qtdHoje} pagamento${totais.qtdHoje === 1 ? '' : 's'} hoje • clique para filtrar`}
                        icon={<Calendar className="h-5 w-5" />}
                        color="sky"
                    />
                </button>
                <StatCard
                    label="A Receber (Aberto)"
                    value={formatCentavos(totais.aberto)}
                    sublabel={`${filtered.filter(c => ['aberto', 'pago_parcial'].includes(c.status)).length} títulos em aberto`}
                    icon={<DollarSign className="h-5 w-5" />}
                    color="blue"
                />
                <StatCard
                    label="Vencido"
                    value={formatCentavos(totais.vencido)}
                    sublabel={`${filtered.filter(c => c.status === 'vencido').length} títulos vencidos`}
                    icon={<AlertTriangle className="h-5 w-5" />}
                    color="red"
                />
                <StatCard
                    label={filtroDataCampo === 'recebimento' ? 'Recebido (período)' : 'Recebido (filtrado)'}
                    value={formatCentavos(filtroDataCampo === 'recebimento' ? totais.recebidoPeriodo : totais.pago)}
                    sublabel={`${filtered.filter(c => c.status === 'pago' || c.status === 'pago_parcial').length} títulos com pagamento`}
                    icon={<CheckCircle className="h-5 w-5" />}
                    color="green"
                />
            </div>

            {/* Resumo por forma de pagamento */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">
                            {baixasFormaResumo === baixasPeriodo
                                ? 'Recebimentos do período por forma'
                                : 'Recebimentos de hoje por forma'}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {baixasFormaResumo === baixasPeriodo
                                ? `Por data de recebimento (${formatDataBr(dataInicio)} a ${formatDataBr(dataFim)}). Forma de pagamento na baixa — não confundir com tipo do documento (ex.: mensalidade paga em boleto).`
                                : `Por data de recebimento (${today.split('-').reverse().join('/')}). Clique na forma para filtrar a lista.`}
                        </p>
                    </div>
                    {formaHojeFilter && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setFormaHojeFilter('');
                            }}
                        >
                            Limpar filtro de forma
                        </Button>
                    )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {FORMA_HOJE_ORDEM.map((chave) => {
                        const item = baixasFormaResumo.porForma.find((f) => f.chave === chave);
                        const total = item?.total ?? 0;
                        const qtd = item?.qtd ?? 0;
                        const ativo = formaHojeFilter === chave;
                        const Icon =
                            chave === 'pix'
                                ? QrCode
                                : chave === 'especie'
                                  ? Banknote
                                  : chave === 'boleto'
                                    ? DollarSign
                                    : chave.startsWith('cartao')
                                      ? CreditCard
                                      : Wallet;
                        return (
                            <button
                                key={chave}
                                type="button"
                                onClick={() => aplicarFiltroFormaHoje(chave)}
                                className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                                    ativo
                                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300'
                                        : total > 0
                                          ? 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                                          : 'border-dashed border-slate-200 bg-slate-50/80 text-slate-500'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                    {FORMA_HOJE_LABEL[chave]}
                                </div>
                                <p className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
                                    {formatCentavos(total)}
                                </p>
                                <p className="text-[10px] text-slate-500">{qtd} baixa{qtd === 1 ? '' : 's'}</p>
                            </button>
                        );
                    })}
                </div>
                {baixasFormaResumo.qtd === 0 && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {baixasFormaResumo === baixasPeriodo
                            ? 'Nenhum recebimento no período selecionado. Use filtro Recebimento + Este mês para ver boletos pagos no mês.'
                            : 'Nenhum recebimento registrado hoje nesta unidade (por data de recebimento).'}
                    </p>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 bg-white p-4 rounded-xl shadow-sm border">
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar por nº contrato, cliente, fornecedor, CPF ou código…"
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-44">
                        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">Status: Todos</option>
                            <option value="aberto">Aberto</option>
                            <option value="pago">Pago</option>
                            <option value="pago_parcial">Parcial</option>
                            <option value="vencido">Vencido</option>
                            <option value="cancelado">Cancelado</option>
                            <option value="renegociado">Renegociado</option>
                        </Select>
                    </div>
                    <div className="w-full md:w-40">
                        <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <option key={size} value={size}>
                                    Listagem: {size.toLocaleString('pt-BR')}
                                </option>
                            ))}
                        </Select>
                    </div>
                </div>

                {buscaAtiva && (
                    <p className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                        Busca ativa: ignorando filtros de data e status. Digite ao menos 2 caracteres.
                    </p>
                )}

                {!buscaAtiva && (
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        {filtroDataCampo === 'recebimento'
                            ? 'Período por data de recebimento — alinhado ao caixa e aos recebimentos do dia.'
                            : 'Período por data de vencimento — use para acompanhar títulos a receber e vencidos.'}
                    </p>
                )}

                {!buscaAtiva && (
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-3 border-t border-gray-100 pt-3">
                        <div className="flex flex-col gap-1 shrink-0">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                Filtrar por
                            </span>
                            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setFiltroDataCampo('vencimento')}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                        filtroDataCampo === 'vencimento'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    Vencimento
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFiltroDataCampo('recebimento')}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                        filtroDataCampo === 'recebimento'
                                            ? 'bg-white text-emerald-700 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    Recebimento
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 w-full md:flex-1">
                            <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
                                <div className="w-[9.5rem] shrink-0">
                                    <Input
                                        type="date"
                                        pickerOnly
                                        helperText=""
                                        placeholder="De"
                                        value={dataInicio}
                                        onChange={(e) => setDataInicio(e.target.value)}
                                        className="border-0 bg-transparent h-9 pl-2 pr-2 text-xs font-semibold text-gray-700 focus:ring-0 shadow-none"
                                    />
                                </div>
                                <span className="text-gray-300 text-xs">até</span>
                                <div className="w-[9.5rem] shrink-0">
                                    <Input
                                        type="date"
                                        pickerOnly
                                        helperText=""
                                        placeholder="Até"
                                        value={dataFim}
                                        onChange={(e) => setDataFim(e.target.value)}
                                        className="border-0 bg-transparent h-9 pl-2 pr-2 text-xs font-semibold text-gray-700 focus:ring-0 shadow-none"
                                    />
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setDataInicio(today);
                                    setDataFim(today);
                                }}
                            >
                                Hoje
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setDataInicio(primeiroDiaMes());
                                    setDataFim(ultimoDiaMes());
                                }}
                            >
                                Este mês
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {hasActiveColumnFilters && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Filtros na tabela:</span>
                    {(Object.entries(columnFilters) as [ColumnFilterKey, string[]][]).map(([key, values]) =>
                        values.map((val) => (
                            <span
                                key={`${key}-${val}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                            >
                                <span className="text-blue-500 font-bold uppercase text-[10px]">{COLUMN_FILTER_LABELS[key]}:</span>
                                {getFriendlyFilterLabel(key, val)}
                                <button
                                    type="button"
                                    onClick={() => handleToggleColumnFilter(key, val)}
                                    className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors"
                                >
                                    ×
                                </button>
                            </span>
                        ))
                    )}
                    <button
                        type="button"
                        onClick={clearAllColumnFilters}
                        className="text-xs text-red-500 hover:underline font-semibold"
                    >
                        Limpar filtros da tabela
                    </button>
                </div>
            )}

            {/* Conteúdo: lista flat */}
            {visibleCount > 0 ? (
                <div className="list-table-shell">
                    {groupedView ? (
                        // ───────── VISÃO AGRUPADA POR CLIENTE ─────────
                        <div className="divide-y divide-gray-100">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-gray-50 to-gray-100 grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                <div className="col-span-5">Cliente</div>
                                <div className="col-span-1 text-center">Títulos</div>
                                <div className="col-span-2 text-right">Total</div>
                                <div className="col-span-2 text-right">Recebido</div>
                                <div className="col-span-2 text-right">Em aberto</div>
                            </div>

                            {paginatedGroups.map((g) => {
                                const expandido = expandedClientes.has(g.cliente_id);
                                const corFundo = g.qtdHoje > 0
                                    ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                                    : g.qtdVencido > 0
                                        ? 'bg-red-50/40 hover:bg-red-50/70'
                                        : 'hover:bg-gray-50 dark:hover:bg-slate-800/60';
                                return (
                                    <div key={g.cliente_id}>
                                        <button
                                            type="button"
                                            onClick={() => toggleCliente(g.cliente_id)}
                                            className={`w-full grid grid-cols-12 gap-3 items-center px-4 py-3 transition-colors text-left ${corFundo}`}
                                        >
                                            {/* Cliente */}
                                            <div className="col-span-5 flex items-center gap-3 min-w-0">
                                                <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm shrink-0">
                                                    {g.cliente_nome.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-semibold text-gray-900 dark:text-slate-100 truncate">{g.cliente_nome}</p>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {g.cliente_codigo && (
                                                            <span className="text-[10px] font-mono font-semibold text-blue-800 bg-blue-100 rounded px-1.5 py-0.5">
                                                                {g.cliente_codigo}
                                                            </span>
                                                        )}
                                                        {g.cliente_cpf && (
                                                            <span className="text-[11px] text-gray-500 font-mono">{g.cliente_cpf}</span>
                                                        )}
                                                        {g.qtdHoje > 0 && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                                                                <CheckCircle2 className="h-2.5 w-2.5" />
                                                                {g.qtdHoje} pago{g.qtdHoje > 1 ? 's' : ''} hoje
                                                            </span>
                                                        )}
                                                        {g.qtdVencido > 0 && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-100 rounded-full px-2 py-0.5">
                                                                <Clock className="h-2.5 w-2.5" />
                                                                {g.qtdVencido} vencido{g.qtdVencido > 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {expandido ? (
                                                    <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                                                )}
                                            </div>

                                            <div className="col-span-1 text-center">
                                                <span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                                                    {g.titulos.length}
                                                </span>
                                            </div>
                                            <div className="col-span-2 text-right tabular-nums text-sm font-medium text-gray-900 dark:text-slate-100">
                                                {formatCentavos(g.valorTotal)}
                                            </div>
                                            <div className="col-span-2 text-right tabular-nums text-sm font-medium text-emerald-600">
                                                {formatCentavos(g.valorPago)}
                                            </div>
                                            <div className="col-span-2 text-right">
                                                <MoneyDisplay centavos={g.valorAberto} size="sm" />
                                            </div>
                                        </button>

                                        {/* Títulos do cliente (expandido) */}
                                        {expandido && (
                                            <div className="bg-gray-50/60 dark:bg-slate-800/30 border-t border-gray-100 dark:border-slate-800 px-4 py-3">
                                                <div className="overflow-x-auto rounded-lg bg-white border border-gray-100">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                                                                <th className="text-left py-2 px-3 font-semibold">Código</th>
                                                                <th className="text-left py-2 px-3 font-semibold">Natureza</th>
                                                                <th className="text-left py-2 px-3 font-semibold">Tipo</th>
                                                                <th className="text-left py-2 px-3 font-semibold">Vencimento</th>
                                                                <th className="text-left py-2 px-3 font-semibold">Mês referência</th>
                                                                <th className="text-left py-2 px-3 font-semibold">Data pagamento</th>
                                                                <th className="text-left py-2 px-3 font-semibold">Usuário baixa</th>
                                                                <th className="text-center py-2 px-3 font-semibold">Atraso</th>
                                                                <th className="text-right py-2 px-3 font-semibold">Valor</th>
                                                                <th className="text-right py-2 px-3 font-semibold">Pago</th>
                                                                <th className="text-right py-2 px-3 font-semibold">Em aberto</th>
                                                                <th className="text-center py-2 px-3 font-semibold">Status</th>
                                                                <th className="text-right py-2 px-3 font-semibold">Ações</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-50">
                                                            {g.titulos.map((cr) => {
                                                                const isOverdue = cr.status === 'vencido';
                                                                const isPaid = cr.status === 'pago';
                                                                const canReceive = !isPaid && cr.status !== 'cancelado' && cr.status !== 'renegociado';
                                                                const recHoje = !!cr.data_pagamento && cr.data_pagamento.slice(0, 10) === today;
                                                                const baixaInfo = baixaInfoPorConta.get(cr.id);
                                                                return (
                                                                    <tr
                                                                        key={cr.id}
                                                                        onClick={() => selectRowOnly(cr)}
                                                                        onDoubleClick={(e) => openRowMenuFromElement(cr, e.currentTarget as HTMLElement)}
                                                                        onContextMenu={(e) => openRowMenu(cr, e)}
                                                                        className={`${recHoje ? 'bg-emerald-50/30' : isOverdue ? 'bg-red-50/30' : ''} ${activeMenuId === cr.id ? 'ring-1 ring-inset ring-blue-200 bg-blue-50/70' : ''} cursor-pointer`}
                                                                    >
                                                                        <td className="py-2 px-3 font-mono text-xs text-gray-500">{cr.codigo}</td>
                                                                        <td className="py-2 px-3 text-xs text-gray-700 max-w-[200px] truncate" title={cr.natureza_financeira}>
                                                                            {cr.natureza_financeira || '—'}
                                                                        </td>
                                                                        <td className="py-2 px-3">
                                                                            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 capitalize">
                                                                                {cr.tipo_documento.replace(/_/g, ' ')}
                                                                            </span>
                                                                        </td>
                                                                        <td className="py-2 px-3">
                                                                            <span className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                                                                {new Date(cr.data_vencimento + 'T00:00').toLocaleDateString('pt-BR')}
                                                                            </span>
                                                                        </td>
                                                                        <td className="py-2 px-3 text-xs text-gray-600">
                                                                            {formatarMesReferencia((cr as any).data_competencia)}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-xs text-gray-600">
                                                                            {formatarDataBR(cr.data_pagamento)}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-xs text-gray-700 max-w-[140px] truncate" title={baixaInfo?.usuarioNome}>
                                                                            {baixaInfo?.usuarioNome || '—'}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-center">
                                                                            {cr.dias_atraso > 0 ? (
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                                                                                    {cr.dias_atraso}d
                                                                                </span>
                                                                            ) : isPaid ? (
                                                                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                                                            ) : (
                                                                                <span className="text-xs text-gray-400">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-slate-100">{formatCentavos(cr.valor_total_centavos)}</td>
                                                                        <td className="py-2 px-3 text-right tabular-nums text-emerald-600 font-medium">{formatCentavos(cr.valor_pago_centavos)}</td>
                                                                        <td className="py-2 px-3 text-right">
                                                                            <MoneyDisplay centavos={cr.valor_aberto_centavos} size="sm" />
                                                                        </td>
                                                                        <td className="py-2 px-3 text-center">
                                                                            <StatusFinanceiroBadge status={cr.status} />
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right whitespace-nowrap">
                                                                            <div className="flex items-center justify-end gap-1.5">
                                                                                {canReceive && (
                                                                                    <Button
                                                                                        type="button"
                                                                                        size="sm"
                                                                                        variant="outline"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleReceber(cr);
                                                                                        }}
                                                                                    >
                                                                                        <DollarSign className="h-3.5 w-3.5 mr-1" /> Receber
                                                                                    </Button>
                                                                                )}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => openRowMenu(cr, e)}
                                                                                    className={`p-1.5 rounded-full transition-colors ${
                                                                                        activeMenuId === cr.id
                                                                                            ? 'bg-gray-200 text-gray-900 dark:text-slate-100'
                                                                                            : 'text-gray-500 hover:bg-gray-100'
                                                                                    }`}
                                                                                    title="Mais ações"
                                                                                >
                                                                                    <MoreVertical className="h-4 w-4" />
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="list-table">
                                <thead>
                                    <tr>
                                        <ThComFiltro label="Cliente" columnKey="cliente" />
                                        <ThComFiltro label="Código" columnKey="codigo" />
                                        <ThComFiltro label="Natureza" columnKey="natureza" />
                                        <ThComFiltro label="Tipo" columnKey="tipo" />
                                        <ThComFiltro label="Vencimento" columnKey="vencimento" />
                                        <ThComFiltro label="Mês ref." columnKey="referencia" />
                                        <ThComFiltro label="Recebimento" columnKey="recebimento" />
                                        <th>Usuário baixa</th>
                                        <th className="text-center">Atraso</th>
                                        <ThComFiltro label="Valor" columnKey="valor" align="right" />
                                        <th className="text-right">
                                            {filtroDataCampo === 'recebimento' ? 'Recebido no período' : 'Pago'}
                                        </th>
                                        <th className="text-right">Em aberto</th>
                                        <ThComFiltro label="Status" columnKey="status" align="center" />
                                        <th className="text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {paginatedFlat.map((cr) => {
                                        const isOverdue = cr.status === 'vencido';
                                        const isPaid = cr.status === 'pago';
                                        const baixaInfo = baixaInfoPorConta.get(cr.id);
                                        const recHoje =
                                            !!baixaInfo ||
                                            (!!cr.data_pagamento && cr.data_pagamento.slice(0, 10) === today);
                                        const isActiveRow = activeMenuId === cr.id;

                                        return (
                                            <tr
                                                key={cr.id}
                                                onClick={() => selectRowOnly(cr)}
                                                onDoubleClick={(e) => openRowMenuFromElement(cr, e.currentTarget as HTMLElement)}
                                                onContextMenu={(e) => openRowMenu(cr, e)}
                                                className={`transition-colors ${
                                                    isActiveRow
                                                        ? 'bg-blue-100 ring-1 ring-inset ring-blue-200'
                                                        : recHoje
                                                            ? 'bg-emerald-50/50 hover:bg-emerald-50/70'
                                                            : isOverdue
                                                                ? 'bg-red-50/40 hover:bg-red-50/70'
                                                                : isPaid
                                                                    ? 'bg-green-50/30 hover:bg-green-50/50'
                                                                    : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
                                                }`}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs flex-shrink-0">
                                                            {cr.cliente_nome.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <span className="font-medium text-gray-900 dark:text-slate-100 truncate block max-w-[180px]">
                                                                {cr.cliente_nome}
                                                            </span>
                                                            {cr.cliente_codigo && (
                                                                <p className="text-[10px] font-mono text-blue-700 font-semibold">{cr.cliente_codigo}</p>
                                                            )}
                                                            {cr.cliente_cpf && (
                                                                <p className="text-xs text-gray-400">{cr.cliente_cpf}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="py-3 px-4 font-mono text-xs text-gray-500">{cr.codigo}</td>

                                                <td className="py-3 px-4 text-xs text-gray-700 max-w-[180px] truncate" title={cr.natureza_financeira}>
                                                    {cr.natureza_financeira || '—'}
                                                </td>

                                                <td className="py-3 px-4">
                                                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                                        {labelTipoDocumentoCr(cr.tipo_documento)}
                                                    </span>
                                                </td>

                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                        <span className={`text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                                            {new Date(cr.data_vencimento + 'T00:00').toLocaleDateString('pt-BR')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-xs text-gray-600">
                                                    {formatarMesReferencia((cr as any).data_competencia)}
                                                </td>
                                                <td className="py-3 px-4 text-xs text-gray-600">
                                                    {formatarDataBR(cr.data_pagamento)}
                                                </td>
                                                <td className="py-3 px-4 text-xs text-gray-700 max-w-[160px] truncate" title={baixaInfo?.usuarioNome}>
                                                    {baixaInfo?.usuarioNome || '—'}
                                                </td>

                                                <td className="py-3 px-4 text-center">
                                                    {cr.dias_atraso > 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                                                            <Clock className="h-3 w-3" />
                                                            {cr.dias_atraso}d
                                                        </span>
                                                    ) : isPaid ? (
                                                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                                    ) : (
                                                        <span className="text-xs text-gray-400">—</span>
                                                    )}
                                                </td>

                                                <td className="py-3 px-4 text-right tabular-nums font-medium text-gray-900 dark:text-slate-100">{formatCentavos(cr.valor_total_centavos)}</td>
                                                <td className="py-3 px-4 text-right tabular-nums text-green-600 font-medium">
                                                    {baixaInfo ? (
                                                        <div>
                                                            <span>{formatCentavos(baixaInfo.valorCentavos)}</span>
                                                            <p className="text-[10px] font-normal text-slate-500">{baixaInfo.formaLabel}</p>
                                                        </div>
                                                    ) : (
                                                        formatCentavos(cr.valor_pago_centavos)
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <MoneyDisplay centavos={cr.valor_aberto_centavos} size="sm" />
                                                </td>

                                                <td className="py-3 px-4 text-center">
                                                    <StatusFinanceiroBadge status={cr.status} />
                                                </td>

                                                <td className="py-3 px-4 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => openRowMenu(cr, e)}
                                                        className={`p-1.5 rounded-full transition-colors ${
                                                            isActiveRow
                                                                ? 'bg-gray-200 text-gray-900 dark:text-slate-100'
                                                                : 'text-gray-500 hover:bg-gray-100'
                                                        }`}
                                                        title="Mais ações"
                                                    >
                                                        <MoreVertical className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="bg-gray-50 dark:bg-slate-800/30 px-4 py-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
                        <p className="text-sm text-gray-500">
                            Mostrando{' '}
                            <span className="font-semibold text-gray-700">
                                {visibleCount === 0 ? 0 : (page - 1) * pageSize + 1}
                            </span>{' '}
                            a{' '}
                            <span className="font-semibold text-gray-700">
                                {Math.min(page * pageSize, visibleCount)}
                            </span>{' '}
                            de{' '}
                            <span className="font-semibold text-gray-700">{visibleCount}</span>{' '}
                            título(s) • Total no sistema:{' '}
                            <span className="font-semibold text-gray-700">{contasReceberDetalhadas.length}</span>
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">Total em aberto:</span>
                                <span className="text-sm font-bold text-red-600">{formatCentavos(totais.aberto + totais.vencido)}</span>
                            </div>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={page === 1}
                                        onClick={() => setPage((p) => p - 1)}
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-1" />
                                        Anterior
                                    </Button>
                                    <span className="text-xs font-medium text-gray-700 px-2">
                                        {page} / {totalPages}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={page === totalPages}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        Próximo
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <EmptyFinanceiro
                    icon={<DollarSign className="h-8 w-8 text-gray-400" />}
                    title="Nenhum título encontrado"
                    description="Não há contas a receber com os filtros selecionados."
                    action={
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSearchTerm('');
                                setStatusFilter('');
                                setFiltroDataCampo('vencimento');
                                setDataInicio(primeiroDiaMes());
                                setDataFim(ultimoDiaMes());
                                setFormaHojeFilter('');
                                clearAllColumnFilters();
                            }}
                        >
                            Limpar Filtros
                        </Button>
                    }
                />
            )}

            {filterMenuColumn && filterMenuPosition && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-transparent"
                        onClick={() => { setFilterMenuColumn(null); setFilterMenuPosition(undefined); setDropdownSearch(''); }}
                    />
                    <div
                        style={{ position: 'fixed', top: `${filterMenuPosition.y}px`, left: `${filterMenuPosition.x}px` }}
                        className="z-50 w-64 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 p-3 max-h-80 overflow-hidden flex flex-col"
                    >
                        <div className="flex items-center justify-between mb-2 shrink-0">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Filtro: {COLUMN_FILTER_LABELS[filterMenuColumn]}
                            </span>
                            {columnFilters[filterMenuColumn].length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setColumnFilters((prev) => ({ ...prev, [filterMenuColumn]: [] }))}
                                    className="text-xs text-red-600 hover:underline font-semibold"
                                >
                                    Limpar
                                </button>
                            )}
                        </div>
                        <div className="relative mb-2 shrink-0">
                            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Pesquisar..."
                                value={dropdownSearch}
                                onChange={(e) => setDropdownSearch(e.target.value)}
                                className="w-full pl-8 pr-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-slate-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1 py-1 max-h-48 border-t border-gray-100 dark:border-gray-800">
                            {getUniqueValuesForColumn(filterMenuColumn)
                                .filter((val) => {
                                    if (!dropdownSearch) return true;
                                    return getFriendlyFilterLabel(filterMenuColumn, val)
                                        .toLowerCase()
                                        .includes(dropdownSearch.toLowerCase());
                                })
                                .map((val) => {
                                    const label = getFriendlyFilterLabel(filterMenuColumn, val);
                                    const isChecked = columnFilters[filterMenuColumn].includes(val);
                                    const isValor = filterMenuColumn === 'valor';
                                    return (
                                        <label
                                            key={val}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer text-xs select-none transition-colors dark:text-slate-200"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleToggleColumnFilter(filterMenuColumn, val)}
                                                className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer shrink-0"
                                            />
                                            <span className={`truncate flex-1 ${isValor ? 'text-right tabular-nums font-medium' : ''}`}>{label}</span>
                                        </label>
                                    );
                                })}
                        </div>
                    </div>
                </>
            )}

            {/* Payment Modal */}
            {showModal && selectedConta && (
                <ReceberPagamentoModal
                    conta={selectedConta}
                    onClose={() => { setShowModal(false); setSelectedConta(null); }}
                    onSuccess={handlePaymentSuccess}
                />
            )}

            {/* Novo lançamento de receita */}
            {showNovaConta && (
                <NovaContaReceberModal
                    key="nova-receita-modal"
                    onClose={() => setShowNovaConta(false)}
                    onSuccess={handleRefresh}
                />
            )}

            {contaDetalheBaixa && (
                <DetalhesBaixaParcelaModal
                    contaReceberId={contaDetalheBaixa.id}
                    parcelaCodigo={contaDetalheBaixa.codigo}
                    onClose={() => setContaDetalheBaixa(null)}
                />
            )}

            {/* Mini menu de ações (overlay fixo) */}
            {activeMenuId && selectedConta && menuPosition && (
                <DropdownMenuContent
                    isOpen={true}
                    onClose={() => setActiveMenuId(null)}
                    position={menuPosition}
                >
                    <div className="px-3 py-2 border-b mb-1">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ações</p>
                        <p className="text-[11px] text-gray-400 truncate font-mono">{selectedConta.codigo}</p>
                    </div>

                    {(['aberto', 'vencido', 'pago_parcial'].includes(selectedConta.status)) && (
                        <DropdownMenuItem
                            onClick={() => {
                                handleReceber(selectedConta);
                                setActiveMenuId(null);
                            }}
                        >
                            <DollarSign className="h-4 w-4 mr-2 text-emerald-500" />
                            <span className="text-emerald-700">{selectedConta.status === 'pago_parcial' ? 'Continuar baixa' : 'Dar baixa / Receber'}</span>
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuItem
                        onClick={() => {
                            handleReceber(selectedConta);
                            setActiveMenuId(null);
                        }}
                    >
                        <Eye className="h-4 w-4 mr-2 text-gray-400" />
                        Ver / Editar título
                    </DropdownMenuItem>

                    {['pago', 'pago_parcial'].includes(selectedConta.status) && (
                        <DropdownMenuItem
                            onClick={() => {
                                setContaDetalheBaixa(selectedConta);
                                setActiveMenuId(null);
                            }}
                        >
                            <FileSearch className="h-4 w-4 mr-2 text-indigo-500" />
                            <span className="text-indigo-700">Detalhes da baixa</span>
                        </DropdownMenuItem>
                    )}

                    {selectedConta.status === 'pago' && (
                        <DropdownMenuItem
                            onClick={() => {
                                handlePrintRecibo(selectedConta);
                                setActiveMenuId(null);
                            }}
                        >
                            <Printer className="h-4 w-4 mr-2 text-blue-500" />
                            <span className="text-blue-700">Reimprimir recibo</span>
                        </DropdownMenuItem>
                    )}

                    {selectedConta.status === 'pago' && (
                        <DropdownMenuItem
                            onClick={() => {
                                const cr = selectedConta;
                                setActiveMenuId(null);
                                void handleEstornar(cr);
                            }}
                        >
                            <Undo2 className="h-4 w-4 mr-2 text-amber-500" />
                            <span className="text-amber-700">Estornar baixa</span>
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuItem
                        onClick={() => {
                            const cr = selectedConta;
                            setActiveMenuId(null);
                            void handleExcluir(cr);
                        }}
                    >
                        <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                        <span className="text-red-700 font-medium">Excluir título</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            )}
        </div>
    );
};

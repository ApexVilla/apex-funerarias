import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search, Plus, Shield,
    CheckCircle2,
    XCircle, CreditCard, RefreshCw, Clock,
    Eye, Edit, MessageCircle, Archive, Printer, Pen,
    ChevronLeft, ChevronRight, Filter,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, Badge, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import {
    imprimirContratoAssinatura,
    resolvePlanoContratoAssinatura,
    type PlanoContratoResolvido,
} from '../../lib/ContratoAssinaturaService';
import type { AssinaturaSB, ClienteSB } from '../../lib/ClienteStore';
import { useClienteStore } from '../../lib/ClienteStore';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useFilial } from '../../lib/FilialContext';
import { useToast } from '../../lib/ToastStore';
import {
    clienteIdsNaCarteiraEscritorio,
    resolverCanalCobrancaCliente,
    ROTULO_CARTEIRA_ESCRITORIO,
} from '../../lib/carteiraEscritorio';
import { mapaCobradorNomePorCliente } from '../../lib/cobradorDisponiveis';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { contratoCodigoMatch } from '../../lib/buscaContrato';
import {
    dataHojeIsoLocal,
    dataLocalFeitoContrato,
    formatarDataIsoPtBr,
    normalizarDataIso,
    parseDataIsoLocal,
} from '../../lib/contratoDatas';
import { EnviarParaAssinaturaModal } from '../../components/contratos/EnviarParaAssinaturaModal';
import { IndicadorAssinaturaDigital } from '../../components/contratos/IndicadorAssinaturaDigital';
import {
    mapaStatusAssinaturaDigitalPorContrato,
    type StatusAssinaturaDigitalResumo,
} from '../../lib/assinaturaDigitalService';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000, 5000];

type StatCardFilter = '' | 'ativo' | 'cancelado' | 'feitos_hoje';

function corTextoPlano(tipo: PlanoContratoResolvido['tipo']): string {
    switch (tipo) {
        case 'onix':
            return 'text-slate-800';
        case 'catalao_padrao':
            return 'text-emerald-700';
        case 'fenix':
            return 'text-amber-700';
        default:
            return 'text-gray-600';
    }
}

/** Uma linha, texto menor, cor por tipo de plano. */
function planoListaExibicao(contrato: AssinaturaSB): { texto: string; corClasse: string } {
    const plano = resolvePlanoContratoAssinatura(contrato);
    const bruto = (plano.label || '').trim();
    let texto = '—';
    if (bruto) {
        if (/^plano\b/i.test(bruto)) {
            texto = bruto.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Plano\b/i, 'Plano');
        } else {
            const titulo = bruto
                .toLowerCase()
                .split(/\s+/)
                .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                .join(' ');
            texto = `Plano ${titulo}`;
        }
    }
    return { texto, corClasse: corTextoPlano(plano.tipo) };
}

export const ContratosList: React.FC = () => {
    const navigate = useNavigate();
    const {
        assinaturas,
        loadAllAssinaturas,
        loadClienteById,
        loading,
        loadingAssinaturas,
        cancelAssinatura,
    } = useClienteStore();
    const { visaoTodasEmpresasGrupo, loadingEmpresasGrupo, empresaIdsParaFiltro, dataRevisionEmpresa } =
        useEmpresaContextoAtivo();
    const { empresaIdsFiltro: empresaIdsOperacao } = useEmpresaIdsOperacao();
    const { dataRevision: dataRevisionFilial } = useFilial();
    const aguardandoGrupoParaVisaoTodas =
        visaoTodasEmpresasGrupo && loadingEmpresasGrupo && empresaIdsParaFiltro.length === 0;
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [statCardFilter, setStatCardFilter] = useState<StatCardFilter>('');
    const [columnFilters, setColumnFilters] = useState<{ status: string[]; plano: string[] }>({ status: [], plano: [] });
    const [filterMenuColumn, setFilterMenuColumn] = useState<string | null>(null);
    const [filterMenuPosition, setFilterMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);
    const [dropdownSearch, setDropdownSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const [imprimindoContratoId, setImprimindoContratoId] = useState<string | null>(null);
    const [cobrancaPorCliente, setCobrancaPorCliente] = useState<Map<string, string>>(() => new Map());
    const [assinaturaDigitalContrato, setAssinaturaDigitalContrato] = useState<AssinaturaSB | null>(null);
    const [assinaturaDigitalCliente, setAssinaturaDigitalCliente] = useState<ClienteSB | null>(null);
    const [statusDigitalMap, setStatusDigitalMap] = useState<Map<string, StatusAssinaturaDigitalResumo>>(
        () => new Map(),
    );
    const hojeIso = dataHojeIsoLocal();

    const contratosFeitosHoje = useMemo(
        () =>
            assinaturas.filter(
                (a) => dataLocalFeitoContrato(a.created_at, a.data_contratacao) === hojeIso,
            ),
        [assinaturas, hojeIso],
    );

    const statCardValor = (n: number | string) =>
        loadingAssinaturas ? (
            <span className="inline-flex items-center text-2xl font-bold tabular-nums text-gray-400">
                <RefreshCw className="h-5 w-5 animate-spin" aria-hidden />
                <span className="sr-only">Carregando</span>
            </span>
        ) : (
            n
        );

    const empresaIdsCobrador =
        empresaIdsParaFiltro.length > 0 ? empresaIdsParaFiltro : empresaIdsOperacao;

    const openContratoMenu = (contratoId: string, event: React.MouseEvent) => {
        setSelectedId(contratoId);
        setOpenMenuId(contratoId);
        setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
    };

    const getCodigoNumerico = (codigo?: string) => {
        const onlyDigits = (codigo || '').replace(/\D/g, '');
        return onlyDigits || '-';
    };

    const calcularTempoContrato = (dataInicio: string, dataFim?: string | null) => {
        const inicio = parseDataIsoLocal(dataInicio) || new Date();
        const fim = dataFim ? parseDataIsoLocal(dataFim) || new Date() : new Date();

        let anos = fim.getFullYear() - inicio.getFullYear();
        let meses = fim.getMonth() - inicio.getMonth();
        let dias = fim.getDate() - inicio.getDate();

        if (dias < 0) {
            meses--;
            dias += new Date(fim.getFullYear(), fim.getMonth(), 0).getDate();
        }
        if (meses < 0) {
            anos--;
            meses += 12;
        }

        const partes: string[] = [];
        if (anos > 0) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
        if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
        if (partes.length === 0) partes.push(`${Math.max(dias, 1)} ${dias === 1 ? 'dia' : 'dias'}`);

        return partes.join(' e ');
    };

    useEffect(() => {
        if (aguardandoGrupoParaVisaoTodas) return;
        void loadAllAssinaturas();
    }, [loadAllAssinaturas, dataRevisionFilial, dataRevisionEmpresa, aguardandoGrupoParaVisaoTodas]);

    useEffect(() => {
        if (aguardandoGrupoParaVisaoTodas || assinaturas.length === 0) {
            setStatusDigitalMap(new Map());
            return;
        }
        let cancelled = false;
        void mapaStatusAssinaturaDigitalPorContrato(assinaturas.map((a) => a.id)).then((m) => {
            if (!cancelled) setStatusDigitalMap(m);
        });
        return () => {
            cancelled = true;
        };
    }, [assinaturas, dataRevisionFilial, dataRevisionEmpresa, aguardandoGrupoParaVisaoTodas]);

    useEffect(() => {
        if (empresaIdsCobrador.length === 0) {
            setCobrancaPorCliente(new Map());
            return;
        }
        let cancelled = false;
        void (async () => {
            for (const empId of empresaIdsCobrador) {
                await supabase.rpc('fn_cob_carteira_upsert_pendencias_de_titulos', {
                    p_empresa_id: empId,
                });
            }
            const [nomesCobrador, idsEscritorio] = await Promise.all([
                mapaCobradorNomePorCliente(empresaIdsCobrador),
                clienteIdsNaCarteiraEscritorio(empresaIdsCobrador),
            ]);
            if (cancelled) return;
            const map = new Map(nomesCobrador);
            for (const cid of idsEscritorio) {
                if (!map.has(cid)) map.set(cid, ROTULO_CARTEIRA_ESCRITORIO);
            }
            setCobrancaPorCliente(map);
        })();
        return () => {
            cancelled = true;
        };
    }, [empresaIdsCobrador.join(','), dataRevisionFilial]);

    // Format currency
    const formatMoney = (centavos: number) => {
        return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const getUniqueValuesForColumn = (columnKey: 'status' | 'plano'): string[] => {
        const set = new Set<string>();
        assinaturas.forEach((a) => {
            if (columnKey === 'status') set.add(a.status || '—');
            if (columnKey === 'plano') set.add(a.plano_nome || '—');
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    };

    const COLUMN_LABELS: Record<string, string> = { status: 'Status', plano: 'Plano' };

    const STATUS_FRIENDLY: Record<string, string> = {
        ativo: 'Ativo', cancelado: 'Cancelado', cancelada: 'Cancelado',
        suspenso: 'Suspenso', suspensa: 'Suspenso', inadimplente: 'Inadimplente',
    };

    const handleOpenFilterMenu = (columnKey: string, event: React.MouseEvent) => {
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

    const handleToggleColumnFilter = (columnKey: 'status' | 'plano', value: string) => {
        setColumnFilters((prev) => {
            const current = prev[columnKey];
            const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
            return { ...prev, [columnKey]: updated };
        });
        if (columnKey === 'status') setStatCardFilter('');
    };

    const aplicarFiltroCard = (filtro: StatCardFilter | 'todos') => {
        setPage(1);
        if (filtro === 'todos' || filtro === '') {
            setStatCardFilter('');
            setColumnFilters((prev) => ({ ...prev, status: [] }));
            return;
        }
        if (filtro === 'ativo') {
            setStatCardFilter('ativo');
            setColumnFilters((prev) => ({ ...prev, status: ['ativo'] }));
            return;
        }
        if (filtro === 'cancelado') {
            setStatCardFilter('cancelado');
            setColumnFilters((prev) => ({ ...prev, status: ['cancelado'] }));
            return;
        }
        if (filtro === 'feitos_hoje') {
            setStatCardFilter('feitos_hoje');
            setColumnFilters((prev) => ({ ...prev, status: [] }));
        }
    };

    const cardFiltroAtivo = (filtro: StatCardFilter | 'todos') => {
        if (filtro === 'todos') return statCardFilter === '';
        return statCardFilter === filtro;
    };

    const classeCardFiltro = (base: string, ativo: boolean) =>
        `${base} cursor-pointer hover:shadow-md transition-all group ${
            ativo ? 'ring-2 ring-offset-1 shadow-sm scale-[1.02]' : 'hover:scale-[1.01]'
        }`;

    const matchesStatCardFilter = (a: AssinaturaSB) => {
        switch (statCardFilter) {
            case 'ativo':
                return a.status === 'ativo';
            case 'cancelado':
                return a.status === 'cancelado' || a.status === 'cancelada';
            case 'feitos_hoje':
                return dataLocalFeitoContrato(a.created_at, a.data_contratacao) === hojeIso;
            default:
                return true;
        }
    };

    const filtered = useMemo(() => {
        const termo = searchTerm.trim();

        return assinaturas.filter((a) => {
            let matchesSearch = !termo;
            if (termo) {
                matchesSearch =
                    contratoCodigoMatch(a.codigo, termo) ||
                    (a.cliente_nome?.toLowerCase() || '').includes(termo.toLowerCase()) ||
                    (a.plano_nome?.toLowerCase() || '').includes(termo.toLowerCase()) ||
                    (a.dependentes || []).some((d) => {
                        const termoCpf = termo.replace(/\D/g, '');
                        if ((d.nome || '').toLowerCase().includes(termo.toLowerCase())) return true;
                        if (termoCpf.length >= 3) {
                            const cpfDep = (d.cpf || '').replace(/\D/g, '');
                            return cpfDep.includes(termoCpf);
                        }
                        return false;
                    });
                if (!matchesSearch) {
                    const termoCpf = termo.replace(/\D/g, '');
                    if (termoCpf.length >= 3) {
                        const cpfTitular = (a.cliente_cpf || '').replace(/\D/g, '');
                        matchesSearch = cpfTitular.includes(termoCpf);
                    }
                }
            }

            const matchesStatus =
                columnFilters.status.length === 0 ||
                columnFilters.status.includes(a.status || '') ||
                (columnFilters.status.includes('cancelado') && a.status === 'cancelada');
            const matchesPlano = columnFilters.plano.length === 0 || columnFilters.plano.includes(a.plano_nome || '—');
            const matchesCard = matchesStatCardFilter(a);
            return matchesSearch && matchesStatus && matchesPlano && matchesCard;
        });
    }, [assinaturas, searchTerm, columnFilters, statCardFilter, hojeIso]);

    const totalPages = Math.ceil(filtered.length / pageSize);
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => { setPage(1); }, [searchTerm, columnFilters.status.join(','), columnFilters.plano.join(',|'), statCardFilter]);

    const getStatusBadge = (status: string) => {
        const map: Record<string, { variant: 'success' | 'danger' | 'warning' | 'default', label: string }> = {
            ativo: { variant: 'success', label: 'Ativo' },
            cancelado: { variant: 'danger', label: 'Cancelado' },
            cancelada: { variant: 'danger', label: 'Cancelado' },
            suspenso: { variant: 'warning', label: 'Suspenso' },
            suspensa: { variant: 'warning', label: 'Suspenso' },
            inadimplente: { variant: 'danger', label: 'Inadimplente' },
        };
        const s = map[status] || { variant: 'default', label: status };
        return <Badge variant={s.variant}>{s.label}</Badge>;
    };

    const handleImprimirContrato = async (contratoId: string) => {
        setImprimindoContratoId(contratoId);
        try {
            const r = await imprimirContratoAssinatura(contratoId);
            if (r.ok) {
                showToast('Contrato enviado para impressão.', 'success');
            } else {
                showToast(r.error || 'Não foi possível imprimir o contrato.', 'error');
            }
        } finally {
            setImprimindoContratoId(null);
        }
    };

    const handleVerDetalhes = async (clienteId?: string | null) => {
        if (!clienteId) {
            showToast('Este contrato não possui cliente vinculado.', 'warning');
            return;
        }

        const cliente = await loadClienteById(clienteId);
        if (!cliente) {
            showToast('Cliente não encontrado para este contrato.', 'error');
            return;
        }

        navigate(`/clientes/${clienteId}?mode=professional&tab=contratos`);
    };

    const solicitarCancelamentoContrato = async (contrato: AssinaturaSB) => {
        setOpenMenuId(null);
        if (contrato.status === 'cancelado' || contrato.status === 'cancelada') {
            showToast('Este contrato já está cancelado.', 'warning');
            return;
        }
        const confirmar = window.confirm(
            'Cancelar este contrato?\n\nO contrato não será apagado: o registro permanece no sistema com status Cancelado (histórico e carteira).',
        );
        if (!confirmar) return;
        const motivo = window.prompt('Motivo do cancelamento (opcional):') ?? '';
        const { ok, error: errMsg } = await cancelAssinatura(contrato.id, motivo.trim() || undefined);
        if (ok) {
            showToast('Contrato cancelado. O registro foi mantido na base.', 'success');
        } else {
            showToast(errMsg || 'Não foi possível cancelar o contrato.', 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Contratos"
                subtitle="Visualize e gerencie todos os contratos ativos"
                actionButton={
                    <Button onClick={() => navigate('/clientes/novo?modo=contrato')}>
                        <Plus className="h-4 w-4 mr-2" /> Novo Contrato
                    </Button>
                }
            />

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Nº contrato (ex. 55 ou CTR-000055), cliente, CPF ou dependente…"
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-48">
                    <Select
                        value={columnFilters.status.length === 1 ? columnFilters.status[0] : ''}
                        onChange={(e) => {
                            const v = e.target.value;
                            setColumnFilters((prev) => ({ ...prev, status: v ? [v] : [] }));
                            setStatCardFilter(
                                v === 'ativo' ? 'ativo' : v === 'cancelado' ? 'cancelado' : '',
                            );
                        }}
                    >
                        <option value="">Status: Todos</option>
                        <option value="ativo">Ativo</option>
                        <option value="cancelado">Cancelado</option>
                        <option value="suspenso">Suspenso</option>
                        <option value="inadimplente">Inadimplente</option>
                    </Select>
                </div>
                <Button
                    variant="outline"
                    onClick={() => loadAllAssinaturas()}
                    disabled={loadingAssinaturas}
                    title="Atualizar Lista"
                >
                    <RefreshCw className={`h-4 w-4 ${loadingAssinaturas ? 'animate-spin' : ''}`} />
                </Button>
            </div>
            <p className="text-xs text-gray-500 -mt-2 mb-4 px-4 md:px-0">
                Um clique <strong className="text-gray-700">seleciona</strong> o contrato;{' '}
                <strong className="text-gray-700">duplo clique</strong> ou{' '}
                <strong className="text-gray-700">botão direito</strong> abre o menu de ações (imprimir, assinar, cancelar, etc.).
            </p>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card
                    className={classeCardFiltro(
                        'p-4 flex items-center justify-between bg-blue-50 border-blue-100 ring-blue-400',
                        cardFiltroAtivo('todos'),
                    )}
                    onClick={() => aplicarFiltroCard('todos')}
                    title="Mostrar todos os contratos"
                >
                    <div>
                        <p className="text-sm font-medium text-blue-600">Total Contratos</p>
                        <p className="text-2xl font-bold text-blue-900">{statCardValor(assinaturas.length)}</p>
                    </div>
                    <Shield className="h-8 w-8 text-blue-500 opacity-50 group-hover:opacity-70 transition-opacity" />
                </Card>
                <Card
                    className={classeCardFiltro(
                        'p-4 flex items-center justify-between bg-green-50 border-green-100 ring-green-400',
                        cardFiltroAtivo('ativo'),
                    )}
                    onClick={() => aplicarFiltroCard('ativo')}
                    title="Filtrar contratos ativos"
                >
                    <div>
                        <p className="text-sm font-medium text-green-600">Ativos</p>
                        <p className="text-2xl font-bold text-green-900">
                            {statCardValor(assinaturas.filter(a => a.status === 'ativo').length)}
                        </p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50 group-hover:opacity-70 transition-opacity" />
                </Card>
                <Card
                    className={classeCardFiltro(
                        'p-4 flex items-center justify-between bg-red-50 border-red-100 ring-red-400',
                        cardFiltroAtivo('cancelado'),
                    )}
                    onClick={() => aplicarFiltroCard('cancelado')}
                    title="Filtrar contratos cancelados"
                >
                    <div>
                        <p className="text-sm font-medium text-red-600">Cancelados</p>
                        <p className="text-2xl font-bold text-red-900">
                            {statCardValor(
                                assinaturas.filter(a => a.status === 'cancelado' || a.status === 'cancelada').length,
                            )}
                        </p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-500 opacity-50 group-hover:opacity-70 transition-opacity" />
                </Card>
                <Card
                    className={classeCardFiltro(
                        'p-4 flex items-center justify-between bg-purple-50 border-purple-100 ring-purple-400',
                        cardFiltroAtivo('ativo'),
                    )}
                    onClick={() => aplicarFiltroCard('ativo')}
                    title="Filtrar contratos ativos (base do valor mensal)"
                >
                    <div>
                        <p className="text-sm font-medium text-purple-600">Valor Mensal</p>
                        <p className="text-xl font-bold text-purple-900">
                            {loadingAssinaturas
                                ? statCardValor('—')
                                : formatMoney(
                                      assinaturas
                                          .filter(a => a.status === 'ativo')
                                          .reduce((acc, curr) => acc + curr.valor_mensal_centavos, 0),
                                  )}
                        </p>
                    </div>
                    <CreditCard className="h-8 w-8 text-purple-500 opacity-50 group-hover:opacity-70 transition-opacity" />
                </Card>
                <Card
                    className={classeCardFiltro(
                        'p-4 flex items-center justify-between bg-indigo-50 border-indigo-100 ring-indigo-400',
                        cardFiltroAtivo('feitos_hoje'),
                    )}
                    onClick={() => aplicarFiltroCard('feitos_hoje')}
                    title="Filtrar contratos feitos hoje"
                >
                    <div>
                        <p className="text-sm font-medium text-indigo-600">Feitos hoje</p>
                        <p className="text-2xl font-bold text-indigo-900 tabular-nums">
                            {statCardValor(contratosFeitosHoje.length)}
                        </p>
                        <p className="text-xs text-indigo-600 mt-0.5">{formatarDataIsoPtBr(hojeIso)}</p>
                    </div>
                    <Clock className="h-8 w-8 text-indigo-500 opacity-50 group-hover:opacity-70 transition-opacity" />
                </Card>
            </div>

            {/* Badges de filtros de coluna ativos */}
            {(columnFilters.status.length > 0 || columnFilters.plano.length > 0 || statCardFilter === 'feitos_hoje') && (
                <div className="flex flex-wrap items-center gap-2 -mt-2">
                    <span className="text-xs text-gray-500 font-medium">Filtros ativos:</span>
                    {statCardFilter === 'feitos_hoje' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <span className="text-indigo-500 font-bold uppercase text-[10px]">Card:</span>
                            Feitos hoje ({formatarDataIsoPtBr(hojeIso)})
                            <button
                                type="button"
                                onClick={() => aplicarFiltroCard('todos')}
                                className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition-colors"
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {Object.entries(columnFilters).map(([key, values]) =>
                        (values as string[]).map((val) => (
                            <span
                                key={`${key}-${val}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                            >
                                <span className="text-blue-500 font-bold uppercase text-[10px]">{COLUMN_LABELS[key]}:</span>
                                {key === 'status' ? (STATUS_FRIENDLY[val] || val) : val}
                                <button
                                    type="button"
                                    onClick={() => handleToggleColumnFilter(key as 'status' | 'plano', val)}
                                    className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors"
                                >
                                    ×
                                </button>
                            </span>
                        ))
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setColumnFilters({ status: [], plano: [] });
                            setStatCardFilter('');
                        }}
                        className="text-xs text-red-500 hover:underline font-semibold"
                    >
                        Limpar tudo
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="list-table-shell">
                <div className="flex flex-wrap items-center gap-3 px-1 pb-2 text-[10px] text-gray-500">
                    <span className="font-semibold text-gray-600">Assinatura digital:</span>
                    <IndicadorAssinaturaDigital status="assinado" showLabel />
                    <IndicadorAssinaturaDigital status="pendente" showLabel />
                    <IndicadorAssinaturaDigital status="nenhum" showLabel />
                </div>
                <div className="overflow-x-auto">
                    <table className="list-table">
                        <thead>
                            <tr>
                                <th>Contrato</th>
                                <th className="text-center w-10" title="Assinatura digital">
                                    <Pen className="h-3.5 w-3.5 mx-auto text-gray-400" />
                                </th>
                                <th>Cliente</th>
                                <th>
                                    <div className="flex items-center gap-1 select-none">
                                        <span>Plano</span>
                                        <button
                                            onClick={(e) => handleOpenFilterMenu('plano', e)}
                                            className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                                                columnFilters.plano.length > 0
                                                    ? 'text-blue-600 bg-blue-50 ring-1 ring-blue-100'
                                                    : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                            title="Filtrar Plano"
                                        >
                                            <Filter className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </th>
                                <th>Data Início</th>
                                <th>Tempo</th>
                                <th className="text-right">Valor</th>
                                <th className="text-center">
                                    <div className="flex items-center justify-center gap-1 select-none mx-auto w-fit">
                                        <span>Status</span>
                                        <button
                                            onClick={(e) => handleOpenFilterMenu('status', e)}
                                            className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                                                columnFilters.status.length > 0
                                                    ? 'text-blue-600 bg-blue-50 ring-1 ring-blue-100'
                                                    : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                            title="Filtrar Status"
                                        >
                                            <Filter className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {aguardandoGrupoParaVisaoTodas ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-gray-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            Carregando empresas do grupo...
                                        </div>
                                    </td>
                                </tr>
                            ) : loadingAssinaturas && filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-gray-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            Carregando contratos...
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-gray-500">
                                        Nenhum contrato encontrado.
                                    </td>
                                </tr>
                            ) : (
                                paginated.map((contrato) => {
                                    const tempo = calcularTempoContrato(
                                        contrato.data_contratacao,
                                        contrato.status === 'cancelado' || contrato.status === 'cancelada'
                                            ? contrato.data_cancelamento
                                             : null,
                                    );
                                    const rotuloCobranca = cobrancaPorCliente.get(contrato.cliente_id);
                                    const canalCobranca = resolverCanalCobrancaCliente(
                                        contrato.forma_pagamento,
                                        rotuloCobranca,
                                    );
                                    const planoUi = planoListaExibicao(contrato as AssinaturaSB);
                                    return (
                                        <tr
                                            key={contrato.id}
                                            className={`cursor-pointer transition-all ${openMenuId === contrato.id || selectedId === contrato.id ? 'bg-blue-50 dark:bg-blue-950/40 ring-1 ring-inset ring-blue-100 dark:ring-blue-900/50' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                                            onClick={() => {
                                                setSelectedId(contrato.id);
                                                setOpenMenuId(null);
                                            }}
                                            onDoubleClick={(e) => {
                                                e.preventDefault();
                                                openContratoMenu(contrato.id, e);
                                            }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                openContratoMenu(contrato.id, e);
                                            }}
                                        >
                                            <td>
                                                <span className="font-mono text-xs font-medium bg-gray-100 px-2 py-1 rounded text-gray-700">
                                                    {getCodigoNumerico(contrato.codigo)}
                                                </span>
                                            </td>
                                            <td className="text-center">
                                                <IndicadorAssinaturaDigital
                                                    status={statusDigitalMap.get(contrato.id) || 'nenhum'}
                                                />
                                            </td>
                                            <td>
                                                <div className="font-medium text-gray-900 dark:text-slate-100">{contrato.cliente_nome}</div>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {canalCobranca === 'cobrador' && (
                                                        <span
                                                            className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                                                rotuloCobranca && rotuloCobranca !== ROTULO_CARTEIRA_ESCRITORIO
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200/60'
                                                            }`}
                                                            title={rotuloCobranca && rotuloCobranca !== ROTULO_CARTEIRA_ESCRITORIO ? `Cobrador: ${rotuloCobranca}` : 'Cobrador não atribuído'}
                                                        >
                                                            {rotuloCobranca && rotuloCobranca !== ROTULO_CARTEIRA_ESCRITORIO 
                                                                ? `Cobrador: ${rotuloCobranca}` 
                                                                : 'Cobrador Não Atribuído'}
                                                        </span>
                                                    )}
                                                    {canalCobranca === 'escritorio' && (
                                                        <span
                                                            className="inline-block text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200/60 px-1.5 py-0.5 rounded"
                                                            title="Forma de pagamento do contrato: pagamento no escritório"
                                                        >
                                                            Escritório
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="max-w-[9.5rem] py-2">
                                                <span
                                                    className={`text-[11px] font-semibold leading-tight truncate block ${planoUi.corClasse}`}
                                                    title={planoUi.texto}
                                                >
                                                    {planoUi.texto}
                                                </span>
                                            </td>
                                            <td className="text-gray-600">
                                                {formatarDataIsoPtBr(contrato.data_contratacao)}
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1.5 text-gray-700">
                                                    <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                                    <span className="text-sm">{tempo}</span>
                                                </div>
                                            </td>
                                            <td className="text-right font-medium text-gray-900 dark:text-slate-100">
                                                {formatMoney(contrato.valor_mensal_centavos)}
                                            </td>
                                            <td className="text-center">
                                                {getStatusBadge(contrato.status)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                    {openMenuId && menuPosition && (() => {
                        const contratoMenu = filtered.find((a) => a.id === openMenuId);
                        if (!contratoMenu) return null;
                        return (
                            <DropdownMenuContent
                                isOpen
                                onClose={() => setOpenMenuId(null)}
                                position={menuPosition}
                            >
                                <DropdownMenuItem
                                    onClick={() => {
                                        void handleVerDetalhes(contratoMenu.cliente_id);
                                        setOpenMenuId(null);
                                    }}
                                >
                                    <Eye className="h-4 w-4 mr-2 shrink-0" /> Ver perfil do cliente
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        void handleImprimirContrato(contratoMenu.id);
                                        setOpenMenuId(null);
                                    }}
                                >
                                    <Printer className="h-4 w-4 mr-2 shrink-0" /> Imprimir contrato
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        navigate(`/clientes/${contratoMenu.cliente_id}/editar`);
                                        setOpenMenuId(null);
                                    }}
                                >
                                    <Edit className="h-4 w-4 mr-2 shrink-0" /> Editar cadastro
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        navigate(`/clientes/${contratoMenu.cliente_id}?tab=financeiro&mode=professional`);
                                        setOpenMenuId(null);
                                    }}
                                >
                                    <CreditCard className="h-4 w-4 mr-2 shrink-0" /> Financeiro
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={async () => {
                                        setOpenMenuId(null);
                                        const cli = await loadClienteById(contratoMenu.cliente_id);
                                        if (cli) {
                                            setAssinaturaDigitalCliente(cli);
                                            setAssinaturaDigitalContrato(contratoMenu as AssinaturaSB);
                                        } else {
                                            showToast('Cliente não encontrado.', 'error');
                                        }
                                    }}
                                >
                                    <Pen className="h-4 w-4 mr-2 shrink-0" /> Enviar para Assinatura Digital
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        /* reservado */
                                        setOpenMenuId(null);
                                    }}
                                >
                                    <MessageCircle className="h-4 w-4 mr-2 shrink-0" /> WhatsApp
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    variant="danger"
                                    onClick={() => {
                                        void solicitarCancelamentoContrato(contratoMenu as AssinaturaSB);
                                    }}
                                >
                                    <Archive className="h-4 w-4 mr-2 shrink-0" /> Cancelar contrato
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        );
                    })()}
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">
                            Mostrando {(page - 1) * pageSize + 1} a {Math.min(page * pageSize, filtered.length)} de {filtered.length} resultados
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 whitespace-nowrap">Itens por página:</span>
                            <select 
                                value={pageSize} 
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="text-xs border rounded px-1 py-0.5 bg-white outline-none"
                            >
                                {PAGE_SIZE_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <span className="text-sm font-medium text-gray-700 px-4">
                            Página <span className="text-blue-600">{page}</span> de {totalPages || 1}
                        </span>
                        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                            Próximo <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Popup filtro de coluna */}
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
                                Filtro: {COLUMN_LABELS[filterMenuColumn]}
                            </span>
                            {(columnFilters as Record<string, string[]>)[filterMenuColumn]?.length > 0 && (
                                <button
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
                            {getUniqueValuesForColumn(filterMenuColumn as 'status' | 'plano')
                                .filter((val) => !dropdownSearch || (filterMenuColumn === 'status' ? STATUS_FRIENDLY[val] || val : val).toLowerCase().includes(dropdownSearch.toLowerCase()))
                                .map((val) => {
                                    const label = filterMenuColumn === 'status' ? (STATUS_FRIENDLY[val] || val) : val;
                                    const isChecked = ((columnFilters as Record<string, string[]>)[filterMenuColumn] || []).includes(val);
                                    return (
                                        <label
                                            key={val}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer text-xs select-none transition-colors dark:text-slate-200"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleToggleColumnFilter(filterMenuColumn as 'status' | 'plano', val)}
                                                className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                                            />
                                            <span className="truncate">{label}</span>
                                        </label>
                                    );
                                })}
                        </div>
                    </div>
                </>
            )}

            {/* Modal de Assinatura Digital */}
            {assinaturaDigitalContrato && assinaturaDigitalCliente && (
                <EnviarParaAssinaturaModal
                    open
                    onClose={() => {
                        setAssinaturaDigitalContrato(null);
                        setAssinaturaDigitalCliente(null);
                    }}
                    cliente={assinaturaDigitalCliente}
                    assinatura={assinaturaDigitalContrato}
                    empresaId={assinaturaDigitalContrato.empresa_id}
                    onEnviado={() => showToast('Assinatura digital enviada com sucesso!', 'success')}
                />
            )}
        </div>
    );
};

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Map, Plus, Search, RefreshCw, Car, Users, Calendar,
    MapPin, Clock, CheckCircle2, ArrowRight, Navigation,
    Eye, Edit3, MoreVertical, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { useToast } from '../../lib/ToastStore';
import { frotaListViagens, frotaUpdateViagem, calcKmPercorridoViagem } from '../../lib/frotaSupabase';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Components';

type StatusViagem = 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
type TipoViagem = 'servico' | 'transporte' | 'administrativa' | 'emergencia';

interface Viagem {
    id: string;
    codigo: string;
    veiculo_placa: string;
    veiculo_modelo: string;
    motorista: string;
    tipo: TipoViagem;
    status: StatusViagem;
    origem: string;
    destino: string;
    data_saida: string;
    hora_saida: string;
    data_retorno?: string;
    hora_retorno?: string;
    km_saida: number;
    km_retorno?: number;
    observacao?: string;
    passageiros?: number;
    paradas?: Array<{ local: string; horario: string; motivo: string }>;
    atendimento_id?: string | null;
    atendimento_codigo?: string | null;
    empresa_id?: string;
}

const StatusBadge: React.FC<{ status: StatusViagem }> = ({ status }) => {
    const map: Record<StatusViagem, { label: string; cls: string; icon: React.ElementType }> = {
        agendada: { label: 'Agendada', cls: 'bg-blue-100 text-blue-700', icon: Calendar },
        em_andamento: { label: 'Em Rota', cls: 'bg-amber-100 text-amber-700', icon: Navigation },
        concluida: { label: 'Concluída', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 },
        cancelada: { label: 'Cancelada', cls: 'bg-red-100 text-red-700', icon: Clock },
    };
    const { label, cls, icon: Icon } = map[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
            <Icon className="h-3 w-3" />{label}
        </span>
    );
};

const TipoBadge: React.FC<{ tipo: TipoViagem }> = ({ tipo }) => {
    const labels: Record<TipoViagem, { label: string; cls: string }> = {
        servico: { label: 'Serviço', cls: 'bg-purple-50 text-purple-700' },
        transporte: { label: 'Transporte', cls: 'bg-blue-50 text-blue-700' },
        administrativa: { label: 'Administrativa', cls: 'bg-gray-100 text-gray-700' },
        emergencia: { label: 'Emergência', cls: 'bg-red-50 text-red-700' },
    };
    const { label, cls } = labels[tipo];
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>{label}</span>;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000, 5000];

export const ViagensList: React.FC = () => {
    const navigate = useNavigate();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [viagens, setViagens] = useState<Viagem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [tipoFilter, setTipoFilter] = useState('');
    const [periodoFilter, setPeriodoFilter] = useState('');
    const [showFiltrosAvancados, setShowFiltrosAvancados] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const [showMobileActions, setShowMobileActions] = useState(false);
    
    // Pagination state
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Modal Chegada
    const [showChegadaModal, setShowChegadaModal] = useState(false);
    const [chegadaData, setChegadaData] = useState({ km_retorno: '', data_retorno: new Date().toISOString().split('T')[0], hora_retorno: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) });

    // Modal Parada
    const [showParadaModal, setShowParadaModal] = useState(false);
    const [paradaData, setParadaData] = useState({ local: '', motivo: '' });

    const loadViagens = async () => {
        if (!empresaIdEfetivo) return;
        if (skipUntilGrupoCarrega) return;
        setLoading(true);
        try {
            const rows = await frotaListViagens(
                empresaIdEfetivo,
                {
                    search: searchTerm || undefined,
                    status: statusFilter || undefined,
                },
                frotaOpts,
            );
            const mapped: Viagem[] = (rows || []).map((v) => ({
                id: v.id,
                codigo: v.codigo,
                veiculo_placa: v.placa,
                veiculo_modelo: v.modelo,
                motorista: v.motorista_nome || '-',
                tipo: v.tipo,
                status: v.status,
                origem: v.origem || '-',
                destino: v.destino || '-',
                data_saida: v.data_saida || '',
                hora_saida: v.hora_saida || '',
                data_retorno: v.data_retorno || undefined,
                hora_retorno: v.hora_retorno || undefined,
                km_saida: Number(v.km_saida || 0),
                km_retorno: v.km_retorno ? Number(v.km_retorno) : undefined,
                observacao: v.descricao || undefined,
                passageiros: v.passageiros ? Number(v.passageiros) : undefined,
                paradas: v.paradas || [],
                atendimento_id: v.atendimento_id || null,
                atendimento_codigo: v.atendimento_codigo || null,
                empresa_id: v.empresa_id,
            }));
            setViagens(mapped);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao carregar viagens', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadViagens();
    }, [empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega, searchTerm, statusFilter]);

    const viagemSelecionada = useMemo(
        () => viagens.find((v) => v.id === selectedId) ?? null,
        [viagens, selectedId],
    );

    const periodosDisponiveis = useMemo(() => {
        const list = [];
        const today = new Date();
        for (let i = 0; i < 18; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const y = String(d.getFullYear());
            const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
            list.push({ value: `${y}-${m}`, label: capitalizedLabel });
        }
        return list;
    }, []);

    const getPeriodoDesc = () => {
        if (!periodoFilter) return 'Todo o período';
        const found = periodosDisponiveis.find(p => p.value === periodoFilter);
        return found ? found.label : periodoFilter;
    };

    const viagensFiltradas = useMemo(() => {
        return viagens.filter((v) => {
            const matchTipo = !tipoFilter || v.tipo === tipoFilter;
            
            const dateParts = v.data_saida ? v.data_saida.split('-') : [];
            const vPeriodo = dateParts.length >= 2 ? `${dateParts[0]}-${dateParts[1]}` : '';
            const matchPeriodo = !periodoFilter || vPeriodo === periodoFilter;

            return matchTipo && matchPeriodo;
        });
    }, [viagens, tipoFilter, periodoFilter]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, statusFilter, tipoFilter, periodoFilter]);

    const totalPages = Math.ceil(viagensFiltradas.length / pageSize);
    const viagensPaginadas = useMemo(() => {
        return viagensFiltradas.slice((page - 1) * pageSize, page * pageSize);
    }, [viagensFiltradas, page, pageSize]);

    const stats = useMemo(() => ({
        total: viagensFiltradas.length,
        emAndamento: viagensFiltradas.filter(v => v.status === 'em_andamento').length,
        agendadas: viagensFiltradas.filter(v => v.status === 'agendada').length,
        kmTotal: viagensFiltradas
            .filter(v => v.km_retorno != null)
            .reduce((acc, v) => acc + (calcKmPercorridoViagem(v.km_saida, v.km_retorno) ?? 0), 0),
    }), [viagensFiltradas]);

    const mediaPorCarro = useMemo(() => {
        const groups: Record<string, {
            placa: string;
            modelo: string;
            viagensTotal: number;
            kmTotal: number;
            viagensConcluidas: number;
        }> = {};

        viagensFiltradas.forEach(v => {
            if (!groups[v.veiculo_placa]) {
                groups[v.veiculo_placa] = {
                    placa: v.veiculo_placa,
                    modelo: v.veiculo_modelo,
                    viagensTotal: 0,
                    kmTotal: 0,
                    viagensConcluidas: 0,
                };
            }
            const g = groups[v.veiculo_placa];
            g.viagensTotal += 1;
            if (v.status === 'concluida' && v.km_retorno != null) {
                const diff = calcKmPercorridoViagem(v.km_saida, v.km_retorno) ?? 0;
                g.kmTotal += diff;
                g.viagensConcluidas += 1;
            }
        });

        return Object.values(groups).map(g => {
            const mediaKmPorViagem = g.viagensConcluidas > 0 ? g.kmTotal / g.viagensConcluidas : 0;
            return {
                ...g,
                mediaKmPorViagem,
            };
        }).sort((a, b) => b.kmTotal - a.kmTotal);
    }, [viagensFiltradas]);

    const handleRegistrarChegada = async () => {
        const viagem = viagens.find((v) => v.id === selectedId);
        const emp = viagem?.empresa_id || empresaIdEfetivo;
        if (!selectedId || !emp || !viagem) return;

        const kmRetorno = Number(chegadaData.km_retorno);
        if (!Number.isFinite(kmRetorno) || kmRetorno <= 0) {
            showToast('Informe o KM de chegada.', 'error');
            return;
        }
        if (kmRetorno < viagem.km_saida) {
            showToast(
                `KM de chegada (${kmRetorno.toLocaleString('pt-BR')}) não pode ser menor que o KM de saída (${viagem.km_saida.toLocaleString('pt-BR')}).`,
                'error',
            );
            return;
        }

        try {
            await frotaUpdateViagem(emp, selectedId, {
                ...chegadaData,
                km_retorno: kmRetorno,
                status: 'concluida'
            });
            showToast('Chegada registrada com sucesso!', 'success');
            setShowChegadaModal(false);
            loadViagens();
        } catch (error) {
            showToast('Erro ao registrar chegada', 'error');
        }
    };

    const handleAddParada = async () => {
        const viagem = viagens.find((v) => v.id === selectedId);
        if (!viagem) return;
        const emp = viagem.empresa_id || empresaIdEfetivo;
        if (!selectedId || !emp) return;

        const novaParada = {
            ...paradaData,
            horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };

        try {
            await frotaUpdateViagem(emp, selectedId, {
                paradas: [...(viagem.paradas || []), novaParada]
            });
            showToast('Parada registrada!', 'success');
            setShowParadaModal(false);
            setParadaData({ local: '', motivo: '' });
            loadViagens();
        } catch (error) {
            showToast('Erro ao registrar parada', 'error');
        }
    };

    const linhaDestaque = (v: Viagem) =>
        v.status === 'em_andamento'
            ? 'border-amber-200 bg-amber-50/40'
            : v.tipo === 'emergencia'
              ? 'border-red-200 bg-red-50/30'
              : selectedId === v.id
                ? 'border-blue-200 bg-blue-50/50'
                : 'border-gray-100';

    const renderMenuAcoes = (v: Viagem, fechar?: () => void) => (
        <>
            <DropdownMenuItem
                onClick={() => {
                    navigate(`/frota/viagens/${v.id}`);
                    setOpenMenuId(null);
                    fechar?.();
                }}
            >
                <Eye className="h-4 w-4 mr-2" /> Ver detalhes
            </DropdownMenuItem>
            <DropdownMenuItem
                onClick={() => {
                    navigate(`/frota/viagens/${v.id}/editar`);
                    setOpenMenuId(null);
                    fechar?.();
                }}
            >
                <Edit3 className="h-4 w-4 mr-2" /> Editar viagem
            </DropdownMenuItem>
            {v.status === 'em_andamento' && (
                <>
                    <DropdownMenuItem
                        onClick={() => {
                            setSelectedId(v.id);
                            setShowChegadaModal(true);
                            setOpenMenuId(null);
                            fechar?.();
                        }}
                    >
                        <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Registrar chegada
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            setSelectedId(v.id);
                            setShowParadaModal(true);
                            setOpenMenuId(null);
                            fechar?.();
                        }}
                    >
                        <MapPin className="h-4 w-4 mr-2 text-blue-600" /> Adicionar parada
                    </DropdownMenuItem>
                </>
            )}
        </>
    );

    return (
        <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full pb-20 md:pb-6 px-0 sm:px-0">
            <PageHeader
                title="Viagens"
                subtitle="Registro de viagens, rotas e agendamentos da frota"
                backTo="/frota"
                accentColor="#be123c"
                icon={<Map className="h-5 w-5 text-rose-650" />}
                actionButton={
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Button
                            className="w-full sm:w-auto min-h-[44px]"
                            onClick={() => navigate('/frota/viagens/nova')}
                        >
                            <Plus className="h-4 w-4 mr-2" /> Nova viagem
                        </Button>
                    </div>
                }
            />

            {/* Stats — compacto no celular */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                <Card className="p-3 sm:p-4 bg-blue-50">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Total</p>
                    <p className="text-xl sm:text-3xl font-bold text-blue-700 mt-0.5 sm:mt-1">{stats.total}</p>
                    {viagens.length > 0 && stats.total < viagens.length && (
                        <p className="text-[10px] sm:text-xs text-blue-600/80 mt-0.5">
                            de {viagens.length} cadastradas ({getPeriodoDesc()})
                        </p>
                    )}
                </Card>
                <Card className="p-3 sm:p-4 bg-amber-50">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Em rota</p>
                    <p className="text-xl sm:text-3xl font-bold text-amber-700 mt-0.5 sm:mt-1">{stats.emAndamento}</p>
                </Card>
                <Card className="p-3 sm:p-4 bg-green-50">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Agendadas</p>
                    <p className="text-xl sm:text-3xl font-bold text-green-700 mt-0.5 sm:mt-1">{stats.agendadas}</p>
                </Card>
                <Card className="p-3 sm:p-4 bg-purple-50">
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">KM percorridos</p>
                    <p className="text-xl sm:text-3xl font-bold text-purple-700 mt-0.5 sm:mt-1">{stats.kmTotal.toLocaleString('pt-BR')}</p>
                    {periodoFilter && (
                        <p className="text-[10px] sm:text-xs text-purple-600/80 mt-0.5">{getPeriodoDesc()}</p>
                    )}
                </Card>
            </div>

            {/* Tabela de Desempenho e KM por Veículo */}
            <Card className="p-3 sm:p-4 overflow-hidden border border-gray-150 shadow-sm bg-white">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Desempenho e Quilometragem por Veículo
                    </h3>
                    <span className="text-xs text-gray-500 font-semibold bg-gray-50 px-2 sm:px-2.5 py-1 rounded-md border">
                        {getPeriodoDesc()}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="bg-gray-50 border-b font-semibold text-gray-600">
                                <th className="py-2 px-3">Veículo / Placa</th>
                                <th className="py-2 px-3 text-center">Total Viagens</th>
                                <th className="py-2 px-3 text-center">Viagens Concluídas</th>
                                <th className="py-2 px-3 text-center">KM Rodado Total</th>
                                <th className="py-2 px-3 text-center font-bold text-purple-700 bg-purple-50/50">Média KM / Viagem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {mediaPorCarro.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-3 text-center text-gray-400 italic">
                                        Nenhuma viagem registrada no período selecionado.
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {mediaPorCarro.map(g => (
                                        <tr key={g.placa} className="hover:bg-gray-50/50">
                                            <td className="py-2 px-3 font-semibold text-gray-800">
                                                {g.placa} <span className="font-normal text-gray-500">({g.modelo})</span>
                                            </td>
                                            <td className="py-2 px-3 text-center">{g.viagensTotal}</td>
                                            <td className="py-2 px-3 text-center">{g.viagensConcluidas}</td>
                                            <td className="py-2 px-3 text-center">{g.kmTotal.toLocaleString('pt-BR')} km</td>
                                            <td className="py-2 px-3 text-center font-bold text-purple-700 bg-purple-50/20">
                                                {g.mediaKmPorViagem > 0 ? `${g.mediaKmPorViagem.toFixed(1)} km` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-50/70 font-bold border-t border-gray-200 text-gray-900">
                                        <td className="py-2.5 px-3 uppercase tracking-wider text-gray-650">Total Geral</td>
                                        <td className="py-2.5 px-3 text-center">
                                            {mediaPorCarro.reduce((acc, g) => acc + g.viagensTotal, 0)}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            {mediaPorCarro.reduce((acc, g) => acc + g.viagensConcluidas, 0)}
                                        </td>
                                        <td className="py-2.5 px-3 text-center">
                                            {mediaPorCarro.reduce((acc, g) => acc + g.kmTotal, 0).toLocaleString('pt-BR')} km
                                        </td>
                                        <td className="py-2.5 px-3 text-center text-purple-800 bg-purple-50/30">
                                            {(() => {
                                                const totalConcluidas = mediaPorCarro.reduce((acc, g) => acc + g.viagensConcluidas, 0);
                                                const totalKm = mediaPorCarro.reduce((acc, g) => acc + g.kmTotal, 0);
                                                return totalConcluidas > 0 ? `${(totalKm / totalConcluidas).toFixed(1)} km` : '—';
                                            })()}
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Filters */}
            <div className="flex flex-col gap-3 bg-white p-3 sm:p-4 rounded-xl shadow-sm border">
                <div className="flex flex-col md:flex-row items-center gap-3">
                    <div className="relative flex-1 w-full min-w-0">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
                        <Input
                            placeholder="Código, motorista, destino..."
                            className="pl-9 min-h-[44px] text-base sm:text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 w-full md:w-auto shrink-0">
                        <div className="w-full md:w-52">
                            <Select
                                className="min-h-[44px] text-base sm:text-sm"
                                value={periodoFilter}
                                onChange={(e) => setPeriodoFilter(e.target.value)}
                            >
                                <option value="">Todos os períodos</option>
                                {periodosDisponiveis.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </Select>
                        </div>
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => setShowFiltrosAvancados(!showFiltrosAvancados)}
                            className={`min-h-[44px] px-3 shrink-0 flex items-center justify-center gap-1.5 ${showFiltrosAvancados ? 'bg-slate-100 text-slate-800' : ''}`}
                        >
                            <span>Filtros</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                        </Button>
                        {(searchTerm || statusFilter || tipoFilter || periodoFilter) && (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => {
                                    setSearchTerm('');
                                    setStatusFilter('');
                                    setTipoFilter('');
                                    setPeriodoFilter('');
                                    loadViagens();
                                }}
                                className="min-h-[44px] px-3 text-red-650 border-red-200 hover:bg-red-50 shrink-0 font-medium"
                                title="Limpar Filtros"
                            >
                                Limpar
                            </Button>
                        )}
                    </div>
                </div>

                {/* Advanced Collapsible Filters */}
                {showFiltrosAvancados && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Filtrar por Status</label>
                            <Select
                                className="min-h-[44px] text-base sm:text-sm"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="">Todos os status</option>
                                <option value="agendada">Agendada</option>
                                <option value="em_andamento">Em rota</option>
                                <option value="concluida">Concluída</option>
                                <option value="cancelada">Cancelada</option>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Filtrar por Tipo</label>
                            <Select
                                className="min-h-[44px] text-base sm:text-sm"
                                value={tipoFilter}
                                onChange={(e) => setTipoFilter(e.target.value)}
                            >
                                <option value="">Todos os tipos</option>
                                <option value="servico">Serviço</option>
                                <option value="transporte">Transporte</option>
                                <option value="administrativa">Administrativa</option>
                                <option value="emergencia">Emergência</option>
                            </Select>
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-3 min-w-0">
                {loading && viagensPaginadas.length === 0 ? (
                    <Card className="p-8 text-center text-gray-500 text-sm">Carregando viagens...</Card>
                ) : viagensPaginadas.length === 0 ? (
                    <Card className="p-8 text-center text-gray-500 text-sm">Nenhuma viagem encontrada.</Card>
                ) : (
                    viagensPaginadas.map((v) => {
                        const kmPercorridos = calcKmPercorridoViagem(v.km_saida, v.km_retorno);
                        return (
                            <Card
                                key={v.id}
                                className={`p-4 border cursor-pointer active:scale-[0.99] transition-transform ${linhaDestaque(v)}`}
                                onClick={() => navigate(`/frota/viagens/${v.id}`)}
                            >
                                <div className="flex items-start justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                                            <Map className="h-5 w-5 text-green-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-900 truncate">{v.codigo}</p>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                <TipoBadge tipo={v.tipo} />
                                                <StatusBadge status={v.status} />
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="p-2.5 -mr-1 rounded-lg hover:bg-gray-100 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                        aria-label="Ações da viagem"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedId(v.id);
                                            setShowMobileActions(true);
                                        }}
                                    >
                                        <MoreVertical className="h-5 w-5 text-gray-600" />
                                    </button>
                                </div>

                                <div className="flex items-start gap-2 text-sm text-gray-700 mb-2">
                                    <MapPin className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                                    <p className="min-w-0 leading-snug">
                                        <span className="block truncate">{v.origem}</span>
                                        <span className="flex items-center gap-1 text-gray-400 my-0.5">
                                            <ArrowRight className="h-3 w-3" />
                                        </span>
                                        <span className="block font-medium text-gray-900 truncate">{v.destino}</span>
                                    </p>
                                </div>

                                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm mb-3">
                                    <div className="col-span-2">
                                        <dt className="text-[10px] uppercase tracking-wide text-gray-500">Motorista</dt>
                                        <dd className="text-gray-900 truncate flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                            {v.motorista}
                                        </dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-[10px] uppercase tracking-wide text-gray-500">Veículo</dt>
                                        <dd className="text-gray-900 truncate flex items-center gap-1">
                                            <Car className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                            {v.veiculo_placa} • {v.veiculo_modelo}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wide text-gray-500">Saída</dt>
                                        <dd className="text-gray-900">
                                            {v.data_saida
                                                ? new Date(v.data_saida + 'T00:00').toLocaleDateString('pt-BR', {
                                                      day: '2-digit',
                                                      month: '2-digit',
                                                  })
                                                : '—'}
                                            <span className="text-gray-500 text-xs ml-1">{v.hora_saida}</span>
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-wide text-gray-500">KM</dt>
                                        <dd className="text-gray-900 font-medium">
                                            {kmPercorridos !== null ? `${kmPercorridos} km` : '—'}
                                        </dd>
                                    </div>
                                </dl>

                                {v.atendimento_codigo && v.atendimento_id && (
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1.5 rounded-lg mb-2 min-h-[36px]"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/atendimentos/${v.atendimento_id}`);
                                        }}
                                    >
                                        ATD {v.atendimento_codigo}
                                    </button>
                                )}

                                {v.status === 'em_andamento' && (
                                    <div className="flex gap-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 min-h-[44px] text-xs"
                                            onClick={() => {
                                                setSelectedId(v.id);
                                                setShowParadaModal(true);
                                            }}
                                        >
                                            <MapPin className="h-4 w-4 mr-1 shrink-0" /> Parada
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="flex-1 min-h-[44px] text-xs"
                                        onClick={() => {
                                            setSelectedId(v.id);
                                            setChegadaData((prev) => ({
                                                ...prev,
                                                km_retorno: '',
                                            }));
                                            setShowChegadaModal(true);
                                        }}
                                        >
                                            <CheckCircle2 className="h-4 w-4 mr-1 shrink-0" /> Chegada
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        );
                    })
                )}
                {/* Mobile Pagination Control */}
                {viagensFiltradas.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-center justify-between gap-3 mt-3">
                        <div className="flex items-center justify-between w-full text-xs text-gray-500">
                            <span>Mostrando {viagensFiltradas.length === 0 ? 0 : (page - 1) * pageSize + 1} a {Math.min(page * pageSize, viagensFiltradas.length)} de {viagensFiltradas.length}</span>
                            <div className="flex items-center gap-1">
                                <span>Qtd:</span>
                                <select 
                                    value={pageSize} 
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setPage(1);
                                    }}
                                    className="border rounded px-1 py-0.5 bg-white text-xs"
                                >
                                    {PAGE_SIZE_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center justify-between w-full">
                            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="min-h-[38px] px-3">
                                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                            </Button>
                            <span className="text-sm font-medium text-gray-700">
                                <span className="text-blue-600">{page}</span> / {totalPages || 1}
                            </span>
                            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="min-h-[38px] px-3">
                                Próximo <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop: tabela */}
            <Card className="hidden md:block overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Viagem</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Tipo</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Rota</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Motorista / Veículo</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Data / Horário</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">KM</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {viagensPaginadas.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-10 text-center text-gray-500">
                                        {loading ? 'Carregando viagens...' : 'Nenhuma viagem encontrada.'}
                                    </td>
                                </tr>
                            ) : viagensPaginadas.map(v => {
                                const kmPercorridos = calcKmPercorridoViagem(v.km_saida, v.km_retorno);
                                return (
                                    <tr
                                        key={v.id}
                                        onClick={() => { setSelectedId(v.id); setOpenMenuId(null); }}
                                        onDoubleClick={() => navigate(`/frota/viagens/${v.id}`)}
                                        onContextMenu={e => {
                                            e.preventDefault();
                                            setSelectedId(v.id);
                                            setOpenMenuId(v.id);
                                            setMenuPosition({ x: e.clientX, y: e.clientY });
                                        }}
                                        className={`transition-all cursor-pointer ${
                                            openMenuId === v.id || selectedId === v.id
                                                ? 'bg-blue-50 ring-1 ring-inset ring-blue-100'
                                                : v.status === 'em_andamento' ? 'bg-amber-50/30 hover:bg-amber-50/60'
                                                : v.tipo === 'emergencia' ? 'bg-red-50/20 hover:bg-red-50/40'
                                                : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                                                    <Map className="h-5 w-5 text-green-600" />
                                                </div>
                                                <div>
                                                    <p
                                                        className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/frota/viagens/${v.id}`);
                                                        }}
                                                    >
                                                        {v.codigo}
                                                    </p>
                                                    {v.atendimento_codigo && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); navigate(`/atendimentos/${v.atendimento_id}`); }}
                                                            className="text-[10px] font-semibold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded hover:bg-purple-100 transition-colors"
                                                            title="Abrir atendimento vinculado"
                                                        >
                                                            ATD {v.atendimento_codigo}
                                                        </button>
                                                    )}
                                                    {v.observacao && <p className="text-xs text-gray-400 truncate max-w-[160px]">{v.observacao}</p>}
                                                </div>
                                            </div>
                                            {openMenuId === v.id && (
                                                <DropdownMenuContent
                                                    isOpen
                                                    onClose={() => setOpenMenuId(null)}
                                                    position={menuPosition}
                                                >
                                                    {renderMenuAcoes(v)}
                                                </DropdownMenuContent>
                                            )}
                                        </td>
                                        <td className="py-3 px-4"><TipoBadge tipo={v.tipo} /></td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2 text-xs">
                                                <MapPin className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                                <span className="text-gray-700 truncate max-w-[120px]">{v.origem}</span>
                                                <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                                <span className="text-gray-900 font-medium truncate max-w-[120px]">{v.destino}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1.5">
                                                <Users className="h-3.5 w-3.5 text-gray-400" />
                                                <span className="text-gray-700">{v.motorista}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <Car className="h-3.5 w-3.5 text-blue-400" />
                                                <span className="text-xs text-gray-500">{v.veiculo_placa} • {v.veiculo_modelo}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <p className="text-gray-700">
                                                {new Date(v.data_saida + 'T00:00').toLocaleDateString('pt-BR')}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                <Clock className="h-3 w-3 inline mr-0.5" />
                                                {v.hora_saida}{v.hora_retorno ? ` → ${v.hora_retorno}` : ''}
                                            </p>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {kmPercorridos !== null ? (
                                                <span className="font-mono font-medium text-gray-700">{kmPercorridos} km</span>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic">—</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <StatusBadge status={v.status} />
                                            {v.passageiros && (
                                                <p className="text-xs text-gray-400 mt-0.5">{v.passageiros} pass.</p>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                
                {/* Desktop Pagination */}
                <div className="px-6 py-4 border-t bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">
                            Mostrando {viagensFiltradas.length === 0 ? 0 : (page - 1) * pageSize + 1} a {Math.min(page * pageSize, viagensFiltradas.length)} de {viagensFiltradas.length} resultados
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 whitespace-nowrap">Itens por página:</span>
                            <select 
                                value={pageSize} 
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="text-xs border rounded px-1 py-0.5 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
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
            </Card>

            {/* FAB — nova viagem (celular) */}
            <button
                type="button"
                aria-label="Nova viagem"
                className="md:hidden fixed bottom-5 right-4 z-40 h-14 w-14 rounded-full bg-green-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform safe-area-pb"
                onClick={() => navigate('/frota/viagens/nova')}
            >
                <Plus className="h-7 w-7" />
            </button>

            {/* Sheet de ações (celular) */}
            {showMobileActions && viagemSelecionada && (
                <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/50"
                        aria-label="Fechar"
                        onClick={() => setShowMobileActions(false)}
                    />
                    <div className="relative bg-white rounded-t-2xl p-4 pb-8 shadow-xl animate-in slide-in-from-bottom duration-200">
                        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
                        <p className="font-bold text-gray-900 mb-1">{viagemSelecionada.codigo}</p>
                        <p className="text-sm text-gray-500 mb-4 truncate">
                            {viagemSelecionada.origem} → {viagemSelecionada.destino}
                        </p>
                        <div className="flex flex-col gap-2">
                            <Button
                                variant="outline"
                                className="w-full min-h-[48px] justify-start"
                                onClick={() => {
                                    navigate(`/frota/viagens/${viagemSelecionada.id}`);
                                    setShowMobileActions(false);
                                }}
                            >
                                <Eye className="h-5 w-5 mr-3" /> Ver detalhes
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full min-h-[48px] justify-start"
                                onClick={() => {
                                    navigate(`/frota/viagens/${viagemSelecionada.id}/editar`);
                                    setShowMobileActions(false);
                                }}
                            >
                                <Edit3 className="h-5 w-5 mr-3" /> Editar viagem
                            </Button>
                            {viagemSelecionada.status === 'em_andamento' && (
                                <>
                                    <Button
                                        className="w-full min-h-[48px] justify-start"
                                        onClick={() => {
                                            setShowChegadaModal(true);
                                            setShowMobileActions(false);
                                        }}
                                    >
                                        <CheckCircle2 className="h-5 w-5 mr-3" /> Registrar chegada
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-full min-h-[48px] justify-start"
                                        onClick={() => {
                                            setShowParadaModal(true);
                                            setShowMobileActions(false);
                                        }}
                                    >
                                        <MapPin className="h-5 w-5 mr-3" /> Adicionar parada
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="ghost"
                                className="w-full min-h-[44px] mt-2"
                                onClick={() => setShowMobileActions(false)}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Chegada */}
            <Modal isOpen={showChegadaModal} onClose={() => setShowChegadaModal(false)} title="Registrar chegada" size="sm">
                <div className="space-y-4 p-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                            label="Data de chegada"
                            type="date"
                            className="text-base sm:text-sm min-h-[44px]"
                            value={chegadaData.data_retorno}
                            onChange={(e) => setChegadaData((prev) => ({ ...prev, data_retorno: e.target.value }))}
                        />
                        <Input
                            label="Hora de chegada"
                            type="time"
                            className="text-base sm:text-sm min-h-[44px]"
                            value={chegadaData.hora_retorno}
                            onChange={(e) => setChegadaData((prev) => ({ ...prev, hora_retorno: e.target.value }))}
                        />
                    </div>
                    <Input
                        label="KM de chegada"
                        type="number"
                        inputMode="decimal"
                        className="text-base sm:text-sm min-h-[44px]"
                        placeholder="Quilometragem atual"
                        min={viagemSelecionada?.km_saida ?? 0}
                        value={chegadaData.km_retorno}
                        onChange={(e) => setChegadaData((prev) => ({ ...prev, km_retorno: e.target.value }))}
                    />
                    {viagemSelecionada && (
                        <p className="text-xs text-gray-500">
                            KM de saída: {viagemSelecionada.km_saida.toLocaleString('pt-BR')} — a chegada deve ser igual ou maior.
                        </p>
                    )}
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                        <Button variant="outline" className="w-full sm:w-auto min-h-[44px]" onClick={() => setShowChegadaModal(false)}>
                            Cancelar
                        </Button>
                        <Button className="w-full sm:w-auto min-h-[44px]" onClick={handleRegistrarChegada}>
                            Concluir viagem
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal de Parada */}
            <Modal isOpen={showParadaModal} onClose={() => setShowParadaModal(false)} title="Adicionar parada" size="sm">
                <div className="space-y-4 p-1">
                    <Input
                        label="Local da parada"
                        className="text-base sm:text-sm min-h-[44px]"
                        placeholder="Ex: Posto Ipiranga"
                        value={paradaData.local}
                        onChange={(e) => setParadaData((prev) => ({ ...prev, local: e.target.value }))}
                    />
                    <Textarea
                        label="Motivo / observação"
                        className="text-base sm:text-sm min-h-[88px]"
                        placeholder="Ex: Parada para almoço"
                        value={paradaData.motivo}
                        onChange={(e) => setParadaData((prev) => ({ ...prev, motivo: e.target.value }))}
                    />
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                        <Button variant="outline" className="w-full sm:w-auto min-h-[44px]" onClick={() => setShowParadaModal(false)}>
                            Cancelar
                        </Button>
                        <Button className="w-full sm:w-auto min-h-[44px]" onClick={handleAddParada}>
                            Salvar parada
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

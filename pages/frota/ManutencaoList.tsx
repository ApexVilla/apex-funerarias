import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Wrench, Plus, Search, RefreshCw, Car, Calendar, DollarSign,
    CheckCircle2, Clock, AlertTriangle, XCircle, Edit3, Eye
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { useToast } from '../../lib/ToastStore';
import { frotaListManutencoes } from '../../lib/frotaSupabase';

type StatusManutencao = 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
type TipoManutencao = 'preventiva' | 'corretiva' | 'revisao' | 'recall';

interface Manutencao {
    id: string;
    veiculo_placa: string;
    veiculo_modelo: string;
    tipo: TipoManutencao;
    status: StatusManutencao;
    descricao: string;
    oficina: string;
    data_entrada: string;
    data_previsao?: string;
    data_conclusao?: string;
    km_entrada: number;
    valor_estimado: number;
    valor_final?: number;
    responsavel?: string;
    itens: string[];
}

const formatCurrency = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const StatusBadge: React.FC<{ status: StatusManutencao }> = ({ status }) => {
    const map: Record<StatusManutencao, { label: string; cls: string; icon: React.ElementType }> = {
        agendada: { label: 'Agendada', cls: 'bg-blue-100 text-blue-700', icon: Calendar },
        em_andamento: { label: 'Em Andamento', cls: 'bg-amber-100 text-amber-700', icon: Clock },
        concluida: { label: 'Concluída', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 },
        cancelada: { label: 'Cancelada', cls: 'bg-red-100 text-red-700', icon: XCircle },
    };
    const { label, cls, icon: Icon } = map[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
            <Icon className="h-3 w-3" />{label}
        </span>
    );
};

const TipoBadge: React.FC<{ tipo: TipoManutencao }> = ({ tipo }) => {
    const labels: Record<TipoManutencao, { label: string; cls: string }> = {
        preventiva: { label: 'Preventiva', cls: 'bg-green-50 text-green-700' },
        corretiva: { label: 'Corretiva', cls: 'bg-red-50 text-red-700' },
        revisao: { label: 'Revisão', cls: 'bg-blue-50 text-blue-700' },
        recall: { label: 'Recall', cls: 'bg-purple-50 text-purple-700' },
    };
    const { label, cls } = labels[tipo];
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>{label}</span>;
};

export const ManutencaoList: React.FC = () => {
    const navigate = useNavigate();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [tipoFilter, setTipoFilter] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const loadManutencoes = async () => {
        if (!empresaIdEfetivo) return;
        if (skipUntilGrupoCarrega) return;
        setLoading(true);
        try {
            const rows = await frotaListManutencoes(
                empresaIdEfetivo,
                {
                    search: searchTerm || undefined,
                    status: statusFilter || undefined,
                },
                frotaOpts,
            );
            const mapped: Manutencao[] = (rows || []).map((m) => ({
                id: m.id,
                veiculo_placa: m.placa,
                veiculo_modelo: m.modelo,
                tipo: m.tipo,
                status: m.status,
                descricao: m.descricao,
                oficina: m.oficina || '-',
                data_entrada: m.data_entrada || '',
                data_previsao: m.data_previsao || undefined,
                data_conclusao: m.data_conclusao || undefined,
                km_entrada: Number(m.km_entrada || 0),
                valor_estimado: Number(m.valor_estimado || 0),
                valor_final: m.valor_final ? Number(m.valor_final) : undefined,
                responsavel: m.responsavel || undefined,
                itens: Array.isArray(m.itens) ? m.itens : [],
            }));
            setManutencoes(mapped);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao carregar manutenções', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadManutencoes();
    }, [empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega, searchTerm, statusFilter]);

    const filtered = useMemo(() => manutencoes.filter(m => {
        const term = searchTerm.toLowerCase();
        const matchSearch = !searchTerm ||
            m.veiculo_placa.toLowerCase().includes(term) ||
            m.descricao.toLowerCase().includes(term) ||
            m.oficina.toLowerCase().includes(term);
        const matchStatus = !statusFilter || m.status === statusFilter;
        const matchTipo = !tipoFilter || m.tipo === tipoFilter;
        return matchSearch && matchStatus && matchTipo;
    }), [manutencoes, searchTerm, statusFilter, tipoFilter]);

    const stats = useMemo(() => ({
        total: filtered.length,
        emAndamento: filtered.filter(m => m.status === 'em_andamento').length,
        agendadas: filtered.filter(m => m.status === 'agendada').length,
        custoTotal: filtered
            .filter(m => m.status === 'concluida')
            .reduce((acc, m) => acc + (m.valor_final || m.valor_estimado), 0),
    }), [filtered]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manutenções"
                subtitle="Ordens de serviço, revisões e histórico de manutenções"
                actionButton={
                    <Button onClick={() => navigate('/frota/manutencao/nova')}>
                        <Plus className="h-4 w-4 mr-2" /> Nova Manutenção
                    </Button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 bg-blue-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total</p>
                    <p className="text-3xl font-bold text-blue-700 mt-1">{stats.total}</p>
                </Card>
                <Card className="p-4 bg-amber-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Em Andamento</p>
                    <p className="text-3xl font-bold text-amber-700 mt-1">{stats.emAndamento}</p>
                </Card>
                <Card className="p-4 bg-green-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agendadas</p>
                    <p className="text-3xl font-bold text-green-700 mt-1">{stats.agendadas}</p>
                </Card>
                <Card className="p-4 bg-purple-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Custo Concluídas</p>
                    <p className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(stats.custoTotal)}</p>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input placeholder="Buscar por veículo, descrição ou oficina..." className="pl-9"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="w-full md:w-44">
                    <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="">Status: Todos</option>
                        <option value="agendada">Agendada</option>
                        <option value="em_andamento">Em Andamento</option>
                        <option value="concluida">Concluída</option>
                        <option value="cancelada">Cancelada</option>
                    </Select>
                </div>
                <div className="w-full md:w-44">
                    <Select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}>
                        <option value="">Tipo: Todos</option>
                        <option value="preventiva">Preventiva</option>
                        <option value="corretiva">Corretiva</option>
                        <option value="revisao">Revisão</option>
                        <option value="recall">Recall</option>
                    </Select>
                </div>
                <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter(''); setTipoFilter(''); loadManutencoes(); }}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Limpar
                </Button>
            </div>

            {/* Table */}
            <Card className="overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Veículo</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Tipo</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Descrição / Oficina</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Datas</th>
                                <th className="text-right py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Valor</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map(m => (
                                <tr
                                    key={m.id}
                                    onClick={() => { setSelectedId(m.id); setOpenMenuId(null); }}
                                    onContextMenu={e => {
                                        e.preventDefault();
                                        setSelectedId(m.id);
                                        setOpenMenuId(m.id);
                                        setMenuPosition({ x: e.clientX, y: e.clientY });
                                    }}
                                    className={`transition-all cursor-pointer ${
                                        openMenuId === m.id || selectedId === m.id
                                            ? 'bg-blue-50 ring-1 ring-inset ring-blue-100'
                                            : m.status === 'em_andamento' ? 'bg-amber-50/30 hover:bg-amber-50/60'
                                            : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                                                <Wrench className="h-5 w-5 text-red-600" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900">{m.veiculo_placa}</p>
                                                <p className="text-xs text-gray-500">{m.veiculo_modelo} • {m.km_entrada.toLocaleString('pt-BR')} km</p>
                                            </div>
                                        </div>
                                        {openMenuId === m.id && (
                                            <DropdownMenuContent isOpen={true} onClose={() => setOpenMenuId(null)} position={menuPosition}>
                                                <DropdownMenuItem onClick={() => setOpenMenuId(null)}>
                                                    <Eye className="h-4 w-4 mr-2" /> Ver Detalhes
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setOpenMenuId(null)}>
                                                    <Edit3 className="h-4 w-4 mr-2" /> Editar OS
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        )}
                                    </td>
                                    <td className="py-3 px-4"><TipoBadge tipo={m.tipo} /></td>
                                    <td className="py-3 px-4">
                                        <p className="text-gray-700 font-medium">{m.descricao}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{m.oficina}</p>
                                        {m.itens.length > 0 && (
                                            <p className="text-xs text-gray-400 mt-1">{m.itens.length} itens: {m.itens.slice(0, 2).join(', ')}{m.itens.length > 2 ? '...' : ''}</p>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <p className="text-xs text-gray-600">
                                            Entrada: {new Date(m.data_entrada + 'T00:00').toLocaleDateString('pt-BR')}
                                        </p>
                                        {m.data_previsao && (
                                            <p className="text-xs text-gray-400">
                                                Previsão: {new Date(m.data_previsao + 'T00:00').toLocaleDateString('pt-BR')}
                                            </p>
                                        )}
                                        {m.data_conclusao && (
                                            <p className="text-xs text-green-600 font-medium">
                                                ✓ {new Date(m.data_conclusao + 'T00:00').toLocaleDateString('pt-BR')}
                                            </p>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <p className="font-bold text-gray-900">
                                            {formatCurrency(m.valor_final || m.valor_estimado)}
                                        </p>
                                        {m.valor_final && m.valor_final !== m.valor_estimado && (
                                            <p className="text-xs text-gray-400 line-through">
                                                {formatCurrency(m.valor_estimado)}
                                            </p>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <StatusBadge status={m.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="bg-gray-50 px-4 py-3 border-t text-sm text-gray-500">
                    {loading ? 'Carregando...' : `${filtered.length} manutenção(ões) encontrada(s)`}
                </div>
            </Card>
        </div>
    );
};

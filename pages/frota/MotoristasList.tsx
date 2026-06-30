import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, Plus, Search, RefreshCw, Edit3, Eye, Car,
    CheckCircle2, XCircle, AlertTriangle, Phone, Calendar, Shield
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { useToast } from '../../lib/ToastStore';
import { frotaListMotoristas } from '../../lib/frotaSupabase';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';

type StatusMotorista = 'ativo' | 'inativo' | 'ferias' | 'afastado';
type CategoriaHabilitacao = 'A' | 'AB' | 'B' | 'C' | 'D' | 'E';

interface Motorista {
    id: string;
    empresa_id?: string;
    nome: string;
    cpf: string;
    telefone: string;
    status: StatusMotorista;
    categoria_cnh: CategoriaHabilitacao;
    numero_cnh: string;
    vencimento_cnh: string;
    data_admissao: string;
    veiculo_atual?: string;
    total_viagens: number;
    km_total: number;
    foto_url?: string;
}

const StatusBadge: React.FC<{ status: StatusMotorista }> = ({ status }) => {
    const map: Record<StatusMotorista, { label: string; cls: string }> = {
        ativo: { label: 'Ativo', cls: 'bg-green-100 text-green-700' },
        inativo: { label: 'Inativo', cls: 'bg-red-100 text-red-700' },
        ferias: { label: 'Férias', cls: 'bg-blue-100 text-blue-700' },
        afastado: { label: 'Afastado', cls: 'bg-amber-100 text-amber-700' },
    };
    const { label, cls } = map[status];
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
};

export const MotoristasList: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, frotaVisaoGrupo, empresasDoGrupo, loadingEmpresasGrupo, skipUntilGrupoCarrega } =
        useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [motoristas, setMotoristas] = useState<Motorista[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const today = new Date().toISOString().slice(0, 10);
    const em30dias = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const loadMotoristas = async () => {
        const eid = empresaIdEfetivo || user?.empresa_id;
        if (!eid || skipUntilGrupoCarrega) return;
        setLoading(true);
        try {
            const rows = await frotaListMotoristas(
                eid,
                { status: statusFilter || undefined },
                frotaOpts,
            );
            setMotoristas(
                (rows as any[]).map((m) => ({
                    id: m.id,
                    empresa_id: m.empresa_id,
                    nome: m.nome,
                    cpf: m.cpf || '',
                    telefone: m.telefone || '',
                    status: (m.status || 'ativo') as StatusMotorista,
                    categoria_cnh: (m.categoria_cnh || 'B') as CategoriaHabilitacao,
                    numero_cnh: m.numero_cnh || '',
                    vencimento_cnh: (m.vencimento_cnh || '').slice(0, 10),
                    data_admissao: (m.data_admissao || '').slice(0, 10),
                    veiculo_atual: m.veiculo_placa || undefined,
                    total_viagens: m.total_viagens ?? 0,
                    km_total: m.km_total ?? 0,
                })),
            );
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao carregar motoristas', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMotoristas();
    }, [empresaIdEfetivo, user?.empresa_id, frotaOpts, dataRevisionEmpresa, statusFilter, skipUntilGrupoCarrega]);

    const empresaNomePorId = useMemo(() => {
        const m: Record<string, string> = {};
        for (const e of empresasDoGrupo) m[e.id] = e.nome;
        return m;
    }, [empresasDoGrupo]);

    const filtered = useMemo(() => motoristas.filter(m => {
        const term = searchTerm.toLowerCase();
        const matchSearch = !searchTerm || m.nome.toLowerCase().includes(term) || m.cpf.includes(term) || m.numero_cnh.includes(term);
        const matchStatus = !statusFilter || m.status === statusFilter;
        return matchSearch && matchStatus;
    }), [motoristas, searchTerm, statusFilter]);

    const stats = useMemo(() => ({
        total: filtered.length,
        ativos: filtered.filter(m => m.status === 'ativo').length,
        cnhVencendo: filtered.filter(m => m.vencimento_cnh <= em30dias).length,
    }), [filtered, em30dias]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Motoristas"
                subtitle={
                    loadingEmpresasGrupo
                        ? 'Carregando unidades…'
                        : frotaVisaoGrupo
                          ? 'Motoristas de todas as unidades selecionadas no topo'
                          : `Motoristas da unidade ${empresaNomePorId[empresaIdEfetivo || ''] ? unidadeNomeCurto(empresaNomePorId[empresaIdEfetivo || '']) : 'atual'}`
                }
                actionButton={
                    <Button onClick={() => navigate('/frota/motoristas/novo')}>
                        <Plus className="h-4 w-4 mr-2" /> Novo Motorista
                    </Button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="p-4 bg-blue-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total</p>
                    <p className="text-3xl font-bold text-blue-700 mt-1">{stats.total}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Motoristas cadastrados</p>
                </Card>
                <Card className="p-4 bg-green-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Disponíveis</p>
                    <p className="text-3xl font-bold text-green-700 mt-1">{stats.ativos}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Ativos no sistema</p>
                </Card>
                <Card className={`p-4 ${stats.cnhVencendo > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">CNH Vencendo</p>
                    <p className={`text-3xl font-bold mt-1 ${stats.cnhVencendo > 0 ? 'text-red-600' : 'text-gray-600'}`}>{stats.cnhVencendo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Nos próximos 30 dias</p>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input placeholder="Buscar por nome, CPF ou CNH..." className="pl-9"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="w-full md:w-44">
                    <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="">Status: Todos</option>
                        <option value="ativo">Ativo</option>
                        <option value="ferias">Férias</option>
                        <option value="afastado">Afastado</option>
                        <option value="inativo">Inativo</option>
                    </Select>
                </div>
                <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter(''); loadMotoristas(); }}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Limpar
                </Button>
            </div>

            {/* Table */}
            <Card className="overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Motorista</th>
                                {frotaVisaoGrupo && (
                                    <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Unidade</th>
                                )}
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">CNH</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Veículo</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Viagens</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">KM Total</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map(m => {
                                const cnhVencida = m.vencimento_cnh < today;
                                const cnhVencendo = !cnhVencida && m.vencimento_cnh <= em30dias;
                                return (
                                    <tr key={m.id}
                                        onClick={() => { setSelectedId(m.id); setOpenMenuId(null); }}
                                        onDoubleClick={() => navigate(`/frota/motoristas/${m.id}`)}
                                        onContextMenu={e => {
                                            e.preventDefault();
                                            setSelectedId(m.id);
                                            setOpenMenuId(m.id);
                                            setMenuPosition({ x: e.clientX, y: e.clientY });
                                        }}
                                        className={`transition-all cursor-pointer ${
                                            openMenuId === m.id || selectedId === m.id
                                                ? 'bg-blue-50 ring-1 ring-inset ring-blue-100'
                                                : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 font-bold text-purple-700">
                                                    {m.nome.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                                                        onClick={e => { e.stopPropagation(); navigate(`/frota/motoristas/${m.id}`); }}>
                                                        {m.nome}
                                                    </p>
                                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                                        <Phone className="h-3 w-3" /> {m.telefone}
                                                    </p>
                                                </div>
                                            </div>
                                            {openMenuId === m.id && (
                                                <DropdownMenuContent isOpen={true} onClose={() => setOpenMenuId(null)} position={menuPosition}>
                                                    <DropdownMenuItem onClick={() => { navigate(`/frota/motoristas/${m.id}`); setOpenMenuId(null); }}>
                                                        <Eye className="h-4 w-4 mr-2" /> Ver Perfil
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => { navigate(`/frota/motoristas/${m.id}/editar`); setOpenMenuId(null); }}>
                                                        <Edit3 className="h-4 w-4 mr-2" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => { navigate(`/frota/viagens?motorista=${m.id}`); setOpenMenuId(null); }}>
                                                        <Car className="h-4 w-4 mr-2" /> Ver Viagens
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            )}
                                        </td>
                                        {frotaVisaoGrupo && (
                                            <td className="py-3 px-4 text-xs text-gray-600">
                                                {m.empresa_id ? (empresaNomePorId[m.empresa_id] || '—') : '—'}
                                            </td>
                                        )}
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1">
                                                <Shield className="h-4 w-4 text-gray-400" />
                                                <span className="font-mono text-xs text-gray-700">{m.numero_cnh}</span>
                                                <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${
                                                    m.categoria_cnh === 'D' || m.categoria_cnh === 'E' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                                                }`}>{m.categoria_cnh}</span>
                                            </div>
                                            <p className={`text-xs mt-0.5 flex items-center gap-1 ${cnhVencida ? 'text-red-600 font-semibold' : cnhVencendo ? 'text-amber-600' : 'text-gray-400'}`}>
                                                <Calendar className="h-3 w-3" />
                                                Vence: {new Date(m.vencimento_cnh + 'T00:00').toLocaleDateString('pt-BR')}
                                                {(cnhVencida || cnhVencendo) && <AlertTriangle className="h-3 w-3" />}
                                            </p>
                                        </td>
                                        <td className="py-3 px-4">
                                        {(m.veiculo_atual || (m as any).veiculo_placa) ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                                                <Car className="h-3.5 w-3.5" /> {m.veiculo_atual || (m as any).veiculo_placa}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-xs italic">Sem veículo</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className="font-semibold text-gray-700">{m.total_viagens}</span>
                                            <p className="text-xs text-gray-400">viagens</p>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className="font-mono text-gray-700">{m.km_total.toLocaleString('pt-BR')}</span>
                                            <p className="text-xs text-gray-400">km</p>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <StatusBadge status={m.status} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="bg-gray-50 px-4 py-3 border-t text-sm text-gray-500">
                    {loading
                        ? 'Carregando...'
                        : filtered.length === 0
                          ? 'Nenhum motorista cadastrado no grupo. Use Novo Motorista para incluir.'
                          : `${filtered.length} motorista(s) encontrado(s)`}
                </div>
            </Card>
        </div>
    );
};

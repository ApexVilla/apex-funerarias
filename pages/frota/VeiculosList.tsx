import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Car, Plus, Search, RefreshCw, Edit3, Eye, Wrench, AlertTriangle,
    CheckCircle2, XCircle, Fuel, Calendar, Hash, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { frotaListVeiculos, frotaUpdateVeiculo, frotaDeleteVeiculo } from '../../lib/frotaSupabase';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';

// Tipos
type StatusVeiculo = 'ativo' | 'inativo' | 'manutencao';
type TipoVeiculo = 'carro' | 'van' | 'caminhao' | 'moto' | 'ambulancia' | 'kombi';

interface Veiculo {
    id: string;
    empresa_id?: string;
    placa: string;
    modelo: string;
    marca: string;
    ano: number;
    tipo: TipoVeiculo;
    status: StatusVeiculo;
    cor: string;
    km_atual: number;
    km_ultima_revisao: number;
    km_proxima_revisao: number;
    motorista_padrao?: string;
    combustivel: 'gasolina' | 'diesel' | 'flex' | 'eletrico' | 'gnv';
    vencimento_crlv?: string;
    vencimento_seguro?: string;
    observacao?: string;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const key = (['ativo', 'inativo', 'manutencao'].includes(status) ? status : 'ativo') as StatusVeiculo;
    const map = {
        ativo: { label: 'Ativo', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 },
        inativo: { label: 'Inativo', cls: 'bg-red-100 text-red-700', icon: XCircle },
        manutencao: { label: 'Manutenção', cls: 'bg-amber-100 text-amber-700', icon: Wrench },
    };
    const { label, cls, icon: Icon } = map[key];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
            <Icon className="h-3 w-3" />{label}
        </span>
    );
};

const TipoBadge: React.FC<{ tipo: string }> = ({ tipo }) => {
    const key = (['carro', 'van', 'caminhao', 'moto', 'ambulancia', 'kombi'].includes(tipo) ? tipo : 'carro') as TipoVeiculo;
    const labels: Record<TipoVeiculo, string> = {
        carro: 'Carro', van: 'Van/Furgão', caminhao: 'Caminhão',
        moto: 'Moto', ambulancia: 'Ambulância', kombi: 'Kombi'
    };
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
            {labels[key]}
        </span>
    );
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000, 5000];

export const VeiculosList: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [tipoFilter, setTipoFilter] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const [empresaNomePorId, setEmpresaNomePorId] = useState<Record<string, string>>({});

    // Pagination state
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    useEffect(() => {
        if (!empresaIdEfetivo) {
            setEmpresaNomePorId({});
            return;
        }
        let cancel = false;
        (async () => {
            const { data, error } = await supabase.rpc('fn_empresas_do_meu_grupo');
            if (cancel || error || !Array.isArray(data)) return;
            const m: Record<string, string> = {};
            for (const row of data as { id: string; nome: string }[]) {
                if (row.id) m[row.id] = row.nome || '—';
            }
            setEmpresaNomePorId(m);
        })();
        return () => {
            cancel = true;
        };
    }, [empresaIdEfetivo, dataRevisionEmpresa]);

    const loadVeiculos = async () => {
        if (!empresaIdEfetivo) {
            setVeiculos([]);
            return;
        }
        if (skipUntilGrupoCarrega) return;
        setLoading(true);
        try {
            const rows = await frotaListVeiculos(
                empresaIdEfetivo,
                {
                    search: searchTerm || undefined,
                    status: statusFilter || undefined,
                },
                frotaOpts,
            );
            setVeiculos(rows as Veiculo[]);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao carregar veículos', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVeiculos();
    }, [empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega, searchTerm, statusFilter]);

    const isCargoAlto = ['super_admin', 'admin_empresa', 'admin_sistema', 'admin', 'diretoria', 'gerente', 'gestor'].includes(user?.role?.toLowerCase() || '');

    const handleMudarStatus = async (veiculo: Veiculo, novoStatus: StatusVeiculo) => {
        setOpenMenuId(null);
        if (!empresaIdEfetivo) return;
        try {
            await frotaUpdateVeiculo(empresaIdEfetivo, veiculo.id, { status: novoStatus });
            showToast(`Status atualizado para ${novoStatus}.`, 'success');
            loadVeiculos();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao atualizar status', 'error');
        }
    };

    const handleExcluir = async (veiculo: Veiculo) => {
        setOpenMenuId(null);
        if (!empresaIdEfetivo) return;
        if (!window.confirm(`Tem certeza que deseja excluir o veículo ${veiculo.placa}? Esta ação é irreversível.`)) return;
        try {
            await frotaDeleteVeiculo(empresaIdEfetivo, veiculo.id);
            showToast('Veículo excluído com sucesso.', 'success');
            loadVeiculos();
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Erro ao excluir veículo (verifique dependências).', 'error');
        }
    };

    const filtered = useMemo(() => {
        return veiculos.filter(v => {
            const term = searchTerm.toLowerCase();
            const matchSearch = !searchTerm ||
                (v.placa || '').toLowerCase().includes(term) ||
                (v.modelo || '').toLowerCase().includes(term) ||
                (v.marca || '').toLowerCase().includes(term) ||
                (v.motorista_padrao || '').toLowerCase().includes(term) ||
                (v.empresa_id && (empresaNomePorId[v.empresa_id] || '').toLowerCase().includes(term));
            const st = v.status || 'ativo';
            const tp = v.tipo || 'carro';
            const matchStatus = !statusFilter || st === statusFilter;
            const matchTipo = !tipoFilter || tp === tipoFilter;
            return matchSearch && matchStatus && matchTipo;
        });
    }, [veiculos, searchTerm, statusFilter, tipoFilter, empresaNomePorId]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, statusFilter, tipoFilter]);

    const totalPages = Math.ceil(filtered.length / pageSize);
    const veiculosPaginados = useMemo(() => {
        return filtered.slice((page - 1) * pageSize, page * pageSize);
    }, [filtered, page, pageSize]);

    const mostraColunaEmpresa = useMemo(() => {
        const ids = new Set((veiculos as Veiculo[]).map((v) => v.empresa_id).filter(Boolean));
        return ids.size > 1;
    }, [veiculos]);

    const stats = useMemo(() => ({
        total: filtered.length,
        ativos: filtered.filter(v => (v.status || 'ativo') === 'ativo').length,
        manutencao: filtered.filter(v => v.status === 'manutencao').length,
        inativos: filtered.filter(v => v.status === 'inativo').length,
    }), [filtered]);

    const today = new Date().toISOString().slice(0, 10);
    const isVencendo = (date?: string) => date && date <= today;

    return (
        <div className="space-y-6">
            {user && !empresaIdEfetivo && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Seu usuário não está vinculado a uma empresa no cadastro. Peça um administrador para associar a
                    empresa correta; sem isso, a lista de veículos fica vazia por política de segurança.
                </div>
            )}
            <PageHeader
                title="Veículos"
                subtitle="Cadastro e gestão da frota. O seletor no topo define a unidade (ou todas); a lista acompanha automaticamente."
                backTo="/frota"
                accentColor="#be123c"
                icon={<Car className="h-5 w-5 text-rose-650" />}
                actionButton={
                    <Button onClick={() => navigate('/frota/veiculos/novo')}>
                        <Plus className="h-4 w-4 mr-2" /> Novo Veículo
                    </Button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total', value: stats.total, color: 'bg-blue-50', text: 'text-blue-700', icon: Car },
                    { label: 'Ativos', value: stats.ativos, color: 'bg-green-50', text: 'text-green-700', icon: CheckCircle2 },
                    { label: 'Em Manutenção', value: stats.manutencao, color: 'bg-amber-50', text: 'text-amber-700', icon: Wrench },
                    { label: 'Inativos', value: stats.inativos, color: 'bg-red-50', text: 'text-red-700', icon: XCircle },
                ].map(({ label, value, color, text, icon: Icon }) => (
                    <Card key={label} className={`p-4 ${color}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
                                <p className={`text-3xl font-bold mt-1 ${text}`}>{value}</p>
                            </div>
                            <Icon className={`h-8 w-8 ${text} opacity-60`} />
                        </div>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input placeholder="Buscar por placa, modelo, unidade..." className="pl-9"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="w-full md:w-40">
                    <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="">Status: Todos</option>
                        <option value="ativo">Ativo</option>
                        <option value="manutencao">Manutenção</option>
                        <option value="inativo">Inativo</option>
                    </Select>
                </div>
                <div className="w-full md:w-44">
                    <Select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}>
                        <option value="">Tipo: Todos</option>
                        <option value="carro">Carro</option>
                        <option value="van">Van/Furgão</option>
                        <option value="caminhao">Caminhão</option>
                        <option value="moto">Moto</option>
                        <option value="ambulancia">Ambulância</option>
                        <option value="kombi">Kombi</option>
                    </Select>
                </div>
                <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter(''); setTipoFilter(''); loadVeiculos(); }}>
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
                                {mostraColunaEmpresa && (
                                    <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Unidade</th>
                                )}
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Tipo</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Motorista</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">KM Atual</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Próx. Revisão</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Documentos</th>
                                <th className="text-center py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {veiculosPaginados.length === 0 ? (
                                <tr>
                                    <td colSpan={mostraColunaEmpresa ? 8 : 7} className="py-10 text-center text-gray-500">
                                        {loading ? 'Carregando veículos...' : 'Nenhum veículo encontrado.'}
                                    </td>
                                </tr>
                            ) : veiculosPaginados.map(v => (
                                <tr
                                    key={v.id}
                                    onClick={() => { setSelectedId(v.id); setOpenMenuId(null); }}
                                    onDoubleClick={() => navigate(`/frota/veiculos/${v.id}`)}
                                    onContextMenu={e => {
                                        e.preventDefault();
                                        setSelectedId(v.id);
                                        setOpenMenuId(v.id);
                                        setMenuPosition({ x: e.clientX, y: e.clientY });
                                    }}
                                    className={`transition-all cursor-pointer ${
                                        openMenuId === v.id || selectedId === v.id
                                            ? 'bg-blue-50 ring-1 ring-inset ring-blue-100'
                                            : v.status === 'manutencao' ? 'bg-amber-50/40 hover:bg-amber-50/70'
                                            : v.status === 'inativo' ? 'bg-red-50/30 hover:bg-red-50/50'
                                            : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                <Car className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                                                    onClick={e => { e.stopPropagation(); navigate(`/frota/veiculos/${v.id}`); }}>
                                                    {v.placa}
                                                </p>
                                                <p className="text-xs text-gray-500">{v.marca} {v.modelo} • {v.ano ?? '—'}</p>
                                            </div>
                                        </div>
                                        {openMenuId === v.id && (
                                            <DropdownMenuContent isOpen={true} onClose={() => setOpenMenuId(null)} position={menuPosition}>
                                                <DropdownMenuItem onClick={() => { navigate(`/frota/veiculos/${v.id}`); setOpenMenuId(null); }}>
                                                    <Eye className="h-4 w-4 mr-2" /> Ver Detalhes
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { navigate(`/frota/veiculos/${v.id}/editar`); setOpenMenuId(null); }}>
                                                    <Edit3 className="h-4 w-4 mr-2" /> Editar Veículo
                                                </DropdownMenuItem>
                                                
                                                {isCargoAlto && (
                                                    <>
                                                        {v.status !== 'manutencao' && (
                                                            <DropdownMenuItem onClick={() => handleMudarStatus(v, 'manutencao')}>
                                                                <Wrench className="h-4 w-4 mr-2 text-amber-600" /> Marcar Manutenção
                                                            </DropdownMenuItem>
                                                        )}
                                                        {v.status !== 'inativo' && (
                                                            <DropdownMenuItem onClick={() => handleMudarStatus(v, 'inativo')}>
                                                                <XCircle className="h-4 w-4 mr-2 text-red-500" /> Desativar Veículo
                                                            </DropdownMenuItem>
                                                        )}
                                                        {v.status !== 'ativo' && (
                                                            <DropdownMenuItem onClick={() => handleMudarStatus(v, 'ativo')}>
                                                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Ativar Veículo
                                                            </DropdownMenuItem>
                                                        )}
                                                    </>
                                                )}

                                                <div className="h-px bg-gray-200 my-1"></div>
                                                <DropdownMenuItem onClick={() => { navigate(`/frota/manutencao?veiculo=${v.id}`); setOpenMenuId(null); }}>
                                                    <Wrench className="h-4 w-4 mr-2" /> Registrar Manutenção
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { navigate(`/frota/abastecimentos?veiculo=${v.id}`); setOpenMenuId(null); }}>
                                                    <Fuel className="h-4 w-4 mr-2" /> Registrar Abastecimento
                                                </DropdownMenuItem>

                                                {isCargoAlto && (
                                                    <>
                                                        <div className="h-px bg-gray-200 my-1"></div>
                                                        <DropdownMenuItem 
                                                            onClick={() => handleExcluir(v)}
                                                            variant="danger"
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" /> Excluir Veículo
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        )}
                                    </td>
                                    {mostraColunaEmpresa && (
                                        <td className="py-3 px-4 text-sm text-gray-600 max-w-[140px]">
                                            <span className="truncate block" title={v.empresa_id ? empresaNomePorId[v.empresa_id] : ''}>
                                                {v.empresa_id ? (empresaNomePorId[v.empresa_id] || '—') : '—'}
                                            </span>
                                        </td>
                                    )}
                                    <td className="py-3 px-4"><TipoBadge tipo={v.tipo} /></td>
                                    <td className="py-3 px-4">
                                        {v.motorista_padrao ? (
                                            <span className="text-gray-700">{v.motorista_padrao}</span>
                                        ) : (
                                            <span className="text-gray-400 text-xs italic">Não atribuído</span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <Hash className="h-3.5 w-3.5 text-gray-400" />
                                            <span className="font-mono text-gray-700">
                                                {(Number(v.km_atual) || 0).toLocaleString('pt-BR')} km
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`text-sm font-medium ${(Number(v.km_proxima_revisao) || 0) - (Number(v.km_atual) || 0) < 2000 ? 'text-red-600' : 'text-gray-600'}`}>
                                            {(Number(v.km_proxima_revisao) || 0).toLocaleString('pt-BR')} km
                                        </span>
                                        {(Number(v.km_proxima_revisao) || 0) - (Number(v.km_atual) || 0) < 2000 && (
                                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline ml-1" />
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="flex flex-col gap-0.5 items-center">
                                            {v.vencimento_crlv && (
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${isVencendo(v.vencimento_crlv) ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                                                    <Calendar className="h-3 w-3 inline mr-1" />
                                                    CRLV {new Date(v.vencimento_crlv + 'T00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}
                                                </span>
                                            )}
                                            {v.vencimento_seguro && (
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${isVencendo(v.vencimento_seguro) ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    Seguro {new Date(v.vencimento_seguro + 'T00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <StatusBadge status={v.status} />
                                        {v.observacao && (
                                            <p className="text-xs text-gray-400 mt-0.5 max-w-[120px] truncate">{v.observacao}</p>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination */}
                <div className="px-6 py-4 border-t bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">
                            Mostrando {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} a {Math.min(page * pageSize, filtered.length)} de {filtered.length} resultados
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
        </div>
    );
};

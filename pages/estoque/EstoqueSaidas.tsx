import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageMinus, Plus, Edit, Search, Filter, RefreshCw, ChevronLeft, ChevronRight, Printer, XCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge, DropdownMenuContent, DropdownMenuItem, Input, Select } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';
import { ESTOQUE_SAIDA_MOTIVO_LABELS } from '../../lib/estoqueSaidaMotivos';

type SaidaRow = {
    id: string;
    numero_saida: string;
    solicitante: string | null;
    departamento: string | null;
    motivo: string;
    data_saida: string;
    status: 'rascunho' | 'confirmada' | 'cancelada';
    itens_count: number;
    usuario_lancamento: string;
};

const PAGE_SIZE = 10;

export const EstoqueSaidas: React.FC = () => {
    const navigate = useNavigate();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const { showToast } = useToast();

    const [saidas, setSaidas] = useState<SaidaRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFiltro, setStatusFiltro] = useState('');
    const [page, setPage] = useState(1);

    const loadSaidas = useCallback(async () => {
        if (!empresaIdOperacao) return;
        setLoading(true);
        const empresaIds = empresaIdsFiltro;
        const { data, error } = await supabase
            .from('estoque_saidas')
            .select(
                'id, numero_saida, solicitante, departamento, motivo, data_saida, status, criado_por, processado_por, criador:criado_por ( nome ), confirmador:processado_por ( nome )',
            )
            .in('empresa_id', empresaIds)
            .order('data_saida', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            showToast(`Erro ao carregar saídas: ${error.message}`, 'error');
            setLoading(false);
            return;
        }

        type SaidaDb = Omit<SaidaRow, 'itens_count' | 'usuario_lancamento'> & {
            criador?: { nome?: string } | null;
            confirmador?: { nome?: string } | null;
        };
        const rows = (data ?? []) as SaidaDb[];
        const mapped = await Promise.all(rows.map(async (s) => {
            const { count } = await supabase
                .from('estoque_saida_itens')
                .select('*', { count: 'exact', head: true })
                .eq('saida_id', s.id);
            const usuario_lancamento =
                s.criador?.nome?.trim() || s.confirmador?.nome?.trim() || '—';
            const { criador: _c, confirmador: _f, ...rest } = s;
            return { ...rest, itens_count: count || 0, usuario_lancamento };
        }));

        setSaidas(mapped);
        setLoading(false);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, showToast]);

    useEffect(() => { loadSaidas(); }, [loadSaidas]);

    const filteredSaidas = useMemo(() => {
        let filtered = saidas;
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(s =>
                s.numero_saida.toLowerCase().includes(lower) ||
                (s.solicitante || '').toLowerCase().includes(lower) ||
                (s.departamento || '').toLowerCase().includes(lower) ||
                s.usuario_lancamento.toLowerCase().includes(lower)
            );
        }
        if (statusFiltro) filtered = filtered.filter(s => s.status === statusFiltro);
        return filtered;
    }, [saidas, searchTerm, statusFiltro]);

    const totalPages = Math.ceil(filteredSaidas.length / PAGE_SIZE);
    const paginatedSaidas = filteredSaidas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => { setPage(1); }, [searchTerm, statusFiltro]);

    const openRowMenu = (id: string, event: React.MouseEvent) => {
        setSelectedId(id);
        setOpenMenuId(id);
        setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'confirmada': return <Badge variant="success">Confirmada</Badge>;
            case 'cancelada': return <Badge variant="danger">Cancelada</Badge>;
            default: return <Badge variant="warning">Rascunho</Badge>;
        }
    };

    const handleCancelar = async (id: string) => {
        if (!window.confirm('Deseja cancelar esta saída? Essa ação não pode ser desfeita.')) return;
        const { error } = await supabase
            .from('estoque_saidas')
            .update({ status: 'cancelada', updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) {
            showToast(`Erro ao cancelar: ${error.message}`, 'error');
        } else {
            showToast('Saída cancelada.', 'success');
            await loadSaidas();
        }
        setOpenMenuId(null);
    };

    const handlePrintRecibo = (saida: SaidaRow) => {
        navigate(`/estoque/saidas/${saida.id}/recibo`);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Saídas de Estoque"
                subtitle="Registro de saídas manuais de materiais e mercadorias"
                actionButton={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={loadSaidas} loading={loading}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Atualizar
                        </Button>
                        <Button onClick={() => navigate('/estoque/saidas/nova')}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nova Saída
                        </Button>
                    </div>
                }
            />

            <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar por número, solicitante, depósito ou usuário..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-48 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="flex-1">
                            <option value="">Todos os status</option>
                            <option value="rascunho">Rascunho</option>
                            <option value="confirmada">Confirmada</option>
                            <option value="cancelada">Cancelada</option>
                        </Select>
                    </div>
                </div>
            </Card>

            <div className="list-table-shell">
                <div className="overflow-x-auto">
                    <table className="list-table">
                        <thead>
                            <tr>
                                <th>Número</th>
                                <th>Solicitante</th>
                                <th>Depósito</th>
                                <th>Motivo</th>
                                <th>Data</th>
                                <th>Lançado por</th>
                                <th className="text-right">Itens</th>
                                <th>Situação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedSaidas.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-gray-500">
                                        {loading ? 'Carregando saídas...' : 'Nenhuma saída cadastrada.'}
                                    </td>
                                </tr>
                            ) : paginatedSaidas.map((saida) => (
                                <tr
                                    key={saida.id}
                                    onClick={() => { setSelectedId(saida.id); setOpenMenuId(null); }}
                                    onDoubleClick={() => saida.status === 'rascunho' ? navigate(`/estoque/saidas/${saida.id}/editar`) : handlePrintRecibo(saida)}
                                    onContextMenu={(e) => { e.preventDefault(); openRowMenu(saida.id, e); }}
                                    className={`transition-all cursor-pointer ${openMenuId === saida.id || selectedId === saida.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-100' : 'hover:bg-gray-50'}`}
                                >
                                    <td className="relative">
                                        <span
                                            className="font-mono text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (saida.status === 'rascunho') navigate(`/estoque/saidas/${saida.id}/editar`);
                                                else handlePrintRecibo(saida);
                                            }}
                                        >
                                            {saida.numero_saida}
                                        </span>

                                        {openMenuId === saida.id && (
                                            <DropdownMenuContent
                                                isOpen={true}
                                                onClose={() => setOpenMenuId(null)}
                                                position={menuPosition}
                                            >
                                                {saida.status === 'rascunho' && (
                                                    <DropdownMenuItem onClick={() => { navigate(`/estoque/saidas/${saida.id}/editar`); setOpenMenuId(null); }}>
                                                        <Edit className="h-4 w-4 mr-2" /> Editar Saída
                                                    </DropdownMenuItem>
                                                )}
                                                {saida.status === 'confirmada' && (
                                                    <DropdownMenuItem onClick={() => { handlePrintRecibo(saida); setOpenMenuId(null); }}>
                                                        <Printer className="h-4 w-4 mr-2" /> Imprimir Recibo
                                                    </DropdownMenuItem>
                                                )}
                                                {saida.status === 'rascunho' && (
                                                    <DropdownMenuItem variant="danger" onClick={() => handleCancelar(saida.id)}>
                                                        <XCircle className="h-4 w-4 mr-2" /> Cancelar Saída
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        )}
                                    </td>
                                    <td className="text-slate-900">{saida.solicitante || '-'}</td>
                                    <td>{saida.departamento || '-'}</td>
                                    <td className="text-sm">{ESTOQUE_SAIDA_MOTIVO_LABELS[saida.motivo] || saida.motivo}</td>
                                    <td>{new Date(`${saida.data_saida}T00:00:00`).toLocaleDateString('pt-BR')}</td>
                                    <td className="text-sm text-slate-700">{saida.usuario_lancamento}</td>
                                    <td className="text-right text-slate-900">{saida.itens_count}</td>
                                    <td>{getStatusBadge(saida.status)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t bg-gray-50/50 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                            Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, filteredSaidas.length)} de {filteredSaidas.length} resultados
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                            </Button>
                            <span className="text-sm font-medium text-gray-700 px-2">{page} / {totalPages}</span>
                            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                                Próximo <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <Card className="p-5 border-dashed">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                    <PackageMinus className="h-5 w-5 text-gray-400" />
                    Saídas confirmadas baixam automaticamente o estoque e geram movimentações rastreáveis.
                </div>
            </Card>
        </div>
    );
};

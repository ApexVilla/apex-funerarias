import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Plus, Edit, Search, Filter, RefreshCw, ChevronLeft, ChevronRight, Trash2, Building2, UserCheck, UserX, Phone, Mail } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge, DropdownMenuContent, DropdownMenuItem, Input, Select } from '../../components/ui/Components';
import { Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';

type FornecedorRow = {
    id: string;
    codigo: string;
    nome: string;
    cnpj_cpf?: string | null;
    tipo: string;
    contato?: { nome?: string; telefone?: string; email?: string } | null;
    ativo: boolean;
    created_at?: string;
};

const PAGE_SIZE = 10;

export const EstoqueFornecedores: React.FC = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();

    const [fornecedores, setFornecedores] = useState<FornecedorRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFiltro, setStatusFiltro] = useState('');
    const [tipoFiltro, setTipoFiltro] = useState('');
    const [page, setPage] = useState(1);

    const loadFornecedores = useCallback(async () => {
        if (!empresaIdOperacao) return;
        setLoading(true);
        const empresaIds = empresaIdsFiltro;
        const { data, error } = await supabase
            .from('fornecedores')
            .select('id, codigo, nome, cnpj_cpf, tipo, contato, ativo, created_at')
            .in('empresa_id', empresaIds)
            .is('deleted_at', null)
            .order('nome', { ascending: true });

        if (error) {
            showToast(`Erro ao carregar fornecedores: ${error.message}`, 'error');
        } else {
            setFornecedores((data ?? []) as FornecedorRow[]);
        }
        setLoading(false);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, showToast]);

    useEffect(() => {
        loadFornecedores();
    }, [loadFornecedores]);

    const stats = useMemo(() => ({
        total: fornecedores.length,
        ativos: fornecedores.filter((f) => f.ativo).length,
        inativos: fornecedores.filter((f) => !f.ativo).length,
    }), [fornecedores]);

    const getInitialBg = (nome: string) => {
        const colors = [
            'from-blue-500 to-blue-600', 'from-emerald-500 to-emerald-600',
            'from-violet-500 to-violet-600', 'from-amber-500 to-amber-600',
            'from-rose-500 to-rose-600', 'from-cyan-500 to-cyan-600',
        ];
        const idx = (nome || 'A').charCodeAt(0) % colors.length;
        return colors[idx];
    };

    const filteredFornecedores = useMemo(() => {
        let filtered = fornecedores;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(f =>
                f.nome.toLowerCase().includes(lower) ||
                (f.cnpj_cpf || '').toLowerCase().includes(lower) ||
                (f.codigo || '').toLowerCase().includes(lower) ||
                (f.contato?.telefone || '').toLowerCase().includes(lower) ||
                (f.contato?.email || '').toLowerCase().includes(lower)
            );
        }

        if (statusFiltro === 'ativo') filtered = filtered.filter(f => f.ativo);
        if (statusFiltro === 'inativo') filtered = filtered.filter(f => !f.ativo);
        if (tipoFiltro) filtered = filtered.filter(f => f.tipo === tipoFiltro);

        return filtered;
    }, [fornecedores, searchTerm, statusFiltro, tipoFiltro]);

    const totalPages = Math.ceil(filteredFornecedores.length / PAGE_SIZE);
    const paginatedFornecedores = filteredFornecedores.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, statusFiltro, tipoFiltro]);

    const openRowMenu = (id: string, event: React.MouseEvent) => {
        setSelectedId(id);
        setOpenMenuId(id);
        setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
    };

    const handleDelete = async (id: string) => {
        if (!empresaIdOperacao) return;
        const { error } = await supabase
            .from('fornecedores')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
        if (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        } else {
            showToast('Fornecedor excluído.', 'success');
            await loadFornecedores();
        }
        setOpenMenuId(null);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Fornecedores de Estoque"
                subtitle="Cadastro e qualificação de parceiros de suprimentos"
                actionButton={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={loadFornecedores} loading={loading}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Atualizar
                        </Button>
                        <Button onClick={() => navigate('/estoque/fornecedores/novo')}>
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Fornecedor
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                            <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Total</p>
                            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
                            <UserCheck className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Ativos</p>
                            <p className="text-xl font-bold text-emerald-600">{stats.ativos}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center shadow-sm">
                            <UserX className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Inativos</p>
                            <p className="text-xl font-bold text-gray-700">{stats.inativos}</p>
                        </div>
                    </div>
                </Card>
            </div>

            <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar por nome, CNPJ ou código..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-48 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="flex-1">
                            <option value="">Todos os status</option>
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                        </Select>
                    </div>
                    <div className="w-full md:w-48 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="flex-1">
                            <option value="">Todos os tipos</option>
                            <option value="geral">Geral</option>
                            <option value="urnas">Urnas</option>
                            <option value="floricultura">Floricultura</option>
                            <option value="velorio">Velório</option>
                            <option value="servicos">Serviços</option>
                        </Select>
                    </div>
                </div>
            </Card>

            <div className="list-table-shell overflow-visible">
                <div className="overflow-x-auto">
                    <table className="list-table">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Fornecedor</th>
                                <th>CPF/CNPJ</th>
                                <th>Tipo</th>
                                <th>Contato</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedFornecedores.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-gray-500">
                                        {loading ? 'Carregando fornecedores...' : 'Nenhum fornecedor encontrado.'}
                                    </td>
                                </tr>
                            ) : paginatedFornecedores.map((f) => (
                                <tr
                                    key={f.id}
                                    onClick={() => { setSelectedId(f.id); setOpenMenuId(null); }}
                                    onDoubleClick={() => navigate(`/estoque/fornecedores/${f.id}/editar`)}
                                    onContextMenu={(e) => { e.preventDefault(); openRowMenu(f.id, e); }}
                                    className={`transition-all cursor-pointer ${openMenuId === f.id || selectedId === f.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-100' : 'hover:bg-gray-50'}`}
                                >
                                    <td
                                        className="font-mono text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors"
                                        onClick={(e) => { e.stopPropagation(); navigate(`/estoque/fornecedores/${f.id}/editar`); }}
                                    >
                                        <span className="inline-flex items-center text-xs font-mono text-gray-600 bg-gray-100 border border-gray-200 rounded px-2 py-0.5">
                                            {f.codigo}
                                        </span>
                                    </td>
                                    <td className="relative">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${getInitialBg(f.nome)} flex items-center justify-center text-white font-semibold text-sm shadow-sm`}>
                                                {(f.nome || 'F').charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-medium text-slate-900">{f.nome}</span>
                                        </div>

                                        {openMenuId === f.id && (
                                            <DropdownMenuContent
                                                isOpen={true}
                                                onClose={() => setOpenMenuId(null)}
                                                position={menuPosition}
                                            >
                                                <DropdownMenuItem onClick={() => { navigate(`/estoque/fornecedores/${f.id}/editar`); setOpenMenuId(null); }}>
                                                    <Edit className="h-4 w-4 mr-2" /> Editar Fornecedor
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { navigate(`/estoque/entradas`); setOpenMenuId(null); }}>
                                                    <Eye className="h-4 w-4 mr-2" /> Ver Entradas
                                                </DropdownMenuItem>
                                                <DropdownMenuItem variant="danger" onClick={() => handleDelete(f.id)}>
                                                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        )}
                                    </td>
                                    <td className="font-mono text-xs">{f.cnpj_cpf || '-'}</td>
                                    <td className="capitalize">{f.tipo || '-'}</td>
                                    <td className="text-sm">
                                        <div className="space-y-1">
                                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                                                <Phone className="h-3 w-3 text-gray-400" />
                                                {f.contato?.telefone || '-'}
                                            </p>
                                            <p className="text-xs text-gray-600 flex items-center gap-1.5">
                                                <Mail className="h-3 w-3 text-gray-400" />
                                                {f.contato?.email || '-'}
                                            </p>
                                        </div>
                                    </td>
                                    <td>
                                        <Badge variant={f.ativo ? 'success' : 'outline'}>
                                            {f.ativo ? 'Ativo' : 'Inativo'}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t bg-gray-50/50 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                            Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, filteredFornecedores.length)} de {filteredFornecedores.length} resultados
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
        </div>
    );
};

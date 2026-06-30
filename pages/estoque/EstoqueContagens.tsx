import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardCheck, Plus, Search, Eye, Trash2, CheckCircle2,
    Clock, XCircle, AlertTriangle, Filter, FileSpreadsheet,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Badge } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';

interface Contagem {
    id: string;
    empresa_id: string;
    codigo: string;
    tipo: 'geral' | 'categoria' | 'produto' | 'item';
    status: 'aberta' | 'em_andamento' | 'finalizada' | 'cancelada';
    titulo: string;
    observacoes?: string;
    filtro_categoria?: string;
    total_itens: number;
    itens_contados: number;
    divergencias: number;
    criado_por?: string;
    finalizado_em?: string;
    created_at: string;
    updated_at?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    aberta: { label: 'Aberta', color: 'bg-blue-100 text-blue-700', icon: <Clock className="h-3.5 w-3.5" /> },
    em_andamento: { label: 'Em Andamento', color: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    finalizada: { label: 'Finalizada', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500', icon: <XCircle className="h-3.5 w-3.5" /> },
};

const tipoLabels: Record<string, string> = {
    geral: 'Geral (Todos)',
    categoria: 'Por Categoria',
    produto: 'Por Produto',
    item: 'Por Item',
};

export const EstoqueContagens: React.FC = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const [contagens, setContagens] = useState<Contagem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const loadContagens = useCallback(async () => {
        if (!empresaIdOperacao) return;
        setLoading(true);
        try {
            const empresaIds = empresaIdsFiltro;
            let query = supabase
                .from('estoque_contagens')
                .select('*')
                .in('empresa_id', empresaIds)
                .order('created_at', { ascending: false });

            if (statusFilter) query = query.eq('status', statusFilter);

            const { data, error } = await query;
            if (error) throw error;
            setContagens((data ?? []) as Contagem[]);
        } catch (err: any) {
            console.error('[Contagens]', err);
        } finally {
            setLoading(false);
        }
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, statusFilter]);

    useEffect(() => {
        loadContagens();
    }, [loadContagens]);

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente excluir esta contagem?')) return;
        try {
            const { error } = await supabase
                .from('estoque_contagens')
                .delete()
                .eq('id', id);
            if (error) throw error;
            showToast('Contagem excluída com sucesso.', 'success');
            await loadContagens();
        } catch (err: any) {
            showToast(`Erro ao excluir: ${err.message}`, 'error');
        }
    };

    const filtered = contagens.filter(c => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return c.titulo.toLowerCase().includes(term) ||
            c.codigo.toLowerCase().includes(term) ||
            (c.filtro_categoria || '').toLowerCase().includes(term);
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="Contagem de Estoque"
                subtitle={`${contagens.length} contagem(s) registrada(s)`}
                actionButton={
                    <Button onClick={() => navigate('/estoque/contagens/nova')}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Contagem
                    </Button>
                }
            />

            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-lg shadow-sm border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Buscar por título, código ou categoria..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-48">
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">Status: Todos</option>
                        <option value="aberta">Aberta</option>
                        <option value="em_andamento">Em Andamento</option>
                        <option value="finalizada">Finalizada</option>
                        <option value="cancelada">Cancelada</option>
                    </Select>
                </div>
            </div>

            {/* Lista */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
                </div>
            ) : filtered.length > 0 ? (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b">
                                    <th className="text-left py-3 px-4 font-medium text-gray-600">Código</th>
                                    <th className="text-left py-3 px-4 font-medium text-gray-600">Título</th>
                                    <th className="text-left py-3 px-4 font-medium text-gray-600">Tipo</th>
                                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                                    <th className="text-center py-3 px-4 font-medium text-gray-600">Progresso</th>
                                    <th className="text-center py-3 px-4 font-medium text-gray-600">Divergências</th>
                                    <th className="text-left py-3 px-4 font-medium text-gray-600">Data</th>
                                    <th className="text-right py-3 px-4 font-medium text-gray-600">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filtered.map((c) => {
                                    const statusCfg = statusConfig[c.status] || statusConfig.aberta;
                                    const progresso = c.total_itens > 0
                                        ? Math.round((c.itens_contados / c.total_itens) * 100)
                                        : 0;
                                    return (
                                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="py-3 px-4 font-mono text-xs text-gray-500">{c.codigo}</td>
                                            <td className="py-3 px-4">
                                                <div>
                                                    <p className="font-medium text-gray-900">{c.titulo}</p>
                                                    {c.filtro_categoria && (
                                                        <p className="text-xs text-gray-400">Categoria: {c.filtro_categoria}</p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="text-xs font-medium text-gray-600">
                                                    {tipoLabels[c.tipo] || c.tipo}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
                                                    {statusCfg.icon}
                                                    {statusCfg.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2 justify-center">
                                                    <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${progresso === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                                            style={{ width: `${progresso}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-500 tabular-nums">
                                                        {c.itens_contados}/{c.total_itens}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {c.divergencias > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {c.divergencias}
                                                    </span>
                                                ) : c.status === 'finalizada' ? (
                                                    <span className="text-xs text-green-500 font-medium">OK</span>
                                                ) : (
                                                    <span className="text-xs text-gray-300">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-xs text-gray-500">
                                                {new Date(c.created_at).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => navigate(`/estoque/contagens/${c.id}`)}
                                                        title={c.status === 'finalizada' ? 'Visualizar' : 'Continuar contagem'}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    {(c.status === 'aberta' || c.status === 'cancelada') && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDelete(c.id)}
                                                            title="Excluir"
                                                        >
                                                            <Trash2 className="h-4 w-4 text-red-500" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : (
                <div className="text-center py-16 bg-white rounded-lg border border-dashed">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ClipboardCheck className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">Nenhuma contagem encontrada</h3>
                    <p className="text-gray-500 mt-1 max-w-sm mx-auto">
                        Crie uma nova contagem para verificar o estoque físico.
                    </p>
                    <div className="mt-6">
                        <Button onClick={() => navigate('/estoque/contagens/nova')}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nova Contagem
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

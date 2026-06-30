import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Search, Filter, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Card, Badge, Button, Input, Select } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useEstoqueEmpresaScope } from '../../lib/estoqueEmpresaScope';
import { useToast } from '../../lib/ToastStore';

type MovimentacaoRow = {
    id: string;
    produto_id: string;
    tipo: 'entrada' | 'saida' | 'ajuste' | 'transferencia';
    quantidade: number;
    estoque_anterior: number;
    estoque_posterior: number;
    motivo?: string;
    referencia_tipo?: string;
    referencia_id?: string;
    usuario_id?: string;
    created_at: string;
    produto_nome?: string;
    usuario_nome?: string;
};

type ProdutoOption = {
    id: string;
    nome: string;
    codigo: string;
};

const TIPO_CONFIG: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'outline' }> = {
    entrada: { label: 'Entrada', variant: 'success' },
    saida: { label: 'Saída', variant: 'danger' },
    ajuste: { label: 'Ajuste', variant: 'warning' },
    transferencia: { label: 'Transferência', variant: 'outline' },
};

const PAGE_SIZE = 15;

export const EstoqueMovimentacoes: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { empresaIds, dataRevisionEmpresa } = useEstoqueEmpresaScope();

    const [movimentacoes, setMovimentacoes] = useState<MovimentacaoRow[]>([]);
    const [produtos, setProdutos] = useState<ProdutoOption[]>([]);
    const [loading, setLoading] = useState(false);

    const [tipoFiltro, setTipoFiltro] = useState('');
    const [produtoFiltro, setProdutoFiltro] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);

    const loadProdutos = useCallback(async () => {
        if (!user?.empresa_id || empresaIds.length === 0) return;
        const { data } = await supabase
            .from('ser_produtos')
            .select('id, nome, codigo')
            .in('empresa_id', empresaIds)
            .eq('ativo', true)
            .order('nome');
        setProdutos((data ?? []) as ProdutoOption[]);
    }, [user?.empresa_id, empresaIds]);

    const loadMovimentacoes = useCallback(async () => {
        if (!user?.empresa_id || empresaIds.length === 0) return;
        setLoading(true);

        let query = supabase
            .from('estoque_movimentacoes')
            .select(`
                *,
                ser_produtos:produto_id ( nome ),
                users:usuario_id ( nome )
            `)
            .in('empresa_id', empresaIds)
            .order('created_at', { ascending: false })
            .limit(500);

        if (tipoFiltro) query = query.eq('tipo', tipoFiltro);
        if (produtoFiltro) query = query.eq('produto_id', produtoFiltro);
        if (dataInicio) query = query.gte('created_at', dataInicio);
        if (dataFim) query = query.lte('created_at', `${dataFim}T23:59:59`);

        const { data, error } = await query;

        if (error) {
            showToast(`Erro ao carregar movimentações: ${error.message}`, 'error');
        } else {
            const mapped = (data ?? []).map((m: any) => ({
                ...m,
                produto_nome: m.ser_produtos?.nome || '',
                usuario_nome: m.users?.nome || '',
            }));
            setMovimentacoes(mapped as MovimentacaoRow[]);
        }
        setLoading(false);
    }, [user?.empresa_id, empresaIds, tipoFiltro, produtoFiltro, dataInicio, dataFim, showToast]);

    useEffect(() => {
        loadProdutos();
    }, [loadProdutos, dataRevisionEmpresa]);

    useEffect(() => {
        loadMovimentacoes();
    }, [loadMovimentacoes, dataRevisionEmpresa]);

    const filteredMovimentacoes = useMemo(() => {
        if (!searchTerm) return movimentacoes;
        const lower = searchTerm.toLowerCase();
        return movimentacoes.filter(m =>
            (m.produto_nome || '').toLowerCase().includes(lower) ||
            (m.motivo || '').toLowerCase().includes(lower) ||
            (m.usuario_nome || '').toLowerCase().includes(lower)
        );
    }, [movimentacoes, searchTerm]);

    const totalPages = Math.ceil(filteredMovimentacoes.length / PAGE_SIZE);
    const paginatedMovimentacoes = filteredMovimentacoes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, tipoFiltro, produtoFiltro, dataInicio, dataFim]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Movimentações de Estoque"
                subtitle="Controle de entradas, saídas, ajustes e transferências"
                actionButton={
                    <Button variant="outline" onClick={loadMovimentacoes} loading={loading}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                }
            />

            <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar por produto, motivo ou usuário..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-48 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="flex-1">
                            <option value="">Todos os tipos</option>
                            <option value="entrada">Entrada</option>
                            <option value="saida">Saída</option>
                            <option value="ajuste">Ajuste</option>
                            <option value="transferencia">Transferência</option>
                        </Select>
                    </div>
                    <div className="w-full md:w-56 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select value={produtoFiltro} onChange={(e) => setProdutoFiltro(e.target.value)} className="flex-1">
                            <option value="">Todos os produtos</option>
                            {produtos.map(p => (
                                <option key={p.id} value={p.id}>{p.codigo} - {p.nome}</option>
                            ))}
                        </Select>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 mt-3">
                    <div className="w-full md:w-48">
                        <Input
                            label="Data início"
                            type="date"
                            value={dataInicio}
                            onChange={(e) => setDataInicio(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-48">
                        <Input
                            label="Data fim"
                            type="date"
                            value={dataFim}
                            onChange={(e) => setDataFim(e.target.value)}
                        />
                    </div>
                </div>
            </Card>

            <div className="list-table-shell">
                <div className="overflow-x-auto">
                    <table className="list-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Produto</th>
                                <th>Tipo</th>
                                <th className="text-right">Quantidade</th>
                                <th className="text-right">Estoque Anterior</th>
                                <th className="text-right">Estoque Posterior</th>
                                <th>Motivo</th>
                                <th>Usuário</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedMovimentacoes.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-gray-500">
                                        {loading ? 'Carregando movimentações...' : 'Nenhuma movimentação encontrada.'}
                                    </td>
                                </tr>
                            ) : paginatedMovimentacoes.map((mov) => {
                                const config = TIPO_CONFIG[mov.tipo] || { label: mov.tipo, variant: 'outline' as const };
                                return (
                                    <tr key={mov.id} className="hover:bg-gray-50">
                                        <td className="text-sm">
                                            {new Date(mov.created_at).toLocaleDateString('pt-BR')}
                                            <div className="text-xs text-gray-400">
                                                {new Date(mov.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="font-medium text-slate-900">{mov.produto_nome || '-'}</td>
                                        <td>
                                            <Badge variant={config.variant}>
                                                {config.label}
                                            </Badge>
                                        </td>
                                        <td className={`text-right font-medium ${mov.tipo === 'entrada' ? 'text-green-600' : mov.tipo === 'saida' ? 'text-red-600' : 'text-slate-900'}`}>
                                            {mov.tipo === 'entrada' ? '+' : mov.tipo === 'saida' ? '-' : ''}{Number(mov.quantidade)}
                                        </td>
                                        <td className="text-right text-gray-500">{Number(mov.estoque_anterior)}</td>
                                        <td className="text-right text-slate-900 font-medium">{Number(mov.estoque_posterior)}</td>
                                        <td className="text-sm text-gray-600 max-w-xs truncate">{mov.motivo || '-'}</td>
                                        <td className="text-sm">{mov.usuario_nome || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t bg-gray-50/50 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                            Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, filteredMovimentacoes.length)} de {filteredMovimentacoes.length} resultados
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
                    <ArrowLeftRight className="h-5 w-5 text-gray-400" />
                    Todas as movimentações são registradas automaticamente ao confirmar entradas e processar atendimentos.
                </div>
            </Card>
        </div>
    );
};

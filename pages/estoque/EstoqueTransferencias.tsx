import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Plus, RefreshCw, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge, Input, Select } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';

type TransferRow = {
    id: string;
    deposito_origem_id: string;
    deposito_destino_id: string;
    status: string;
    observacao?: string | null;
    created_at: string;
};

const PAGE_SIZE = 12;

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'outline' }> = {
    rascunho: { label: 'Rascunho', variant: 'warning' },
    efetivada: { label: 'Efetivada', variant: 'success' },
    cancelada: { label: 'Cancelada', variant: 'outline' },
};

export const EstoqueTransferencias: React.FC = () => {
    const navigate = useNavigate();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const { showToast } = useToast();
    const [rows, setRows] = useState<TransferRow[]>([]);
    const [depositoNome, setDepositoNome] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFiltro, setStatusFiltro] = useState('');
    const [page, setPage] = useState(1);

    const load = useCallback(async () => {
        if (!empresaIdOperacao) return;
        setLoading(true);
        const empresaIds = empresaIdsFiltro;
        const { data, error } = await supabase
            .from('estoque_transferencias')
            .select('id, deposito_origem_id, deposito_destino_id, status, observacao, created_at')
            .in('empresa_id', empresaIds)
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            showToast(`Erro ao carregar transferências: ${error.message}`, 'error');
            setLoading(false);
            return;
        }

        const list = (data || []) as TransferRow[];
        setRows(list);

        const depIds = [...new Set(list.flatMap((r) => [r.deposito_origem_id, r.deposito_destino_id]))];
        if (depIds.length) {
            const { data: deps } = await supabase.from('estoque_depositos').select('id, nome').in('id', depIds);
            const map: Record<string, string> = {};
            (deps || []).forEach((d: any) => { map[d.id] = d.nome; });
            setDepositoNome(map);
        } else {
            setDepositoNome({});
        }
        setLoading(false);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, showToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const filtered = useMemo(() => {
        let r = rows;
        if (statusFiltro) r = r.filter((x) => x.status === statusFiltro);
        if (searchTerm) {
            const t = searchTerm.toLowerCase();
            r = r.filter(
                (x) =>
                    (x.observacao || '').toLowerCase().includes(t) ||
                    (depositoNome[x.deposito_origem_id] || '').toLowerCase().includes(t) ||
                    (depositoNome[x.deposito_destino_id] || '').toLowerCase().includes(t)
            );
        }
        return r;
    }, [rows, statusFiltro, searchTerm, depositoNome]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, statusFiltro]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Transferências entre depósitos"
                subtitle="Movimente saldos entre locais da mesma empresa com rastreio e confirmação."
                actionButton={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void load()} loading={loading}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Atualizar
                        </Button>
                        <Button onClick={() => navigate('/estoque/transferencias/nova')}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nova transferência
                        </Button>
                    </div>
                }
            />

            <Card className="p-4 flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                        className="pl-9"
                        placeholder="Buscar por depósito ou observação..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="w-full sm:w-48">
                    <option value="">Todos os status</option>
                    <option value="rascunho">Rascunho</option>
                    <option value="efetivada">Efetivada</option>
                    <option value="cancelada">Cancelada</option>
                </Select>
            </Card>

            <div className="list-table-shell">
                <div className="overflow-x-auto">
                    <table className="list-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Origem</th>
                                <th>Destino</th>
                                <th>Status</th>
                                <th className="text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {slice.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-10 text-center text-gray-500 text-sm">
                                        {loading ? 'Carregando…' : 'Nenhuma transferência encontrada.'}
                                    </td>
                                </tr>
                            ) : (
                                slice.map((r) => {
                                    const st = STATUS_MAP[r.status] || { label: r.status, variant: 'outline' as const };
                                    return (
                                        <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/estoque/transferencias/${r.id}`)}>
                                            <td className="text-sm text-gray-700">
                                                {new Date(r.created_at).toLocaleString('pt-BR')}
                                            </td>
                                            <td className="font-medium text-slate-800">{depositoNome[r.deposito_origem_id] || '—'}</td>
                                            <td className="font-medium text-slate-800">{depositoNome[r.deposito_destino_id] || '—'}</td>
                                            <td>
                                                <Badge variant={st.variant}>{st.label}</Badge>
                                            </td>
                                            <td className="text-right">
                                                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/estoque/transferencias/${r.id}`); }}>
                                                    <ArrowLeftRight className="h-4 w-4 mr-1" />
                                                    Abrir
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                {filtered.length > PAGE_SIZE && (
                    <div className="px-6 py-3 border-t flex items-center justify-between bg-gray-50/50">
                        <span className="text-xs text-gray-500">
                            Página {page} de {totalPages} ({filtered.length} registros)
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

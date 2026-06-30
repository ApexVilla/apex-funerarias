import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Components';
import { ProdutoEstoqueSelect } from '../../components/estoque/ProdutoEstoqueSelect';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useFilial } from '../../lib/FilialContext';

type Deposito = { id: string; nome: string; ativo: boolean; filial_id: string | null };
type ProdutoOpt = {
    id: string;
    nome: string;
    codigo: string;
    categoria?: string | null;
    codigo_barras?: string | null;
    marca?: string | null;
};
type SaldoRow = { produto_id: string; quantidade: number; ser_produtos?: { nome: string; codigo: string } };

type Linha = { key: string; produto_id: string; quantidade: string };

export const EstoqueTransferenciaForm: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { transferenciaId } = useParams<{ transferenciaId: string }>();
    const isNew = location.pathname.endsWith('/nova');
    const { user } = useAuth();
    const { showToast } = useToast();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const { filialId, isTodasFiliais, dataRevision } = useFilial();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [origemId, setOrigemId] = useState('');
    const [destinoId, setDestinoId] = useState('');
    const [observacao, setObservacao] = useState('');
    const [status, setStatus] = useState<string>('rascunho');
    const readOnly = status !== 'rascunho';
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [produtos, setProdutos] = useState<ProdutoOpt[]>([]);
    const [saldosOrigem, setSaldosOrigem] = useState<SaldoRow[]>([]);

    const saldoPorProduto = useMemo(() => {
        const m: Record<string, number> = {};
        saldosOrigem.forEach((s) => { m[s.produto_id] = Number(s.quantidade) || 0; });
        return m;
    }, [saldosOrigem]);

    const loadDepositos = useCallback(async () => {
        if (!empresaIdOperacao) return;
        const empresaIds = empresaIdsFiltro;
        const { data } = await supabase
            .from('estoque_depositos')
            .select('id, nome, ativo, filial_id')
            .in('empresa_id', empresaIds)
            .eq('ativo', true)
            .order('nome');
        setDepositos((data as Deposito[]) || []);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevision, dataRevisionEmpresa]);

    const depositosFiltrados = useMemo(() => {
        if (isTodasFiliais || filialId === FILIAL_TODAS_ID || !filialId) return depositos;
        return depositos.filter((d) => !d.filial_id || d.filial_id === filialId);
    }, [depositos, filialId, isTodasFiliais]);

    /** Mantém origem/destino já gravados visíveis mesmo fora do filtro da filial atual. */
    const depositosOpcoes = useMemo(() => {
        const seen = new Set<string>();
        const out: Deposito[] = [];
        for (const d of depositosFiltrados) {
            seen.add(d.id);
            out.push(d);
        }
        for (const d of depositos) {
            if (seen.has(d.id)) continue;
            if (d.id === origemId || d.id === destinoId) {
                seen.add(d.id);
                out.push(d);
            }
        }
        return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }, [depositos, depositosFiltrados, origemId, destinoId]);

    const loadProdutos = useCallback(async () => {
        if (!empresaIdOperacao) return;
        const empresaIds = empresaIdsFiltro;
        const { data } = await supabase
            .from('ser_produtos')
            .select('id, nome, codigo, categoria, codigo_barras, marca')
            .in('empresa_id', empresaIds)
            .eq('ativo', true)
            .order('nome');
        setProdutos((data as ProdutoOpt[]) || []);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa]);

    const loadSaldosOrigem = useCallback(async () => {
        if (!empresaIdOperacao || !origemId) {
            setSaldosOrigem([]);
            return;
        }
        const { data, error } = await supabase
            .from('estoque_saldo_deposito')
            .select('produto_id, quantidade, ser_produtos ( nome, codigo )')
            .eq('deposito_id', origemId)
            .gt('quantidade', 0);
        if (error) {
            if (!error.message.includes('estoque_saldo_deposito')) {
                showToast(`Não foi possível carregar saldos: ${error.message}`, 'warning');
            }
            setSaldosOrigem([]);
            return;
        }
        const mapped = ((data || []) as any[]).map((row) => ({
            produto_id: row.produto_id,
            quantidade: row.quantidade,
            ser_produtos: Array.isArray(row.ser_produtos) ? row.ser_produtos[0] : row.ser_produtos,
        }));
        setSaldosOrigem(mapped as SaldoRow[]);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, origemId, showToast]);

    const loadTransferencia = useCallback(async () => {
        if (!empresaIdOperacao || !transferenciaId || isNew) return;
        setLoading(true);
        const { data: tr, error } = await supabase
            .from('estoque_transferencias')
            .select('*')
            .eq('id', transferenciaId)
            .single();
        if (error || !tr) {
            showToast('Transferência não encontrada.', 'warning');
            navigate('/estoque/transferencias');
            setLoading(false);
            return;
        }
        setOrigemId(tr.deposito_origem_id);
        setDestinoId(tr.deposito_destino_id);
        setObservacao(tr.observacao || '');
        setStatus(tr.status);

        const { data: itens } = await supabase
            .from('estoque_transferencia_itens')
            .select('produto_id, quantidade')
            .eq('transferencia_id', transferenciaId);
        setLinhas(
            (itens || []).map((it: any) => ({
                key: crypto.randomUUID(),
                produto_id: it.produto_id,
                quantidade: String(it.quantidade),
            }))
        );
        setLoading(false);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa, transferenciaId, isNew, navigate, showToast]);

    useEffect(() => {
        void loadDepositos();
        void loadProdutos();
    }, [loadDepositos, loadProdutos]);

    useEffect(() => {
        void loadSaldosOrigem();
    }, [loadSaldosOrigem]);

    useEffect(() => {
        void loadTransferencia();
    }, [loadTransferencia]);

    useEffect(() => {
        if (readOnly || !isNew) return;
        setOrigemId((o) => (o && !depositosFiltrados.some((d) => d.id === o) ? '' : o));
        setDestinoId((d) => (d && !depositosFiltrados.some((x) => x.id === d) ? '' : d));
    }, [depositosFiltrados, readOnly, isNew]);

    const addLinha = () => {
        setLinhas((prev) => [...prev, { key: crypto.randomUUID(), produto_id: '', quantidade: '1' }]);
    };

    const removeLinha = (key: string) => {
        setLinhas((prev) => prev.filter((l) => l.key !== key));
    };

    const updateLinha = (key: string, patch: Partial<Linha>) => {
        setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    };

    const salvarRascunho = async () => {
        if (!empresaIdOperacao || !user?.id) {
            showToast('Sessão inválida.', 'error');
            return;
        }
        if (!origemId || !destinoId) {
            showToast('Selecione depósito de origem e destino.', 'warning');
            return;
        }
        if (origemId === destinoId) {
            showToast('Origem e destino devem ser diferentes.', 'warning');
            return;
        }
        const linhasOk = linhas.filter((l) => l.produto_id && Number(l.quantidade) > 0);
        if (linhasOk.length === 0) {
            showToast('Inclua ao menos um item com quantidade.', 'warning');
            return;
        }

        setSaving(true);
        try {
            if (isNew) {
                const { data: ins, error: e1 } = await supabase
                    .from('estoque_transferencias')
                    .insert({
                        empresa_id: empresaIdOperacao,
                        deposito_origem_id: origemId,
                        deposito_destino_id: destinoId,
                        observacao: observacao.trim() || null,
                        usuario_id: user.id,
                        status: 'rascunho',
                    })
                    .select('id')
                    .single();
                if (e1 || !ins) throw e1 || new Error('Falha ao criar transferência');
                const tid = ins.id as string;
                const { error: e2 } = await supabase.from('estoque_transferencia_itens').insert(
                    linhasOk.map((l) => ({
                        transferencia_id: tid,
                        produto_id: l.produto_id,
                        quantidade: Number(l.quantidade),
                    }))
                );
                if (e2) throw e2;
                showToast('Rascunho salvo.', 'success');
                navigate(`/estoque/transferencias/${tid}`);
            } else if (transferenciaId && status === 'rascunho') {
                await supabase.from('estoque_transferencia_itens').delete().eq('transferencia_id', transferenciaId);
                const { error: e3 } = await supabase
                    .from('estoque_transferencias')
                    .update({
                        deposito_origem_id: origemId,
                        deposito_destino_id: destinoId,
                        observacao: observacao.trim() || null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', transferenciaId);
                if (e3) throw e3;
                const { error: e4 } = await supabase.from('estoque_transferencia_itens').insert(
                    linhasOk.map((l) => ({
                        transferencia_id: transferenciaId,
                        produto_id: l.produto_id,
                        quantidade: Number(l.quantidade),
                    }))
                );
                if (e4) throw e4;
                showToast('Rascunho atualizado.', 'success');
                void loadTransferencia();
            }
        } catch (e: any) {
            showToast(e?.message || 'Erro ao salvar.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const efetivar = async () => {
        if (!transferenciaId || status !== 'rascunho') return;
        setSaving(true);
        try {
            const { error } = await supabase.rpc('fn_efetivar_transferencia_estoque', {
                p_transferencia_id: transferenciaId,
            });
            if (error) throw error;
            showToast('Transferência efetivada.', 'success');
            setStatus('efetivada');
            void loadSaldosOrigem();
        } catch (e: any) {
            showToast(e?.message || 'Erro ao efetivar.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const cancelar = async () => {
        if (!transferenciaId || status !== 'rascunho') return;
        if (!confirm('Cancelar este rascunho?')) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('estoque_transferencias')
                .update({ status: 'cancelada', updated_at: new Date().toISOString() })
                .eq('id', transferenciaId);
            if (error) throw error;
            showToast('Transferência cancelada.', 'success');
            setStatus('cancelada');
        } catch (e: any) {
            showToast(e?.message || 'Erro ao cancelar.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={isNew ? 'Nova transferência' : 'Transferência entre depósitos'}
                subtitle="Mesma empresa: o saldo sai do depósito de origem e entra no destino ao efetivar."
                actionButton={
                    <Button variant="outline" onClick={() => navigate('/estoque/transferencias')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Lista
                    </Button>
                }
            />

            {!isNew && loading && (
                <p className="text-sm text-gray-500">Carregando transferência…</p>
            )}

            <Card className="p-6 space-y-4">
                {!isTodasFiliais && filialId && filialId !== FILIAL_TODAS_ID && (
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        Depósitos listados conforme a <strong>filial ativa</strong> no cabeçalho. Para ver todos os depósitos, selecione &quot;Todas as filiais&quot; (se disponível).
                    </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                        label="Depósito de origem"
                        value={origemId}
                        onChange={(e) => setOrigemId(e.target.value)}
                        disabled={readOnly}
                    >
                        <option value="">Selecione</option>
                        {depositosOpcoes.map((d) => (
                            <option key={d.id} value={d.id} disabled={d.id === destinoId}>
                                {d.nome}
                            </option>
                        ))}
                    </Select>
                    <Select
                        label="Depósito de destino"
                        value={destinoId}
                        onChange={(e) => setDestinoId(e.target.value)}
                        disabled={readOnly}
                    >
                        <option value="">Selecione</option>
                        {depositosOpcoes.map((d) => (
                            <option key={d.id} value={d.id} disabled={d.id === origemId}>
                                {d.nome}
                            </option>
                        ))}
                    </Select>
                </div>
                <Textarea
                    label="Observação"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    disabled={readOnly}
                    placeholder="Opcional: motivo, responsável, OS…"
                />
                {!isNew && (
                    <p className="text-sm">
                        Status:{' '}
                        <span className="font-semibold text-slate-800">
                            {status === 'rascunho' ? 'Rascunho' : status === 'efetivada' ? 'Efetivada' : 'Cancelada'}
                        </span>
                    </p>
                )}
            </Card>

            <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">Itens</h3>
                    {!readOnly && (
                        <Button type="button" variant="outline" size="sm" onClick={addLinha}>
                            <Plus className="h-4 w-4 mr-1" />
                            Adicionar linha
                        </Button>
                    )}
                </div>
                {origemId && saldosOrigem.length === 0 && !readOnly && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        Nenhum saldo positivo neste depósito (aplique a migration de saldos ou movimente estoque para cá). Ainda assim você pode salvar o rascunho se os saldos forem criados depois.
                    </p>
                )}
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                            <tr>
                                <th className="py-2.5 px-3">Produto</th>
                                <th className="py-2.5 px-3 w-36">Quantidade</th>
                                <th className="py-2.5 px-3 w-28">Disp. origem</th>
                                {!readOnly && <th className="w-12" />}
                            </tr>
                        </thead>
                        <tbody>
                            {linhas.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-6 px-3 text-center text-gray-400">
                                        Nenhum item. Adicione linhas com produto e quantidade.
                                    </td>
                                </tr>
                            ) : (
                                linhas.map((l) => {
                                    const max = l.produto_id ? saldoPorProduto[l.produto_id] ?? undefined : undefined;
                                    return (
                                        <tr key={l.key} className="border-t border-gray-100">
                                            <td className="py-2 px-3">
                                                <ProdutoEstoqueSelect
                                                    label=""
                                                    produtos={produtos}
                                                    value={l.produto_id}
                                                    onChange={(produtoId) =>
                                                        updateLinha(l.key, { produto_id: produtoId })
                                                    }
                                                    disabled={readOnly}
                                                    placeholder="Pesquisar produto…"
                                                />
                                            </td>
                                            <td className="py-2 px-3">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    step="0.001"
                                                    value={l.quantidade}
                                                    onChange={(e) => updateLinha(l.key, { quantidade: e.target.value })}
                                                    disabled={readOnly}
                                                />
                                            </td>
                                            <td className="py-2 px-3 text-xs text-gray-600 tabular-nums">
                                                {max !== undefined ? max : '—'}
                                            </td>
                                            {!readOnly && (
                                                <td className="py-2 px-2">
                                                    <Button type="button" variant="outline" size="sm" onClick={() => removeLinha(l.key)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div className="flex flex-wrap gap-2 justify-end">
                {!readOnly && (
                    <>
                        <Button variant="outline" onClick={() => salvarRascunho()} loading={saving}>
                            <Save className="h-4 w-4 mr-2" />
                            {isNew ? 'Salvar rascunho' : 'Atualizar rascunho'}
                        </Button>
                        {!isNew && transferenciaId && (
                            <>
                                <Button variant="outline" onClick={() => void cancelar()} loading={saving}>
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Cancelar
                                </Button>
                                <Button onClick={() => void efetivar()} loading={saving}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Efetivar transferência
                                </Button>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

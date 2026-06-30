import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2, X } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Components';
import { ProdutoEstoqueSelect } from '../../components/estoque/ProdutoEstoqueSelect';
import { supabase } from '../../lib/supabase';
import { gerarCodigoProdutoInterno } from '../../lib/gerarCodigoProdutoInterno';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { CATEGORIAS_PRODUTO_ESTOQUE } from '../../lib/categoriasProdutoEstoque';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useFilial } from '../../lib/FilialContext';
import { useToast } from '../../lib/ToastStore';
import { deduplicarDepositosPorUnidade, rotuloDepositoUnidade } from '../../lib/estoqueDepositosUnidade';

type Produto = {
    id: string;
    codigo: string;
    nome: string;
    categoria?: string;
    codigo_barras?: string | null;
    marca?: string | null;
    estoque_minimo: number;
    preco_centavos: number;
    valor_custo_centavos: number;
};

type Fornecedor = {
    id: string;
    nome: string;
    cnpj_cpf?: string | null;
};

type EntradaItem = {
    id: string;
    produto_id: string;
    quantidade: string;
    valor_unitario: string;
};

type Deposito = {
    id: string;
    nome: string;
    filial_id: string | null;
    filial_nome?: string;
};


export const EstoqueEntradaForm: React.FC = () => {
    const navigate = useNavigate();
    const { entradaId } = useParams();
    const { showToast } = useToast();
    const { empresaIdEfetivo, empresaIdsParaFiltro } = useEmpresaContextoAtivo();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const { filiais, dataRevision } = useFilial();
    const isEdit = Boolean(entradaId);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [depositos, setDepositos] = useState<Deposito[]>([]);
    const [processadoEm, setProcessadoEm] = useState<string | null>(null);

    const [form, setForm] = useState({
        numero_documento: '',
        fornecedor_nome: '',
        deposito_id: '',
        data_entrada: new Date().toISOString().slice(0, 10),
        status: 'pendente',
        observacoes: '',
    });

    const [itens, setItens] = useState<EntradaItem[]>([
        { id: crypto.randomUUID(), produto_id: '', quantidade: '1', valor_unitario: '0.00' },
    ]);

    const [cadastroRapidoLinhaId, setCadastroRapidoLinhaId] = useState<string | null>(null);
    const [novoItem, setNovoItem] = useState({
        nome: '',
        categoria: '',
        preco: '0.00',
        custo: '0.00',
        estoque_minimo: '0',
    });

    const fecharCadastroRapido = () => {
        setCadastroRapidoLinhaId(null);
        setNovoItem({ nome: '', categoria: '', preco: '0.00', custo: '0.00', estoque_minimo: '0' });
    };

    const abrirCadastroRapido = (linhaId: string, nomeSugerido: string) => {
        setCadastroRapidoLinhaId(linhaId);
        setNovoItem({
            nome: nomeSugerido,
            categoria: '',
            preco: '0.00',
            custo: '0.00',
            estoque_minimo: '0',
        });
    };

    const loadProdutos = async () => {
        if (!empresaIdOperacao) return;
        const empresaIds = empresaIdsFiltro;
        const { data } = await supabase
            .from('ser_produtos')
            .select('id, codigo, nome, categoria, codigo_barras, marca, estoque_minimo, preco_centavos, valor_custo_centavos')
            .in('empresa_id', empresaIds)
            .eq('ativo', true)
            .order('nome');
        setProdutos((data ?? []) as Produto[]);
    };

    const loadFornecedores = async () => {
        if (!empresaIdOperacao) return;
        const empresaIds = empresaIdsFiltro;
        const { data } = await supabase
            .from('fornecedores')
            .select('id, nome, cnpj_cpf')
            .in('empresa_id', empresaIds)
            .eq('ativo', true)
            .is('deleted_at', null)
            .order('nome');
        setFornecedores((data ?? []) as Fornecedor[]);
    };

    const loadDepositos = useCallback(async () => {
        const eid = empresaIdEfetivo || empresaIdOperacao;
        if (!eid) return;
        const ids =
            empresaIdsParaFiltro.length > 0
                ? empresaIdsParaFiltro
                : [eid];
        const { data, error } = await supabase
            .from('estoque_depositos')
            .select('id, nome, filial_id, empresa_id, filiais ( nome )')
            .in('empresa_id', ids)
            .eq('ativo', true)
            .is('deleted_at', null)
            .order('nome');

        if (error) {
            showToast(`Erro ao carregar depósitos: ${error.message}`, 'error');
            setDepositos([]);
            return;
        }

        const mapped = (data ?? []).map(
            (d: any) => ({
                id: d.id,
                nome: d.nome,
                filial_id: d.filial_id,
                filial_nome: Array.isArray(d.filiais)
                    ? d.filiais[0]?.nome
                    : d.filiais?.nome,
                empresa_id: d.empresa_id,
            }),
        );

        setDepositos(deduplicarDepositosPorUnidade(mapped, eid));
    }, [empresaIdEfetivo, empresaIdsParaFiltro, showToast, empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa]);

    /** Todas as unidades da empresa — destino da entrada independe da filial do cabeçalho. */
    const depositosComFilial = useMemo(
        () => depositos.filter((d) => d.filial_id),
        [depositos],
    );

    const depositosPorFilial = useMemo(() => {
        const lista = depositosComFilial.length > 0 ? depositosComFilial : depositos;
        const base = lista.map((d) => ({
            filialId: d.filial_id || d.id,
            filialNome: rotuloDepositoUnidade(d),
            itens: [d],
        }));

        if (form.deposito_id) {
            const gravado = depositos.find((d) => d.id === form.deposito_id);
            if (gravado && !base.some((g) => g.itens[0]?.id === gravado.id)) {
                base.push({
                    filialId: gravado.filial_id || gravado.id,
                    filialNome: rotuloDepositoUnidade(gravado),
                    itens: [gravado],
                });
            }
        }

        return base.sort((a, b) => a.filialNome.localeCompare(b.filialNome, 'pt-BR'));
    }, [depositosComFilial, depositos, form.deposito_id]);

    const totalDepositosSelecionaveis = useMemo(
        () => depositosPorFilial.reduce((n, g) => n + g.itens.length, 0),
        [depositosPorFilial],
    );

    useEffect(() => {
        const load = async () => {
            if (!empresaIdOperacao) return;
            setLoading(true);
            await loadProdutos();
            await loadFornecedores();
            await loadDepositos();

            if (isEdit && entradaId) {
                const { data: entrada } = await supabase
                    .from('estoque_entradas')
                    .select('*')
                    .eq('id', entradaId)
                    .single();

                if (!entrada) {
                    showToast('Entrada não encontrada.', 'warning');
                    navigate('/estoque/entradas');
                    return;
                }

                setForm({
                    numero_documento: entrada.numero_documento || '',
                    fornecedor_nome: entrada.fornecedor_nome || '',
                    deposito_id: entrada.deposito_id || '',
                    data_entrada: entrada.data_entrada || new Date().toISOString().slice(0, 10),
                    status: entrada.status || 'pendente',
                    observacoes: entrada.observacoes || '',
                });
                setProcessadoEm(entrada.processado_em || null);

                const { data: itensData } = await supabase
                    .from('estoque_entrada_itens')
                    .select('*')
                    .eq('entrada_id', entradaId);

                const mapped = (itensData ?? []).map((it: any) => ({
                    id: it.id,
                    produto_id: it.produto_id,
                    quantidade: String(it.quantidade),
                    valor_unitario: (it.valor_unitario_centavos / 100).toFixed(2),
                }));
                setItens(mapped.length ? mapped : [{ id: crypto.randomUUID(), produto_id: '', quantidade: '1', valor_unitario: '0.00' }]);
            }
            setLoading(false);
        };
        void load();
    }, [entradaId, isEdit, navigate, empresaIdOperacao, loadDepositos, dataRevision, dataRevisionEmpresa]);

    useEffect(() => {
        void loadDepositos();
    }, [loadDepositos, dataRevision, dataRevisionEmpresa]);

    /** Nova entrada: único depósito disponível → pré-seleciona. */
    useEffect(() => {
        if (isEdit || loading || form.deposito_id) return;
        if (totalDepositosSelecionaveis !== 1) return;
        const unico = depositosPorFilial.flatMap((g) => g.itens)[0];
        if (!unico) return;
        setForm((p) => ({ ...p, deposito_id: unico.id }));
    }, [isEdit, loading, depositosPorFilial, totalDepositosSelecionaveis, form.deposito_id]);

    const totalCentavos = useMemo(() => {
        return itens.reduce((acc, item) => {
            const qtd = Number(item.quantidade) || 0;
            const valor = Math.round((Number(item.valor_unitario) || 0) * 100);
            return acc + Math.round(qtd * valor);
        }, 0);
    }, [itens]);

    const adicionarLinha = () => {
        setItens((prev) => [...prev, { id: crypto.randomUUID(), produto_id: '', quantidade: '1', valor_unitario: '0.00' }]);
    };

    const removerLinha = (id: string) => {
        if (cadastroRapidoLinhaId === id) fecharCadastroRapido();
        setItens((prev) => prev.filter((i) => i.id !== id));
    };

    const atualizarLinha = (id: string, patch: Partial<EntradaItem>) => {
        setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    };

    const criarNovoProduto = async (linhaId: string) => {
        if (!empresaIdOperacao) return;
        if (!novoItem.nome.trim() || !novoItem.categoria.trim()) {
            showToast('Preencha nome e categoria do novo item.', 'warning');
            return;
        }

        const codigo = await gerarCodigoProdutoInterno(empresaIdOperacao);

        const { data, error } = await supabase
            .from('ser_produtos')
            .insert({
                empresa_id: empresaIdOperacao,
                codigo,
                nome: novoItem.nome.trim(),
                categoria: novoItem.categoria.trim(),
                preco_centavos: Math.round((Number(novoItem.preco) || 0) * 100),
                valor_custo_centavos: Math.round((Number(novoItem.custo) || 0) * 100),
                estoque_atual: 0,
                estoque_minimo: Math.max(0, Number(novoItem.estoque_minimo) || 0),
                ativo: true,
            })
            .select('id, codigo, nome, categoria, codigo_barras, marca, estoque_minimo, preco_centavos, valor_custo_centavos')
            .single();

        if (error || !data) {
            showToast(`Erro ao criar item: ${error?.message || 'falha desconhecida'}`, 'error');
            return;
        }

        const produtoNovo = data as Produto;
        setProdutos((prev) => [...prev, produtoNovo].sort((a, b) => a.nome.localeCompare(b.nome)));
        atualizarLinha(linhaId, {
            produto_id: produtoNovo.id,
            valor_unitario: (produtoNovo.valor_custo_centavos / 100).toFixed(2),
        });
        fecharCadastroRapido();
        showToast('Item cadastrado e selecionado na linha.', 'success');
    };

    const salvar = async () => {
        if (!empresaIdOperacao) return;
        const itensValidos = itens.filter((i) => i.produto_id && (Number(i.quantidade) || 0) > 0);
        if (!form.numero_documento.trim()) {
            showToast('Informe o documento da entrada.', 'warning');
            return;
        }
        if (itensValidos.length === 0) {
            showToast('Adicione ao menos um item válido na entrada.', 'warning');
            return;
        }
        if (!form.deposito_id) {
            showToast('Selecione a unidade e o depósito de destino (ex.: Aparecida — Depósito Geral).', 'warning');
            return;
        }
        const depSel = depositos.find((d) => d.id === form.deposito_id);
        if (!depSel?.filial_id) {
            showToast('Este depósito precisa estar vinculado a uma filial em Filiais e depósitos.', 'warning');
            return;
        }
        const empresaSalvar = empresaIdEfetivo || empresaIdOperacao;
        setSaving(true);

        const payload = {
            empresa_id: empresaSalvar,
            numero_documento: form.numero_documento.trim(),
            fornecedor_nome: form.fornecedor_nome.trim() || null,
            deposito_id: form.deposito_id,
            data_entrada: form.data_entrada,
            status: form.status,
            observacoes: form.observacoes.trim() || null,
            valor_total_centavos: totalCentavos,
            updated_at: new Date().toISOString(),
        };

        let id = entradaId;
        if (isEdit && entradaId) {
            const { error } = await supabase.from('estoque_entradas').update(payload).eq('id', entradaId);
            if (error) {
                showToast(`Erro ao atualizar entrada: ${error.message}`, 'error');
                setSaving(false);
                return;
            }
            await supabase.from('estoque_entrada_itens').delete().eq('entrada_id', entradaId);
        } else {
            const { data, error } = await supabase
                .from('estoque_entradas')
                .insert(payload)
                .select('id')
                .single();
            if (error || !data) {
                showToast(`Erro ao salvar entrada: ${error?.message || 'falha desconhecida'}`, 'error');
                setSaving(false);
                return;
            }
            id = data.id as string;
        }

        const itensInsert = itensValidos.map((i) => {
            const qtd = Number(i.quantidade) || 0;
            const valorCent = Math.round((Number(i.valor_unitario) || 0) * 100);
            return {
                entrada_id: id,
                produto_id: i.produto_id,
                quantidade: qtd,
                valor_unitario_centavos: valorCent,
                subtotal_centavos: Math.round(qtd * valorCent),
            };
        });

        const { error: itensError } = await supabase.from('estoque_entrada_itens').insert(itensInsert);
        if (itensError) {
            showToast(`Erro ao salvar itens da entrada: ${itensError.message}`, 'error');
            setSaving(false);
            return;
        }

        if (form.status === 'confirmada' && !processadoEm) {
            const { error: rpcError } = await supabase.rpc('fn_confirmar_entrada_estoque', {
                p_entrada_id: id,
            });
            if (rpcError) {
                showToast(`Erro ao confirmar estoque: ${rpcError.message}`, 'error');
                setSaving(false);
                return;
            }
        }

        showToast('Entrada salva com sucesso.', 'success');
        setSaving(false);
        navigate('/estoque/entradas');
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={isEdit ? 'Editar Entrada' : 'Nova Entrada'}
                subtitle="Registro de entrada de materiais no estoque"
                actionButton={
                    <Button variant="outline" onClick={() => navigate('/estoque/entradas')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                }
            />

            <Card className="p-6 space-y-4">
                {processadoEm && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Entrada já processada em estoque em {new Date(processadoEm).toLocaleString('pt-BR')}. Ajustes de itens não devem alterar saldo novamente.
                    </div>
                )}
                <p className="text-xs text-slate-600">
                    Escolha em qual <strong>unidade</strong> o estoque vai entrar (Catalão, Aparecida de Goiânia, Ipameri…).
                    O saldo será creditado no depósito selecionado.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        label="Documento"
                        placeholder="ENT-2026-001"
                        value={form.numero_documento}
                        onChange={(e) => setForm((p) => ({ ...p, numero_documento: e.target.value }))}
                    />
                    <Input
                        label="Fornecedor"
                        placeholder="Central de Urnas"
                        value={form.fornecedor_nome}
                        list="fornecedores-cadastrados"
                        onChange={(e) => setForm((p) => ({ ...p, fornecedor_nome: e.target.value }))}
                    />
                    <datalist id="fornecedores-cadastrados">
                        {fornecedores.map((f) => (
                            <option key={f.id} value={f.nome}>
                                {f.cnpj_cpf ? `${f.nome} - ${f.cnpj_cpf}` : f.nome}
                            </option>
                        ))}
                    </datalist>
                    <Input
                        label="Data de entrada"
                        type="date"
                        value={form.data_entrada}
                        onChange={(e) => setForm((p) => ({ ...p, data_entrada: e.target.value }))}
                    />
                    <Select
                        label="Unidade e depósito de destino *"
                        value={form.deposito_id}
                        onChange={(e) => setForm((p) => ({ ...p, deposito_id: e.target.value }))}
                        required
                        className="md:col-span-2"
                    >
                        <option value="">Selecione unidade e depósito…</option>
                        {depositosPorFilial.map((grupo) => (
                            <optgroup key={grupo.filialId} label={grupo.filialNome}>
                                {grupo.itens.length === 0 ? (
                                    <option value="" disabled>
                                        — cadastre um depósito nesta unidade
                                    </option>
                                ) : (
                                    grupo.itens.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {rotuloDepositoUnidade(d)}
                                        </option>
                                    ))
                                )}
                            </optgroup>
                        ))}
                    </Select>
                    {totalDepositosSelecionaveis === 0 && !loading && (
                        <p className="text-xs text-amber-700 md:col-span-2">
                            {filiais.length > 0
                                ? 'As unidades estão cadastradas, mas falta vincular um depósito a cada uma em '
                                : 'Cadastre as unidades e depósitos em '}
                            <button
                                type="button"
                                className="font-semibold underline"
                                onClick={() => navigate('/estoque/filiais-depositos')}
                            >
                                Filiais e depósitos
                            </button>
                            .
                        </p>
                    )}
                    <Input label="Valor total" value={`R$ ${(totalCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} readOnly />
                </div>
                {fornecedores.length > 0 && (
                    <p className="text-xs text-gray-500 -mt-2">
                        Digite para pesquisar fornecedor cadastrado ou selecione da lista.
                    </p>
                )}
                <Select label="Situação" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                    <option value="pendente">Pendente</option>
                    <option value="confirmada">Confirmada</option>
                </Select>

                <Card className="p-4 border-dashed">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">Itens da Entrada</h4>
                        <Button type="button" variant="outline" onClick={adicionarLinha}>
                            <Plus className="h-4 w-4 mr-1" /> Adicionar item
                        </Button>
                    </div>
                    <div className="space-y-3">
                        {itens.map((item) => (
                            <div key={item.id} className="space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                                <div className="md:col-span-6">
                                    <ProdutoEstoqueSelect
                                        produtos={produtos}
                                        value={item.produto_id}
                                        onChange={(produtoId) => {
                                            if (produtoId && cadastroRapidoLinhaId === item.id) {
                                                fecharCadastroRapido();
                                            }
                                            const prod = produtos.find((p) => p.id === produtoId);
                                            atualizarLinha(item.id, {
                                                produto_id: produtoId,
                                                valor_unitario: prod
                                                    ? (prod.valor_custo_centavos / 100).toFixed(2)
                                                    : item.valor_unitario,
                                            });
                                        }}
                                        onCadastrarNovo={(termo) => abrirCadastroRapido(item.id, termo)}
                                        helperText="Se não achar o item na busca, use + Cadastrar item."
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <Input
                                        label="Quantidade"
                                        type="number"
                                        min="0.001"
                                        step="0.001"
                                        value={item.quantidade}
                                        onChange={(e) => atualizarLinha(item.id, { quantidade: e.target.value })}
                                    />
                                </div>
                                <div className="md:col-span-3">
                                    <Input
                                        label="Valor unitário (R$)"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.valor_unitario}
                                        onChange={(e) => atualizarLinha(item.id, { valor_unitario: e.target.value })}
                                    />
                                    {(() => {
                                        const prod = produtos.find(p => p.id === item.produto_id);
                                        const valorNovo = Math.round((Number(item.valor_unitario) || 0) * 100);
                                        if (prod && valorNovo > prod.valor_custo_centavos) {
                                            return (
                                                <div className="text-[10px] text-amber-600 font-medium mt-1">
                                                    ⚠️ Reajuste: Custo atual R$ {(prod.valor_custo_centavos / 100).toFixed(2)}
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                                <div className="md:col-span-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => removerLinha(item.id)}
                                        disabled={itens.length === 1}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                                {cadastroRapidoLinhaId === item.id && (
                                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div>
                                                <h5 className="text-sm font-semibold text-gray-900">Cadastrar novo item</h5>
                                                <p className="text-xs text-gray-500">Código interno gerado automaticamente.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={fecharCadastroRapido}
                                                className="p-1 rounded-lg text-gray-500 hover:bg-white/80"
                                                aria-label="Fechar cadastro"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                                            <Input label="Nome do item" value={novoItem.nome} onChange={(e) => setNovoItem((p) => ({ ...p, nome: e.target.value }))} />
                                            <Select
                                                label="Categoria"
                                                value={novoItem.categoria}
                                                onChange={(e) => setNovoItem((p) => ({ ...p, categoria: e.target.value }))}
                                            >
                                                <option value="">Selecione</option>
                                                {CATEGORIAS_PRODUTO_ESTOQUE.map((c) => (
                                                    <option key={c.value} value={c.value}>{c.label}</option>
                                                ))}
                                            </Select>
                                            <Input label="Preço venda (R$)" type="number" step="0.01" value={novoItem.preco} onChange={(e) => setNovoItem((p) => ({ ...p, preco: e.target.value }))} />
                                            <Input label="Preço custo (R$)" type="number" step="0.01" value={novoItem.custo} onChange={(e) => setNovoItem((p) => ({ ...p, custo: e.target.value }))} />
                                            <Input label="Estoque mínimo" type="number" min="0" value={novoItem.estoque_minimo} onChange={(e) => setNovoItem((p) => ({ ...p, estoque_minimo: e.target.value }))} />
                                        </div>
                                        <div className="flex justify-end mt-3">
                                            <Button type="button" onClick={() => void criarNovoProduto(item.id)}>
                                                <Plus className="h-4 w-4 mr-1" />
                                                Salvar e usar na linha
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>

                <Textarea
                    label="Observações"
                    placeholder="Detalhes da entrada..."
                    value={form.observacoes}
                    onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => navigate('/estoque/entradas')}>Cancelar</Button>
                    <Button onClick={salvar} loading={saving || loading}>
                        <Save className="h-4 w-4 mr-2" />
                        Salvar Entrada
                    </Button>
                </div>
            </Card>
        </div>
    );
};

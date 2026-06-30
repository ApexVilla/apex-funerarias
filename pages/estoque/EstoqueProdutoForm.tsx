import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Components';
import { BarcodeScanner } from '../../components/common/BarcodeScanner';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { gerarCodigoProdutoInterno } from '../../lib/gerarCodigoProdutoInterno';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useAuth } from '../../lib/AuthContext';
import { CATEGORIAS_PRODUTO_ESTOQUE } from '../../lib/categoriasProdutoEstoque';

type ProdutoEstoque = {
    id: string;
    codigo: string;
    nome: string;
    categoria?: string;
    preco_centavos: number;
    valor_custo_centavos: number;
    estoque_atual: number;
    estoque_minimo: number;
    observacoes?: string;
    empresa_id: string;
    ativo: boolean;
    filial_id?: string | null;
    deposito_id?: string | null;
    created_at?: string;
    updated_at?: string;
};

type FilialOpt = { id: string; nome: string };
type DepositoOpt = { id: string; nome: string; filial_id: string | null };

export const EstoqueProdutoForm: React.FC = () => {
    const navigate = useNavigate();
    const { produtoId } = useParams();
    const { showToast } = useToast();
    const { user } = useAuth();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const isEdit = Boolean(produtoId);
    const [loading, setLoading] = useState(false);
    const [filiais, setFiliais] = useState<FilialOpt[]>([]);
    const [depositos, setDepositos] = useState<DepositoOpt[]>([]);
    const [filialId, setFilialId] = useState('');
    const [depositoId, setDepositoId] = useState('');
    const [codigo, setCodigo] = useState('');
    /** Somente leitura na edição — saldo altera só por entrada/saída. */
    const [saldoAtualLeitura, setSaldoAtualLeitura] = useState<number | null>(null);
    const [form, setForm] = useState({
        nome: '',
        marca: '',
        categoria: '',
        codigo_barras: '',
        preco: '0.00',
        custo: '0.00',
        minimo: '0',
        observacoes: '',
    });

    const depositosFiltrados = useMemo(() => {
        if (!filialId) return depositos;
        return depositos.filter((d) => !d.filial_id || d.filial_id === filialId);
    }, [depositos, filialId]);

    useEffect(() => {
        if (!depositoId) return;
        if (!depositosFiltrados.some((d) => d.id === depositoId)) {
            setDepositoId('');
        }
    }, [depositoId, depositosFiltrados]);

    useEffect(() => {
        if (!empresaIdOperacao) return;
        const loadMeta = async () => {
            const empresaIds = empresaIdsFiltro;
            const [fr, dr] = await Promise.all([
                supabase.from('filiais').select('id, nome').in('empresa_id', empresaIds).eq('ativo', true).order('nome'),
                supabase.from('estoque_depositos').select('id, nome, filial_id').in('empresa_id', empresaIds).eq('ativo', true).order('nome'),
            ]);
            if (!fr.error && fr.data) setFiliais(fr.data as FilialOpt[]);
            if (!dr.error && dr.data) setDepositos(dr.data as DepositoOpt[]);
        };
        void loadMeta();
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa]);

    useEffect(() => {
        if (!empresaIdOperacao) return;

        const loadData = async () => {
            if (!isEdit) {
                setCodigo('');
                setFilialId('');
                setDepositoId('');
                setSaldoAtualLeitura(null);
                return;
            }

            if (!produtoId) return;
            const { data, error } = await supabase
                .from('ser_produtos')
                .select('*')
                .eq('id', produtoId)
                .single();
            if (error || !data) {
                showToast('Produto não encontrado.', 'warning');
                navigate('/estoque/produtos');
                return;
            }
            const produto = data as ProdutoEstoque;
            setCodigo(produto.codigo);
            setFilialId(produto.filial_id || '');
            setDepositoId(produto.deposito_id || '');
            setSaldoAtualLeitura(Number(produto.estoque_atual ?? 0));
            setForm({
                nome: produto.nome,
                marca: (data as any).marca || '',
                categoria: produto.categoria || '',
                codigo_barras: (data as any).codigo_barras || '',
                preco: (produto.preco_centavos / 100).toFixed(2),
                custo: (produto.valor_custo_centavos / 100).toFixed(2),
                minimo: String(produto.estoque_minimo ?? 0),
                observacoes: produto.observacoes || '',
            });
        };

        void loadData();
    }, [isEdit, produtoId, empresaIdOperacao, navigate, showToast, dataRevisionEmpresa]);

    const handleSave = async () => {
        if (!empresaIdOperacao) {
            showToast('Empresa não identificada. Faça login novamente.', 'error');
            return;
        }

        if (!form.nome.trim()) {
            showToast('Informe o nome do produto.', 'warning');
            return;
        }
        if (!form.categoria.trim()) {
            showToast('Selecione a categoria.', 'warning');
            return;
        }
        if ((Number(form.preco) || 0) < 0) {
            showToast('Preço inválido.', 'warning');
            return;
        }

        setLoading(true);
        if (isEdit && produtoId) {
            const { error } = await supabase
                .from('ser_produtos')
                .update({
                    nome: form.nome.trim(),
                    marca: form.marca.trim() || null,
                    categoria: form.categoria,
                    codigo_barras: form.codigo_barras.trim() || null,
                    preco_centavos: Math.round((Number(form.preco) || 0) * 100),
                    valor_custo_centavos: Math.round((Number(form.custo) || 0) * 100),
                    estoque_minimo: Math.max(0, Number(form.minimo) || 0),
                    observacoes: form.observacoes.trim() || null,
                    filial_id: filialId || null,
                    deposito_id: depositoId || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', produtoId);
            if (error) {
                showToast(`Erro ao atualizar produto: ${error.message}`, 'error');
                setLoading(false);
                return;
            }
            showToast('Produto atualizado com sucesso.', 'success');
            navigate('/estoque/produtos');
            setLoading(false);
            return;
        }

        const rowBase = {
            empresa_id: empresaIdOperacao,
            nome: form.nome.trim(),
            marca: form.marca.trim() || null,
            categoria: form.categoria,
            codigo_barras: form.codigo_barras.trim() || null,
            preco_centavos: Math.round((Number(form.preco) || 0) * 100),
            valor_custo_centavos: Math.round((Number(form.custo) || 0) * 100),
            estoque_atual: 0,
            estoque_minimo: Math.max(0, Number(form.minimo) || 0),
            observacoes: form.observacoes.trim() || null,
            filial_id: filialId || null,
            deposito_id: depositoId || null,
            ativo: true,
        };

        let ultimoErro: { code?: string; message?: string } | null = null;
        for (let attempt = 0; attempt < 8; attempt++) {
            const codigoLimpo = await gerarCodigoProdutoInterno(empresaIdOperacao);
            const { error } = await supabase.from('ser_produtos').insert({
                ...rowBase,
                codigo: codigoLimpo,
            });
            if (!error) {
                showToast(`Produto criado com código ${codigoLimpo}.`, 'success');
                navigate('/estoque/produtos');
                setLoading(false);
                return;
            }
            ultimoErro = error;
            const isCodigoDuplicado =
                error.code === '23505' && (error.message || '').toLowerCase().includes('codigo');
            if (!isCodigoDuplicado) break;
        }

        if (ultimoErro?.code === '23505' && (ultimoErro.message || '').toLowerCase().includes('codigo')) {
            showToast('Não foi possível gerar um código único. Tente salvar novamente.', 'error');
        } else {
            showToast(`Erro ao criar produto: ${ultimoErro?.message || 'falha desconhecida'}`, 'error');
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={isEdit ? 'Editar Produto' : 'Novo Produto'}
                subtitle="Cadastro de item para controle de estoque"
                actionButton={
                    <Button variant="outline" onClick={() => navigate('/estoque/produtos')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                }
            />

            <Card className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isEdit && (
                        <Input label="Código interno" value={codigo} readOnly className="bg-gray-50" />
                    )}
                    <Input
                        label="Nome do produto"
                        placeholder="Urna Standard"
                        value={form.nome}
                        onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                    />
                    <Input
                        label="Marca"
                        placeholder="Ex: Funebra, Nacional, etc."
                        value={form.marca}
                        onChange={(e) => setForm((prev) => ({ ...prev, marca: e.target.value }))}
                    />
                    <Select
                        label="Categoria"
                        value={form.categoria}
                        onChange={(e) => setForm((prev) => ({ ...prev, categoria: e.target.value }))}
                    >
                        <option value="" disabled>Selecione</option>
                        {CATEGORIAS_PRODUTO_ESTOQUE.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                    </Select>
                    <Select
                        label="Filial (opcional)"
                        value={filialId}
                        onChange={(e) => setFilialId(e.target.value)}
                    >
                        <option value="">Nenhuma / geral</option>
                        {filiais.map((f) => (
                            <option key={f.id} value={f.id}>{f.nome}</option>
                        ))}
                    </Select>
                    <Select
                        label="Depósito (opcional)"
                        value={depositoId}
                        onChange={(e) => setDepositoId(e.target.value)}
                    >
                        <option value="">Nenhum</option>
                        {depositosFiltrados.map((d) => (
                            <option key={d.id} value={d.id}>{d.nome}</option>
                        ))}
                    </Select>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Código de Barras / EAN</label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Escaneie ou digite o código de barras..."
                                value={form.codigo_barras}
                                onChange={(e) => setForm((prev) => ({ ...prev, codigo_barras: e.target.value }))}
                                className="flex-1"
                            />
                            <BarcodeScanner
                                label="Ler Código"
                                onScan={(code) => setForm((prev) => ({ ...prev, codigo_barras: code }))}
                            />
                        </div>
                    </div>
                    <Input
                        label="Preço de Venda (R$)"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.preco}
                        onChange={(e) => setForm((prev) => ({ ...prev, preco: e.target.value }))}
                    />
                    <Input
                        label="Preço de Custo (R$)"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.custo}
                        onChange={(e) => setForm((prev) => ({ ...prev, custo: e.target.value }))}
                    />
                    {isEdit ? (
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-gray-700">Saldo em estoque</label>
                            <Input
                                type="number"
                                value={String(saldoAtualLeitura ?? 0)}
                                readOnly
                                className="bg-gray-50 text-gray-800 font-semibold"
                            />
                            <p className="text-xs text-gray-500 leading-snug">
                                A quantidade não pode ser alterada aqui. Use{' '}
                                <Link to="/estoque/entradas/nova" className="text-blue-600 hover:underline font-medium">
                                    Entrada
                                </Link>{' '}
                                ou{' '}
                                <Link to="/estoque/saidas/nova" className="text-blue-600 hover:underline font-medium">
                                    Saída
                                </Link>{' '}
                                de estoque para ajustar o saldo.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 md:col-span-2">
                            <p className="text-sm font-medium text-blue-900">Saldo inicial: zero</p>
                            <p className="text-xs text-blue-700 mt-1 leading-snug">
                                Após salvar o produto, registre a quantidade em{' '}
                                <Link to="/estoque/entradas/nova" className="font-semibold underline hover:text-blue-900">
                                    Entrada de estoque
                                </Link>
                                .
                            </p>
                        </div>
                    )}
                    <Input
                        label="Quantidade mínima"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={form.minimo}
                        onChange={(e) => setForm((prev) => ({ ...prev, minimo: e.target.value }))}
                    />
                </div>
                <Textarea
                    label="Observações"
                    placeholder="Informações complementares do item..."
                    value={form.observacoes}
                    onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                />
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => navigate('/estoque/produtos')}>Cancelar</Button>
                    <Button onClick={handleSave} loading={loading}>
                        <Save className="h-4 w-4 mr-2" />
                        Salvar Produto
                    </Button>
                </div>
            </Card>
        </div>
    );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Save, ClipboardCheck, Search, CheckCircle2,
    AlertTriangle, XCircle, Package, Filter, Printer,
    ChevronDown, ChevronRight, Lock, Unlock, RotateCcw,
    FileSpreadsheet, Check, ScanBarcode,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { BarcodeScanner } from '../../components/common/BarcodeScanner';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { VALORES_CATEGORIAS_PRODUTO_ESTOQUE } from '../../lib/categoriasProdutoEstoque';

interface ProdutoEstoque {
    id: string;
    codigo: string;
    nome: string;
    marca?: string;
    categoria?: string;
    codigo_barras?: string;
    estoque_atual: number;
    estoque_minimo: number;
    ativo: boolean;
}

interface ItemContagem {
    id?: string;
    contagem_id?: string;
    produto_id: string;
    produto_codigo: string;
    produto_nome: string;
    produto_codigo_barras?: string;
    categoria: string;
    estoque_sistema: number;
    quantidade_contada: number | null;
    divergencia: number;
    observacao: string;
    contado: boolean;
}

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
}

type TipoContagem = 'geral' | 'categoria' | 'produto';

export const EstoqueContagemForm: React.FC = () => {
    const navigate = useNavigate();
    const { contagemId } = useParams();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const isEdit = Boolean(contagemId);

    const [step, setStep] = useState<'config' | 'contagem' | 'resultado'>(isEdit ? 'contagem' : 'config');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Config
    const [titulo, setTitulo] = useState('');
    const [tipo, setTipo] = useState<TipoContagem>('geral');
    const [categoriaSelecionada, setCategoriaSelecionada] = useState('');
    const [produtosSelecionados, setProdutosSelecionados] = useState<string[]>([]);
    const [observacoes, setObservacoes] = useState('');

    // Dados
    const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
    const [itens, setItens] = useState<ItemContagem[]>([]);
    const [contagem, setContagem] = useState<Contagem | null>(null);

    // Contagem UI
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyPending, setShowOnlyPending] = useState(false);
    const [showOnlyDivergent, setShowOnlyDivergent] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [scannerValue, setScannerValue] = useState('');
    const [scannerFeedback, setScannerFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const scannerRef = useRef<HTMLInputElement>(null);

    const categorias = useMemo(() => {
        const cats = new Set(produtos.filter(p => p.ativo).map(p => p.categoria || 'Sem Categoria'));
        VALORES_CATEGORIAS_PRODUTO_ESTOQUE.forEach((c) => cats.add(c));
        return Array.from(cats).sort();
    }, [produtos]);

    const loadProdutos = useCallback(async () => {
        if (!empresaIdOperacao) return;
        const empresaIds = empresaIdsFiltro;
        const { data, error } = await supabase
            .from('ser_produtos')
            .select('id, codigo, nome, marca, categoria, codigo_barras, estoque_atual, estoque_minimo, ativo')
            .in('empresa_id', empresaIds)
            .eq('ativo', true)
            .order('codigo', { ascending: true });
        if (error) {
            console.error('[Contagem] Erro carregando produtos:', error);
            return;
        }
        setProdutos((data ?? []) as ProdutoEstoque[]);
    }, [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa]);

    const loadContagem = useCallback(async () => {
        if (!contagemId || !empresaIdOperacao) return;
        setLoading(true);
        try {
            const { data: contagemData, error: contagemErr } = await supabase
                .from('estoque_contagens')
                .select('*')
                .eq('id', contagemId)
                .single();
            if (contagemErr) throw contagemErr;
            const c = contagemData as Contagem;
            setContagem(c);
            setTitulo(c.titulo);
            setTipo(c.tipo === 'item' ? 'produto' : c.tipo as TipoContagem);
            setCategoriaSelecionada(c.filtro_categoria || '');
            setObservacoes(c.observacoes || '');

            if (c.status === 'finalizada') {
                setStep('resultado');
            } else {
                setStep('contagem');
            }

            const { data: itensData, error: itensErr } = await supabase
                .from('estoque_contagem_itens')
                .select('*')
                .eq('contagem_id', contagemId)
                .order('produto_codigo', { ascending: true });
            if (itensErr) throw itensErr;

            setItens((itensData ?? []).map((item: any) => ({
                id: item.id,
                contagem_id: item.contagem_id,
                produto_id: item.produto_id,
                produto_codigo: item.produto_codigo,
                produto_nome: item.produto_nome,
                categoria: item.categoria || 'Sem Categoria',
                estoque_sistema: item.estoque_sistema,
                quantidade_contada: item.quantidade_contada,
                divergencia: item.divergencia ?? 0,
                observacao: item.observacao || '',
                contado: item.contado ?? false,
            })));

            const allCats = new Set((itensData ?? []).map((i: any) => i.categoria || 'Sem Categoria'));
            setExpandedCategories(allCats);
        } catch (err: any) {
            showToast(`Erro ao carregar contagem: ${err.message}`, 'error');
            navigate('/estoque/contagens');
        } finally {
            setLoading(false);
        }
    }, [contagemId, empresaIdOperacao, navigate, showToast, dataRevisionEmpresa]);

    useEffect(() => {
        loadProdutos();
    }, [loadProdutos]);

    useEffect(() => {
        if (isEdit) loadContagem();
    }, [isEdit, loadContagem]);

    const gerarItensContagem = useCallback(() => {
        let produtosFiltrados = produtos.filter(p => p.ativo);

        if (tipo === 'categoria' && categoriaSelecionada) {
            produtosFiltrados = produtosFiltrados.filter(
                p => (p.categoria || 'Sem Categoria') === categoriaSelecionada
            );
        } else if (tipo === 'produto' && produtosSelecionados.length > 0) {
            produtosFiltrados = produtosFiltrados.filter(p => produtosSelecionados.includes(p.id));
        }

        const novosItens: ItemContagem[] = produtosFiltrados.map(p => ({
            produto_id: p.id,
            produto_codigo: p.codigo,
            produto_nome: p.nome,
            produto_codigo_barras: p.codigo_barras || '',
            categoria: p.categoria || 'Sem Categoria',
            estoque_sistema: p.estoque_atual,
            quantidade_contada: null,
            divergencia: 0,
            observacao: '',
            contado: false,
        }));

        setItens(novosItens);
        const allCats = new Set(novosItens.map(i => i.categoria));
        setExpandedCategories(allCats);
    }, [produtos, tipo, categoriaSelecionada, produtosSelecionados]);

    const handleIniciarContagem = async () => {
        if (!titulo.trim()) {
            showToast('Informe o título da contagem.', 'warning');
            return;
        }
        if (tipo === 'categoria' && !categoriaSelecionada) {
            showToast('Selecione uma categoria.', 'warning');
            return;
        }
        if (tipo === 'produto' && produtosSelecionados.length === 0) {
            showToast('Selecione pelo menos um produto.', 'warning');
            return;
        }
        if (!empresaIdOperacao) {
            showToast('Empresa não identificada. Faça login novamente.', 'error');
            return;
        }

        gerarItensContagem();
        setSaving(true);

        try {
            let produtosFiltrados = produtos.filter(p => p.ativo);
            if (tipo === 'categoria' && categoriaSelecionada) {
                produtosFiltrados = produtosFiltrados.filter(
                    p => (p.categoria || 'Sem Categoria') === categoriaSelecionada
                );
            } else if (tipo === 'produto' && produtosSelecionados.length > 0) {
                produtosFiltrados = produtosFiltrados.filter(p => produtosSelecionados.includes(p.id));
            }

            const codigo = `CTG-${Date.now().toString().slice(-6)}`;

            const { data: contagemData, error: contagemErr } = await supabase
                .from('estoque_contagens')
                .insert({
                    empresa_id: empresaIdOperacao,
                    codigo,
                    tipo,
                    status: 'em_andamento',
                    titulo: titulo.trim(),
                    observacoes: observacoes.trim() || null,
                    filtro_categoria: tipo === 'categoria' ? categoriaSelecionada : null,
                    total_itens: produtosFiltrados.length,
                    itens_contados: 0,
                    divergencias: 0,
                    criado_por: user?.id || null,
                })
                .select()
                .single();

            if (contagemErr) throw contagemErr;
            const novaContagem = contagemData as Contagem;
            setContagem(novaContagem);

            const itensParaInserir = produtosFiltrados.map(p => ({
                contagem_id: novaContagem.id,
                produto_id: p.id,
                produto_codigo: p.codigo,
                produto_nome: p.nome,
                categoria: p.categoria || 'Sem Categoria',
                estoque_sistema: p.estoque_atual,
                quantidade_contada: null,
                divergencia: 0,
                observacao: '',
                contado: false,
            }));

            const { data: itensInseridos, error: itensErr } = await supabase
                .from('estoque_contagem_itens')
                .insert(itensParaInserir)
                .select();

            if (itensErr) throw itensErr;

            setItens((itensInseridos ?? []).map((item: any) => ({
                id: item.id,
                contagem_id: item.contagem_id,
                produto_id: item.produto_id,
                produto_codigo: item.produto_codigo,
                produto_nome: item.produto_nome,
                categoria: item.categoria || 'Sem Categoria',
                estoque_sistema: item.estoque_sistema,
                quantidade_contada: item.quantidade_contada,
                divergencia: item.divergencia ?? 0,
                observacao: item.observacao || '',
                contado: item.contado ?? false,
            })));

            setStep('contagem');
            showToast('Contagem iniciada com sucesso!', 'success');
        } catch (err: any) {
            showToast(`Erro ao criar contagem: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateItem = (index: number, field: 'quantidade_contada' | 'observacao', value: any) => {
        setItens(prev => {
            const updated = [...prev];
            const item = { ...updated[index] };

            if (field === 'quantidade_contada') {
                const qtd = value === '' || value === null ? null : parseInt(value, 10);
                item.quantidade_contada = isNaN(qtd as number) ? null : qtd;
                item.contado = item.quantidade_contada !== null;
                item.divergencia = item.contado ? (item.quantidade_contada! - item.estoque_sistema) : 0;
            } else {
                item.observacao = value;
            }

            updated[index] = item;
            return updated;
        });
    };

    const handleSalvarProgresso = async () => {
        if (!contagem) return;
        setSaving(true);
        try {
            for (const item of itens) {
                if (!item.id) continue;
                await supabase
                    .from('estoque_contagem_itens')
                    .update({
                        quantidade_contada: item.quantidade_contada,
                        divergencia: item.divergencia,
                        observacao: item.observacao,
                        contado: item.contado,
                    })
                    .eq('id', item.id);
            }

            const contados = itens.filter(i => i.contado).length;
            const divs = itens.filter(i => i.contado && i.divergencia !== 0).length;

            await supabase
                .from('estoque_contagens')
                .update({
                    itens_contados: contados,
                    divergencias: divs,
                    status: 'em_andamento',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', contagem.id);

            showToast('Progresso salvo!', 'success');
        } catch (err: any) {
            showToast(`Erro ao salvar: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleFinalizarContagem = async () => {
        if (!contagem) return;
        const naoContados = itens.filter(i => !i.contado).length;
        if (naoContados > 0) {
            if (!confirm(`Ainda há ${naoContados} item(ns) não contado(s). Deseja finalizar mesmo assim?`)) {
                return;
            }
        }

        setSaving(true);
        try {
            for (const item of itens) {
                if (!item.id) continue;
                await supabase
                    .from('estoque_contagem_itens')
                    .update({
                        quantidade_contada: item.quantidade_contada,
                        divergencia: item.divergencia,
                        observacao: item.observacao,
                        contado: item.contado,
                    })
                    .eq('id', item.id);
            }

            const contados = itens.filter(i => i.contado).length;
            const divs = itens.filter(i => i.contado && i.divergencia !== 0).length;

            await supabase
                .from('estoque_contagens')
                .update({
                    status: 'finalizada',
                    itens_contados: contados,
                    divergencias: divs,
                    finalizado_em: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', contagem.id);

            setStep('resultado');
            showToast('Contagem finalizada com sucesso!', 'success');
        } catch (err: any) {
            showToast(`Erro ao finalizar: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleAplicarAjustes = async () => {
        if (!contagem) return;
        const divergentes = itens.filter(i => i.contado && i.divergencia !== 0);
        if (divergentes.length === 0) {
            showToast('Nenhuma divergência para ajustar.', 'info');
            return;
        }

        if (!confirm(`Aplicar ${divergentes.length} ajuste(s) no estoque? Esta ação irá atualizar o saldo dos produtos.`)) {
            return;
        }

        setSaving(true);
        try {
            for (const item of divergentes) {
                const { error: updateErr } = await supabase
                    .from('ser_produtos')
                    .update({
                        estoque_atual: item.quantidade_contada!,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', item.produto_id);

                if (updateErr) throw updateErr;

                await supabase.from('estoque_movimentacoes').insert({
                    empresa_id: contagem.empresa_id,
                    produto_id: item.produto_id,
                    tipo: 'ajuste',
                    quantidade: Math.abs(item.divergencia),
                    estoque_anterior: item.estoque_sistema,
                    estoque_posterior: item.quantidade_contada!,
                    motivo: `Ajuste por contagem ${contagem.codigo} — ${contagem.titulo}`,
                    referencia_tipo: 'contagem',
                    referencia_id: contagem.id,
                    usuario_id: user?.id || null,
                });
            }

            showToast(`${divergentes.length} ajuste(s) aplicado(s) com sucesso!`, 'success');
            navigate('/estoque/contagens');
        } catch (err: any) {
            showToast(`Erro ao aplicar ajustes: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleExportCSV = () => {
        const lines = [
            'Código;Produto;Categoria;Estoque Sistema;Contagem;Divergência;Observação',
        ];
        itens.forEach(item => {
            lines.push([
                item.produto_codigo,
                item.produto_nome,
                item.categoria,
                item.estoque_sistema,
                item.contado ? item.quantidade_contada : '',
                item.contado ? item.divergencia : '',
                item.observacao,
            ].join(';'));
        });
        const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Contagem_${contagem?.codigo || 'nova'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleScan = useCallback((barcode: string) => {
        const code = barcode.trim();
        if (!code) return;

        const idx = itens.findIndex(i =>
            i.produto_codigo_barras === code ||
            i.produto_codigo.toLowerCase() === code.toLowerCase()
        );

        if (idx === -1) {
            setScannerFeedback({ msg: `Produto não encontrado: ${code}`, type: 'error' });
            setTimeout(() => setScannerFeedback(null), 3000);
            setScannerValue('');
            scannerRef.current?.focus();
            return;
        }

        const item = itens[idx];
        setExpandedCategories(prev => new Set([...prev, item.categoria]));
        setSearchTerm('');
        setShowOnlyPending(false);
        setShowOnlyDivergent(false);

        setScannerFeedback({ msg: `${item.produto_nome} encontrado!`, type: 'success' });
        setTimeout(() => setScannerFeedback(null), 3000);
        setScannerValue('');

        setTimeout(() => {
            const input = document.querySelector(`[data-produto-id="${item.produto_id}"]`) as HTMLInputElement;
            if (input) {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                input.focus();
                input.select();
            }
        }, 150);
    }, [itens]);

    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const itensFiltrados = useMemo(() => {
        let filtered = itens;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(i =>
                i.produto_nome.toLowerCase().includes(term) ||
                i.produto_codigo.toLowerCase().includes(term) ||
                (i.produto_codigo_barras || '').toLowerCase().includes(term)
            );
        }
        if (showOnlyPending) filtered = filtered.filter(i => !i.contado);
        if (showOnlyDivergent) filtered = filtered.filter(i => i.contado && i.divergencia !== 0);
        return filtered;
    }, [itens, searchTerm, showOnlyPending, showOnlyDivergent]);

    const itensAgrupados = useMemo(() => {
        const map = new Map<string, ItemContagem[]>();
        itensFiltrados.forEach(item => {
            const cat = item.categoria;
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(item);
        });
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [itensFiltrados]);

    const stats = useMemo(() => {
        const total = itens.length;
        const contados = itens.filter(i => i.contado).length;
        const divergentes = itens.filter(i => i.contado && i.divergencia !== 0).length;
        const positivos = itens.filter(i => i.contado && i.divergencia > 0).length;
        const negativos = itens.filter(i => i.contado && i.divergencia < 0).length;
        return { total, contados, divergentes, positivos, negativos };
    }, [itens]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
        );
    }

    // ==================== STEP: CONFIG ====================
    if (step === 'config') {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Nova Contagem de Estoque"
                    subtitle="Configure os parâmetros da contagem"
                    actionButton={
                        <Button variant="outline" onClick={() => navigate('/estoque/contagens')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Voltar
                        </Button>
                    }
                />

                <Card className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input
                            label="Título da Contagem"
                            placeholder="Ex: Contagem Mensal — Maio 2026"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                        />

                        <Select
                            label="Tipo de Contagem"
                            value={tipo}
                            onChange={(e) => {
                                setTipo(e.target.value as TipoContagem);
                                setCategoriaSelecionada('');
                                setProdutosSelecionados([]);
                            }}
                        >
                            <option value="geral">Geral — Todos os produtos ativos</option>
                            <option value="categoria">Por Categoria — Filtra por categoria</option>
                            <option value="produto">Por Produto — Seleção individual</option>
                        </Select>
                    </div>

                    {tipo === 'categoria' && (
                        <div>
                            <Select
                                label="Categoria"
                                value={categoriaSelecionada}
                                onChange={(e) => setCategoriaSelecionada(e.target.value)}
                            >
                                <option value="">Selecione uma categoria...</option>
                                {categorias.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </Select>
                            {categoriaSelecionada && (
                                <p className="text-xs text-gray-400 mt-2">
                                    {produtos.filter(p => p.ativo && (p.categoria || 'Sem Categoria') === categoriaSelecionada).length} produto(s) nesta categoria
                                </p>
                            )}
                        </div>
                    )}

                    {tipo === 'produto' && (
                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                                Selecione os Produtos ({produtosSelecionados.length} selecionado(s))
                            </label>
                            <div className="max-h-72 overflow-y-auto border rounded-xl p-2 space-y-1 bg-gray-50/50">
                                {produtos.filter(p => p.ativo).map(p => (
                                    <label
                                        key={p.id}
                                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                                            produtosSelecionados.includes(p.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-white border border-transparent'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={produtosSelecionados.includes(p.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setProdutosSelecionados(prev => [...prev, p.id]);
                                                } else {
                                                    setProdutosSelecionados(prev => prev.filter(id => id !== p.id));
                                                }
                                            }}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="font-mono text-xs text-gray-400">{p.codigo}</span>
                                        <span className="text-sm text-gray-900 flex-1">{p.nome}</span>
                                        <span className="text-xs text-gray-400">{p.categoria || '—'}</span>
                                        <span className="text-xs font-medium text-gray-600 tabular-nums">Saldo: {p.estoque_atual}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setProdutosSelecionados(produtos.filter(p => p.ativo).map(p => p.id))}
                                >
                                    Selecionar Todos
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setProdutosSelecionados([])}
                                >
                                    Limpar Seleção
                                </Button>
                            </div>
                        </div>
                    )}

                    <Textarea
                        label="Observações"
                        placeholder="Notas adicionais sobre esta contagem..."
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        rows={3}
                    />

                    <div className="flex items-center justify-between pt-4 border-t">
                        <p className="text-sm text-gray-500">
                            {tipo === 'geral' && `${produtos.filter(p => p.ativo).length} produto(s) serão contados`}
                            {tipo === 'categoria' && categoriaSelecionada && `${produtos.filter(p => p.ativo && (p.categoria || 'Sem Categoria') === categoriaSelecionada).length} produto(s) serão contados`}
                            {tipo === 'produto' && `${produtosSelecionados.length} produto(s) selecionado(s)`}
                        </p>
                        <Button onClick={handleIniciarContagem} loading={saving}>
                            <ClipboardCheck className="h-4 w-4 mr-2" />
                            Iniciar Contagem
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    // ==================== STEP: CONTAGEM ====================
    if (step === 'contagem') {
        const isFinalizada = contagem?.status === 'finalizada';

        return (
            <div className="space-y-6">
                <PageHeader
                    title={titulo || 'Contagem de Estoque'}
                    subtitle={`${contagem?.codigo || ''} — ${stats.contados}/${stats.total} contados`}
                    actionButton={
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate('/estoque/contagens')}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Voltar
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportCSV}>
                                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                                CSV
                            </Button>
                            {!isFinalizada && (
                                <>
                                    <Button variant="outline" size="sm" onClick={handleSalvarProgresso} loading={saving}>
                                        <Save className="h-4 w-4 mr-2" />
                                        Salvar
                                    </Button>
                                    <Button variant="success" size="sm" onClick={handleFinalizarContagem} loading={saving}>
                                        <Lock className="h-4 w-4 mr-2" />
                                        Finalizar
                                    </Button>
                                </>
                            )}
                        </div>
                    }
                />

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Card className="p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase">Total</p>
                        <p className="text-xl font-bold text-gray-900">{stats.total}</p>
                    </Card>
                    <Card className="p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase">Contados</p>
                        <p className="text-xl font-bold text-blue-600">{stats.contados}</p>
                    </Card>
                    <Card className="p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase">Pendentes</p>
                        <p className="text-xl font-bold text-amber-600">{stats.total - stats.contados}</p>
                    </Card>
                    <Card className="p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase">Divergências</p>
                        <p className="text-xl font-bold text-red-600">{stats.divergentes}</p>
                    </Card>
                    <Card className="p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase">Progresso</p>
                        <p className="text-xl font-bold text-green-600">
                            {stats.total > 0 ? Math.round((stats.contados / stats.total) * 100) : 0}%
                        </p>
                    </Card>
                </div>

                {/* Barra de progresso */}
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
                        style={{ width: `${stats.total > 0 ? (stats.contados / stats.total) * 100 : 0}%` }}
                    />
                </div>

                {/* Scanner de código de barras */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg shadow-sm border border-blue-200">
                    <div className="flex items-center gap-3">
                        <ScanBarcode className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        <div className="relative flex-1">
                            <input
                                ref={scannerRef}
                                type="text"
                                className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                placeholder="Escaneie o código de barras aqui..."
                                value={scannerValue}
                                onChange={(e) => setScannerValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleScan(scannerValue);
                                    }
                                }}
                                autoComplete="off"
                            />
                        </div>
                        <BarcodeScanner
                            label="Câmera"
                            onScan={(code) => handleScan(code)}
                        />
                        <span className="text-xs text-blue-600 hidden md:block whitespace-nowrap">Escaneie, digite + Enter ou use a câmera</span>
                    </div>
                    {scannerFeedback && (
                        <div className={`mt-2 text-sm font-medium ${scannerFeedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                            {scannerFeedback.type === 'success' ? <CheckCircle2 className="inline h-4 w-4 mr-1" /> : <XCircle className="inline h-4 w-4 mr-1" />}
                            {scannerFeedback.msg}
                        </div>
                    )}
                </div>

                {/* Filtros */}
                <div className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded-lg shadow-sm border">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar produto..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button
                        variant={showOnlyPending ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => { setShowOnlyPending(!showOnlyPending); setShowOnlyDivergent(false); }}
                    >
                        <Filter className="h-4 w-4 mr-1.5" />
                        Pendentes
                    </Button>
                    <Button
                        variant={showOnlyDivergent ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => { setShowOnlyDivergent(!showOnlyDivergent); setShowOnlyPending(false); }}
                    >
                        <AlertTriangle className="h-4 w-4 mr-1.5" />
                        Divergentes
                    </Button>
                </div>

                {/* Itens agrupados por categoria */}
                <div className="space-y-3">
                    {itensAgrupados.map(([categoria, catItens]) => {
                        const isExpanded = expandedCategories.has(categoria);
                        const catContados = catItens.filter(i => i.contado).length;
                        const catDivergentes = catItens.filter(i => i.contado && i.divergencia !== 0).length;

                        return (
                            <Card key={categoria} className="overflow-hidden">
                                <button
                                    onClick={() => toggleCategory(categoria)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        {isExpanded
                                            ? <ChevronDown className="h-4 w-4 text-gray-400" />
                                            : <ChevronRight className="h-4 w-4 text-gray-400" />
                                        }
                                        <Package className="h-4 w-4 text-blue-500" />
                                        <span className="font-semibold text-gray-900">{categoria}</span>
                                        <span className="text-xs text-gray-400">({catItens.length} itens)</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-gray-500">
                                            {catContados}/{catItens.length} contados
                                        </span>
                                        {catDivergentes > 0 && (
                                            <span className="text-xs text-amber-600 font-medium">
                                                {catDivergentes} diverg.
                                            </span>
                                        )}
                                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full"
                                                style={{ width: `${catItens.length > 0 ? (catContados / catItens.length) * 100 : 0}%` }}
                                            />
                                        </div>
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-gray-50/50 border-b border-t">
                                                    <th className="text-left py-2 px-3 font-medium text-gray-500 text-xs w-24">Código</th>
                                                    <th className="text-left py-2 px-3 font-medium text-gray-500 text-xs">Produto</th>
                                                    <th className="text-center py-2 px-3 font-medium text-gray-500 text-xs w-24">Sistema</th>
                                                    <th className="text-center py-2 px-3 font-medium text-gray-500 text-xs w-32">Contagem</th>
                                                    <th className="text-center py-2 px-3 font-medium text-gray-500 text-xs w-24">Diferença</th>
                                                    <th className="text-left py-2 px-3 font-medium text-gray-500 text-xs w-48">Obs.</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {catItens.map((item) => {
                                                    const globalIdx = itens.findIndex(i =>
                                                        i.produto_id === item.produto_id && i.categoria === item.categoria
                                                    );
                                                    const divColor = item.divergencia > 0
                                                        ? 'text-green-600 bg-green-50'
                                                        : item.divergencia < 0
                                                            ? 'text-red-600 bg-red-50'
                                                            : item.contado
                                                                ? 'text-gray-500 bg-gray-50'
                                                                : 'text-gray-300';

                                                    return (
                                                        <tr
                                                            key={item.produto_id}
                                                            className={`transition-colors ${item.contado ? (item.divergencia !== 0 ? 'bg-amber-50/30' : 'bg-green-50/20') : 'hover:bg-gray-50/50'}`}
                                                        >
                                                            <td className="py-2 px-3 font-mono text-xs text-gray-400">{item.produto_codigo}</td>
                                                            <td className="py-2 px-3">
                                                                <div className="flex items-center gap-2">
                                                                    {item.contado ? (
                                                                        <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                                                    ) : (
                                                                        <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-200 flex-shrink-0" />
                                                                    )}
                                                                    <span className="text-gray-900 text-sm">{item.produto_nome}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-3 text-center tabular-nums text-gray-600 font-medium">
                                                                {item.estoque_sistema}
                                                            </td>
                                                            <td className="py-2 px-3 text-center">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    data-produto-id={item.produto_id}
                                                                    className="w-20 mx-auto text-center rounded-lg border border-gray-200 py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 tabular-nums disabled:bg-gray-100 disabled:text-gray-400"
                                                                    value={item.quantidade_contada ?? ''}
                                                                    onChange={(e) => handleUpdateItem(globalIdx, 'quantidade_contada', e.target.value)}
                                                                    placeholder="—"
                                                                    disabled={isFinalizada}
                                                                />
                                                            </td>
                                                            <td className="py-2 px-3 text-center">
                                                                {item.contado ? (
                                                                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${divColor}`}>
                                                                        {item.divergencia > 0 ? '+' : ''}{item.divergencia}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-gray-300 text-xs">—</span>
                                                                )}
                                                            </td>
                                                            <td className="py-2 px-3">
                                                                <input
                                                                    type="text"
                                                                    className="w-full rounded-lg border border-gray-200 py-1 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-gray-100"
                                                                    value={item.observacao}
                                                                    onChange={(e) => handleUpdateItem(globalIdx, 'observacao', e.target.value)}
                                                                    placeholder="Observação..."
                                                                    disabled={isFinalizada}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>

                {itensFiltrados.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-lg border border-dashed">
                        <ClipboardCheck className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">Nenhum item encontrado com os filtros aplicados.</p>
                    </div>
                )}
            </div>
        );
    }

    // ==================== STEP: RESULTADO ====================
    return (
        <div className="space-y-6">
            <PageHeader
                title={`Resultado — ${titulo}`}
                subtitle={`${contagem?.codigo || ''} — Finalizada em ${contagem?.finalizado_em ? new Date(contagem.finalizado_em).toLocaleString('pt-BR') : '—'}`}
                actionButton={
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate('/estoque/contagens')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Voltar
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExportCSV}>
                            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                            Exportar CSV
                        </Button>
                    </div>
                }
            />

            {/* Resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 text-center border-l-4 border-l-blue-500">
                    <p className="text-xs text-gray-400 uppercase">Total Itens</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </Card>
                <Card className="p-4 text-center border-l-4 border-l-green-500">
                    <p className="text-xs text-gray-400 uppercase">Contados</p>
                    <p className="text-2xl font-bold text-green-600">{stats.contados}</p>
                </Card>
                <Card className="p-4 text-center border-l-4 border-l-amber-500">
                    <p className="text-xs text-gray-400 uppercase">Divergências</p>
                    <p className="text-2xl font-bold text-amber-600">{stats.divergentes}</p>
                </Card>
                <Card className="p-4 text-center border-l-4 border-l-purple-500">
                    <p className="text-xs text-gray-400 uppercase">Acurácia</p>
                    <p className="text-2xl font-bold text-purple-600">
                        {stats.contados > 0
                            ? Math.round(((stats.contados - stats.divergentes) / stats.contados) * 100)
                            : 0}%
                    </p>
                </Card>
            </div>

            {/* Divergências */}
            {stats.divergentes > 0 && (
                <Card className="overflow-hidden">
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <span className="font-semibold text-amber-800">
                                {stats.divergentes} Divergência(s) Encontrada(s)
                            </span>
                        </div>
                        <Button variant="danger" size="sm" onClick={handleAplicarAjustes} loading={saving}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Aplicar Ajustes no Estoque
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b">
                                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">Código</th>
                                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">Produto</th>
                                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">Categoria</th>
                                    <th className="text-center py-2.5 px-4 font-medium text-gray-600">Sistema</th>
                                    <th className="text-center py-2.5 px-4 font-medium text-gray-600">Contagem</th>
                                    <th className="text-center py-2.5 px-4 font-medium text-gray-600">Diferença</th>
                                    <th className="text-left py-2.5 px-4 font-medium text-gray-600">Obs.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {itens.filter(i => i.contado && i.divergencia !== 0).map((item) => (
                                    <tr key={item.produto_id} className="hover:bg-gray-50">
                                        <td className="py-2.5 px-4 font-mono text-xs text-gray-400">{item.produto_codigo}</td>
                                        <td className="py-2.5 px-4 text-gray-900">{item.produto_nome}</td>
                                        <td className="py-2.5 px-4 text-gray-500 text-xs">{item.categoria}</td>
                                        <td className="py-2.5 px-4 text-center tabular-nums">{item.estoque_sistema}</td>
                                        <td className="py-2.5 px-4 text-center tabular-nums font-medium">{item.quantidade_contada}</td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums ${
                                                item.divergencia > 0 ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                                            }`}>
                                                {item.divergencia > 0 ? '+' : ''}{item.divergencia}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-xs text-gray-500">{item.observacao || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {stats.divergentes === 0 && (
                <Card className="p-8 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900">Nenhuma Divergência</h3>
                    <p className="text-gray-500 mt-1">O estoque físico está de acordo com o sistema.</p>
                </Card>
            )}

            {/* Tabela completa */}
            <Card className="overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b">
                    <span className="font-semibold text-gray-700">Detalhamento Completo</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b">
                                <th className="text-left py-2.5 px-4 font-medium text-gray-600">Código</th>
                                <th className="text-left py-2.5 px-4 font-medium text-gray-600">Produto</th>
                                <th className="text-left py-2.5 px-4 font-medium text-gray-600">Categoria</th>
                                <th className="text-center py-2.5 px-4 font-medium text-gray-600">Sistema</th>
                                <th className="text-center py-2.5 px-4 font-medium text-gray-600">Contagem</th>
                                <th className="text-center py-2.5 px-4 font-medium text-gray-600">Diferença</th>
                                <th className="text-center py-2.5 px-4 font-medium text-gray-600">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {itens.map((item) => (
                                <tr key={item.produto_id} className="hover:bg-gray-50">
                                    <td className="py-2 px-4 font-mono text-xs text-gray-400">{item.produto_codigo}</td>
                                    <td className="py-2 px-4 text-gray-900 text-sm">{item.produto_nome}</td>
                                    <td className="py-2 px-4 text-gray-500 text-xs">{item.categoria}</td>
                                    <td className="py-2 px-4 text-center tabular-nums">{item.estoque_sistema}</td>
                                    <td className="py-2 px-4 text-center tabular-nums font-medium">
                                        {item.contado ? item.quantidade_contada : '—'}
                                    </td>
                                    <td className="py-2 px-4 text-center">
                                        {item.contado ? (
                                            <span className={`text-xs font-bold tabular-nums ${
                                                item.divergencia > 0 ? 'text-green-600' : item.divergencia < 0 ? 'text-red-600' : 'text-gray-400'
                                            }`}>
                                                {item.divergencia > 0 ? '+' : ''}{item.divergencia}
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td className="py-2 px-4 text-center">
                                        {item.contado ? (
                                            item.divergencia === 0 ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                                                    <CheckCircle2 className="h-3 w-3" /> OK
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                                                    <AlertTriangle className="h-3 w-3" /> Divergente
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-xs text-gray-300">Não contado</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

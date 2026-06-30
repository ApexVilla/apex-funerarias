import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2, CheckCircle, Printer, PackagePlus } from 'lucide-react';
import { carregarItensKit, listarKitsEmpresa, type KitPlanoResumo } from '../../lib/kitPlanoService';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Components';
import { ProdutoEstoqueSelect } from '../../components/estoque/ProdutoEstoqueSelect';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { gerarCodigoProdutoInterno } from '../../lib/gerarCodigoProdutoInterno';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { ESTOQUE_SAIDA_MOTIVO_OPTIONS } from '../../lib/estoqueSaidaMotivos';
import { buscarProdutosAtivosNoServidor, loadProdutosAtivosEmpresa } from '../../lib/estoqueLoadProdutos';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useFilial } from '../../lib/FilialContext';
import { mesclarDepartamentosOperacionaisSaida } from '../../lib/estoqueDepartamentosOperacionais';
import {
    deduplicarDepositosPorUnidade,
    depositoIdsParaConsultaSaldo,
    rotuloDepositoUnidade,
    type DepositoUnidade,
} from '../../lib/estoqueDepositosUnidade';
import { CATEGORIAS_PRODUTO_ESTOQUE } from '../../lib/categoriasProdutoEstoque';

type Produto = {
    id: string;
    codigo: string;
    nome: string;
    categoria?: string;
    codigo_barras?: string | null;
    marca?: string | null;
    estoque_atual: number;
    preco_centavos: number;
};

type SaidaItemTipo = 'produto' | 'kit';

type SaidaItem = {
    id: string;
    tipo: SaidaItemTipo;
    produto_id: string;
    kit_id: string;
    quantidade: string;
    valor_unitario: string;
    preco_minimo_centavos: number;
};

type KitItemCache = { produto_id: string; quantidade: number; produto_nome?: string };

const linhaProdutoVazia = (): SaidaItem => ({
    id: crypto.randomUUID(),
    tipo: 'produto',
    produto_id: '',
    kit_id: '',
    quantidade: '1',
    valor_unitario: '0.00',
    preco_minimo_centavos: 0,
});

type DepositoOpt = DepositoUnidade;

export const EstoqueSaidaForm: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { saidaId } = useParams();
    const { user } = useAuth();
    const { showToast } = useToast();
    const {
        empresaIdEfetivo,
        empresaIdsParaFiltro,
        visaoTodasEmpresasGrupo,
        empresasDoGrupo,
        loadingEmpresasGrupo,
    } = useEmpresaContextoAtivo();
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const { filiais, filialId, isTodasFiliais, dataRevision } = useFilial();
    const isEdit = Boolean(saidaId);
    const empresaIdGravacao = empresaIdEfetivo || empresaIdOperacao || '';

    const [saidaPersistidaId, setSaidaPersistidaId] = useState<string | undefined>(saidaId);
    const numeroInicializadoRef = useRef(false);

    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [confirmando, setConfirmando] = useState(false);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [processadoEm, setProcessadoEm] = useState<string | null>(null);
    const [statusAtual, setStatusAtual] = useState<string>('rascunho');

    const [form, setForm] = useState({
        numero_saida: '',
        solicitante: '',
        departamento: '',
        deposito_id: '',
        motivo: 'consumo',
        data_saida: new Date().toISOString().slice(0, 10),
        observacoes: '',
    });

    const [itens, setItens] = useState<SaidaItem[]>([linhaProdutoVazia()]);
    const [kits, setKits] = useState<KitPlanoResumo[]>([]);
    const [kitItensCache, setKitItensCache] = useState<Record<string, KitItemCache[]>>({});

    const [modalNovoItem, setModalNovoItem] = useState(false);
    const [novoItemLinhaId, setNovoItemLinhaId] = useState<string | null>(null);
    const [salvandoNovoItem, setSalvandoNovoItem] = useState(false);
    const [novoItem, setNovoItem] = useState({
        nome: '',
        categoria: '',
        preco: '0.00',
        estoque_minimo: '0',
    });
    const [depositos, setDepositos] = useState<DepositoOpt[]>([]);
    const [departamentosOpcoes, setDepartamentosOpcoes] = useState<{ id: string; nome: string }[]>([]);
    const [saldosDeposito, setSaldosDeposito] = useState<Record<string, number>>({});

    const garantirItensKitCache = useCallback(async (kitId: string) => {
        if (!kitId) return [];
        try {
            const data = await carregarItensKit(kitId);
            const parsed: KitItemCache[] = (data || []).map((row) => ({
                produto_id: row.produto_id,
                quantidade: Number(row.quantidade) || 0,
                produto_nome: row.produto?.nome,
            }));
            setKitItensCache((prev) => ({ ...prev, [kitId]: parsed }));
            return parsed;
        } catch (err) {
            console.error('[EstoqueSaida] itens do kit:', err);
            showToast('Não foi possível carregar os produtos do kit.', 'error');
            return [];
        }
    }, [showToast]);

    const abrirModalNovoItem = (linhaId: string) => {
        setNovoItemLinhaId(linhaId);
        setNovoItem({ nome: '', categoria: '', preco: '0.00', estoque_minimo: '0' });
        setModalNovoItem(true);
    };

    const salvarNovoItem = async () => {
        if (!empresaIdOperacao) return;
        if (!novoItem.nome.trim()) {
            showToast('Informe o nome do item.', 'warning');
            return;
        }
        if (!novoItem.categoria) {
            showToast('Selecione a categoria.', 'warning');
            return;
        }

        setSalvandoNovoItem(true);

        const codigo = await gerarCodigoProdutoInterno(empresaIdOperacao);
        const precoCentavos = Math.round((Number(novoItem.preco) || 0) * 100);

        const { data, error } = await supabase
            .from('ser_produtos')
            .insert({
                empresa_id: empresaIdOperacao,
                codigo,
                nome: novoItem.nome.trim(),
                categoria: novoItem.categoria,
                preco_centavos: precoCentavos,
                estoque_atual: 0,
                estoque_minimo: Math.max(0, Number(novoItem.estoque_minimo) || 0),
                ativo: true,
            })
            .select('id, codigo, nome, categoria, codigo_barras, marca, estoque_atual, preco_centavos')
            .single();

        if (error || !data) {
            showToast(`Erro ao criar item: ${error?.message || 'falha desconhecida'}`, 'error');
            setSalvandoNovoItem(false);
            return;
        }

        const novoProduto = data as Produto;
        setProdutos(prev => [...prev, novoProduto].sort((a, b) => a.nome.localeCompare(b.nome)));

        if (novoItemLinhaId) {
            atualizarLinha(novoItemLinhaId, {
                produto_id: novoProduto.id,
                valor_unitario: (novoProduto.preco_centavos / 100).toFixed(2),
            });
        }

        showToast(`Item "${novoProduto.codigo} - ${novoProduto.nome}" criado com sucesso!`, 'success');
        setSalvandoNovoItem(false);
        setModalNovoItem(false);
    };

    const depositosUnicos = useMemo(() => {
        let dedup = deduplicarDepositosPorUnidade(depositos, empresaIdGravacao);
        if (form.deposito_id && !dedup.some((d) => d.id === form.deposito_id)) {
            const gravado = depositos.find((d) => d.id === form.deposito_id);
            if (gravado) dedup = [...dedup, gravado];
        }
        if (isTodasFiliais || filialId === FILIAL_TODAS_ID || !filialId) {
            return dedup;
        }
        const daFilial = dedup.filter((d) => d.filial_id === filialId);
        if (daFilial.length > 0) return daFilial;
        const filialNome = filiais.find((f) => f.id === filialId)?.nome;
        if (filialNome) {
            const chave = filialNome
                .normalize('NFD')
                .replace(/\p{M}/gu, '')
                .toLowerCase();
            const porNome = dedup.filter((d) => {
                const r = (d.filial_nome || '')
                    .normalize('NFD')
                    .replace(/\p{M}/gu, '')
                    .toLowerCase();
                return r.includes(chave) || chave.includes(r);
            });
            if (porNome.length > 0) return porNome;
        }
        return dedup;
    }, [depositos, empresaIdGravacao, filialId, isTodasFiliais, filiais, form.deposito_id]);

    const loadSaldosDeposito = useCallback(
        async (depositoId: string) => {
            if (!depositoId) {
                setSaldosDeposito({});
                return;
            }
            const idsSaldo = depositoIdsParaConsultaSaldo(depositoId, depositos);
            const { data, error } = await supabase
                .from('estoque_saldo_deposito')
                .select('produto_id, quantidade')
                .in('deposito_id', idsSaldo);
            if (error) {
                setSaldosDeposito({});
                return;
            }
            const map: Record<string, number> = {};
            for (const row of data ?? []) {
                const pid = row.produto_id as string;
                map[pid] = (map[pid] ?? 0) + (Number(row.quantidade) || 0);
            }
            setSaldosDeposito(map);
        },
        [depositos],
    );

    useEffect(() => {
        void loadSaldosDeposito(form.deposito_id);
    }, [form.deposito_id, loadSaldosDeposito]);

    useEffect(() => {
        for (const item of itens) {
            if (item.tipo === 'kit' && item.kit_id && !kitItensCache[item.kit_id]) {
                void garantirItensKitCache(item.kit_id);
            }
        }
    }, [itens, kitItensCache, garantirItensKitCache]);

    useEffect(() => {
        const load = async () => {
            const eid = empresaIdEfetivo || empresaIdOperacao;
            if (!eid || !empresaIdOperacao) return;
            setLoading(true);

            const empresaIds = empresaIdsFiltro;
            const selectCols =
                'id, codigo, nome, categoria, codigo_barras, marca, estoque_atual, preco_centavos';
            const empresaIdsProdutos =
                visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 0 ? empresaIds : [eid];

            const idsGrupo = [...new Set(empresasDoGrupo.map((emp) => emp.id).filter(Boolean))];
            const empresaIdsKits =
                idsGrupo.length > 0 ? idsGrupo : empresaIdsFiltro.length > 0 ? empresaIdsFiltro : [eid];

            let prodData: Produto[] = [];
            try {
                prodData = await loadProdutosAtivosEmpresa<Produto>(empresaIdsProdutos, selectCols);
                setProdutos(prodData);
            } catch (err) {
                showToast(
                    `Erro ao carregar produtos: ${err instanceof Error ? err.message : 'falha'}`,
                    'error',
                );
                setProdutos([]);
            }

            let kitsCarregados: KitPlanoResumo[] = [];
            try {
                kitsCarregados = await listarKitsEmpresa(empresaIdsKits);
                setKits(kitsCarregados);
                if (kitsCarregados.length === 0 && !loadingEmpresasGrupo) {
                    console.info('[EstoqueSaida] Nenhum kit para empresa_ids:', empresaIdsKits);
                }
            } catch (err) {
                console.error(err);
                showToast('Erro ao carregar kits para saída.', 'warning');
                setKits([]);
            }

            const empresaIdsDepositos =
                visaoTodasEmpresasGrupo && empresaIdsParaFiltro.length > 0
                    ? empresaIdsParaFiltro
                    : [eid];

            const { data: depData, error: depError } = await supabase
                .from('estoque_depositos')
                .select('id, nome, filial_id, empresa_id, filiais(nome)')
                .in('empresa_id', empresaIdsDepositos)
                .eq('ativo', true)
                .is('deleted_at', null)
                .order('nome');

            if (depError) {
                showToast(`Erro ao carregar depósitos: ${depError.message}`, 'error');
                setDepositos([]);
            } else {
                const brutos = ((depData ?? []) as any[]).map((d) => ({
                    id: d.id as string,
                    nome: d.nome as string,
                    filial_id: d.filial_id as string | null,
                    filial_nome: (d.filiais as { nome?: string } | null)?.nome,
                    empresa_id: d.empresa_id as string,
                }));
                setDepositos(brutos);
            }

            // Departamentos: busca em todo o grupo (Catalão/Ipameri herdavam lista vazia só na empresa local)
            const { data: deptData, error: deptError } = await supabase
                .from('departamentos')
                .select('id, nome')
                .in('empresa_id', empresaIds)
                .eq('ativo', true)
                .is('deleted_at', null)
                .order('nome');
            if (deptError) {
                showToast(`Erro ao carregar departamentos: ${deptError.message}`, 'warning');
            }
            setDepartamentosOpcoes(
                mesclarDepartamentosOperacionaisSaida((deptData ?? []) as { id: string; nome: string }[]),
            );

            if (!isEdit && !numeroInicializadoRef.current && eid) {
                numeroInicializadoRef.current = true;
                const { data: numData } = await supabase.rpc('fn_gerar_numero_saida', {
                    p_empresa_id: eid,
                });
                const numero =
                    typeof numData === 'string' && numData.trim()
                        ? numData
                        : `SAI-${Date.now().toString().slice(-4)}`;
                setForm((prev) => ({ ...prev, numero_saida: numero }));
            }

            if (isEdit && saidaId) {
                const { data: saida } = await supabase
                    .from('estoque_saidas')
                    .select('*')
                    .eq('id', saidaId)
                    .single();

                if (!saida) {
                    showToast('Saída não encontrada.', 'warning');
                    navigate('/estoque/saidas');
                    return;
                }

                setForm({
                    numero_saida: saida.numero_saida || '',
                    solicitante: saida.solicitante || '',
                    departamento: saida.departamento || '',
                    deposito_id: saida.deposito_id || '',
                    motivo: saida.motivo || 'consumo',
                    data_saida: saida.data_saida || new Date().toISOString().slice(0, 10),
                    observacoes: saida.observacoes || '',
                });
                setProcessadoEm(saida.processado_em || null);
                setStatusAtual(saida.status || 'rascunho');

                const { data: itensData } = await supabase
                    .from('estoque_saida_itens')
                    .select('*')
                    .eq('saida_id', saidaId);

                const mapped = (itensData ?? []).map((it: any) => {
                    const prod = prodData.find((p: Produto) => p.id === it.produto_id);
                    return {
                        id: it.id,
                        tipo: (it.kit_id ? 'kit' : 'produto') as SaidaItemTipo,
                        produto_id: it.produto_id || '',
                        kit_id: it.kit_id || '',
                        quantidade: String(it.quantidade),
                        valor_unitario: (it.valor_unitario_centavos / 100).toFixed(2),
                        preco_minimo_centavos: prod?.preco_centavos ?? it.valor_unitario_centavos,
                    };
                });
                setItens(mapped.length ? mapped : [linhaProdutoVazia()]);
                const kitIds = [...new Set(mapped.filter((m) => m.kit_id).map((m) => m.kit_id))];
                for (const kid of kitIds) {
                    void garantirItensKitCache(kid);
                }
                const kitIdsFaltando = kitIds.filter(
                    (kid) => !kitsCarregados.some((k) => k.id === kid),
                );
                if (kitIdsFaltando.length > 0) {
                    const { data: kitsExtras } = await supabase
                        .from('estoque_kits')
                        .select('id, nome, descricao, plano_id, planos:plano_id ( nome )')
                        .in('id', kitIdsFaltando);
                    if (kitsExtras?.length) {
                        const extras = kitsExtras.map((k: any) => ({
                            id: k.id,
                            nome: k.nome,
                            descricao: k.descricao,
                            plano_id: k.plano_id,
                            plano_nome: k.planos?.nome || null,
                        }));
                        setKits((prev) => {
                            const ids = new Set(prev.map((p) => p.id));
                            return [...prev, ...extras.filter((x) => !ids.has(x.id))].sort((a, b) =>
                                a.nome.localeCompare(b.nome, 'pt-BR'),
                            );
                        });
                    }
                }
            }

            setLoading(false);
        };
        void load();
    }, [
        saidaId,
        isEdit,
        navigate,
        empresaIdOperacao,
        empresaIdsFiltro,
        empresaIdEfetivo,
        empresaIdsParaFiltro,
        visaoTodasEmpresasGrupo,
        empresasDoGrupo,
        loadingEmpresasGrupo,
        dataRevisionEmpresa,
        dataRevision,
    ]);

    useEffect(() => {
        setSaidaPersistidaId(saidaId);
        if (!saidaId) numeroInicializadoRef.current = false;
    }, [saidaId]);

    useEffect(() => {
        if (isEdit || loading || form.deposito_id) return;
        if (depositosUnicos.length === 1) {
            setForm((p) => ({ ...p, deposito_id: depositosUnicos[0].id }));
        }
    }, [isEdit, loading, form.deposito_id, depositosUnicos]);

    const isReadOnly = statusAtual !== 'rascunho';

    const adicionarLinha = () => {
        setItens((prev) => [...prev, linhaProdutoVazia()]);
    };

    const removerLinha = (id: string) => {
        setItens(prev => prev.filter(i => i.id !== id));
    };

    const atualizarLinha = (id: string, patch: Partial<SaidaItem>) => {
        setItens(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
    };

    const saldoDisponivel = useCallback(
        (produtoId: string) => {
            if (!produtoId) return 0;
            if (form.deposito_id) {
                return saldosDeposito[produtoId] ?? 0;
            }
            const prod = produtos.find((p) => p.id === produtoId);
            return prod?.estoque_atual ?? 0;
        },
        [form.deposito_id, saldosDeposito, produtos],
    );

    const produtosComSaldoDeposito = useMemo(() => {
        if (!form.deposito_id) return produtos;
        return produtos.map((p) => ({
            ...p,
            estoque_atual: saldosDeposito[p.id] ?? 0,
        }));
    }, [produtos, saldosDeposito, form.deposito_id]);

    const consumoPorProduto = useMemo(() => {
        const map: Record<string, number> = {};
        for (const item of itens) {
            const mult = Number(item.quantidade) || 0;
            if (mult <= 0) continue;
            if (item.tipo === 'kit' && item.kit_id) {
                const comps = kitItensCache[item.kit_id] || [];
                for (const c of comps) {
                    map[c.produto_id] = (map[c.produto_id] ?? 0) + mult * c.quantidade;
                }
            } else if (item.produto_id) {
                map[item.produto_id] = (map[item.produto_id] ?? 0) + mult;
            }
        }
        return map;
    }, [itens, kitItensCache]);

    const validacoesProduto = useMemo(() => {
        const map: Record<string, string | null> = {};
        const rotulo = form.deposito_id ? 'no depósito' : 'disponível';

        for (const item of itens) {
            if (item.tipo === 'kit') {
                if (!item.kit_id) continue;
                const comps = kitItensCache[item.kit_id];
                if (!comps) {
                    map[item.id] = 'Carregando composição do kit…';
                    continue;
                }
                if (comps.length === 0) {
                    map[item.id] = 'Kit sem itens cadastrados';
                    continue;
                }
                const mult = Number(item.quantidade) || 0;
                for (const c of comps) {
                    const necessario = mult * c.quantidade;
                    const saldo = saldoDisponivel(c.produto_id);
                    if (necessario > saldo) {
                        const nome = produtos.find((p) => p.id === c.produto_id)?.nome || 'item do kit';
                        map[item.id] = `Kit exige mais "${nome}" do que há ${rotulo} (necessário: ${necessario}, saldo: ${saldo})`;
                        break;
                    }
                }
                continue;
            }
            if (!item.produto_id) continue;
            const qtd = Number(item.quantidade) || 0;
            const totalNecessario = consumoPorProduto[item.produto_id] ?? qtd;
            const saldo = saldoDisponivel(item.produto_id);
            if (totalNecessario > saldo) {
                map[item.id] = `Estoque insuficiente ${rotulo} (total necessário: ${totalNecessario}, saldo: ${saldo})`;
            }
        }
        return map;
    }, [itens, saldoDisponivel, form.deposito_id, kitItensCache, consumoPorProduto, produtos]);

    const temErroEstoque = Object.keys(validacoesProduto).length > 0;

    const isVendaParticular = form.motivo === 'venda_particular';

    const validacoesPreco = useMemo(() => {
        if (!isVendaParticular) return {} as Record<string, string>;
        const map: Record<string, string> = {};
        for (const item of itens) {
            if (item.tipo === 'kit' || !item.produto_id) continue;
            const valorCentavos = Math.round((Number(item.valor_unitario) || 0) * 100);
            if (item.preco_minimo_centavos > 0 && valorCentavos < item.preco_minimo_centavos) {
                const minFormatado = (item.preco_minimo_centavos / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                });
                map[item.id] = `Valor mínimo de venda: ${minFormatado}`;
            }
        }
        return map;
    }, [isVendaParticular, itens]);

    const temErroPreco = Object.keys(validacoesPreco).length > 0;

    const buscarProdutoRemoto = useCallback(
        async (termo: string) => {
            if (!empresaIdOperacao) return [];
            const empresaIds = empresaIdsFiltro;
            return buscarProdutosAtivosNoServidor<Produto>(
                empresaIds,
                termo,
                'id, codigo, nome, categoria, codigo_barras, marca, estoque_atual, preco_centavos',
            );
        },
        [empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa],
    );

    const salvar = async (confirmar = false) => {
        if (!empresaIdOperacao || !empresaIdGravacao) return;
        const itensValidos = itens.filter(
            (i) =>
                (Number(i.quantidade) || 0) > 0 &&
                ((i.tipo === 'produto' && i.produto_id) || (i.tipo === 'kit' && i.kit_id)),
        );

        if (!form.deposito_id) {
            showToast('Selecione o depósito.', 'warning');
            return;
        }
        if (itensValidos.length === 0) {
            showToast('Adicione ao menos um item válido.', 'warning');
            return;
        }
        if (confirmar && temErroEstoque) {
            showToast('Corrija os erros de estoque antes de confirmar.', 'error');
            return;
        }
        if (temErroPreco) {
            showToast('O valor de venda não pode ser menor que o preço cadastrado no produto.', 'error');
            return;
        }

        setSaving(true);

        let numeroSaida = form.numero_saida.trim();
        let id = saidaPersistidaId || saidaId;

        if (!id) {
            const { data: numData } = await supabase.rpc('fn_gerar_numero_saida', {
                p_empresa_id: empresaIdGravacao,
            });
            numeroSaida =
                typeof numData === 'string' && numData.trim()
                    ? numData
                    : `SAI-${Date.now().toString().slice(-4)}`;
            setForm((p) => ({ ...p, numero_saida: numeroSaida }));
        } else if (!numeroSaida) {
            showToast('Número da saída é obrigatório.', 'warning');
            setSaving(false);
            return;
        }

        const payload = {
            empresa_id: empresaIdGravacao,
            numero_saida: numeroSaida,
            solicitante: form.solicitante.trim() || null,
            departamento: form.departamento.trim() || null,
            deposito_id: form.deposito_id || null,
            motivo: form.motivo,
            data_saida: form.data_saida,
            observacoes: form.observacoes.trim() || null,
            updated_at: new Date().toISOString(),
        };

        const persistirCabecalho = async (): Promise<string | null> => {
            if (id) {
                const { error } = await supabase.from('estoque_saidas').update(payload).eq('id', id);
                if (error) {
                    showToast(`Erro ao atualizar: ${error.message}`, 'error');
                    return null;
                }
                return id;
            }

            const { data, error } = await supabase
                .from('estoque_saidas')
                .insert({ ...payload, status: 'rascunho', criado_por: user.id })
                .select('id')
                .single();

            if (!error && data) {
                return data.id as string;
            }

            if (error?.code === '23505') {
                const { data: existente } = await supabase
                    .from('estoque_saidas')
                    .select('id, status')
                    .eq('empresa_id', empresaIdGravacao)
                    .eq('numero_saida', numeroSaida)
                    .maybeSingle();

                if (existente?.id && existente.status === 'rascunho') {
                    const { error: updErr } = await supabase
                        .from('estoque_saidas')
                        .update(payload)
                        .eq('id', existente.id);
                    if (!updErr) return existente.id as string;
                }
            }

            showToast(`Erro ao salvar: ${error?.message || 'falha desconhecida'}`, 'error');
            return null;
        };

        id = await persistirCabecalho();
        if (!id) {
            setSaving(false);
            return;
        }

        setSaidaPersistidaId(id);

        await supabase.from('estoque_saida_itens').delete().eq('saida_id', id);

        const itensInsert = itensValidos.map((i) => {
            if (i.tipo === 'kit') {
                return {
                    saida_id: id,
                    kit_id: i.kit_id,
                    produto_id: null,
                    quantidade: Number(i.quantidade) || 0,
                    valor_unitario_centavos: 0,
                };
            }
            return {
                saida_id: id,
                produto_id: i.produto_id,
                kit_id: null,
                quantidade: Number(i.quantidade) || 0,
                valor_unitario_centavos: Math.round((Number(i.valor_unitario) || 0) * 100),
            };
        });

        const { error: itensError } = await supabase.from('estoque_saida_itens').insert(itensInsert);
        if (itensError) {
            showToast(
                `Erro ao salvar itens: ${itensError.message}. O rascunho ${numeroSaida} foi mantido — corrija e salve novamente.`,
                'error',
            );
            setSaving(false);
            return;
        }

        if (location.pathname.endsWith('/nova')) {
            navigate(`/estoque/saidas/${id}/editar`, { replace: true });
        }

        if (confirmar) {
            setConfirmando(true);
            const { error: rpcError } = await supabase.rpc('fn_confirmar_saida_estoque', { p_saida_id: id });
            if (rpcError) {
                showToast(`Erro ao confirmar saída: ${rpcError.message}`, 'error');
                setSaving(false);
                setConfirmando(false);
                return;
            }

            await supabase.from('estoque_saidas')
                .update({ processado_por: user.id })
                .eq('id', id);

            setConfirmando(false);
            showToast('Saída confirmada e estoque atualizado!', 'success');
            navigate(`/estoque/saidas/${id}/recibo`);
            setSaving(false);
            return;
        }

        showToast('Saída salva como rascunho.', 'success');
        setSaving(false);
        navigate('/estoque/saidas');
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={isEdit ? 'Editar Saída' : 'Nova Saída Manual'}
                subtitle="Registro de saída de materiais do estoque"
                actionButton={
                    <Button variant="outline" onClick={() => navigate('/estoque/saidas')}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                }
            />

            <Card className="p-6 space-y-4">
                {processadoEm && (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Saída confirmada em {new Date(processadoEm).toLocaleString('pt-BR')}. Estoque já foi atualizado.
                    </div>
                )}

                {statusAtual === 'cancelada' && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        Esta saída foi cancelada e não pode ser alterada.
                    </div>
                )}

                <p className="text-xs text-slate-600">
                    Escolha o <strong>depósito</strong> de onde sairá o estoque. O saldo nos itens é do depósito selecionado.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                        label="Número da Saída"
                        value={form.numero_saida}
                        readOnly
                    />
                    <Input
                        label="Solicitante"
                        placeholder="Nome de quem solicitou"
                        value={form.solicitante}
                        onChange={(e) => setForm(p => ({ ...p, solicitante: e.target.value }))}
                        readOnly={isReadOnly}
                    />
                    <Select
                        label="Departamento da Baixa"
                        value={form.departamento}
                        onChange={(e) => setForm((p) => ({ ...p, departamento: e.target.value }))}
                        disabled={isReadOnly}
                    >
                        <option value="">Selecione o departamento…</option>
                        {departamentosOpcoes.map((d) => (
                            <option key={d.id} value={d.nome}>
                                {d.nome}
                            </option>
                        ))}
                        {form.departamento &&
                            !departamentosOpcoes.some((d) => d.nome === form.departamento) && (
                                <option value={form.departamento}>{form.departamento}</option>
                            )}
                    </Select>
                </div>
                <Select
                    label="Unidade (depósito) *"
                    value={form.deposito_id}
                    onChange={(e) => setForm((p) => ({ ...p, deposito_id: e.target.value }))}
                    disabled={isReadOnly}
                    required
                >
                    <option value="">Selecione a unidade…</option>
                    {depositosUnicos.map((d) => (
                        <option key={d.id} value={d.id}>
                            {rotuloDepositoUnidade(d)}
                        </option>
                    ))}
                    {form.deposito_id &&
                        !depositosUnicos.some((d) => d.id === form.deposito_id) && (
                            <option value={form.deposito_id}>Unidade gravada</option>
                        )}
                </Select>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                        label="Motivo da Saída"
                        value={form.motivo}
                        onChange={(e) => setForm(p => ({ ...p, motivo: e.target.value }))}
                        disabled={isReadOnly}
                    >
                        {ESTOQUE_SAIDA_MOTIVO_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </Select>
                    <Input
                        label="Data da Saída"
                        type="date"
                        value={form.data_saida}
                        onChange={(e) => setForm(p => ({ ...p, data_saida: e.target.value }))}
                        readOnly={isReadOnly}
                    />
                </div>

                <Card className="p-4 border-dashed !overflow-visible">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h4 className="font-semibold text-gray-900">Itens da Saída</h4>
                        {!isReadOnly && (
                            <Button type="button" variant="outline" onClick={adicionarLinha}>
                                <Plus className="h-4 w-4 mr-1" /> Adicionar item
                            </Button>
                        )}
                    </div>
                    {!isReadOnly && kits.length > 0 && (
                        <p className="text-xs text-slate-600 mb-2">
                            Kits aparecem no campo de busca (seção <strong>Kits</strong> no topo da lista).
                        </p>
                    )}
                    <div className="space-y-3">
                        {itens.map((item) => {
                            const isKit = item.tipo === 'kit';
                            const saldoAtual = !isKit && item.produto_id ? saldoDisponivel(item.produto_id) : null;
                            const erro = validacoesProduto[item.id];
                            const erroPreco = validacoesPreco[item.id];
                            const precoEditavel = isVendaParticular && !isKit && !isReadOnly;
                            const precoMinFormatado = item.preco_minimo_centavos > 0
                                ? (item.preco_minimo_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : null;
                            const compsKit = isKit && item.kit_id ? kitItensCache[item.kit_id] : undefined;
                            const resumoKit =
                                isKit && compsKit && compsKit.length > 0
                                    ? compsKit
                                          .map((c) => {
                                              const nome =
                                                  c.produto_nome ||
                                                  produtos.find((p) => p.id === c.produto_id)?.nome ||
                                                  'Produto';
                                              return `${nome} × ${c.quantidade}`;
                                          })
                                          .join(' · ')
                                    : isKit && item.kit_id && compsKit === undefined
                                      ? 'Carregando…'
                                      : isKit && item.kit_id
                                        ? 'Sem itens cadastrados'
                                        : '—';
                            return (
                                <div key={item.id}>
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                                        <div className="md:col-span-4">
                                            <ProdutoEstoqueSelect
                                                produtos={produtosComSaldoDeposito}
                                                kits={kits}
                                                itemTipo={item.tipo}
                                                value={isKit ? item.kit_id : item.produto_id}
                                                priorizarComEstoque
                                                buscarRemoto={buscarProdutoRemoto}
                                                onChange={() => {}}
                                                onSelectItem={(sel) => {
                                                    if (!sel) {
                                                        atualizarLinha(item.id, {
                                                            tipo: 'produto',
                                                            produto_id: '',
                                                            kit_id: '',
                                                            valor_unitario: '0.00',
                                                            preco_minimo_centavos: 0,
                                                        });
                                                        return;
                                                    }
                                                    if (sel.tipo === 'kit') {
                                                        void garantirItensKitCache(sel.id);
                                                        atualizarLinha(item.id, {
                                                            tipo: 'kit',
                                                            kit_id: sel.id,
                                                            produto_id: '',
                                                            valor_unitario: '0.00',
                                                            preco_minimo_centavos: 0,
                                                        });
                                                        return;
                                                    }
                                                    const pFull = produtos.find((x) => x.id === sel.id);
                                                    atualizarLinha(item.id, {
                                                        tipo: 'produto',
                                                        produto_id: sel.id,
                                                        kit_id: '',
                                                        valor_unitario: pFull
                                                            ? (pFull.preco_centavos / 100).toFixed(2)
                                                            : item.valor_unitario,
                                                        preco_minimo_centavos: pFull?.preco_centavos ?? 0,
                                                    });
                                                    if (pFull && !produtos.some((x) => x.id === pFull.id)) {
                                                        setProdutos((prev) =>
                                                            [...prev, pFull].sort((a, b) =>
                                                                a.nome.localeCompare(b.nome, 'pt-BR'),
                                                            ),
                                                        );
                                                    }
                                                }}
                                                disabled={isReadOnly}
                                                helperText={
                                                    !form.deposito_id
                                                        ? 'Selecione o depósito para ver o saldo.'
                                                        : isKit
                                                          ? 'Kit: baixa automática dos produtos na confirmação.'
                                                          : undefined
                                                }
                                                onCadastrarNovo={
                                                    isReadOnly || isKit
                                                        ? undefined
                                                        : () => abrirModalNovoItem(item.id)
                                                }
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <Input
                                                label={isKit ? 'Composição do kit' : 'Saldo atual'}
                                                value={
                                                    isKit
                                                        ? resumoKit
                                                        : saldoAtual != null
                                                          ? String(saldoAtual)
                                                          : '—'
                                                }
                                                readOnly
                                                title={isKit ? resumoKit : undefined}
                                                className={
                                                    isKit && resumoKit.length > 40
                                                        ? 'text-xs'
                                                        : !isKit && saldoAtual != null && saldoAtual <= 0
                                                          ? 'text-amber-700 font-medium'
                                                          : undefined
                                                }
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <Input
                                                label={isKit ? 'Qtd. de kits' : 'Quantidade'}
                                                type="number"
                                                min="0.001"
                                                step="0.001"
                                                value={item.quantidade}
                                                onChange={(e) => atualizarLinha(item.id, { quantidade: e.target.value })}
                                                readOnly={isReadOnly}
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <Input
                                                label={precoEditavel ? 'Valor de venda (R$)' : 'Valor unit. (R$)'}
                                                type="number"
                                                min={precoEditavel ? (item.preco_minimo_centavos / 100).toFixed(2) : '0'}
                                                step="0.01"
                                                value={item.valor_unitario}
                                                onChange={precoEditavel ? (e) => atualizarLinha(item.id, { valor_unitario: e.target.value }) : undefined}
                                                readOnly={!precoEditavel}
                                                className={erroPreco ? 'border-red-400 focus:ring-red-400' : undefined}
                                                helperText={precoEditavel && precoMinFormatado ? `Mínimo: ${precoMinFormatado}` : undefined}
                                            />
                                        </div>
                                        <div className="md:col-span-1 text-right">
                                            <div className="text-xs text-gray-500 mb-1">Subtotal</div>
                                            <div className="font-medium text-slate-900 text-sm">
                                                {isKit
                                                    ? '—'
                                                    : (
                                                          (Number(item.quantidade) || 0) *
                                                          (Number(item.valor_unitario) || 0)
                                                      ).toLocaleString('pt-BR', {
                                                          style: 'currency',
                                                          currency: 'BRL',
                                                      })}
                                            </div>
                                        </div>
                                        {!isReadOnly && (
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
                                        )}
                                    </div>
                                    {erro && (
                                        <div className="mt-1 ml-1 text-xs text-red-600 font-medium">{erro}</div>
                                    )}
                                    {erroPreco && (
                                        <div className="mt-1 ml-1 text-xs text-red-600 font-medium">{erroPreco}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Card>

                <Textarea
                    label="Observações"
                    placeholder="Detalhes da saída..."
                    value={form.observacoes}
                    onChange={(e) => setForm(p => ({ ...p, observacoes: e.target.value }))}
                    readOnly={isReadOnly}
                />

                {!isReadOnly && (
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => navigate('/estoque/saidas')}>Cancelar</Button>
                        <Button variant="outline" onClick={() => salvar(false)} loading={saving && !confirmando}>
                            <Save className="h-4 w-4 mr-2" />
                            Salvar Rascunho
                        </Button>
                        <Button
                            onClick={() => salvar(true)}
                            loading={confirmando}
                            disabled={temErroEstoque || temErroPreco}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Confirmar e Baixar Estoque
                        </Button>
                    </div>
                )}

                {isReadOnly && statusAtual === 'confirmada' && (
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => navigate('/estoque/saidas')}>Voltar</Button>
                        <Button onClick={() => navigate(`/estoque/saidas/${saidaId}/recibo`)}>
                            <Printer className="h-4 w-4 mr-2" />
                            Imprimir Recibo
                        </Button>
                    </div>
                )}
            </Card>

            <Modal isOpen={modalNovoItem} onClose={() => setModalNovoItem(false)} title="Criar novo item rapidamente" size="sm">
                <div className="space-y-4">
                    <p className="text-xs text-gray-500">O código interno será gerado automaticamente.</p>
                    <Input
                        label="Nome do item"
                        placeholder="Ex: Vela decorativa grande"
                        value={novoItem.nome}
                        onChange={(e) => setNovoItem(p => ({ ...p, nome: e.target.value }))}
                        autoFocus
                    />
                    <Select
                        label="Categoria"
                        value={novoItem.categoria}
                        onChange={(e) => setNovoItem(p => ({ ...p, categoria: e.target.value }))}
                    >
                        <option value="" disabled>Selecione</option>
                        {CATEGORIAS_PRODUTO_ESTOQUE.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </Select>
                    <Input
                        label="Preço (R$)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={novoItem.preco}
                        onChange={(e) => setNovoItem(p => ({ ...p, preco: e.target.value }))}
                    />
                    <Input
                        label="Estoque mínimo"
                        type="number"
                        min="0"
                        value={novoItem.estoque_minimo}
                        onChange={(e) => setNovoItem(p => ({ ...p, estoque_minimo: e.target.value }))}
                    />
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setModalNovoItem(false)}>Cancelar</Button>
                        <Button onClick={salvarNovoItem} loading={salvandoNovoItem}>
                            <PackagePlus className="h-4 w-4 mr-2" />
                            Criar Item
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, RefreshCw, History, TrendingUp, Archive, Search, Filter, ChevronLeft, ChevronRight, Printer, ScanBarcode, Building2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Input, Select } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useEstoqueEmpresaScope } from '../../lib/estoqueEmpresaScope';
import { deduplicarDepositosPorUnidade } from '../../lib/estoqueDepositosUnidade';
import { useToast } from '../../lib/ToastStore';
import { escapeHtml } from '../../lib/escapeHtml';
import {
    CATEGORIAS_PRODUTO_ESTOQUE,
    labelCategoriaProdutoEstoque,
} from '../../lib/categoriasProdutoEstoque';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500, 1000, 5000];

type ProdutoEstoque = {
    id: string;
    codigo: string;
    nome: string;
    marca?: string;
    codigo_barras?: string;
    categoria?: string;
    estoque_atual: number;
    estoque_minimo: number;
    observacoes?: string;
    ativo: boolean;
    filial_id?: string | null;
    deposito_id?: string | null;
    ultima_entrada_em?: string | null;
    ultima_entrada_valor_centavos?: number | null;
    valor_custo_centavos?: number | null;
    created_at?: string;
    updated_at?: string;
};

type DepositoMeta = { id: string; nome: string; tipo: string; filial_id: string | null };
type FilialMeta = { id: string; nome: string };

export const EstoqueProdutos: React.FC = () => {
    const navigate = useNavigate();
    const { user, empresa } = useAuth();
    const { showToast } = useToast();
    const { empresaId, empresaIds, dataRevisionEmpresa } = useEstoqueEmpresaScope();
    const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
    const [filiais, setFiliais] = useState<FilialMeta[]>([]);
    const [depositos, setDepositos] = useState<DepositoMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [saldosDetalhados, setSaldosDetalhados] = useState<Record<string, any[]>>({});
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
    const [modalEtiqueta, setModalEtiqueta] = useState(false);
    const [produtoEtiqueta, setProdutoEtiqueta] = useState<ProdutoEstoque | null>(null);
    const [tamanhoSelecionado, setTamanhoSelecionado] = useState<'P' | 'M' | 'G' | 'A4'>('P');

    // Filters and Pagination
    const [searchTerm, setSearchTerm] = useState('');
    const [categoriaFiltro, setCategoriaFiltro] = useState('');
    const [entradaFiltro, setEntradaFiltro] = useState('');
    const [filialFiltro, setFilialFiltro] = useState('');
    const [depositoFiltro, setDepositoFiltro] = useState('');
    const [tipoDepositoFiltro, setTipoDepositoFiltro] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const openRowMenu = (id: string, event: React.MouseEvent) => {
        setSelectedId(id);
        setOpenMenuId(id);
        setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
    };

    const loadProdutos = useCallback(async () => {
        if (!user?.empresa_id || empresaIds.length === 0) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('ser_produtos')
            .select('*')
            .in('empresa_id', empresaIds)
            .eq('ativo', true)
            .order('codigo', { ascending: true });
        if (error) {
            showToast(`Erro ao carregar produtos: ${error.message}`, 'error');
        } else {
            const itens = (data as ProdutoEstoque[]) || [];
            setProdutos(itens);

            // Buscar saldos por depósito
            if (itens.length > 0) {
                const { data: saldos } = await supabase
                    .from('estoque_saldo_deposito')
                    .select('produto_id, quantidade, deposito_id')
                    .in('produto_id', itens.map(i => i.id))
                    .gt('quantidade', 0);
                
                const map: Record<string, any[]> = {};
                (saldos || []).forEach((s: any) => {
                    if (!map[s.produto_id]) map[s.produto_id] = [];
                    map[s.produto_id].push(s);
                });
                setSaldosDetalhados(map);
            }
        }
        setLoading(false);
    }, [user?.empresa_id, empresaIds, showToast]);

    const loadFiliaisDepositos = useCallback(async () => {
        if (!user?.empresa_id || empresaIds.length === 0) return;
        const [fr, dr] = await Promise.all([
            supabase.from('filiais').select('id, nome').in('empresa_id', empresaIds).eq('ativo', true).order('nome'),
            supabase
                .from('estoque_depositos')
                .select('id, nome, tipo, filial_id, filiais ( nome )')
                .in('empresa_id', empresaIds)
                .eq('ativo', true)
                .is('deleted_at', null)
                .order('nome'),
        ]);
        if (!fr.error && fr.data) setFiliais(fr.data as FilialMeta[]);
        if (!dr.error && dr.data) {
            const brutos = (dr.data as any[]).map((d) => ({
                id: d.id as string,
                nome: d.nome as string,
                tipo: d.tipo as string,
                filial_id: d.filial_id as string | null,
                filial_nome: (d.filiais as { nome?: string } | null)?.nome,
            }));
            setDepositos(
                deduplicarDepositosPorUnidade(brutos, empresaId).map((d) => ({
                    id: d.id,
                    nome: d.nome,
                    tipo: d.tipo || 'central',
                    filial_id: d.filial_id,
                })),
            );
        }
    }, [user?.empresa_id, empresaIds, empresaId]);

    useEffect(() => {
        void loadFiliaisDepositos();
    }, [loadFiliaisDepositos, dataRevisionEmpresa]);

    useEffect(() => {
        loadProdutos();
    }, [loadProdutos, dataRevisionEmpresa]);

    const depositoById = useMemo(() => {
        const m: Record<string, DepositoMeta> = {};
        depositos.forEach((d) => { m[d.id] = d; });
        return m;
    }, [depositos]);

    const handleRefresh = useCallback(() => {
        void loadProdutos();
        void loadFiliaisDepositos();
    }, [loadProdutos, loadFiliaisDepositos]);

    const filialById = useMemo(() => {
        const m: Record<string, string> = {};
        filiais.forEach((f) => { m[f.id] = f.nome; });
        return m;
    }, [filiais]);

    const saldoPorUnidade = useCallback(
        (produtoId: string, matcher: (filialNome: string) => boolean) => {
            const saldos = saldosDetalhados[produtoId] || [];
            return saldos
                .filter((s) => {
                    const dep = depositoById[s.deposito_id];
                    const filialNome =
                        (dep?.filial_id && filialById[dep.filial_id]) || dep?.nome || '';
                    return matcher(filialNome.toLowerCase());
                })
                .reduce((acc, s) => acc + (Number(s.quantidade) || 0), 0);
        },
        [saldosDetalhados, depositoById, filialById],
    );

    const totalSaldoProduto = useCallback(
        (produtoId: string, estoqueLegado: number) => {
            const saldos = saldosDetalhados[produtoId] || [];
            const soma = saldos.reduce((acc, s) => acc + (Number(s.quantidade) || 0), 0);
            return soma > 0 ? soma : estoqueLegado;
        },
        [saldosDetalhados],
    );

    const produtosView = useMemo(() => {
        const hoje = new Date().toISOString().slice(0, 10);
        let filtered = produtos.map((item) => {
            const total = totalSaldoProduto(item.id, item.estoque_atual);
            return {
                ...item,
                estoque_atual: total,
                status: total > item.estoque_minimo ? 'ok' : 'baixo',
            };
        });
        
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(p => 
                p.nome.toLowerCase().includes(lower) || 
                p.codigo.toLowerCase().includes(lower) ||
                (p.marca || '').toLowerCase().includes(lower) ||
                (p.codigo_barras || '').toLowerCase().includes(lower)
            );
        }
        
        if (categoriaFiltro) {
            filtered = filtered.filter(p => p.categoria?.toLowerCase() === categoriaFiltro.toLowerCase());
        }

        if (entradaFiltro === 'hoje') {
            filtered = filtered.filter((p) => (p.ultima_entrada_em || '').slice(0, 10) === hoje);
        } else if (entradaFiltro === 'com_entrada') {
            filtered = filtered.filter((p) => Boolean(p.ultima_entrada_em));
        } else if (entradaFiltro === 'sem_entrada') {
            filtered = filtered.filter((p) => !p.ultima_entrada_em);
        }

        if (filialFiltro === '__sem__') {
            filtered = filtered.filter((p) => !p.filial_id);
        } else if (filialFiltro) {
            filtered = filtered.filter((p) => p.filial_id === filialFiltro);
        }

        if (depositoFiltro === '__sem__') {
            filtered = filtered.filter((p) => !p.deposito_id);
        } else if (depositoFiltro) {
            filtered = filtered.filter((p) => p.deposito_id === depositoFiltro);
        } else if (tipoDepositoFiltro) {
            filtered = filtered.filter((p) => {
                if (!p.deposito_id) return false;
                return depositoById[p.deposito_id]?.tipo === tipoDepositoFiltro;
            });
        }
        
        return filtered;
    }, [
        produtos,
        searchTerm,
        categoriaFiltro,
        entradaFiltro,
        filialFiltro,
        depositoFiltro,
        tipoDepositoFiltro,
        depositoById,
        totalSaldoProduto,
    ]);

    const totalPages = Math.ceil(produtosView.length / pageSize);
    const paginatedProdutos = produtosView.slice((page - 1) * pageSize, page * pageSize);

    // Get unique categories for the filter
    const categoriasDisponiveis = useMemo(() => {
        const cats = new Set<string>();
        CATEGORIAS_PRODUTO_ESTOQUE.forEach((c) => cats.add(c.value));
        produtos.forEach((p) => {
            if (p.categoria) cats.add(p.categoria);
        });
        return Array.from(cats).sort((a, b) =>
            labelCategoriaProdutoEstoque(a).localeCompare(labelCategoriaProdutoEstoque(b), 'pt-BR'),
        );
    }, [produtos]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [searchTerm, categoriaFiltro, entradaFiltro, filialFiltro, depositoFiltro, tipoDepositoFiltro]);

    const openModalEtiqueta = (produto: ProdutoEstoque) => {
        setProdutoEtiqueta(produto);
        setModalEtiqueta(true);
        setOpenMenuId(null);
    };

    const handlePrintEtiqueta = (tamanho: 'P' | 'M' | 'G' | 'A4' = 'P') => {
        if (!produtoEtiqueta) return;
        const produto = produtoEtiqueta;
        const codigo = escapeHtml(produto.codigo || 'SEM-CODIGO');
        const codigoBarras = escapeHtml(produto.codigo_barras || '');
        const nome = escapeHtml(produto.nome || '-');
        const marca = escapeHtml(produto.marca || '-');
        const categoria = escapeHtml(produto.categoria || '-');
        const saldo = escapeHtml(String(produto.estoque_atual ?? 0));
        const sizeConfig = {
            P: { width: '50mm', height: '30mm', codeFont: 16, lineFont: 9, titleFont: 10 },
            M: { width: '60mm', height: '40mm', codeFont: 20, lineFont: 10, titleFont: 11 },
            G: { width: '80mm', height: '50mm', codeFont: 24, lineFont: 12, titleFont: 13 },
            A4: { width: '180mm', height: '90mm', codeFont: 34, lineFont: 16, titleFont: 18 },
        }[tamanho];

        const printWindow = window.open('', '_blank', 'width=420,height=620');
        if (!printWindow) {
            showToast('Não foi possível abrir a janela de impressão.', 'warning');
            return;
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Etiqueta ${codigo}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 12px; }
                    @page { size: ${sizeConfig.width} ${sizeConfig.height}; margin: 4mm; }
                    .etiqueta {
                        width: ${sizeConfig.width};
                        min-height: calc(${sizeConfig.height} - 8mm);
                        border: 2px solid #111827;
                        border-radius: 8px;
                        padding: 12px;
                        box-sizing: border-box;
                    }
                    .titulo { font-size: ${sizeConfig.titleFont}px; font-weight: 700; margin-bottom: 8px; }
                    .codigo {
                        font-size: ${sizeConfig.codeFont}px;
                        font-weight: 800;
                        text-align: center;
                        border: 1px dashed #111827;
                        border-radius: 6px;
                        padding: 10px 8px;
                        margin-bottom: 10px;
                        letter-spacing: 1px;
                    }
                    .linha { font-size: ${sizeConfig.lineFont}px; margin: 4px 0; }
                    .rodape { margin-top: 10px; font-size: 10px; color: #4b5563; }
                </style>
            </head>
            <body>
                <div class="etiqueta">
                    <div class="titulo">Etiqueta de Identificação de Produto</div>
                    <div class="codigo">${codigo}</div>
                    ${codigoBarras ? `<div class="linha" style="text-align:center;font-family:monospace;font-size:${sizeConfig.lineFont}px;margin-bottom:6px"><strong>EAN:</strong> ${codigoBarras}</div>` : ''}
                    <div class="linha"><strong>Produto:</strong> ${nome}</div>
                    <div class="linha"><strong>Marca:</strong> ${marca}</div>
                    <div class="linha"><strong>Categoria:</strong> ${categoria}</div>
                    <div class="linha"><strong>Saldo Atual:</strong> ${saldo}</div>
                    <div class="rodape">Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
                </div>
                <script>
                    window.onload = function () {
                        window.print();
                        window.onafterprint = function () { window.close(); };
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        setModalEtiqueta(false);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Estoque de Produtos"
                subtitle={`Empresa: ${empresa?.nome || '—'} — cadastro e acompanhamento de itens por filial e depósito`}
                actionButton={
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" onClick={() => navigate('/estoque/filiais-depositos')}>
                            <Building2 className="h-4 w-4 mr-2" />
                            Filiais e depósitos
                        </Button>
                        <Button variant="outline" onClick={handleRefresh} loading={loading}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Atualizar
                        </Button>
                        <Button onClick={() => navigate('/estoque/produtos/novo')}>
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Produto
                        </Button>
                    </div>
                }
            />

            {/* Filtros */}
            <Card className="p-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <ScanBarcode className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                        <Input
                            placeholder="Buscar por nome, código ou código de barras..."
                            className="pl-9 pr-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-64 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select 
                            value={categoriaFiltro} 
                            onChange={(e) => setCategoriaFiltro(e.target.value)}
                            className="flex-1"
                        >
                            <option value="">Todas as Categorias</option>
                            {categoriasDisponiveis.map((cat) => (
                                <option key={cat} value={cat}>{labelCategoriaProdutoEstoque(cat)}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="w-full md:w-64 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select
                            value={entradaFiltro}
                            onChange={(e) => setEntradaFiltro(e.target.value)}
                            className="flex-1"
                        >
                            <option value="">Todas as entradas</option>
                            <option value="hoje">Com entrada hoje</option>
                            <option value="com_entrada">Com alguma entrada</option>
                            <option value="sem_entrada">Sem entrada</option>
                        </Select>
                    </div>
                </div>
                <div className="flex flex-col lg:flex-row gap-4 pt-1 border-t border-gray-100">
                    <div className="w-full lg:flex-1 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select
                            value={filialFiltro}
                            onChange={(e) => setFilialFiltro(e.target.value)}
                            className="flex-1"
                        >
                            <option value="">Todas as filiais</option>
                            <option value="__sem__">Sem filial vinculada</option>
                            {filiais.map((f) => (
                                <option key={f.id} value={f.id}>{f.nome}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="w-full lg:flex-1 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select
                            value={depositoFiltro}
                            onChange={(e) => {
                                setDepositoFiltro(e.target.value);
                                if (e.target.value) setTipoDepositoFiltro('');
                            }}
                            className="flex-1"
                        >
                            <option value="">Todos os depósitos</option>
                            <option value="__sem__">Sem depósito vinculado</option>
                            {depositos.map((d) => (
                                <option key={d.id} value={d.id}>{d.nome}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="w-full lg:w-72 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                        <Select
                            value={tipoDepositoFiltro}
                            onChange={(e) => {
                                setTipoDepositoFiltro(e.target.value);
                                if (e.target.value) setDepositoFiltro('');
                            }}
                            className="flex-1"
                            disabled={Boolean(depositoFiltro)}
                        >
                            <option value="">Tipo de depósito (qualquer)</option>
                            <option value="central">Central / base</option>
                            <option value="motorista">Estoque motorista / veículo</option>
                            <option value="outro">Outro</option>
                        </Select>
                    </div>
                </div>
            </Card>

            <div className="list-table-shell">
                <div className="overflow-x-auto">
                    <table className="list-table">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Cód. Barras</th>
                                <th>Produto</th>
                                <th>Marca</th>
                                <th>Categoria</th>
                                <th className="text-center bg-blue-50/30">CAT</th>
                                <th className="text-center bg-green-50/30">IPA</th>
                                <th className="text-center bg-amber-50/30">APA</th>
                                <th className="text-right">Total</th>
                                <th className="text-right">Mínimo</th>
                                <th>Última entrada</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                             {paginatedProdutos.map((item) => (
                                <tr 
                                    key={item.id}
                                    onClick={(e) => {
                                        setSelectedId(item.id);
                                        openRowMenu(item.id, e);
                                    }}
                                    onDoubleClick={() => navigate(`/estoque/produtos/${item.id}/editar`)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        openRowMenu(item.id, e);
                                    }}
                                    className={`transition-all cursor-pointer ${openMenuId === item.id || selectedId === item.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-100' : 'hover:bg-gray-50'}`}
                                >
                                    <td className="font-mono text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors">
                                        {item.codigo}
                                    </td>
                                    <td className="text-xs text-gray-500 font-mono">{item.codigo_barras || '-'}</td>
                                    <td className="relative">
                                        <span className="font-medium text-slate-900">
                                            {item.nome}
                                        </span>
                                        
                                        {openMenuId === item.id && (
                                            <DropdownMenuContent 
                                                isOpen={true} 
                                                onClose={() => setOpenMenuId(null)}
                                                position={menuPosition}
                                            >
                                                <DropdownMenuItem onClick={() => { navigate(`/estoque/produtos/${item.id}/editar`); setOpenMenuId(null); }}>
                                                    <Edit className="h-4 w-4 mr-2" /> Editar Produto
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { navigate(`/estoque/movimentacoes?produto=${item.id}`); setOpenMenuId(null); }}>
                                                    <History className="h-4 w-4 mr-2" /> Histórico
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { navigate(`/estoque/movimentacoes?produto=${item.id}`); setOpenMenuId(null); }}>
                                                    <TrendingUp className="h-4 w-4 mr-2" /> Movimentações
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openModalEtiqueta(item)}>
                                                    <Printer className="h-4 w-4 mr-2" /> Imprimir Etiqueta
                                                </DropdownMenuItem>
                                                <DropdownMenuItem variant="danger" onClick={() => { /* archive logic */ setOpenMenuId(null); }}>
                                                    <Archive className="h-4 w-4 mr-2" /> Desativar
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        )}
                                    </td>
                                    <td className="text-sm text-gray-600">{item.marca || '-'}</td>
                                    <td className="text-sm text-gray-600">{labelCategoriaProdutoEstoque(item.categoria)}</td>
                                    <td className="text-center font-medium text-slate-700 bg-blue-50/10">
                                        {(() => {
                                            const val = saldoPorUnidade(item.id, (n) =>
                                                n.includes('catal'),
                                            );
                                            return val > 0 ? val : '-';
                                        })()}
                                    </td>
                                    <td className="text-center font-medium text-slate-700 bg-green-50/10">
                                        {(() => {
                                            const val = saldoPorUnidade(item.id, (n) =>
                                                n.includes('ipameri'),
                                            );
                                            return val > 0 ? val : '-';
                                        })()}
                                    </td>
                                    <td className="text-center font-medium text-slate-700 bg-amber-50/10">
                                        {(() => {
                                            const val = saldoPorUnidade(item.id, (n) =>
                                                n.includes('aparecida'),
                                            );
                                            return val > 0 ? val : '-';
                                        })()}
                                    </td>

                                    <td className="text-right">
                                        <div className={`font-bold ${item.estoque_atual <= item.estoque_minimo ? 'text-amber-600' : 'text-slate-900'}`}>
                                            {item.estoque_atual}
                                        </div>
                                    </td>
                                    <td className="text-right text-gray-600 font-medium">{item.estoque_minimo}</td>
                                    <td>
                                        {item.ultima_entrada_em ? (
                                            <div className="text-xs text-slate-700">
                                                <div>{new Date(item.ultima_entrada_em).toLocaleDateString('pt-BR')}</div>
                                                <div className="font-medium text-slate-900">
                                                    {(Number(item.ultima_entrada_valor_centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400">Sem entradas</span>
                                        )}
                                    </td>
                                    <td>
                                        <Badge variant={item.status === 'ok' ? 'success' : 'warning'}>
                                            {item.status === 'ok' ? 'Disponível' : 'Estoque baixo'}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">
                            Mostrando {(page - 1) * pageSize + 1} a {Math.min(page * pageSize, produtosView.length)} de {produtosView.length} resultados
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 whitespace-nowrap">Itens por página:</span>
                            <select 
                                value={pageSize} 
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="text-xs border rounded px-1 py-0.5 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                            >
                                {PAGE_SIZE_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <span className="text-sm font-medium text-gray-700 px-4">
                            Página <span className="text-blue-600">{page}</span> de {totalPages || 1}
                        </span>
                        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                            Próximo <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Modal de Seleção de Tamanho de Etiqueta */}
            {modalEtiqueta && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md p-6 space-y-4">
                        <h3 className="text-lg font-bold text-slate-900">Selecionar Tamanho da Etiqueta</h3>
                        <p className="text-sm text-slate-600">Escolha o formato ideal para a impressão do item <strong>{produtoEtiqueta?.nome}</strong>:</p>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <button 
                                onClick={() => setTamanhoSelecionado('P')}
                                className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${tamanhoSelecionado === 'P' ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                            >
                                <div className="text-left">
                                    <div className="font-semibold">Pequena (P)</div>
                                    <div className="text-xs text-slate-500">50mm x 30mm - Ideal para itens pequenos</div>
                                </div>
                                {tamanhoSelecionado === 'P' && <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
                            </button>
                            
                            <button 
                                onClick={() => setTamanhoSelecionado('M')}
                                className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${tamanhoSelecionado === 'M' ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                            >
                                <div className="text-left">
                                    <div className="font-semibold">Média (M)</div>
                                    <div className="text-xs text-slate-500">60mm x 40mm - Padrão de prateleira</div>
                                </div>
                                {tamanhoSelecionado === 'M' && <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
                            </button>
                            
                            <button 
                                onClick={() => setTamanhoSelecionado('G')}
                                className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${tamanhoSelecionado === 'G' ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                            >
                                <div className="text-left">
                                    <div className="font-semibold">Grande (G)</div>
                                    <div className="text-xs text-slate-500">80mm x 50mm - Máxima visibilidade</div>
                                </div>
                                {tamanhoSelecionado === 'G' && <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
                            </button>

                            <button 
                                onClick={() => setTamanhoSelecionado('A4')}
                                className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${tamanhoSelecionado === 'A4' ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                            >
                                <div className="text-left">
                                    <div className="font-semibold">Folha A4 / Identificação</div>
                                    <div className="text-xs text-slate-500">Formato grande para caixas ou pallets</div>
                                </div>
                                {tamanhoSelecionado === 'A4' && <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
                            </button>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button variant="outline" onClick={() => setModalEtiqueta(false)}>Cancelar</Button>
                            <Button onClick={() => handlePrintEtiqueta(tamanhoSelecionado)}>
                                <Printer className="h-4 w-4 mr-2" /> Imprimir
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

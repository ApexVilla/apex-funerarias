import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, Plus, Edit2, Trash2, X, Save, Search } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Card, Button, Input, Select, Label, Badge } from '../../components/ui/Components';
import { useFinanceiro, type PlanoContaItem } from '../../lib/FinanceiroStore';
import { EmptyFinanceiro, FinanceiroLoading } from '../../components/financeiro/FinanceiroComponents';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';

const tipoColors: Record<string, string> = {
    ativo: 'bg-blue-100 text-blue-700',
    passivo: 'bg-red-100 text-red-700',
    receita: 'bg-green-100 text-green-700',
    despesa: 'bg-amber-100 text-amber-700',
    patrimonio: 'bg-purple-100 text-purple-700',
    custo: 'bg-orange-100 text-orange-700',
};

interface TreeNodeItem extends PlanoContaItem {
    children: TreeNodeItem[];
}

function buildTree(items: PlanoContaItem[]): TreeNodeItem[] {
    const map = new Map<string, TreeNodeItem>();
    const roots: TreeNodeItem[] = [];

    // First pass: create nodes
    items.forEach((item) => {
        map.set(item.id, { ...item, children: [] });
    });

    // Second pass: link parents and children
    items.forEach((item) => {
        const node = map.get(item.id)!;
        if (item.pai_id && map.has(item.pai_id)) {
            map.get(item.pai_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Sort by code within each level
    const sortNodes = (nodes: TreeNodeItem[]) => {
        nodes.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
        nodes.forEach(node => sortNodes(node.children));
    };

    sortNodes(roots);
    return roots;
}

interface TreeNodeProps {
    node: TreeNodeItem;
    depth: number;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    onEdit: (item: PlanoContaItem) => void;
    onDelete: (id: string, nome: string) => void;
    onAddChild: (pai: PlanoContaItem) => void;
    searchTerm?: string;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, expanded, onToggle, onEdit, onDelete, onAddChild, searchTerm }) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = (searchTerm && searchTerm.trim() !== '') || expanded.has(node.id);
    const indent = depth * 24;

    return (
        <>
            <tr
                className={`group hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors ${!node.aceita_lancamento ? 'font-semibold' : ''} ${depth === 0 ? 'bg-gray-50/50 dark:bg-slate-800/30' : ''}`}
            >
                <td className="py-2 px-4 whitespace-nowrap" style={{ paddingLeft: `${16 + indent}px` }}>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(node.id); }}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 ${!hasChildren ? 'invisible' : ''}`}
                        >
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500 dark:text-slate-400" /> : <ChevronRight className="h-4 w-4 text-gray-500 dark:text-slate-400" />}
                        </button>

                        {hasChildren || !node.aceita_lancamento ? (
                            isExpanded ? <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" /> : <Folder className="h-4 w-4 text-amber-400 flex-shrink-0" />
                        ) : (
                            <FileText className="h-4 w-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        )}
                        <span className="font-mono text-xs text-gray-500 dark:text-slate-400 mr-1">{node.codigo}</span>
                        <span className={`text-gray-900 dark:text-slate-100 ${!node.aceita_lancamento ? 'font-semibold' : ''}`}>
                            {node.nome}
                        </span>
                    </div>
                </td>
                <td className="py-2 px-4 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tipoColors[node.tipo] || 'bg-gray-100 text-gray-600'}`}>
                        {node.tipo}
                    </span>
                </td>
                <td className="py-2 px-4 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400 capitalize">{node.natureza}</td>
                <td className="py-2 px-4 whitespace-nowrap text-center text-xs text-gray-500 dark:text-slate-400">{node.nivel}</td>
                <td className="py-2 px-4 whitespace-nowrap text-center">
                    {node.aceita_lancamento ? (
                        <span className="h-2 w-2 rounded-full bg-green-400 inline-block" title="Aceita Lançamento" />
                    ) : (
                        <span className="h-2 w-2 rounded-full bg-gray-300 inline-block" title="Sintética (Não aceita lançamento)" />
                    )}
                </td>
                <td className="py-2 px-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                        {!node.aceita_lancamento && node.nivel < 5 && (
                            <button onClick={() => onAddChild(node)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Adicionar Subconta">
                                <Plus className="h-4 w-4" />
                            </button>
                        )}
                        {!node.conta_sistema && (
                            <>
                                <button onClick={() => onEdit(node)} className="p-1 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded" title="Editar">
                                    <Edit2 className="h-4 w-4" />
                                </button>
                                <button onClick={() => onDelete(node.id, node.nome)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Excluir">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                </td>
            </tr>
            {isExpanded && node.children.map((child: any) => (
                <TreeNode
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    expanded={expanded}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    searchTerm={searchTerm}
                />
            ))}
        </>
    );
};

export const NaturezasFinanceiras: React.FC = () => {
    const {
        planoContas,
        loadPlanoContas,
        createPlanoConta,
        updatePlanoConta,
        deletePlanoConta,
        loading,
        error: financeiroError,
        empresaId,
    } = useFinanceiro();
    const { showToast } = useToast();
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [editingItem, setEditingItem] = useState<PlanoContaItem | null>(null);
    const [parentItem, setParentItem] = useState<PlanoContaItem | null>(null);

    const [formData, setFormData] = useState<Partial<PlanoContaItem>>({
        codigo: '',
        nome: '',
        tipo: 'despesa',
        natureza: 'devedora',
        nivel: 1,
        aceita_lancamento: true
    });

    useEffect(() => {
        loadPlanoContas();
    }, [loadPlanoContas]);

    const [seeding, setSeeding] = useState(false);

    const handleSeedProfissional = async () => {
        if (!empresaId) return;

        if (!window.confirm("Esta ação criará uma estrutura de Plano de Contas padrão e profissional (Receitas, Despesas Operacionais, Custos, Pessoal, Taxas, etc.) para esta unidade. Códigos já cadastrados serão pulados para preservar seus lançamentos. Deseja continuar?")) {
            return;
        }

        setSeeding(true);
        try {
            // Load latest accounts to ensure we check current state
            await loadPlanoContas();

            // Map code -> id
            const codeToIdMap: Record<string, string> = {};
            // Populate map with existing accounts
            planoContas.forEach(item => {
                codeToIdMap[item.codigo] = item.id;
            });

            const itemsToInsert = [
              // 1. RECEITAS
              { codigo: '1', nome: 'RECEITAS', tipo: 'receita', natureza: 'credora', nivel: 1, aceita_lancamento: false },
              { codigo: '1.1', nome: 'RECEITAS OPERACIONAIS', tipo: 'receita', natureza: 'credora', nivel: 2, pai_codigo: '1', aceita_lancamento: false },
              { codigo: '1.1.01', nome: 'RECEITA DE MENSALIDADES (PLANOS)', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.1', aceita_lancamento: true },
              { codigo: '1.1.02', nome: 'VENDA DE SERVIÇOS FUNERÁRIOS', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.1', aceita_lancamento: true },
              { codigo: '1.1.03', nome: 'TAXAS DE ADESÃO DE PLANOS', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.1', aceita_lancamento: true },
              { codigo: '1.1.04', nome: 'VENDA DE PRODUTOS E PARAMENTOS', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.1', aceita_lancamento: true },
              { codigo: '1.1.05', nome: 'LOCAÇÃO DE SALAS E PARAMENTOS', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.1', aceita_lancamento: true },

              { codigo: '1.2', nome: 'RECEITAS FINANCEIRAS', tipo: 'receita', natureza: 'credora', nivel: 2, pai_codigo: '1', aceita_lancamento: false },
              { codigo: '1.2.01', nome: 'JUROS E MULTAS RECEBIDOS', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.2', aceita_lancamento: true },
              { codigo: '1.2.02', nome: 'RENDIMENTOS DE APLICAÇÕES FINANCEIRAS', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.2', aceita_lancamento: true },

              { codigo: '1.3', nome: 'OUTRAS RECEITAS', tipo: 'receita', natureza: 'credora', nivel: 2, pai_codigo: '1', aceita_lancamento: false },
              { codigo: '1.3.01', nome: 'RECUPERAÇÕES DE DESPESAS', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.3', aceita_lancamento: true },
              { codigo: '1.3.02', nome: 'VENDA DE ATIVOS IMOBILIZADOS', tipo: 'receita', natureza: 'credora', nivel: 3, pai_codigo: '1.3', aceita_lancamento: true },

              // 3. DESPESAS / CUSTOS
              { codigo: '3', nome: 'DESPESAS / CUSTOS', tipo: 'despesa', natureza: 'devedora', nivel: 1, aceita_lancamento: false },
              
              { codigo: '3.1', nome: 'CUSTOS OPERACIONAIS (SERVIÇOS)', tipo: 'despesa', natureza: 'devedora', nivel: 2, pai_codigo: '3', aceita_lancamento: false },
              { codigo: '3.1.01', nome: 'AQUISIÇÃO DE URNAS E ACESSÓRIOS', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.1', aceita_lancamento: true },
              { codigo: '3.1.02', nome: 'FLORES, PARAMENTOS E ORNAMENTAÇÕES', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.1', aceita_lancamento: true },
              { codigo: '3.1.03', nome: 'COMBUSTÍVEIS E LUBRIFICANTES (FROTA)', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.1', aceita_lancamento: true },
              { codigo: '3.1.04', nome: 'MANUTENÇÃO E CONSERVAÇÃO DE VEÍCULOS', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.1', aceita_lancamento: true },
              { codigo: '3.1.05', nome: 'TAXAS DE CEMITÉRIO, CREMATÓRIO E REGISTROS', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.1', aceita_lancamento: true },
              { codigo: '3.1.06', nome: 'TANATOPRAXIA E PREPARAÇÃO DE CORPO', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.1', aceita_lancamento: true },

              { codigo: '3.2', nome: 'DESPESAS COM PESSOAL', tipo: 'despesa', natureza: 'devedora', nivel: 2, pai_codigo: '3', aceita_lancamento: false },
              { codigo: '3.2.01', nome: 'SALÁRIOS E ORDENADOS', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.2', aceita_lancamento: true },
              { codigo: '3.2.02', nome: 'COMISSÕES DE VENDAS E COBRANÇA', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.2', aceita_lancamento: true },
              { codigo: '3.2.03', nome: 'ENCARGOS SOCIAIS (INSS, FGTS, DÉCIMO TERCEIRO)', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.2', aceita_lancamento: true },
              { codigo: '3.2.04', nome: 'BENEFÍCIOS (VALE REFEIÇÃO, TRANSPORTE, SAÚDE)', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.2', aceita_lancamento: true },
              { codigo: '3.2.05', nome: 'PRÓ-LABORE (SÓCIOS)', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.2', aceita_lancamento: true },
              { codigo: '3.2.06', nome: 'FARDAMENTOS E EQUIPAMENTOS DE SEGURANÇA', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.2', aceita_lancamento: true },

              { codigo: '3.3', nome: 'DESPESAS ADMINISTRATIVAS', tipo: 'despesa', natureza: 'devedora', nivel: 2, pai_codigo: '3', aceita_lancamento: false },
              { codigo: '3.3.01', nome: 'ALUGUÉIS E CONDOMÍNIOS', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.3', aceita_lancamento: true },
              { codigo: '3.3.02', nome: 'ÁGUA, ENERGIA, INTERNET E TELEFONE', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.3', aceita_lancamento: true },
              { codigo: '3.3.03', nome: 'SOFTWARE, SAAS E SISTEMAS DE GESTÃO', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.3', aceita_lancamento: true },
              { codigo: '3.3.04', nome: 'MATERIAL DE ESCRITÓRIO E EXPEDIENTE', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.3', aceita_lancamento: true },
              { codigo: '3.3.05', nome: 'SERVIÇOS DE TERCEIROS (CONTABILIDADE, JURÍDICO)', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.3', aceita_lancamento: true },
              { codigo: '3.3.06', nome: 'CONSERVAÇÃO, LIMPEZA E PEQUENAS REFORMAS', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.3', aceita_lancamento: true },
              { codigo: '3.3.07', nome: 'DESPESAS DE VIAGEM, HOSPEDAGEM E ALIMENTAÇÃO', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.3', aceita_lancamento: true },

              { codigo: '3.4', nome: 'DESPESAS TRIBUTÁRIAS', tipo: 'despesa', natureza: 'devedora', nivel: 2, pai_codigo: '3', aceita_lancamento: false },
              { codigo: '3.4.01', nome: 'IMPOSTOS E CONTRIBUIÇÕES FEDERAIS (SIMPLES/ISS/DAS)', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.4', aceita_lancamento: true },
              { codigo: '3.4.02', nome: 'TAXAS E LICENÇAS ESTADUAIS E MUNICIPAIS', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.4', aceita_lancamento: true },

              { codigo: '3.5', nome: 'DESPESAS FINANCEIRAS', tipo: 'despesa', natureza: 'devedora', nivel: 2, pai_codigo: '3', aceita_lancamento: false },
              { codigo: '3.5.01', nome: 'TARIFAS BANCÁRIAS E TAXAS DE CARTÃO/PIX', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.5', aceita_lancamento: true },
              { codigo: '3.5.02', nome: 'JUROS E MULTAS DE MORA DE OBRIGAÇÕES', tipo: 'despesa', natureza: 'devedora', nivel: 3, pai_codigo: '3.5', aceita_lancamento: true }
            ];

            let countInserted = 0;
            
            // Loop by levels: level 1, then level 2, then level 3 to ensure parents exist
            for (let currentLevel = 1; currentLevel <= 3; currentLevel++) {
                const levelItems = itemsToInsert.filter(i => i.nivel === currentLevel);
                for (const item of levelItems) {
                    // Check if it already exists
                    let id = codeToIdMap[item.codigo];
                    if (!id) {
                        // Find parent id
                        const pai_id = item.pai_codigo ? codeToIdMap[item.pai_codigo] : null;
                        
                        const payload = {
                            empresa_id: empresaId,
                            codigo: item.codigo,
                            nome: item.nome,
                            tipo: item.tipo,
                            natureza: item.natureza,
                            nivel: item.nivel,
                            pai_id,
                            aceita_lancamento: item.aceita_lancamento,
                            conta_sistema: false,
                            ativo: true
                        };

                        const { data: insertedData, error: insertError } = await supabase
                            .from('fin_plano_contas')
                            .insert(payload)
                            .select('id')
                            .single();
                        
                        if (insertError) {
                            console.error(`Error inserting ${item.codigo}:`, insertError);
                            throw insertError;
                        }
                        
                        id = insertedData.id;
                        codeToIdMap[item.codigo] = id;
                        countInserted++;
                    }
                }
            }

            await loadPlanoContas();
            showToast(`Estrutura profissional criada com sucesso! ${countInserted} novas naturezas adicionadas.`, 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erro ao gerar plano padrão.', 'error');
        } finally {
            setSeeding(false);
        }
    };

    // Helper to check if a node or any of its children match the search term
    const matchesSearch = (node: TreeNodeItem, term: string): boolean => {
        const normalizedTerm = term.toLowerCase().trim();
        return (
            node.nome.toLowerCase().includes(normalizedTerm) || 
            node.codigo.toLowerCase().includes(normalizedTerm) ||
            node.children.some(child => matchesSearch(child, term))
        );
    };

    // Helper to filter the tree and return only matching branches
    const getFilteredTree = (nodes: TreeNodeItem[], term: string): TreeNodeItem[] => {
        if (!term.trim()) return nodes;
        
        return nodes
            .filter(node => matchesSearch(node, term))
            .map(node => ({
                ...node,
                children: getFilteredTree(node.children, term)
            }));
    };

    const tree = buildTree(planoContas);
    const filteredTree = getFilteredTree(tree, searchTerm);

    const toggleExpand = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAll = () => {
        setExpanded(new Set(planoContas.filter(c => !c.aceita_lancamento).map(c => c.id)));
    };

    const collapseAll = () => {
        setExpanded(new Set());
    };

    const getNextCode = (parent: PlanoContaItem | null): string => {
        if (!parent) {
            // Root nodes (1, 2, 3...)
            const roots = planoContas.filter(c => !c.pai_id);
            if (roots.length === 0) return '1';

            const lastCode = roots
                .map(r => parseInt(r.codigo))
                .filter(n => !isNaN(n))
                .sort((a, b) => b - a)[0];

            return (lastCode + 1).toString();
        } else {
            // Child nodes (1.1, 1.2...)
            const siblings = planoContas.filter(c => c.pai_id === parent.id);
            let nextSuffix = 1;

            if (siblings.length > 0) {
                // Extract the last part of the code (e.g., "1.2.3" -> 3)
                const suffixes = siblings
                    .map(s => {
                        const parts = s.codigo.split('.');
                        return parseInt(parts[parts.length - 1]);
                    })
                    .filter(n => !isNaN(n))
                    .sort((a, b) => b - a);

                if (suffixes.length > 0) {
                    nextSuffix = suffixes[0] + 1;
                }
            }
            return `${parent.codigo}.${nextSuffix}`;
        }
    };

    const handleAddRoot = () => {
        setEditingItem(null);
        setParentItem(null);
        setFormData({
            codigo: getNextCode(null),
            nome: '',
            tipo: 'despesa',
            natureza: 'devedora',
            nivel: 1,
            aceita_lancamento: false,
            conta_sistema: false
        });
        setIsModalOpen(true);
    };

    const handleAddChild = (parent: PlanoContaItem) => {
        setEditingItem(null);
        setParentItem(parent);

        setFormData({
            codigo: getNextCode(parent),
            nome: '',
            tipo: parent.tipo,
            natureza: parent.natureza,
            nivel: parent.nivel + 1,
            pai_id: parent.id,
            aceita_lancamento: true,
            conta_sistema: false
        });
        setIsModalOpen(true);
    };

    const handleEdit = (item: PlanoContaItem) => {
        setEditingItem(item);
        setParentItem(planoContas.find(p => p.id === item.pai_id) || null);
        setFormData({
            ...item
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string, nome: string) => {
        if (!confirm(`Tem certeza que deseja excluir "${nome}"?`)) return;
        try {
            await deletePlanoConta(id);
            showToast('Natureza excluída.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erro ao excluir natureza.', 'error');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!empresaId) {
            showToast('Selecione a unidade (empresa) no topo da tela antes de salvar.', 'warning');
            return;
        }
        const nome = (formData.nome || '').trim();
        if (!nome) {
            showToast('Informe o nome da natureza.', 'warning');
            return;
        }

        setSalvando(true);
        try {
            if (editingItem) {
                await updatePlanoConta(editingItem.id, formData);
                showToast('Natureza atualizada.', 'success');
            } else {
                await createPlanoConta(formData);
                showToast('Natureza cadastrada.', 'success');
            }
            setIsModalOpen(false);
            if (formData.pai_id && !editingItem) {
                setExpanded((prev) => new Set(prev).add(formData.pai_id!));
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Erro ao salvar natureza.', 'error');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Naturezas Financeiras"
                subtitle="Estrutura do plano de contas para receitas e despesas"
                actionButton={
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={collapseAll} variant="outline" size="sm">
                            Recolher
                        </Button>
                        <Button onClick={expandAll} variant="outline" size="sm">
                            Expandir
                        </Button>
                        {empresaId && (
                            <Button onClick={handleSeedProfissional} variant="outline" size="sm" disabled={seeding}>
                                {seeding ? 'Gerando...' : 'Gerar Plano Profissional'}
                            </Button>
                        )}
                        <Button onClick={handleAddRoot} variant="primary" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Nova Natureza Raiz
                        </Button>
                    </div>
                }
            />

            {financeiroError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {financeiroError}
                </div>
            )}

            {!empresaId && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Selecione a unidade no seletor do topo para cadastrar naturezas financeiras.
                </div>
            )}

            {planoContas.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-slate-800">
                    <div className="relative w-full sm:max-w-xs">
                        <Input
                            placeholder="Pesquisar por nome ou código..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                type="button"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                        {searchTerm ? (
                            <>Encontradas <span className="font-semibold">{filteredTree.length}</span> ramificações correspondentes</>
                        ) : (
                            <>Exibindo <span className="font-semibold">{planoContas.length}</span> naturezas registradas</>
                        )}
                    </div>
                </div>
            )}

            {loading && planoContas.length === 0 ? (
                <FinanceiroLoading />
            ) : filteredTree.length > 0 ? (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-slate-300">Código / Nome</th>
                                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-slate-300 w-28">Tipo</th>
                                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-slate-300 w-24">Natureza</th>
                                    <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-slate-300 w-16">Nível</th>
                                    <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-slate-300 w-24">Lançável</th>
                                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-slate-300 w-24">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                {filteredTree.map((node) => (
                                    <TreeNode
                                        key={node.id}
                                        node={node}
                                        depth={0}
                                        expanded={expanded}
                                        onToggle={toggleExpand}
                                        onEdit={handleEdit}
                                        onDelete={handleDelete}
                                        onAddChild={handleAddChild}
                                        searchTerm={searchTerm}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : planoContas.length > 0 ? (
                <EmptyFinanceiro
                    icon={<Search className="h-8 w-8 text-gray-400" />}
                    title="Nenhum resultado encontrado"
                    description={`Nenhuma natureza coincide com a busca "${searchTerm}".`}
                    action={
                        <Button onClick={() => setSearchTerm('')} variant="outline">
                            Limpar Busca
                        </Button>
                    }
                />
            ) : (
                <EmptyFinanceiro
                    icon={<FileText className="h-8 w-8 text-gray-400" />}
                    title="Nenhuma natureza cadastrada"
                    description="Comece adicionando uma natureza raiz."
                    action={
                        <Button onClick={handleAddRoot} variant="outline">
                            Adicionar Natureza
                        </Button>
                    }
                />
            )}

            {/* Modal de Criação/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between p-4 border-b">
                            <div className="flex flex-col">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    {editingItem ? 'Editar Natureza' : 'Nova Natureza'}
                                </h3>
                                <span className="text-xs text-gray-500">
                                    {editingItem ? 'Alterar dados da conta' : 'Cadastrar nova conta no plano'}
                                </span>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-4 space-y-4">
                            {financeiroError && (
                                <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                                    {financeiroError}
                                </p>
                            )}
                            {/* Tipo de Cadastro (Folder vs File) */}
                            <div className="grid grid-cols-2 gap-3 mb-4 p-1 bg-gray-100 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, aceita_lancamento: false })}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${!formData.aceita_lancamento
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    <Folder className="h-4 w-4" />
                                    Pasta (Grupo)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, aceita_lancamento: true })}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${formData.aceita_lancamento
                                        ? 'bg-white text-blue-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    <FileText className="h-4 w-4" />
                                    Conta (Natureza)
                                </button>
                            </div>

                            {/* Pasta Pai (Parent Select) */}
                            <div>
                                <Label>Pasta Pai (Superior)</Label>
                                <Select
                                    value={formData.pai_id || ''}
                                    onChange={(e) => {
                                        const newPaiId = e.target.value || null;
                                        // Find parent to inherit properties
                                        const parent = newPaiId ? planoContas.find(c => c.id === newPaiId) : null;

                                        const newData = {
                                            ...formData,
                                            pai_id: newPaiId,
                                            codigo: getNextCode(parent || null),
                                            tipo: parent ? parent.tipo : 'receita', // Inherit or default
                                            natureza: parent ? parent.natureza : 'credora', // Inherit or default
                                            nivel: parent ? parent.nivel + 1 : 1,
                                        };
                                        setFormData(newData);
                                        setParentItem(parent || null);
                                    }}
                                    disabled={!!editingItem && !!formData.pai_id} // Disable changing parent on edit for now to avoid complexity
                                >
                                    <option value="">Nenhuma (Raiz)</option>
                                    {planoContas
                                        .filter(c => !c.aceita_lancamento && c.id !== editingItem?.id) // Synthetic only, exclude self
                                        .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
                                        .map(account => (
                                            <option key={account.id} value={account.id}>
                                                {account.codigo} - {account.nome}
                                            </option>
                                        ))
                                    }
                                </Select>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1">
                                    <Label>Código</Label>
                                    <Input
                                        value={formData.codigo}
                                        readOnly
                                        className="bg-gray-50 font-mono text-gray-500 cursor-not-allowed"
                                        title="Gerado automaticamente"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label>Nome</Label>
                                    <Input
                                        value={formData.nome}
                                        onChange={e => setFormData({ ...formData, nome: e.target.value })}
                                        placeholder={!formData.aceita_lancamento ? "Ex: Despesas Administrativas" : "Ex: Material de Escritório"}
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Tipo</Label>
                                    <Select
                                        value={formData.tipo}
                                        onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                                        disabled={!!formData.pai_id} // Locked if parent selected
                                        className={formData.pai_id ? "bg-gray-50" : ""}
                                    >
                                        <option value="receita">Receita</option>
                                        <option value="despesa">Despesa</option>
                                        <option value="ativo">Ativo</option>
                                        <option value="passivo">Passivo</option>
                                        <option value="patrimonio">Patrimônio</option>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Natureza</Label>
                                    <Select
                                        value={formData.natureza}
                                        onChange={e => setFormData({ ...formData, natureza: e.target.value })}
                                        disabled={!!formData.pai_id} // Locked if parent selected
                                        className={formData.pai_id ? "bg-gray-50" : ""}
                                    >
                                        <option value="credora">Credora</option>
                                        <option value="devedora">Devedora</option>
                                    </Select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t mt-2">
                                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" variant="primary" loading={salvando} disabled={salvando || !empresaId}>
                                    <Save className="h-4 w-4 mr-2" />
                                    Salvar
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

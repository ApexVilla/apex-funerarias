import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Card, Badge } from '../../components/ui/Components';
import { useFinanceiro, type PlanoContaItem } from '../../lib/FinanceiroStore';
import { EmptyFinanceiro, FinanceiroLoading } from '../../components/financeiro/FinanceiroComponents';

const tipoColors: Record<string, string> = {
    ativo: 'bg-blue-100 text-blue-700',
    passivo: 'bg-red-100 text-red-700',
    receita: 'bg-green-100 text-green-700',
    despesa: 'bg-amber-100 text-amber-700',
    patrimonio: 'bg-purple-100 text-purple-700',
    custo: 'bg-orange-100 text-orange-700',
};

function buildTree(items: PlanoContaItem[]): (PlanoContaItem & { children: PlanoContaItem[] })[] {
    const map = new Map<string, PlanoContaItem & { children: PlanoContaItem[] }>();
    const roots: (PlanoContaItem & { children: PlanoContaItem[] })[] = [];

    items.forEach((item) => {
        map.set(item.id, { ...item, children: [] });
    });

    items.forEach((item) => {
        const node = map.get(item.id)!;
        if (item.pai_id && map.has(item.pai_id)) {
            map.get(item.pai_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    });

    return roots;
}

interface TreeNodeProps {
    node: PlanoContaItem & { children: PlanoContaItem[] };
    depth: number;
    expanded: Set<string>;
    onToggle: (id: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, expanded, onToggle }) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const indent = depth * 24;

    return (
        <>
            <tr
                className={`hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors ${!node.aceita_lancamento ? 'font-semibold' : ''} ${depth === 0 ? 'bg-gray-50/50 dark:bg-slate-800/30' : ''}`}
                style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                onClick={() => hasChildren && onToggle(node.id)}
            >
                <td className="py-2.5 px-4" style={{ paddingLeft: `${16 + indent}px` }}>
                    <div className="flex items-center gap-2">
                        {hasChildren ? (
                            isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400 dark:text-slate-500 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        ) : (
                            <span className="w-4" />
                        )}
                        {hasChildren ? (
                            isExpanded ? <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" /> : <Folder className="h-4 w-4 text-amber-400 flex-shrink-0" />
                        ) : (
                            <FileText className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                        )}
                        <span className="font-mono text-xs text-gray-500 dark:text-slate-400 mr-2">{node.codigo}</span>
                        <span className={`text-gray-900 dark:text-slate-100 ${!node.aceita_lancamento ? 'font-semibold' : ''}`}>
                            {node.nome}
                        </span>
                    </div>
                </td>
                <td className="py-2.5 px-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tipoColors[node.tipo] || 'bg-gray-100 text-gray-600'}`}>
                        {node.tipo}
                    </span>
                </td>
                <td className="py-2.5 px-4 text-xs text-gray-500 dark:text-slate-400 capitalize">{node.natureza}</td>
                <td className="py-2.5 px-4 text-center text-xs text-gray-500 dark:text-slate-400">{node.nivel}</td>
                <td className="py-2.5 px-4 text-center">
                    {node.aceita_lancamento ? (
                        <span className="h-2 w-2 rounded-full bg-green-400 inline-block" />
                    ) : (
                        <span className="h-2 w-2 rounded-full bg-gray-300 inline-block" />
                    )}
                </td>
            </tr>
            {isExpanded && node.children.map((child: any) => (
                <TreeNode key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} />
            ))}
        </>
    );
};

export const PlanoContas: React.FC = () => {
    const { planoContas, loadPlanoContas, loading } = useFinanceiro();
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadPlanoContas();
    }, [loadPlanoContas]);

    const tree = buildTree(planoContas);

    const toggleExpand = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAll = () => {
        setExpanded(new Set(planoContas.filter(c => !c.aceita_lancamento || c.nivel < 3).map(c => c.id)));
    };

    const collapseAll = () => {
        setExpanded(new Set());
    };

    if (loading && planoContas.length === 0) return <FinanceiroLoading />;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Plano de Contas"
                subtitle={`${planoContas.length} contas cadastradas — estrutura hierárquica`}
                actionButton={
                    <div className="flex gap-2">
                        <button onClick={expandAll} className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 border rounded-md hover:bg-blue-50 transition-colors">
                            Expandir Tudo
                        </button>
                        <button onClick={collapseAll} className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 font-medium px-3 py-1.5 border border-gray-200 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                            Recolher
                        </button>
                    </div>
                }
            />

            {tree.length > 0 ? (
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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                {tree.map((node) => (
                                    <TreeNode key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggleExpand} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : (
                <EmptyFinanceiro
                    icon={<FileText className="h-8 w-8 text-gray-400" />}
                    title="Plano de contas vazio"
                    description="O plano de contas ainda não foi configurado."
                />
            )}
        </div>
    );
};

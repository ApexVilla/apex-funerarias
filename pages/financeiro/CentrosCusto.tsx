import React, { useEffect, useMemo, useState } from 'react';
import { Plus, PieChart, Building, Pencil, Search, Filter, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge, Input, Select } from '../../components/ui/Components';
import { useFinanceiro, formatCentavos, type CentroCusto } from '../../lib/FinanceiroStore';
import { EmptyFinanceiro, FinanceiroLoading } from '../../components/financeiro/FinanceiroComponents';
import { NovoCentroCustoModal } from '../../components/financeiro/NovoCentroCustoModal';

const tipoLabels: Record<string, string> = {
    administrativo: 'Administrativo',
    comercial: 'Comercial',
    operacional: 'Operacional',
    marketing: 'Marketing',
    ti: 'Tecnologia',
    financeiro: 'Financeiro',
    rh: 'Recursos Humanos',
    diretoria: 'Diretoria',
    outros: 'Outros',
};

const tipoIcons: Record<string, string> = {
    administrativo: '🏢',
    comercial: '💼',
    operacional: '⚙️',
    marketing: '📣',
    ti: '💻',
    financeiro: '💰',
    rh: '👥',
    diretoria: '🏛️',
    outros: '📌',
};

export const CentrosCusto: React.FC = () => {
    const { centrosCusto, loadCentrosCusto, loading } = useFinanceiro();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<CentroCusto | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [tipoFilter, setTipoFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | 'ativos' | 'inativos'>('');

    useEffect(() => {
        loadCentrosCusto();
    }, [loadCentrosCusto]);

    const handleOpenNovo = () => {
        setEditing(null);
        setShowModal(true);
    };

    const handleEdit = (cc: CentroCusto) => {
        setEditing(cc);
        setShowModal(true);
    };

    const handleSuccess = () => {
        loadCentrosCusto();
    };

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return centrosCusto.filter(cc => {
            const matchSearch =
                !term ||
                cc.nome.toLowerCase().includes(term) ||
                cc.codigo.toLowerCase().includes(term);
            const matchTipo = !tipoFilter || cc.tipo === tipoFilter;
            const matchStatus =
                !statusFilter ||
                (statusFilter === 'ativos' && cc.ativo) ||
                (statusFilter === 'inativos' && !cc.ativo);
            return matchSearch && matchTipo && matchStatus;
        });
    }, [centrosCusto, searchTerm, tipoFilter, statusFilter]);

    if (loading && centrosCusto.length === 0) return <FinanceiroLoading />;

    const totalOrcamento = centrosCusto.reduce((s, c) => s + c.orcamento_mensal_centavos, 0);
    const ativos = centrosCusto.filter(c => c.ativo).length;
    const tiposUsados = Array.from(new Set(centrosCusto.map(c => String(c.tipo || '')))).filter(Boolean);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Centros de Custo"
                subtitle="Controle de orçamentos e alocação de despesas"
                actionButton={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => loadCentrosCusto()} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                        <Button onClick={handleOpenNovo}>
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Centro
                        </Button>
                    </div>
                }
            />

            {/* Total Budget Card */}
            {centrosCusto.length > 0 && (
                <Card className="p-6 bg-gradient-to-r from-sky-50 to-blue-50 border-sky-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-sky-700 font-medium">Orçamento Mensal Total</p>
                            <p className="text-3xl font-bold text-sky-900 mt-1">{formatCentavos(totalOrcamento)}</p>
                            <p className="text-sm text-sky-600 mt-1">
                                {ativos} centro{ativos === 1 ? '' : 's'} de custo ativo{ativos === 1 ? '' : 's'} •{' '}
                                {centrosCusto.length} no total
                            </p>
                        </div>
                        <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center">
                            <PieChart className="h-7 w-7 text-sky-600" />
                        </div>
                    </div>
                </Card>
            )}

            {/* Filtros */}
            {centrosCusto.length > 0 && (
                <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar por nome ou código..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-48">
                        <Select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
                            <option value="">Todos os tipos</option>
                            {(tiposUsados as string[]).map(t => (
                                <option key={t} value={t}>
                                    {tipoIcons[t] || '📌'} {tipoLabels[t] || t}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="w-full md:w-44">
                        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                            <option value="">Status: Todos</option>
                            <option value="ativos">Apenas ativos</option>
                            <option value="inativos">Apenas inativos</option>
                        </Select>
                    </div>
                    {(searchTerm || tipoFilter || statusFilter) && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSearchTerm('');
                                setTipoFilter('');
                                setStatusFilter('');
                            }}
                        >
                            <Filter className="h-4 w-4 mr-2" />
                            Limpar
                        </Button>
                    )}
                </div>
            )}

            {/* Cost Centers Grid */}
            {centrosCusto.length > 0 ? (
                filtered.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filtered.map((cc) => {
                            const orcamento = cc.orcamento_mensal_centavos;
                            return (
                                <Card
                                    key={cc.id}
                                    className={`p-5 hover:shadow-lg transition-all duration-200 cursor-pointer relative group ${
                                        !cc.ativo ? 'opacity-60' : ''
                                    }`}
                                    onClick={() => handleEdit(cc)}
                                >
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEdit(cc);
                                        }}
                                        className="absolute top-3 right-3 p-1.5 rounded-md bg-white/80 opacity-0 group-hover:opacity-100 hover:bg-sky-50 hover:text-sky-600 transition-all"
                                        title="Editar"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>

                                    <div className="flex items-start justify-between mb-4 pr-6">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-2xl shrink-0">{tipoIcons[cc.tipo] || '📌'}</span>
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-gray-900 dark:text-slate-100 truncate">{cc.nome}</h3>
                                                <p className="text-xs text-gray-500 dark:text-slate-400 font-mono truncate">{cc.codigo}</p>
                                            </div>
                                        </div>
                                        <Badge variant={cc.ativo ? 'success' : 'outline'}>
                                            {cc.ativo ? 'Ativo' : 'Inativo'}
                                        </Badge>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide">Tipo</span>
                                            <span className="text-xs font-medium text-gray-700 dark:text-slate-300">
                                                {tipoLabels[cc.tipo] || cc.tipo}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide">Orçamento</span>
                                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">
                                                {orcamento > 0 ? formatCentavos(orcamento) : 'Não definido'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Budget bar placeholder */}
                                    {orcamento > 0 && (
                                        <div className="mt-4">
                                            <div className="w-full bg-gray-100 rounded-full h-2">
                                                <div className="bg-sky-500 rounded-full h-2" style={{ width: '0%' }} />
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">0% utilizado</p>
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyFinanceiro
                        icon={<Filter className="h-8 w-8 text-gray-400" />}
                        title="Nenhum centro encontrado"
                        description="Ajuste os filtros para visualizar centros de custo."
                        action={
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearchTerm('');
                                    setTipoFilter('');
                                    setStatusFilter('');
                                }}
                            >
                                Limpar Filtros
                            </Button>
                        }
                    />
                )
            ) : (
                <EmptyFinanceiro
                    icon={<Building className="h-8 w-8 text-gray-400" />}
                    title="Nenhum centro de custo"
                    description="Cadastre centros de custo para controlar seus orçamentos."
                    action={
                        <Button onClick={handleOpenNovo}>
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Centro
                        </Button>
                    }
                />
            )}

            {showModal && (
                <NovoCentroCustoModal
                    centro={editing}
                    onClose={() => {
                        setShowModal(false);
                        setEditing(null);
                    }}
                    onSuccess={handleSuccess}
                />
            )}
        </div>
    );
};

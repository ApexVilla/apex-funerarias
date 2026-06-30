import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    DollarSign, TrendingUp, TrendingDown, AlertTriangle,
    ArrowUpRight, CreditCard, Receipt, Building2,
    Coins, FileText, PieChart, Landmark
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Card } from '../../components/ui/Components';
import { useFinanceiro, formatCentavos } from '../../lib/FinanceiroStore';
import { StatCard, FinanceiroLoading } from '../../components/financeiro/FinanceiroComponents';
import { useFilial } from '../../lib/FilialContext';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';

export const FinanceiroDashboard: React.FC = () => {
    const { dashboard, loadDashboard, loading } = useFinanceiro();
    const { filialId, filialNome, isTodasFiliais } = useFilial();
    const filialAtiva = Boolean(filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    if (loading && !dashboard) return <FinanceiroLoading />;

    const stats = dashboard || {
        saldo_total_centavos: 0,
        contas_bancarias: 0,
        receitas_mes_centavos: 0,
        receitas_previstas_mes_centavos: 0,
        despesas_mes_centavos: 0,
        despesas_previstas_mes_centavos: 0,
        total_vencido_receber_centavos: 0,
        total_vencido_pagar_centavos: 0,
        titulos_receber_abertos: 0,
        titulos_pagar_abertos: 0,
        aprovacoes_pendentes: 0,
        conciliacoes_pendentes: 0,
    };

    const quickLinks = [
        { icon: Receipt, label: 'Contas a Receber', path: '/financeiro/contas-receber', color: 'bg-green-500', count: stats.titulos_receber_abertos },
        { icon: CreditCard, label: 'Contas a Pagar', path: '/financeiro/contas-pagar', color: 'bg-red-500', count: stats.titulos_pagar_abertos },
        { icon: Coins, label: 'Fluxo de Caixa', path: '/financeiro/fluxo-caixa', color: 'bg-blue-500', count: null },
        { icon: Building2, label: 'Contas Bancárias', path: '/financeiro/contas-bancarias', color: 'bg-purple-500', count: stats.contas_bancarias },
        { icon: FileText, label: 'Plano de Contas', path: '/financeiro/plano-contas', color: 'bg-amber-500', count: null },
        { icon: PieChart, label: 'Centros de Custo', path: '/financeiro/centros-custo', color: 'bg-sky-500', count: null },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Dashboard Financeiro"
                subtitle={
                    filialAtiva
                        ? `Indicadores da unidade ${filialNome} (mês atual). Saldo bancário é da empresa inteira.`
                        : 'Visão geral da saúde financeira da empresa'
                }
            />

            {/* KPIs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Saldo Total"
                    value={formatCentavos(stats.saldo_total_centavos)}
                    sublabel={`${stats.contas_bancarias} conta(s) ativa(s)`}
                    icon={<Landmark className="h-6 w-6" />}
                    color="blue"
                />
                <StatCard
                    label="Receitas do Mês"
                    value={formatCentavos(stats.receitas_mes_centavos)}
                    sublabel={`${formatCentavos(stats.receitas_previstas_mes_centavos)} previsto`}
                    icon={<TrendingUp className="h-6 w-6" />}
                    color="green"
                />
                <StatCard
                    label="Despesas do Mês"
                    value={formatCentavos(stats.despesas_mes_centavos)}
                    sublabel={`${formatCentavos(stats.despesas_previstas_mes_centavos)} previsto`}
                    icon={<TrendingDown className="h-6 w-6" />}
                    color="red"
                />
                <StatCard
                    label="Inadimplência"
                    value={formatCentavos(stats.total_vencido_receber_centavos)}
                    sublabel={`${formatCentavos(stats.total_vencido_pagar_centavos)} a pagar vencido`}
                    icon={<AlertTriangle className="h-6 w-6" />}
                    color="amber"
                />
            </div>

            {/* Quick Links Grid */}
            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Módulos Financeiros</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {quickLinks.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className="group relative flex items-center gap-4 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-200"
                        >
                            <div className={`h-12 w-12 rounded-lg ${link.color} flex items-center justify-center flex-shrink-0`}>
                                <link.icon className="h-6 w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    {link.label}
                                </p>
                                {link.count !== null && (
                                    <p className="text-sm text-gray-500">{link.count} aberto(s)</p>
                                )}
                            </div>
                            <ArrowUpRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                        </Link>
                    ))}
                </div>
            </div>

            {/* Resumo Mensal */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-slate-100 flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-500" />
                        Resultado do Mês
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-3 border-b">
                            <span className="text-sm text-gray-600">Receitas Realizadas</span>
                            <span className="font-semibold text-green-600">{formatCentavos(stats.receitas_mes_centavos)}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b">
                            <span className="text-sm text-gray-600">Despesas Realizadas</span>
                            <span className="font-semibold text-red-600">- {formatCentavos(stats.despesas_mes_centavos)}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 bg-gray-50 rounded-lg px-3">
                            <span className="font-medium text-gray-900 dark:text-slate-100">Resultado Líquido</span>
                            <span className={`text-xl font-bold ${(stats.receitas_mes_centavos - stats.despesas_mes_centavos) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCentavos(stats.receitas_mes_centavos - stats.despesas_mes_centavos)}
                            </span>
                        </div>
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-slate-100 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        Pendências
                    </h3>
                    <div className="space-y-3">
                        <Link to="/financeiro/contas-receber" className="flex justify-between items-center p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-amber-200 flex items-center justify-center">
                                    <span className="text-sm font-bold text-amber-800">{stats.titulos_receber_abertos}</span>
                                </div>
                                <span className="text-sm font-medium text-gray-900 dark:text-slate-100">Títulos a Receber Abertos</span>
                            </div>
                            <ArrowUpRight className="h-4 w-4 text-gray-400" />
                        </Link>
                        <Link to="/financeiro/contas-pagar" className="flex justify-between items-center p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-red-200 flex items-center justify-center">
                                    <span className="text-sm font-bold text-red-800">{stats.titulos_pagar_abertos}</span>
                                </div>
                                <span className="text-sm font-medium text-gray-900 dark:text-slate-100">Títulos a Pagar Abertos</span>
                            </div>
                            <ArrowUpRight className="h-4 w-4 text-gray-400" />
                        </Link>
                        {stats.aprovacoes_pendentes > 0 && (
                            <div className="flex justify-between items-center p-3 rounded-lg bg-purple-50">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-purple-200 flex items-center justify-center">
                                        <span className="text-sm font-bold text-purple-800">{stats.aprovacoes_pendentes}</span>
                                    </div>
                                    <span className="text-sm font-medium text-gray-900 dark:text-slate-100">Aprovações Pendentes</span>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

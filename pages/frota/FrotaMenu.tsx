import React, { useEffect, useState } from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import {
    Car, Users, Fuel, Wrench, FileText, Map, AlertTriangle, BarChart2, DollarSign
} from 'lucide-react';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { frotaListVeiculos, frotaListMotoristas, frotaListViagens } from '../../lib/frotaSupabase';

export const FrotaMenu: React.FC = () => {
    const { empresaIdEfetivo, frotaOpts } = useFrotaEmpresaContext();
    const [stats, setStats] = useState({
        totalVeiculos: 0,
        veiculosAtivos: 0,
        veiculosManutencao: 0,
        totalMotoristas: 0,
        motoristasAtivos: 0,
        viagensAndamento: 0,
        alertasManutencao: 0,
        alertasCrlv: 0,
        alertasCnh: 0,
    });
    const [loadingData, setLoadingData] = useState(false);

    useEffect(() => {
        if (!empresaIdEfetivo) return;

        let cancel = false;
        const loadDashboardData = async () => {
            setLoadingData(true);
            try {
                const [veiculosList, motoristasList, viagensList] = await Promise.all([
                    frotaListVeiculos(empresaIdEfetivo, {}, frotaOpts).catch(() => []),
                    frotaListMotoristas(empresaIdEfetivo, {}, frotaOpts).catch(() => []),
                    frotaListViagens(empresaIdEfetivo, {}, frotaOpts).catch(() => [])
                ]);

                if (cancel) return;

                const today = new Date();
                const todayISO = today.toISOString().slice(0, 10);

                const totalVeiculos = veiculosList.length;
                const veiculosAtivos = veiculosList.filter((v: any) => v.status === 'ativo').length;
                const veiculosManutencao = veiculosList.filter((v: any) => v.status === 'manutencao').length;

                const totalMotoristas = motoristasList.length;
                const motoristasAtivos = motoristasList.filter((m: any) => m.ativo !== false && m.status !== 'inativo').length;

                const viagensAndamento = viagensList.filter((v: any) => v.status === 'em_andamento').length;

                const alertasManutencao = veiculosList.filter((v: any) =>
                    v.km_proxima_revisao && (Number(v.km_proxima_revisao) - Number(v.km_atual || 0)) <= 2000
                ).length;

                const alertasCrlv = veiculosList.filter((v: any) =>
                    v.vencimento_crlv && v.vencimento_crlv <= todayISO
                ).length;

                const alertasCnh = motoristasList.filter((m: any) =>
                    m.vencimento_cnh && m.vencimento_cnh <= todayISO
                ).length;

                setStats({
                    totalVeiculos,
                    veiculosAtivos,
                    veiculosManutencao,
                    totalMotoristas,
                    motoristasAtivos,
                    viagensAndamento,
                    alertasManutencao,
                    alertasCrlv,
                    alertasCnh,
                });
            } catch (err) {
                console.error('[FrotaMenu] Error loading dashboard stats:', err);
            } finally {
                if (!cancel) setLoadingData(false);
            }
        };

        loadDashboardData();
        return () => {
            cancel = true;
        };
    }, [empresaIdEfetivo, frotaOpts]);

    const items = [
        {
            icon: Car,
            label: 'Veículos',
            path: '/frota/veiculos',
            description: 'Cadastro e gestão de todos os veículos da frota.',
            color: '#3b82f6'
        },
        {
            icon: Users,
            label: 'Motoristas',
            path: '/frota/motoristas',
            description: 'Cadastro de motoristas, habilitações e documentos.',
            color: '#8b5cf6'
        },
        {
            icon: Map,
            label: 'Viagens',
            path: '/frota/viagens',
            description: 'Registro de viagens, rotas e agendamentos.',
            color: '#10b981'
        },
        {
            icon: Fuel,
            label: 'Abastecimentos',
            path: '/frota/abastecimentos',
            description: 'Controle de combustível e consumo por veículo.',
            color: '#f59e0b'
        },
        {
            icon: Wrench,
            label: 'Manutenção',
            path: '/frota/manutencao',
            description: 'Ordens de serviço, revisões e histórico de manutenções.',
            color: '#ef4444'
        },
        {
            icon: FileText,
            label: 'Documentos',
            path: '/frota/documentos',
            description: 'CNH, CRLV, seguros e alertas de vencimento.',
            color: '#06b6d4'
        },
        {
            icon: AlertTriangle,
            label: 'Ocorrências',
            path: '/frota/ocorrencias',
            description: 'Registro de acidentes, infrações e incidentes.',
            color: '#f97316'
        },
        {
            icon: DollarSign,
            label: 'Gastos da Frota',
            path: '/frota/gastos',
            description: 'Visão consolidada de todos os custos operacionais.',
            color: '#ec4899'
        },
        {
            icon: BarChart2,
            label: 'Relatórios de Frota',
            path: '/frota/relatorios',
            description: 'Custos, quilometragem, performance e gastos.',
            color: '#6366f1'
        },
    ];

    return (
        <ModuleMenu
            title="Gestão de Frota"
            subtitle="Controle completo de veículos, motoristas, viagens e manutenção"
            accentColor="#be123c"
            items={items}
        >
            {/* Indicadores do Painel */}
            {empresaIdEfetivo && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-150 dark:border-slate-800 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-blue-650 dark:text-blue-400">
                            <Car className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-800 dark:text-slate-200">
                                {loadingData ? '...' : `${stats.veiculosAtivos}/${stats.totalVeiculos}`}
                            </p>
                            <p className="text-xs text-gray-500 font-medium">Veículos Ativos</p>
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-150 dark:border-slate-800 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg text-purple-650 dark:text-purple-400">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-800 dark:text-slate-200">
                                {loadingData ? '...' : `${stats.motoristasAtivos}/${stats.totalMotoristas}`}
                            </p>
                            <p className="text-xs text-gray-500 font-medium">Motoristas Ativos</p>
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-150 dark:border-slate-800 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-emerald-650 dark:text-emerald-400">
                            <Map className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-800 dark:text-slate-200">
                                {loadingData ? '...' : stats.viagensAndamento}
                            </p>
                            <p className="text-xs text-gray-500 font-medium">Viagens em Andamento</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-150 dark:border-slate-800 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-amber-650 dark:text-amber-400">
                            <Wrench className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-gray-800 dark:text-slate-200">
                                {loadingData ? '...' : stats.veiculosManutencao}
                            </p>
                            <p className="text-xs text-gray-500 font-medium">Em Manutenção</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Painel de Alertas Operacionais */}
            {!loadingData && (stats.alertasManutencao > 0 || stats.alertasCrlv > 0 || stats.alertasCnh > 0) && (
                <div className="bg-amber-50/70 dark:bg-amber-950/10 border border-amber-200/60 dark:border-amber-900/30 p-4 rounded-xl mb-4">
                    <div className="flex items-center gap-2 mb-2 text-amber-800 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
                        <AlertTriangle className="h-4 w-4" /> Alertas Operacionais da Frota
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-amber-700 dark:text-amber-300">
                        {stats.alertasManutencao > 0 && (
                            <span className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 shadow-sm flex items-center gap-1.5 font-medium">
                                <Wrench className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                                <span><strong>{stats.alertasManutencao}</strong> {stats.alertasManutencao === 1 ? 'veículo precisa' : 'veículos precisam'} de revisão preventiva.</span>
                            </span>
                        )}
                        {stats.alertasCrlv > 0 && (
                            <span className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 shadow-sm flex items-center gap-1.5 font-medium">
                                <FileText className="h-3.5 w-3.5 text-red-500 animate-pulse" />
                                <span><strong>{stats.alertasCrlv}</strong> {stats.alertasCrlv === 1 ? 'veículo está' : 'veículos estão'} com CRLV vencido.</span>
                            </span>
                        )}
                        {stats.alertasCnh > 0 && (
                            <span className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 shadow-sm flex items-center gap-1.5 font-medium">
                                <Users className="h-3.5 w-3.5 text-red-500 animate-pulse" />
                                <span><strong>{stats.alertasCnh}</strong> {stats.alertasCnh === 1 ? 'motorista está' : 'motoristas estão'} com CNH vencida.</span>
                            </span>
                        )}
                    </div>
                </div>
            )}
        </ModuleMenu>
    );
};

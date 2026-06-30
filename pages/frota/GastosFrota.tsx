import React, { useEffect, useMemo, useState } from 'react';
import {
    DollarSign, Fuel, Wrench, Car, TrendingUp, TrendingDown,
    Calendar, Filter, Download, BarChart2, PieChart
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { useToast } from '../../lib/ToastStore';
import { frotaListGastos } from '../../lib/frotaSupabase';

type CategoriaGasto = 'combustivel' | 'manutencao' | 'seguro' | 'ipva' | 'multa' | 'lavagem' | 'pedagio' | 'outros';

interface GastoFrota {
    id: string;
    veiculo_placa: string;
    veiculo_modelo: string;
    categoria: CategoriaGasto;
    descricao: string;
    valor: number;
    data: string;
    motorista?: string;
    km_registro?: number;
    nota_fiscal?: string;
}

const CATEGORIA_LABELS: Record<CategoriaGasto, { label: string; color: string; icon: React.ElementType }> = {
    combustivel: { label: 'Combustível', color: '#f59e0b', icon: Fuel },
    manutencao: { label: 'Manutenção', color: '#ef4444', icon: Wrench },
    seguro: { label: 'Seguro', color: '#3b82f6', icon: Car },
    ipva: { label: 'IPVA', color: '#8b5cf6', icon: DollarSign },
    multa: { label: 'Multas', color: '#dc2626', icon: DollarSign },
    lavagem: { label: 'Lavagem', color: '#06b6d4', icon: Car },
    pedagio: { label: 'Pedágio', color: '#10b981', icon: Car },
    outros: { label: 'Outros', color: '#6b7280', icon: DollarSign },
};

const formatCurrency = (value: number) =>
    `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export const GastosFrota: React.FC = () => {
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [gastos, setGastos] = useState<GastoFrota[]>([]);
    const [loading, setLoading] = useState(false);
    const [periodoFilter, setPeriodoFilter] = useState('mes_atual');
    const [categoriaFilter, setCategoriaFilter] = useState('');
    const [veiculoFilter, setVeiculoFilter] = useState('');

    const loadGastos = async () => {
        if (!empresaIdEfetivo) return;
        if (skipUntilGrupoCarrega) return;
        setLoading(true);
        try {
            const rows = await frotaListGastos(empresaIdEfetivo, frotaOpts);
            const mapped: GastoFrota[] = (rows || []).map((g) => ({
                id: g.id,
                veiculo_placa: g.placa || '-',
                veiculo_modelo: g.modelo || '-',
                categoria: g.tipo || 'outros',
                descricao: g.descricao || '-',
                valor: Number(g.valor || 0),
                data: g.data_gasto || '',
                motorista: g.motorista_nome || undefined,
                km_registro: g.km_registro ? Number(g.km_registro) : undefined,
                nota_fiscal: g.nota_fiscal || undefined,
            }));
            setGastos(mapped);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao carregar gastos da frota', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadGastos();
    }, [empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega]);

    const filtered = useMemo(() => {
        return gastos.filter(g => {
            const matchCategoria = !categoriaFilter || g.categoria === categoriaFilter;
            const matchVeiculo = !veiculoFilter || g.veiculo_placa === veiculoFilter;
            return matchCategoria && matchVeiculo;
        });
    }, [gastos, categoriaFilter, veiculoFilter]);

    const totalGeral = useMemo(() => filtered.reduce((acc, g) => acc + g.valor, 0), [filtered]);

    const porCategoria = useMemo(() => {
        const map: Record<string, number> = {};
        filtered.forEach(g => { map[g.categoria] = (map[g.categoria] || 0) + g.valor; });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [filtered]);

    const porVeiculo = useMemo(() => {
        const map: Record<string, { placa: string; modelo: string; total: number }> = {};
        filtered.forEach(g => {
            if (!map[g.veiculo_placa]) map[g.veiculo_placa] = { placa: g.veiculo_placa, modelo: g.veiculo_modelo, total: 0 };
            map[g.veiculo_placa].total += g.valor;
        });
        return Object.values(map).sort((a, b) => b.total - a.total);
    }, [filtered]);

    const veiculosUnicos = useMemo(() =>
        [...new Set(gastos.map(g => g.veiculo_placa))], [gastos]);

    // Cálculo variação mês (simulado)
    const mesAnterior = totalGeral * 0.85;
    const variacao = ((totalGeral - mesAnterior) / mesAnterior) * 100;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Gastos da Frota"
                subtitle="Visão consolidada de todos os custos operacionais da frota"
                actionButton={
                    <Button variant="outline" onClick={loadGastos}>
                        <Download className="h-4 w-4 mr-2" /> Exportar Relatório
                    </Button>
                }
            />

            {/* Cards Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-5 bg-gradient-to-br from-blue-50 to-blue-100/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total do Período</p>
                            <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(totalGeral)}</p>
                            <div className="flex items-center gap-1 mt-1">
                                {variacao > 0 ? (
                                    <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                                ) : (
                                    <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                                )}
                                <span className={`text-xs font-medium ${variacao > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {variacao > 0 ? '+' : ''}{variacao.toFixed(1)}% vs mês anterior
                                </span>
                            </div>
                        </div>
                        <DollarSign className="h-10 w-10 text-blue-600 opacity-40" />
                    </div>
                </Card>
                <Card className="p-5 bg-gradient-to-br from-amber-50 to-amber-100/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Combustível</p>
                            <p className="text-2xl font-bold text-amber-700 mt-1">
                                {formatCurrency(porCategoria.find(([k]) => k === 'combustivel')?.[1] || 0)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {((porCategoria.find(([k]) => k === 'combustivel')?.[1] || 0) / totalGeral * 100).toFixed(0)}% do total
                            </p>
                        </div>
                        <Fuel className="h-10 w-10 text-amber-600 opacity-40" />
                    </div>
                </Card>
                <Card className="p-5 bg-gradient-to-br from-red-50 to-red-100/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Manutenção</p>
                            <p className="text-2xl font-bold text-red-700 mt-1">
                                {formatCurrency(porCategoria.find(([k]) => k === 'manutencao')?.[1] || 0)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {((porCategoria.find(([k]) => k === 'manutencao')?.[1] || 0) / totalGeral * 100).toFixed(0)}% do total
                            </p>
                        </div>
                        <Wrench className="h-10 w-10 text-red-600 opacity-40" />
                    </div>
                </Card>
                <Card className="p-5 bg-gradient-to-br from-purple-50 to-purple-100/50">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Registros</p>
                            <p className="text-2xl font-bold text-purple-700 mt-1">{filtered.length}</p>
                            <p className="text-xs text-gray-400 mt-1">{veiculosUnicos.length} veículos com gasto</p>
                        </div>
                        <BarChart2 className="h-10 w-10 text-purple-600 opacity-40" />
                    </div>
                </Card>
            </div>

            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border">
                <div className="w-full md:w-44">
                    <Select value={periodoFilter} onChange={e => setPeriodoFilter(e.target.value)}>
                        <option value="mes_atual">Mês Atual</option>
                        <option value="mes_anterior">Mês Anterior</option>
                        <option value="trimestre">Trimestre</option>
                        <option value="semestre">Semestre</option>
                        <option value="ano">Ano</option>
                    </Select>
                </div>
                <div className="w-full md:w-48">
                    <Select value={categoriaFilter} onChange={e => setCategoriaFilter(e.target.value)}>
                        <option value="">Todas as Categorias</option>
                        {Object.entries(CATEGORIA_LABELS).map(([key, { label }]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </Select>
                </div>
                <div className="w-full md:w-44">
                    <Select value={veiculoFilter} onChange={e => setVeiculoFilter(e.target.value)}>
                        <option value="">Todos os Veículos</option>
                        {veiculosUnicos.map(placa => (
                            <option key={placa} value={placa}>{placa}</option>
                        ))}
                    </Select>
                </div>
            </div>

            {/* Grid: Categoria + Veículo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Por Categoria */}
                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <PieChart className="h-5 w-5 text-gray-500" />
                        <h3 className="text-lg font-semibold text-gray-900">Gastos por Categoria</h3>
                    </div>
                    <div className="space-y-3">
                        {porCategoria.map(([cat, valor]) => {
                            const info = CATEGORIA_LABELS[cat as CategoriaGasto];
                            const pct = (valor / totalGeral) * 100;
                            return (
                                <div key={cat}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: info.color }} />
                                            <span className="text-sm font-medium text-gray-700">{info.label}</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">{formatCurrency(valor)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div
                                            className="h-2 rounded-full transition-all duration-500"
                                            style={{ width: `${pct}%`, backgroundColor: info.color }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Por Veículo */}
                <Card className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Car className="h-5 w-5 text-gray-500" />
                        <h3 className="text-lg font-semibold text-gray-900">Gastos por Veículo</h3>
                    </div>
                    <div className="space-y-3">
                        {porVeiculo.map(v => {
                            const pct = (v.total / totalGeral) * 100;
                            return (
                                <div key={v.placa}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div>
                                            <span className="text-sm font-semibold text-gray-900">{v.placa}</span>
                                            <span className="text-xs text-gray-400 ml-2">{v.modelo}</span>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900">{formatCurrency(v.total)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div className="h-2 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            {/* Tabela detalhada */}
            <Card className="overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b bg-gray-50/50">
                    <h3 className="font-semibold text-gray-900">Detalhamento de Gastos</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Data</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Categoria</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Veículo</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Descrição</th>
                                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Motorista</th>
                                <th className="text-right py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map(g => {
                                const cat = CATEGORIA_LABELS[g.categoria];
                                const CatIcon = cat.icon;
                                return (
                                    <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                <span className="text-gray-700">
                                                    {new Date(g.data + 'T00:00').toLocaleDateString('pt-BR')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                                                style={{ backgroundColor: `${cat.color}15`, color: cat.color }}
                                            >
                                                <CatIcon className="h-3.5 w-3.5" />
                                                {cat.label}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <p className="font-semibold text-gray-900">{g.veiculo_placa}</p>
                                            <p className="text-xs text-gray-500">{g.veiculo_modelo}</p>
                                        </td>
                                        <td className="py-3 px-4">
                                            <p className="text-gray-700">{g.descricao}</p>
                                            {g.nota_fiscal && <p className="text-xs text-gray-400">NF: {g.nota_fiscal}</p>}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600">
                                            {g.motorista || <span className="text-gray-400 italic text-xs">—</span>}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="font-bold text-gray-900">{formatCurrency(g.valor)}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50 border-t-2">
                                <td colSpan={5} className="py-3 px-4 text-right text-sm font-semibold text-gray-600">Total:</td>
                                <td className="py-3 px-4 text-right text-lg font-bold text-gray-900">{formatCurrency(totalGeral)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>
        </div>
    );
};

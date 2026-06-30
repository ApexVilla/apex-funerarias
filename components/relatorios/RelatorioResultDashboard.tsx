import React from 'react';
import { motion } from 'framer-motion';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import type { RelatorioConfig } from '../../lib/RelatoriosStore';
import {
    buildVisualizationPlan,
    formatKpiValue,
    getChartAccent,
    type PrimaryChart,
} from '../../lib/relatorioChartInference';
import { LayoutDashboard } from 'lucide-react';

const PALETTES: Record<string, string[]> = {
    financeiro: ['#34d399', '#38bdf8', '#f472b6', '#fbbf24'],
    comercial: ['#a78bfa', '#fbbf24', '#fb7185', '#2dd4bf'],
    estoque: ['#2dd4bf', '#fb923c', '#4ade80', '#94a3b8'],
    default: ['#60a5fa', '#94a3b8', '#c084fc', '#f472b6'],
};

function tooltipFormatter(value: number | string, name: string): [string, string] {
    const n = typeof value === 'number' ? value : Number(value);
    const key = name.toLowerCase();
    if (key.includes('centavos') && !Number.isNaN(n)) {
        return [
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100),
            name,
        ];
    }
    if (!Number.isNaN(n) && (key.includes('valor') || key.includes('total') || key.includes('saldo'))) {
        return [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n), name];
    }
    if (!Number.isNaN(n)) {
        return [new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n), name];
    }
    return [String(value), name];
}

const axisTick = { fill: '#475569', fontSize: 11 };
const gridStroke = 'rgba(100, 116, 139, 0.20)';

interface Props {
    dados: unknown;
    relatorio: RelatorioConfig;
}

function PrimaryChartView({ chart, colors }: { chart: PrimaryChart; colors: string[] }) {
    const commonTooltip = (
        <Tooltip
            contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '12px',
            }}
            formatter={tooltipFormatter}
            labelStyle={{ color: '#334155' }}
        />
    );

    if (chart.kind === 'line') {
        return (
            <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chart.data} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey={chart.xKey} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} width={56} />
                    {commonTooltip}
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
                    {chart.yKeys.map((k, i) => (
                        <Line
                            key={k}
                            type="monotone"
                            dataKey={k}
                            stroke={colors[i % colors.length]}
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            activeDot={{ r: 5 }}
                            name={k.replace(/_/g, ' ')}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        );
    }

    if (chart.kind === 'area_compare') {
        return (
            <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={chart.data} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <defs>
                        {chart.yKeys.map((k, i) => (
                            <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.35} />
                                <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey={chart.xKey} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} width={56} />
                    {commonTooltip}
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
                    {chart.yKeys.map((k, i) => (
                        <Area
                            key={k}
                            type="monotone"
                            dataKey={k}
                            stroke={colors[i % colors.length]}
                            fillOpacity={1}
                            fill={`url(#grad-${k})`}
                            strokeWidth={2}
                            name={k.replace(/_/g, ' ')}
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        );
    }

    if (chart.kind === 'bar') {
        const dataKey = chart.catKey;
        const barH = chart.horizontal
            ? Math.max(320, 40 + chart.data.length * 26)
            : 320;
        return (
            <ResponsiveContainer width="100%" height={barH}>
                <BarChart
                    data={chart.data}
                    layout={chart.horizontal ? 'vertical' : 'horizontal'}
                    margin={{ top: 8, right: 16, left: chart.horizontal ? 80 : 8, bottom: 8 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    {chart.horizontal ? (
                        <>
                            <XAxis type="number" tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                            <YAxis type="category" dataKey={dataKey} tick={axisTick} width={96} tickLine={false} />
                        </>
                    ) : (
                        <>
                            <XAxis dataKey={dataKey} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                            <YAxis tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} width={56} />
                        </>
                    )}
                    {commonTooltip}
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
                    {chart.yKeys.map((k, i) => (
                        <Bar
                            key={k}
                            dataKey={k}
                            fill={colors[i % colors.length]}
                            radius={[4, 4, 0, 0]}
                            name={k.replace(/_/g, ' ')}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    }

    if (chart.kind === 'pie') {
        const pieColors = colors.length >= chart.data.length ? colors : [...colors, ...PALETTES.default];
        return (
            <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                    <Pie
                        data={chart.data}
                        dataKey={chart.valueKey}
                        nameKey={chart.nameKey}
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={112}
                        paddingAngle={2}
                        label={({ name, percent }) =>
                            `${String(name).slice(0, 18)}${String(name).length > 18 ? '…' : ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                    >
                        {chart.data.map((_, i) => (
                            <Cell key={i} fill={pieColors[i % pieColors.length]} stroke="#ffffff" strokeWidth={1} />
                        ))}
                    </Pie>
                    {commonTooltip}
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
                </PieChart>
            </ResponsiveContainer>
        );
    }

    return null;
}

export const RelatorioResultDashboard: React.FC<Props> = ({ dados, relatorio }) => {
    const plan = buildVisualizationPlan(dados, relatorio);
    const accent = getChartAccent(relatorio);
    const colors = PALETTES[accent] ?? PALETTES.default;

    if (!plan.showDashboard) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-6 mb-8"
        >
            <div className="flex items-center gap-2 text-slate-700">
                <LayoutDashboard className="h-5 w-5 text-sky-400" />
                <h3 className="text-lg font-semibold tracking-tight">Painel analítico</h3>
                <span className="text-xs text-slate-500 font-normal">
                    {relatorio.categoria === 'estoque'
                        ? 'Estoque'
                        : relatorio.setor === 'comercial'
                          ? 'Vendas'
                          : relatorio.setor === 'financeiro'
                            ? 'Financeiro'
                            : 'Visão geral'}
                </span>
            </div>

            {plan.kpis.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {plan.kpis.map((kpi, i) => (
                        <motion.div
                            key={kpi.key}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{kpi.label}</p>
                            <p className="text-xl font-semibold text-slate-900 tabular-nums">{formatKpiValue(kpi)}</p>
                        </motion.div>
                    ))}
                </div>
            )}

            {plan.primary && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
                    <PrimaryChartView chart={plan.primary} colors={colors} />
                </div>
            )}
        </motion.div>
    );
};

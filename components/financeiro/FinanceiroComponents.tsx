import React from 'react';
import { formatCentavos } from '../../lib/FinanceiroStore';

interface MoneyDisplayProps {
    centavos: number;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    showSign?: boolean;
    className?: string;
}

export const MoneyDisplay: React.FC<MoneyDisplayProps> = ({ centavos, size = 'md', showSign = false, className = '' }) => {
    const isPositive = centavos >= 0;
    const colorClass = centavos === 0 ? 'text-gray-500 dark:text-slate-400' : isPositive ? 'text-green-600' : 'text-red-600';

    const sizeClasses = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-xl font-semibold',
        xl: 'text-3xl font-bold',
    };

    const prefix = showSign && isPositive ? '+' : '';

    return (
        <span className={`${colorClass} ${sizeClasses[size]} tabular-nums ${className}`}>
            {prefix}{formatCentavos(centavos)}
        </span>
    );
};

// Badge de status financeiro
interface StatusFinanceiroBadgeProps {
    status: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
    aberto: { label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
    pago: { label: 'Pago', color: 'bg-green-100 text-green-700' },
    pago_parcial: { label: 'Parcial', color: 'bg-yellow-100 text-yellow-700' },
    vencido: { label: 'Vencido', color: 'bg-red-100 text-red-700' },
    cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
    renegociado: { label: 'Renegociado', color: 'bg-purple-100 text-purple-700' },
    aprovado: { label: 'Aprovado', color: 'bg-emerald-100 text-emerald-700' },
    pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700' },
    em_andamento: { label: 'Em Andamento', color: 'bg-sky-100 text-sky-700' },
    concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700' },
};

export const StatusFinanceiroBadge: React.FC<StatusFinanceiroBadgeProps> = ({ status }) => {
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.color}`}>
            {config.label}
        </span>
    );
};

// Empty state
interface EmptyFinanceiroProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    action?: React.ReactNode;
}

export const EmptyFinanceiro: React.FC<EmptyFinanceiroProps> = ({ icon, title, description, action }) => (
    <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-lg border border-dashed border-gray-200 dark:border-slate-700">
        <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            {icon}
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">{title}</h3>
        <p className="text-gray-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">{description}</p>
        {action && <div className="mt-6">{action}</div>}
    </div>
);

// Loading spinner
export const FinanceiroLoading: React.FC = () => (
    <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
);

// Stat card
interface StatCardProps {
    label: string;
    value: string | React.ReactNode;
    sublabel?: string;
    icon: React.ReactNode;
    color: 'blue' | 'green' | 'red' | 'purple' | 'amber' | 'sky';
}

const colorMap = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
    sky: 'bg-sky-100 text-sky-600',
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, sublabel, icon, color }) => (
    <div className="rounded-lg border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
        <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-600 dark:text-slate-400 truncate">{label}</p>
                <div className="text-2xl font-bold text-gray-900 dark:text-slate-100 mt-1">{value}</div>
                {sublabel && (
                    <p className="text-xs mt-1.5 font-medium text-gray-500 dark:text-slate-400 truncate">{sublabel}</p>
                )}
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ml-3 ${colorMap[color]}`}>
                {icon}
            </div>
        </div>
    </div>
);

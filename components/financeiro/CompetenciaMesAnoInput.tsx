import React, { useEffect, useId, useState } from 'react';

const MESES = [
    { value: '01', label: 'Jan' },
    { value: '02', label: 'Fev' },
    { value: '03', label: 'Mar' },
    { value: '04', label: 'Abr' },
    { value: '05', label: 'Mai' },
    { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' },
    { value: '08', label: 'Ago' },
    { value: '09', label: 'Set' },
    { value: '10', label: 'Out' },
    { value: '11', label: 'Nov' },
    { value: '12', label: 'Dez' },
];

export interface CompetenciaMesAnoInputProps {
    label?: string;
    error?: string;
    className?: string;
    /** Valor no formato YYYY-MM */
    value?: string;
    onChange?: (ym: string) => void;
    required?: boolean;
    disabled?: boolean;
}

export const CompetenciaMesAnoInput: React.FC<CompetenciaMesAnoInputProps> = ({
    label = 'Competência',
    error,
    className = '',
    value = '',
    onChange,
    required,
    disabled,
}) => {
    const autoId = useId();
    const ymValue = value ? String(value).slice(0, 7) : '';
    const [mes, setMes] = useState('01');
    const [ano, setAno] = useState('');

    useEffect(() => {
        const [y, m] = ymValue.split('-');
        if (y && m) {
            setAno(y);
            setMes(m.padStart(2, '0'));
        }
    }, [ymValue]);

    const emitYm = (m: string, y: string) => {
        const anoLimpo = y.replace(/\D/g, '').slice(0, 4);
        if (m && anoLimpo.length === 4) {
            onChange?.(`${anoLimpo}-${m}`);
        }
    };

    const handleMes = (novoMes: string) => {
        setMes(novoMes);
        emitYm(novoMes, ano);
    };

    const handleAno = (raw: string) => {
        const anoLimpo = raw.replace(/\D/g, '').slice(0, 4);
        setAno(anoLimpo);
        if (mes && anoLimpo.length === 4) {
            emitYm(mes, anoLimpo);
        }
    };

    const fieldClass =
        'h-10 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-100 disabled:opacity-50';

    return (
        <div
            className={`rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2 ${className}`}
        >
            <label
                htmlFor={`${autoId}-mes`}
                className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide"
            >
                {label}
                {required ? ' *' : ''}
            </label>
            <div className="flex items-center gap-2">
                <select
                    id={`${autoId}-mes`}
                    value={mes}
                    disabled={disabled}
                    required={required}
                    onChange={(e) => handleMes(e.target.value)}
                    className={`${fieldClass} flex-1 min-w-0`}
                    aria-label="Mês da competência"
                >
                    {MESES.map((m) => (
                        <option key={m.value} value={m.value}>
                            {m.label}
                        </option>
                    ))}
                </select>
                <span className="text-slate-400 text-sm font-bold shrink-0">/</span>
                <input
                    id={`${autoId}-ano`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={disabled}
                    required={required}
                    placeholder="AAAA"
                    value={ano}
                    maxLength={4}
                    onChange={(e) => handleAno(e.target.value)}
                    className={`${fieldClass} w-20 text-center tabular-nums`}
                    aria-label="Ano da competência"
                />
            </div>
            {error && <p className="text-[10px] text-red-600 font-medium">{error}</p>}
        </div>
    );
};

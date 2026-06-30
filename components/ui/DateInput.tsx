import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import {
    displayBrToIso,
    isoToDisplayBr,
    isoWithinRange,
    maskDateBrInput,
} from '../../lib/dateInputUtils';

export interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    label?: string;
    error?: string;
    helperText?: string;
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    /** Apenas calendário nativo (sem digitar DD/MM/AAAA). Ideal para vencimentos com min/max. */
    pickerOnly?: boolean;
}

export const DateInput: React.FC<DateInputProps> = ({
    label,
    error,
    helperText,
    className = '',
    value = '',
    onChange,
    name,
    required,
    disabled,
    min,
    max,
    id: idProp,
    placeholder = 'DD/MM/AAAA',
    pickerOnly = false,
    ...rest
}) => {
    const autoId = useId();
    const id = idProp || autoId;
    const pickerRef = useRef<HTMLInputElement>(null);
    const isoValue = value ? String(value).split('T')[0] : '';

    const [texto, setTexto] = useState(() => isoToDisplayBr(isoValue));
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        setTexto(isoToDisplayBr(isoValue));
        setLocalError(null);
    }, [isoValue]);

    const emitChange = useCallback(
        (iso: string) => {
            if (!onChange) return;
            onChange({
                target: { name: name ?? '', value: iso },
                currentTarget: { name: name ?? '', value: iso },
            } as React.ChangeEvent<HTMLInputElement>);
        },
        [onChange, name],
    );

    const commitTexto = useCallback(
        (display: string) => {
            if (!display.trim()) {
                setLocalError(null);
                emitChange('');
                return;
            }
            const iso = displayBrToIso(display);
            if (iso === null) {
                setLocalError('Data inválida. Use DD/MM/AAAA');
                return;
            }
            if (iso && !isoWithinRange(iso, min as string | undefined, max as string | undefined)) {
                setLocalError('Data fora do período permitido');
                return;
            }
            setLocalError(null);
            setTexto(isoToDisplayBr(iso));
            emitChange(iso);
        },
        [emitChange, min, max],
    );

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const masked = maskDateBrInput(e.target.value);
        setTexto(masked);
        setLocalError(null);
        if (masked.length === 10) {
            const iso = displayBrToIso(masked);
            if (iso && isoWithinRange(iso, min as string | undefined, max as string | undefined)) {
                emitChange(iso);
            }
        }
    };

    const handleBlur = () => {
        commitTexto(texto);
    };

    const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const iso = e.target.value;
        setTexto(isoToDisplayBr(iso));
        setLocalError(null);
        emitChange(iso);
    };

    const abrirCalendario = () => {
        if (disabled || !pickerRef.current) return;
        const picker = pickerRef.current;
        if (typeof picker.showPicker === 'function') {
            try {
                picker.showPicker();
                return;
            } catch {
                // showPicker pode falhar fora de gesto do usuário; segue para click.
            }
        }
        picker.click();
    };

    const handlePickerTriggerClick = (e: React.MouseEvent<HTMLInputElement>) => {
        if (disabled) return;
        if (typeof pickerRef.current?.showPicker === 'function') {
            e.preventDefault();
            abrirCalendario();
        }
    };

    const erroExibido = error || localError;
    const dica =
        helperText !== undefined
            ? helperText
            : label
              ? pickerOnly
                ? 'Selecione no calendário'
                : 'Digite a data (DD/MM/AAAA) ou clique no calendário'
              : '';
    const dicaVisivel = Boolean(dica?.trim());

    const pickerIndicatorClasses =
        '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0';

    if (pickerOnly) {
        return (
            <div className="w-full min-w-0 space-y-1.5">
                {label && (
                    <label htmlFor={id} className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider ml-1">
                        {label}
                    </label>
                )}
                <div className="relative min-w-0 overflow-hidden">
                    <input
                        id={id}
                        type="date"
                        name={name}
                        value={isoValue}
                        min={min as string | undefined}
                        max={max as string | undefined}
                        disabled={disabled}
                        required={required}
                        onChange={(e) => {
                            setLocalError(null);
                            onChange?.(e);
                        }}
                        className={`flex h-11 w-full min-w-0 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 px-4 py-2 text-sm text-gray-900 dark:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent focus:bg-white dark:focus:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark] ${pickerIndicatorClasses} ${
                            erroExibido ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''
                        } ${className}`}
                        {...rest}
                    />
                </div>
                {erroExibido ? (
                    <p className="text-[11px] text-red-500 font-medium ml-1">{erroExibido}</p>
                ) : dicaVisivel ? (
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 ml-1">{dica}</p>
                ) : null}
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 space-y-1.5">
            {label && (
                <label htmlFor={id} className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider ml-1">
                    {label}
                </label>
            )}
            <div className="relative flex min-w-0 w-full items-stretch gap-1.5 overflow-hidden">
                <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={placeholder}
                    value={texto}
                    onChange={handleTextChange}
                    onBlur={handleBlur}
                    disabled={disabled}
                    required={required && !isoValue}
                    aria-invalid={!!erroExibido}
                    className={`flex h-11 min-w-0 flex-1 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 px-4 py-2 text-sm text-gray-900 dark:text-white transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent focus:bg-white dark:focus:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ${
                        erroExibido ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''
                    } ${className}`}
                    {...rest}
                />
                <div className="relative h-11 w-11 shrink-0 flex-none">
                    <div
                        className="pointer-events-none flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-300"
                        aria-hidden
                    >
                        <Calendar className="h-4 w-4 shrink-0" />
                    </div>
                    <input
                        ref={pickerRef}
                        type="date"
                        tabIndex={-1}
                        aria-label="Abrir calendário"
                        title="Abrir calendário"
                        className={`absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 [color-scheme:light] dark:[color-scheme:dark] ${pickerIndicatorClasses}`}
                        value={isoValue}
                        min={min as string | undefined}
                        max={max as string | undefined}
                        disabled={disabled}
                        onChange={handlePickerChange}
                        onClick={handlePickerTriggerClick}
                    />
                </div>
            </div>
            {erroExibido ? (
                <p className="text-[11px] text-red-500 font-medium ml-1">{erroExibido}</p>
            ) : dicaVisivel ? (
                <p className="text-[11px] text-gray-400 dark:text-slate-500 ml-1">{dica}</p>
            ) : null}
        </div>
    );
};

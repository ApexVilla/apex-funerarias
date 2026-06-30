import React from 'react';
import { CheckCircle2, Clock, PenLine } from 'lucide-react';
import type { StatusAssinaturaDigitalResumo } from '../../lib/assinaturaDigitalService';

const CONFIG: Record<
  StatusAssinaturaDigitalResumo,
  { Icon: typeof CheckCircle2; className: string; label: string }
> = {
  assinado: {
    Icon: CheckCircle2,
    className: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    label: 'Assinado digitalmente',
  },
  pendente: {
    Icon: Clock,
    className: 'text-amber-600 bg-amber-50 border-amber-200',
    label: 'Aguardando assinatura do cliente',
  },
  nenhum: {
    Icon: PenLine,
    className: 'text-gray-400 bg-gray-50 border-gray-200',
    label: 'Sem assinatura digital',
  },
};

interface IndicadorAssinaturaDigitalProps {
  status: StatusAssinaturaDigitalResumo;
  /** Exibe texto curto ao lado do ícone */
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function IndicadorAssinaturaDigital({
  status,
  showLabel = false,
  size = 'sm',
}: IndicadorAssinaturaDigitalProps) {
  const { Icon, className, label } = CONFIG[status];
  const iconPx = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const pad = size === 'md' ? 'px-2 py-1' : 'p-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border ${pad} ${className}`}
      title={label}
    >
      <Icon className={iconPx} aria-hidden />
      {showLabel && (
        <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
          {status === 'assinado' ? 'Assinado' : status === 'pendente' ? 'Pendente' : 'Sem assin.'}
        </span>
      )}
    </span>
  );
}

import React from 'react';
import { Check, X } from 'lucide-react';
import { propostaContratoRealizado } from '../../lib/comissaoVendedorCalculo';

type Props = {
  status: string;
  confirmada?: boolean;
  dataConfirmacao?: string | null;
  size?: 'sm' | 'md';
  showAguardando?: boolean;
};

function formatDataConfirmacao(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
}

export const PropostaConfirmacaoBadge: React.FC<Props> = ({
  status,
  confirmada = false,
  dataConfirmacao,
  size = 'sm',
  showAguardando = true,
}) => {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs';
  const iconSm = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  if (!propostaContratoRealizado(status)) {
    if (!showAguardando) return <span className="text-xs text-gray-400">—</span>;
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium ${pad} bg-slate-100 text-slate-500 border border-slate-200`}
        title="Confirmação só após gerar o contrato e quitar a 1ª parcela no financeiro"
      >
        Aguardando
      </span>
    );
  }

  const dataFmt = formatDataConfirmacao(dataConfirmacao);

  if (confirmada) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold ${pad} bg-emerald-50 text-emerald-700 border border-emerald-200`}
        title={dataFmt ? `1ª parcela quitada no financeiro em ${dataFmt}` : '1ª parcela quitada no financeiro'}
      >
        <Check className={iconSm} strokeWidth={3} />
        Sim
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold ${pad} bg-gray-100 text-gray-500 border border-gray-200`}
      title="Contrato gerado — aguardando baixa da 1ª mensalidade no financeiro"
    >
      <span className={`${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} rounded-full border-2 border-gray-400 inline-flex items-center justify-center shrink-0`}>
        <X className={size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'} strokeWidth={3} />
      </span>
      Não
    </span>
  );
};

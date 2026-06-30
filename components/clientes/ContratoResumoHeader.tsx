import React from 'react';
import type { AssinaturaSB, ClienteSB } from '../../lib/ClienteStore';
import { formatarDataIsoPtBr } from '../../lib/contratoDatas';
import { resolvePlanoContratoAssinatura } from '../../lib/ContratoAssinaturaService';
import { StatusBadge } from '../common/StatusBadge';

type CampoResumo = { label: string; valor: string };

function CampoReadonly({ label, valor }: CampoResumo) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 truncate">
        {valor || '—'}
      </div>
    </div>
  );
}

type Props = {
  cliente: ClienteSB;
  assinatura: AssinaturaSB | null;
};

export const ContratoResumoHeader: React.FC<Props> = ({ cliente, assinatura }) => {
  const plano = assinatura ? resolvePlanoContratoAssinatura(assinatura) : null;
  const codigo = assinatura?.codigo || '—';
  const titularLinha = `${codigo !== '—' ? `Nº ${codigo}` : 'Sem contrato'} — TITULAR: ${cliente.nome}`;

  const formaPagamento = (assinatura?.forma_pagamento || '—').replace(/_/g, ' ');

  const linha1: CampoResumo[] = [
    { label: 'Tipo de plano', valor: plano?.label || assinatura?.plano_nome || '—' },
    { label: 'Modelo contrato', valor: plano?.sigla || '—' },
    { label: 'Cidade', valor: cliente.endereco_cidade || '—' },
    { label: 'Bairro', valor: cliente.endereco_bairro || '—' },
    { label: 'Fone', valor: cliente.telefone_principal || cliente.celular || cliente.whatsapp || '—' },
    { label: 'Cobrança', valor: formaPagamento },
  ];

  const linha2: CampoResumo[] = [
    {
      label: 'Valor mensal',
      valor: assinatura?.valor_mensal_centavos
        ? `R$ ${(assinatura.valor_mensal_centavos / 100).toFixed(2)}`
        : '—',
    },
    { label: 'Dia vencimento', valor: assinatura?.dia_vencimento ? `Dia ${assinatura.dia_vencimento}` : '—' },
    {
      label: 'Data contrato',
      valor: assinatura?.data_contratacao
        ? formatarDataIsoPtBr(assinatura.data_contratacao)
        : '—',
    },
    {
      label: '1º vencimento',
      valor: assinatura?.data_primeiro_vencimento
        ? formatarDataIsoPtBr(assinatura.data_primeiro_vencimento)
        : '—',
    },
    { label: 'CPF titular', valor: cliente.cpf_formatado || cliente.cpf || '—' },
    { label: 'E-mail', valor: cliente.email || '—' },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-100 border-b border-slate-200">
        <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{titularLinha}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase">
          <span className="text-slate-600">
            Situação:{' '}
            <StatusBadge status={assinatura?.status || cliente.status || 'ativo'} />
          </span>
        </div>
      </div>
      <div className="p-4 space-y-3 bg-slate-50/80">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {linha1.map((c) => (
            <CampoReadonly key={c.label} {...c} />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {linha2.map((c) => (
            <CampoReadonly key={c.label} {...c} />
          ))}
        </div>
      </div>
    </div>
  );
};

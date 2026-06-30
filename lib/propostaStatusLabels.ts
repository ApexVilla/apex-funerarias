import { normalizarStatusProposta, PROPOSTA_STATUS } from './propostaStatus';

export type PropostaStatusVariant = 'warning' | 'success' | 'default' | 'danger' | 'info';

export const PROPOSTA_STATUS_META: Record<
  string,
  { label: string; descricao: string; variant: PropostaStatusVariant }
> = {
  [PROPOSTA_STATUS.RASCUNHO]: {
    label: 'Em preenchimento',
    descricao: 'Vendedor ainda está coletando dados; pode salvar e continuar depois.',
    variant: 'default',
  },
  [PROPOSTA_STATUS.AGUARDANDO_CONTRATO]: {
    label: 'Liberada para contrato',
    descricao: 'Proposta finalizada pelo vendedor; aguarda alguém da equipe assumir a pós-venda.',
    variant: 'warning',
  },
  [PROPOSTA_STATUS.EM_POS_VENDA]: {
    label: 'Em pós-venda',
    descricao:
      'Equipe confere os dados (pode editar). Use «Gerar contrato» para criar cliente e assinatura no sistema.',
    variant: 'info',
  },
  [PROPOSTA_STATUS.CONTRATO_GERADO]: {
    label: 'Contrato gerado',
    descricao: 'Pós-venda finalizada: cliente e contrato (assinatura) criados no sistema.',
    variant: 'success',
  },
  [PROPOSTA_STATUS.CANCELADO]: {
    label: 'Cancelada',
    descricao: 'Proposta cancelada; não segue para contrato.',
    variant: 'danger',
  },
  [PROPOSTA_STATUS.REJEITADA]: {
    label: 'Rejeitada',
    descricao: 'Proposta rejeitada pela equipe.',
    variant: 'danger',
  },
  pendente_geracao_contrato: {
    label: 'Liberada para contrato',
    descricao: 'Proposta finalizada pelo vendedor; aguarda geração do contrato no sistema.',
    variant: 'warning',
  },
  convertido: {
    label: 'Contrato gerado',
    descricao: 'Pós-venda finalizada: cliente e contrato (assinatura) criados no sistema.',
    variant: 'success',
  },
};

/** Rótulo da coluna pós-venda na lista (vendedor enxerga conclusão). */
export function rotuloPosVendaLista(
  status?: string | null,
  responsavelNome?: string | null,
): string {
  const s = normalizarStatusProposta(status);
  if (s === PROPOSTA_STATUS.CONTRATO_GERADO) return 'Concluída';
  if (s === PROPOSTA_STATUS.EM_POS_VENDA) return responsavelNome || 'Em análise';
  if (s === PROPOSTA_STATUS.AGUARDANDO_CONTRATO) return 'Aguardando';
  return '—';
}

export function labelStatusProposta(status?: string | null): string {
  if (!status) return '—';
  const key = normalizarStatusProposta(status);
  return PROPOSTA_STATUS_META[key]?.label || PROPOSTA_STATUS_META[status]?.label || status;
}

export function descricaoStatusProposta(status?: string | null): string {
  if (!status) return '';
  const key = normalizarStatusProposta(status);
  return PROPOSTA_STATUS_META[key]?.descricao || PROPOSTA_STATUS_META[status]?.descricao || '';
}

export { propostaStatusEncerrado } from './propostaStatus';

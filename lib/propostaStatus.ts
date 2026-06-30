/** Status da proposta de venda — fluxo em 3 etapas. */
export const PROPOSTA_STATUS = {
  /** Vendedor salvou parcialmente; ainda pode editar. */
  RASCUNHO: 'rascunho',
  /** Vendedor finalizou e liberou para a equipe gerar o contrato. */
  AGUARDANDO_CONTRATO: 'aguardando_contrato',
  /** Equipe assumiu análise pós-venda antes de gerar o contrato. */
  EM_POS_VENDA: 'em_pos_venda',
  /** Cliente + assinatura criados no sistema. */
  CONTRATO_GERADO: 'contrato_gerado',
  CANCELADO: 'cancelado',
  REJEITADA: 'rejeitada',
} as const;

export type PropostaStatus = (typeof PROPOSTA_STATUS)[keyof typeof PROPOSTA_STATUS];

const LEGACY_MAP: Record<string, PropostaStatus> = {
  pendente_geracao_contrato: PROPOSTA_STATUS.AGUARDANDO_CONTRATO,
  convertido: PROPOSTA_STATUS.CONTRATO_GERADO,
};

/** Aceita valores antigos do banco até concluir migração. */
export function normalizarStatusProposta(status?: string | null): string {
  const s = (status || '').trim();
  if (!s) return PROPOSTA_STATUS.AGUARDANDO_CONTRATO;
  return LEGACY_MAP[s] || s;
}

export function propostaEhRascunho(status?: string | null): boolean {
  return normalizarStatusProposta(status) === PROPOSTA_STATUS.RASCUNHO;
}

export function propostaAguardandoContrato(status?: string | null): boolean {
  return normalizarStatusProposta(status) === PROPOSTA_STATUS.AGUARDANDO_CONTRATO;
}

export function propostaEmPosVenda(status?: string | null): boolean {
  return normalizarStatusProposta(status) === PROPOSTA_STATUS.EM_POS_VENDA;
}

export function propostaContratoGerado(status?: string | null): boolean {
  return normalizarStatusProposta(status) === PROPOSTA_STATUS.CONTRATO_GERADO;
}

export function propostaPodeGerarContrato(status?: string | null): boolean {
  return propostaEmPosVenda(status);
}

export function propostaPodeEditar(status?: string | null): boolean {
  const s = normalizarStatusProposta(status);
  return (
    s === PROPOSTA_STATUS.RASCUNHO
    || s === PROPOSTA_STATUS.AGUARDANDO_CONTRATO
    || s === PROPOSTA_STATUS.EM_POS_VENDA
  );
}

export function propostaStatusEncerrado(status?: string | null): boolean {
  const s = normalizarStatusProposta(status);
  return (
    s === PROPOSTA_STATUS.CONTRATO_GERADO
    || s === PROPOSTA_STATUS.CANCELADO
    || s === PROPOSTA_STATUS.REJEITADA
  );
}

export function propostaEmAberto(status?: string | null): boolean {
  const s = normalizarStatusProposta(status);
  return (
    s === PROPOSTA_STATUS.RASCUNHO
    || s === PROPOSTA_STATUS.AGUARDANDO_CONTRATO
    || s === PROPOSTA_STATUS.EM_POS_VENDA
  );
}

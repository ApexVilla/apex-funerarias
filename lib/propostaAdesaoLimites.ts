/** Limites comerciais da taxa de adesão em propostas (centavos). */
export const PROPOSTA_ADESAO_MIN_CENTAVOS = 10000; // R$ 100,00
export const PROPOSTA_ADESAO_MAX_CENTAVOS = 15000; // R$ 150,00

/** Valor sugerido ao selecionar o plano (teto permitido). */
export const PROPOSTA_ADESAO_PADRAO_SUGERIDO_CENTAVOS = PROPOSTA_ADESAO_MAX_CENTAVOS;

export function limitarValorAdesaoProposta(centavos: number): number {
  return Math.min(
    PROPOSTA_ADESAO_MAX_CENTAVOS,
    Math.max(PROPOSTA_ADESAO_MIN_CENTAVOS, Math.round(centavos) || 0),
  );
}

export function valorAdesaoInicialProposta(planoTaxaAdesaoCentavos?: number | null): number {
  const base = planoTaxaAdesaoCentavos ?? PROPOSTA_ADESAO_PADRAO_SUGERIDO_CENTAVOS;
  return limitarValorAdesaoProposta(base);
}

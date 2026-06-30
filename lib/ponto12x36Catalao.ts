import type { PontoConfig } from './pontoRules';

/** Fenix de Catalão — plantões longos (entrada + saída dias depois). */
export const EMPRESA_ID_FENIX_CATALAO = 'a3c5a058-f8c5-40e8-a55f-0fefe866848d';

/** Máximo de dias civis que uma jornada 12x36 pode cruzar (ex.: seg 19h → qua 14h). */
export const JORNADA_MULTIDIA_12X36_MAX_DIAS = 7;

function is12x36(config: Pick<PontoConfig, 'regime'>): boolean {
  return config.regime === 'doze_por_trinta_seis';
}

export function jornadaMultidia12x36Catalao(
  empresaId: string | null | undefined,
  config: Pick<PontoConfig, 'regime'>,
): boolean {
  return is12x36(config) && (empresaId || '').trim() === EMPRESA_ID_FENIX_CATALAO;
}

export function opcoesConsolidacaoJornadaMultidia(
  empresaId: string | null | undefined,
  config: Pick<PontoConfig, 'regime'>,
): { multidiaMaxDias: number } | undefined {
  return jornadaMultidia12x36Catalao(empresaId, config)
    ? { multidiaMaxDias: JORNADA_MULTIDIA_12X36_MAX_DIAS }
    : undefined;
}

export function margemDiasCargaPontoMes(
  colaboradores: { empresa_id?: string; permissoes?: unknown }[],
  getConfig: (permissoes: unknown) => Pick<PontoConfig, 'regime'>,
): number {
  const precisa = colaboradores.some((c) =>
    jornadaMultidia12x36Catalao(c.empresa_id, getConfig(c.permissoes)),
  );
  return precisa ? JORNADA_MULTIDIA_12X36_MAX_DIAS : 1;
}

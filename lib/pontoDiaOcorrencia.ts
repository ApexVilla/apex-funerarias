export type PontoDiaOcorrenciaTipo = 'folga' | 'atestado' | 'feriado' | 'jornada_normal' | 'hora_extra';

export type PontoDiaOcorrencia = {
  id: string;
  data: string;
  tipo: PontoDiaOcorrenciaTipo;
  motivo?: string;
};

export const LABEL_OCORRENCIA_PONTO: Record<PontoDiaOcorrenciaTipo, string> = {
  folga: 'Folga',
  atestado: 'Atestado',
  feriado: 'Feriado',
  jornada_normal: 'Jornada Normal',
  hora_extra: 'Hora Extra',
};

export function mapaOcorrenciasPorDia(
  rows: PontoDiaOcorrencia[],
): Record<string, PontoDiaOcorrencia> {
  const map: Record<string, PontoDiaOcorrencia> = {};
  for (const row of rows) {
    const dia = row.data.slice(0, 10);
    if (dia) map[dia] = { ...row, data: dia };
  }
  return map;
}

export function isDiaFolgaManual(ocorrencia?: PontoDiaOcorrencia | null): boolean {
  return ocorrencia?.tipo === 'folga';
}

export function isDiaAtestado(ocorrencia?: PontoDiaOcorrencia | null): boolean {
  return ocorrencia?.tipo === 'atestado';
}

export function isDiaFeriadoManual(ocorrencia?: PontoDiaOcorrencia | null): boolean {
  return ocorrencia?.tipo === 'feriado';
}

export function isDiaJornadaNormalManual(ocorrencia?: PontoDiaOcorrencia | null): boolean {
  return ocorrencia?.tipo === 'jornada_normal';
}

export function isDiaHoraExtraManual(ocorrencia?: PontoDiaOcorrencia | null): boolean {
  return ocorrencia?.tipo === 'hora_extra';
}

export function isDiaJustificadoPorOcorrencia(ocorrencia?: PontoDiaOcorrencia | null): boolean {
  return (
    isDiaFolgaManual(ocorrencia) ||
    isDiaAtestado(ocorrencia) ||
    isDiaFeriadoManual(ocorrencia) ||
    isDiaHoraExtraManual(ocorrencia)
  );
}

import type { PontoConfig } from './pontoRules';
import { isDiaFeriado } from './pontoFeriados';
import { isDiaFerias, type FeriasPeriodo } from './pontoFerias';

export function isFimDeSemanaLocal(dataISO: string): boolean {
  const d = new Date(`${dataISO.slice(0, 10)}T12:00:00`).getDay();
  return d === 0 || d === 6;
}

export function isSabadoLocal(dataISO: string): boolean {
  return new Date(`${dataISO.slice(0, 10)}T12:00:00`).getDay() === 6;
}

export function isDomingoLocal(dataISO: string): boolean {
  return new Date(`${dataISO.slice(0, 10)}T12:00:00`).getDay() === 0;
}

export function temEscalaSabadoAlternado(config: PontoConfig): boolean {
  return Boolean(config.escala_sabado_alternado && config.data_inicio_escala_sabado);
}

/** Escala de sábado marcada no cadastro (mesmo sem data âncora ainda). */
export function temEscalaSabadoConfigurada(config: PontoConfig): boolean {
  return Boolean(config.escala_sabado_alternado);
}

export function metaSabadoMinutos(config: PontoConfig): number {
  const m = Number(config.meta_sabado_minutos);
  return Number.isFinite(m) && m > 0 ? m : 4 * 60;
}

/** Meta no sábado de plantão / jornada 6h (sábado útil). */
function metaSabadoEfetiva(config: PontoConfig): number {
  if (config.regime === 'seis_horas') return config.carga_horaria_minutos;
  return metaSabadoMinutos(config);
}

/** Sábado de trabalho na escala alternada (âncora = primeiro sábado de plantão). */
export function isSabadoTrabalhoEscala(config: PontoConfig, dataISO: string): boolean {
  if (!temEscalaSabadoAlternado(config)) return false;
  const dia = dataISO.slice(0, 10);
  if (!isSabadoLocal(dia)) return false;
  const inicio = config.data_inicio_escala_sabado!.slice(0, 10);
  if (dia < inicio) return false;
  const anchor = new Date(`${inicio}T12:00:00`);
  const atual = new Date(`${dia}T12:00:00`);
  const diffDias = Math.round((atual.getTime() - anchor.getTime()) / 86_400_000);
  const semanas = Math.floor(diffDias / 7);
  return semanas % 2 === 0;
}

/** Sábado de folga na escala alternada (sem batida = folga, não falta). */
export function isSabadoFolgaEscala(config: PontoConfig, dataISO: string): boolean {
  return temEscalaSabadoAlternado(config) && isSabadoLocal(dataISO) && !isSabadoTrabalhoEscala(config, dataISO);
}

export function isRegime12x36(config: PontoConfig): boolean {
  return config.regime === 'doze_por_trinta_seis';
}

export function isDiaConvocado(config: PontoConfig, dataISO: string): boolean {
  const dia = dataISO.slice(0, 10);
  return (config.convocacoes_datas || []).some((d) => d.slice(0, 10) === dia);
}

export function diaAntesInicioPonto(config: PontoConfig, dataISO: string): boolean {
  const inicio = (config.data_inicio_ponto || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return false;
  return dataISO.slice(0, 10) < inicio;
}

/** Dia de plantão na escala 12x36 contada a partir de `data_inicio_ponto` (dia 0 = trabalho). */
export function isDiaTrabalho12x36(config: PontoConfig, dataISO: string): boolean {
  if (!isRegime12x36(config)) return false;
  const inicio = (config.data_inicio_ponto || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return false;
  const dia = dataISO.slice(0, 10);
  if (dia < inicio) return false;
  const anchor = new Date(`${inicio}T12:00:00`);
  const atual = new Date(`${dia}T12:00:00`);
  const diffDias = Math.round((atual.getTime() - anchor.getTime()) / 86_400_000);
  return diffDias % 2 === 0;
}

/** Folga 12x36: dia de descanso do ciclo ou legado sem âncora (qualquer dia sem batida). */
export function isDiaFolga12x36(
  config: PontoConfig,
  dataISO: string,
  temBatida: boolean,
): boolean {
  if (!isRegime12x36(config) || temBatida) return false;
  if (diaAntesInicioPonto(config, dataISO)) return false;
  const inicio = (config.data_inicio_ponto || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return true;
  return !isDiaTrabalho12x36(config, dataISO);
}

/** Trabalho em dia de folga do ciclo 12x36 — hora extra (meta zero, soma tudo trabalhado). */
export function isDiaExtra12x36(
  config: PontoConfig,
  dataISO: string,
  temBatida: boolean,
): boolean {
  if (!isRegime12x36(config) || !temBatida) return false;
  if (diaAntesInicioPonto(config, dataISO)) return false;
  const inicio = (config.data_inicio_ponto || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return false;
  return !isDiaTrabalho12x36(config, dataISO);
}

/** Meta do dia para saldo (0 em folga 12x36; meta 12h quando houver batida no dia). */
export function metaMinutosNoDia(
  config: PontoConfig,
  dataISO: string,
  temBatida: boolean,
  feriados?: ReadonlySet<string>,
  periodosFerias?: ReadonlyArray<FeriasPeriodo>,
): number {
  if (diaAntesInicioPonto(config, dataISO)) return 0;
  if (config.regime === 'cargo_confianca') return 0;
  if (isDiaFerias(dataISO, periodosFerias)) return 0;
  if (isDiaFeriado(dataISO, feriados)) return 0;

  if (isRegime12x36(config)) {
    if (temBatida) {
      if (isDiaExtra12x36(config, dataISO, temBatida)) return 0;
      return config.carga_horaria_minutos;
    }
    if (isDiaTrabalho12x36(config, dataISO)) return config.carga_horaria_minutos;
    return 0;
  }

  if (temEscalaSabadoConfigurada(config)) {
    if (isDomingoLocal(dataISO)) return 0;
    if (isSabadoLocal(dataISO)) {
      if (temBatida) {
        // Sábado com batida: plantão/jornada normal (meta do sábado, não hora extra integral)
        if (!temEscalaSabadoAlternado(config) || isSabadoTrabalhoEscala(config, dataISO)) {
          return metaSabadoEfetiva(config);
        }
        return metaSabadoMinutos(config);
      }
      if (temEscalaSabadoAlternado(config) && isSabadoTrabalhoEscala(config, dataISO)) {
        return metaSabadoEfetiva(config);
      }
      return 0;
    }
    return config.carga_horaria_minutos;
  }

  // Jornada 6h com sábado como dia útil (sem escala alternada)
  if (config.regime === 'seis_horas' && isSabadoLocal(dataISO)) {
    return temBatida ? config.carga_horaria_minutos : 0;
  }

  if (isFimDeSemanaLocal(dataISO)) return 0;

  return config.carga_horaria_minutos;
}

/** Dia em que falta de ponto conta como falta. Em 12x36, dia sem batida é folga (nunca falta automática). */
export function diaExigeRegistroPonto(
  config: PontoConfig,
  dataISO: string,
  temBatida: boolean,
  feriados?: ReadonlySet<string>,
  periodosFerias?: ReadonlyArray<FeriasPeriodo>,
): boolean {
  if (diaAntesInicioPonto(config, dataISO)) return false;
  if (config.regime === 'cargo_confianca') return false;
  if (isDiaFerias(dataISO, periodosFerias)) return false;
  if (isDiaFeriado(dataISO, feriados)) return false;
  if (temBatida) return false;
  if (isRegime12x36(config)) {
    return isDiaTrabalho12x36(config, dataISO);
  }
  if (temEscalaSabadoAlternado(config)) {
    if (isSabadoTrabalhoEscala(config, dataISO)) return true;
    return !isSabadoLocal(dataISO) && !isDomingoLocal(dataISO);
  }
  if (config.regime === 'seis_horas' && isSabadoLocal(dataISO)) return false;
  if (isFimDeSemanaLocal(dataISO)) return false;
  return true;
}

/** Trabalho em dia que seria folga (fim de semana, sábado de folga da escala, etc.). */
export function isDiaHoraExtra(
  config: PontoConfig,
  dataISO: string,
  temBatida: boolean,
): boolean {
  if (!temBatida) return false;
  if (isSabadoTrabalhoEscala(config, dataISO)) return false;
  if (config.regime === 'seis_horas' && isSabadoLocal(dataISO) && !temEscalaSabadoAlternado(config)) {
    return false;
  }
  if (isDiaExtra12x36(config, dataISO, temBatida)) return true;
  if (isSabadoFolgaEscala(config, dataISO)) return true;
  if (temEscalaSabadoAlternado(config) && isDomingoLocal(dataISO)) return true;
  if (!temEscalaSabadoConfigurada(config) && !isRegime12x36(config) && isFimDeSemanaLocal(dataISO)) {
    return true;
  }
  return false;
}

export function labelMetaDiaria(
  config: PontoConfig,
  dataISO: string,
  temBatida: boolean,
  feriados?: ReadonlySet<string>,
  periodosFerias?: ReadonlyArray<FeriasPeriodo>,
): string {
  if (diaAntesInicioPonto(config, dataISO)) return '—';
  if (isDiaFerias(dataISO, periodosFerias)) return 'Férias';
  if (isDiaFeriado(dataISO, feriados)) return 'Feriado';
  if (isDiaExtra12x36(config, dataISO, temBatida)) return 'Extra';
  if (isSabadoFolgaEscala(config, dataISO) && !temBatida) return 'Folga sáb.';
  const min = metaMinutosNoDia(config, dataISO, temBatida, feriados, periodosFerias);
  if (min <= 0) {
    if (isDiaFolga12x36(config, dataISO, temBatida)) return 'Folga';
    if (isSabadoFolgaEscala(config, dataISO) && temBatida) return 'Extra';
    return '—';
  }
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

import { dataHojeIsoLocal, dataIsoLocalFromDate, formatarDataIsoPtBr, normalizarDataIso, parseDataIsoLocal } from './contratoDatas';

/** Padrão comercial: dependentes adicionais com 90 dias de carência. */
export const CARENCIA_DEPENDENTE_PADRAO_DIAS = 90;

/** Janela para informar data de filiação do dependente em relação ao início do contrato. */
export const MAX_DIAS_FILIACAO_DESDE_CONTRATO = 15;

export function limitesDataFiliacaoDependente(
  dataContrato: string,
  dataHoje?: string,
): { min: string; max: string } | null {
  const ctr = normalizarDataIso(dataContrato);
  if (!ctr) return null;
  const hoje = normalizarDataIso(dataHoje) || dataHojeIsoLocal();
  const min = addDaysIso(ctr, -MAX_DIAS_FILIACAO_DESDE_CONTRATO);
  const maxPorContrato = addDaysIso(ctr, MAX_DIAS_FILIACAO_DESDE_CONTRATO);
  const max = maxPorContrato <= hoje ? maxPorContrato : hoje;
  return { min, max };
}

export function clampDataFiliacaoDependente(dataFiliacao: string, dataContrato: string): string {
  const limites = limitesDataFiliacaoDependente(dataContrato);
  const d = normalizarDataIso(dataFiliacao);
  if (!limites) return d || dataHojeIsoLocal();
  if (!d) return limites.max;
  if (d < limites.min) return limites.min;
  if (d > limites.max) return limites.max;
  return d;
}

export function dataFiliacaoPermitida(dataFiliacao: string, dataContrato: string): boolean {
  const limites = limitesDataFiliacaoDependente(dataContrato);
  const d = normalizarDataIso(dataFiliacao);
  if (!limites || !d) return false;
  return d >= limites.min && d <= limites.max;
}

export function mensagemLimiteDataFiliacaoDependente(dataContrato: string): string {
  const limites = limitesDataFiliacaoDependente(dataContrato);
  if (!limites) {
    return 'Informe a data de início do contrato para definir a filiação do dependente.';
  }
  return `Permitido de ${formatarDataIsoPtBr(limites.min)} até ${formatarDataIsoPtBr(limites.max)} (máx. ${MAX_DIAS_FILIACAO_DESDE_CONTRATO} dias da data do contrato).`;
}

export type StatusCarenciaDependente = {
  diasCarencia: number;
  dataInclusao: string;
  dataFimCarencia: string;
  emCarencia: boolean;
  diasRestantes: number;
  diasDecorridos: number;
};

export function diasCarenciaDependenteDoPlano(
  valor?: number | null,
  fallback: number = CARENCIA_DEPENDENTE_PADRAO_DIAS,
): number {
  if (valor == null || Number.isNaN(Number(valor)) || Number(valor) < 0) return fallback;
  return Math.max(0, Math.floor(Number(valor)));
}

export function addDaysIso(isoDate: string, days: number): string {
  const base = parseDataIsoLocal(isoDate);
  if (!base) return normalizarDataIso(isoDate) || '';
  base.setDate(base.getDate() + days);
  return dataIsoLocalFromDate(base);
}

export function calcularStatusCarenciaDependente(
  dataInclusao: string,
  diasCarencia: number = CARENCIA_DEPENDENTE_PADRAO_DIAS,
  dataReferencia?: string,
): StatusCarenciaDependente | null {
  const di = (dataInclusao || '').trim().slice(0, 10);
  if (!di) return null;

  const dias = Math.max(0, diasCarencia);
  const hoje = (dataReferencia || new Date().toISOString()).slice(0, 10);
  const dataFimCarencia = addDaysIso(di, dias);

  const tHoje = new Date(`${hoje}T12:00:00`).getTime();
  const tInicio = new Date(`${di}T12:00:00`).getTime();
  const tFim = new Date(`${dataFimCarencia}T12:00:00`).getTime();

  const emCarencia = tHoje >= tInicio && tHoje <= tFim;
  const msDia = 86400000;
  const diasDecorridos = Math.max(0, Math.floor((tHoje - tInicio) / msDia));
  const diasRestantes = emCarencia ? Math.max(0, Math.floor((tFim - tHoje) / msDia)) : 0;

  return {
    diasCarencia: dias,
    dataInclusao: di,
    dataFimCarencia,
    emCarencia,
    diasRestantes,
    diasDecorridos,
  };
}

/** Carência do titular/contrato (regra do plano a partir da contratação). */
export function calcularStatusCarenciaContrato(
  dataContratacao: string,
  diasCarenciaPlano: number,
  dataReferencia?: string,
): StatusCarenciaDependente | null {
  return calcularStatusCarenciaDependente(dataContratacao, diasCarenciaPlano, dataReferencia);
}

export function formatarResumoCarenciaContrato(
  dataContratacao: string,
  diasCarenciaPlano: number,
): string {
  const s = calcularStatusCarenciaContrato(dataContratacao, diasCarenciaPlano);
  if (!s) return 'Data de contratação não informada.';
  if (s.diasCarencia === 0) {
    return `Contrato sem carência — cobertura desde ${formatarDataIsoPtBr(s.dataInclusao)}.`;
  }
  if (s.emCarencia) {
    return `Contrato em carência: ${s.diasRestantes} dia(s) restantes (até ${formatarDataIsoPtBr(s.dataFimCarencia)}).`;
  }
  return `Carência do contrato encerrada em ${formatarDataIsoPtBr(s.dataFimCarencia)}.`;
}

export function formatarResumoCarenciaDependente(s: StatusCarenciaDependente): string {
  if (s.diasCarencia === 0) {
    return `Filiado em ${formatarDataIsoPtBr(s.dataInclusao)} — sem carência (cobertura imediata).`;
  }
  if (s.emCarencia) {
    return `Em carência: faltam ${s.diasRestantes} de ${s.diasCarencia} dia(s). Término em ${formatarDataIsoPtBr(s.dataFimCarencia)}.`;
  }
  if (s.diasDecorridos > s.diasCarencia) {
    return `Carência encerrada em ${formatarDataIsoPtBr(s.dataFimCarencia)} — cobertura liberada.`;
  }
  return `Cobertura liberada desde ${formatarDataIsoPtBr(s.dataFimCarencia)}.`;
}

export function aplicarCarenciaBeneficiarioPayload(
  payload: Record<string, unknown>,
  diasCarencia: number,
): Record<string, unknown> {
  const di = String(payload.data_inclusao || new Date().toISOString()).slice(0, 10);
  const dias = diasCarenciaDependenteDoPlano(diasCarencia);
  const status = calcularStatusCarenciaDependente(di, dias);
  if (!status) return { ...payload, data_inclusao: di };

  return {
    ...payload,
    data_inclusao: di,
    data_fim_carencia: status.dataFimCarencia,
    carencia_ativa: status.emCarencia,
  };
}

import type { StatusCobrancaPendente } from './cobrancaPendentesSupabase';

export type MotivoVisitaCodigo =
  | 'nao_estava'
  | 'nao_pagou'
  | 'recusou'
  | 'sem_dinheiro'
  | 'endereco_fechado'
  | 'promessa'
  | 'outro'
  | 'desconhecido';

export type SituacaoCobrancaCliente =
  | 'quitado'
  | 'nunca_visitado'
  | 'visitado_sem_pagamento';

export const MOTIVO_VISITA_LABELS: Record<MotivoVisitaCodigo, string> = {
  nao_estava: 'Não estava em casa',
  nao_pagou: 'Não pagou',
  recusou: 'Recusou pagar',
  sem_dinheiro: 'Sem dinheiro',
  endereco_fechado: 'Endereço fechado / não localizado',
  promessa: 'Promessa de pagamento',
  outro: 'Outro motivo',
  desconhecido: 'Motivo não informado',
};

const STATUS_PARA_MOTIVO: Partial<Record<StatusCobrancaPendente, MotivoVisitaCodigo>> = {
  nao_localizado: 'nao_estava',
  recusou: 'recusou',
  promessa: 'promessa',
  em_andamento: 'nao_pagou',
  pendente: 'desconhecido',
};

export type ParcelaCobrancaResumo = {
  id: string;
  status: StatusCobrancaPendente;
  ultima_visita?: string;
  observacao?: string;
  tentativas: number;
  dias_atraso: number;
};

export type ClienteCobrancaResumo = {
  situacao: SituacaoCobrancaCliente;
  ultima_visita?: string;
  dias_sem_visita: number | null;
  tempo_sem_visita_label: string;
  motivo_codigo: MotivoVisitaCodigo;
  motivo_label: string;
  detalhe_visita: string;
  tentativas_total: number;
  parcelas_total: number;
  parcelas_pendentes: number;
  parcelas_cobradas: number;
  ordem_rota?: number;
};

export function diasDesdeData(iso?: string | null): number | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function formatarTempoSemVisita(dias: number | null, temPendencia = true): string {
  if (!temPendencia) return 'Quitado';
  if (dias === null) return 'Nunca visitado';
  if (dias === 0) return 'Visitado hoje';
  if (dias === 1) return 'Há 1 dia sem nova visita';
  if (dias < 30) return `Há ${dias} dias sem visita`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `Há ${meses} mês(es) sem visita`;
  return `Há mais de 1 ano sem visita`;
}

/** Extrai motivo estruturado da observação gravada em visitas. */
export function extrairMotivoVisita(
  observacao?: string | null,
  status?: StatusCobrancaPendente,
): { codigo: MotivoVisitaCodigo; label: string; detalhe: string; teveVisita: boolean } {
  const obs = String(observacao ?? '').trim();

  const tagMatch = obs.match(/\[Visita:([a-z_]+)\]/i);
  if (tagMatch?.[1]) {
    const raw = tagMatch[1].toLowerCase() as MotivoVisitaCodigo;
    const codigo = raw in MOTIVO_VISITA_LABELS ? raw : 'outro';
    const motivoTexto = obs.match(/Motivo:\s*([^|]+)/i)?.[1]?.trim();
    const detalhe =
      obs.match(/Detalhes:\s*(.+)$/i)?.[1]?.trim() ||
      obs.replace(/\[Visita:[^\]]+\]\s*/i, '').replace(/Motivo:[^|]+\|?\s*/i, '').trim();
    return {
      codigo,
      label: motivoTexto || MOTIVO_VISITA_LABELS[codigo],
      detalhe,
      teveVisita: true,
    };
  }

  if (obs.includes('[Visita de rota]') || obs.includes('Visita de rota')) {
    const motivoTexto = obs.match(/Motivo:\s*([^|]+)/i)?.[1]?.trim();
    const detalhe = obs.match(/Detalhes:\s*(.+)$/i)?.[1]?.trim() || '';
    let codigo: MotivoVisitaCodigo = 'outro';
    const lower = obs.toLowerCase();
    if (lower.includes('não estava') || lower.includes('nao estava') || lower.includes('ausente')) {
      codigo = 'nao_estava';
    } else if (lower.includes('recusou')) codigo = 'recusou';
    else if (lower.includes('sem dinheiro')) codigo = 'sem_dinheiro';
    else if (lower.includes('promessa')) codigo = 'promessa';
    else if (lower.includes('fechado') || lower.includes('localizado')) codigo = 'endereco_fechado';
    else if (lower.includes('não pagou') || lower.includes('nao pagou')) codigo = 'nao_pagou';

    return {
      codigo,
      label: motivoTexto || MOTIVO_VISITA_LABELS[codigo],
      detalhe,
      teveVisita: true,
    };
  }

  if (status && status !== 'pendente' && status !== 'cobrado') {
    const codigo = STATUS_PARA_MOTIVO[status] || 'desconhecido';
    return {
      codigo,
      label: MOTIVO_VISITA_LABELS[codigo],
      detalhe: obs || '',
      teveVisita: Boolean(obs),
    };
  }

  return {
    codigo: 'desconhecido',
    label: MOTIVO_VISITA_LABELS.desconhecido,
    detalhe: obs,
    teveVisita: false,
  };
}

export function montarObservacaoVisita(
  motivo: MotivoVisitaCodigo,
  detalhe: string,
  clienteEstava: 'sim' | 'nao',
): string {
  const estavaLabel = clienteEstava === 'sim' ? 'Sim' : 'Não';
  const motivoLabel = MOTIVO_VISITA_LABELS[motivo] || motivo;
  const detalheNorm = detalhe.trim();
  return [
    `[Visita:${motivo}]`,
    '[Visita de rota]',
    `Cliente estava no local: ${estavaLabel}`,
    `Motivo: ${motivoLabel}`,
    detalheNorm ? `Detalhes: ${detalheNorm}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

export function resumirClienteCobranca(
  parcelas: ParcelaCobrancaResumo[],
  ordemRota?: number,
): ClienteCobrancaResumo {
  const parcelasPendentes = parcelas.filter((p) => p.status !== 'cobrado');
  const parcelasCobradas = parcelas.length - parcelasPendentes.length;

  if (parcelasPendentes.length === 0) {
    return {
      situacao: 'quitado',
      dias_sem_visita: null,
      tempo_sem_visita_label: 'Quitado',
      motivo_codigo: 'desconhecido',
      motivo_label: 'Todas as parcelas baixadas',
      detalhe_visita: '',
      tentativas_total: parcelas.reduce((m, p) => m + (p.tentativas || 0), 0),
      parcelas_total: parcelas.length,
      parcelas_pendentes: 0,
      parcelas_cobradas: parcelasCobradas,
      ordem_rota: ordemRota,
    };
  }

  let ultimaVisita: string | undefined;
  let motivoFonte: ParcelaCobrancaResumo | undefined;

  parcelas.forEach((p) => {
    if (!p.ultima_visita) return;
    if (!ultimaVisita || new Date(p.ultima_visita) > new Date(ultimaVisita)) {
      ultimaVisita = p.ultima_visita;
      motivoFonte = p;
    }
  });

  const diasSemVisita = diasDesdeData(ultimaVisita);
  const teveVisita = Boolean(ultimaVisita);
  const motivoInfo = motivoFonte
    ? extrairMotivoVisita(motivoFonte.observacao, motivoFonte.status)
    : { codigo: 'desconhecido' as MotivoVisitaCodigo, label: MOTIVO_VISITA_LABELS.desconhecido, detalhe: '', teveVisita: false };

  const situacao: SituacaoCobrancaCliente = !teveVisita
    ? 'nunca_visitado'
    : 'visitado_sem_pagamento';

  return {
    situacao,
    ultima_visita: ultimaVisita,
    dias_sem_visita: diasSemVisita,
    tempo_sem_visita_label: formatarTempoSemVisita(diasSemVisita, true),
    motivo_codigo: motivoInfo.codigo,
    motivo_label: teveVisita ? motivoInfo.label : 'Ainda sem visita registrada',
    detalhe_visita: motivoInfo.detalhe,
    tentativas_total: parcelas.reduce((m, p) => m + (p.tentativas || 0), 0),
    parcelas_total: parcelas.length,
    parcelas_pendentes: parcelasPendentes.length,
    parcelas_cobradas: parcelasCobradas,
    ordem_rota: ordemRota,
  };
}

export type ResumoRotaDia = {
  totalClientes: number;
  clientesCobrados: number;
  clientesNaoCobrados: number;
  clientesNuncaVisitados: number;
  clientesComVisitaSemPagamento: number;
};

export function resumirRotaDia(
  clientes: { cliente_id: string; resumo: ClienteCobrancaResumo }[],
): ResumoRotaDia {
  let clientesCobrados = 0;
  let clientesNuncaVisitados = 0;
  let clientesComVisitaSemPagamento = 0;

  clientes.forEach(({ resumo: r }) => {
    if (r.situacao === 'quitado') clientesCobrados += 1;
    else if (r.situacao === 'nunca_visitado') clientesNuncaVisitados += 1;
    else clientesComVisitaSemPagamento += 1;
  });

  const totalClientes = clientes.length;
  return {
    totalClientes,
    clientesCobrados,
    clientesNaoCobrados: totalClientes - clientesCobrados,
    clientesNuncaVisitados,
    clientesComVisitaSemPagamento,
  };
}

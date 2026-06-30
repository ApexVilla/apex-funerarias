import {
  normalizarStatusProposta,
  PROPOSTA_STATUS,
  propostaAguardandoContrato,
  propostaContratoGerado,
  propostaEhRascunho,
  propostaEmPosVenda,
  propostaStatusEncerrado,
} from './propostaStatus';

export type PropostaDatasPendencia = {
  created_at?: string | null;
  updated_at?: string | null;
  liberada_em?: string | null;
  contrato_gerado_em?: string | null;
  pos_venda_iniciado_em?: string | null;
  rejeitada_em?: string | null;
  status?: string | null;
};

export type PropostaLinhaTempoDetalhe = {
  diasPreenchimento: number | null;
  diasFilaContrato: number | null;
  diasPosVenda: number | null;
  diasTotal: number | null;
  emAndamento: boolean;
  datas: {
    criacao: string | null;
    liberada: string | null;
    posVenda: string | null;
    contrato: string | null;
    encerramento: string | null;
  };
};

function parseData(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Início da contagem de pendência conforme o status. */
export function dataInicioPendenciaProposta(row: PropostaDatasPendencia): Date | null {
  const status = normalizarStatusProposta(row.status);
  if (propostaEhRascunho(status)) {
    return parseData(row.created_at);
  }
  if (propostaAguardandoContrato(status)) {
    return (
      parseData(row.liberada_em)
      || parseData(row.updated_at)
      || parseData(row.created_at)
    );
  }
  if (propostaEmPosVenda(status)) {
    const pos = (row as { pos_venda_iniciado_em?: string | null }).pos_venda_iniciado_em;
    return parseData(pos) || parseData(row.liberada_em) || parseData(row.updated_at);
  }
  if (propostaContratoGerado(status)) {
    return parseData(row.liberada_em) || parseData(row.created_at);
  }
  return null;
}

function diffDiasEntre(inicio: Date, fim: Date): number {
  return Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / 86400000));
}

function dataFimLinhaTempo(
  row: PropostaDatasPendencia,
  agora: Date,
): Date {
  const status = normalizarStatusProposta(row.status);
  const contrato = parseData(row.contrato_gerado_em);
  if (propostaContratoGerado(status) && contrato) return contrato;

  const rejeitada = parseData(row.rejeitada_em);
  if (
    status === PROPOSTA_STATUS.REJEITADA
    || status === PROPOSTA_STATUS.CANCELADO
  ) {
    return rejeitada || parseData(row.updated_at) || agora;
  }

  return agora;
}

/** Detalhamento: preenchimento → fila → pós-venda → total até contrato (ou hoje). */
export function calcularLinhaTempoProposta(
  row: PropostaDatasPendencia,
  agora: Date = new Date(),
): PropostaLinhaTempoDetalhe | null {
  const criacao = parseData(row.created_at);
  if (!criacao) return null;

  const liberada = parseData(row.liberada_em);
  const posVenda = parseData(row.pos_venda_iniciado_em);
  const contrato = parseData(row.contrato_gerado_em);
  const fimTotal = dataFimLinhaTempo(row, agora);
  const status = normalizarStatusProposta(row.status);

  let diasPreenchimento: number | null = null;
  if (liberada) {
    diasPreenchimento = diffDiasEntre(criacao, liberada);
  } else if (propostaEhRascunho(status)) {
    diasPreenchimento = diffDiasEntre(criacao, fimTotal);
  } else {
    diasPreenchimento = diffDiasEntre(criacao, fimTotal);
  }

  let diasFilaContrato: number | null = null;
  if (liberada) {
    let fimFila = fimTotal;
    if (posVenda) fimFila = posVenda;
    else if (propostaAguardandoContrato(status)) fimFila = agora;
    else if (propostaEmPosVenda(status) && posVenda) fimFila = posVenda;
    diasFilaContrato = diffDiasEntre(liberada, fimFila);
  }

  let diasPosVenda: number | null = null;
  if (posVenda) {
    const fimPos = propostaEmPosVenda(status)
      ? agora
      : (contrato || fimTotal);
    diasPosVenda = diffDiasEntre(posVenda, fimPos);
  }

  const diasTotal = diffDiasEntre(criacao, fimTotal);

  return {
    diasPreenchimento,
    diasFilaContrato: liberada ? diasFilaContrato : null,
    diasPosVenda,
    diasTotal,
    emAndamento: !propostaStatusEncerrado(status),
    datas: {
      criacao: row.created_at || null,
      liberada: row.liberada_em || null,
      posVenda: row.pos_venda_iniciado_em || null,
      contrato: row.contrato_gerado_em || null,
      encerramento: propostaContratoGerado(status)
        ? row.contrato_gerado_em || null
        : (row.rejeitada_em || row.updated_at || null),
    },
  };
}

/** Dias totais desde a criação até contrato, rejeição/cancelamento ou hoje. */
export function diasTotalProposta(
  row: PropostaDatasPendencia,
  agora: Date = new Date(),
): number | null {
  return calcularLinhaTempoProposta(row, agora)?.diasTotal ?? null;
}

/** Dias em pendência até hoje (abertas) ou até contrato_gerado_em (já efetivadas). */
export function diasPendenciaProposta(
  row: PropostaDatasPendencia,
  agora: Date = new Date(),
): number | null {
  const inicio = dataInicioPendenciaProposta(row);
  if (!inicio) return null;

  const status = normalizarStatusProposta(row.status);
  let fim = agora;
  if (propostaContratoGerado(status)) {
    const gerado = parseData(row.contrato_gerado_em);
    if (gerado) fim = gerado;
  }

  const diff = Math.floor((fim.getTime() - inicio.getTime()) / 86400000);
  return Math.max(0, diff);
}

export function rotuloDiasPendencia(status?: string | null): string {
  const s = normalizarStatusProposta(status);
  if (propostaEhRascunho(s)) return 'dias em preenchimento';
  if (propostaAguardandoContrato(s)) return 'dias na fila de contrato';
  if (propostaEmPosVenda(s)) return 'dias desde liberar';
  if (propostaContratoGerado(s)) return 'dias até gerar contrato';
  return 'dias';
}

export function formatarDataProposta(iso?: string | null): string {
  const d = parseData(iso);
  if (!d) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function classeDestaqueDiasPendencia(dias: number | null, status?: string | null): string {
  if (dias == null) return 'text-gray-400';
  if (
    !propostaAguardandoContrato(status)
    && !propostaEhRascunho(status)
    && !propostaEmPosVenda(status)
  ) {
    return 'text-gray-600';
  }
  if (dias >= 14) return 'text-red-700 font-bold';
  if (dias >= 7) return 'text-amber-700 font-semibold';
  return 'text-gray-800 font-medium';
}

/** KPI: média e máximo de dias na fila de contrato. */
export function resumoDiasFilaContrato(
  rows: PropostaDatasPendencia[],
  agora: Date = new Date(),
): { quantidade: number; mediaDias: number; maxDias: number } {
  const naFila = rows.filter((r) => propostaAguardandoContrato(r.status));
  const dias = naFila
    .map((r) => diasPendenciaProposta(r, agora))
    .filter((d): d is number => d != null);
  const quantidade = naFila.length;
  if (dias.length === 0) {
    return { quantidade, mediaDias: 0, maxDias: 0 };
  }
  const soma = dias.reduce((a, b) => a + b, 0);
  return {
    quantidade,
    mediaDias: Math.round(soma / dias.length),
    maxDias: Math.max(...dias),
  };
}

export function isModoFilaContrato(searchParams: URLSearchParams): boolean {
  return searchParams.get('fila') === 'contrato';
}

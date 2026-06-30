import type { ComissaoVendedorFaixaDto } from './comissaoVendedorService';

export const STATUS_CONTRATO_REALIZADO = ['contrato_gerado'] as const;

export interface PropostaVendedorLinha {
  id: string;
  sequencial: number;
  status: string;
  vendedor_id: string | null;
  contribuinte_nome: string;
  plano_nome: string | null;
  valor_mensal_centavos: number;
  created_at: string;
  contrato_realizado: boolean;
  confirmada: boolean;
  data_confirmacao: string | null;
  data_contrato: string | null;
  ja_pago_comissao: boolean;
  comissao_paga_em: string | null;
  numero_recibo: string | null;
}

export function propostaContratoRealizado(status: string): boolean {
  return STATUS_CONTRATO_REALIZADO.includes(status as (typeof STATUS_CONTRATO_REALIZADO)[number]);
}

/**
 * Contrato confirmado para comissão = contrato gerado + 1ª mensalidade quitada no financeiro.
 * Prioridade: baixa ativa em fin_contas_receber_baixas; senão título mensalidade pago (ex.: migração).
 * Campos da proposta (ex.: "recebeu no ato") não entram no cálculo.
 */
export function derivarConfirmacaoProposta(input: {
  status: string;
  parcela1_baixa_em?: string | null;
  parcela1_status_financeiro?: string | null;
  parcela1_data_pagamento_financeiro?: string | null;
}): { confirmada: boolean; data_confirmacao: string | null } {
  if (!propostaContratoRealizado(input.status)) {
    return { confirmada: false, data_confirmacao: null };
  }

  const dataBaixa = input.parcela1_baixa_em?.trim().slice(0, 10);
  if (dataBaixa) {
    return { confirmada: true, data_confirmacao: dataBaixa };
  }

  const st = String(input.parcela1_status_financeiro || '').toLowerCase();
  if (st === 'pago' || st === 'pago_parcial') {
    const dataPg = input.parcela1_data_pagamento_financeiro?.trim().slice(0, 10);
    if (dataPg) {
      return { confirmada: true, data_confirmacao: dataPg };
    }
  }

  return { confirmada: false, data_confirmacao: null };
}

export function dataNoPeriodo(iso: string | null | undefined, inicio: string, fim: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= inicio.slice(0, 10) && d <= fim.slice(0, 10);
}

export function resolverFaixaPorQuantidade(
  qtdConfirmada: number,
  faixas: ComissaoVendedorFaixaDto[],
): ComissaoVendedorFaixaDto | null {
  if (qtdConfirmada <= 0 || faixas.length === 0) return null;
  const ordenadas = [...faixas].sort((a, b) => a.ordem - b.ordem || a.qtd_min - b.qtd_min);
  for (const f of ordenadas) {
    const maxOk = f.qtd_max == null || qtdConfirmada <= f.qtd_max;
    if (qtdConfirmada >= f.qtd_min && maxOk) return f;
  }
  return null;
}

export function labelFaixa(f: ComissaoVendedorFaixaDto): string {
  const max = f.qtd_max != null ? String(f.qtd_max) : 'acima';
  return `${f.qtd_min} a ${max} contratos`;
}

export function formatarValorFaixa(centavos: number): string {
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export type ValorReferenciaConfirmacao = {
  centavos: number;
  tipo: 'ativa' | 'proxima' | 'nenhuma';
};

/** Valor por confirmação da configuração (faixa ativa ou próxima faixa, só para exibição). */
export function valorReferenciaPorConfirmacao(
  qtdConfirmada: number,
  faixas: ComissaoVendedorFaixaDto[],
  faixaAtual: ComissaoVendedorFaixaDto | null,
): ValorReferenciaConfirmacao {
  if (faixaAtual) {
    return { centavos: faixaAtual.valor_centavos, tipo: 'ativa' };
  }
  const ordenadas = [...faixas].sort((a, b) => a.ordem - b.ordem || a.qtd_min - b.qtd_min);
  const primeira = ordenadas[0];
  if (primeira && qtdConfirmada > 0 && qtdConfirmada < primeira.qtd_min) {
    return { centavos: primeira.valor_centavos, tipo: 'proxima' };
  }
  return { centavos: 0, tipo: 'nenhuma' };
}

export function montarFaixaLabelVendedor(
  qtdConfirmada: number,
  faixa: ComissaoVendedorFaixaDto | null,
  faixas: ComissaoVendedorFaixaDto[],
  valorPorContratoCentavos: number,
): string {
  if (faixa && valorPorContratoCentavos > 0) {
    return `${labelFaixa(faixa)} — ${formatarValorFaixa(valorPorContratoCentavos)}/confirmação`;
  }
  const ordenadas = [...faixas].sort((a, b) => a.ordem - b.ordem || a.qtd_min - b.qtd_min);
  const primeira = ordenadas[0];
  if (primeira && qtdConfirmada > 0 && qtdConfirmada < primeira.qtd_min) {
    const faltam = primeira.qtd_min - qtdConfirmada;
    return `Abaixo do mínimo (${qtdConfirmada}/${primeira.qtd_min} confirmados) — faltam ${faltam} para ${formatarValorFaixa(primeira.valor_centavos)}/confirmação`;
  }
  if (primeira) {
    return `Sem faixa no mês — mínimo ${primeira.qtd_min} confirmados (${formatarValorFaixa(primeira.valor_centavos)}/confirmação na 1ª faixa)`;
  }
  return 'Faixas não configuradas';
}

export function calcularComissaoFaixaVendedor(
  confirmadasNoPeriodo: PropostaVendedorLinha[],
  faixas: ComissaoVendedorFaixaDto[],
): {
  qtd_confirmada: number;
  faixa: ComissaoVendedorFaixaDto | null;
  valor_por_contrato_centavos: number;
  valor_total_centavos: number;
  linhas: Array<PropostaVendedorLinha & { valor_comissao_centavos: number }>;
} {
  const todasConfirmadas = confirmadasNoPeriodo.filter((p) => p.confirmada);
  const qtd = todasConfirmadas.length;
  const faixa = resolverFaixaPorQuantidade(qtd, faixas);
  const valorUnit = faixa?.valor_centavos ?? 0;

  const pendentesPagamento = todasConfirmadas.filter((p) => !p.ja_pago_comissao);
  const linhas = pendentesPagamento.map((p) => ({
    ...p,
    valor_comissao_centavos: valorUnit,
  }));

  return {
    qtd_confirmada: qtd,
    faixa,
    valor_por_contrato_centavos: valorUnit,
    valor_total_centavos: valorUnit * pendentesPagamento.length,
    linhas,
  };
}

export function labelStatusConfirmacao(p: PropostaVendedorLinha): string {
  if (!p.contrato_realizado) {
    if (p.status === 'em_pos_venda' || p.status === 'aguardando_contrato') return 'Em andamento';
    if (p.status === 'cancelado' || p.status === 'rejeitada') return 'Cancelada';
    return 'Sem contrato';
  }
  return p.confirmada ? 'Confirmada (1ª parc. quitada)' : 'Aguardando baixa da 1ª parcela';
}

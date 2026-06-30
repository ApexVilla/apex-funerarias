/** Regra de comissão cumulativa: percentual sobre base + valor fixo por operação. */
export interface RegraComissao {
  percentual: number;
  fixoCentavos: number;
}

export interface ComissaoConfigPadraoLike {
  tipo_comissao?: 'percentual' | 'fixo';
  valor?: number;
  percentual?: number;
  valor_fixo_centavos?: number;
}

export interface ColaboradorComissaoLike {
  comissao_tipo?: 'percentual' | 'fixo' | null;
  comissao_valor?: number | null;
  comissao_percentual?: number | null;
  comissao_fixo_centavos?: number | null;
}

export interface PlanoComissaoLike {
  comissao_venda_inicial?: number | null;
  comissao_venda_fixa_centavos?: number | null;
}

export interface PlanoComissaoOperacionalLike {
  comissao_agente_percentual?: number | null;
  comissao_agente_fixo_centavos?: number | null;
  comissao_atendente_percentual?: number | null;
  comissao_atendente_fixo_centavos?: number | null;
}

export type CargoComissaoOperacional = 'atendente' | 'agente_funerario';

export interface VendedorPlanoOverrideLike {
  percentual?: number | null;
  valor_fixo_centavos?: number | null;
}

export function normalizarRegraConfigPadrao(conf?: ComissaoConfigPadraoLike | null): RegraComissao {
  if (!conf) return { percentual: 0, fixoCentavos: 0 };

  const pctExplicito = conf.percentual != null ? Number(conf.percentual) : NaN;
  const fixoExplicito = conf.valor_fixo_centavos != null ? Number(conf.valor_fixo_centavos) : NaN;

  let percentual = Number.isFinite(pctExplicito) ? pctExplicito : 0;
  let fixoCentavos = Number.isFinite(fixoExplicito) ? Math.round(fixoExplicito) : 0;

  if (percentual === 0 && fixoCentavos === 0 && conf.valor != null) {
    const legado = Number(conf.valor);
    if (conf.tipo_comissao === 'fixo') {
      fixoCentavos = Math.round(legado * 100);
    } else {
      percentual = legado;
    }
  }

  return { percentual, fixoCentavos };
}

export function normalizarRegraColaborador(
  colab: ColaboradorComissaoLike,
  padrao: RegraComissao,
): RegraComissao {
  const pctCustom = colab.comissao_percentual != null ? Number(colab.comissao_percentual) : NaN;
  const fixoCustom = colab.comissao_fixo_centavos != null ? Number(colab.comissao_fixo_centavos) : NaN;

  if (Number.isFinite(pctCustom) || Number.isFinite(fixoCustom)) {
    return {
      percentual: Number.isFinite(pctCustom) ? pctCustom : padrao.percentual,
      fixoCentavos: Number.isFinite(fixoCustom) ? Math.round(fixoCustom) : padrao.fixoCentavos,
    };
  }

  if (colab.comissao_tipo === 'percentual' && colab.comissao_valor != null) {
    return { percentual: Number(colab.comissao_valor), fixoCentavos: padrao.fixoCentavos };
  }
  if (colab.comissao_tipo === 'fixo' && colab.comissao_valor != null) {
    return { percentual: padrao.percentual, fixoCentavos: Math.round(Number(colab.comissao_valor) * 100) };
  }

  return padrao;
}

/** Percentual customizado explicitamente para o colaborador (null se ele usa o padrão/plano). */
function pctColaboradorCustom(colab: ColaboradorComissaoLike): number | null {
  const pct = colab.comissao_percentual != null ? Number(colab.comissao_percentual) : NaN;
  if (Number.isFinite(pct)) return pct;
  if (colab.comissao_tipo === 'percentual' && colab.comissao_valor != null) {
    return Number(colab.comissao_valor);
  }
  return null;
}

/** Valor fixo (centavos) customizado explicitamente para o colaborador (null se ele usa o padrão/plano). */
function fixoColaboradorCustomCentavos(colab: ColaboradorComissaoLike): number | null {
  const fixo = colab.comissao_fixo_centavos != null ? Number(colab.comissao_fixo_centavos) : NaN;
  if (Number.isFinite(fixo)) return Math.round(fixo);
  if (colab.comissao_tipo === 'fixo' && colab.comissao_valor != null) {
    return Math.round(Number(colab.comissao_valor) * 100);
  }
  return null;
}

export function resolverRegraVendedorProposta(
  colab: ColaboradorComissaoLike,
  padraoEmpresa: RegraComissao,
  plano?: PlanoComissaoLike | null,
  overridePlano?: VendedorPlanoOverrideLike | null,
): RegraComissao {
  const pctColabCustom = pctColaboradorCustom(colab);
  const fixoColabCustom = fixoColaboradorCustomCentavos(colab);

  const pctPlano = plano?.comissao_venda_inicial != null ? Number(plano.comissao_venda_inicial) : NaN;
  const fixoPlano = plano?.comissao_venda_fixa_centavos != null ? Number(plano.comissao_venda_fixa_centavos) : NaN;

  const pctOverride = overridePlano?.percentual != null ? Number(overridePlano.percentual) : NaN;
  const fixoOverride = overridePlano?.valor_fixo_centavos != null ? Number(overridePlano.valor_fixo_centavos) : NaN;

  // Precedência: override (colaborador+plano) > customização do colaborador > regra do plano > padrão da empresa.
  const percentual = Number.isFinite(pctOverride)
    ? pctOverride
    : pctColabCustom != null
      ? pctColabCustom
      : Number.isFinite(pctPlano) && pctPlano > 0
        ? pctPlano
        : padraoEmpresa.percentual;

  const fixoCentavos = Number.isFinite(fixoOverride)
    ? Math.round(fixoOverride)
    : fixoColabCustom != null
      ? fixoColabCustom
      : Number.isFinite(fixoPlano) && fixoPlano > 0
        ? Math.round(fixoPlano)
        : padraoEmpresa.fixoCentavos;

  return { percentual, fixoCentavos };
}

export function resolverRegraOperacionalOS(
  colab: ColaboradorComissaoLike,
  padraoEmpresa: RegraComissao,
  cargo: CargoComissaoOperacional,
  plano?: PlanoComissaoOperacionalLike | null,
  overridePlano?: VendedorPlanoOverrideLike | null,
): RegraComissao {
  const pctColabCustom = pctColaboradorCustom(colab);
  const fixoColabCustom = fixoColaboradorCustomCentavos(colab);

  const pctPlanoRaw =
    cargo === 'agente_funerario' ? plano?.comissao_agente_percentual : plano?.comissao_atendente_percentual;
  const fixoPlanoRaw =
    cargo === 'agente_funerario' ? plano?.comissao_agente_fixo_centavos : plano?.comissao_atendente_fixo_centavos;

  const pctPlano = pctPlanoRaw != null ? Number(pctPlanoRaw) : NaN;
  const fixoPlano = fixoPlanoRaw != null ? Number(fixoPlanoRaw) : NaN;

  const pctOverride = overridePlano?.percentual != null ? Number(overridePlano.percentual) : NaN;
  const fixoOverride = overridePlano?.valor_fixo_centavos != null ? Number(overridePlano.valor_fixo_centavos) : NaN;

  // Precedência: override (colaborador+plano) > customização do colaborador > regra do plano > padrão da empresa.
  const percentual = Number.isFinite(pctOverride)
    ? pctOverride
    : pctColabCustom != null
      ? pctColabCustom
      : Number.isFinite(pctPlano) && pctPlano > 0
        ? pctPlano
        : padraoEmpresa.percentual;

  const fixoCentavos = Number.isFinite(fixoOverride)
    ? Math.round(fixoOverride)
    : fixoColabCustom != null
      ? fixoColabCustom
      : Number.isFinite(fixoPlano) && fixoPlano > 0
        ? Math.round(fixoPlano)
        : padraoEmpresa.fixoCentavos;

  return { percentual, fixoCentavos };
}

export function calcularComissaoCumulativa(baseCentavos: number, regra: RegraComissao): number {
  const base = Math.max(0, Math.round(baseCentavos));
  const partePercentual = Math.round(base * (Math.max(0, regra.percentual) / 100));
  const parteFixa = Math.max(0, Math.round(regra.fixoCentavos));
  return partePercentual + parteFixa;
}

export interface ValidacaoComissaoInput {
  ok: boolean;
  mensagem?: string;
  percentual: number;
  fixoCentavos: number;
}

/**
 * Valida os campos digitados na edição de comissão de um colaborador (ou override por plano).
 * Cada pessoa pode ter um valor diferente — esta função só garante que o valor digitado é um
 * número válido dentro da faixa aceitável (percentual 0-100, fixo >= 0), sem coagir silenciosamente
 * entradas inválidas para 0. `contexto` é usado para identificar o campo na mensagem de erro.
 */
export function validarEntradaComissao(
  percentualStr: string,
  fixoStr: string,
  contexto = 'comissão',
): ValidacaoComissaoInput {
  const pctTrim = (percentualStr ?? '').trim();
  const fixoTrim = (fixoStr ?? '').trim();

  const pct = pctTrim ? Number(pctTrim) : 0;
  if (pctTrim && !Number.isFinite(pct)) {
    return { ok: false, mensagem: `Percentual de ${contexto} inválido.`, percentual: 0, fixoCentavos: 0 };
  }
  if (pct < 0 || pct > 100) {
    return {
      ok: false,
      mensagem: `Percentual de ${contexto} deve estar entre 0% e 100%.`,
      percentual: 0,
      fixoCentavos: 0,
    };
  }

  const fixoReais = fixoTrim ? Number(fixoTrim) : 0;
  if (fixoTrim && !Number.isFinite(fixoReais)) {
    return { ok: false, mensagem: `Valor fixo de ${contexto} inválido.`, percentual: 0, fixoCentavos: 0 };
  }
  if (fixoReais < 0) {
    return {
      ok: false,
      mensagem: `Valor fixo de ${contexto} não pode ser negativo.`,
      percentual: 0,
      fixoCentavos: 0,
    };
  }

  return { ok: true, percentual: pct, fixoCentavos: Math.round(fixoReais * 100) };
}

export function formatarRegraComissao(regra: RegraComissao): string {
  const partes: string[] = [];
  if (regra.percentual > 0) partes.push(`${regra.percentual.toFixed(2)}%`);
  if (regra.fixoCentavos > 0) {
    partes.push(`R$ ${(regra.fixoCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} fixo`);
  }
  return partes.length > 0 ? partes.join(' + ') : 'Sem comissão configurada';
}

export interface AtendimentoComissaoStatusLike {
  status: string;
  os_aprovada?: boolean | null;
}

/** OS cancelada não entra em comissão confirmada nem em previsão. */
export function atendimentoComissaoElegivel(atd: AtendimentoComissaoStatusLike): boolean {
  return atd.status !== 'cancelado';
}

/**
 * Comissão confirmada: OS aprovada pela supervisão ou atendimento concluído (baixa no caixa).
 * Alinha com o badge "OS aprovada" na lista de atendimentos.
 */
export function atendimentoComissaoConfirmada(atd: AtendimentoComissaoStatusLike): boolean {
  if (!atendimentoComissaoElegivel(atd)) return false;
  return atd.status === 'concluido' || !!atd.os_aprovada;
}

/** Ainda sem aprovação da OS e sem conclusão do atendimento. */
export function atendimentoComissaoPendente(atd: AtendimentoComissaoStatusLike): boolean {
  return atendimentoComissaoElegivel(atd) && !atendimentoComissaoConfirmada(atd);
}

/** Conta/OS recebida no caixa (baixa registrada ou valor quitado com status concluído). */
export function atendimentoContaBaixada(atd: {
  baixa_registrada_em?: string | null;
  status: string;
  valor_pago_centavos?: number;
  valor_total_centavos: number;
}): boolean {
  if (atd.baixa_registrada_em) return true;
  const pago = Number(atd.valor_pago_centavos || 0);
  const total = Number(atd.valor_total_centavos || 0);
  return atd.status === 'concluido' && total > 0 && pago >= total;
}

/** null = comissão ainda não paga; true/false = paga após ou antes da baixa da conta. */
export function comissaoPagaAposBaixaConta(
  contaBaixadaEm: string | null | undefined,
  comissaoPagaEm: string | null | undefined,
): boolean | null {
  if (!comissaoPagaEm) return null;
  if (!contaBaixadaEm) return false;
  return new Date(comissaoPagaEm).getTime() > new Date(contaBaixadaEm).getTime();
}

export function labelRelacaoComissaoBaixa(params: {
  conta_baixada: boolean;
  comissao_paga: boolean;
  comissao_paga_apos_baixa: boolean | null;
}): string {
  if (!params.conta_baixada) return 'Conta pendente';
  if (!params.comissao_paga) return 'Aguard. comissão';
  if (params.comissao_paga_apos_baixa === true) return 'Pago após baixa';
  if (params.comissao_paga_apos_baixa === false) return 'Pago antes da baixa';
  return '—';
}

export function labelStatusComissaoAtendimento(atd: AtendimentoComissaoStatusLike): {
  text: string;
  className: string;
} {
  if (atd.status === 'cancelado') {
    return { text: 'Cancelado', className: 'bg-gray-50 text-gray-600 border-gray-200' };
  }
  if (atd.status === 'concluido') {
    return { text: 'Concluído', className: 'bg-green-50 text-green-700 border-green-150' };
  }
  if (atd.os_aprovada) {
    return { text: 'OS Aprovada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  return { text: 'Aguardando', className: 'bg-amber-50 text-amber-700 border-amber-150' };
}

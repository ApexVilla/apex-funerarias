import { supabase } from './supabase';
import type { AtendimentoComissaoDto, ColaboradorResumoDto, ComissaoConfigPadrao, OperacionalPlanoComissaoDto } from './comissaoAtendenteService';
import type { ComissaoOperacionalServicoDto } from './comissaoOperacionalServico';
import { calcularComissaoAtendimentoOperacional, type DetalheComissaoServico } from './comissaoOperacionalServicoCalculo';
import {
  atendimentoComissaoConfirmada,
  atendimentoContaBaixada,
  comissaoPagaAposBaixaConta,
  labelRelacaoComissaoBaixa,
  labelStatusComissaoAtendimento,
  normalizarRegraConfigPadrao,
  type CargoComissaoOperacional,
} from './comissaoCalculo';

export interface LinhaComissaoOperacional {
  atendimento_id: string;
  codigo: string;
  data_servico: string;
  cliente_nome: string;
  falecido_nome?: string;
  valor_os_centavos: number;
  valor_comissao_centavos: number;
  detalhes_comissao?: DetalheComissaoServico[];
  status_label: string;
  conta_baixada: boolean;
  conta_baixada_em: string | null;
  ja_pago: boolean;
  comissao_paga_em: string | null;
  comissao_paga_apos_baixa: boolean | null;
  relacao_baixa_label: string;
}

export interface PagamentoComissaoOsInfo {
  pago_em: string;
  numero_recibo: string;
}

export interface PagamentoComissaoOperacionalDto {
  id: string;
  empresa_id: string;
  colaborador_id: string;
  cargo: string;
  periodo_inicio: string;
  periodo_fim: string;
  numero_recibo: string;
  total_os: number;
  faturamento_centavos: number;
  valor_comissao_centavos: number;
  observacoes?: string | null;
  pago_em: string;
  pago_por_nome?: string | null;
}


export function montarLinhasComissaoColaborador(
  colab: ColaboradorResumoDto,
  atendimentos: AtendimentoComissaoDto[],
  configs: ComissaoConfigPadrao[],
  overrides: OperacionalPlanoComissaoDto[],
  empresaId: string,
  pagamentosPorOs: Map<string, PagamentoComissaoOsInfo>,
  servicosConfig: ComissaoOperacionalServicoDto[] = [],
): LinhaComissaoOperacional[] {
  const cargo: CargoComissaoOperacional =
    colab.role === 'atendente' ? 'atendente' : 'agente_funerario';
  const padraoAt = normalizarRegraConfigPadrao(
    configs.find((c) => c.empresa_id === empresaId && c.cargo === 'atendente') || {
      tipo_comissao: 'percentual',
      valor: 2,
    },
  );
  const padraoAg = normalizarRegraConfigPadrao(
    configs.find((c) => c.empresa_id === empresaId && c.cargo === 'agente_funerario') || {
      tipo_comissao: 'fixo',
      valor: 50,
      valor_fixo_centavos: 5000,
    },
  );
  const padrao = colab.role === 'atendente' ? padraoAt : padraoAg;
  const overrideMap = new Map(overrides.map((o) => [o.plano_id, o]));

  return atendimentos
    .filter((atd) => {
      if (colab.role === 'atendente') {
        return atd.atendente_id === colab.id || (atd.atendente_id === null && atd.usuario_id === colab.id);
      }
      return atd.agente_funerario_id === colab.id;
    })
    .map((atd) => {
      const override = atd.plano_id ? overrideMap.get(atd.plano_id) : undefined;
      const resultado = calcularComissaoAtendimentoOperacional({
        atd,
        colab,
        cargo,
        configs,
        servicosConfig,
        empresaId,
        padraoAt,
        padraoAg,
        override,
      });
      const contaBaixada = atendimentoContaBaixada(atd);
      const contaBaixadaEm = atd.baixa_registrada_em || null;
      const pagamentoOs = pagamentosPorOs.get(atd.id);
      const jaPago = !!pagamentoOs;
      const comissaoPagaEm = pagamentoOs?.pago_em ?? null;
      const comissaoPagaApos = comissaoPagaAposBaixaConta(contaBaixadaEm, comissaoPagaEm);

      return {
        atendimento_id: atd.id,
        codigo: atd.codigo,
        data_servico: atd.data_servico,
        cliente_nome: atd.cliente_nome,
        falecido_nome: atd.falecido_nome,
        valor_os_centavos: atd.valor_total_centavos,
        valor_comissao_centavos: resultado.total_centavos,
        detalhes_comissao: resultado.detalhes.filter((d) => d.detectado && d.valor_centavos > 0),
        status_label: labelStatusComissaoAtendimento(atd).text,
        conta_baixada: contaBaixada,
        conta_baixada_em: contaBaixadaEm,
        ja_pago: jaPago,
        comissao_paga_em: comissaoPagaEm,
        comissao_paga_apos_baixa: comissaoPagaApos,
        relacao_baixa_label: labelRelacaoComissaoBaixa({
          conta_baixada: contaBaixada,
          comissao_paga: jaPago,
          comissao_paga_apos_baixa: comissaoPagaApos,
        }),
      };
    });
}

export async function listarPagamentosComissaoPorAtendimento(
  empresaIds: string[],
): Promise<Map<string, PagamentoComissaoOsInfo>> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, PagamentoComissaoOsInfo>();
  if (ids.length === 0) return map;

  let qPag = supabase.from('comissao_operacional_pagamento').select('id, pago_em, numero_recibo');
  qPag = ids.length === 1 ? qPag.eq('empresa_id', ids[0]) : qPag.in('empresa_id', ids);
  const { data: pagamentos, error: pagErr } = await qPag;
  if (pagErr) {
    console.error('[listarPagamentosComissaoPorAtendimento/pag]', pagErr);
    return map;
  }

  const pagPorId = new Map(
    (pagamentos || []).map((p) => [
      String(p.id),
      { pago_em: String(p.pago_em || ''), numero_recibo: String(p.numero_recibo || '') },
    ]),
  );
  const pagIds = [...pagPorId.keys()];
  if (pagIds.length === 0) return map;

  const { data: itens, error: itensErr } = await supabase
    .from('comissao_operacional_pagamento_item')
    .select('atendimento_id, pagamento_id')
    .in('pagamento_id', pagIds);
  if (itensErr) {
    console.error('[listarPagamentosComissaoPorAtendimento/itens]', itensErr);
    return map;
  }

  (itens || []).forEach((item) => {
    const atendimentoId = String(item.atendimento_id);
    const pag = pagPorId.get(String(item.pagamento_id));
    if (!pag) return;
    const atual = map.get(atendimentoId);
    if (!atual || new Date(pag.pago_em).getTime() > new Date(atual.pago_em).getTime()) {
      map.set(atendimentoId, pag);
    }
  });

  return map;
}

export async function listarAtendimentosIdsJaPagosComissao(empresaIds: string[]): Promise<Set<string>> {
  const map = await listarPagamentosComissaoPorAtendimento(empresaIds);
  return new Set(map.keys());
}

export async function buscarPagamentoComissaoPeriodo(
  empresaId: string,
  colaboradorId: string,
  periodoInicio: string,
  periodoFim: string,
): Promise<PagamentoComissaoOperacionalDto | null> {
  const { data, error } = await supabase
    .from('comissao_operacional_pagamento')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('colaborador_id', colaboradorId)
    .eq('periodo_inicio', periodoInicio.slice(0, 10))
    .eq('periodo_fim', periodoFim.slice(0, 10))
    .order('pago_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[buscarPagamentoComissaoPeriodo]', error);
    return null;
  }
  if (!data) return null;
  return data as PagamentoComissaoOperacionalDto;
}

async function gerarNumeroReciboComissao(empresaId: string): Promise<string> {
  const anoMes = new Date().toISOString().slice(0, 7).replace('-', '');
  const prefixo = `COM-${anoMes}-`;

  const { data } = await supabase
    .from('comissao_operacional_pagamento')
    .select('numero_recibo')
    .eq('empresa_id', empresaId)
    .like('numero_recibo', `${prefixo}%`);

  let seq = 0;
  (data || []).forEach((row) => {
    const m = String(row.numero_recibo || '').match(/-(\d+)$/);
    if (m) seq = Math.max(seq, Number(m[1]));
  });
  return `${prefixo}${String(seq + 1).padStart(4, '0')}`;
}

export async function registrarPagamentoComissaoOperacional(params: {
  empresaId: string;
  colaboradorId: string;
  colaboradorNome: string;
  cargo: CargoComissaoOperacional;
  periodoInicio: string;
  periodoFim: string;
  linhas: LinhaComissaoOperacional[];
  pagoPorId: string;
  pagoPorNome: string;
  observacoes?: string;
}): Promise<{ ok: true; pagamento: PagamentoComissaoOperacionalDto } | { ok: false; error: string }> {
  const linhasPagaveis = params.linhas.filter((l) => !l.ja_pago && l.valor_comissao_centavos > 0);
  if (linhasPagaveis.length === 0) {
    return { ok: false, error: 'Não há comissão pendente de pagamento neste período.' };
  }

  const existente = await buscarPagamentoComissaoPeriodo(
    params.empresaId,
    params.colaboradorId,
    params.periodoInicio,
    params.periodoFim,
  );
  if (existente) {
    return {
      ok: false,
      error: `Já existe pagamento de comissão neste período (recibo ${existente.numero_recibo}). Não é permitido pagar duas vezes.`,
    };
  }

  const idsOs = linhasPagaveis.map((l) => l.atendimento_id);
  const { data: itensJaPagos, error: dupErr } = await supabase
    .from('comissao_operacional_pagamento_item')
    .select('atendimento_id, codigo_os')
    .in('atendimento_id', idsOs);
  if (dupErr) {
    console.error('[registrarPagamentoComissaoOperacional/dup]', dupErr);
    return { ok: false, error: 'Não foi possível validar comissões já pagas.' };
  }
  if ((itensJaPagos || []).length > 0) {
    const codigos = [...new Set((itensJaPagos || []).map((i) => String(i.codigo_os || '')).filter(Boolean))];
    return {
      ok: false,
      error: `Comissão já paga para a(s) OS: ${codigos.join(', ')}. Cada OS só pode ser paga uma vez.`,
    };
  }

  const faturamento = linhasPagaveis.reduce((s, l) => s + l.valor_os_centavos, 0);
  const comissao = linhasPagaveis.reduce((s, l) => s + l.valor_comissao_centavos, 0);
  const numeroRecibo = await gerarNumeroReciboComissao(params.empresaId);
  const agora = new Date().toISOString();

  const { data: pagamento, error: pagErr } = await supabase
    .from('comissao_operacional_pagamento')
    .insert({
      empresa_id: params.empresaId,
      colaborador_id: params.colaboradorId,
      cargo: params.cargo,
      periodo_inicio: params.periodoInicio.slice(0, 10),
      periodo_fim: params.periodoFim.slice(0, 10),
      numero_recibo: numeroRecibo,
      total_os: linhasPagaveis.length,
      faturamento_centavos: faturamento,
      valor_comissao_centavos: comissao,
      observacoes: params.observacoes?.trim() || null,
      pago_em: agora,
      pago_por: params.pagoPorId,
      pago_por_nome: params.pagoPorNome,
    })
    .select('*')
    .single();

  if (pagErr || !pagamento) {
    console.error('[registrarPagamentoComissaoOperacional]', pagErr);
    const msg = pagErr?.code === '23505'
      ? 'Comissão já registrada para esta OS ou período. Não é permitido pagar duas vezes.'
      : pagErr?.message || 'Erro ao registrar pagamento.';
    return { ok: false, error: msg };
  }

  const itensPayload = linhasPagaveis.map((l) => ({
    pagamento_id: pagamento.id,
    atendimento_id: l.atendimento_id,
    codigo_os: l.codigo,
    data_servico: l.data_servico?.slice(0, 10) || null,
    cliente_nome: l.cliente_nome,
    valor_os_centavos: l.valor_os_centavos,
    valor_comissao_centavos: l.valor_comissao_centavos,
  }));

  const { error: itensErr } = await supabase.from('comissao_operacional_pagamento_item').insert(itensPayload);
  if (itensErr) {
    console.error('[registrarPagamentoComissaoOperacional/itens]', itensErr);
    await supabase.from('comissao_operacional_pagamento').delete().eq('id', pagamento.id);
    return { ok: false, error: itensErr.message || 'Erro ao gravar itens do pagamento.' };
  }

  return { ok: true, pagamento: pagamento as PagamentoComissaoOperacionalDto };
}

export function linhasPagaveisComissao(linhas: LinhaComissaoOperacional[]): LinhaComissaoOperacional[] {
  return linhas.filter((l) => !l.ja_pago && l.valor_comissao_centavos > 0);
}

export function filtrarLinhasConfirmadasPagaveis(
  linhas: LinhaComissaoOperacional[],
  atendimentos: AtendimentoComissaoDto[],
): LinhaComissaoOperacional[] {
  const confirmados = new Set(
    atendimentos.filter((a) => atendimentoComissaoConfirmada(a)).map((a) => a.id),
  );
  return linhasPagaveisComissao(linhas).filter((l) => confirmados.has(l.atendimento_id));
}

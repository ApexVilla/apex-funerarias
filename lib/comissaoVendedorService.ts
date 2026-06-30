import { supabase } from './supabase';
import {
  derivarConfirmacaoProposta,
  propostaContratoRealizado,
  type PropostaVendedorLinha,
} from './comissaoVendedorCalculo';

export type ModoComissaoVendedor = 'faixa' | 'percentual';

export interface ComissaoVendedorFaixaDto {
  id: string;
  empresa_id: string;
  qtd_min: number;
  qtd_max: number | null;
  valor_centavos: number;
  ordem: number;
}

export interface ComissaoVendedorConfigDto {
  empresa_id: string;
  modo: ModoComissaoVendedor;
}

export interface PagamentoComissaoVendedorDto {
  id: string;
  empresa_id: string;
  vendedor_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  numero_recibo: string;
  total_contratos: number;
  total_confirmados: number;
  valor_comissao_centavos: number;
  faixa_aplicada_label?: string | null;
  valor_por_contrato_centavos?: number | null;
  pago_em: string;
  pago_por_nome?: string | null;
}

export interface PagamentoComissaoPropostaInfo {
  pago_em: string;
  numero_recibo: string;
}

function ultimoDiaMes(mesAno: string): string {
  const [ano, mes] = mesAno.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${mesAno}-${String(ultimo).padStart(2, '0')}`;
}

export async function buscarConfigComissaoVendedor(empresaId: string): Promise<ComissaoVendedorConfigDto> {
  const { data } = await supabase
    .from('comissao_vendedor_config')
    .select('empresa_id, modo')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  return {
    empresa_id: empresaId,
    modo: (data?.modo as ModoComissaoVendedor) || 'faixa',
  };
}

export async function salvarModoComissaoVendedor(
  empresaId: string,
  modo: ModoComissaoVendedor,
): Promise<boolean> {
  const { error } = await supabase.from('comissao_vendedor_config').upsert(
    { empresa_id: empresaId, modo, updated_at: new Date().toISOString() },
    { onConflict: 'empresa_id' },
  );
  if (error) {
    console.error('[salvarModoComissaoVendedor]', error);
    return false;
  }
  return true;
}

export async function listarFaixasComissaoVendedor(empresaId: string): Promise<ComissaoVendedorFaixaDto[]> {
  const { data, error } = await supabase
    .from('comissao_vendedor_faixa')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('ordem', { ascending: true });

  if (error) {
    console.error('[listarFaixasComissaoVendedor]', error);
    return [];
  }

  return (data || []).map((r) => ({
    id: String(r.id),
    empresa_id: String(r.empresa_id),
    qtd_min: Number(r.qtd_min),
    qtd_max: r.qtd_max != null ? Number(r.qtd_max) : null,
    valor_centavos: Number(r.valor_centavos),
    ordem: Number(r.ordem),
  }));
}

export async function salvarFaixasComissaoVendedor(
  empresaId: string,
  faixas: Omit<ComissaoVendedorFaixaDto, 'id' | 'empresa_id'>[],
): Promise<boolean> {
  const { error: delErr } = await supabase.from('comissao_vendedor_faixa').delete().eq('empresa_id', empresaId);
  if (delErr) {
    console.error('[salvarFaixasComissaoVendedor/delete]', delErr);
    return false;
  }

  if (faixas.length === 0) return true;

  const payload = faixas.map((f, idx) => ({
    empresa_id: empresaId,
    qtd_min: f.qtd_min,
    qtd_max: f.qtd_max,
    valor_centavos: f.valor_centavos,
    ordem: f.ordem ?? idx + 1,
  }));

  const { error } = await supabase.from('comissao_vendedor_faixa').insert(payload);
  if (error) {
    console.error('[salvarFaixasComissaoVendedor/insert]', error);
    return false;
  }
  return true;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type Parcela1ContaRow = {
  id: string;
  assinatura_id: string;
  status: string;
  data_pagamento: string | null;
  parcela_numero: number;
};

type Parcela1Resumo = {
  baixa_em: string | null;
  status: string | null;
  data_pagamento: string | null;
};

function escolherContaParcela1(
  contas: Parcela1ContaRow[],
  baixaPorConta: Map<string, string>,
): Parcela1ContaRow | null {
  const mensalidade1 = contas.filter((c) => c.parcela_numero === 1);
  const candidatas = mensalidade1.length > 0 ? mensalidade1 : contas;
  if (candidatas.length === 0) return null;

  let melhor = candidatas[0];
  let melhorScore = -1;
  for (const c of candidatas) {
    let score = 0;
    if (baixaPorConta.has(c.id)) score += 20;
    const st = String(c.status || '').toLowerCase();
    if (st === 'pago') score += 10;
    if (st === 'pago_parcial') score += 5;
    if (c.parcela_numero === 1) score += 1;
    if (score > melhorScore) {
      melhorScore = score;
      melhor = c;
    }
  }
  return melhor;
}

async function mapaAssinaturaPorCliente(clienteIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(clienteIds.filter(Boolean))];
  if (ids.length === 0) return map;

  for (const chunk of chunkArray(ids, 80)) {
    const { data } = await supabase
      .from('assinaturas')
      .select('id, cliente_id, created_at')
      .in('cliente_id', chunk)
      .order('created_at', { ascending: false });
    (data || []).forEach((a) => {
      const cid = String(a.cliente_id);
      if (!map.has(cid)) map.set(cid, String(a.id));
    });
  }
  return map;
}

async function mapaParcela1PorAssinatura(
  assinaturaIds: string[],
): Promise<Map<string, Parcela1Resumo>> {
  const map = new Map<string, Parcela1Resumo>();
  const ids = [...new Set(assinaturaIds.filter(Boolean))];
  if (ids.length === 0) return map;

  const contasPorAssinatura = new Map<string, Parcela1ContaRow[]>();

  for (const chunk of chunkArray(ids, 80)) {
    const { data: contas, error } = await supabase
      .from('fin_contas_receber')
      .select('id, assinatura_id, status, data_pagamento, parcela_numero')
      .in('assinatura_id', chunk)
      .eq('tipo_documento', 'mensalidade')
      .is('deleted_at', null)
      .lte('parcela_numero', 1)
      .order('parcela_numero', { ascending: true });

    if (error) {
      console.error('[mapaParcela1PorAssinatura/contas]', error);
      continue;
    }

    (contas || []).forEach((c) => {
      const aid = String(c.assinatura_id);
      const row: Parcela1ContaRow = {
        id: String(c.id),
        assinatura_id: aid,
        status: String(c.status || ''),
        data_pagamento: c.data_pagamento ? String(c.data_pagamento) : null,
        parcela_numero: Number(c.parcela_numero || 0),
      };
      const lista = contasPorAssinatura.get(aid) || [];
      lista.push(row);
      contasPorAssinatura.set(aid, lista);
    });
  }

  const todasContas = [...contasPorAssinatura.values()].flat();
  const contaIds = todasContas.map((c) => c.id);
  const baixaPorConta = new Map<string, string>();

  for (const chunk of chunkArray(contaIds, 80)) {
    if (chunk.length === 0) continue;
    const { data: baixas, error: errBaixa } = await supabase
      .from('fin_contas_receber_baixas')
      .select('conta_receber_id, data_baixa, data_pagamento, created_at')
      .in('conta_receber_id', chunk)
      .or('estornada.is.null,estornada.eq.false')
      .order('created_at', { ascending: false });

    if (errBaixa) {
      console.error('[mapaParcela1PorAssinatura/baixas]', errBaixa);
      continue;
    }

    (baixas || []).forEach((b) => {
      const cid = String(b.conta_receber_id);
      if (baixaPorConta.has(cid)) return;
      const dataRef =
        (b.data_baixa ? String(b.data_baixa) : null) ||
        (b.data_pagamento ? String(b.data_pagamento) : null) ||
        String(b.created_at || '');
      if (dataRef) baixaPorConta.set(cid, dataRef.slice(0, 10));
    });
  }

  ids.forEach((aid) => {
    const escolhida = escolherContaParcela1(contasPorAssinatura.get(aid) || [], baixaPorConta);
    if (!escolhida) {
      map.set(aid, { baixa_em: null, status: null, data_pagamento: null });
      return;
    }
    map.set(aid, {
      baixa_em: baixaPorConta.get(escolhida.id) || null,
      status: escolhida.status,
      data_pagamento: escolhida.data_pagamento?.slice(0, 10) || null,
    });
  });

  return map;
}

export type PropostaConfirmacaoFinanceiroDto = {
  confirmada: boolean;
  data_confirmacao: string | null;
};

/** Confirmação para comissão = baixa da 1ª mensalidade no financeiro (não usa flags da proposta). */
export async function mapaConfirmacaoFinanceiroPropostas(
  propostas: Array<{
    id: string;
    status: string;
    assinatura_id?: string | null;
    cliente_id?: string | null;
  }>,
): Promise<Map<string, PropostaConfirmacaoFinanceiroDto>> {
  const map = new Map<string, PropostaConfirmacaoFinanceiroDto>();
  const comContrato = propostas.filter((p) => propostaContratoRealizado(String(p.status || '')));
  if (comContrato.length === 0) return map;

  const assinaturaPorCliente = await mapaAssinaturaPorCliente(
    comContrato.map((p) => (p.cliente_id ? String(p.cliente_id) : '')).filter(Boolean),
  );

  const assinaturaIds = comContrato
    .map((p) => {
      if (p.assinatura_id) return String(p.assinatura_id);
      const cid = p.cliente_id ? String(p.cliente_id) : '';
      return cid ? assinaturaPorCliente.get(cid) || '' : '';
    })
    .filter(Boolean);

  const parcelaMap = await mapaParcela1PorAssinatura(assinaturaIds);

  for (const p of comContrato) {
    const assinaturaId = p.assinatura_id
      ? String(p.assinatura_id)
      : p.cliente_id
        ? assinaturaPorCliente.get(String(p.cliente_id)) || ''
        : '';
    const parcela1 = assinaturaId ? parcelaMap.get(assinaturaId) : undefined;
    const conf = derivarConfirmacaoProposta({
      status: String(p.status || ''),
      parcela1_baixa_em: parcela1?.baixa_em,
      parcela1_status_financeiro: parcela1?.status,
      parcela1_data_pagamento_financeiro: parcela1?.data_pagamento,
    });
    map.set(String(p.id), {
      confirmada: conf.confirmada,
      data_confirmacao: conf.data_confirmacao,
    });
  }

  return map;
}

async function mapaPagamentosPorProposta(propostaIds: string[]): Promise<Map<string, PagamentoComissaoPropostaInfo>> {
  const map = new Map<string, PagamentoComissaoPropostaInfo>();
  const ids = [...new Set(propostaIds.filter(Boolean))];
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from('comissao_vendedor_pagamento_item')
    .select('proposta_id, pagamento:pagamento_id ( pago_em, numero_recibo )')
    .in('proposta_id', ids);

  if (error) {
    console.error('[mapaPagamentosPorProposta]', error);
    return map;
  }

  (data || []).forEach((row: Record<string, unknown>) => {
    const pag = row.pagamento as Record<string, unknown> | null;
    if (!pag) return;
    map.set(String(row.proposta_id), {
      pago_em: String(pag.pago_em || ''),
      numero_recibo: String(pag.numero_recibo || ''),
    });
  });

  return map;
}

export async function listarPropostasVendedorComissao(
  empresaIds: string[],
  dataInicio: string,
  dataFim: string,
  vendedorId?: string,
): Promise<PropostaVendedorLinha[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  // Propostas criadas no período (realizadas) + confirmadas no período (pode ter sido criada antes)
  let qCriadas = supabase
    .from('propostas_venda')
    .select(`
      id, sequencial, status, vendedor_id, contribuinte_nome, created_at, updated_at,
      assinatura_id, cliente_id,
      planos:plano_id ( nome, valor_mensal_centavos )
    `)
    .gte('created_at', `${dataInicio}T00:00:00`)
    .lte('created_at', `${dataFim}T23:59:59`);

  qCriadas = ids.length === 1 ? qCriadas.eq('empresa_id', ids[0]) : qCriadas.in('empresa_id', ids);
  if (vendedorId) qCriadas = qCriadas.eq('vendedor_id', vendedorId);

  const { data: criadas, error: errC } = await qCriadas;
  if (errC) {
    console.error('[listarPropostasVendedorComissao/criadas]', errC);
    return [];
  }

  // Propostas com contrato gerado (ampliar busca para confirmações tardias)
  let qContratos = supabase
    .from('propostas_venda')
    .select(`
      id, sequencial, status, vendedor_id, contribuinte_nome, created_at, updated_at,
      assinatura_id, cliente_id,
      planos:plano_id ( nome, valor_mensal_centavos )
    `)
    .eq('status', 'contrato_gerado');

  qContratos = ids.length === 1 ? qContratos.eq('empresa_id', ids[0]) : qContratos.in('empresa_id', ids);
  if (vendedorId) qContratos = qContratos.eq('vendedor_id', vendedorId);

  const { data: contratos, error: errCt } = await qContratos;
  if (errCt) console.error('[listarPropostasVendedorComissao/contratos]', errCt);

  const porId = new Map<string, Record<string, unknown>>();
  [...(criadas || []), ...(contratos || [])].forEach((p) => porId.set(String(p.id), p as Record<string, unknown>));
  const brutos = [...porId.values()];

  const assinaturaPorCliente = await mapaAssinaturaPorCliente(
    brutos.map((p) => (p.cliente_id ? String(p.cliente_id) : '')).filter(Boolean),
  );

  const assinaturaIds = brutos
    .map((p) => {
      if (p.assinatura_id) return String(p.assinatura_id);
      const cid = p.cliente_id ? String(p.cliente_id) : '';
      return cid ? assinaturaPorCliente.get(cid) || '' : '';
    })
    .filter(Boolean);
  const parcelaMap = await mapaParcela1PorAssinatura(assinaturaIds);
  const propostaIds = brutos.map((p) => String(p.id));
  const pagMap = await mapaPagamentosPorProposta(propostaIds);

  const linhas: PropostaVendedorLinha[] = brutos.map((p) => {
    const plano = p.planos as Record<string, unknown> | null;
    const assinaturaId = p.assinatura_id
      ? String(p.assinatura_id)
      : p.cliente_id
        ? assinaturaPorCliente.get(String(p.cliente_id)) || ''
        : '';
    const parcela1 = assinaturaId ? parcelaMap.get(assinaturaId) : undefined;
    const conf = derivarConfirmacaoProposta({
      status: String(p.status || ''),
      parcela1_baixa_em: parcela1?.baixa_em,
      parcela1_status_financeiro: parcela1?.status,
      parcela1_data_pagamento_financeiro: parcela1?.data_pagamento,
    });

    const dataConfirmacao = conf.data_confirmacao;

    const pag = pagMap.get(String(p.id));

    return {
      id: String(p.id),
      sequencial: Number(p.sequencial || 0),
      status: String(p.status || ''),
      vendedor_id: p.vendedor_id ? String(p.vendedor_id) : null,
      contribuinte_nome: String(p.contribuinte_nome || 'Não informado'),
      plano_nome: plano?.nome ? String(plano.nome) : null,
      valor_mensal_centavos: Number(plano?.valor_mensal_centavos || 0),
      created_at: String(p.created_at || ''),
      contrato_realizado: propostaContratoRealizado(String(p.status || '')),
      confirmada: conf.confirmada,
      data_confirmacao: dataConfirmacao,
      data_contrato: propostaContratoRealizado(String(p.status || ''))
        ? String(p.updated_at || p.created_at || '').slice(0, 10)
        : null,
      ja_pago_comissao: Boolean(pag),
      comissao_paga_em: pag?.pago_em || null,
      numero_recibo: pag?.numero_recibo || null,
    };
  });

  return linhas;
}

export async function listarPropostasVendedorMes(
  empresaIds: string[],
  mesAno: string,
  vendedorId?: string,
): Promise<PropostaVendedorLinha[]> {
  const fim = ultimoDiaMes(mesAno);
  return listarPropostasVendedorComissao(empresaIds, `${mesAno}-01`, fim, vendedorId);
}

export function filtrarPropostasRealizadasPeriodo(
  linhas: PropostaVendedorLinha[],
  dataInicio: string,
  dataFim: string,
): PropostaVendedorLinha[] {
  return linhas.filter((p) => {
    if (!p.contrato_realizado) return false;
    const ref = p.data_contrato || p.created_at.slice(0, 10);
    return ref >= dataInicio.slice(0, 10) && ref <= dataFim.slice(0, 10);
  });
}

export function filtrarPropostasConfirmadasPeriodo(
  linhas: PropostaVendedorLinha[],
  dataInicio: string,
  dataFim: string,
): PropostaVendedorLinha[] {
  return linhas.filter((p) => {
    if (!p.confirmada || !p.data_confirmacao) return false;
    return (
      p.data_confirmacao >= dataInicio.slice(0, 10) && p.data_confirmacao <= dataFim.slice(0, 10)
    );
  });
}

async function gerarNumeroReciboVendedor(empresaId: string): Promise<string> {
  const agora = new Date();
  const prefix = `VEN-${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const { data } = await supabase
    .from('comissao_vendedor_pagamento')
    .select('numero_recibo')
    .eq('empresa_id', empresaId)
    .like('numero_recibo', `${prefix}-%`)
    .order('numero_recibo', { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const ultimo = String(data[0].numero_recibo || '');
    const part = ultimo.split('-').pop();
    const n = parseInt(part || '0', 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export async function buscarPagamentoComissaoVendedorPeriodo(
  empresaId: string,
  vendedorId: string,
  periodoInicio: string,
  periodoFim: string,
): Promise<PagamentoComissaoVendedorDto | null> {
  const { data, error } = await supabase
    .from('comissao_vendedor_pagamento')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('vendedor_id', vendedorId)
    .eq('periodo_inicio', periodoInicio.slice(0, 10))
    .eq('periodo_fim', periodoFim.slice(0, 10))
    .maybeSingle();

  if (error) {
    console.error('[buscarPagamentoComissaoVendedorPeriodo]', error);
    return null;
  }
  return data as PagamentoComissaoVendedorDto | null;
}

export async function registrarPagamentoComissaoVendedor(params: {
  empresaId: string;
  vendedorId: string;
  vendedorNome: string;
  periodoInicio: string;
  periodoFim: string;
  linhas: Array<PropostaVendedorLinha & { valor_comissao_centavos: number }>;
  totalContratosRealizados: number;
  faixaLabel: string;
  valorPorContratoCentavos: number;
  pagoPorId: string;
  pagoPorNome: string;
}): Promise<{ ok: true; pagamento: PagamentoComissaoVendedorDto } | { ok: false; error: string }> {
  const pagaveis = params.linhas.filter(
    (l) =>
      l.confirmada &&
      l.data_confirmacao &&
      l.valor_comissao_centavos > 0 &&
      !l.ja_pago_comissao,
  );
  if (pagaveis.length === 0) {
    return {
      ok: false,
      error: 'Não há comissão com baixa financeira da 1ª parcela pendente de pagamento neste período.',
    };
  }

  const existente = await buscarPagamentoComissaoVendedorPeriodo(
    params.empresaId,
    params.vendedorId,
    params.periodoInicio,
    params.periodoFim,
  );
  if (existente) {
    return {
      ok: false,
      error: `Já existe pagamento neste período (recibo ${existente.numero_recibo}).`,
    };
  }

  const ids = pagaveis.map((l) => l.id);
  const { data: itensJaPagos } = await supabase
    .from('comissao_vendedor_pagamento_item')
    .select('proposta_id, sequencial')
    .in('proposta_id', ids);

  if ((itensJaPagos || []).length > 0) {
    const seqs = (itensJaPagos || []).map((i) => String(i.sequencial)).join(', ');
    return { ok: false, error: `Comissão já paga para proposta(s): ${seqs}.` };
  }

  const totalComissao = pagaveis.reduce((s, l) => s + l.valor_comissao_centavos, 0);
  const numeroRecibo = await gerarNumeroReciboVendedor(params.empresaId);
  const agora = new Date().toISOString();

  const { data: pagamento, error: pagErr } = await supabase
    .from('comissao_vendedor_pagamento')
    .insert({
      empresa_id: params.empresaId,
      vendedor_id: params.vendedorId,
      periodo_inicio: params.periodoInicio.slice(0, 10),
      periodo_fim: params.periodoFim.slice(0, 10),
      numero_recibo: numeroRecibo,
      total_contratos: params.totalContratosRealizados,
      total_confirmados: pagaveis.length,
      valor_comissao_centavos: totalComissao,
      faixa_aplicada_label: params.faixaLabel,
      valor_por_contrato_centavos: params.valorPorContratoCentavos,
      pago_em: agora,
      pago_por: params.pagoPorId,
      pago_por_nome: params.pagoPorNome,
    })
    .select('*')
    .single();

  if (pagErr || !pagamento) {
    const msg =
      pagErr?.code === '23505'
        ? 'Comissão já registrada para este período ou proposta.'
        : pagErr?.message || 'Erro ao registrar pagamento.';
    return { ok: false, error: msg };
  }

  const itensPayload = pagaveis.map((l) => ({
    pagamento_id: pagamento.id,
    proposta_id: l.id,
    sequencial: l.sequencial,
    contribuinte_nome: l.contribuinte_nome,
    plano_nome: l.plano_nome,
    data_confirmacao: l.data_confirmacao,
    valor_comissao_centavos: l.valor_comissao_centavos,
  }));

  const { error: itensErr } = await supabase.from('comissao_vendedor_pagamento_item').insert(itensPayload);
  if (itensErr) {
    await supabase.from('comissao_vendedor_pagamento').delete().eq('id', pagamento.id);
    return { ok: false, error: itensErr.message || 'Erro ao gravar itens do pagamento.' };
  }

  return { ok: true, pagamento: pagamento as PagamentoComissaoVendedorDto };
}

import { dataHojeIsoLocal } from './contratoDatas';
import { supabase } from './supabase';
import { mesReferenciaCurto, resolverValorMensalPlanoCentavos } from './cobrancaParcelaUi';
import {
  ocultarPendenciasPlaceholderDuplicadas,
  resolverContaReceberIdBaixaCampo,
} from './cobrancaBaixaCampo';

export type StatusCobrancaPendente =
  | 'pendente'
  | 'em_andamento'
  | 'cobrado'
  | 'promessa'
  | 'nao_localizado'
  | 'recusou';

export type PrioridadeCobrancaPendente = 'alta' | 'media' | 'baixa';

export type CobrancaPendenteDto = {
  id: string;
  empresa_id: string;
  conta_receber_id?: string;
  cliente_id?: string;
  cliente_nome: string;
  cliente_cpf: string;
  cliente_telefone: string;
  cliente_endereco: string;
  cliente_bairro: string;
  cobrador_nome: string;
  cobrador_id: string;
  plano_nome: string;
  parcela_codigo: string;
  /** Número do contrato (ex. CTR-000055). */
  contrato_codigo: string;
  parcela_numero: number;
  total_parcelas?: number;
  mes_referencia: string;
  /** Valor fixo da mensalidade do plano (para cálculo em campo). */
  valor_plano_centavos: number;
  valor_centavos: number;
  data_vencimento: string;
  dias_atraso: number;
  status: StatusCobrancaPendente;
  prioridade: PrioridadeCobrancaPendente;
  ultima_visita?: string;
  observacao?: string;
  tentativas: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TituloFinanceiroResumo = {
  status?: string;
  valor_aberto_centavos?: number;
  deleted_at?: string | null;
};

/** Título excluído, quitado ou inexistente — não deve aparecer na carteira do cobrador. */
function tituloNaoCobravel(
  fr: TituloFinanceiroResumo | null | undefined,
  contaReceberId?: string | null,
): boolean {
  if (contaReceberId) {
    if (!fr) return true;
    if (fr.deleted_at) return true;
  }
  if (!fr) return false;
  const st = String(fr.status || '').toLowerCase();
  if (st === 'pago' || st === 'cancelado') return true;
  const aberto = Number(fr.valor_aberto_centavos || 0) > 0;
  return !aberto && st !== 'pago_parcial';
}

/** Remove da carteira pendências vinculadas a um título excluído no financeiro. */
export async function cancelarPendenciasCobrancaPorTitulo(
  empresaId: string,
  contaReceberId: string,
): Promise<void> {
  const emp = empresaId.trim();
  const crId = contaReceberId.trim();
  if (!emp || !crId) return;
  await supabase
    .from('cob_cobrancas_pendentes')
    .update({ status: 'cobrado', updated_at: new Date().toISOString() })
    .eq('empresa_id', emp)
    .eq('conta_receber_id', crId)
    .neq('status', 'cobrado');
}

function trimOrEmpty(v: unknown): string {
  return String(v ?? '').trim();
}

function enderecoCliente(cli: Record<string, unknown> | null): string {
  if (!cli) return '-';
  const cob = trimOrEmpty(cli.endereco_cob_logradouro);
  const pad = trimOrEmpty(cli.endereco_logradouro);
  return cob || pad || '-';
}

function bairroCliente(cli: Record<string, unknown> | null): string {
  if (!cli) return 'Sem bairro';
  const cob = trimOrEmpty(cli.endereco_cob_bairro);
  const pad = trimOrEmpty(cli.endereco_bairro);
  return cob || pad || 'Sem bairro';
}

function mapRow(item: Record<string, unknown>): CobrancaPendenteDto {
  const cli = item.clientes as Record<string, unknown> | null;
  const fr = item.fin_contas_receber as Record<string, unknown> | null;
  const ass = fr?.assinaturas as Record<string, unknown> | null;
  const plano = ass?.planos as { nome?: string; valor_mensal_centavos?: number } | null;
  const cob = item.cobradores as { nome?: string } | null;
  const cobradorId = trimOrEmpty(item.cobrador_id);
  const dataVenc = String(item.data_vencimento || fr?.data_vencimento || new Date().toISOString().slice(0, 10));
  const valorTitulo = Number(item.valor_centavos || 0);
  const valorPlanoCentavos = resolverValorMensalPlanoCentavos({
    valor_mensal_assinatura: ass?.valor_mensal_centavos as number | undefined,
    valor_mensal_plano: plano?.valor_mensal_centavos,
    valor_titulo_centavos: valorTitulo,
  });
  const planoNome = trimOrEmpty(plano?.nome) || '-';
  const parcelaNumero = Number(fr?.parcela_numero || 0) || 0;
  const totalParcelas = fr?.total_parcelas ? Number(fr.total_parcelas) : undefined;

  return {
    id: String(item.id),
    empresa_id: String(item.empresa_id || ''),
    conta_receber_id: item.conta_receber_id ? String(item.conta_receber_id) : undefined,
    cliente_id: item.cliente_id ? String(item.cliente_id) : undefined,
    cliente_nome: trimOrEmpty(cli?.nome) || '-',
    cliente_cpf: trimOrEmpty(cli?.cpf) || '-',
    cliente_telefone: trimOrEmpty(cli?.telefone_principal) || '-',
    cliente_endereco: enderecoCliente(cli),
    cliente_bairro: bairroCliente(cli),
    cobrador_nome: trimOrEmpty(cob?.nome) || 'Sem cobrador',
    cobrador_id: cobradorId && UUID_RE.test(cobradorId) ? cobradorId : 'sem-cobrador',
    plano_nome: planoNome,
    parcela_codigo: trimOrEmpty(fr?.codigo) || '-',
    contrato_codigo: trimOrEmpty(ass?.codigo) || '-',
    parcela_numero: parcelaNumero,
    total_parcelas: totalParcelas,
    mes_referencia: mesReferenciaCurto(dataVenc),
    valor_plano_centavos: valorPlanoCentavos,
    valor_centavos: valorTitulo,
    data_vencimento: dataVenc.slice(0, 10),
    dias_atraso: Number(item.dias_atraso || 0),
    status: (item.status as StatusCobrancaPendente) || 'pendente',
    prioridade: (item.prioridade as PrioridadeCobrancaPendente) || 'media',
    ultima_visita: item.ultima_visita ? String(item.ultima_visita) : undefined,
    observacao: item.observacao ? String(item.observacao) : undefined,
    tentativas: Number(item.tentativas || 0),
  };
}

/** Preenche contrato_codigo a partir da assinatura do cliente quando o título não está vinculado. */
async function enrichContratoCodigoPendencias(
  items: CobrancaPendenteDto[],
): Promise<CobrancaPendenteDto[]> {
  const clienteIds = [
    ...new Set(
      items
        .filter((p) => p.cliente_id && (!p.contrato_codigo || p.contrato_codigo === '-'))
        .map((p) => p.cliente_id as string),
    ),
  ];
  if (clienteIds.length === 0) return items;

  const { data, error } = await supabase
    .from('assinaturas')
    .select('cliente_id, codigo, created_at')
    .in('cliente_id', clienteIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !data?.length) return items;

  const codigoPorCliente = new Map<string, string>();
  for (const row of data) {
    const cid = String(row.cliente_id || '').trim();
    const cod = String(row.codigo || '').trim();
    if (!cid || !cod || codigoPorCliente.has(cid)) continue;
    codigoPorCliente.set(cid, cod);
  }

  if (codigoPorCliente.size === 0) return items;

  return items.map((p) => {
    if (!p.cliente_id || (p.contrato_codigo && p.contrato_codigo !== '-')) return p;
    const cod = codigoPorCliente.get(p.cliente_id);
    return cod ? { ...p, contrato_codigo: cod } : p;
  });
}

/** Sincroniza pendências com títulos em aberto (best-effort). */
export async function sincronizarPendenciasTitulosAbertos(empresaIds: string[]): Promise<number> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  let inseridas = 0;
  for (const empresaId of ids) {
    try {
      const { data, error } = await supabase.rpc('fn_cob_carteira_upsert_pendencias_de_titulos', {
        p_empresa_id: empresaId,
      });
      if (!error && typeof data === 'number') inseridas += data;
    } catch {
      /* ignorar — RPC pode não existir em projetos antigos */
    }
  }
  return inseridas;
}

/**
 * Atualiza carteira com o financeiro: cria pendências dos títulos em aberto
 * e marca como cobrado o que já foi pago (evita tentar baixar de novo).
 */
/** Marca pendências cujo título já foi pago/cancelado no financeiro (corrige lista fantasma). */
export async function corrigirPendenciasCarteiraDesalinhadas(empresaIds: string[]): Promise<number> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;

  let corrigidas = 0;

  const { data: comTitulo, error: err1 } = await supabase
    .from('cob_cobrancas_pendentes')
    .select(
      `
      id, empresa_id, status, conta_receber_id, cliente_id, data_vencimento,
      fin_contas_receber ( status, valor_aberto_centavos, deleted_at )
    `,
    )
    .in('empresa_id', ids)
    .neq('status', 'cobrado')
    .not('conta_receber_id', 'is', null)
    .limit(3000);

  if (err1) throw err1;

  for (const row of comTitulo || []) {
    const fr = row.fin_contas_receber as TituloFinanceiroResumo | null;
    if (!row.conta_receber_id) continue;
    if (!tituloNaoCobravel(fr, String(row.conta_receber_id))) continue;

    const { error } = await supabase
      .from('cob_cobrancas_pendentes')
      .update({ status: 'cobrado', updated_at: new Date().toISOString() })
      .eq('id', String(row.id))
      .eq('empresa_id', String(row.empresa_id));
    if (!error) corrigidas += 1;
  }

  const { data: semTitulo, error: err2 } = await supabase
    .from('cob_cobrancas_pendentes')
    .select('id, empresa_id, cliente_id, data_vencimento, valor_centavos')
    .in('empresa_id', ids)
    .neq('status', 'cobrado')
    .is('conta_receber_id', null)
    .not('cliente_id', 'is', null)
    .limit(500);

  if (err2) throw err2;

  for (const row of semTitulo || []) {
    const empresaId = String(row.empresa_id || '');
    const clienteId = String(row.cliente_id || '');
    const venc = String(row.data_vencimento || '').slice(0, 10);
    if (!clienteId || !venc) continue;

    const { data: titulos } = await supabase
      .from('fin_contas_receber')
      .select('id, status, valor_aberto_centavos')
      .eq('empresa_id', empresaId)
      .eq('cliente_id', clienteId)
      .eq('data_vencimento', venc)
      .is('deleted_at', null);

    const lista = titulos || [];
    if (lista.length === 0) continue;

    const temAberto = lista.some((t) => {
      const st = String(t.status || '').toLowerCase();
      if (st === 'pago' || st === 'cancelado') return false;
      return Number(t.valor_aberto_centavos || 0) > 0 || st === 'pago_parcial';
    });

    if (!temAberto) {
      const { error } = await supabase
        .from('cob_cobrancas_pendentes')
        .update({ status: 'cobrado', updated_at: new Date().toISOString() })
        .eq('id', String(row.id))
        .eq('empresa_id', empresaId);
      if (!error) corrigidas += 1;
      continue;
    }

    const abertos = lista.filter((t) => {
      const st = String(t.status || '').toLowerCase();
      return st !== 'pago' && st !== 'cancelado' && Number(t.valor_aberto_centavos || 0) > 0;
    });
    if (abertos.length === 1) {
      await supabase
        .from('cob_cobrancas_pendentes')
        .update({
          conta_receber_id: String(abertos[0].id),
          updated_at: new Date().toISOString(),
        })
        .eq('id', String(row.id))
        .eq('empresa_id', empresaId);
    }
  }

  return corrigidas;
}

export async function sincronizarCarteiraComFinanceiro(
  empresaIds: string[],
  opts?: { status?: string; cobrador_id?: string },
): Promise<CobrancaPendenteDto[]> {
  await sincronizarPendenciasTitulosAbertos(empresaIds);
  await corrigirPendenciasCarteiraDesalinhadas(empresaIds);
  return carregarCobrancasPendentes(empresaIds, {
    ...opts,
    sincronizarTitulos: false,
  });
}

export async function carregarCobrancasPendentes(
  empresaIds: string[],
  opts?: { status?: string; sincronizarTitulos?: boolean; cobrador_id?: string },
): Promise<CobrancaPendenteDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  if (opts?.sincronizarTitulos !== false) {
    await sincronizarPendenciasTitulosAbertos(ids);
    await corrigirPendenciasCarteiraDesalinhadas(ids);
  }

  let q = supabase
    .from('cob_cobrancas_pendentes')
    .select(
      `
      id, empresa_id, conta_receber_id, cliente_id, cobrador_id, valor_centavos,
      data_vencimento, dias_atraso, status, prioridade, tentativas, ultima_visita, observacao,
      clientes (
        nome, cpf, telefone_principal,
        endereco_cob_logradouro, endereco_logradouro,
        endereco_cob_bairro, endereco_bairro
      ),
      fin_contas_receber (
        codigo,
        status,
        valor_aberto_centavos,
        deleted_at,
        parcela_numero,
        total_parcelas,
        descricao,
        data_vencimento,
        assinaturas (
          codigo,
          valor_mensal_centavos,
          planos ( nome, valor_mensal_centavos )
        )
      ),
      cobradores ( nome )
    `,
    )
    .order('dias_atraso', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(2000);

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  if (opts?.status) {
    q = q.eq('status', opts.status);
  }

  const cobradorId = trimOrEmpty(opts?.cobrador_id);
  if (cobradorId && UUID_RE.test(cobradorId)) {
    q = q.eq('cobrador_id', cobradorId);
  }

  const { data, error } = await q;
  if (error) throw error;

  const mapped = (data || []).map((row) => mapRow(row as Record<string, unknown>));
  const filtradas = ocultarPendenciasPlaceholderDuplicadas(mapped).filter((p) => {
    if (p.status === 'cobrado') return false;
    const raw = (data || []).find((r) => String(r.id) === p.id) as Record<string, unknown> | undefined;
    const fr = raw?.fin_contas_receber as TituloFinanceiroResumo | null;
    return !tituloNaoCobravel(fr, p.conta_receber_id);
  });

  await marcarPendenciasTituloJaPago(ids, data || []);

  return enrichContratoCodigoPendencias(filtradas);
}

/** Marca como cobrado pendências cujo título financeiro já está quitado. */
export async function marcarPendenciaCobradaPorTituloPago(
  empresaId: string,
  cobrancaPendenteId: string,
  contaReceberId?: string,
): Promise<void> {
  await marcarPendenciaCobrada(empresaId, cobrancaPendenteId, contaReceberId);
}

/** Alinha carteira quando o título já foi baixado no financeiro. */
async function marcarPendenciasTituloJaPago(
  empresaIds: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  const empresaSet = new Set(empresaIds);
  // Agrupa os ids a marcar por empresa e dispara um UPDATE em lote por empresa
  // (evita N+1 de escrita: antes era um UPDATE por linha).
  const idsPorEmpresa = new Map<string, string[]>();
  for (const row of rows) {
    const stPend = String(row.status || '');
    if (stPend === 'cobrado') continue;
    const fr = row.fin_contas_receber as TituloFinanceiroResumo | null;
    if (!row.conta_receber_id) continue;
    if (!tituloNaoCobravel(fr, String(row.conta_receber_id))) continue;
    const empresaId = String(row.empresa_id || '');
    if (!empresaSet.has(empresaId)) continue;
    const lista = idsPorEmpresa.get(empresaId) ?? [];
    lista.push(String(row.id));
    idsPorEmpresa.set(empresaId, lista);
  }

  const agora = new Date().toISOString();
  for (const [empresaId, ids] of idsPorEmpresa) {
    if (ids.length === 0) continue;
    await supabase
      .from('cob_cobrancas_pendentes')
      .update({ status: 'cobrado', updated_at: agora })
      .in('id', ids)
      .eq('empresa_id', empresaId);
  }
}

export async function resolverFormaPagamentoId(
  empresaId: string,
  forma: 'dinheiro' | 'pix' | 'cartao' | 'cartao_credito' | 'cartao_debito',
): Promise<string | undefined> {
  const tipoMap: Record<string, string[]> = {
    dinheiro: ['dinheiro', 'especie'],
    pix: ['pix'],
    cartao_credito: ['cartao_credito', 'credito'],
    cartao_debito: ['cartao_debito', 'debito'],
    cartao: ['cartao_credito', 'cartao_debito', 'cartao', 'credito', 'debito'],
  };
  const tipos = tipoMap[forma] || tipoMap.dinheiro;

  const { data, error } = await supabase
    .from('fin_formas_pagamento')
    .select('id, tipo, codigo')
    .eq('empresa_id', empresaId)
    .eq('ativo', true);

  if (error || !data?.length) return undefined;

  for (const t of tipos) {
    const hit = data.find((f) => String(f.tipo || '').toLowerCase() === t);
    if (hit?.id) return String(hit.id);
  }
  return undefined;
}

export type RegistrarRecebimentoCampoParams = {
  empresa_id: string;
  cobranca_pendente_id: string;
  conta_receber_id?: string;
  data_vencimento?: string;
  cliente_id: string;
  cobrador_id: string;
  valor_centavos: number;
  forma_pagamento:
    | 'dinheiro'
    | 'pix'
    | 'cartao'
    | 'cartao_credito'
    | 'cartao_debito'
    | 'boleto'
    | 'transferencia';
  observacao?: string;
  /** Dia em que o cobrador recebeu (YYYY-MM-DD); deve coincidir com data_pagamento financeira. */
  data_pagamento?: string;
  created_by?: string | null;
  pix_mesmo_pagador?: boolean;
  pix_nome_pagador?: string;
  /** Título já baixado em fin_baixar_conta_receber — não revalidar como "em aberto". */
  titulo_ja_baixado_no_financeiro?: boolean;
};

export async function registrarRecebimentoCampo(
  params: RegistrarRecebimentoCampoParams,
): Promise<void> {
  if (!UUID_RE.test(params.cobrador_id)) {
    throw new Error('Esta parcela não tem cobrador atribuído. Atribua na Carteira antes de baixar.');
  }

  const informado = (params.conta_receber_id || '').trim();
  let contaReceberId: string;

  if (params.titulo_ja_baixado_no_financeiro && informado && UUID_RE.test(informado)) {
    contaReceberId = informado;
  } else {
    const tituloRes = await resolverContaReceberIdBaixaCampo({
      empresa_id: params.empresa_id,
      cliente_id: params.cliente_id,
      conta_receber_id: params.conta_receber_id,
      data_vencimento: params.data_vencimento,
      valor_centavos: params.valor_centavos,
    });
    if (tituloRes.ok === false) {
      if (tituloRes.motivo === 'ja_pago') {
        await marcarPendenciaCobrada(
          params.empresa_id,
          params.cobranca_pendente_id,
          informado || undefined,
        );
        throw new Error(
          `Esta parcela (${tituloRes.parcela_codigo || 'título'}) já está paga no financeiro. Toque em Atualizar / Sincronizar — não baixe de novo.`,
        );
      }
      throw new Error(
        'Não há título financeiro em aberto para esta parcela. Gere as mensalidades do contrato antes de registrar o recebimento.',
      );
    }
    contaReceberId = tituloRes.conta_receber_id;
  }

  const dataRecebimento = (params.data_pagamento || '').slice(0, 10) || dataHojeIsoLocal();
  const { error: insErr } = await supabase.from('cob_recebimentos_campo').insert({
    empresa_id: params.empresa_id,
    cobranca_pendente_id: params.cobranca_pendente_id,
    conta_receber_id: contaReceberId,
    cliente_id: params.cliente_id,
    cobrador_id: params.cobrador_id,
    data: dataRecebimento,
    valor_centavos: params.valor_centavos,
    forma_pagamento: params.forma_pagamento,
    status: 'confirmado',
    observacao: params.observacao?.trim() || null,
    created_by: params.created_by || null,
    pix_mesmo_pagador:
      params.forma_pagamento === 'pix' ? (params.pix_mesmo_pagador ?? true) : null,
    pix_nome_pagador:
      params.forma_pagamento === 'pix' && params.pix_mesmo_pagador === false
        ? params.pix_nome_pagador?.trim() || null
        : null,
  });
  if (insErr) throw insErr;

  await marcarPendenciaCobrada(params.empresa_id, params.cobranca_pendente_id, contaReceberId);
}

async function marcarPendenciaCobrada(
  empresaId: string,
  cobrancaPendenteId: string,
  contaReceberId?: string,
): Promise<void> {
  const { error } = await supabase
    .from('cob_cobrancas_pendentes')
    .update({ status: 'cobrado', updated_at: new Date().toISOString() })
    .eq('id', cobrancaPendenteId)
    .eq('empresa_id', empresaId);

  if (error) throw error;

  if (contaReceberId) {
    await supabase
      .from('cob_cobrancas_pendentes')
      .update({ status: 'cobrado', updated_at: new Date().toISOString() })
      .eq('conta_receber_id', contaReceberId)
      .eq('empresa_id', empresaId)
      .neq('id', cobrancaPendenteId);
  }
}

export type RegistrarVisitaParams = {
  empresa_id: string;
  cobranca_pendente_id: string;
  novo_status: StatusCobrancaPendente;
  observacao: string;
  tentativas_atual: number;
  /** Código do motivo (nao_estava, nao_pagou, …) para exibição estruturada. */
  motivo_codigo?: string;
};

export async function registrarAcaoCobrancaEscritorio(params: {
  empresa_id: string;
  cobranca_pendente_id: string;
  tipo: 'ligacao' | 'whatsapp' | 'email' | 'promessa';
  observacao?: string;
  promessa_data?: string | null;
  promessa_valor_centavos?: number | null;
}): Promise<void> {
  const labels: Record<typeof params.tipo, string> = {
    ligacao: 'Ligação',
    whatsapp: 'WhatsApp',
    email: 'E-mail',
    promessa: 'Promessa',
  };
  let linha = `[${labels[params.tipo]}] ${params.observacao?.trim() || ''}`.trim();
  if (params.tipo === 'promessa') {
    if (params.promessa_data) linha += ` — data: ${params.promessa_data}`;
    if (params.promessa_valor_centavos) {
      linha += ` — valor: R$ ${(params.promessa_valor_centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
  }

  const { data: row, error: loadErr } = await supabase
    .from('cob_cobrancas_pendentes')
    .select('tentativas, observacao')
    .eq('id', params.cobranca_pendente_id)
    .eq('empresa_id', params.empresa_id)
    .maybeSingle();

  if (loadErr) throw loadErr;
  if (!row) throw new Error('Cobrança pendente não encontrada.');

  const obsAnterior = trimOrEmpty(row.observacao);
  const obsNova = obsAnterior ? `${obsAnterior}\n${linha}` : linha;
  const novoStatus: StatusCobrancaPendente =
    params.tipo === 'promessa' ? 'promessa' : 'em_andamento';

  const { error } = await supabase
    .from('cob_cobrancas_pendentes')
    .update({
      status: novoStatus,
      observacao: obsNova,
      tentativas: Number(row.tentativas || 0) + 1,
      ultima_visita: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.cobranca_pendente_id)
    .eq('empresa_id', params.empresa_id);

  if (error) throw error;
}

export async function registrarVisitaCobranca(params: RegistrarVisitaParams): Promise<void> {
  let obsAtual = params.observacao.trim();
  if (params.motivo_codigo?.trim()) {
    const tag = `[Visita:${params.motivo_codigo.trim()}]`;
    if (!obsAtual.includes(tag)) {
      obsAtual = `${tag} ${obsAtual}`.trim();
    }
  }
  const { error } = await supabase
    .from('cob_cobrancas_pendentes')
    .update({
      status: params.novo_status,
      tentativas: params.tentativas_atual + 1,
      ultima_visita: new Date().toISOString(),
      observacao: obsAtual,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.cobranca_pendente_id)
    .eq('empresa_id', params.empresa_id);

  if (error) throw error;
}

/** @deprecated Use `resolverCobradorIdDoUsuario` de `cobradorUsuarioLink.ts`. */
export async function cobradorIdParaUsuario(
  empresaIds: string[],
  email?: string | null,
  nome?: string | null,
  usuarioId?: string | null,
): Promise<string | null> {
  const { resolverCobradorIdDoUsuario } = await import('./cobradorUsuarioLink');
  return resolverCobradorIdDoUsuario({ empresaIds, email, nome, usuarioId });
}

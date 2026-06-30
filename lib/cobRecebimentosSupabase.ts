import { supabase } from './supabase';

export type RecebimentoCampoDto = {
  id: string;
  data: string;
  valor_centavos: number;
  cliente_id: string;
  cliente_codigo?: string;
  cliente_nome: string;
  contrato_codigo?: string;
  parcela_codigo?: string;
  parcela_numero?: number;
  total_parcelas?: number;
  cobrador_id: string;
  cobrador_nome: string;
  forma_pagamento: string;
  status: 'confirmado' | 'pendente_conferencia';
};

export type CobradorComissaoDto = {
  id: string;
  nome: string;
  comissao_percentual: number;
  comissao_por_metodo: Record<string, any>;
  empresa_id?: string;
  filial_id?: string;
  area_atuacao?: string;
};

export type FiltroRecebimentosCampo = {
  cobrador_id?: string;
  cliente_id?: string;
  data_inicio?: string;
  data_fim?: string;
  limite?: number;
};

/** Baixa financeira atribuída a um cobrador para cálculo de comissão. */
export type BaixaComissaoCobradorDto = {
  id: string;
  data: string;
  valor_centavos: number;
  cobrador_id: string;
  cobrador_nome: string;
  forma_pagamento: string;
  cliente_id: string;
  cliente_nome: string;
  parcela_codigo?: string;
  origem_cobrador: 'recebimento_campo' | 'caixa_vinculo' | 'usuario_baixa';
};

export type FiltroBaixasComissaoCobrador = {
  cobrador_id?: string;
  data_inicio: string;
  data_fim: string;
  limite?: number;
};

/** Normaliza forma de pagamento da baixa para chaves usadas em comissao_por_metodo. */
export function normalizarMetodoComissaoCobrador(forma?: { codigo?: string; nome?: string } | string | null): string {
  const bruto = (
    typeof forma === 'string'
      ? forma
      : `${forma?.codigo || ''} ${forma?.nome || ''}`
  )
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (bruto.includes('pix') || bruto.includes('fp-002')) return 'pix';
  if (bruto.includes('boleto') || bruto.includes('fp-003')) return 'boleto';
  if (bruto.includes('transfer') || bruto.includes('fp-006')) return 'transferencia';
  if (bruto.includes('cart') || bruto.includes('fp-004') || bruto.includes('fp-005')) return 'cartao';
  if (bruto.includes('dinheiro') || bruto.includes('fp-001') || bruto.includes('especie')) return 'dinheiro';
  return 'dinheiro';
}

function dataRefBaixa(row: { data_baixa?: string | null; data_pagamento?: string | null }): string {
  return String(row.data_baixa || row.data_pagamento || '').slice(0, 10);
}

/**
 * Lista baixas de parcelas que entraram no caixa vinculado ao cobrador.
 * Não usa carteira de cobrança: se outra pessoa baixou em outro caixa, não entra aqui.
 */
export async function listarBaixasComissaoCobrador(
  empresaIds: string[],
  filtro: FiltroBaixasComissaoCobrador,
): Promise<BaixaComissaoCobradorDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  const dataInicio = (filtro.data_inicio || '').slice(0, 10);
  const dataFim = (filtro.data_fim || '').slice(0, 10);
  if (ids.length === 0 || !dataInicio || !dataFim) return [];

  const cobradorFiltro = (filtro.cobrador_id || '').trim();
  const empresaSet = new Set(ids);

  let vincQ = supabase
    .from('cobrador_contas_bancarias')
    .select(
      'cobrador_id, conta_bancaria_id, cobradores ( id, nome, empresa_id, usuario_id ), fin_contas_bancarias ( tipo )',
    );

  if (cobradorFiltro) {
    vincQ = vincQ.eq('cobrador_id', cobradorFiltro);
  }

  const { data: vinculosRaw, error: vincErr } = await vincQ;
  if (vincErr) throw vincErr;

  type VinculoCaixa = {
    cobrador_id: string;
    cobrador_nome: string;
    cobrador_usuario_id: string;
    conta_bancaria_id: string;
  };

  const vinculoPorConta = new Map<string, VinculoCaixa>();

  for (const row of vinculosRaw || []) {
    const cobRaw = row.cobradores as
      | { id?: string; nome?: string; empresa_id?: string; usuario_id?: string }
      | { id?: string; nome?: string; empresa_id?: string; usuario_id?: string }[]
      | null;
    const cob = Array.isArray(cobRaw) ? cobRaw[0] : cobRaw;
    const empresaCob = String(cob?.empresa_id || '');
    if (!empresaSet.has(empresaCob)) continue;

    const contaRaw = row.fin_contas_bancarias as { tipo?: string } | { tipo?: string }[] | null;
    const conta = Array.isArray(contaRaw) ? contaRaw[0] : contaRaw;
    if (String(conta?.tipo || '').toLowerCase() !== 'caixa') continue;

    const contaBancariaId = String(row.conta_bancaria_id || '');
    const cobradorId = String(row.cobrador_id || '');
    if (!contaBancariaId || !cobradorId) continue;

    vinculoPorConta.set(contaBancariaId, {
      cobrador_id: cobradorId,
      cobrador_nome: String(cob?.nome || '-'),
      cobrador_usuario_id: String(cob?.usuario_id || ''),
      conta_bancaria_id: contaBancariaId,
    });
  }

  const contaCaixaIds = [...vinculoPorConta.keys()];
  if (contaCaixaIds.length === 0) return [];

  let q = supabase
    .from('fin_contas_receber_baixas')
    .select(
      `
      id, empresa_id, conta_receber_id, conta_bancaria_id, valor_pago_centavos, data_baixa, data_pagamento, created_by,
      forma:forma_pagamento_id(codigo, nome),
      fin_contas_receber (
        codigo, cliente_id,
        clientes ( nome )
      )
    `,
    )
    .eq('estornada', false)
    .in('conta_bancaria_id', contaCaixaIds)
    .gte('data_baixa', dataInicio)
    .lte('data_baixa', dataFim)
    .order('data_baixa', { ascending: false })
    .limit(Math.min(Math.max(filtro.limite ?? 3000, 1), 3000));

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data: baixasRaw, error } = await q;
  if (error) throw error;
  const baixas = baixasRaw || [];
  if (baixas.length === 0) return [];

  const tituloIds = [...new Set(baixas.map((b) => String(b.conta_receber_id || '')).filter(Boolean))];

  const { data: rcRows, error: rcErr } = tituloIds.length
    ? await supabase
        .from('cob_recebimentos_campo')
        .select('conta_receber_id, forma_pagamento')
        .in('conta_receber_id', tituloIds)
    : { data: [], error: null };

  if (rcErr) throw rcErr;

  const rcPorConta = new Map<string, string>();
  for (const row of rcRows || []) {
    const contaId = String(row.conta_receber_id || '');
    if (!contaId || rcPorConta.has(contaId)) continue;
    if (row.forma_pagamento) rcPorConta.set(contaId, String(row.forma_pagamento));
  }

  const resultado: BaixaComissaoCobradorDto[] = [];

  for (const row of baixas) {
    const contaBancariaId = String(row.conta_bancaria_id || '');
    const vinculo = vinculoPorConta.get(contaBancariaId);
    if (!vinculo) continue;

    const tituloId = String(row.conta_receber_id || '');
    const createdBy = String(row.created_by || '');
    const rcForma = rcPorConta.get(tituloId);
    let origem: BaixaComissaoCobradorDto['origem_cobrador'] = 'caixa_vinculo';
    if (rcForma) {
      origem = 'recebimento_campo';
    } else if (vinculo.cobrador_usuario_id && createdBy === vinculo.cobrador_usuario_id) {
      origem = 'usuario_baixa';
    }

    const fr = row.fin_contas_receber as {
      codigo?: string;
      cliente_id?: string;
      clientes?: { nome?: string } | { nome?: string }[] | null;
    } | null;
    const cli = fr?.clientes;
    const clienteNome = Array.isArray(cli) ? cli[0]?.nome : cli?.nome;
    const formaRaw = row.forma as { codigo?: string; nome?: string } | { codigo?: string; nome?: string }[] | null;
    const forma = Array.isArray(formaRaw) ? formaRaw[0] : formaRaw;
    const formaComissao =
      origem === 'recebimento_campo' && rcForma
        ? normalizarMetodoComissaoCobrador(rcForma)
        : normalizarMetodoComissaoCobrador(forma);

    resultado.push({
      id: String(row.id),
      data: dataRefBaixa(row),
      valor_centavos: Number(row.valor_pago_centavos || 0),
      cobrador_id: vinculo.cobrador_id,
      cobrador_nome: vinculo.cobrador_nome,
      forma_pagamento: formaComissao,
      cliente_id: String(fr?.cliente_id || ''),
      cliente_nome: String(clienteNome || '-'),
      parcela_codigo: fr?.codigo ? String(fr.codigo) : undefined,
      origem_cobrador: origem,
    });
  }

  return resultado;
}

export async function listarRecebimentosCampo(
  empresaIds: string[],
  filtro?: FiltroRecebimentosCampo,
): Promise<RecebimentoCampoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase
    .from('cob_recebimentos_campo')
    .select(
      `
      id, data, valor_centavos, forma_pagamento, status, cliente_id, cobrador_id, conta_receber_id,
      clientes ( nome, codigo ),
      cobradores ( nome ),
      fin_contas_receber (
        codigo,
        parcela_numero,
        total_parcelas,
        assinaturas ( codigo )
      )
    `,
    )
    .order('data', { ascending: false })
    .limit(Math.min(Math.max(filtro?.limite ?? 2000, 1), 2000));

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const cobradorId = (filtro?.cobrador_id || '').trim();
  if (cobradorId) q = q.eq('cobrador_id', cobradorId);
  const clienteId = (filtro?.cliente_id || '').trim();
  if (clienteId) q = q.eq('cliente_id', clienteId);
  if (filtro?.data_inicio) q = q.gte('data', filtro.data_inicio.slice(0, 10));
  if (filtro?.data_fim) q = q.lte('data', filtro.data_fim.slice(0, 10));

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((row) => {
    const cli = row.clientes as { nome?: string; codigo?: string } | null;
    const cob = row.cobradores as { nome?: string } | null;
    const fr = row.fin_contas_receber as {
      codigo?: string;
      parcela_numero?: number;
      total_parcelas?: number;
      assinaturas?: { codigo?: string } | null;
    } | null;
    const ass = fr?.assinaturas;
    const contrato = String(ass?.codigo || '').trim();
    return {
      id: String(row.id),
      data: String(row.data || '').slice(0, 10),
      valor_centavos: Number(row.valor_centavos || 0),
      cliente_id: String(row.cliente_id || ''),
      cliente_codigo: cli?.codigo ? String(cli.codigo) : undefined,
      cliente_nome: String(cli?.nome || '-'),
      contrato_codigo: contrato || undefined,
      parcela_codigo: fr?.codigo ? String(fr.codigo) : undefined,
      parcela_numero: fr?.parcela_numero ? Number(fr.parcela_numero) : undefined,
      total_parcelas: fr?.total_parcelas ? Number(fr.total_parcelas) : undefined,
      cobrador_id: String(row.cobrador_id || ''),
      cobrador_nome: String(cob?.nome || '-'),
      forma_pagamento: String(row.forma_pagamento || 'dinheiro'),
      status: (row.status as RecebimentoCampoDto['status']) || 'pendente_conferencia',
    };
  });
}

/** Recebimentos em campo de um cliente (reimpressão de recibo). */
export async function listarRecebimentosCampoPorCliente(
  empresaIds: string[],
  filtro: { cliente_id: string; cobrador_id?: string; limite?: number },
): Promise<RecebimentoCampoDto[]> {
  const clienteId = (filtro.cliente_id || '').trim();
  if (!clienteId) return [];

  return listarRecebimentosCampo(empresaIds, {
    cliente_id: clienteId,
    cobrador_id: filtro.cobrador_id?.trim() || undefined,
    limite: filtro.limite ?? 120,
  });
}

export async function buscarRecebimentoCampo(
  id: string,
  empresaIds: string[],
): Promise<(RecebimentoCampoDto & { observacao?: string; conta_receber_id?: string; cobranca_pendente_id?: string }) | null> {
  const ids = [...new Set(empresaIds.map((i) => i.trim()).filter(Boolean))];
  if (!id || ids.length === 0) return null;

  let q = supabase
    .from('cob_recebimentos_campo')
    .select(
      'id, data, valor_centavos, forma_pagamento, status, cliente_id, cobrador_id, observacao, conta_receber_id, cobranca_pendente_id, clientes ( nome ), cobradores ( nome )',
    )
    .eq('id', id);

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const cli = data.clientes as { nome?: string } | null;
  const cob = data.cobradores as { nome?: string } | null;
  return {
    id: String(data.id),
    data: String(data.data || '').slice(0, 10),
    valor_centavos: Number(data.valor_centavos || 0),
    cliente_id: String(data.cliente_id || ''),
    cliente_nome: String(cli?.nome || '-'),
    cobrador_id: String(data.cobrador_id || ''),
    cobrador_nome: String(cob?.nome || '-'),
    forma_pagamento: String(data.forma_pagamento || 'dinheiro'),
    status: (data.status as RecebimentoCampoDto['status']) || 'pendente_conferencia',
    observacao: data.observacao ? String(data.observacao) : undefined,
    conta_receber_id: data.conta_receber_id ? String(data.conta_receber_id) : undefined,
    cobranca_pendente_id: data.cobranca_pendente_id ? String(data.cobranca_pendente_id) : undefined,
  };
}

export async function atualizarRecebimentoCampo(
  id: string,
  empresaId: string,
  params: {
    cliente_id: string;
    cobrador_id: string;
    data: string;
    valor_centavos: number;
    forma_pagamento: string;
    status: 'confirmado' | 'pendente_conferencia';
    observacao?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('cob_recebimentos_campo')
    .update({
      cliente_id: params.cliente_id,
      cobrador_id: params.cobrador_id,
      data: params.data,
      valor_centavos: params.valor_centavos,
      forma_pagamento: params.forma_pagamento,
      status: params.status,
      observacao: params.observacao?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error) throw error;
}

/** Lista cobradores para selects (inclui inativos). */
export async function listarCobradoresSelect(empresaIds: string[]): Promise<{ id: string; nome: string }[]> {
  const ids = [...new Set(empresaIds.map((i) => i.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase.from('cobradores').select('id, nome').order('nome');
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((c) => ({ id: String(c.id), nome: String(c.nome || '') }));
}

export async function listarCobradoresComissao(empresaIds: string[]): Promise<CobradorComissaoDto[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase
    .from('cobradores')
    .select('id, nome, comissao_percentual, comissao_por_metodo, empresa_id, filial_id, area_atuacao')
    .eq('status', 'ativo')
    .order('nome');

  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((c) => ({
    id: String(c.id),
    nome: String(c.nome || ''),
    comissao_percentual: Number(c.comissao_percentual || 0),
    comissao_por_metodo:
      c.comissao_por_metodo && typeof c.comissao_por_metodo === 'object'
        ? (c.comissao_por_metodo as Record<string, any>)
        : {},
    empresa_id: c.empresa_id ? String(c.empresa_id) : undefined,
    filial_id: c.filial_id ? String(c.filial_id) : undefined,
    area_atuacao: c.area_atuacao ? String(c.area_atuacao) : undefined,
  }));
}

import { supabase } from './supabase';
import { unidadeNomeCurto } from './contextoUnidadeLabels';
import { empresaIdsConsultaCobradores } from './cobradorEmpresaScope';
import { cobradorPertenceUnidade, normalizarTextoUnidade } from './cobradorUnidadeFiltro';
import {
  COBRADOR_ESCRITORIO_ID,
  COBRADOR_ESCRITORIO_LABEL,
  cobradorOpcoesComEscritorio,
} from './cobradorEscritorio';

export type CobradorOpcao = { id: string; nome: string };

/** Ids de todas as empresas do grupo econômico (fallback se RPC de listagem falhar). */
export async function empresaIdsGrupoEconomicoParaCobradores(
  idsBase: string[],
): Promise<string[]> {
  const ids = new Set(idsBase.filter(Boolean));
  try {
    const { data: grupoRows, error } = await supabase.rpc('fn_empresas_do_grupo_economico');
    if (!error && Array.isArray(grupoRows)) {
      for (const row of grupoRows as { id?: string }[]) {
        if (row?.id) ids.add(String(row.id));
      }
    }
  } catch (err) {
    console.error('[cobradorDisponiveis] fn_empresas_do_grupo_economico:', err);
  }
  try {
    const { data: rpcEmpresas } = await supabase.rpc('fn_empresas_do_meu_grupo');
    if (Array.isArray(rpcEmpresas)) {
      for (const row of rpcEmpresas as { id?: string }[]) {
        if (row?.id) ids.add(String(row.id));
      }
    }
  } catch (err) {
    console.error('[cobradorDisponiveis] fn_empresas_do_meu_grupo:', err);
  }
  return [...ids];
}

async function loadCobradoresViaRpc(tokenUnidade: string): Promise<CobradorOpcao[]> {
  const token = (tokenUnidade || '').trim();
  const { data, error } = await supabase.rpc('fn_cobradores_ativos_para_unidade', {
    p_token_unidade: token || null,
  });
  if (error) {
    console.error('[loadCobradoresAtivosParaUnidade] RPC:', error.message, error.code);
    return [];
  }
  if (!Array.isArray(data)) return [];
  return (data as { id?: string; nome?: string }[])
    .filter((r) => r?.id)
    .map((r) => ({ id: String(r.id), nome: String(r.nome || 'Cobrador') }));
}

/** Fallback no cliente quando a RPC ainda não existir no projeto. */
async function loadCobradoresViaCliente(opts: {
  empresaIdsParaFiltro: string[];
  empresasDoGrupo: { id: string; nome: string }[];
  visaoTodasEmpresasGrupo: boolean;
  multiEmpresa: boolean;
  tokenUnidadeGrupo: string;
}): Promise<CobradorOpcao[]> {
  const idsBase = empresaIdsConsultaCobradores(opts);
  const idsQuery = await empresaIdsGrupoEconomicoParaCobradores(idsBase);
  if (idsQuery.length === 0) return [];

  const token = (opts.tokenUnidadeGrupo || '').trim();

  const empresaIdAtual = idsBase.length === 1 ? idsBase[0] : idsBase[0] || '';

  let q = supabase
    .from('cobradores')
    .select('id, nome, empresa_id, filial_id, area_atuacao, status')
    .eq('status', 'ativo')
    .order('nome');
  q = idsQuery.length === 1 ? q.eq('empresa_id', idsQuery[0]) : q.in('empresa_id', idsQuery);
  const { data, error } = await q;
  if (error) {
    console.error('[loadCobradoresAtivosParaUnidade] cliente:', error);
    return [];
  }

  const lista = (data || []) as {
    id: string;
    nome: string;
    empresa_id?: string | null;
    filial_id?: string | null;
    area_atuacao?: string | null;
  }[];

  if (!token || opts.visaoTodasEmpresasGrupo) {
    return lista.map((c) => ({ id: c.id, nome: c.nome || 'Cobrador' }));
  }

  const { data: filiaisRows } = await supabase
    .from('filiais')
    .select('id, nome')
    .in('empresa_id', idsQuery);
  const filiais = (filiaisRows || []).map((f: { id: string; nome: string }) => ({
    id: f.id,
    nome: f.nome,
  }));
  const filialIdsUnidade = new Set(
    filiais.filter((f) => normalizarTextoUnidade(f.nome).includes(normalizarTextoUnidade(token))).map((f) => f.id),
  );

  const filtrados = lista.filter((c) =>
    cobradorPertenceUnidade(
      {
        empresa_id: c.empresa_id,
        filial_id: c.filial_id,
        area_atuacao: c.area_atuacao,
      },
      filiais,
      {
        filialIdsUnidade: filialIdsUnidade.size > 0 ? filialIdsUnidade : undefined,
        tokenUnidade: token,
        empresaIdAtual: empresaIdAtual || undefined,
      },
    ),
  );

  return (filtrados.length > 0 ? filtrados : lista).map((c) => ({
    id: c.id,
    nome: c.nome || 'Cobrador',
  }));
}

/**
 * Carrega cobradores ativos da unidade do usuário (ex.: Catalão).
 * Usa RPC no banco (grupo Fênix + filtro por unidade); fallback no cliente se necessário.
 */
export async function loadCobradoresAtivosParaUnidade(opts: {
  empresaIdsParaFiltro: string[];
  empresasDoGrupo: { id: string; nome: string }[];
  visaoTodasEmpresasGrupo: boolean;
  multiEmpresa: boolean;
  tokenUnidadeGrupo: string;
}): Promise<CobradorOpcao[]> {
  let token = (opts.tokenUnidadeGrupo || '').trim();
  if (!token && !opts.visaoTodasEmpresasGrupo && opts.empresasDoGrupo.length > 0) {
    const emp = opts.empresasDoGrupo[0];
    token = unidadeNomeCurto(emp?.nome || '');
  }

  const viaRpc = await loadCobradoresViaRpc(
    opts.visaoTodasEmpresasGrupo ? '' : token,
  );
  if (viaRpc.length > 0) return cobradorOpcoesComEscritorio(viaRpc);

  const viaCliente = await loadCobradoresViaCliente(opts);
  if (viaCliente.length > 0) return cobradorOpcoesComEscritorio(viaCliente);

  // Último recurso: RPC sem filtro de unidade (grupo inteiro) — evita lista só com Escritório
  if (token && !opts.visaoTodasEmpresasGrupo) {
    const todosGrupo = await loadCobradoresViaRpc('');
    if (todosGrupo.length > 0) return cobradorOpcoesComEscritorio(todosGrupo);
  }

  return cobradorOpcoesComEscritorio([]);
}

export type AtribuirCobradorCarteiraResult = {
  ok: boolean;
  linhasAtualizadas: number;
  erro?: string;
};

type RpcCarteiraResposta = { ok?: boolean; linhas?: number; erro?: string | null };

function rpcAusente(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('could not find') || m.includes('does not exist') || m.includes('schema cache');
}

function mensagemErroCarteira(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('row-level security') || m.includes('row level security')) {
    return 'Permissão negada na carteira. Recarregue a página (Ctrl+F5). Se persistir, avise o suporte.';
  }
  return message;
}

async function chamarRpcCarteira(
  rpcName: string,
  params: Record<string, unknown>,
): Promise<AtribuirCobradorCarteiraResult | null> {
  const { data, error } = await supabase.rpc(rpcName, params);
  if (error) {
    if (rpcAusente(error.message)) return null;
    return { ok: false, linhasAtualizadas: 0, erro: mensagemErroCarteira(error.message) };
  }
  const j = (data || {}) as RpcCarteiraResposta;
  return {
    ok: !!j.ok,
    linhasAtualizadas: Number(j.linhas ?? 0),
    erro: j.erro ? String(j.erro) : undefined,
  };
}

async function syncCarteiraCliente(empresaId: string, clienteId: string): Promise<string | null> {
  const { error } = await supabase.rpc('fn_cob_carteira_upsert_cliente', {
    p_empresa_id: empresaId,
    p_cliente_id: clienteId,
  });
  if (!error) return null;
  const m = (error.message || '').toLowerCase();
  const rpcAusente =
    m.includes('could not find') || m.includes('does not exist') || m.includes('schema cache');
  if (rpcAusente) {
    const { error: legado } = await supabase.rpc('fn_cob_carteira_upsert_pendencias_de_titulos', {
      p_empresa_id: empresaId,
    });
    return legado?.message || null;
  }
  console.error('[syncCarteiraCliente]', error);
  return error.message;
}

/** Cobrador atribuído na carteira (se houver). */
export async function cobradorAtualNaCarteiraCliente(
  empresaId: string,
  clienteId: string,
): Promise<{ cobradorId: string; cobradorNome: string } | null> {
  const emp = empresaId.trim();
  const cli = clienteId.trim();
  if (!emp || !cli) return null;

  const { data, error } = await supabase.rpc('fn_cob_carteira_status_cliente', {
    p_empresa_id: emp,
    p_cliente_id: cli,
  });

  if (!error && data && typeof data === 'object') {
    const j = data as {
      escritorio?: boolean;
      cobrador_id?: string | null;
      cobrador_nome?: string | null;
      erro?: string;
    };
    if (j.erro) return null;
    if (j.escritorio) {
      return { cobradorId: COBRADOR_ESCRITORIO_ID, cobradorNome: COBRADOR_ESCRITORIO_LABEL };
    }
    if (!j.cobrador_id) return null;
    return {
      cobradorId: String(j.cobrador_id),
      cobradorNome: String(j.cobrador_nome || 'Cobrador'),
    };
  }

  const { data: rowEsc, error: escErr } = await supabase
    .from('cob_cobrancas_pendentes')
    .select('id')
    .eq('empresa_id', emp)
    .eq('cliente_id', cli)
    .eq('canal_cobranca', 'escritorio')
    .in('status', ['pendente', 'em_andamento', 'promessa'])
    .limit(1)
    .maybeSingle();
  if (!escErr && rowEsc?.id) {
    return { cobradorId: COBRADOR_ESCRITORIO_ID, cobradorNome: COBRADOR_ESCRITORIO_LABEL };
  }

  const { data: row, error: qErr } = await supabase
    .from('cob_cobrancas_pendentes')
    .select('cobrador_id')
    .eq('empresa_id', emp)
    .eq('cliente_id', cli)
    .eq('canal_cobranca', 'cobrador')
    .not('cobrador_id', 'is', null)
    .in('status', ['pendente', 'em_andamento', 'promessa'])
    .limit(1)
    .maybeSingle();

  if (qErr || !row?.cobrador_id) return null;

  const { data: cob } = await supabase
    .from('cobradores')
    .select('nome')
    .eq('id', row.cobrador_id)
    .maybeSingle();

  return {
    cobradorId: String(row.cobrador_id),
    cobradorNome: cob?.nome || 'Cobrador',
  };
}

/**
 * Sincroniza pendências do cliente (títulos/contrato) e atribui o cobrador na carteira.
 * cobradorId = id da tabela cobradores (não users).
 */
export async function atribuirCobradorCarteiraCliente(
  empresaId: string,
  clienteId: string,
  cobradorId: string,
): Promise<AtribuirCobradorCarteiraResult> {
  const emp = empresaId.trim();
  const cli = clienteId.trim();
  const cob = cobradorId.trim();
  if (!emp || !cli || !cob) {
    return { ok: false, linhasAtualizadas: 0, erro: 'Dados incompletos para atribuir cobrador.' };
  }
  if (cob === COBRADOR_ESCRITORIO_ID) {
    return {
      ok: false,
      linhasAtualizadas: 0,
      erro: 'Use a opção Escritório na lista de cobradores (carteira do escritório).',
    };
  }

  const viaRpc = await chamarRpcCarteira('fn_cob_carteira_atribuir_cobrador', {
    p_empresa_id: emp,
    p_cliente_id: cli,
    p_cobrador_id: cob,
  });
  if (viaRpc) return viaRpc;

  return {
    ok: false,
    linhasAtualizadas: 0,
    erro: 'Não foi possível gravar na carteira. Recarregue a página (Ctrl+F5) e tente de novo.',
  };
}

/** Remove o cliente da carteira (mantém pendências financeiras, sem cobrador). */
export async function removerClienteDaCarteira(
  empresaId: string,
  clienteId: string,
): Promise<AtribuirCobradorCarteiraResult> {
  const emp = empresaId.trim();
  const cli = clienteId.trim();
  if (!emp || !cli) {
    return { ok: false, linhasAtualizadas: 0, erro: 'Dados incompletos.' };
  }

  const viaRpc = await chamarRpcCarteira('fn_cob_carteira_remover_cobrador', {
    p_empresa_id: emp,
    p_cliente_id: cli,
  });
  if (viaRpc) return viaRpc;

  return { ok: false, linhasAtualizadas: 0, erro: 'Não foi possível remover da carteira. Recarregue a página (Ctrl+F5).' };
}

/** Atribuição em massa na carteira (vários clientes). */
export async function atribuirCobradorCarteiraLote(
  empresaIds: string[],
  clienteIds: string[],
  cobradorId: string | null,
): Promise<AtribuirCobradorCarteiraResult> {
  const empresas = [...new Set(empresaIds.filter(Boolean))];
  const clientes = [...new Set(clienteIds.filter(Boolean))];
  if (empresas.length === 0 || clientes.length === 0) {
    return { ok: false, linhasAtualizadas: 0, erro: 'Selecione clientes e unidade.' };
  }

  const viaRpc = await chamarRpcCarteira('fn_cob_carteira_atribuir_cobrador_lote', {
    p_empresa_ids: empresas,
    p_cliente_ids: clientes,
    p_cobrador_id: cobradorId,
  });
  if (viaRpc) return viaRpc;

  return { ok: false, linhasAtualizadas: 0, erro: 'Função de carteira em lote indisponível. Atualize o banco.' };
}

/** Clientes que já têm cobrador na carteira (pendências com cobrador_id). */
export async function clienteIdsComCobradorNaCarteira(
  empresaIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(empresaIds.filter(Boolean))];
  if (ids.length === 0) return new Set();

  let q = supabase
    .from('cob_cobrancas_pendentes')
    .select('cliente_id')
    .eq('canal_cobranca', 'cobrador')
    .not('cobrador_id', 'is', null)
    .in('status', ['pendente', 'em_andamento', 'promessa']);
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[clienteIdsComCobradorNaCarteira]', error);
    return new Set();
  }

  const out = new Set<string>();
  for (const row of data || []) {
    const cid = String((row as { cliente_id?: string }).cliente_id || '').trim();
    if (cid) out.add(cid);
  }
  return out;
}

/** Nome do cobrador vinculado por cliente_id (primeira pendência com cobrador). */
export async function mapaCobradorNomePorCliente(
  empresaIds: string[],
): Promise<Map<string, string>> {
  const info = await mapaCobradorInfoPorCliente(empresaIds);
  const nomes = new Map<string, string>();
  for (const [cid, c] of info) nomes.set(cid, c.nome);
  return nomes;
}

/** Cobrador atual na carteira por cliente_id. */
export async function mapaCobradorInfoPorCliente(
  empresaIds: string[],
): Promise<Map<string, { id: string; nome: string }>> {
  const ids = [...new Set(empresaIds.filter(Boolean))];
  const map = new Map<string, { id: string; nome: string }>();
  if (ids.length === 0) return map;

  let q = supabase
    .from('cob_cobrancas_pendentes')
    .select('cliente_id, cobrador_id, cobradores ( id, nome )')
    .eq('canal_cobranca', 'cobrador')
    .not('cobrador_id', 'is', null)
    .in('status', ['pendente', 'em_andamento', 'promessa']);
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[mapaCobradorInfoPorCliente]', error);
    return map;
  }

  for (const row of data || []) {
    const r = row as {
      cliente_id?: string;
      cobrador_id?: string;
      cobradores?: { id?: string; nome?: string } | null;
    };
    const cid = String(r.cliente_id || '').trim();
    const cobId = String(r.cobrador_id || r.cobradores?.id || '').trim();
    if (!cid || !cobId || map.has(cid)) continue;
    map.set(cid, {
      id: cobId,
      nome: String(r.cobradores?.nome || 'Cobrador'),
    });
  }

  let qEsc = supabase
    .from('cob_cobrancas_pendentes')
    .select('cliente_id')
    .eq('canal_cobranca', 'escritorio')
    .in('status', ['pendente', 'em_andamento', 'promessa']);
  qEsc = ids.length === 1 ? qEsc.eq('empresa_id', ids[0]) : qEsc.in('empresa_id', ids);
  const { data: escRows, error: escErr } = await qEsc;
  if (!escErr) {
    for (const row of escRows || []) {
      const cid = String((row as { cliente_id?: string }).cliente_id || '').trim();
      if (cid && !map.has(cid)) {
        map.set(cid, { id: COBRADOR_ESCRITORIO_ID, nome: COBRADOR_ESCRITORIO_LABEL });
      }
    }
  }

  return map;
}

import { supabase } from './supabase';

export type AtribuirCarteiraResult = {
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
): Promise<AtribuirCarteiraResult | null> {
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
  console.error('[syncCarteiraCliente escritorio]', error);
  return error.message;
}

/** Cliente está na carteira do escritório (pagamento na unidade). */
export async function clienteNaCarteiraEscritorio(
  empresaId: string,
  clienteId: string,
): Promise<boolean> {
  const emp = empresaId.trim();
  const cli = clienteId.trim();
  if (!emp || !cli) return false;

  const { data, error } = await supabase.rpc('fn_cob_carteira_status_cliente', {
    p_empresa_id: emp,
    p_cliente_id: cli,
  });

  if (!error && data && typeof data === 'object') {
    return !!(data as { escritorio?: boolean }).escritorio;
  }

  const { data: row, error: qErr } = await supabase
    .from('cob_cobrancas_pendentes')
    .select('id')
    .eq('empresa_id', emp)
    .eq('cliente_id', cli)
    .eq('canal_cobranca', 'escritorio')
    .in('status', ['pendente', 'em_andamento', 'promessa'])
    .limit(1)
    .maybeSingle();

  if (qErr) {
    console.error('[clienteNaCarteiraEscritorio]', qErr);
    return false;
  }
  return !!row?.id;
}

/**
 * Inclui o cliente na carteira do escritório (sem cobrador).
 * Remove vínculo de cobrador, se existir.
 */
export async function atribuirClienteCarteiraEscritorio(
  empresaId: string,
  clienteId: string,
): Promise<AtribuirCarteiraResult> {
  const emp = empresaId.trim();
  const cli = clienteId.trim();
  if (!emp || !cli) {
    return { ok: false, linhasAtualizadas: 0, erro: 'Dados incompletos.' };
  }

  const viaRpc = await chamarRpcCarteira('fn_cob_carteira_atribuir_escritorio', {
    p_empresa_id: emp,
    p_cliente_id: cli,
  });
  if (viaRpc) return viaRpc;

  return {
    ok: false,
    linhasAtualizadas: 0,
    erro: 'Não foi possível gravar na carteira do escritório. Recarregue a página (Ctrl+F5).',
  };
}

/** Remove o cliente da carteira do escritório (mantém pendências, canal volta para cobrador). */
export async function removerClienteDaCarteiraEscritorio(
  empresaId: string,
  clienteId: string,
): Promise<AtribuirCarteiraResult> {
  const emp = empresaId.trim();
  const cli = clienteId.trim();
  if (!emp || !cli) {
    return { ok: false, linhasAtualizadas: 0, erro: 'Dados incompletos.' };
  }

  const viaRpc = await chamarRpcCarteira('fn_cob_carteira_remover_escritorio', {
    p_empresa_id: emp,
    p_cliente_id: cli,
  });
  if (viaRpc) return viaRpc;

  return { ok: false, linhasAtualizadas: 0, erro: 'Não foi possível remover do escritório. Recarregue a página (Ctrl+F5).' };
}

/** Clientes já na carteira do escritório. */
export async function clienteIdsNaCarteiraEscritorio(
  empresaIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(empresaIds.filter(Boolean))];
  if (ids.length === 0) return new Set();

  let q = supabase
    .from('cob_cobrancas_pendentes')
    .select('cliente_id')
    .eq('canal_cobranca', 'escritorio')
    .in('status', ['pendente', 'em_andamento', 'promessa']);
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[clienteIdsNaCarteiraEscritorio]', error);
    return new Set();
  }

  const out = new Set<string>();
  for (const row of data || []) {
    const cid = String((row as { cliente_id?: string }).cliente_id || '').trim();
    if (cid) out.add(cid);
  }
  return out;
}

import { COBRADOR_ESCRITORIO_LABEL } from './cobradorEscritorio';

export const ROTULO_CARTEIRA_ESCRITORIO = COBRADOR_ESCRITORIO_LABEL;

export type CanalCobrancaCliente = 'cobrador' | 'escritorio' | null;

/**
 * Canal de cobrança exibido no contrato.
 * Prioriza a forma de pagamento do contrato; só usa a carteira se a forma não indicar canal.
 */
export function resolverCanalCobrancaCliente(
  formaPagamento?: string | null,
  rotuloCarteira?: string | null,
): CanalCobrancaCliente {
  const forma = (formaPagamento || '').toLowerCase().trim();
  const rotulo = (rotuloCarteira || '').trim();

  if (forma === 'escritorio') return 'escritorio';
  if (forma === 'cobrador') return 'cobrador';

  if (rotulo === ROTULO_CARTEIRA_ESCRITORIO) return 'escritorio';
  if (rotulo) return 'cobrador';
  return null;
}

/** Sincroniza carteira após criar contrato (mensalidades → pendências; escritório na carteira). */
export async function aplicarCarteiraConformeMetodoContrato(
  empresaId: string,
  clienteId: string,
  metodoCobranca?: string | null,
): Promise<void> {
  const emp = empresaId.trim();
  const cli = clienteId.trim();
  if (!emp || !cli) return;

  const metodo = (metodoCobranca || '').toLowerCase().trim();

  const { error: syncErr } = await supabase.rpc('fn_cob_carteira_upsert_cliente', {
    p_empresa_id: emp,
    p_cliente_id: cli,
  });
  if (syncErr) {
    const m = (syncErr.message || '').toLowerCase();
    if (!m.includes('could not find') && !m.includes('does not exist')) {
      console.warn('[aplicarCarteiraConformeMetodoContrato] upsert:', syncErr.message);
    } else {
      await supabase.rpc('fn_cob_carteira_upsert_pendencias_de_titulos', { p_empresa_id: emp });
    }
  }

  if (metodo === 'escritorio') {
    const r = await atribuirClienteCarteiraEscritorio(emp, cli);
    if (!r.ok) console.warn('[aplicarCarteiraConformeMetodoContrato] escritório:', r.erro);
  }
}

/** Rótulo de cobrança por cliente (cobrador ou escritório). */
export async function mapaRotuloCobrancaPorCliente(
  empresaIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(empresaIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  let q = supabase
    .from('cob_cobrancas_pendentes')
    .select('cliente_id, canal_cobranca, cobrador_id, cobradores ( nome )')
    .in('status', ['pendente', 'em_andamento', 'promessa']);
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[mapaRotuloCobrancaPorCliente]', error);
    return map;
  }

  for (const row of data || []) {
    const r = row as {
      cliente_id?: string;
      canal_cobranca?: string;
      cobrador_id?: string | null;
      cobradores?: { nome?: string } | null;
    };
    const cid = String(r.cliente_id || '').trim();
    if (!cid || map.has(cid)) continue;

    if (r.canal_cobranca === 'escritorio') {
      map.set(cid, ROTULO_CARTEIRA_ESCRITORIO);
      continue;
    }
    if (r.cobrador_id) {
      map.set(cid, r.cobradores?.nome || 'Cobrador');
    }
  }
  return map;
}

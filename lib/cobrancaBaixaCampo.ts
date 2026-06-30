import { supabase } from './supabase';
import type { CobrancaPendenteDto } from './cobrancaPendentesSupabase';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Remove pendências "placeholder" (sem título) quando já existe pendência com o mesmo vencimento
 * vinculada a fin_contas_receber — evita baixa duplicada na carteira.
 */
export function ocultarPendenciasPlaceholderDuplicadas(
  itens: CobrancaPendenteDto[],
): CobrancaPendenteDto[] {
  const comTitulo = new Set(
    itens
      .filter((p) => p.conta_receber_id && UUID_RE.test(p.conta_receber_id))
      .map((p) => `${p.cliente_id || ''}|${p.data_vencimento}`),
  );

  return itens.filter((p) => {
    if (p.conta_receber_id && UUID_RE.test(p.conta_receber_id)) return true;
    const chave = `${p.cliente_id || ''}|${p.data_vencimento}`;
    return !comTitulo.has(chave);
  });
}

export type ResolverTituloBaixaCampoParams = {
  empresa_id: string;
  cliente_id: string;
  conta_receber_id?: string | null;
  data_vencimento?: string | null;
  valor_centavos?: number | null;
};

export type ResultadoResolverTituloBaixa =
  | { ok: true; conta_receber_id: string }
  | { ok: false; motivo: 'ja_pago' | 'sem_titulo'; parcela_codigo?: string };

/** Resolve o título financeiro a baixar (parcela em aberto mais antiga do cliente). */
export async function resolverContaReceberIdBaixaCampo(
  params: ResolverTituloBaixaCampoParams,
): Promise<ResultadoResolverTituloBaixa> {
  const empresaId = params.empresa_id.trim();
  const clienteId = params.cliente_id.trim();
  if (!empresaId || !clienteId) {
    return { ok: false, motivo: 'sem_titulo' };
  }

  const informado = (params.conta_receber_id || '').trim();
  if (informado && UUID_RE.test(informado)) {
    const { data: cr } = await supabase
      .from('fin_contas_receber')
      .select('id, codigo, valor_aberto_centavos, status')
      .eq('id', informado)
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .maybeSingle();
    if (cr) {
      const st = String(cr.status || '').toLowerCase();
      if (st === 'pago' || st === 'cancelado' || Number(cr.valor_aberto_centavos || 0) <= 0) {
        return {
          ok: false,
          motivo: 'ja_pago',
          parcela_codigo: String(cr.codigo || ''),
        };
      }
      return { ok: true, conta_receber_id: informado };
    }
  }

  let q = supabase
    .from('fin_contas_receber')
    .select('id, data_vencimento, valor_aberto_centavos')
    .eq('empresa_id', empresaId)
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .gt('valor_aberto_centavos', 0)
    .in('status', ['aberto', 'vencido', 'pago_parcial'])
    .order('data_vencimento', { ascending: true })
    .order('parcela_numero', { ascending: true })
    .limit(1);

  const venc = (params.data_vencimento || '').slice(0, 10);
  if (venc) q = q.eq('data_vencimento', venc);

  const valor = params.valor_centavos != null ? Math.round(params.valor_centavos) : 0;
  if (valor > 0) q = q.eq('valor_aberto_centavos', valor);

  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (data?.id) return { ok: true, conta_receber_id: String(data.id) };
  return { ok: false, motivo: 'sem_titulo' };
}

/** Compat: retorna só o id ou null. */
export async function resolverContaReceberIdBaixaCampoLegado(
  params: ResolverTituloBaixaCampoParams,
): Promise<string | null> {
  const r = await resolverContaReceberIdBaixaCampo(params);
  return r.ok ? r.conta_receber_id : null;
}

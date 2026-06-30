import { supabase } from './supabase';

export type CobradorPerformance = {
  total_clientes_ativos: number;
  total_cobrado_mes_centavos: number;
  total_recebido_mes_centavos: number;
};

const STATUS_ABERTO = ['pendente', 'em_andamento', 'promessa'] as const;

function inicioFimMesAtual(): { inicio: Date; fim: Date } {
  const now = new Date();
  const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
  const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { inicio, fim };
}

function dataNoMesAtual(isoDate: string | null | undefined, inicio: Date, fim: Date): boolean {
  if (!isoDate) return false;
  const d = new Date(isoDate.length === 10 ? `${isoDate}T12:00:00` : isoDate);
  return d >= inicio && d <= fim;
}

/** Métricas por cobrador a partir da carteira (cob_cobrancas_pendentes). */
export async function mapaPerformanceCobradores(
  empresaIds: string[],
): Promise<Map<string, CobradorPerformance>> {
  const ids = [...new Set(empresaIds.filter(Boolean))];
  const map = new Map<string, CobradorPerformance>();
  if (ids.length === 0) return map;

  let q = supabase
    .from('cob_cobrancas_pendentes')
    .select('cobrador_id, cliente_id, valor_centavos, status, data_vencimento, updated_at')
    .eq('canal_cobranca', 'cobrador')
    .not('cobrador_id', 'is', null);
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.error('[mapaPerformanceCobradores]', error);
    return map;
  }

  const { inicio, fim } = inicioFimMesAtual();
  type Acc = { clientes: Set<string>; emAberto: number; recebidoMes: number; cobrarMes: number };
  const accPorCobrador = new Map<string, Acc>();

  for (const row of data || []) {
    const cobId = String((row as { cobrador_id?: string }).cobrador_id || '').trim();
    const cliId = String((row as { cliente_id?: string }).cliente_id || '').trim();
    if (!cobId) continue;

    if (!accPorCobrador.has(cobId)) {
      accPorCobrador.set(cobId, { clientes: new Set(), emAberto: 0, recebidoMes: 0, cobrarMes: 0 });
    }
    const acc = accPorCobrador.get(cobId)!;
    const valor = Number((row as { valor_centavos?: number }).valor_centavos || 0);
    const status = String((row as { status?: string }).status || '');
    const venc = (row as { data_vencimento?: string }).data_vencimento;
    const updated = (row as { updated_at?: string }).updated_at;

    if (STATUS_ABERTO.includes(status as (typeof STATUS_ABERTO)[number])) {
      if (cliId) acc.clientes.add(cliId);
      acc.emAberto += valor;
      if (dataNoMesAtual(venc, inicio, fim)) {
        acc.cobrarMes += valor;
      }
    }

    if (status === 'cobrado' && updated) {
      const d = new Date(updated);
      if (d >= inicio && d <= fim) {
        acc.recebidoMes += valor;
      }
    }
  }

  for (const [cobId, acc] of accPorCobrador) {
    map.set(cobId, {
      total_clientes_ativos: acc.clientes.size,
      total_cobrado_mes_centavos: acc.cobrarMes > 0 ? acc.cobrarMes : acc.emAberto,
      total_recebido_mes_centavos: acc.recebidoMes,
    });
  }

  return map;
}

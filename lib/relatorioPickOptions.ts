import { supabase } from './supabase';
import type { RelatorioParamSpec } from './RelatoriosStore';

export interface PickOption {
    value: string;
    label: string;
}

/**
 * Carrega opções para selects de filtro (contas, centros de custo, departamentos, etc.).
 * Respeita RLS e empresa atual.
 */
export async function loadPickOptionsForParam(
    param: RelatorioParamSpec,
    empresaId: string
): Promise<PickOption[]> {
    const pf = param.pickFrom;
    if (!pf || !empresaId) return [];

    const cols = `${pf.value},${pf.label}`;
    let q = supabase.from(pf.table).select(cols).eq('empresa_id', empresaId);
    if (pf.table === 'fin_contas_bancarias' || pf.table === 'fin_centros_custo') {
        q = q.eq('ativo', true);
    }
    if (pf.table === 'departamentos') {
        q = q.is('deleted_at', null);
    }
    const { data, error } = await q.order(pf.label, { ascending: true });
    if (error || !data?.length) return [];

    return (data as any[]).map((row: any) => ({
        value: String(row[pf.value] ?? ''),
        label: String(row[pf.label] ?? row[pf.value] ?? ''),
    }));
}

import { supabase } from './supabase';

/** Extrai só dígitos do código (ex. CTR-000055 → 000055). */
export function extrairDigitosContrato(codigo?: string | null): string {
    return String(codigo ?? '').replace(/\D/g, '');
}

/**
 * Compara termo de busca com código do contrato.
 * Aceita CTR-000055, 000055, 55, etc.
 */
export function contratoCodigoMatch(codigoContrato: string | null | undefined, termo: string): boolean {
    const cod = String(codigoContrato ?? '').trim();
    const t = termo.trim();
    if (!cod || !t) return false;

    if (cod.toLowerCase().includes(t.toLowerCase())) return true;

    const codDigits = extrairDigitosContrato(cod);
    const termDigits = extrairDigitosContrato(t);
    if (termDigits.length < 2) return false;

    if (codDigits.includes(termDigits)) return true;

    const codNum = codDigits.replace(/^0+/, '') || codDigits;
    const termNum = termDigits.replace(/^0+/, '') || termDigits;
    if (codNum.includes(termNum)) return true;
    if (codDigits.endsWith(termDigits)) return true;

    return false;
}

/** Monta filtro `.or()` do Supabase para busca em `assinaturas.codigo`. */
export function montarOrFiltroAssinaturaCodigo(termo: string): string | null {
    const t = termo.trim();
    if (!t || t.length < 2) return null;

    const esc = t.replace(/[%_\\,]/g, '\\$&');
    const parts = new Set<string>([`codigo.ilike.%${esc}%`]);

    const digits = t.replace(/\D/g, '');
    if (digits.length >= 2) {
        parts.add(`codigo.ilike.%${digits}%`);
        if (digits.length <= 6) {
            parts.add(`codigo.ilike.%${digits.padStart(6, '0')}%`);
            parts.add(`codigo.ilike.%-${digits.padStart(6, '0')}%`);
        }
    }

    return Array.from(parts).join(',');
}

export type BuscaContratoResult = {
    clienteIds: string[];
    codigosPorCliente: Map<string, string[]>;
};

/** Busca clientes vinculados a contratos cujo código corresponde ao termo. */
export async function buscarClienteIdsPorCodigoContrato(
    empresaIds: string[],
    termo: string,
): Promise<BuscaContratoResult> {
    const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
    const orFilter = montarOrFiltroAssinaturaCodigo(termo);
    if (!orFilter || ids.length === 0) {
        return { clienteIds: [], codigosPorCliente: new Map() };
    }

    let q = supabase
        .from('assinaturas')
        .select('cliente_id, codigo')
        .or(orFilter)
        .limit(80);

    if (ids.length === 1) q = q.eq('empresa_id', ids[0]);
    else q = q.in('empresa_id', ids);

    const { data, error } = await q;
    if (error) {
        console.error('[buscarClienteIdsPorCodigoContrato]', error);
        return { clienteIds: [], codigosPorCliente: new Map() };
    }

    const codigosPorCliente = new Map<string, string[]>();
    for (const row of data || []) {
        const clienteId = String(row.cliente_id || '').trim();
        const codigo = String(row.codigo || '').trim();
        if (!clienteId) continue;
        if (!contratoCodigoMatch(codigo, termo)) continue;
        const lista = codigosPorCliente.get(clienteId) || [];
        if (codigo && !lista.includes(codigo)) lista.push(codigo);
        codigosPorCliente.set(clienteId, lista);
    }

    return {
        clienteIds: Array.from(codigosPorCliente.keys()),
        codigosPorCliente,
    };
}

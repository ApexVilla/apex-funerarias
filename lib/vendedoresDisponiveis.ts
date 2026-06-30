import { supabase } from './supabase';

export type VendedorOpcao = { id: string; nome: string; role?: string };

/** Valor do select quando o cliente não tem vendedor ou o vendedor antigo saiu. */
export const VENDEDOR_ESCRITORIO_ID = '__escritorio__';
export const VENDEDOR_ESCRITORIO_LABEL = 'Escritório';

const ROLES_VENDEDOR = ['vendedor', 'gerente', 'supervisao', 'atendente'] as const;

export function vendedorOpcoesComEscritorio(lista: VendedorOpcao[]): VendedorOpcao[] {
    const ids = new Set(lista.map((v) => v.id));
    const base = lista.filter((v) => v.id !== VENDEDOR_ESCRITORIO_ID);
    return [{ id: VENDEDOR_ESCRITORIO_ID, nome: VENDEDOR_ESCRITORIO_LABEL }, ...base];
}

/** Exibe Escritório quando não há vendedor, tipo escritório ou vendedor inativo/removido da lista. */
export function normalizarVendedorIdForm(
    vendedorId: string | null | undefined,
    lista: VendedorOpcao[],
    tipoVendedor?: string | null,
): string {
    if (tipoVendedor === 'escritorio') return VENDEDOR_ESCRITORIO_ID;
    const id = (vendedorId || '').trim();
    if (!id) return VENDEDOR_ESCRITORIO_ID;
    const ativos = lista.filter((v) => v.id !== VENDEDOR_ESCRITORIO_ID);
    if (!ativos.some((v) => v.id === id)) return VENDEDOR_ESCRITORIO_ID;
    return id;
}

export function vendedorIdParaSalvar(vendedorId: string | null | undefined): string | undefined {
    const id = (vendedorId || '').trim();
    if (!id || id === VENDEDOR_ESCRITORIO_ID) return undefined;
    return id;
}

export function tipoVendedorParaSalvar(
    vendedorId: string | null | undefined,
    tipoAtual: string | null | undefined,
): string | undefined {
    if ((vendedorId || '').trim() === VENDEDOR_ESCRITORIO_ID) return undefined;
    const t = (tipoAtual || '').trim();
    if (t === 'escritorio') return undefined;
    if (t === 'interno' || t === 'externo') return t;
    return undefined;
}

/** Escritório = sem vendedor vinculado (o banco só aceita interno/externo em tipo_vendedor). */
export function clienteEhVendedorEscritorio(
    vendedorId?: string | null,
    tipoVendedor?: string | null,
): boolean {
    if ((vendedorId || '').trim() === VENDEDOR_ESCRITORIO_ID) return true;
    if (!(vendedorId || '').trim()) return true;
    return tipoVendedor === 'escritorio';
}

export function rotuloVendedorForm(vendedorId: string | null | undefined, lista: VendedorOpcao[]): string {
    if ((vendedorId || '').trim() === VENDEDOR_ESCRITORIO_ID) return VENDEDOR_ESCRITORIO_LABEL;
    return lista.find((v) => v.id === vendedorId)?.nome || '—';
}

/**
 * Usuários ativos da empresa (e do grupo, quando informado) que podem ser vinculados como vendedor do cliente.
 * A opção Escritório é acrescentada no início da lista.
 */
export async function loadVendedoresDisponiveis(opts: {
    empresaId: string;
    empresaIdsParaFiltro?: string[];
}): Promise<VendedorOpcao[]> {
    const ids = new Set<string>();
    if (opts.empresaId?.trim()) ids.add(opts.empresaId.trim());
    for (const id of opts.empresaIdsParaFiltro || []) {
        if (id?.trim()) ids.add(id.trim());
    }
    const empresaIds = [...ids];
    if (empresaIds.length === 0) return vendedorOpcoesComEscritorio([]);

    let q = supabase
        .from('users')
        .select('id, nome, role, ativo')
        .in('role', [...ROLES_VENDEDOR])
        .neq('ativo', false)
        .order('nome');

    q = empresaIds.length === 1 ? q.eq('empresa_id', empresaIds[0]) : q.in('empresa_id', empresaIds);

    const { data, error } = await q;
    if (error) {
        console.error('[loadVendedoresDisponiveis]', error);
        return vendedorOpcoesComEscritorio([]);
    }

    const map = new Map<string, VendedorOpcao>();
    for (const row of data || []) {
        if (!row?.id) continue;
        map.set(String(row.id), {
            id: String(row.id),
            nome: String(row.nome || 'Vendedor'),
            role: row.role ? String(row.role) : undefined,
        });
    }
    const ordenados = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return vendedorOpcoesComEscritorio(ordenados);
}

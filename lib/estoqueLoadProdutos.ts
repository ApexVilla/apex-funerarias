import { supabase } from './supabase';

const PAGE_SIZE = 1000;

/** Carrega todos os produtos ativos das empresas (paginação automática). */
export async function loadProdutosAtivosEmpresa<T = Record<string, unknown>>(
    empresaIds: string[],
    select: string,
): Promise<T[]> {
    if (empresaIds.length === 0) return [];

    const all: T[] = [];
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('ser_produtos')
            .select(select)
            .in('empresa_id', empresaIds)
            .eq('ativo', true)
            .order('nome')
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        const page = (data ?? []) as T[];
        all.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return all;
}

/** Busca no servidor quando a lista local não achar (catálogo grande). */
export async function buscarProdutosAtivosNoServidor<T = Record<string, unknown>>(
    empresaIds: string[],
    termo: string,
    select: string,
    limit = 80,
): Promise<T[]> {
    const t = termo.trim();
    if (!t || empresaIds.length === 0) return [];

    const esc = t.replace(/[%_,"\\]/g, '').trim();
    if (!esc) return [];

    const padrao = `%${esc}%`;
    const { data, error } = await supabase
        .from('ser_produtos')
        .select(select)
        .in('empresa_id', empresaIds)
        .eq('ativo', true)
        .or(
            [
                `nome.ilike.${padrao}`,
                `codigo.ilike.${padrao}`,
                `codigo_barras.ilike.${padrao}`,
                `marca.ilike.${padrao}`,
                `categoria.ilike.${padrao}`,
            ].join(','),
        )
        .order('nome')
        .limit(limit);

    if (error) throw error;
    return (data ?? []) as T[];
}

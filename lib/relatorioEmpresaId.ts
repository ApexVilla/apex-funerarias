import { supabase } from './supabase';
import { safeJsonParse } from './jsonSafe';

const SS_EMPRESA_CONTEXTO = 'apex_empresa_modulos_contexto_id';

function isUuidLike(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** Empresa da sessão — usado por filtros dinâmicos de relatórios (evita export no mesmo arquivo do Provider). */
export async function resolveEmpresaIdForRelatorios(): Promise<string> {
    try {
        const ctx = (sessionStorage.getItem(SS_EMPRESA_CONTEXTO) || '').trim();
        if (ctx && isUuidLike(ctx)) return ctx;
    } catch {
        /* ignore */
    }
    const u = safeJsonParse<Record<string, unknown>>(sessionStorage.getItem('user'), {});
    if (typeof u.empresa_id === 'string' && u.empresa_id) return u.empresa_id;
    const cached = sessionStorage.getItem('empresa_id');
    if (cached) return cached;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return '';
    const { data } = await supabase.from('users').select('empresa_id').eq('id', uid).single();
    return data?.empresa_id || '';
}

import { FILIAL_TODAS_ID } from './filialConstants';

/** Filial ativa para relatórios RPC (null = consolidado / todas as unidades). */
export function resolveFilialIdForRelatorios(): string | null {
    if (typeof localStorage === 'undefined') return null;
    const id = (localStorage.getItem('apex_filial_id') || '').trim();
    if (!id || id === FILIAL_TODAS_ID) return null;
    return id;
}

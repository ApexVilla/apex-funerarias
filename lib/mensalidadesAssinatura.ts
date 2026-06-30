import { supabase } from './supabase';
import { dataHojeIsoLocal } from './contratoDatas';

const LOTE_MENSALIDADES = 12;
const MAX_LOTES_SINCRONIZACAO = 24;

const STATUS_EM_ABERTO = ['aberto', 'vencido', 'pago_parcial'] as const;

/** Último dia do mês corrente (YYYY-MM-DD) no fuso local. */
function fimMesAtualIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const mm = String(m + 1).padStart(2, '0');
    return `${y}-${mm}-${String(last).padStart(2, '0')}`;
}

async function contarParcelasEmAberto(assinaturaId: string): Promise<number> {
    const { count, error } = await supabase
        .from('fin_contas_receber')
        .select('*', { count: 'exact', head: true })
        .eq('assinatura_id', assinaturaId)
        .in('status', [...STATUS_EM_ABERTO])
        .is('deleted_at', null);
    if (error) throw error;
    return count ?? 0;
}

async function ultimoVencimentoAssinatura(assinaturaId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('fin_contas_receber')
        .select('data_vencimento')
        .eq('assinatura_id', assinaturaId)
        .eq('tipo_documento', 'mensalidade')
        .is('deleted_at', null)
        .order('data_vencimento', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    const iso = (data?.data_vencimento as string | undefined)?.slice(0, 10);
    return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** Parcelas geradas cobrem o mês atual (último vencimento >= fim do mês). */
export function parcelasCobremMesAtual(ultimoVencimentoIso: string | null): boolean {
    if (!ultimoVencimentoIso) return false;
    return ultimoVencimentoIso >= fimMesAtualIso();
}

/**
 * Gera lotes de 12 mensalidades enquanto não houver parcelas em aberto e o último
 * vencimento ainda não alcançou o mês atual (continuidade após baixa em massa).
 */
export async function sincronizarParcelasAssinatura(
    assinaturaId: string,
    gerarLote: (id: string, meses: number) => Promise<number>,
): Promise<number> {
    let totalGeradas = 0;

    for (let iter = 0; iter < MAX_LOTES_SINCRONIZACAO; iter++) {
        const emAberto = await contarParcelasEmAberto(assinaturaId);
        if (emAberto > 0) break;

        const ultimoVenc = await ultimoVencimentoAssinatura(assinaturaId);
        if (ultimoVenc && parcelasCobremMesAtual(ultimoVenc)) break;

        const geradas = await gerarLote(assinaturaId, LOTE_MENSALIDADES);
        if (geradas <= 0) break;
        totalGeradas += geradas;
    }

    return totalGeradas;
}

/** Sincroniza todas as assinaturas ativas do cliente (ex.: ao abrir Financeiro). */
export async function sincronizarParcelasCliente(
    clienteId: string,
    gerarLote: (assinaturaId: string, meses: number) => Promise<number>,
): Promise<number> {
    const { data: assinaturas, error } = await supabase
        .from('assinaturas')
        .select('id, status, em_inercia')
        .eq('cliente_id', clienteId)
        .is('deleted_at', null)
        .in('status', ['ativo', 'suspenso']);

    if (error) throw error;

    let total = 0;
    for (const a of assinaturas || []) {
        if ((a as { em_inercia?: boolean }).em_inercia) continue;
        total += await sincronizarParcelasAssinatura(a.id, gerarLote);
    }
    return total;
}

export { LOTE_MENSALIDADES, dataHojeIsoLocal };

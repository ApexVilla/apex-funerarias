import type { CaixaMovimento } from './CaixaStore';
import { normalizarDataIso } from './contratoDatas';

/** Dia civil em America/Sao_Paulo (alinhado ao SQL do caixa). */
export const dataCalendarioSp = (iso?: string | null): string => {
    if (!iso) return '';
    const trimmed = String(iso).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed) && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
        return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return normalizarDataIso(trimmed);
    return parsed.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
};

export const dataMovimentoEfetiva = (mov: CaixaMovimento) =>
    mov.data_movimentacao
        ? normalizarDataIso(mov.data_movimentacao)
        : dataCalendarioSp(mov.created_at);

export const dataIsoSessao = (sessao: { data_abertura?: string | null }) =>
    dataCalendarioSp(sessao.data_abertura);

/**
 * Movimento pertence ao dia civil da sessão na mesma conta bancária.
 * Usa `data_movimentacao` (data da baixa) — alinhado ao `fin_sync_baixas_caixa_sessao`.
 * Inclui lançamentos cuja sessão foi unificada (consolidação) desde que a data e a conta batam.
 */
export const movimentoPertenceSessao = (
    mov: CaixaMovimento,
    sessao: { id: string; data_abertura?: string | null; conta_bancaria_id?: string },
    contaIdPorSessao?: Map<string, string>,
): boolean => {
    if (dataMovimentoEfetiva(mov) !== dataIsoSessao(sessao)) return false;
    if (!sessao.conta_bancaria_id || !contaIdPorSessao) {
        return mov.sessao_id === sessao.id;
    }
    return contaIdPorSessao.get(mov.sessao_id) === sessao.conta_bancaria_id;
};

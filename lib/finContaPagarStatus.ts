import { dataHojeIsoLocal } from './contratoDatas';
import type { ContaPagar } from './FinanceiroStore';

const STATUS_CP_COM_SALDO = new Set(['aberto', 'aprovado', 'vencido', 'pago_parcial']);

type ContaPagarVencimento = Pick<ContaPagar, 'status' | 'data_vencimento' | 'valor_aberto_centavos'>;

/** Título a pagar com saldo em aberto e data de vencimento já passada. */
export function contaPagarEstaVencida(
    cp: ContaPagarVencimento,
    hojeIso: string = dataHojeIsoLocal(),
): boolean {
    const st = (cp.status || '').toLowerCase();
    if (!STATUS_CP_COM_SALDO.has(st)) return false;
    if ((cp.valor_aberto_centavos || 0) <= 0) return false;
    const venc = (cp.data_vencimento || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return false;
    return venc < hojeIso;
}

/** Status para exibição — aberto/aprovado vencidos viram "vencido" (paridade com Contas a Receber). */
export function contaPagarStatusEfetivo(
    cp: ContaPagarVencimento,
    hojeIso: string = dataHojeIsoLocal(),
): string {
    const st = cp.status || '';
    if (['aberto', 'aprovado'].includes(st) && contaPagarEstaVencida(cp, hojeIso)) {
        return 'vencido';
    }
    return st;
}

export function normalizarContasPagarStatus<T extends ContaPagarVencimento>(
    contas: T[],
    hojeIso: string = dataHojeIsoLocal(),
): T[] {
    return contas.map((cp) => ({
        ...cp,
        status: contaPagarStatusEfetivo(cp, hojeIso),
    }));
}

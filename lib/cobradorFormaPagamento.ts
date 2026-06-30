export type FormaPagamentoCobradorCampo =
    | 'dinheiro'
    | 'pix'
    | 'cartao_credito'
    | 'cartao_debito';

/** Compatibilidade com registros antigos "cartao" genérico. */
export function normalizarFormaPagamentoCobradorCampo(
    forma?: string | null,
): FormaPagamentoCobradorCampo {
    const f = String(forma || 'dinheiro')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');

    if (f === 'cartao_credito' || f === 'credito') return 'cartao_credito';
    if (f === 'cartao_debito' || f === 'debito') return 'cartao_debito';
    if (f === 'pix') return 'pix';
    if (f.startsWith('cartao') || f.includes('maquin')) return 'cartao_credito';
    return 'dinheiro';
}

export function formaPagamentoEhCartaoCobrador(forma: string): boolean {
    const f = normalizarFormaPagamentoCobradorCampo(forma);
    return f === 'cartao_credito' || f === 'cartao_debito';
}

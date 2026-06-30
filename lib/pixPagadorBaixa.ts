import type { BaixarContaReceberParams } from './FinanceiroStore';

export type PixPagadorState = {
    pixMesmoPagador: boolean;
    pixNomePagador: string;
};

export const pixPagadorStateInicial = (): PixPagadorState => ({
    pixMesmoPagador: true,
    pixNomePagador: '',
});

export function formaEhPix(tipoOuNome?: string | null): boolean {
    return String(tipoOuNome || '').toLowerCase().includes('pix');
}

export function pixPagadorParaBaixa(
    isPix: boolean,
    state: PixPagadorState,
): Pick<BaixarContaReceberParams, 'pix_mesmo_pagador' | 'pix_nome_pagador'> {
    if (!isPix) {
        return { pix_mesmo_pagador: undefined, pix_nome_pagador: undefined };
    }
    return {
        pix_mesmo_pagador: state.pixMesmoPagador,
        pix_nome_pagador: state.pixMesmoPagador ? undefined : state.pixNomePagador.trim() || undefined,
    };
}

export function validarPixPagador(isPix: boolean, state: PixPagadorState): string | null {
    if (!isPix) return null;
    if (!state.pixMesmoPagador && !state.pixNomePagador.trim()) {
        return 'Informe o nome do pagador conforme aparece no comprovante PIX.';
    }
    return null;
}

export function sufixoDescricaoPixExtrato(state: PixPagadorState): string {
    if (state.pixMesmoPagador || !state.pixNomePagador.trim()) return '';
    return ` — Pagador: ${state.pixNomePagador.trim()}`;
}

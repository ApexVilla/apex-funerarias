/** Chaves canônicas gravadas em `fin_caixa_movimentos.forma_pagamento` e usadas nos filtros. */
export type FormaPagamentoCaixa = 'especie' | 'pix' | 'cartao_credito' | 'cartao_debito' | 'cheque' | 'boleto';

/** Normaliza texto livre ou legado para uma chave canônica (string vazia = sem informação). */
export function normalizarFormaPagamento(forma?: string | null): FormaPagamentoCaixa | '' {
    const bruto = String(forma || '')
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (!bruto) return '';

    if (['dinheiro', 'especie'].includes(bruto)) return 'especie';
    if (['cartao_credito', 'credito', 'cartao credito'].includes(bruto)) return 'cartao_credito';
    if (['cartao_debito', 'debito', 'cartao debito'].includes(bruto)) return 'cartao_debito';
    if (['pix', 'pix_outros', 'pix outros'].includes(bruto)) return 'pix';
    if (bruto === 'cheque') return 'cheque';
    if (['boleto', 'duplicata', 'debito_automatico'].includes(bruto)) return 'boleto';

    return bruto as FormaPagamentoCaixa;
}

export function rotuloFormaPagamento(forma?: string | null): string {
    const n = normalizarFormaPagamento(forma);
    if (!n) return '—';
    const map: Record<FormaPagamentoCaixa, string> = {
        especie: 'Espécie',
        pix: 'PIX',
        cartao_credito: 'Cartão crédito',
        cartao_debito: 'Cartão débito',
        cheque: 'Cheque',
        boleto: 'Boleto',
    };
    return map[n] || String(forma || '').replace(/_/g, ' ');
}

/** Opções do select de lançamento manual (entrada/saída). */
export const OPCOES_FORMA_LANCAMENTO: { value: FormaPagamentoCaixa; label: string }[] = [
    { value: 'especie', label: 'Espécie' },
    { value: 'pix', label: 'PIX' },
    { value: 'cartao_credito', label: 'Cartão crédito' },
    { value: 'cartao_debito', label: 'Cartão débito' },
    { value: 'cheque', label: 'Cheque' },
];

export type ChaveFormaFechamento = 'especie' | 'cartao_credito' | 'cartao_debito' | 'cheque' | 'pix_outros';

/** Para conferência de fechamento (grid por forma). */
export function formaMovimentoParaChaveFechamento(formaBruta?: string | null): ChaveFormaFechamento {
    const bruto = String(formaBruta || '').toLowerCase().trim();
    if (bruto === 'dinheiro' || bruto === 'especie') return 'especie';
    if (bruto === 'cartao_credito' || bruto === 'credito') return 'cartao_credito';
    if (bruto === 'cartao_debito' || bruto === 'debito') return 'cartao_debito';
    if (bruto === 'cheque') return 'cheque';
    if (bruto === 'pix' || bruto === 'pix_outros') return 'pix_outros';
    if (bruto === 'boleto' || bruto === 'duplicata') return 'pix_outros';
    return 'especie';
}

type MovimentoFechamento = {
    tipo: string;
    valor_centavos: number | string;
    forma_pagamento?: string | null;
};

/** Conferência de fechamento: saldo por forma (abertura em espécie + movimentos). */
export function calcularSistemaPorFormaFechamento(
    saldoAberturaCentavos: number | string | null | undefined,
    movimentos: MovimentoFechamento[],
): Record<ChaveFormaFechamento, number> {
    const base: Record<ChaveFormaFechamento, number> = {
        especie: Number(saldoAberturaCentavos || 0),
        cartao_credito: 0,
        cartao_debito: 0,
        cheque: 0,
        pix_outros: 0,
    };
    movimentos.forEach((mov) => {
        const forma = formaMovimentoParaChaveFechamento(mov.forma_pagamento);
        const sinal = ['entrada', 'suprimento'].includes(mov.tipo) ? 1 : -1;
        base[forma] += sinal * Number(mov.valor_centavos || 0);
    });
    return base;
}

export function somaSistemaPorFormaFechamento(map: Record<ChaveFormaFechamento, number>): number {
    return (Object.values(map) as number[]).reduce((acc, v) => acc + Number(v || 0), 0);
}

/** Caixa físico (tipo `caixa`): saldo final considera só espécie + sangria/suprimento. Contas bancárias: todas as formas. */
export function contaSaldoFinalSomenteEspecie(tipo?: string | null): boolean {
    return (tipo || '').toLowerCase() === 'caixa';
}

export function calcularDeltaSaldoMovimentos(
    movimentos: {
        tipo: string;
        valor_centavos: number | string;
        descricao?: string | null;
        forma_pagamento?: string | null;
    }[],
): number {
    const entradasEstornadas = coletarDescricoesEntradasEstornadas(movimentos);
    const totais = movimentos.reduce(
        (acc, m) => {
            const mov = {
                ...m,
                valor_centavos: Number(m.valor_centavos || 0),
            };
            acumularRecebimentoResumoTesouraria(acc, mov, entradasEstornadas);
            acumularPagamentoResumoTesouraria(acc, mov);
            if (m.tipo === 'suprimento') acc.transfEntrada += Number(m.valor_centavos || 0);
            if (m.tipo === 'sangria') acc.transfSaida += Number(m.valor_centavos || 0);
            return acc;
        },
        { recebimentos: 0, pagamentos: 0, transfEntrada: 0, transfSaida: 0 },
    );
    return (
        totais.recebimentos +
        totais.transfEntrada -
        totais.pagamentos -
        totais.transfSaida
    );
}

export function calcularSaldoSessaoFromMovimentos(
    saldoAberturaCentavos: number | string | null | undefined,
    movimentos: {
        tipo: string;
        valor_centavos: number | string;
        descricao?: string | null;
        forma_pagamento?: string | null;
    }[],
    somenteEspecie: boolean,
): number {
    const base = Number(saldoAberturaCentavos || 0);
    if (somenteEspecie) {
        return calcularSaldoFisicoFromMovimentos(base, movimentos);
    }
    return base + calcularDeltaSaldoMovimentos(movimentos);
}

export function contagemFechamentoFromSistema(
    sistema: Record<ChaveFormaFechamento, number>,
    permiteSaldoNegativo: boolean,
): Record<ChaveFormaFechamento, string> {
    const fmt = (centavos: number) =>
        ((permiteSaldoNegativo ? centavos : Math.max(0, centavos)) / 100).toFixed(2);
    return {
        especie: fmt(sistema.especie),
        cartao_credito: fmt(sistema.cartao_credito),
        cartao_debito: fmt(sistema.cartao_debito),
        cheque: fmt(sistema.cheque),
        pix_outros: fmt(sistema.pix_outros),
    };
}

/** Saldo físico (espécie) de uma sessão: abertura + movimentos que impactam gaveta. */
export function calcularSaldoFisicoFromMovimentos(
    saldoAberturaCentavos: number | string | null | undefined,
    movimentos: { tipo: string; valor_centavos: number | string; forma_pagamento?: string | null }[],
): number {
    let saldo = Number(saldoAberturaCentavos || 0);
    movimentos.forEach((mov) => {
        if (!movimentoImpactaSaldoFisicoCaixa(mov)) return;
        const sinal = ['entrada', 'suprimento'].includes(mov.tipo) ? 1 : -1;
        saldo += sinal * Number(mov.valor_centavos || 0);
    });
    return saldo;
}

/** Entrada/saída em PIX/cartão/cheque não altera saldo físico em espécie; sangria/suprimento sempre alteram. */
export function movimentoImpactaSaldoFisicoCaixa(mov: {
    tipo: string;
    forma_pagamento?: string | null;
}): boolean {
    const forma =
        normalizarFormaPagamento(mov.forma_pagamento) ||
        String(mov.forma_pagamento || '').toLowerCase().trim();
    const naoImpactaEmEspecie = ['pix', 'cartao_credito', 'cartao_debito', 'credito', 'debito', 'cheque'].includes(forma);
    if (mov.tipo === 'entrada' || mov.tipo === 'saida') return !naoImpactaEmEspecie;
    return true;
}

export function movimentoEhSaidaEstornoRecebimento(mov: {
    tipo?: string | null;
    descricao?: string | null;
}): boolean {
    return mov.tipo === 'saida' && (mov.descricao || '').toLowerCase().includes('estorno de recebimento');
}

/** Descrições das entradas que já possuem saída de estorno no mesmo extrato. */
export function coletarDescricoesEntradasEstornadas(
    movimentos: { tipo?: string | null; descricao?: string | null }[],
): Set<string> {
    const estornadas = new Set<string>();
    for (const m of movimentos) {
        if (!movimentoEhSaidaEstornoRecebimento(m)) continue;
        const raw = String(m.descricao || '');
        const semPrefixo = raw.replace(/^estorno de recebimento:\s*/i, '');
        const base = semPrefixo.split(/\s*[—-]\s*Motivo:/i)[0]?.trim();
        if (base) estornadas.add(base);
    }
    return estornadas;
}

export function entradaCaixaJaEstornada(
    mov: { tipo?: string | null; descricao?: string | null },
    movimentos: { tipo?: string | null; descricao?: string | null }[],
): boolean {
    if (mov.tipo !== 'entrada') return false;
    const desc = (mov.descricao || '').trim();
    if (!desc) return false;
    return movimentos.some(
        (m) => movimentoEhSaidaEstornoRecebimento(m)
            && String(m.descricao || '').includes(desc),
    );
}

/** Colunas Recebimento/Pagamento da grade Tesouraria — líquido (estornos não inflam totais). */
export function acumularRecebimentoResumoTesouraria(
    acc: { recebimentos: number },
    mov: { tipo: string; valor_centavos: number; descricao?: string | null },
    entradasEstornadas?: Set<string>,
): void {
    if (mov.tipo !== 'entrada') return;
    if (entradasEstornadas?.has((mov.descricao || '').trim())) return;
    acc.recebimentos += mov.valor_centavos;
}

export function acumularPagamentoResumoTesouraria(
    acc: { pagamentos: number },
    mov: { tipo: string; valor_centavos: number; descricao?: string | null },
): void {
    if (mov.tipo !== 'saida') return;
    if (movimentoEhSaidaEstornoRecebimento(mov)) return;
    acc.pagamentos += mov.valor_centavos;
}

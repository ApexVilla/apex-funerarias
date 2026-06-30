/** Converte "236,00" / "1.234,56" / "236.00" para centavos inteiros. */
export function parseValorReaisParaCentavos(valor: string): number {
    const raw = (valor || '').trim();
    if (!raw) return 0;
    const normalized = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw;
    const n = Number.parseFloat(normalized);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
}

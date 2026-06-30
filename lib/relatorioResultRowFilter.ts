/** Colunas comuns quando o resultado vem “por departamento” / centro / setor. */
const DEPTO_COL_RE = /departamento|depto|nome_departamento|setor|centro_custo|centro_custo_nome|unidade/i;

export function findDepartamentoLikeColumn(row: Record<string, unknown> | null | undefined): string | null {
    if (!row) return null;
    const keys = Object.keys(row);
    const match = keys.find((k) => DEPTO_COL_RE.test(k));
    return match ?? null;
}

export function uniqueColumnValues(
    rows: Record<string, unknown>[],
    columnKey: string
): string[] {
    const s = new Set<string>();
    for (const r of rows) {
        const v = r[columnKey];
        if (v !== null && v !== undefined && String(v).trim() !== '') {
            s.add(String(v));
        }
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

import type { RelatorioConfig } from './RelatoriosStore';

export type ChartAccent = 'financeiro' | 'comercial' | 'estoque' | 'default';

export function getChartAccent(relatorio: RelatorioConfig): ChartAccent {
    if (relatorio.setor === 'financeiro' || relatorio.categoria === 'financeiro') return 'financeiro';
    if (relatorio.setor === 'comercial' || relatorio.categoria === 'comercial') return 'comercial';
    if (relatorio.categoria === 'estoque') return 'estoque';
    return 'default';
}

const DATE_KEY_RE = /^(data|dia|mes|periodo|referencia|competencia|data_|dt_|created_at|updated_at)/i;
const LABEL_KEY_RE = /(nome|descricao|departamento|centro|categoria|produto|item|cliente|vendedor|equipe|tipo|status|label|titulo)/i;

function isLikelyIdKey(key: string): boolean {
    return /_id$|(^id$)/i.test(key);
}

function getNumericValue(value: unknown): number | null {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value.replace(',', '.'));
        if (!Number.isNaN(n)) return n;
    }
    return null;
}

function isIsoDateString(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s));
}

function columnNumericScores(rows: Record<string, unknown>[], key: string): number {
    let ok = 0;
    const max = Math.min(rows.length, 30);
    for (let i = 0; i < max; i++) {
        const v = rows[i][key];
        if (getNumericValue(v) !== null) ok++;
    }
    return ok / max;
}

function pickLabelKey(keys: string[], rows: Record<string, unknown>[]): string | undefined {
    const candidates = keys.filter(
        (k) => !isLikelyIdKey(k) && LABEL_KEY_RE.test(k) && columnNumericScores(rows, k) < 0.3
    );
    if (candidates.length) return candidates[0];
    const fallback = keys.find(
        (k) =>
            !isLikelyIdKey(k) &&
            columnNumericScores(rows, k) < 0.4 &&
            typeof rows[0][k] === 'string'
    );
    return fallback;
}

function pickDateKey(keys: string[], rows: Record<string, unknown>[]): string | undefined {
    for (const k of keys) {
        if (!DATE_KEY_RE.test(k)) continue;
        let dates = 0;
        const max = Math.min(rows.length, 20);
        for (let i = 0; i < max; i++) {
            const v = rows[i][k];
            if (typeof v === 'string' && isIsoDateString(v)) dates++;
        }
        if (dates / max > 0.5) return k;
    }
    for (const k of keys) {
        let dates = 0;
        const max = Math.min(rows.length, 15);
        for (let i = 0; i < max; i++) {
            const v = rows[i][k];
            if (typeof v === 'string' && isIsoDateString(v)) dates++;
        }
        if (dates / max > 0.6) return k;
    }
    return undefined;
}

function pickNumericKeys(keys: string[], rows: Record<string, unknown>[]): string[] {
    return keys.filter((k) => columnNumericScores(rows, k) >= 0.5);
}

function keyLooksCurrency(key: string): boolean {
    return /valor|preco|total|saldo|receita|custo|entrada|saida|pagar|receber|centavos|brl|real/i.test(key);
}

export interface KpiItem {
    key: string;
    label: string;
    value: number;
    format: 'currency_centavos' | 'currency' | 'number';
}

export type PrimaryChart =
    | {
          kind: 'line';
          xKey: string;
          yKeys: string[];
          data: Record<string, unknown>[];
      }
    | {
          kind: 'bar';
          catKey: string;
          yKeys: string[];
          data: Record<string, unknown>[];
          horizontal: boolean;
      }
    | {
          kind: 'area_compare';
          xKey: string;
          yKeys: string[];
          data: Record<string, unknown>[];
      }
    | {
          kind: 'pie';
          nameKey: string;
          valueKey: string;
          data: Record<string, unknown>[];
      };

export interface RelatorioVisualizationPlan {
    showDashboard: boolean;
    placeholderMessage?: string;
    kpis: KpiItem[];
    primary: PrimaryChart | null;
}

function normalizeRows(dados: unknown): Record<string, unknown>[] | null {
    if (dados === null || dados === undefined) return null;
    if (Array.isArray(dados)) {
        return dados.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[];
    }
    if (typeof dados === 'object') {
        const o = dados as Record<string, unknown>;
        const nested = ['rows', 'data', 'items', 'resultado', 'registros'].find(
            (k) => Array.isArray(o[k]) && (o[k] as unknown[]).length && typeof (o[k] as unknown[])[0] === 'object'
        );
        if (nested) return normalizeRows(o[nested]);
        return [o];
    }
    return null;
}

export function buildVisualizationPlan(dados: unknown, relatorio: RelatorioConfig): RelatorioVisualizationPlan {
    const rows = normalizeRows(dados);
    if (!rows || rows.length === 0) {
        return { showDashboard: false, kpis: [], primary: null };
    }

    const keys = Object.keys(rows[0]).filter((k) => k !== '__proto__');
    if (keys.length === 0) {
        return { showDashboard: false, kpis: [], primary: null };
    }

    const onlyPlaceholder =
        keys.every((k) => ['mensagem', 'gerado_em', 'message'].includes(k)) &&
        rows.length === 1 &&
        typeof rows[0].mensagem === 'string';

    if (onlyPlaceholder) {
        return {
            showDashboard: false,
            placeholderMessage: String(rows[0].mensagem ?? ''),
            kpis: [],
            primary: null,
        };
    }

    const numericKeys = pickNumericKeys(keys, rows);
    const dateKey = pickDateKey(keys, rows);
    const labelKey = pickLabelKey(keys, rows);

    const kpis: KpiItem[] = [];
    if (rows.length === 1 && numericKeys.length >= 2) {
        for (const k of numericKeys.slice(0, 6)) {
            const v = getNumericValue(rows[0][k]);
            if (v === null) continue;
            kpis.push({
                key: k,
                label: k.replace(/_/g, ' '),
                value: v,
                format: k.includes('centavos') ? 'currency_centavos' : keyLooksCurrency(k) ? 'currency' : 'number',
            });
        }
    } else if (rows.length > 1 && numericKeys.length >= 1) {
        const take = Math.min(4, numericKeys.length);
        for (let i = 0; i < take; i++) {
            const k = numericKeys[i];
            let sum = 0;
            for (const r of rows) {
                const v = getNumericValue(r[k]);
                if (v !== null) sum += v;
            }
            kpis.push({
                key: k,
                label: `Σ ${k.replace(/_/g, ' ')}`,
                value: sum,
                format: k.includes('centavos') ? 'currency_centavos' : keyLooksCurrency(k) ? 'currency' : 'number',
            });
        }
    }

    let primary: PrimaryChart | null = null;

    if (dateKey && numericKeys.length >= 1) {
        const yKeys = numericKeys.filter((k) => k !== dateKey).slice(0, 4);
        if (yKeys.length === 2 && /entrada|saida|receita|despesa|credito|debito/i.test(yKeys.join(' '))) {
            primary = {
                kind: 'area_compare',
                xKey: dateKey,
                yKeys,
                data: [...rows].sort((a, b) => String(a[dateKey]).localeCompare(String(b[dateKey]))),
            };
        } else if (yKeys.length >= 1) {
            primary = {
                kind: 'line',
                xKey: dateKey,
                yKeys,
                data: [...rows].sort((a, b) => String(a[dateKey]).localeCompare(String(b[dateKey]))),
            };
        }
    } else if (labelKey && numericKeys.length >= 1) {
        const yKeys = numericKeys.filter((k) => k !== labelKey).slice(0, 4);
        const avgLen = rows.reduce((acc, r) => acc + String(r[labelKey] ?? '').length, 0) / rows.length;
        const horizontal = avgLen > 18 || rows.length > 10;
        if (yKeys.length >= 1) {
            let pieData = rows;
            if (rows.length > 12) {
                pieData = [...rows]
                    .map((r) => ({ ...r, __n: getNumericValue(r[yKeys[0]]) ?? 0 }))
                    .sort((a, b) => (b.__n as number) - (a.__n as number))
                    .slice(0, 10);
            }
            if (rows.length <= 12 && yKeys.length === 1) {
                primary = {
                    kind: 'pie',
                    nameKey: labelKey,
                    valueKey: yKeys[0],
                    data: pieData,
                };
            } else {
                primary = {
                    kind: 'bar',
                    catKey: labelKey,
                    yKeys,
                    data: rows.length > 20 ? pieData : rows,
                    horizontal,
                };
            }
        }
    } else if (numericKeys.length >= 2 && rows.length > 1) {
        const synthetic = rows.map((r, idx) => ({
            __idx: `#${idx + 1}`,
            ...Object.fromEntries(numericKeys.map((k) => [k, r[k]])),
        }));
        primary = {
            kind: 'bar',
            catKey: '__idx',
            yKeys: numericKeys.slice(0, 4),
            data: synthetic,
            horizontal: rows.length > 8,
        };
    }

    const showDashboard = kpis.length > 0 || primary !== null;

    return { showDashboard, kpis, primary, placeholderMessage: undefined };
}

export function formatKpiValue(item: KpiItem): string {
    if (item.format === 'currency_centavos') {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value / 100);
    }
    if (item.format === 'currency') {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value);
    }
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(item.value);
}

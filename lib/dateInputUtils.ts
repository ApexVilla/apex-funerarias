/** Converte ISO (yyyy-mm-dd) para exibição brasileira. */
export function isoToDisplayBr(iso: string | null | undefined): string {
    if (!iso) return '';
    const parte = String(iso).split('T')[0];
    const [y, m, d] = parte.split('-');
    if (!y || !m || !d) return '';
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/** Máscara enquanto digita: só números → dd/mm/aaaa */
export function maskDateBrInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Converte DD/MM/AAAA completo para ISO; retorna null se inválido ou incompleto. */
export function displayBrToIso(display: string): string | null {
    const trimmed = display.trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, ddStr, mmStr, yyyyStr] = match;
    const dd = Number(ddStr);
    const mm = Number(mmStr);
    const yyyy = Number(yyyyStr);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const iso = `${yyyyStr}-${mmStr.padStart(2, '0')}-${ddStr.padStart(2, '0')}`;
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== yyyy || date.getMonth() + 1 !== mm || date.getDate() !== dd) return null;
    return iso;
}

export function isoWithinRange(iso: string, min?: string, max?: string): boolean {
    if (!iso) return true;
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
}

/** Converte YYYY-MM para exibição MM/AAAA. */
export function ymToDisplayBr(ym: string | null | undefined): string {
    if (!ym) return '';
    const parte = String(ym).slice(0, 7);
    const [y, m] = parte.split('-');
    if (!y || !m) return '';
    return `${m.padStart(2, '0')}/${y}`;
}

/** Máscara enquanto digita competência: só números → mm/aaaa */
export function maskMonthYearInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Converte MM/AAAA completo para YYYY-MM; retorna null se inválido ou incompleto. */
export function displayBrYmToIso(display: string): string | null {
    const trimmed = display.trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, mmStr, yyyyStr] = match;
    const mm = Number(mmStr);
    const yyyy = Number(yyyyStr);
    if (mm < 1 || mm > 12 || yyyy < 1900 || yyyy > 2100) return null;
    return `${yyyyStr}-${mmStr.padStart(2, '0')}`;
}

/** Soma meses mantendo o dia (ajusta se o mês tiver menos dias). */
export function addMonthsIsoDate(baseIso: string, months: number): string {
    const [year, month, day] = baseIso.split('-').map(Number);
    const base = new Date(year, month - 1, day);
    const targetMonth = base.getMonth() + months;
    const firstDay = new Date(base.getFullYear(), targetMonth, 1);
    const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
    const safeDay = Math.min(day, lastDay);
    const target = new Date(firstDay.getFullYear(), firstDay.getMonth(), safeDay);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function addDaysIsoDate(baseIso: string, days: number): string {
    const d = new Date(`${baseIso}T12:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function minIsoDate(a: string, b: string): string {
    return a <= b ? a : b;
}

/** 1º vencimento em proposta nova: 30 dias após a data do contrato (cliente_desde ou hoje). */
export function primeiroVencimentoPropostaNovo(dataContratoIso: string): string {
    return addDaysIsoDate(dataContratoIso, 30);
}

/** @deprecated Use primeiroVencimentoPropostaNovo — mantido para compatibilidade. */
export function maxPrimeiroVencimentoProposta(hojeIso: string): string {
    return primeiroVencimentoPropostaNovo(hojeIso);
}

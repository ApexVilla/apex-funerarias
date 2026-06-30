const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Extrai YYYY-MM-DD sem interpretar fuso (evita dia 19 quando cadastrou dia 20). */
export function normalizarDataIso(valor?: string | null): string {
    if (!valor) return '';
    const m = String(valor).trim().match(ISO_DATE_RE);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Date local ao meio-dia para cálculos (não usar `new Date('YYYY-MM-DD')` puro). */
export function parseDataIsoLocal(iso?: string | null): Date | null {
    const ymd = normalizarDataIso(iso);
    if (!ymd) return null;
    const d = new Date(`${ymd}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD a partir de Date no fuso local (não use toISOString() para datas “só dia”). */
export function dataIsoLocalFromDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Formata data ISO (YYYY-MM-DD ou timestamp) em pt-BR sem deslocar um dia por fuso UTC. */
export function formatarDataIsoPtBr(iso?: string | null): string {
    if (!iso) return '—';
    const ymd = normalizarDataIso(iso);
    if (ymd) {
        const [, y, m, d] = ymd.match(ISO_DATE_RE) || [];
        if (y && m && d) return `${d}/${m}/${y}`;
    }
    const parsed = parseDataIsoLocal(iso);
    if (!parsed) return String(iso).trim() || '—';
    return parsed.toLocaleDateString('pt-BR');
}

/** Data de hoje no fuso local (YYYY-MM-DD). */
export function dataHojeIsoLocal(): string {
    return dataIsoLocalFromDate(new Date());
}

/** Carência padrão: 1ª mensalidade só após N dias da data do contrato/proposta. */
export const PRIMEIRO_VENCIMENTO_DIAS_APOS_CONTRATO = 30;

/** Soma dias em ISO local (sem deslocar fuso). */
export function adicionarDiasIsoLocal(baseIso: string, dias: number): string {
    const base = parseDataIsoLocal(baseIso);
    if (!base) return dataHojeIsoLocal();
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + dias);
    return dataIsoLocalFromDate(d);
}

/** Dia do mês (1–31) extraído de uma data ISO. */
export function extrairDiaVencimentoDeDataIso(iso?: string | null): number {
    const ymd = normalizarDataIso(iso);
    if (!ymd) return 5;
    const d = parseInt(ymd.slice(8, 10), 10);
    return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 5;
}

/** 1º vencimento = data do contrato + 30 dias (regra comercial Fênix). */
export function calcularPrimeiroVencimento30DiasApos(dataContratoIso: string): string {
    const ref = normalizarDataIso(dataContratoIso) || dataHojeIsoLocal();
    return adicionarDiasIsoLocal(ref, PRIMEIRO_VENCIMENTO_DIAS_APOS_CONTRATO);
}

/**
 * Dia local em que o contrato entrou no sistema (`created_at`) ou, se ausente,
 * a data de contratação (campo só-dia, sem deslocar por UTC).
 */
export function dataLocalFeitoContrato(
    createdAt?: string | null,
    dataContratacao?: string | null,
): string {
    if (createdAt) {
        const d = new Date(createdAt);
        if (!Number.isNaN(d.getTime())) return dataIsoLocalFromDate(d);
    }
    return normalizarDataIso(dataContratacao);
}

/**
 * Parcela vencida somente após o dia de vencimento (não no mesmo dia).
 */
export function parcelaEstaVencida(dataVencimentoIso: string, status?: string | null): boolean {
    const s = (status || '').toLowerCase();
    if (!['pendente', 'aberto', 'vencido'].includes(s)) return false;
    const venc = (dataVencimentoIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return false;
    return venc < dataHojeIsoLocal();
}

/**
 * Primeira data de vencimento (YYYY-MM-DD) a partir da data de início do contrato:
 * primeiro dia `diaVencimento` estritamente após a data de início (se contrato no dia 14 e venc. dia 14 → mês seguinte).
 */
export function calcularPrimeiroVencimentoDesde(dataReferenciaIso: string, diaVencimento: number): string {
    const ref = new Date(`${dataReferenciaIso}T12:00:00`);
    if (Number.isNaN(ref.getTime())) {
        return dataHojeIsoLocal();
    }
    const alvoDia = Math.max(1, Math.min(31, Math.floor(diaVencimento) || 5));

    const ymd = (y: number, m: number, d: number) => {
        const last = new Date(y, m + 1, 0).getDate();
        const day = Math.min(d, last);
        return new Date(y, m, day, 12, 0, 0, 0);
    };

    let y = ref.getFullYear();
    let m = ref.getMonth();
    let cand = ymd(y, m, alvoDia);
    if (cand <= ref) {
        m += 1;
        if (m > 11) {
            m = 0;
            y += 1;
        }
        cand = ymd(y, m, alvoDia);
    }
    return dataIsoLocalFromDate(cand);
}

/** Próximo vencimento mensal após uma data de vencimento (mesmo dia do mês da assinatura). */
export function avancarVencimentoMensal(dataVencimentoIso: string, diaVencimento: number): string {
    const base = parseDataIsoLocal(dataVencimentoIso);
    if (!base) return normalizarDataIso(dataVencimentoIso);
    const alvoDia = Math.max(1, Math.min(31, Math.floor(diaVencimento) || base.getDate()));
    let y = base.getFullYear();
    let m = base.getMonth() + 1;
    if (m > 11) {
        m = 0;
        y += 1;
    }
    const last = new Date(y, m + 1, 0).getDate();
    const day = Math.min(alvoDia, last);
    return dataIsoLocalFromDate(new Date(y, m, day, 12, 0, 0, 0));
}

/**
 * Última competência (vencimento) provavelmente quitada se o cliente pagou hoje / está em dia.
 * Usa o maior vencimento do dia fixo que não ultrapassa a data de referência.
 */
export function ultimoVencimentoCompetenciaProvavel(
    diaVencimento: number,
    refIso: string = dataHojeIsoLocal(),
): string {
    const ref = new Date(`${refIso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(ref.getTime())) return refIso.slice(0, 10);
    const alvoDia = Math.max(1, Math.min(31, Math.floor(diaVencimento) || 5));

    const ymd = (y: number, m: number) => {
        const last = new Date(y, m + 1, 0).getDate();
        const day = Math.min(alvoDia, last);
        return new Date(y, m, day, 12, 0, 0, 0);
    };

    let cand = ymd(ref.getFullYear(), ref.getMonth());
    if (cand > ref) {
        let m = ref.getMonth() - 1;
        let y = ref.getFullYear();
        if (m < 0) {
            m = 11;
            y -= 1;
        }
        cand = ymd(y, m);
    }
    return dataIsoLocalFromDate(cand);
}

/** Quantidade de mensalidades entre o 1º vencimento e a última paga (inclusive). */
export function contarMensalidadesAte(
    primeiroVencimentoIso: string,
    ateVencimentoIso: string,
    diaVencimento: number,
): number {
    if (!primeiroVencimentoIso || !ateVencimentoIso) return 0;
    if (ateVencimentoIso < primeiroVencimentoIso) return 0;
    let n = 0;
    let cur = primeiroVencimentoIso.slice(0, 10);
    const ate = ateVencimentoIso.slice(0, 10);
    const max = 600;
    while (cur <= ate && n < max) {
        n += 1;
        if (cur === ate) break;
        cur = avancarVencimentoMensal(cur, diaVencimento);
    }
    return n;
}

/** Contrato com início no passado exige informar até qual mensalidade já foi paga. */
export function contratoExigeHistoricoPagamentos(
    dataInicioIso: string,
    diaVencimento: number,
): boolean {
    const pv = calcularPrimeiroVencimentoDesde(dataInicioIso, diaVencimento);
    return pv < dataHojeIsoLocal();
}

/** Mesmo dia e mês (ignora ano). */
export function mesmoDiaMesIso(a?: string | null, b?: string | null): boolean {
    const da = normalizarDataIso(a);
    const db = normalizarDataIso(b);
    if (!da || !db) return false;
    return da.slice(5) === db.slice(5);
}

/**
 * Typo comum em migração: mesmo dia/mês que a referência, mas ano digitado como o atual
 * (ex.: entrada 17/03/2008 e início gravado como 17/03/2026).
 * Não acusa quando o início histórico é anterior à referência (ex.: entrada 2026, contrato 2007).
 */
export function detectarPossivelTypoAnoMigracao(
    dataReferencia?: string | null,
    dataInicio?: string | null,
    hoje: string = dataHojeIsoLocal(),
): boolean {
    const ref = normalizarDataIso(dataReferencia);
    const ini = normalizarDataIso(dataInicio);
    if (!ref || !ini || ref === ini) return false;
    if (!mesmoDiaMesIso(ref, ini)) return false;
    const anoRef = parseInt(ref.slice(0, 4), 10);
    const anoIni = parseInt(ini.slice(0, 4), 10);
    const anoAtual = parseInt(hoje.slice(0, 4), 10);
    return anoIni > anoRef && anoIni >= anoAtual - 1;
}

/** Corrige ano da data de início quando detectado typo de migração. */
export function corrigirPossivelTypoAnoMigracao(
    dataReferencia?: string | null,
    dataInicio?: string | null,
    hoje?: string,
): string {
    const ini = normalizarDataIso(dataInicio);
    const ref = normalizarDataIso(dataReferencia);
    if (!ini) return '';
    if (!ref || !detectarPossivelTypoAnoMigracao(ref, ini, hoje)) return ini;
    return `${ref.slice(0, 4)}${ini.slice(4)}`;
}

export function mensagemPossivelTypoAnoMigracao(
    dataReferencia?: string | null,
    dataInicio?: string | null,
): string | null {
    if (!detectarPossivelTypoAnoMigracao(dataReferencia, dataInicio)) return null;
    const ref = normalizarDataIso(dataReferencia)!;
    const ini = normalizarDataIso(dataInicio)!;
    return `A data de início (${formatarDataIsoPtBr(ini)}) parece ter o ano digitado errado. Para migração com entrada em ${formatarDataIsoPtBr(ref)}, confira se o ano histórico correto é ${ref.slice(0, 4)}.`;
}

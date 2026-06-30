import type { OfxTransaction } from './ofxParser';

/** Posições 1-based do manual CNAB 400 — Retorno — Registro Detalhe (Sicredi). */
const DET_OCORRENCIA_INI = 109;
const DET_OCORRENCIA_FIM = 110;
const DET_DATA_OCORRENCIA_INI = 111;
const DET_DATA_OCORRENCIA_FIM = 116;
const DET_SEU_NUMERO_INI = 117;
const DET_SEU_NUMERO_FIM = 126;
const DET_VALOR_PAGO_INI = 254;
const DET_VALOR_PAGO_FIM = 266;
const DET_SEQ_INI = 395;
const DET_SEQ_FIM = 400;

/**
 * Ocorrências de liquidação / recebimento efetivo (baixa automática).
 * Manual Sicredi 7.2 — prioriza liquidações explícitas.
 */
const OCORRENCIA_BAIXA_AUTOMATICA = new Set([
    '06', // Liquidação normal
    '15', // Liquidação em cartório
    '17', // Liquidação após baixa
]);

const slice1Based = (line: string, start: number, end: number): string => {
    if (line.length < end) return '';
    return line.slice(start - 1, end);
};

/** Converte DDMMAA (retorno) para ISO yyyy-mm-dd. Ano 00–69 → 2000+, 70–99 → 1900+. */
export const parseDataDDMMAA = (raw: string): string | null => {
    const s = raw.replace(/\D/g, '').trim();
    if (s.length !== 6) return null;
    const dd = s.slice(0, 2);
    const mm = s.slice(2, 4);
    const aa = parseInt(s.slice(4, 6), 10);
    const fullYear = aa >= 70 ? 1900 + aa : 2000 + aa;
    return `${fullYear}-${mm}-${dd}`;
};

/** Valor em centavos (13 dígitos sem separador). */
const parseValorCentavos13 = (raw: string): number => {
    const n = parseInt(raw.replace(/\D/g, '') || '0', 10);
    return Number.isFinite(n) ? n : 0;
};

export interface Cnab400RetornoParsed {
    formato: 'cnab400';
    transacoes: OfxTransaction[];
    linhasIgnoradas: number;
    /** Data de gravação do arquivo (header registro 0, pos. 95–102 AAAAMMDD). */
    dataArquivo?: string;
}

/**
 * Interpreta arquivo de retorno CNAB 400 Sicredi (.crt, .R01, etc.).
 * Somente registros detalhe tipo "1" com ocorrência de liquidação geram crédito para baixa.
 */
export const parseCnab400SicrediRetorno = (text: string): Cnab400RetornoParsed => {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const transacoes: OfxTransaction[] = [];
    let linhasIgnoradas = 0;

    let dataArquivo: string | undefined;
    const header = lines.find((l) => l[0] === '0' && l.length >= 102);
    if (header) {
        const rawData = header.slice(94, 102);
        if (/^\d{8}$/.test(rawData)) {
            dataArquivo = `${rawData.slice(0, 4)}-${rawData.slice(4, 6)}-${rawData.slice(6, 8)}`;
        }
    }

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        if (line.length < DET_VALOR_PAGO_FIM) {
            continue;
        }
        if (line[0] !== '1') {
            continue;
        }

        const ocorrencia = slice1Based(line, DET_OCORRENCIA_INI, DET_OCORRENCIA_FIM).trim().toUpperCase();
        if (!OCORRENCIA_BAIXA_AUTOMATICA.has(ocorrencia)) {
            linhasIgnoradas += 1;
            continue;
        }

        const dataOccRaw = slice1Based(line, DET_DATA_OCORRENCIA_INI, DET_DATA_OCORRENCIA_FIM);
        const dataLancamento = parseDataDDMMAA(dataOccRaw);
        if (!dataLancamento) {
            linhasIgnoradas += 1;
            continue;
        }

        const valorStr = slice1Based(line, DET_VALOR_PAGO_INI, DET_VALOR_PAGO_FIM);
        const valorCentavos = parseValorCentavos13(valorStr);
        if (valorCentavos <= 0) {
            linhasIgnoradas += 1;
            continue;
        }

        const seuNumero = slice1Based(line, DET_SEU_NUMERO_INI, DET_SEU_NUMERO_FIM).trim();
        const seq = slice1Based(line, DET_SEQ_INI, DET_SEQ_FIM).trim();
        const fitid = `CNAB-${seq || idx}-${idx}`;

        transacoes.push({
            fitid,
            tipo: 'credito',
            valorCentavos,
            dataLancamento,
            descricao: `Retorno Sicredi CNAB liquidação (${ocorrencia})${seuNumero ? ` • seu nº ${seuNumero}` : ''}`,
            memo: `Ocorrência ${ocorrencia}`,
            numeroReferencia: seuNumero ? seuNumero.replace(/^0+/, '') || seuNumero : undefined,
        });
    }

    return { formato: 'cnab400', transacoes, linhasIgnoradas, dataArquivo };
};

export const detectarFormatoImportacao = (text: string): 'ofx' | 'cnab400' => {
    const head = text.trimStart().slice(0, 200).toUpperCase();
    if (head.includes('OFXHEADER') || head.includes('<OFX')) {
        return 'ofx';
    }
    const linhas = text.split(/\r?\n/).filter((l) => l.length > 0);
    const primeira = linhas[0] || '';
    if (primeira.length >= 350 && primeira[0] === '0' && /RETORNO/i.test(primeira.slice(0, 120))) {
        return 'cnab400';
    }
    if (linhas.some((l) => l.length >= 350 && l[0] === '1')) {
        return 'cnab400';
    }
    return 'ofx';
};

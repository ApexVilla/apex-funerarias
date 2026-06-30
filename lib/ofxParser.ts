export interface OfxTransaction {
    fitid: string;
    tipo: 'credito' | 'debito';
    valorCentavos: number;
    dataLancamento: string;
    dataBalancete?: string;
    descricao: string;
    memo?: string;
    numeroReferencia?: string;
}

export interface OfxParsedData {
    inicio?: string;
    fim?: string;
    bancoId?: string;
    contaId?: string;
    transacoes: OfxTransaction[];
}

const getTagValue = (source: string, tag: string): string | undefined => {
    const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
    const match = source.match(regex);
    return match?.[1]?.trim();
};

const parseOfxDate = (value?: string): string | undefined => {
    if (!value || value.length < 8) return undefined;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 8) return undefined;
    const year = digits.slice(0, 4);
    const month = digits.slice(4, 6);
    const day = digits.slice(6, 8);
    return `${year}-${month}-${day}`;
};

const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const extrairReferenciaTitulo = (text: string): string | undefined => {
    if (!text) return undefined;
    const normalized = text.toUpperCase();
    const codePatterns = [
        /\bCR-[A-Z0-9-]+\b/,
        /\bCR[A-Z0-9-]{4,}\b/,
        /\bTIT[-\s]?[A-Z0-9-]+\b/,
    ];
    for (const pattern of codePatterns) {
        const found = normalized.match(pattern)?.[0];
        if (found) return found.replace(/\s+/g, '');
    }
    return undefined;
};

export const parseOfx = (raw: string): OfxParsedData => {
    const text = raw.replace(/\r/g, '\n');
    const inicio = parseOfxDate(getTagValue(text, 'DTSTART'));
    const fim = parseOfxDate(getTagValue(text, 'DTEND'));
    const bancoId = getTagValue(text, 'BANKID');
    const contaId = getTagValue(text, 'ACCTID');

    const blocks = Array.from(text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi));
    const transacoes: OfxTransaction[] = blocks
        .map((match) => {
            const block = match[1];
            const trnTypeRaw = (getTagValue(block, 'TRNTYPE') || '').toUpperCase();
            const amountRaw = getTagValue(block, 'TRNAMT') || '0';
            const amount = Number.parseFloat(amountRaw.replace(',', '.'));
            if (!Number.isFinite(amount) || amount === 0) return null;

            const explicitType: 'credito' | 'debito' | null =
                trnTypeRaw === 'CREDIT' || trnTypeRaw === 'DEP' ? 'credito'
                    : trnTypeRaw === 'DEBIT' || trnTypeRaw === 'PAYMENT' ? 'debito'
                        : null;
            const tipo = explicitType || (amount > 0 ? 'credito' : 'debito');

            const dataLancamento = parseOfxDate(getTagValue(block, 'DTPOSTED'));
            if (!dataLancamento) return null;

            const memo = normalizeSpace(getTagValue(block, 'MEMO') || '');
            const name = normalizeSpace(getTagValue(block, 'NAME') || '');
            const descricao = normalizeSpace([name, memo].filter(Boolean).join(' - ')) || 'Movimento OFX';
            const refRaw = normalizeSpace(
                getTagValue(block, 'CHECKNUM') ||
                getTagValue(block, 'REFNUM') ||
                getTagValue(block, 'DOCNUM') ||
                ''
            );
            const referencia = extrairReferenciaTitulo(`${refRaw} ${descricao}`);

            return {
                fitid: normalizeSpace(getTagValue(block, 'FITID') || `${dataLancamento}-${Math.abs(Math.round(amount * 100))}`),
                tipo,
                valorCentavos: Math.abs(Math.round(amount * 100)),
                dataLancamento,
                dataBalancete: parseOfxDate(getTagValue(block, 'DTUSER')) || undefined,
                descricao,
                memo: memo || undefined,
                numeroReferencia: referencia || (refRaw || undefined),
            } as OfxTransaction;
        })
        .filter((item): item is OfxTransaction => Boolean(item));

    return { inicio, fim, bancoId, contaId, transacoes };
};

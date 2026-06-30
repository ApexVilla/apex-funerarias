import { inferirNomeFilialPorAreaAtuacao } from './cobradorFilialInferencia';

/** Compara nomes de unidade/filial ignorando acentos e caixa. */
export function normalizarTextoUnidade(s: string): string {
    return (s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
}

/** True se o nome da filial corresponde ao token da unidade (ex.: "Catalão" ↔ "Catalão — GO"). */
export function filialCombinaUnidade(filialNome: string, tokenUnidade: string): boolean {
    const f = normalizarTextoUnidade(filialNome);
    const t = normalizarTextoUnidade(tokenUnidade);
    if (!t) return true;
    if (!f) return false;
    if (f === t) return true;
    // Nome da unidade dentro da filial (ex.: token "catalao" em "catalao go")
    if (t.length >= 4 && f.includes(t)) return true;
    // Filial curta dentro do token (ex.: filial "catalao", token longo) — evita match fraco
    if (f.length >= 4 && t.includes(f) && f.length >= Math.min(t.length, 6)) return true;
    return false;
}

export function idsFiliaisDaUnidadeOperacional(
    filiais: { id: string; nome: string }[],
    tokenUnidade: string,
): Set<string> {
    const ids = new Set<string>();
    if (!tokenUnidade.trim()) return ids;
    for (const f of filiais) {
        if (filialCombinaUnidade(f.nome, tokenUnidade)) ids.add(f.id);
    }
    return ids;
}

type CobradorUnidadeRow = {
    empresa_id?: string | null;
    filial_id?: string | null;
    area_atuacao?: string | null;
};

/**
 * Decide se o cobrador pertence à unidade operacional ativa.
 * @param filialIdFixo — filial escolhida no seletor (empresa única com várias filiais).
 * @param filialIdsUnidade — filiais que batem com o nome da empresa do grupo (ex.: Aparecida).
 */
export function cobradorPertenceUnidade(
    cobrador: CobradorUnidadeRow,
    filiais: { id: string; nome: string }[],
    opts: {
        filialIdFixo?: string;
        filialIdsUnidade?: Set<string>;
        tokenUnidade?: string;
        /** Empresa/unidade selecionada no topo — cobradores sem filial ficam visíveis nela. */
        empresaIdAtual?: string;
    },
): boolean {
    const { filialIdFixo, filialIdsUnidade, tokenUnidade, empresaIdAtual } = opts;
    const empresaAtual = (empresaIdAtual || '').trim();
    const empCobrador = (cobrador.empresa_id || '').trim();
    const fid = (cobrador.filial_id || '').trim();

    if (!fid && empresaAtual && empCobrador === empresaAtual) {
        return true;
    }

    if (filialIdFixo) {
        /** Cobrador sem filial fixa (todas as unidades) aparece em qualquer filial da empresa. */
        if (!fid) return true;
        return fid === filialIdFixo;
    }

    const token = (tokenUnidade || '').trim();
    if (!token && (!filialIdsUnidade || filialIdsUnidade.size === 0)) return true;

    if (fid) {
        if (filialIdsUnidade && filialIdsUnidade.size > 0) {
            if (filialIdsUnidade.has(fid)) return true;
            const nomeFilial = filiais.find((f) => f.id === fid)?.nome || '';
            return filialCombinaUnidade(nomeFilial, token);
        }
        const nomeFilial = filiais.find((f) => f.id === fid)?.nome || '';
        return filialCombinaUnidade(nomeFilial, token);
    }

    const area = (cobrador.area_atuacao || '').trim();
    if (token && area) {
        const a = normalizarTextoUnidade(area);
        const t = normalizarTextoUnidade(token);
        if (a.includes(t) || t.includes(a.split(/[—,-]/)[0]?.trim() || '')) return true;
    }

    const inferido = inferirNomeFilialPorAreaAtuacao(area, filiais);
    if (inferido) return filialCombinaUnidade(inferido, token);

    return false;
}

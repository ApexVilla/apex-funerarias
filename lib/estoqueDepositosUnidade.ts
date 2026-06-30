import { unidadeNomeCurto } from './contextoUnidadeLabels';

export type DepositoUnidade = {
    id: string;
    nome: string;
    filial_id: string | null;
    filial_nome?: string;
    empresa_id?: string;
    tipo?: string;
};

/** Chave estável por cidade/unidade (ex.: catalao, ipameri). */
export function chaveUnidadeDeposito(d: DepositoUnidade): string {
    const rotulo = (d.filial_nome || d.nome || '').trim();
    const curto = unidadeNomeCurto(rotulo);
    const norm = curto
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
    return norm || d.id;
}

function pontuacaoDeposito(d: DepositoUnidade): number {
    let s = 0;
    if (d.filial_id) s += 4;
    if (/dep[oó]sito\s+geral/i.test(d.nome) && !/legado/i.test(d.nome)) s += 3;
    if (!/legado/i.test(d.nome)) s += 2;
    return s;
}

/** Mantém um depósito por unidade; em empate prefere a empresa do contexto. */
export function deduplicarDepositosPorUnidade(
    depositos: DepositoUnidade[],
    empresaIdPreferida?: string,
): DepositoUnidade[] {
    const porUnidade = new Map<string, DepositoUnidade>();

    for (const d of depositos) {
        const chave = chaveUnidadeDeposito(d);
        const atual = porUnidade.get(chave);
        if (!atual) {
            porUnidade.set(chave, d);
            continue;
        }

        const prefAtual = empresaIdPreferida && atual.empresa_id === empresaIdPreferida;
        const prefNovo = empresaIdPreferida && d.empresa_id === empresaIdPreferida;
        if (prefNovo && !prefAtual) {
            porUnidade.set(chave, d);
            continue;
        }
        if (prefAtual && !prefNovo) continue;

        if (pontuacaoDeposito(d) > pontuacaoDeposito(atual)) {
            porUnidade.set(chave, d);
        }
    }

    return [...porUnidade.values()].sort((a, b) =>
        (a.filial_nome || a.nome).localeCompare(b.filial_nome || b.nome, 'pt-BR'),
    );
}

export function rotuloDepositoUnidade(d: DepositoUnidade): string {
    if (d.filial_nome) return unidadeNomeCurto(d.filial_nome);
    return d.nome;
}

/**
 * IDs de depósitos cuja soma compõe o saldo da unidade selecionada.
 * Inclui depósito "legado" da mesma empresa (saldo antigo antes da filialização).
 */
export function depositoIdsParaConsultaSaldo(
    depositoId: string,
    depositos: DepositoUnidade[],
): string[] {
    const sel = depositos.find((d) => d.id === depositoId);
    if (!sel) return depositoId ? [depositoId] : [];

    const chaveSel = chaveUnidadeDeposito(sel);
    const ids = new Set<string>([depositoId]);

    for (const d of depositos) {
        if (sel.empresa_id && d.empresa_id && d.empresa_id !== sel.empresa_id) continue;
        const mesmaUnidade = chaveUnidadeDeposito(d) === chaveSel;
        const legadoMesmaEmpresa =
            /legado/i.test(d.nome) && (!sel.empresa_id || d.empresa_id === sel.empresa_id);
        if (mesmaUnidade || legadoMesmaEmpresa) ids.add(d.id);
    }

    return [...ids];
}

export function deduplicarDepartamentosPorNome<T extends { id: string; nome: string }>(
    lista: T[],
): T[] {
    const porNome = new Map<string, T>();
    for (const item of lista) {
        const chave = item.nome.trim().toLowerCase();
        if (!porNome.has(chave)) porNome.set(chave, item);
    }
    return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

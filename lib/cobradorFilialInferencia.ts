/**
 * Quando `filial_id` ainda não existe no banco ou está vazio, tenta sugerir a unidade
 * cruzando o texto de `area_atuacao` com os nomes das filiais cadastradas (ex.: "Aparecida…").
 */
export function inferirNomeFilialPorAreaAtuacao(
    areaAtuacao: string,
    filiais: { nome: string }[],
): string {
    const area = (areaAtuacao || '').trim().toLowerCase();
    if (!area || filiais.length === 0) return '';

    const antesDoTraco = area.split('—')[0]?.trim() || area;
    const nucleo = antesDoTraco.split(',')[0]?.trim() || antesDoTraco;

    let melhor: { nome: string; score: number } | null = null;

    for (const f of filiais) {
        const nome = (f.nome || '').trim();
        if (nome.length < 3) continue;

        const nl = nome.toLowerCase();
        let score = 0;

        if (area.includes(nl)) score = Math.max(score, nl.length);

        if (nucleo.length >= 4 && nl.includes(nucleo)) score = Math.max(score, nucleo.length);

        const primeira = nl.split(/\s+/)[0] || '';
        if (primeira.length >= 4 && area.includes(primeira)) {
            score = Math.max(score, primeira.length);
        }

        if (score > 0 && (!melhor || score > melhor.score)) melhor = { nome, score };
    }

    return melhor?.nome || '';
}

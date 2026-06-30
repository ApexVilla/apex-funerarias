export type ProdutoEstoqueBusca = {
    id: string;
    codigo: string;
    nome: string;
    categoria?: string | null;
    codigo_barras?: string | null;
    marca?: string | null;
    estoque_atual?: number;
};

export function normalizarTextoBusca(s: string): string {
    return String(s || '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();
}

/** Texto único com todos os campos pesquisáveis do produto. */
export function textoBuscaProduto(p: ProdutoEstoqueBusca): string {
    return normalizarTextoBusca(
        [p.nome, p.codigo, p.categoria, p.codigo_barras, p.marca].filter(Boolean).join(' '),
    );
}

export function produtoCombinaBusca(p: ProdutoEstoqueBusca, termo: string): boolean {
    const t = normalizarTextoBusca(termo);
    if (!t) return true;

    const blob = textoBuscaProduto(p);
    if (blob.includes(t)) return true;

    const palavras = t.split(/\s+/).filter(Boolean);
    if (palavras.length > 1 && palavras.every((w) => blob.includes(w))) return true;

    const digitos = t.replace(/\D/g, '');
    if (digitos.length >= 2) {
        const cod = String(p.codigo || '').replace(/\D/g, '');
        const barras = String(p.codigo_barras || '').replace(/\D/g, '');
        if (cod.includes(digitos) || barras.includes(digitos)) return true;
    }

    return false;
}

export function ordenarProdutosParaBusca(
    lista: ProdutoEstoqueBusca[],
    termo: string,
    priorizarComEstoque?: boolean,
): ProdutoEstoqueBusca[] {
    const t = normalizarTextoBusca(termo);
    const comEstoque = (p: ProdutoEstoqueBusca) => Number(p.estoque_atual ?? 0) > 0;

    return [...lista].sort((a, b) => {
        if (priorizarComEstoque) {
            const ea = comEstoque(a) ? 1 : 0;
            const eb = comEstoque(b) ? 1 : 0;
            if (eb !== ea) return eb - ea;
        }
        if (t) {
            const na = normalizarTextoBusca(a.nome);
            const nb = normalizarTextoBusca(b.nome);
            const aStarts = na.startsWith(t) ? 1 : 0;
            const bStarts = nb.startsWith(t) ? 1 : 0;
            if (bStarts !== aStarts) return bStarts - aStarts;
        }
        return a.nome.localeCompare(b.nome, 'pt-BR');
    });
}

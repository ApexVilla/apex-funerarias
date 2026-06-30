/** Nome do cliente ou fornecedor para exibição na listagem de contas a receber. */
export function nomeExibicaoContaReceber(
    descricao?: string | null,
    clienteNome?: string | null,
): string {
    if (clienteNome?.trim()) return clienteNome.trim();
    const desc = String(descricao || '').trim();
    const forn = desc.match(/(?:•\s*)?Fornecedor:\s*(.+)$/i);
    if (forn?.[1]?.trim()) return forn[1].trim();
    const prefixo = desc.match(/^(.+?)\s*—\s*.+/);
    if (prefixo?.[1]?.trim() && desc.includes('—')) return prefixo[1].trim();
    return desc || 'Sem cliente/fornecedor';
}

/** Descrição do serviço/título, sem o sufixo de fornecedor. */
export function descricaoLimpaContaReceber(descricao?: string | null): string {
    const desc = String(descricao || '').trim();
    if (!desc) return '—';
    const semForn = desc.replace(/\s*•\s*Fornecedor:\s*.+$/i, '').trim();
    const semPrefixo = semForn.replace(/^(.+?)\s*—\s*(.+)$/, (_m, _nome, rest) => String(rest).trim());
    return semPrefixo || semForn || desc;
}

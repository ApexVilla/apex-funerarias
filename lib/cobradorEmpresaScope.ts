/**
 * Escopo de `empresa_id` para listar cobradores/carteira no grupo Fênix.
 * Cobradores podem estar gravados na matriz enquanto o filtro do topo é Catalão/Aparecida.
 */
export function empresaIdsConsultaCobradores(opts: {
    empresaIdsParaFiltro: string[];
    empresasDoGrupo: { id: string }[];
    visaoTodasEmpresasGrupo: boolean;
    multiEmpresa: boolean;
    tokenUnidadeGrupo: string;
}): string[] {
    const ids = (opts.empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
    if (opts.visaoTodasEmpresasGrupo) return ids;
    
    if ((opts.empresasDoGrupo || []).length > 0) {
        return [...new Set((opts.empresasDoGrupo || []).map((e) => e.id).filter(Boolean))];
    }
    return ids;
}

import { FILIAL_TODAS_ID } from './filialConstants';
import { normalizarTextoUnidade } from './cobradorUnidadeFiltro';

/** Cobrador cadastrado para atuar em qualquer filial (filial_id vazio no banco). */
export function cobradorFilialEhTodasUnidades(filialId?: string | null): boolean {
    const fid = (filialId || '').trim();
    return !fid || fid === FILIAL_TODAS_ID;
}

const ROTULO_TODAS_UNIDADES = 'Todas as unidades';

export function rotuloUnidadeOrigemCobrador(opts: {
    filialId?: string | null;
    filialNomePorId?: string;
    filialInferida?: string;
}): { rotulo: string; inferido: boolean; todasUnidades: boolean } {
    if (cobradorFilialEhTodasUnidades(opts.filialId)) {
        return { rotulo: ROTULO_TODAS_UNIDADES, inferido: false, todasUnidades: true };
    }
    const porId = (opts.filialNomePorId || '').trim();
    if (porId) {
        return { rotulo: porId, inferido: false, todasUnidades: false };
    }
    const inferida = (opts.filialInferida || '').trim();
    if (inferida) {
        return { rotulo: inferida, inferido: true, todasUnidades: false };
    }
    return { rotulo: '', inferido: false, todasUnidades: false };
}

/** Evita repetir “Todas as unidades” na linha “Atua em” quando já está na unidade de origem. */
export function rotuloAreaAtuacaoCobrador(
    areaAtuacao: string | null | undefined,
    todasUnidades: boolean,
): string {
    const a = (areaAtuacao || '').trim();
    if (!a || /^sem\s+área$/i.test(a)) return '';
    if (
        todasUnidades &&
        normalizarTextoUnidade(a) === normalizarTextoUnidade(ROTULO_TODAS_UNIDADES)
    ) {
        return 'Qualquer filial do grupo';
    }
    return a;
}

import { useMemo } from 'react';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';
import { FILIAL_TODAS_ID } from './filialConstants';
import { useFilial } from './FilialContext';
import { unidadeNomeCurto } from './contextoUnidadeLabels';
import { idsFiliaisDaUnidadeOperacional } from './cobradorUnidadeFiltro';

/**
 * Parâmetros de filtro por unidade/filial conforme o seletor do topo.
 * Usado em listagens (clientes, cobradores, etc.).
 */
export function useUnidadeOperacionalFiltro() {
    const {
        empresaIdEfetivo,
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        podeAlternarEmpresa,
        dataRevisionEmpresa,
    } = useEmpresaContextoAtivo();
    const { filialId, isTodasFiliais, dataRevision } = useFilial();

    const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;

    const empresaNomeAtual = useMemo(
        () => empresasDoGrupo.find((e) => e.id === empresaIdEfetivo)?.nome || '',
        [empresasDoGrupo, empresaIdEfetivo],
    );

    const tokenUnidadeGrupo = useMemo(() => {
        if (visaoTodasEmpresasGrupo) return '';
        return unidadeNomeCurto(empresaNomeAtual);
    }, [visaoTodasEmpresasGrupo, empresaNomeAtual]);

    const shouldFilterByFilialContext = useMemo(
        () =>
            !multiEmpresa &&
            Boolean(filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais),
        [multiEmpresa, filialId, isTodasFiliais],
    );

    const shouldFilterByUnidadeGrupo = useMemo(
        () => !visaoTodasEmpresasGrupo && Boolean(tokenUnidadeGrupo),
        [visaoTodasEmpresasGrupo, tokenUnidadeGrupo],
    );

    return {
        multiEmpresa,
        empresaNomeAtual,
        tokenUnidadeGrupo,
        shouldFilterByFilialContext,
        shouldFilterByUnidadeGrupo,
        filialId: shouldFilterByFilialContext ? filialId : undefined,
        filialIdsUnidadeFrom: idsFiliaisDaUnidadeOperacional,
        dataRevisionUnidade: dataRevisionEmpresa + dataRevision,
    };
}

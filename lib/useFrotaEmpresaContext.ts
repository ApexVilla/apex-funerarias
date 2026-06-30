import { useMemo } from 'react';
import { useEmpresaIdsOperacao } from './useEmpresaIdsOperacao';

/** Passado às funções em `frotaSupabase` para filtrar por uma ou várias empresas. */
export type FrotaEmpresaScopeOpts = { empresaIds: string[] };

/**
 * Contexto de empresa para módulo Frota.
 * Listagens respeitam a unidade do header; visão consolidada só com "Todas as unidades".
 */
export function useFrotaEmpresaContext() {
  const {
    empresaIdOperacao,
    empresaIdsFiltro,
    visaoConsolidada,
    empresasDoGrupo,
    dataRevisionEmpresa,
    loadingEmpresasGrupo,
    aguardandoContexto,
  } = useEmpresaIdsOperacao();

  const frotaOpts: FrotaEmpresaScopeOpts | undefined = useMemo(
    () => (empresaIdsFiltro.length > 0 ? { empresaIds: empresaIdsFiltro } : undefined),
    [empresaIdsFiltro],
  );

  return {
    empresaIdEfetivo: empresaIdOperacao,
    empresaIdsParaFiltro: empresaIdsFiltro,
    empresasDoGrupo,
    frotaVisaoGrupo: visaoConsolidada,
    dataRevisionEmpresa,
    frotaOpts,
    skipUntilGrupoCarrega: aguardandoContexto,
    loadingEmpresasGrupo,
  };
}

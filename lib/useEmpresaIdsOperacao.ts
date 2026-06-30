import { useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';
import { chaveFilialUnidadeOrigem, unidadeNomeCurto } from './contextoUnidadeLabels';
import { filialCombinaUnidade } from './cobradorUnidadeFiltro';

type EmpresaGrupoMin = { id: string; nome: string };

/**
 * Com seletor de filial (empresa única no header), a filial "Ipameri" etc. representa
 * a unidade do grupo — consulta pela empresa correta, não pela matriz Aparecida.
 */
export function resolveEmpresaIdsConsultaComFilial(
  empresaIdsBase: string[],
  opts: {
    empresasDoGrupo: EmpresaGrupoMin[];
    empresaIdEfetivo: string;
    filtrarPorFilial: boolean;
    filialNome: string;
  },
): string[] {
  const { empresasDoGrupo, empresaIdEfetivo, filtrarPorFilial, filialNome } = opts;
  if (!filtrarPorFilial || !filialNome.trim()) return empresaIdsBase;

  const chave = chaveFilialUnidadeOrigem(filialNome);
  if (!chave) return empresaIdsBase;

  if (chave === 'matriz') {
    const id = (empresaIdEfetivo || empresaIdsBase[0] || '').trim();
    return id ? [id] : empresaIdsBase;
  }

  const alvo = empresasDoGrupo.find(
    (e) => chaveFilialUnidadeOrigem(unidadeNomeCurto(e.nome)) === chave,
  );
  if (alvo?.id) return [alvo.id];

  const atual = empresasDoGrupo.find((e) => e.id === empresaIdEfetivo);
  if (atual && filialCombinaUnidade(filialNome, unidadeNomeCurto(atual.nome))) {
    return [empresaIdEfetivo];
  }

  /**
   * Empresa única no seletor (ex.: Fênix de Catalão com filiais Ipameri/Matriz/Aparecida).
   * A filial é subdivisão operacional — não há outro `empresa_id` para mapear.
   * Sem este fallback a consulta retornava `[]` e listagens (propostas, etc.) ficavam vazias.
   */
  if (empresaIdsBase.length === 1) {
    return empresaIdsBase;
  }

  return [];
}

/** Ids para consultas `.in('empresa_id', …)` conforme o seletor do topo (unidade ou visão consolidada). */
export function resolveEmpresaIdsConsulta(
  empresaIdFallback: string,
  contextIds?: string[] | null,
): string[] {
  const fromCtx = (contextIds || []).map((id) => id.trim()).filter(Boolean);
  if (fromCtx.length > 0) return [...new Set(fromCtx)];
  const id = (empresaIdFallback || '').trim();
  return id ? [id] : [];
}

/** Aplica filtro do seletor de unidade (`.eq` ou `.in` em `empresa_id`). */
export function filtrarQueryPorEmpresaIds(
  query: any,
  ids: string[],
): any {
  const clean = [...new Set(ids.map((id) => (id || '').trim()).filter(Boolean))];
  if (clean.length === 0) return query;
  if (clean.length === 1) return query.eq('empresa_id', clean[0]);
  return query.in('empresa_id', clean);
}

/**
 * Empresa ativa e ids para filtros — fonte única para listagens (estoque, frota, etc.).
 * Respeita unidade selecionada no header; só usa várias ids com "Todas as unidades".
 */
export function useEmpresaIdsOperacao() {
  const { user } = useAuth();
  const {
    empresaIdEfetivo,
    empresaIdsParaFiltro,
    visaoTodasEmpresasGrupo,
    empresasDoGrupo,
    dataRevisionEmpresa,
    loadingEmpresasGrupo,
  } = useEmpresaContextoAtivo();

  const empresaIdOperacao = (empresaIdEfetivo || user?.empresa_id || '').trim();

  const empresaIdsFiltro = useMemo(
    () => resolveEmpresaIdsConsulta(empresaIdOperacao, empresaIdsParaFiltro),
    [empresaIdOperacao, empresaIdsParaFiltro],
  );

  const visaoConsolidada = visaoTodasEmpresasGrupo && empresaIdsFiltro.length > 1;

  const empresaNomePorId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of empresasDoGrupo) m[e.id] = e.nome;
    return m;
  }, [empresasDoGrupo]);

  const labelContexto = useMemo(() => {
    if (visaoConsolidada) return 'Todas as unidades liberadas';
    const nome = empresaNomePorId[empresaIdOperacao] || '';
    return nome ? unidadeNomeCurto(nome) : 'Unidade';
  }, [visaoConsolidada, empresaNomePorId, empresaIdOperacao]);

  return {
    empresaIdOperacao,
    empresaIdsFiltro,
    visaoConsolidada,
    empresasDoGrupo,
    empresaNomePorId,
    labelContexto,
    dataRevisionEmpresa,
    loadingEmpresasGrupo,
    /** Enquanto o RPC do grupo ainda não definiu ids e não há fallback. */
    aguardandoContexto:
      loadingEmpresasGrupo && empresaIdsFiltro.length === 0 && !empresaIdOperacao,
  };
}

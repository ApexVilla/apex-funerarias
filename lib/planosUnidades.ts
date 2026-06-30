import type { PlanoCompleto } from './PlanosStore';
import { unidadeNomeCurto } from './contextoUnidadeLabels';

/** Chave para agrupar o mesmo plano cadastrado em mais de uma empresa do grupo. */
export function chaveAgrupamentoPlano(plano: Pick<PlanoCompleto, 'nome' | 'valor_mensal_centavos' | 'tipo' | 'categoria'>): string {
  const nome = (plano.nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const tipo = (plano.tipo || 'funerario').trim().toLowerCase();
  const cat = (plano.categoria || '').trim().toLowerCase();
  return `${nome}|${plano.valor_mensal_centavos}|${tipo}|${cat}`;
}

export function empresasVisiveisDoPlano(plano: PlanoCompleto): string[] {
  const fromJoin = (plano.empresas_visiveis || []).map((id) => id.trim()).filter(Boolean);
  if (fromJoin.length > 0) return [...new Set(fromJoin)];
  const legado = (plano.empresa_id || '').trim();
  return legado ? [legado] : [];
}

/** Plano aparece na unidade se estiver vinculado em planos_empresas ou no empresa_id legado. */
export function planoVisivelParaEmpresas(plano: PlanoCompleto, empresaIds: string[]): boolean {
  const filtro = new Set(empresaIds.map((id) => id.trim()).filter(Boolean));
  if (filtro.size === 0) return true;
  const visiveis = empresasVisiveisDoPlano(plano);
  return visiveis.some((id) => filtro.has(id));
}

export function filtrarPlanosPorUnidades(planos: PlanoCompleto[], empresaIds: string[]): PlanoCompleto[] {
  return planos.filter((p) => planoVisivelParaEmpresas(p, empresaIds));
}

export type PlanoListagem = PlanoCompleto & {
  /** Ids de todas as linhas agrupadas (visão consolidada). */
  ids_agrupados?: string[];
};

/**
 * Na visão "Todas as unidades", exibe uma vez cada plano lógico (ex.: Onix e Fênix),
 * mantendo referência aos ids duplicados no banco.
 */
export function agruparPlanosListagem(
  planos: PlanoCompleto[],
  visaoConsolidada: boolean,
): PlanoListagem[] {
  if (!visaoConsolidada || planos.length <= 1) {
    return planos.map((p) => ({ ...p, ids_agrupados: [p.id] }));
  }

  const grupos = new Map<string, PlanoCompleto[]>();
  for (const p of planos) {
    const k = chaveAgrupamentoPlano(p);
    const arr = grupos.get(k) || [];
    arr.push(p);
    grupos.set(k, arr);
  }

  const resultado: PlanoListagem[] = [];
  for (const grupo of grupos.values()) {
    const ordenado = [...grupo].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    const principal = ordenado[0];
    const empresasSet = new Set<string>();
    let totalClientes = 0;
    for (const item of ordenado) {
      for (const id of empresasVisiveisDoPlano(item)) empresasSet.add(id);
      totalClientes += item.clientes_ativos_qtd || 0;
    }
    resultado.push({
      ...principal,
      empresas_visiveis: [...empresasSet],
      ids_agrupados: ordenado.map((x) => x.id),
      clientes_ativos_qtd: totalClientes,
    });
  }

  return resultado.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function rotulosUnidadesPlano(
  plano: PlanoCompleto,
  empresaNomePorId: Record<string, string>,
): string[] {
  return empresasVisiveisDoPlano(plano).map((id) => {
    const nome = empresaNomePorId[id] || '';
    return nome ? unidadeNomeCurto(nome) : 'Unidade';
  });
}

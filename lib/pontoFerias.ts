import { supabase } from './supabase';
import { filtrarQueryPorEmpresaIds } from './useEmpresaIdsOperacao';

export type FeriasPeriodo = {
  data_inicio: string;
  data_fim: string;
  status: string;
};

const STATUS_FERIAS_VALIDOS = new Set(['agendada', 'gozo', 'concluida']);

export function isDiaFerias(dataISO: string, periodos?: ReadonlyArray<FeriasPeriodo>): boolean {
  if (!periodos || periodos.length === 0) return false;
  const dia = dataISO.slice(0, 10);
  return periodos.some((p) => {
    if (!STATUS_FERIAS_VALIDOS.has(p.status)) return false;
    const inicio = p.data_inicio.slice(0, 10);
    const fim = p.data_fim.slice(0, 10);
    return dia >= inicio && dia <= fim;
  });
}

export function feriasDoColaborador(
  colabId: string,
  feriasPorColaborador: Map<string, FeriasPeriodo[]>,
): ReadonlyArray<FeriasPeriodo> {
  return feriasPorColaborador.get(colabId) ?? [];
}

/** Carrega períodos de férias dos colaboradores que intersectam o intervalo informado. */
export async function montarFeriasPorColaborador(
  usuarioIds: string[],
  empresaIdsFiltro: string[],
  inicio: string,
  fim: string,
): Promise<Map<string, FeriasPeriodo[]>> {
  const ids = [...new Set(usuarioIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, FeriasPeriodo[]>();
  if (ids.length === 0) return out;

  let q = supabase
    .from('rh_ferias')
    .select('usuario_id, data_inicio, data_fim, status')
    .in('usuario_id', ids)
    .lte('data_inicio', fim)
    .gte('data_fim', inicio)
    .neq('status', 'cancelada');

  q = filtrarQueryPorEmpresaIds(q, empresaIdsFiltro);

  const { data, error } = await q;
  if (error) throw error;

  for (const row of data || []) {
    const uid = row.usuario_id as string;
    const lista = out.get(uid) || [];
    lista.push({
      data_inicio: String(row.data_inicio).slice(0, 10),
      data_fim: String(row.data_fim).slice(0, 10),
      status: String(row.status),
    });
    out.set(uid, lista);
  }

  return out;
}

export async function listarFeriasColaborador(
  usuarioId: string,
  empresaIdsFiltro: string[],
  inicio: string,
  fim: string,
): Promise<FeriasPeriodo[]> {
  const mapa = await montarFeriasPorColaborador([usuarioId], empresaIdsFiltro, inicio, fim);
  return [...(mapa.get(usuarioId) || [])];
}

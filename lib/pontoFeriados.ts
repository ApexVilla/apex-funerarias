import { supabase } from './supabase';
import { filialCombinaUnidade } from './cobradorUnidadeFiltro';
import { unidadeNomeCurto } from './contextoUnidadeLabels';
import type { ColaboradorPonto } from './pontoColaboradores';

export type PontoFeriadoRow = {
  id: string;
  empresa_id: string;
  filial_id: string;
  data: string;
  nome: string;
};

type FilialRow = { id: string; nome: string; empresa_id: string };

const EMPTY_FERIADOS = new Set<string>();

export function isDiaFeriado(dataISO: string, feriados?: ReadonlySet<string>): boolean {
  if (!feriados || feriados.size === 0) return false;
  return feriados.has(dataISO.slice(0, 10));
}

export function feriadosDoColaborador(
  colabId: string,
  feriadosPorColaborador: Map<string, Set<string>>,
): ReadonlySet<string> {
  return feriadosPorColaborador.get(colabId) ?? EMPTY_FERIADOS;
}

/** Filial operacional do colaborador (cobrador com filial_id ou inferência pela empresa). */
export function inferirFilialIdColaborador(
  colab: Pick<ColaboradorPonto, 'id' | 'empresa_id' | 'role'>,
  filiais: FilialRow[],
  cobradorFilialPorUsuario: Map<string, string>,
  empresaNomePorId: Record<string, string>,
): string | null {
  const uid = colab.id?.trim();
  if (!uid) return null;

  const filialCob = cobradorFilialPorUsuario.get(uid);
  if (filialCob) return filialCob;

  const empresaId = (colab.empresa_id || '').trim();
  if (!empresaId) return null;

  const filiaisEmpresa = filiais.filter((f) => f.empresa_id === empresaId);
  if (filiaisEmpresa.length === 0) return null;

  const token = unidadeNomeCurto(empresaNomePorId[empresaId] || '');
  if (token) {
    const matched = filiaisEmpresa.filter((f) => filialCombinaUnidade(f.nome, token));
    if (matched.length === 1) return matched[0].id;
    if (matched.length > 1) {
      const preferAparecida = matched.find((f) => /aparecida/i.test(f.nome));
      return (preferAparecida || matched[0]).id;
    }
  }

  if (filiaisEmpresa.length === 1) return filiaisEmpresa[0].id;

  return filiaisEmpresa[0]?.id ?? null;
}

export function montarFilialPorColaborador(
  colaboradores: ColaboradorPonto[],
  filiais: FilialRow[],
  cobradorFilialPorUsuario: Map<string, string>,
  empresaNomePorId: Record<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of colaboradores) {
    const filialId = inferirFilialIdColaborador(c, filiais, cobradorFilialPorUsuario, empresaNomePorId);
    if (filialId) out.set(c.id, filialId);
  }
  return out;
}

export async function carregarFiliaisEmpresas(empresaIds: string[]): Promise<FilialRow[]> {
  const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('filiais')
    .select('id, nome, empresa_id')
    .in('empresa_id', ids)
    .eq('ativo', true);
  if (error) throw error;
  return (data || []) as FilialRow[];
}

export async function carregarFilialCobradores(usuarioIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(usuarioIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from('cobradores')
    .select('usuario_id, filial_id')
    .in('usuario_id', ids)
    .eq('status', 'ativo')
    .not('filial_id', 'is', null);
  if (error) throw error;

  for (const row of data || []) {
    const uid = String((row as { usuario_id?: string }).usuario_id || '').trim();
    const fid = String((row as { filial_id?: string }).filial_id || '').trim();
    if (uid && fid) out.set(uid, fid);
  }
  return out;
}

export async function listarFeriadosPorFiliais(
  filialIds: string[],
  dataInicio: string,
  dataFim: string,
): Promise<Map<string, Set<string>>> {
  const ids = [...new Set(filialIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, Set<string>>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from('ponto_feriados')
    .select('filial_id, data')
    .in('filial_id', ids)
    .gte('data', dataInicio.slice(0, 10))
    .lte('data', dataFim.slice(0, 10));
  if (error) throw error;

  for (const row of data || []) {
    const filialId = String((row as { filial_id?: string }).filial_id || '').trim();
    const dataDia = String((row as { data?: string }).data || '').slice(0, 10);
    if (!filialId || !/^\d{4}-\d{2}-\d{2}$/.test(dataDia)) continue;
    if (!out.has(filialId)) out.set(filialId, new Set());
    out.get(filialId)!.add(dataDia);
  }
  return out;
}

/** Feriados da empresa aplicáveis à unidade do colaborador (fallback por nome da filial). */
export async function listarFeriadosColaborador(
  colab: Pick<ColaboradorPonto, 'id' | 'empresa_id' | 'role'>,
  filiais: FilialRow[],
  cobradorFilialPorUsuario: Map<string, string>,
  empresaNomePorId: Record<string, string>,
  dataInicio: string,
  dataFim: string,
): Promise<ReadonlySet<string>> {
  const filialId = inferirFilialIdColaborador(
    colab,
    filiais,
    cobradorFilialPorUsuario,
    empresaNomePorId,
  );
  const empresaId = (colab.empresa_id || '').trim();
  const token = unidadeNomeCurto(empresaNomePorId[empresaId] || '');

  const out = new Set<string>();

  if (filialId) {
    const porFilial = await listarFeriadosPorFiliais([filialId], dataInicio, dataFim);
    for (const d of porFilial.get(filialId) || []) out.add(d);
  }

  if (empresaId && token) {
    const { data, error } = await supabase
      .from('ponto_feriados')
      .select('data, filial_id, filiais!inner(nome)')
      .eq('empresa_id', empresaId)
      .gte('data', dataInicio.slice(0, 10))
      .lte('data', dataFim.slice(0, 10));
    if (!error && data) {
      for (const row of data) {
        const nomeFilial = String(
          (row as { filiais?: { nome?: string } }).filiais?.nome || '',
        );
        const dataDia = String((row as { data?: string }).data || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataDia)) continue;
        if (filialId && (row as { filial_id?: string }).filial_id === filialId) {
          out.add(dataDia);
          continue;
        }
        if (token && filialCombinaUnidade(nomeFilial, token)) {
          out.add(dataDia);
        }
      }
    }
  }

  return out;
}

type FeriadoEmpresaRow = {
  empresa_id?: string;
  filial_id?: string;
  data?: string;
  filiais?: { nome?: string } | { nome?: string }[] | null;
};

function nomeFilialFeriado(row: FeriadoEmpresaRow): string {
  const f = row.filiais;
  if (Array.isArray(f)) return String(f[0]?.nome || '');
  return String(f?.nome || '');
}

/** Mapa colaborador → datas de feriado (batch, Presença / espelho em lote). */
export async function montarFeriadosPorColaborador(
  colaboradores: ColaboradorPonto[],
  filiais: FilialRow[],
  cobradorFilialPorUsuario: Map<string, string>,
  empresaNomePorId: Record<string, string>,
  dataInicio: string,
  dataFim: string,
): Promise<Map<string, Set<string>>> {
  const filialMap = montarFilialPorColaborador(
    colaboradores,
    filiais,
    cobradorFilialPorUsuario,
    empresaNomePorId,
  );
  const empresaIds = [
    ...new Set(colaboradores.map((c) => (c.empresa_id || '').trim()).filter(Boolean)),
  ];
  const out = new Map<string, Set<string>>();
  for (const c of colaboradores) out.set(c.id, new Set());

  if (empresaIds.length === 0) return out;

  const { data, error } = await supabase
    .from('ponto_feriados')
    .select('empresa_id, filial_id, data, filiais!inner(nome)')
    .in('empresa_id', empresaIds)
    .gte('data', dataInicio.slice(0, 10))
    .lte('data', dataFim.slice(0, 10));
  if (error) throw error;

  for (const c of colaboradores) {
    const filialId = filialMap.get(c.id);
    const empresaId = (c.empresa_id || '').trim();
    const token = unidadeNomeCurto(empresaNomePorId[empresaId] || '');
    const set = out.get(c.id)!;

    for (const row of (data || []) as FeriadoEmpresaRow[]) {
      if ((row.empresa_id || '').trim() !== empresaId) continue;
      const dataDia = String(row.data || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataDia)) continue;

      if (filialId && row.filial_id === filialId) {
        set.add(dataDia);
        continue;
      }
      if (token && filialCombinaUnidade(nomeFilialFeriado(row), token)) {
        set.add(dataDia);
      }
    }
  }

  return out;
}

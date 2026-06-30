import { supabase } from './supabase';
import { buscarClienteIdsPorCodigoContrato, contratoCodigoMatch } from './buscaContrato';
import { normalizarBuscaTexto } from './buscaCliente';
import { normalizeSearchText, variantesBuscaAcento } from './textUtils';

export type ClienteBuscaRow = {
  id: string;
  nome: string;
  cpf: string | null;
  codigo: string | null;
  telefone_principal: string | null;
  celular: string | null;
  /** Primeiro contrato encontrado na busca (ex. CTR-000055). */
  contrato_codigo?: string | null;
};

async function buscarClientesPorCampos(
  empresaIds: string[],
  term: string,
  limit: number,
  incluirNomeBusca = true,
): Promise<ClienteBuscaRow[]> {
  const t = term.trim().replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  const digits = t.replace(/\D/g, '');
  const norm = normalizeSearchText(t);
  const orParts = new Set<string>();

  if (incluirNomeBusca && norm.length >= 2) {
    orParts.add(`nome_busca.ilike.%${norm}%`);
  }
  for (const variante of variantesBuscaAcento(t)) {
    orParts.add(`nome.ilike.%${variante}%`);
  }
  orParts.add(`codigo.ilike.%${t}%`);
  if (digits.length >= 3) {
    orParts.add(`cpf.ilike.%${digits}%`);
    orParts.add(`telefone_principal.ilike.%${digits}%`);
    orParts.add(`celular.ilike.%${digits}%`);
  } else {
    orParts.add(`telefone_principal.ilike.%${t}%`);
    orParts.add(`celular.ilike.%${t}%`);
  }

  let query = supabase
    .from('clientes')
    .select('id, nome, cpf, codigo, telefone_principal, celular')
    .is('deleted_at', null)
    .or([...orParts].join(','))
    .order('nome')
    .limit(limit);

  if (empresaIds.length === 1) {
    query = query.eq('empresa_id', empresaIds[0]);
  } else {
    query = query.in('empresa_id', empresaIds);
  }

  const { data, error } = await query;
  if (error) {
    if (incluirNomeBusca && /nome_busca/i.test(error.message || '')) {
      return buscarClientesPorCampos(empresaIds, term, limit, false);
    }
    throw error;
  }
  return (data || []) as ClienteBuscaRow[];
}

/** Busca clientes por nome, CPF, código, telefone ou número de contrato. */
export async function buscarClientesPorTermo(
  empresaIds: string[],
  term: string,
  limit = 50,
): Promise<ClienteBuscaRow[]> {
  const t = term.trim();
  if (!t || empresaIds.length === 0) return [];

  const [byCampos, byContrato] = await Promise.all([
    buscarClientesPorCampos(empresaIds, t, limit),
    buscarClienteIdsPorCodigoContrato(empresaIds, t),
  ]);

  const map = new Map<string, ClienteBuscaRow>();
  for (const c of byCampos) map.set(c.id, c);

  const missingIds = byContrato.clienteIds.filter((id) => !map.has(id));
  if (missingIds.length > 0) {
    let cq = supabase
      .from('clientes')
      .select('id, nome, cpf, codigo, telefone_principal, celular')
      .is('deleted_at', null)
      .in('id', missingIds.slice(0, limit));
    if (empresaIds.length === 1) cq = cq.eq('empresa_id', empresaIds[0]);
    else cq = cq.in('empresa_id', empresaIds);
    const { data, error } = await cq;
    if (error) throw error;
    for (const c of (data || []) as ClienteBuscaRow[]) map.set(c.id, c);
  }

  return Array.from(map.values())
    .map((c) => ({
      ...c,
      contrato_codigo: byContrato.codigosPorCliente.get(c.id)?.[0] || null,
    }))
    .filter((c) => {
      if (byCampos.some((b) => b.id === c.id)) return true;
      const codigos = byContrato.codigosPorCliente.get(c.id) || [];
      if (codigos.some((cod) => contratoCodigoMatch(cod, t))) return true;
      return normalizarBuscaTexto(c.nome || '').includes(normalizarBuscaTexto(t));
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
    .slice(0, limit);
}

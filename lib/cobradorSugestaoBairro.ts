import { supabase } from './supabase';
import { parseBairrosAtuacaoJsonb } from './cobradorBairrosAtuacao';
import { COBRADOR_ESCRITORIO_ID } from './cobradorEscritorio';

export type CobradorComBairros = {
  id: string;
  nome: string;
  bairros: string[];
};

/** Chave para comparar bairros (sem acento, maiúsculas). */
export function normalizarBairroChave(bairro: string): string {
  return (bairro || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function bairroCoincideComRota(rotaBairro: string, bairroCliente: string): boolean {
  const a = normalizarBairroChave(rotaBairro);
  const b = normalizarBairroChave(bairroCliente);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/** Bairro usado na cobrança (residencial ou endereço de cobrança). */
export function bairroCobrancaCliente(opts: {
  usaEnderecoResidencialCobranca?: boolean | null;
  enderecoBairro?: string | null;
  enderecoCobBairro?: string | null;
}): string {
  const usaRes = opts.usaEnderecoResidencialCobranca !== false;
  const cob = (opts.enderecoCobBairro || '').trim();
  const res = (opts.enderecoBairro || '').trim();
  return usaRes ? res : cob || res;
}

export function resolverCobradorSugeridoPorBairro(
  bairro: string,
  cobradores: CobradorComBairros[],
): CobradorComBairros | null {
  const alvo = normalizarBairroChave(bairro);
  if (!alvo || alvo === '—' || alvo === '-') return null;

  const matches = cobradores.filter((c) =>
    c.bairros.some((rb) => bairroCoincideComRota(rb, bairro)),
  );
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))[0];
}

export async function loadCobradoresComBairrosAtivos(
  empresaIds: string[],
): Promise<CobradorComBairros[]> {
  const ids = [...new Set(empresaIds.filter(Boolean))];
  if (ids.length === 0) return [];

  let q = supabase
    .from('cobradores')
    .select('id, nome, bairros_atuacao, status')
    .eq('status', 'ativo')
    .order('nome');
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data, error } = await q;
  if (error) {
    console.warn('[loadCobradoresComBairrosAtivos]', error.message);
    return [];
  }

  return (data || [])
    .filter((row) => row.id && row.id !== COBRADOR_ESCRITORIO_ID)
    .map((row) => ({
      id: String(row.id),
      nome: String(row.nome || 'Cobrador'),
      bairros: parseBairrosAtuacaoJsonb(row.bairros_atuacao),
    }))
    .filter((c) => c.bairros.length > 0);
}

export async function buscarCobradorSugeridoPorBairro(
  empresaIds: string[],
  bairro: string,
): Promise<CobradorComBairros | null> {
  const cobradores = await loadCobradoresComBairrosAtivos(empresaIds);
  return resolverCobradorSugeridoPorBairro(bairro, cobradores);
}

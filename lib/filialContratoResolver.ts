import { supabase } from './supabase';

function normalizarCidadeFilial(valor: string): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/** Resolve filial do contrato a partir da empresa e da cidade do cliente/proposta. */
export async function resolverFilialIdContrato(
  empresaId: string,
  cidadeReferencia?: string | null,
): Promise<string | null> {
  if (!empresaId) return null;

  const { data: filiais, error } = await supabase
    .from('filiais')
    .select('id, nome')
    .eq('empresa_id', empresaId)
    .order('nome');

  if (error || !filiais?.length) return null;

  const cidadeNorm = normalizarCidadeFilial(cidadeReferencia || '');
  if (cidadeNorm) {
    const porCidade = filiais.find((f) => {
      const fn = normalizarCidadeFilial(f.nome);
      return fn === cidadeNorm || fn.includes(cidadeNorm) || cidadeNorm.includes(fn);
    });
    if (porCidade) return porCidade.id;
  }

  const naoMatriz = filiais.find((f) => !/matriz/i.test(f.nome));
  return (naoMatriz || filiais[0]).id;
}

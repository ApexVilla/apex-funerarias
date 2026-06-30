import type { SupabaseClient } from '@supabase/supabase-js';

export interface DadosVendedorPropostaPdf {
  nome: string;
  telefone: string;
}

/** Nome e contato do vendedor original da proposta (nunca do responsável pela pós-venda). */
export async function resolverDadosVendedorPropostaPdf(
  supabase: SupabaseClient,
  vendedorId: string | null | undefined,
): Promise<DadosVendedorPropostaPdf> {
  const id = (vendedorId || '').trim();
  if (!id) {
    return { nome: '—', telefone: '' };
  }
  const { data } = await supabase
    .from('users')
    .select('nome, telefone')
    .eq('id', id)
    .maybeSingle();
  return {
    nome: data?.nome?.trim() || '—',
    telefone: data?.telefone?.trim() || '',
  };
}

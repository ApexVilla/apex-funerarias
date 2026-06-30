import { supabase } from './supabase';

export async function atualizarMeuPerfil(params: {
  nome?: string;
  telefone?: string | null;
  mustChangePassword?: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('fn_atualizar_meu_perfil', {
    p_nome: params.nome ?? null,
    p_telefone: params.telefone ?? null,
    p_must_change_password:
      params.mustChangePassword !== undefined ? params.mustChangePassword : null,
  });
  return { error: error?.message ?? null };
}

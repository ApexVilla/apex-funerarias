import { supabase } from './supabase';
import {
  erroColunaRolesExtraAusente,
  erroRpcRolesExtraAusente,
  marcarRolesExtraIndisponivel,
  supabaseSuportaRolesExtra,
} from './supabaseSchemaCaps';
import type { MotivoInativacao } from './usuarioInativacao';

export async function atualizarUsuarioGestor(params: {
  usuarioId: string;
  nome: string;
  telefone?: string | null;
  role: string;
  ativo: boolean;
  empresaId?: string | null;
  motivoInativacao?: MotivoInativacao | null;
  rolesExtra?: string[] | null;
}): Promise<{ error: string | null }> {
  const basePayload = {
    p_usuario_id: params.usuarioId,
    p_nome: params.nome.trim(),
    p_telefone: params.telefone ?? null,
    p_role: params.role,
    p_ativo: params.ativo,
    p_empresa_id: params.empresaId || null,
    p_motivo_inativacao: params.ativo ? null : (params.motivoInativacao || 'normal'),
  };

  const deveAtualizarExtras = params.rolesExtra !== undefined && params.rolesExtra !== null;

  const comExtras = await supabaseSuportaRolesExtra();
  if (comExtras) {
    const { error } = await supabase.rpc('fn_atualizar_usuario_gestor', {
      ...basePayload,
      p_roles_extra: params.rolesExtra ?? null,
    });
    if (!error) return { error: null };
    if (!deveAtualizarExtras && erroRpcRolesExtraAusente(error)) {
      marcarRolesExtraIndisponivel();
    } else {
      return { error: error.message ?? null };
    }
  }

  if (deveAtualizarExtras) {
    return {
      error:
        'Não foi possível atualizar os cargos adicionais deste colaborador. Recarregue a página e tente novamente.',
    };
  }

  const { error } = await supabase.rpc('fn_atualizar_usuario_gestor', basePayload);
  return { error: error?.message ?? null };
}

import { supabase } from './supabase';

let rolesExtraDisponivel: boolean | null = null;
let rolesExtraProbe: Promise<boolean> | null = null;

export function erroColunaRolesExtraAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return msg.includes('roles_extra') && (msg.includes('42703') || msg.includes('does not exist'));
}

export function erroRpcRolesExtraAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return (
    msg.includes('roles_extra') ||
    msg.includes('p_roles_extra') ||
    (msg.includes('function') && msg.includes('fn_atualizar_usuario_gestor'))
  );
}

/** Detecta se a coluna roles_extra está visível para o PostgREST (cache incluído). */
export async function supabaseSuportaRolesExtra(): Promise<boolean> {
  if (rolesExtraDisponivel !== null) return rolesExtraDisponivel;
  if (!rolesExtraProbe) {
    rolesExtraProbe = (async () => {
      const { error } = await supabase.from('users').select('roles_extra').limit(1);
      if (error && erroColunaRolesExtraAusente(error)) {
        rolesExtraDisponivel = false;
        return false;
      }
      rolesExtraDisponivel = !error;
      return rolesExtraDisponivel;
    })();
  }
  return rolesExtraProbe;
}

export function marcarRolesExtraIndisponivel(): void {
  rolesExtraDisponivel = false;
  rolesExtraProbe = Promise.resolve(false);
}

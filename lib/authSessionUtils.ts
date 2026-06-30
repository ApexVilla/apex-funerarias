import { supabase } from './supabase';

/** Erro do Supabase quando o refresh token sumiu ou foi revogado no servidor. */
export function isAuthRefreshTokenError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message || error || '').toLowerCase();
  return (
    msg.includes('refresh token not found') ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token revoked') ||
    msg.includes('session not found')
  );
}

/** Remove tokens locais inválidos sem depender do refresh no servidor. */
export function limparTokensAuthLocal(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.includes('auth')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

export async function encerrarSessaoInvalida(motivo?: string): Promise<void> {
  if (motivo) {
    try {
      sessionStorage.setItem('auth_session_expired_msg', motivo);
    } catch {
      /* ignore */
    }
  }
  limparTokensAuthLocal();
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

export function consumirAvisoSessaoExpirada(): string | null {
  try {
    const msg = sessionStorage.getItem('auth_session_expired_msg');
    if (msg) sessionStorage.removeItem('auth_session_expired_msg');
    return msg;
  } catch {
    return null;
  }
}

import { supabase } from './supabase';

/** Id do usuário logado (sessão Supabase ou storage local). */
export async function resolveCurrentUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;
  } catch {
    /* ignore */
  }
  try {
    const fromUserId = sessionStorage.getItem('userId');
    if (fromUserId) return fromUserId;
    const u = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (u?.id) return u.id;
  } catch {
    /* ignore */
  }
  return null;
}

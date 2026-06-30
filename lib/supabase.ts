import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias no .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    /** localStorage persiste ao recarregar a aba; sessionStorage apagava e gerava “sem sessão”. */
    storage: window.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    /** HashRouter usa `#/rota` — detectSessionInUrl conflita e pode limpar a sessão. */
    detectSessionInUrl: false,
  },
});

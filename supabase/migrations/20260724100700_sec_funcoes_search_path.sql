-- Hardening de seguranca (Fase 1.8)
-- Funcoes SECURITY DEFINER sem search_path fixo permitem search_path hijack
-- (um usuario cria objetos em schema no search_path para sequestrar chamadas).
-- Fixa search_path = public nas funcoes SECURITY DEFINER que ainda estavam
-- mutaveis (apontadas pelo advisor function_search_path_mutable).
--
-- ROLLBACK: ALTER FUNCTION ... RESET search_path;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = true
      AND COALESCE(array_to_string(p.proconfig, ','), '') NOT ILIKE '%search_path%'
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public;', r.proname, r.args);
  END LOOP;
END $$;

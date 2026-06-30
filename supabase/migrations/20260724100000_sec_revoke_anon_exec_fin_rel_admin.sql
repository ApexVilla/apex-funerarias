-- Hardening de seguranca (Fase 1.1)
-- Remove a capacidade do role `anon` (e de PUBLIC) de executar funcoes
-- financeiras (fin_*), de relatorio (rel_*), dashboard e admin_create_user.
-- A anon key fica embutida no bundle do frontend, entao qualquer pessoa
-- poderia invocar essas RPCs sem autenticacao. O unico fluxo anonimo
-- legitimo (assinatura de contrato por token) NAO usa essas funcoes.
--
-- Mantem o acesso do role `authenticated` (a aplicacao depende dele).
-- Idempotente: pode ser reaplicada com seguranca.
--
-- ROLLBACK (nao recomendado):
--   Reconceder com: GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO anon;
--   (equivalente a trocar os REVOKE FROM anon por GRANT TO anon abaixo)

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        p.proname LIKE 'fin\_%' ESCAPE '\'
        OR p.proname LIKE 'rel\_%' ESCAPE '\'
        OR p.proname = 'fn_dashboard_empresa'
        OR p.proname = 'admin_create_user'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC;', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated;', r.proname, r.args);
  END LOOP;
END $$;

-- Hardening de seguranca (Fase 1.7)
-- (a) Materialized views agregam dados de TODAS as empresas e estavam
--     legiveis por anon/authenticated (RLS nao se aplica a matviews),
--     permitindo vazamento de KPIs financeiros entre tenants. Elas sao
--     consumidas apenas por funcoes SECURITY DEFINER (que rodam como owner),
--     entao revogamos SELECT de anon/authenticated/PUBLIC.
-- (b) Views SECURITY DEFINER (view_clientes_completo, crm_whatsapp_contatos_view,
--     view_relatorios_disponiveis) ignoravam o RLS do usuario que consulta.
--     Passam a usar security_invoker = true, respeitando o RLS por tenant das
--     tabelas base. O frontend ja consulta como authenticated.
--
-- ROLLBACK: re-GRANT SELECT ... TO authenticated nas matviews e
--           ALTER VIEW ... SET (security_invoker = false).

-- (a) Matviews ---------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'm'
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC;', r.relname);
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon;', r.relname);
    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated;', r.relname);
  END LOOP;
END $$;

-- (b) Views: respeitar RLS do usuario ----------------------------------------
ALTER VIEW public.view_clientes_completo SET (security_invoker = true);
ALTER VIEW public.crm_whatsapp_contatos_view SET (security_invoker = true);
ALTER VIEW public.view_relatorios_disponiveis SET (security_invoker = true);

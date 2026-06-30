-- Hardening de seguranca (Fase 1.4)
-- Habilita RLS em tabelas publicas que estavam sem RLS (apontadas pelos
-- advisors do Supabase como rls_disabled_in_public):
--   - empresa_grupos: catalogo de grupos economicos. SELECT restrito ao
--     grupo do proprio usuario (helper auth_grupo_empresa_id_do_utilizador).
--   - propostas_venda_sequencia / propostas_venda_sequencia_grupo: contadores
--     internos acessados SOMENTE via funcoes SECURITY DEFINER
--     (propostas_venda_proximo_sequencial / _reservar_sequencial /
--      _sync_sequencia_contadores), que rodam como owner e ignoram RLS.
--     Por isso habilitamos RLS sem policies para clientes (anon/authenticated),
--     bloqueando acesso direto e mantendo o fluxo de propostas funcionando.
--
-- ROLLBACK: ALTER TABLE ... DISABLE ROW LEVEL SECURITY; DROP POLICY ...

-- empresa_grupos --------------------------------------------------------------
ALTER TABLE public.empresa_grupos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empresa_grupos_select_meu_grupo ON public.empresa_grupos;
CREATE POLICY empresa_grupos_select_meu_grupo ON public.empresa_grupos
  FOR SELECT TO authenticated
  USING (id = public.auth_grupo_empresa_id_do_utilizador());

-- propostas_venda_sequencia ---------------------------------------------------
ALTER TABLE public.propostas_venda_sequencia ENABLE ROW LEVEL SECURITY;

-- propostas_venda_sequencia_grupo ---------------------------------------------
ALTER TABLE public.propostas_venda_sequencia_grupo ENABLE ROW LEVEL SECURITY;

-- Hardening de seguranca (Fase 1.2)
-- As tabelas fin_caixa_sessoes e fin_caixa_movimentos tinham uma policy
-- "Allow all" (USING true / WITH CHECK true) aplicada a TODOS os roles,
-- o que efetivamente desliga o RLS e permite vazamento de caixa entre
-- empresas. Substitui por policies com escopo de tenant usando o helper
-- existente rls_empresa_ou_do_mesmo_grupo(empresa_id), restritas a
-- usuarios autenticados. Ambas as tabelas possuem coluna empresa_id.
--
-- O backend PHP (CaixaController) acessa via conexao de servico (PDO),
-- que ignora RLS, entao a geracao de PDF nao e afetada.
--
-- ROLLBACK:
--   DROP as policies *_select/_insert/_update/_delete e recriar
--   CREATE POLICY "Allow all for fin_caixa_movimentos" ON ... USING (true) WITH CHECK (true);

-- fin_caixa_sessoes -----------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for fin_caixa_sessoes" ON public.fin_caixa_sessoes;
DROP POLICY IF EXISTS fin_caixa_sessoes_select ON public.fin_caixa_sessoes;
DROP POLICY IF EXISTS fin_caixa_sessoes_insert ON public.fin_caixa_sessoes;
DROP POLICY IF EXISTS fin_caixa_sessoes_update ON public.fin_caixa_sessoes;
DROP POLICY IF EXISTS fin_caixa_sessoes_delete ON public.fin_caixa_sessoes;

CREATE POLICY fin_caixa_sessoes_select ON public.fin_caixa_sessoes
  FOR SELECT TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY fin_caixa_sessoes_insert ON public.fin_caixa_sessoes
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY fin_caixa_sessoes_update ON public.fin_caixa_sessoes
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY fin_caixa_sessoes_delete ON public.fin_caixa_sessoes
  FOR DELETE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

-- fin_caixa_movimentos --------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for fin_caixa_movimentos" ON public.fin_caixa_movimentos;
DROP POLICY IF EXISTS fin_caixa_movimentos_select ON public.fin_caixa_movimentos;
DROP POLICY IF EXISTS fin_caixa_movimentos_insert ON public.fin_caixa_movimentos;
DROP POLICY IF EXISTS fin_caixa_movimentos_update ON public.fin_caixa_movimentos;
DROP POLICY IF EXISTS fin_caixa_movimentos_delete ON public.fin_caixa_movimentos;

CREATE POLICY fin_caixa_movimentos_select ON public.fin_caixa_movimentos
  FOR SELECT TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY fin_caixa_movimentos_insert ON public.fin_caixa_movimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY fin_caixa_movimentos_update ON public.fin_caixa_movimentos
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY fin_caixa_movimentos_delete ON public.fin_caixa_movimentos
  FOR DELETE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

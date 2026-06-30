-- Restrição: vendedor (ou perfis sem rotina de contratos) não pode criar/alterar/excluir contratos.
-- A geração de contrato acontece no fluxo "Propostas -> Contrato" pela equipe autorizada.

DROP POLICY IF EXISTS assinaturas_empresa_isolation ON public.assinaturas;

-- SELECT continua liberado para usuários ativos do mesmo CNPJ / grupo econômico.
DROP POLICY IF EXISTS assinaturas_select_empresa_isolation ON public.assinaturas;
CREATE POLICY assinaturas_select_empresa_isolation ON public.assinaturas
  FOR SELECT TO authenticated
  USING (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  );

-- INSERT/UPDATE/DELETE somente para perfis que conseguem gerar contratos
-- (mesma lógica usada para "ver/confirmar propostas de todos").
DROP POLICY IF EXISTS assinaturas_insert_staff_only ON public.assinaturas;
CREATE POLICY assinaturas_insert_staff_only ON public.assinaturas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_pode_ver_todas_propostas_venda()
  );

DROP POLICY IF EXISTS assinaturas_update_staff_only ON public.assinaturas;
CREATE POLICY assinaturas_update_staff_only ON public.assinaturas
  FOR UPDATE TO authenticated
  USING (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_pode_ver_todas_propostas_venda()
  )
  WITH CHECK (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_pode_ver_todas_propostas_venda()
  );

DROP POLICY IF EXISTS assinaturas_delete_staff_only ON public.assinaturas;
CREATE POLICY assinaturas_delete_staff_only ON public.assinaturas
  FOR DELETE TO authenticated
  USING (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_pode_ver_todas_propostas_venda()
  );


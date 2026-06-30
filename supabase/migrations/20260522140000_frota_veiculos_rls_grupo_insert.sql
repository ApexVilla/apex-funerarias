-- frota_veiculos: faltavam políticas de INSERT/UPDATE/DELETE (só existia SELECT).
-- Alinha ao padrão de frota_motoristas / frota_viagens (rls_empresa_ou_do_mesmo_grupo).

DROP POLICY IF EXISTS frota_veiculos_staff_select_grupo ON public.frota_veiculos;
DROP POLICY IF EXISTS frota_veiculos_admins_manage_grupo ON public.frota_veiculos;
DROP POLICY IF EXISTS frota_veiculos_rls_grupo_select ON public.frota_veiculos;
DROP POLICY IF EXISTS frota_veiculos_rls_grupo_insert ON public.frota_veiculos;
DROP POLICY IF EXISTS frota_veiculos_rls_grupo_update ON public.frota_veiculos;
DROP POLICY IF EXISTS frota_veiculos_rls_grupo_delete ON public.frota_veiculos;

CREATE POLICY frota_veiculos_rls_grupo_select ON public.frota_veiculos
  FOR SELECT TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_veiculos_rls_grupo_insert ON public.frota_veiculos
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_veiculos_rls_grupo_update ON public.frota_veiculos
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY frota_veiculos_rls_grupo_delete ON public.frota_veiculos
  FOR DELETE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

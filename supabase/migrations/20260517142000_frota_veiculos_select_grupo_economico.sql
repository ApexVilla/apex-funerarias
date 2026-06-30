-- Gestão do grupo (admin / admin_empresa / admin_sistema / diretoria): SELECT em veículos
-- de qualquer empresa do mesmo grupo econômico. Demais perfis: só a empresa do usuário.

DROP POLICY IF EXISTS frota_veiculos_select ON public.frota_veiculos;

CREATE POLICY frota_veiculos_select ON public.frota_veiculos
  FOR SELECT TO authenticated
  USING (
    empresa_id = public.current_empresa_id()
    OR (
      public.current_user_pode_ver_grupo_economico()
      AND public.auth_empresa_no_mesmo_grupo_economico(empresa_id)
    )
  );

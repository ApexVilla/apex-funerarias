-- Frota: alinhar RLS ao grupo econômico.
-- Isso permite visualizar motoristas, veículos e outras tabelas de frota
-- ao usar o filtro "Todas as Unidades" no sistema.

-- 1. frota_motoristas
DROP POLICY IF EXISTS "Staff can read frota_motoristas" ON public.frota_motoristas;
DROP POLICY IF EXISTS "Admins can manage frota_motoristas" ON public.frota_motoristas;
DROP POLICY IF EXISTS frota_motoristas_staff_select_grupo ON public.frota_motoristas;
DROP POLICY IF EXISTS frota_motoristas_admins_manage_grupo ON public.frota_motoristas;

CREATE POLICY frota_motoristas_staff_select_grupo
  ON public.frota_motoristas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(frota_motoristas.empresa_id)
  );

CREATE POLICY frota_motoristas_admins_manage_grupo
  ON public.frota_motoristas
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(frota_motoristas.empresa_id)
  );

-- 2. frota_veiculos
DROP POLICY IF EXISTS "Staff can read frota_veiculos" ON public.frota_veiculos;
DROP POLICY IF EXISTS "Admins can manage frota_veiculos" ON public.frota_veiculos;
DROP POLICY IF EXISTS frota_veiculos_staff_select_grupo ON public.frota_veiculos;
DROP POLICY IF EXISTS frota_veiculos_admins_manage_grupo ON public.frota_veiculos;

CREATE POLICY frota_veiculos_staff_select_grupo
  ON public.frota_veiculos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(frota_veiculos.empresa_id)
  );

CREATE POLICY frota_veiculos_admins_manage_grupo
  ON public.frota_veiculos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(frota_veiculos.empresa_id)
  );

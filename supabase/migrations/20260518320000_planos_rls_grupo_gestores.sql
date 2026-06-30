-- Planos: visão do grupo econômico + perfis de gestão (supervisão, diretoria).
-- Corrige políticas legadas que usavam apenas current_empresa_id().

CREATE OR REPLACE FUNCTION public.current_user_pode_gerenciar_planos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_role_in(ARRAY[
    'admin_sistema',
    'admin_empresa',
    'admin',
    'diretoria',
    'gerente',
    'gestor',
    'super_admin',
    'supervisao'
  ]::text[]);
$$;

REVOKE ALL ON FUNCTION public.current_user_pode_gerenciar_planos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_gerenciar_planos() TO authenticated;

DROP POLICY IF EXISTS planos_select_empresa ON public.planos;
CREATE POLICY planos_select_empresa ON public.planos
    FOR SELECT
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS planos_insert_empresa ON public.planos;
CREATE POLICY planos_insert_empresa ON public.planos
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_pode_gerenciar_planos()
    );

DROP POLICY IF EXISTS planos_update_empresa ON public.planos;
CREATE POLICY planos_update_empresa ON public.planos
    FOR UPDATE
    TO authenticated
    USING (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_pode_gerenciar_planos()
    )
    WITH CHECK (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_pode_gerenciar_planos()
    );

DROP POLICY IF EXISTS planos_delete_empresa ON public.planos;
CREATE POLICY planos_delete_empresa ON public.planos
    FOR DELETE
    TO authenticated
    USING (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_pode_gerenciar_planos()
    );

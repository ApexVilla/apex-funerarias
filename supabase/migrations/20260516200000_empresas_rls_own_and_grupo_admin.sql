-- RLS em public.empresas: SELECT/UPDATE da própria empresa ou, para perfis de gestão do grupo,
-- das empresas do mesmo grupo econômico. Políticas refinadas em 20260516210000_grupo_visao_gestores_empresas_users.sql.

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empresas_authenticated_select_own_or_grupo_admin ON public.empresas;
CREATE POLICY empresas_authenticated_select_own_or_grupo_admin
ON public.empresas
FOR SELECT
TO authenticated
USING (
    id = public.current_empresa_id()
    OR (
        lower(nullif(trim(public.current_user_role()), '')) = 'admin_sistema'
        AND empresas.grupo_empresa_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.empresas e_me
            WHERE e_me.id = public.current_empresa_id()
              AND e_me.grupo_empresa_id IS NOT NULL
              AND e_me.grupo_empresa_id = empresas.grupo_empresa_id
        )
    )
);

DROP POLICY IF EXISTS empresas_authenticated_update_own_or_grupo_admin ON public.empresas;
CREATE POLICY empresas_authenticated_update_own_or_grupo_admin
ON public.empresas
FOR UPDATE
TO authenticated
USING (
    id = public.current_empresa_id()
    OR (
        lower(nullif(trim(public.current_user_role()), '')) = 'admin_sistema'
        AND empresas.grupo_empresa_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.empresas e_me
            WHERE e_me.id = public.current_empresa_id()
              AND e_me.grupo_empresa_id IS NOT NULL
              AND e_me.grupo_empresa_id = empresas.grupo_empresa_id
        )
    )
)
WITH CHECK (
    id = public.current_empresa_id()
    OR (
        lower(nullif(trim(public.current_user_role()), '')) = 'admin_sistema'
        AND empresas.grupo_empresa_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.empresas e_me
            WHERE e_me.id = public.current_empresa_id()
              AND e_me.grupo_empresa_id IS NOT NULL
              AND e_me.grupo_empresa_id = empresas.grupo_empresa_id
        )
    )
);

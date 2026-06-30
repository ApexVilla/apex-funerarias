-- planos + categorias_planos + beneficios: grupo econômico (Fênix multi-CNPJ).

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
        AND (
            get_current_user_role() = ANY (
                ARRAY[
                    'admin'::text,
                    'admin_empresa'::text,
                    'admin_sistema'::text,
                    'gerente'::text,
                    'gestor'::text,
                    'super_admin'::text
                ]
            )
        )
    );

DROP POLICY IF EXISTS planos_update_empresa ON public.planos;
CREATE POLICY planos_update_empresa ON public.planos
    FOR UPDATE
    TO authenticated
    USING (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND (
            get_current_user_role() = ANY (
                ARRAY[
                    'admin'::text,
                    'admin_empresa'::text,
                    'admin_sistema'::text,
                    'gerente'::text,
                    'gestor'::text,
                    'super_admin'::text
                ]
            )
        )
    )
    WITH CHECK (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND (
            get_current_user_role() = ANY (
                ARRAY[
                    'admin'::text,
                    'admin_empresa'::text,
                    'admin_sistema'::text,
                    'gerente'::text,
                    'gestor'::text,
                    'super_admin'::text
                ]
            )
        )
    );

DROP POLICY IF EXISTS planos_delete_empresa ON public.planos;
CREATE POLICY planos_delete_empresa ON public.planos
    FOR DELETE
    TO authenticated
    USING (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND (
            get_current_user_role() = ANY (
                ARRAY[
                    'admin'::text,
                    'admin_empresa'::text,
                    'admin_sistema'::text,
                    'gerente'::text,
                    'gestor'::text,
                    'super_admin'::text
                ]
            )
        )
    );

DROP POLICY IF EXISTS categorias_planos_select_empresa ON public.categorias_planos;
CREATE POLICY categorias_planos_select_empresa ON public.categorias_planos
    FOR SELECT
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS categorias_planos_insert_empresa ON public.categorias_planos;
CREATE POLICY categorias_planos_insert_empresa ON public.categorias_planos
    FOR INSERT
    TO authenticated
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS categorias_planos_update_empresa ON public.categorias_planos;
CREATE POLICY categorias_planos_update_empresa ON public.categorias_planos
    FOR UPDATE
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS categorias_planos_delete_empresa ON public.categorias_planos;
CREATE POLICY categorias_planos_delete_empresa ON public.categorias_planos
    FOR DELETE
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS beneficios_select_empresa ON public.beneficios;
CREATE POLICY beneficios_select_empresa ON public.beneficios
    FOR SELECT
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS beneficios_insert_empresa ON public.beneficios;
CREATE POLICY beneficios_insert_empresa ON public.beneficios
    FOR INSERT
    TO authenticated
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS beneficios_update_empresa ON public.beneficios;
CREATE POLICY beneficios_update_empresa ON public.beneficios
    FOR UPDATE
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS beneficios_delete_empresa ON public.beneficios;
CREATE POLICY beneficios_delete_empresa ON public.beneficios
    FOR DELETE
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

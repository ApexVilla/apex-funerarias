-- planos_beneficios + planos_historico: grupo econômico.

DROP POLICY IF EXISTS planos_beneficios_select_empresa ON public.planos_beneficios;
CREATE POLICY planos_beneficios_select_empresa ON public.planos_beneficios
    FOR SELECT
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS planos_beneficios_insert_empresa ON public.planos_beneficios;
CREATE POLICY planos_beneficios_insert_empresa ON public.planos_beneficios
    FOR INSERT
    TO authenticated
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS planos_beneficios_update_empresa ON public.planos_beneficios;
CREATE POLICY planos_beneficios_update_empresa ON public.planos_beneficios
    FOR UPDATE
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS planos_beneficios_delete_empresa ON public.planos_beneficios;
CREATE POLICY planos_beneficios_delete_empresa ON public.planos_beneficios
    FOR DELETE
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS planos_historico_select_empresa ON public.planos_historico;
CREATE POLICY planos_historico_select_empresa ON public.planos_historico
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.planos p
            WHERE p.id = planos_historico.plano_id
              AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
        )
    );

DROP POLICY IF EXISTS planos_historico_insert_empresa ON public.planos_historico;
CREATE POLICY planos_historico_insert_empresa ON public.planos_historico
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.planos p
            WHERE p.id = planos_historico.plano_id
              AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
        )
    );

DROP POLICY IF EXISTS planos_historico_update_empresa ON public.planos_historico;
CREATE POLICY planos_historico_update_empresa ON public.planos_historico
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.planos p
            WHERE p.id = planos_historico.plano_id
              AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.planos p
            WHERE p.id = planos_historico.plano_id
              AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
        )
    );

DROP POLICY IF EXISTS planos_historico_delete_empresa ON public.planos_historico;
CREATE POLICY planos_historico_delete_empresa ON public.planos_historico
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.planos p
            WHERE p.id = planos_historico.plano_id
              AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
        )
    );

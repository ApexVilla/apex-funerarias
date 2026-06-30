-- Timeline: mesma regra de clientes/contratos — grupo econômico pode ler eventos de outras unidades.
-- Antes: empresa_id = get_user_empresa_id() ocultava timeline/auditoria ao ver cliente de outra filial do grupo.

DROP POLICY IF EXISTS timeline_empresa_isolation ON public.timeline_clientes;

CREATE POLICY timeline_empresa_isolation ON public.timeline_clientes
    FOR ALL
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

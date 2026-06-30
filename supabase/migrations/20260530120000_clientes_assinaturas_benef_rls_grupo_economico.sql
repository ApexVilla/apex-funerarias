-- Clientes / contratos / dependentes: mesma empresa OU mesmo grupo econômico (ex.: Matriz ↔ Catalão).
-- Antes: empresa_id = get_user_empresa_id() bloqueava leitura ao filtrar outra CNPJ do grupo no app.

DROP POLICY IF EXISTS clients_empresa_isolation ON public.clientes;
CREATE POLICY clients_empresa_isolation ON public.clientes
    FOR ALL
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS assinaturas_empresa_isolation ON public.assinaturas;
CREATE POLICY assinaturas_empresa_isolation ON public.assinaturas
    FOR ALL
    TO authenticated
    USING (public.is_active_user() AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
    WITH CHECK (public.is_active_user() AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS beneficiarios_empresa_isolation ON public.beneficiarios;
CREATE POLICY beneficiarios_empresa_isolation ON public.beneficiarios
    FOR ALL
    TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
    WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

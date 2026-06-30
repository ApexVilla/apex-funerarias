-- Migration to add 'rh' to ponto_registros RLS policies

DROP POLICY IF EXISTS select_ponto_registros ON public.ponto_registros;
CREATE POLICY select_ponto_registros ON public.ponto_registros
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_role() IN (
            'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
            'gerente', 'supervisao', 'gestor', 'diretoria', 'financeiro', 'rh'
        )
    )
);

DROP POLICY IF EXISTS update_ponto_registros ON public.ponto_registros;
CREATE POLICY update_ponto_registros ON public.ponto_registros
FOR UPDATE
TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
    )
)
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
    )
);

DROP POLICY IF EXISTS delete_ponto_registros ON public.ponto_registros;
CREATE POLICY delete_ponto_registros ON public.ponto_registros
FOR DELETE
TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
    )
);

DROP POLICY IF EXISTS insert_ponto_registros ON public.ponto_registros;
CREATE POLICY insert_ponto_registros ON public.ponto_registros
FOR INSERT
TO authenticated
WITH CHECK (
  (
    user_id = auth.uid()
    AND origem = 'app'
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  )
  OR (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND origem = 'ajuste_manual'
    AND public.current_user_role() IN (
      'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
      'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
    )
  )
);

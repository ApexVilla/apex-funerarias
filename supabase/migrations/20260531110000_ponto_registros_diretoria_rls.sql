-- Diretoria e financeiro podem consultar batidas da empresa (espelho de ponto).
DROP POLICY IF EXISTS select_ponto_registros ON public.ponto_registros;
CREATE POLICY select_ponto_registros ON public.ponto_registros
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR (
        empresa_id = public.current_empresa_id()
        AND public.current_user_role() IN (
            'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
            'gerente', 'supervisao', 'gestor', 'diretoria', 'financeiro'
        )
    )
);

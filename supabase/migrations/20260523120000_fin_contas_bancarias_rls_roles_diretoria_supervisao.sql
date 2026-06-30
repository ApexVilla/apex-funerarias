-- Contas bancárias / caixa: alinhar roles da policy de escrita ao FinanceiroStore (ROLES_COM_GESTAO_CONTAS_BANCARIAS).
-- Faltavam diretoria e supervisao na policy fin_contas_bancarias_admins_manage_grupo, gerando
-- "new row violates row-level security" para quem o app já autoriza a cadastrar conta.

DROP POLICY IF EXISTS fin_contas_bancarias_admins_manage_grupo ON public.fin_contas_bancarias;

CREATE POLICY fin_contas_bancarias_admins_manage_grupo
  ON public.fin_contas_bancarias
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND lower(nullif(trim(u.role::text), '')) = ANY (
          ARRAY[
            'admin',
            'gerente',
            'admin_empresa',
            'administrador_geral',
            'super_admin',
            'gestor',
            'admin_sistema',
            'financeiro',
            'diretoria',
            'supervisao'
          ]::text[]
        )
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_bancarias.empresa_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND lower(nullif(trim(u.role::text), '')) = ANY (
          ARRAY[
            'admin',
            'gerente',
            'admin_empresa',
            'administrador_geral',
            'super_admin',
            'gestor',
            'admin_sistema',
            'financeiro',
            'diretoria',
            'supervisao'
          ]::text[]
        )
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_bancarias.empresa_id)
  );

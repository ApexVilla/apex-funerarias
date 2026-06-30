-- Contas bancárias: alinhar RLS ao grupo econômico (mesma ideia de estoque/fornecedores).
-- Antes, INSERT/SELECT exigiam users.empresa_id = fin_contas_bancarias.empresa_id,
-- o que impedia cadastro e listagem ao alternar unidade no header (empresa efetiva ≠ empresa do cadastro do usuário).

DROP POLICY IF EXISTS "Staff can read contas_bancarias" ON public.fin_contas_bancarias;
DROP POLICY IF EXISTS "Admins can manage contas_bancarias" ON public.fin_contas_bancarias;
DROP POLICY IF EXISTS fin_contas_bancarias_staff_select_grupo ON public.fin_contas_bancarias;
DROP POLICY IF EXISTS fin_contas_bancarias_admins_manage_grupo ON public.fin_contas_bancarias;

CREATE POLICY fin_contas_bancarias_staff_select_grupo
  ON public.fin_contas_bancarias
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_bancarias.empresa_id)
  );

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
            'financeiro'
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
            'financeiro'
          ]::text[]
        )
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_bancarias.empresa_id)
  );

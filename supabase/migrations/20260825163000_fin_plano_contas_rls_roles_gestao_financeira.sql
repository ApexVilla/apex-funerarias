-- Naturezas / plano de contas: alinhar RLS de escrita ao app (ROLES_GESTAO_FINANCEIRA + permissões granulares).
-- Samir (supervisao) e outros gestores tinham fin_plano_contas marcado no catálogo, mas a policy
-- fin_plano_contas_admins_manage_grupo não incluía supervisao/diretoria — mesmo bug corrigido em
-- fin_contas_bancarias (20260523120000).

CREATE OR REPLACE FUNCTION public.auth_usuario_tem_acao_permissao(
  p_rotina text,
  p_acao text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm jsonb;
BEGIN
  IF p_rotina IS NULL OR p_acao IS NULL OR trim(p_rotina) = '' OR trim(p_acao) = '' THEN
    RETURN false;
  END IF;

  SET LOCAL row_security = off;
  SELECT u.permissoes INTO v_perm
  FROM public.users u
  WHERE u.id = auth.uid()
    AND COALESCE(u.ativo, true)
  LIMIT 1;
  SET LOCAL row_security = on;

  IF v_perm IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE((v_perm -> p_rotina ->> p_acao)::boolean, false);
END;
$$;

REVOKE ALL ON FUNCTION public.auth_usuario_tem_acao_permissao(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_usuario_tem_acao_permissao(text, text) TO authenticated;

COMMENT ON FUNCTION public.auth_usuario_tem_acao_permissao(text, text) IS
  'RLS: verifica users.permissoes[rotina][acao] = true para auth.uid().';

CREATE OR REPLACE FUNCTION public.auth_usuario_pode_gerenciar_fin_plano_contas()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SET LOCAL row_security = off;
  SELECT lower(nullif(trim(u.role::text), '')) INTO v_role
  FROM public.users u
  WHERE u.id = auth.uid()
    AND COALESCE(u.ativo, true)
  LIMIT 1;
  SET LOCAL row_security = on;

  IF v_role = ANY (
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
      'supervisao',
      'gestor_executivo',
      'gestao_executiva'
    ]::text[]
  ) THEN
    RETURN true;
  END IF;

  RETURN public.auth_usuario_tem_acao_permissao('fin_plano_contas', 'create')
    OR public.auth_usuario_tem_acao_permissao('fin_plano_contas', 'edit')
    OR public.auth_usuario_tem_acao_permissao('fin_plano_contas', 'delete')
    OR public.auth_usuario_tem_acao_permissao('fin_plano_contas', 'liberado');
END;
$$;

REVOKE ALL ON FUNCTION public.auth_usuario_pode_gerenciar_fin_plano_contas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_usuario_pode_gerenciar_fin_plano_contas() TO authenticated;

DROP POLICY IF EXISTS fin_plano_contas_admins_manage_grupo ON public.fin_plano_contas;

CREATE POLICY fin_plano_contas_admins_manage_grupo
  ON public.fin_plano_contas
  FOR ALL
  TO authenticated
  USING (
    public.auth_usuario_pode_gerenciar_fin_plano_contas()
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_plano_contas.empresa_id)
  )
  WITH CHECK (
    public.auth_usuario_pode_gerenciar_fin_plano_contas()
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_plano_contas.empresa_id)
  );

-- Centros de custo: mesma lacuna (só admin/gerente na policy antiga).
CREATE OR REPLACE FUNCTION public.auth_usuario_pode_gerenciar_fin_centros_custo()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SET LOCAL row_security = off;
  SELECT lower(nullif(trim(u.role::text), '')) INTO v_role
  FROM public.users u
  WHERE u.id = auth.uid()
    AND COALESCE(u.ativo, true)
  LIMIT 1;
  SET LOCAL row_security = on;

  IF v_role = ANY (
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
      'supervisao',
      'gestor_executivo',
      'gestao_executiva'
    ]::text[]
  ) THEN
    RETURN true;
  END IF;

  RETURN public.auth_usuario_tem_acao_permissao('fin_centros_custo', 'create')
    OR public.auth_usuario_tem_acao_permissao('fin_centros_custo', 'edit')
    OR public.auth_usuario_tem_acao_permissao('fin_centros_custo', 'delete')
    OR public.auth_usuario_tem_acao_permissao('fin_centros_custo', 'liberado');
END;
$$;

REVOKE ALL ON FUNCTION public.auth_usuario_pode_gerenciar_fin_centros_custo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_usuario_pode_gerenciar_fin_centros_custo() TO authenticated;

DROP POLICY IF EXISTS fin_centros_custo_admins_manage_grupo ON public.fin_centros_custo;

CREATE POLICY fin_centros_custo_admins_manage_grupo
  ON public.fin_centros_custo
  FOR ALL
  TO authenticated
  USING (
    public.auth_usuario_pode_gerenciar_fin_centros_custo()
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_centros_custo.empresa_id)
  )
  WITH CHECK (
    public.auth_usuario_pode_gerenciar_fin_centros_custo()
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_centros_custo.empresa_id)
  );

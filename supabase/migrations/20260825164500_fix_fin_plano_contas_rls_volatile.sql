-- Corrige: SET LOCAL row_security exige função VOLATILE (erro 0A000 em STABLE).

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

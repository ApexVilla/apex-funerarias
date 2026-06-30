-- Migration to fix the row-level security leak caused by SET LOCAL row_security = off.
-- Every helper function that disables row security must explicitly re-enable it before returning.

CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT u.empresa_id INTO v_empresa_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
  SET LOCAL row_security = on;
  RETURN v_empresa_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SET LOCAL row_security = off;
  SELECT u.role INTO v_role FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
  SET LOCAL row_security = on;
  RETURN COALESCE(v_role, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role_in(p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_res boolean;
BEGIN
  SET LOCAL row_security = off;
  IF p_roles IS NULL OR array_length(p_roles, 1) IS NULL THEN
    SET LOCAL row_security = on;
    RETURN false;
  END IF;
  SELECT lower(nullif(trim(COALESCE(u.role, '')), ''))
  INTO v_role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
  SET LOCAL row_security = on;
  IF v_role IS NULL OR v_role = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM unnest(p_roles) AS t(x)
    WHERE lower(nullif(trim(t.x), '')) = v_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_pode_ver_grupo_economico()
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
  SELECT lower(nullif(trim(COALESCE(u.role, '')), ''))
  INTO v_role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
  SET LOCAL row_security = on;
  RETURN v_role IS NOT NULL
    AND v_role = ANY (
      ARRAY[
        'admin_sistema',
        'admin_empresa',
        'admin',
        'diretoria'
      ]::text[]
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_grupo_empresa_id_do_utilizador()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo_empresa_id uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT em.grupo_empresa_id INTO v_grupo_empresa_id
  FROM public.users me
  INNER JOIN public.empresas em ON em.id = me.empresa_id
  WHERE me.id = auth.uid()
  LIMIT 1;
  SET LOCAL row_security = on;
  RETURN v_grupo_empresa_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_empresa_ids_do_meu_grupo_economico()
RETURNS SETOF uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  SELECT ex2.id
  FROM public.users me2
  INNER JOIN public.empresas em2 ON em2.id = me2.empresa_id
  INNER JOIN public.empresas ex2 ON ex2.grupo_empresa_id = em2.grupo_empresa_id
  WHERE me2.id = auth.uid()
    AND em2.grupo_empresa_id IS NOT NULL;
  SET LOCAL row_security = on;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_empresa_no_mesmo_grupo_economico(p_empresa_alvo uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res boolean;
BEGIN
  SET LOCAL row_security = off;
  IF p_empresa_alvo IS NULL THEN
    SET LOCAL row_security = on;
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.users me
    INNER JOIN public.empresas em ON em.id = me.empresa_id
    INNER JOIN public.empresas ex ON ex.id = p_empresa_alvo
    WHERE me.id = auth.uid()
      AND em.grupo_empresa_id IS NOT NULL
      AND em.grupo_empresa_id = ex.grupo_empresa_id
  ) INTO v_res;
  SET LOCAL row_security = on;
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_empresas_do_meu_grupo()
RETURNS TABLE (id uuid, nome text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  SELECT e.id,
         COALESCE(NULLIF(trim(e.nome), ''), NULLIF(trim(e.razao_social), ''), 'Empresa')::text AS nome
  FROM public.empresas e
  CROSS JOIN public.users u
  WHERE u.id = auth.uid()
    AND (
        e.id = u.empresa_id
        OR (
            public.current_user_pode_ver_grupo_economico()
            AND e.grupo_empresa_id IS NOT NULL
            AND e.grupo_empresa_id = (
                SELECT e2.grupo_empresa_id
                FROM public.empresas e2
                WHERE e2.id = u.empresa_id
                LIMIT 1
            )
        )
    )
  ORDER BY nome;
  SET LOCAL row_security = on;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res boolean;
BEGIN
  SET LOCAL row_security = off;
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND COALESCE(u.ativo, true) = true
  ) INTO v_res;
  SET LOCAL row_security = on;
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_empresa_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT u.empresa_id INTO v_empresa_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1;
  SET LOCAL row_security = on;
  RETURN v_empresa_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_usuario_pode_operar_empresa(p_empresa uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_cadastro uuid;
  v_ctx jsonb;
  v_res boolean;
BEGIN
  IF p_empresa IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;

  SELECT u.empresa_id, u.permissoes -> 'empresas_contexto'
  INTO v_empresa_cadastro, v_ctx
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF v_empresa_cadastro IS NULL AND v_ctx IS NULL THEN
    SET LOCAL row_security = on;
    RETURN false;
  END IF;

  IF p_empresa = v_empresa_cadastro THEN
    SET LOCAL row_security = on;
    RETURN true;
  END IF;

  IF v_ctx IS NOT NULL
     AND COALESCE((v_ctx ->> p_empresa::text)::boolean, false) THEN
    SET LOCAL row_security = on;
    RETURN true;
  END IF;

  v_res := public.current_user_pode_ver_grupo_economico()
    AND public.auth_empresa_no_mesmo_grupo_economico(p_empresa);
  SET LOCAL row_security = on;
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_pode_ver_todas_propostas_venda()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_perm jsonb;
  v_roles_extra text[];
  v_res boolean := false;
  v_staff_roles text[] := ARRAY[
    'admin',
    'admin_empresa',
    'admin_sistema',
    'super_admin',
    'gerente',
    'gestor',
    'supervisao',
    'diretoria',
    'financeiro'
  ];
BEGIN
  SET LOCAL row_security = off;
  SELECT lower(nullif(trim(COALESCE(u.role, '')), '')),
         COALESCE(u.permissoes, '{}'::jsonb),
         COALESCE(u.roles_extra, '{}')
  INTO v_role, v_perm, v_roles_extra
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  SET LOCAL row_security = on;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_roles_extra && v_staff_roles THEN
    RETURN true;
  END IF;

  IF COALESCE((v_perm -> 'vendas_propostas' ->> 'view_todos')::boolean, false) THEN
    RETURN true;
  END IF;

  IF v_role = 'vendedor' THEN
    RETURN false;
  END IF;

  IF v_role = ANY (v_staff_roles) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_empresa_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role_in(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_grupo_economico() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_grupo_empresa_id_do_utilizador() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_empresa_ids_do_meu_grupo_economico() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_empresa_no_mesmo_grupo_economico(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_empresas_do_meu_grupo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_empresa_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_empresa_id() TO anon;
GRANT EXECUTE ON FUNCTION public.auth_usuario_pode_operar_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_todas_propostas_venda() TO authenticated;

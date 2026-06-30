-- Corrige 42P17 (recursão infinita) em RLS de public.users e public.empresas.
--
-- Causas típicas:
-- 1) Política em `users` chama current_user_role() → lê `users` de novo durante a mesma avaliação.
-- 2) Funções SQL com SET row_security=off no atributo nem sempre evitam o detector de recursão em todas as versões.
--
-- Solução: helpers em plpgsql com SET LOCAL row_security = off antes de qualquer leitura;
-- políticas de UPDATE em users usam auth_user_role_in(...) em vez de current_user_role();
-- current_user_pode_ver_grupo_economico lê o role direto (sem chamar current_user_role).

-- ── Leitura de public.users / empresas sem RLS no corpo da função ────────────
CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN (SELECT u.empresa_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN COALESCE(
    (SELECT u.role FROM public.users u WHERE u.id = auth.uid() LIMIT 1),
    ''
  );
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
BEGIN
  SET LOCAL row_security = off;
  IF p_roles IS NULL OR array_length(p_roles, 1) IS NULL THEN
    RETURN false;
  END IF;
  SELECT lower(nullif(trim(COALESCE(u.role, '')), ''))
  INTO v_role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
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
BEGIN
  SET LOCAL row_security = off;
  RETURN (
    SELECT em.grupo_empresa_id
    FROM public.users me
    INNER JOIN public.empresas em ON em.id = me.empresa_id
    WHERE me.id = auth.uid()
    LIMIT 1
  );
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
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_empresa_no_mesmo_grupo_economico(p_empresa_alvo uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  IF p_empresa_alvo IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.users me
    INNER JOIN public.empresas em ON em.id = me.empresa_id
    INNER JOIN public.empresas ex ON ex.id = p_empresa_alvo
    WHERE me.id = auth.uid()
      AND em.grupo_empresa_id IS NOT NULL
      AND em.grupo_empresa_id = ex.grupo_empresa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auth_grupo_empresa_id_do_utilizador() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_grupo_empresa_id_do_utilizador() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_empresa_ids_do_meu_grupo_economico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_empresa_ids_do_meu_grupo_economico() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_empresa_no_mesmo_grupo_economico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_empresa_no_mesmo_grupo_economico(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_role_in(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_role_in(text[]) TO authenticated;

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
END;
$$;

REVOKE ALL ON FUNCTION public.fn_empresas_do_meu_grupo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_empresas_do_meu_grupo() TO authenticated;

-- ── RLS users ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_select_same_empresa ON public.users;
CREATE POLICY users_select_same_empresa
ON public.users
FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR empresa_id = public.current_empresa_id()
    OR (
        public.current_user_pode_ver_grupo_economico()
        AND public.auth_empresa_no_mesmo_grupo_economico(users.empresa_id)
    )
);

DROP POLICY IF EXISTS users_update_same_empresa_admin ON public.users;
CREATE POLICY users_update_same_empresa_admin
ON public.users
FOR UPDATE
TO authenticated
USING (
    id = auth.uid()
    OR (
        empresa_id = public.current_empresa_id()
        AND public.auth_user_role_in(ARRAY[
            'admin',
            'admin_empresa',
            'admin_sistema',
            'gerente',
            'diretoria',
            'supervisao',
            'gestor',
            'super_admin'
        ])
    )
    OR (
        public.current_user_pode_ver_grupo_economico()
        AND public.auth_empresa_no_mesmo_grupo_economico(users.empresa_id)
    )
)
WITH CHECK (
    id = auth.uid()
    OR (
        empresa_id = public.current_empresa_id()
        AND public.auth_user_role_in(ARRAY[
            'admin',
            'admin_empresa',
            'admin_sistema',
            'gerente',
            'diretoria',
            'supervisao',
            'gestor',
            'super_admin'
        ])
    )
    OR (
        public.current_user_pode_ver_grupo_economico()
        AND users.empresa_id IN (SELECT public.auth_empresa_ids_do_meu_grupo_economico())
    )
);

-- ── RLS empresas ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS empresas_authenticated_select_own_or_grupo_admin ON public.empresas;
CREATE POLICY empresas_authenticated_select_own_or_grupo_admin
ON public.empresas
FOR SELECT
TO authenticated
USING (
    id = public.current_empresa_id()
    OR (
        public.current_user_pode_ver_grupo_economico()
        AND empresas.grupo_empresa_id IS NOT NULL
        AND empresas.grupo_empresa_id = public.auth_grupo_empresa_id_do_utilizador()
    )
);

DROP POLICY IF EXISTS empresas_authenticated_update_own_or_grupo_admin ON public.empresas;
CREATE POLICY empresas_authenticated_update_own_or_grupo_admin
ON public.empresas
FOR UPDATE
TO authenticated
USING (
    id = public.current_empresa_id()
    OR (
        public.current_user_pode_ver_grupo_economico()
        AND empresas.grupo_empresa_id IS NOT NULL
        AND empresas.grupo_empresa_id = public.auth_grupo_empresa_id_do_utilizador()
    )
)
WITH CHECK (
    id = public.current_empresa_id()
    OR (
        public.current_user_pode_ver_grupo_economico()
        AND empresas.grupo_empresa_id IS NOT NULL
        AND empresas.grupo_empresa_id = public.auth_grupo_empresa_id_do_utilizador()
    )
);

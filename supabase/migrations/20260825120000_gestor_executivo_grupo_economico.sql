-- Cargo gestor_executivo existe em user_roles mas não estava nas funções de acesso
-- (grupo econômico / RLS). Usuárias como Edna ficavam sem carregar dados como diretoria.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_role IN ('gestor_executivo', 'gestao_executiva') THEN
    RETURN 'diretoria';
  END IF;

  RETURN COALESCE(v_role, '');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE lower(nullif(trim(COALESCE(u.role, '')), ''))
    WHEN 'gestor_executivo' THEN 'diretoria'
    WHEN 'gestao_executiva' THEN 'diretoria'
    ELSE lower(nullif(trim(COALESCE(u.role, '')), ''))
  END
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_pode_ver_grupo_economico()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_user_role();
  RETURN v_role IS NOT NULL
    AND v_role <> ''
    AND v_role = ANY (
      ARRAY[
        'admin_sistema',
        'admin_empresa',
        'admin',
        'diretoria',
        'gerente',
        'supervisao',
        'gestor',
        'gestor_executivo',
        'gestao_executiva',
        'super_admin',
        'administrador_geral',
        'financeiro'
      ]::text[]
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.auth_user_role_in(p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
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

  IF EXISTS (
    SELECT 1
    FROM unnest(p_roles) AS t(x)
    WHERE lower(nullif(trim(t.x), '')) = v_role
  ) THEN
    RETURN true;
  END IF;

  IF v_role IN ('gestor_executivo', 'gestao_executiva') THEN
    RETURN EXISTS (
      SELECT 1
      FROM unnest(p_roles) AS t(x)
      WHERE lower(nullif(trim(t.x), '')) IN (
        'gestor_executivo',
        'gestao_executiva',
        'diretoria',
        'gerente',
        'supervisao',
        'gestor'
      )
    );
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_pode_ver_grupo_economico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_grupo_economico() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_user_role_in(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_role_in(text[]) TO authenticated;

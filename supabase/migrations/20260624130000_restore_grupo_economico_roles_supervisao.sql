-- Restaura visão do grupo para gerente/supervisão/gestor (regredido em fix_rls_functions_row_security_reset).
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
        'diretoria',
        'gerente',
        'supervisao',
        'gestor',
        'super_admin',
        'administrador_geral',
        'financeiro'
      ]::text[]
    );
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_pode_ver_grupo_economico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_grupo_economico() TO authenticated;

-- Samir supervisor geral: sem restricao de empresas_contexto (usa visao consolidada do cargo).
UPDATE public.users
SET
  permissoes = COALESCE(permissoes, '{}'::jsonb) - 'empresas_contexto',
  updated_at = now()
WHERE lower(trim(email)) = 'samir@fenixfuneraria.com';

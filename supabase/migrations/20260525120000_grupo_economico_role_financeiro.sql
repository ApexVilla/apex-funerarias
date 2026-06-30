-- Perfil "financeiro" opera o módulo em várias unidades do grupo (header de empresa).
-- current_user_pode_ver_grupo_economico() alimenta rls_empresa_ou_do_mesmo_grupo(); sem
-- "financeiro" na lista, INSERT/UPDATE em fin_* com empresa_id de outra unidade falha RLS.
-- (Migração após 20260520140000_volatile_plpgsql_set_local_row_security.sql para não ser sobrescrita.)

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
        'diretoria',
        'gerente',
        'supervisao',
        'gestor',
        'super_admin',
        'financeiro'
      ]::text[]
    );
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_pode_ver_grupo_economico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_grupo_economico() TO authenticated;

-- Amplia quem enxerga dados consolidados do grupo econômico (frota, empresas, etc.)
-- alinhado a operações multi-unidade (gerente, supervisão, gestor).

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
        'super_admin'
      ]::text[]
    );
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_pode_ver_grupo_economico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_grupo_economico() TO authenticated;

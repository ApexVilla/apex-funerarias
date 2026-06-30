-- Propostas: honra roles_extra (ex.: vendedor + financeiro) e view_todos explícito.
-- Ativa view_todos para Larissa (Aparecida).

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

REVOKE ALL ON FUNCTION public.current_user_pode_ver_todas_propostas_venda() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_todas_propostas_venda() TO authenticated;

UPDATE public.users u
SET permissoes = jsonb_set(
  COALESCE(u.permissoes, '{}'::jsonb),
  '{vendas_propostas,view_todos}',
  'true'::jsonb,
  true
)
WHERE lower(u.email) = 'larissa@fenixfuneraria.com'
  AND COALESCE((u.permissoes -> 'vendas_propostas' ->> 'view_todos')::boolean, false) = false;

-- Espelho de ponto: permissão granular view_todos (Config → Permissões → Espelho de Ponto).
-- Ativa para Natacha (Aparecida / financeiro).

CREATE OR REPLACE FUNCTION public.current_user_pode_ver_ponto_todos()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_perm jsonb;
  v_staff_roles text[] := ARRAY[
    'admin',
    'admin_empresa',
    'admin_sistema',
    'super_admin',
    'gerente',
    'gestor',
    'supervisao',
    'diretoria',
    'financeiro',
    'rh'
  ];
BEGIN
  SET LOCAL row_security = off;
  SELECT lower(nullif(trim(COALESCE(u.role, '')), '')),
         COALESCE(u.permissoes, '{}'::jsonb)
  INTO v_role, v_perm
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE((v_perm -> 'ponto_espelho' ->> 'view_todos')::boolean, false) THEN
    RETURN true;
  END IF;

  IF v_role = ANY (v_staff_roles) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_pode_ver_ponto_todos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_ponto_todos() TO authenticated;

DROP POLICY IF EXISTS select_ponto_registros ON public.ponto_registros;
CREATE POLICY select_ponto_registros ON public.ponto_registros
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_pode_ver_ponto_todos()
    )
);

UPDATE public.users u
SET permissoes = jsonb_set(
  COALESCE(u.permissoes, '{}'::jsonb),
  '{ponto_espelho,view_todos}',
  'true'::jsonb,
  true
)
WHERE lower(u.email) = 'natacha@fenixfuneraria.com'
  AND COALESCE((u.permissoes -> 'ponto_espelho' ->> 'view_todos')::boolean, false) = false;

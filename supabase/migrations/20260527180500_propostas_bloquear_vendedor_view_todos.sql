-- Segurança: vendedor não pode confirmar proposta/gerar contrato,
-- mesmo se alguém marcar `vendas_propostas.view_todos` manualmente.

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

  IF v_role = 'vendedor' THEN
    RETURN false;
  END IF;

  IF COALESCE((v_perm -> 'vendas_propostas' ->> 'view_todos')::boolean, false) THEN
    RETURN true;
  END IF;

  IF v_role = ANY (
    ARRAY[
      'admin',
      'admin_empresa',
      'admin_sistema',
      'super_admin',
      'gerente',
      'gestor',
      'supervisao',
      'diretoria',
      'financeiro'
    ]::text[]
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_pode_ver_todas_propostas_venda() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_ver_todas_propostas_venda() TO authenticated;

-- Higieniza permissões existentes para vendedores.
UPDATE public.users u
SET permissoes = jsonb_set(
  COALESCE(u.permissoes, '{}'::jsonb),
  '{vendas_propostas,view_todos}',
  'false'::jsonb,
  true
)
WHERE lower(COALESCE(u.role, '')) = 'vendedor'
  AND COALESCE((u.permissoes -> 'vendas_propostas' ->> 'view_todos')::boolean, false);

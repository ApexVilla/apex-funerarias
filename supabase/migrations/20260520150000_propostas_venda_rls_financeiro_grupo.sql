-- Propostas: financeiro e permissão vendas_propostas.view enxergam propostas do grupo econômico
-- (Natacha / Aparecida: antes só admin/gerente ou vendedor_id = auth.uid()).

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

DROP POLICY IF EXISTS propostas_venda_select ON public.propostas_venda;
CREATE POLICY propostas_venda_select ON public.propostas_venda
FOR SELECT TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND (
    public.current_user_pode_ver_todas_propostas_venda()
    OR vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS propostas_venda_insert ON public.propostas_venda;
CREATE POLICY propostas_venda_insert ON public.propostas_venda
FOR INSERT TO authenticated
WITH CHECK (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND (
    public.current_user_pode_ver_todas_propostas_venda()
    OR vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS propostas_venda_update ON public.propostas_venda;
CREATE POLICY propostas_venda_update ON public.propostas_venda
FOR UPDATE TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND (
    public.current_user_pode_ver_todas_propostas_venda()
    OR vendedor_id = auth.uid()
  )
)
WITH CHECK (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND (
    public.current_user_pode_ver_todas_propostas_venda()
    OR vendedor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS propostas_venda_delete ON public.propostas_venda;
CREATE POLICY propostas_venda_delete ON public.propostas_venda
FOR DELETE TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND (
    public.current_user_pode_ver_todas_propostas_venda()
    OR vendedor_id = auth.uid()
  )
);

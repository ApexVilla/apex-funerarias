-- Atendentes podem criar contrato em cadastro de migração (cliente.origem_canal = migracao),
-- sem poder confirmar proposta / gerar contrato pelo fluxo de vendas.

CREATE OR REPLACE FUNCTION public.current_user_pode_criar_assinatura(p_cliente_id uuid DEFAULT NULL)
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

  IF public.current_user_pode_ver_todas_propostas_venda() THEN
    RETURN true;
  END IF;

  SELECT lower(nullif(trim(COALESCE(u.role, '')), '')),
         COALESCE(u.permissoes, '{}'::jsonb)
  INTO v_role, v_perm
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE((v_perm -> 'cli_contratos' ->> 'create')::boolean, false)
     OR COALESCE((v_perm -> 'cli_contratos' ->> 'liberado')::boolean, false) THEN
    RETURN true;
  END IF;

  IF p_cliente_id IS NOT NULL
     AND (
       COALESCE((v_perm -> 'cli_lista' ->> 'create')::boolean, false)
       OR COALESCE((v_perm -> 'cli_lista' ->> 'liberado')::boolean, false)
     ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.id = p_cliente_id
        AND c.deleted_at IS NULL
        AND lower(trim(coalesce(c.origem_canal, ''))) = 'migracao'
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_pode_criar_assinatura(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_criar_assinatura(uuid) TO authenticated;

DROP POLICY IF EXISTS assinaturas_insert_staff_only ON public.assinaturas;
CREATE POLICY assinaturas_insert_staff_only ON public.assinaturas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_pode_criar_assinatura(cliente_id)
  );

DROP POLICY IF EXISTS assinaturas_update_staff_only ON public.assinaturas;
CREATE POLICY assinaturas_update_staff_only ON public.assinaturas
  FOR UPDATE TO authenticated
  USING (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_pode_criar_assinatura(cliente_id)
  )
  WITH CHECK (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_pode_criar_assinatura(cliente_id)
  );

DROP POLICY IF EXISTS assinaturas_delete_staff_only ON public.assinaturas;
CREATE POLICY assinaturas_delete_staff_only ON public.assinaturas
  FOR DELETE TO authenticated
  USING (
    public.is_active_user()
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_pode_criar_assinatura(cliente_id)
  );

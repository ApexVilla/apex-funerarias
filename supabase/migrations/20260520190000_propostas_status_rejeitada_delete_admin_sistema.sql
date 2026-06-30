-- Status rejeitada + exclusão apenas para administradores do sistema

ALTER TABLE public.propostas_venda
  DROP CONSTRAINT IF EXISTS propostas_venda_status_check;

ALTER TABLE public.propostas_venda
  ADD CONSTRAINT propostas_venda_status_check
  CHECK (status IN (
    'rascunho',
    'pendente_geracao_contrato',
    'convertido',
    'cancelado',
    'rejeitada'
  ));

CREATE OR REPLACE FUNCTION public.current_user_pode_excluir_propostas_venda()
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

  RETURN v_role = ANY (ARRAY['admin_sistema', 'super_admin']::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_pode_excluir_propostas_venda() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_pode_excluir_propostas_venda() TO authenticated;

DROP POLICY IF EXISTS propostas_venda_delete ON public.propostas_venda;
CREATE POLICY propostas_venda_delete ON public.propostas_venda
FOR DELETE TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_pode_excluir_propostas_venda()
);

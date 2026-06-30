-- Cobradores do grupo Fênix: leitura para qualquer usuário do grupo (ex.: Catalão vê cobradores na Matriz/Aparecida).
-- Inserção/alteração continua restrita à própria empresa ou gestores.

CREATE OR REPLACE FUNCTION public.fn_empresas_do_grupo_economico()
RETURNS TABLE (id uuid, nome text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  SELECT ex.id,
         COALESCE(NULLIF(trim(ex.nome), ''), NULLIF(trim(ex.razao_social), ''), 'Empresa')::text AS nome
  FROM public.users me
  INNER JOIN public.empresas em ON em.id = me.empresa_id
  INNER JOIN public.empresas ex ON ex.grupo_empresa_id = em.grupo_empresa_id
  WHERE me.id = auth.uid()
    AND em.grupo_empresa_id IS NOT NULL
  ORDER BY nome;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_empresas_do_grupo_economico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_empresas_do_grupo_economico() TO authenticated;

COMMENT ON FUNCTION public.fn_empresas_do_grupo_economico() IS
  'Todas as empresas do mesmo grupo_economico do usuário (para listar cobradores cadastrados em outra CNPJ do grupo).';

DROP POLICY IF EXISTS cobradores_empresa_select ON public.cobradores;
CREATE POLICY cobradores_empresa_select ON public.cobradores
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = public.get_user_empresa_id()
    OR public.auth_empresa_no_mesmo_grupo_economico(empresa_id)
  );

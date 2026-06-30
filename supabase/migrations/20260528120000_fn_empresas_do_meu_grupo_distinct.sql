-- Evita a mesma empresa duas vezes quando casa com users.empresa_id e com o grupo econômico.
CREATE OR REPLACE FUNCTION public.fn_empresas_do_meu_grupo()
RETURNS TABLE (id uuid, nome text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  SELECT DISTINCT ON (e.id)
         e.id,
         COALESCE(NULLIF(trim(e.nome), ''), NULLIF(trim(e.razao_social), ''), 'Empresa')::text AS nome
  FROM public.empresas e
  CROSS JOIN public.users u
  WHERE u.id = auth.uid()
    AND (
        e.id = u.empresa_id
        OR (
            public.current_user_pode_ver_grupo_economico()
            AND e.grupo_empresa_id IS NOT NULL
            AND e.grupo_empresa_id = (
                SELECT e2.grupo_empresa_id
                FROM public.empresas e2
                WHERE e2.id = u.empresa_id
                LIMIT 1
            )
        )
    )
  ORDER BY e.id, nome;
END;
$$;

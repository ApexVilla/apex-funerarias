-- Corrige fn_cobradores_ativos_para_unidade: STABLE não permite SET LOCAL (RPC falhava → lista vazia no formulário).

CREATE OR REPLACE FUNCTION public.fn_cobradores_ativos_para_unidade(p_token_unidade text DEFAULT NULL)
RETURNS TABLE (id uuid, nome text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_norm text;
BEGIN
  SET LOCAL row_security = off;

  v_token_norm := public.fn_normalizar_unidade_txt(p_token_unidade);
  IF v_token_norm = '' THEN
    v_token_norm := NULL;
  END IF;

  RETURN QUERY
  SELECT c.id, COALESCE(NULLIF(trim(c.nome), ''), 'Cobrador')::text
  FROM public.cobradores c
  INNER JOIN public.users me ON me.id = auth.uid()
  INNER JOIN public.empresas em ON em.id = me.empresa_id
  WHERE c.status = 'ativo'
    AND me.ativo IS NOT DISTINCT FROM true
    AND (
      c.empresa_id = em.id
      OR (
        em.grupo_empresa_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.empresas ex
          WHERE ex.id = c.empresa_id
            AND ex.grupo_empresa_id = em.grupo_empresa_id
        )
      )
    )
    AND (
      v_token_norm IS NULL
      OR public.fn_normalizar_unidade_txt(c.area_atuacao) LIKE '%' || v_token_norm || '%'
      OR EXISTS (
        SELECT 1
        FROM public.filiais f
        WHERE f.id = c.filial_id
          AND public.fn_normalizar_unidade_txt(f.nome) LIKE '%' || v_token_norm || '%'
      )
      OR EXISTS (
        SELECT 1
        FROM public.empresas ex
        WHERE ex.id = c.empresa_id
          AND public.fn_normalizar_unidade_txt(COALESCE(ex.nome, ex.razao_social, ''))
            LIKE '%' || v_token_norm || '%'
      )
    )
  ORDER BY c.nome;
END;
$$;

COMMENT ON FUNCTION public.fn_cobradores_ativos_para_unidade(text) IS
  'Cobradores ativos do grupo econômico do usuário, filtrados por unidade (área, filial ou nome da empresa).';

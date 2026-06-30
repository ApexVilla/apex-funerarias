-- Código de conta a pagar (CP-000001) sequencial por empresa — sem letras aleatórias.

CREATE UNIQUE INDEX IF NOT EXISTS fin_contas_pagar_empresa_codigo_uidx
  ON public.fin_contas_pagar (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.fn_proximo_codigo_conta_pagar(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  max_n integer := 0;
  cand integer;
  cod text;
BEGIN
  IF p_empresa_id IS NULL THEN
    RETURN 'CP-' || lpad('1', 6, '0');
  END IF;

  SELECT coalesce(max(
    CASE
      WHEN codigo ~ '^CP-[0-9]{6}$' THEN
        (regexp_replace(codigo, '[^0-9]', '', 'g'))::bigint
      ELSE 0
    END
  ), 0)::integer
  INTO max_n
  FROM public.fin_contas_pagar
  WHERE empresa_id = p_empresa_id
    AND deleted_at IS NULL;

  FOR cand IN max_n + 1 .. max_n + 5000 LOOP
    cod := 'CP-' || lpad(cand::text, 6, '0');
    IF NOT EXISTS (
      SELECT 1 FROM public.fin_contas_pagar
      WHERE empresa_id = p_empresa_id
        AND codigo = cod
        AND deleted_at IS NULL
    ) THEN
      RETURN cod;
    END IF;
  END LOOP;

  RETURN 'CP-' || lpad((extract(epoch FROM now())::bigint % 1000000)::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.fn_proximo_codigo_conta_pagar(uuid) IS
  'Próximo código de conta a pagar (CP-000001) na unidade, sem colidir com outras empresas do grupo.';

GRANT EXECUTE ON FUNCTION public.fn_proximo_codigo_conta_pagar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_proximo_codigo_conta_pagar(uuid) TO service_role;

-- Normaliza códigos legados com letras (ex.: CP-MQ6NZRMPTMX) para sequência numérica.
DO $$
DECLARE
  r RECORD;
  novo text;
BEGIN
  FOR r IN
    SELECT id, empresa_id
    FROM public.fin_contas_pagar
    WHERE deleted_at IS NULL
      AND codigo !~ '^CP-[0-9]{6}$'
    ORDER BY empresa_id, created_at, id
  LOOP
    novo := public.fn_proximo_codigo_conta_pagar(r.empresa_id);
    UPDATE public.fin_contas_pagar
    SET codigo = novo, updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;

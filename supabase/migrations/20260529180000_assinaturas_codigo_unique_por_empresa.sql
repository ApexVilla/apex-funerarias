-- Código de contrato (CTR-000001) único por unidade, não globalmente.
-- Evita DUPLICATE KEY quando Catalão já usa CTR-000152 e outra filial tenta CTR-000004.

ALTER TABLE public.assinaturas DROP CONSTRAINT IF EXISTS assinaturas_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_empresa_codigo_uidx
  ON public.assinaturas (empresa_id, codigo);

CREATE OR REPLACE FUNCTION public.fn_proximo_codigo_contrato(p_empresa_id uuid)
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
    RETURN 'CTR-' || lpad('1', 6, '0');
  END IF;

  SELECT coalesce(max(
    CASE
      WHEN codigo ~ '[0-9]+' THEN
        (regexp_replace(codigo, '[^0-9]', '', 'g'))::bigint
      ELSE 0
    END
  ), 0)::integer
  INTO max_n
  FROM public.assinaturas
  WHERE empresa_id = p_empresa_id;

  FOR cand IN max_n + 1 .. max_n + 5000 LOOP
    cod := 'CTR-' || lpad(cand::text, 6, '0');
    IF NOT EXISTS (
      SELECT 1 FROM public.assinaturas
      WHERE empresa_id = p_empresa_id AND codigo = cod
    ) THEN
      RETURN cod;
    END IF;
  END LOOP;

  RETURN 'CTR-' || lpad((extract(epoch FROM now())::bigint % 1000000)::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.fn_proximo_codigo_contrato(uuid) IS
  'Próximo código de contrato (CTR-000001) na unidade, sem colidir com outras empresas do grupo.';

GRANT EXECUTE ON FUNCTION public.fn_proximo_codigo_contrato(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_proximo_codigo_contrato(uuid) TO service_role;

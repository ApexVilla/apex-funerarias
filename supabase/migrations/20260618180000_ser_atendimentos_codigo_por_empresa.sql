-- Código de atendimento (ATD-000001) único por unidade, não globalmente.
-- Catalão falhava ao salvar OS porque Aparecida já tinha ATD-     1 (unique global).

ALTER TABLE public.ser_atendimentos
  DROP CONSTRAINT IF EXISTS ser_atendimentos_codigo_unique;

CREATE UNIQUE INDEX IF NOT EXISTS ser_atendimentos_empresa_codigo_uidx
  ON public.ser_atendimentos (empresa_id, codigo)
  WHERE deleted_at IS NULL;

-- Normaliza código legado com espaços (ATD-     1 → ATD-000001).
UPDATE public.ser_atendimentos
SET codigo = 'ATD-' || lpad(
  coalesce((regexp_match(trim(codigo), '(\d+)$'))[1]::int, 1)::text,
  6,
  '0'
),
updated_at = now()
WHERE codigo ~ '^ATD-\s+\d+$';

CREATE OR REPLACE FUNCTION public.fn_gerar_codigo_atendimento(p_empresa_id uuid)
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
    RETURN 'ATD-' || lpad('1', 6, '0');
  END IF;

  SELECT coalesce(max(
    CASE
      WHEN codigo ~ '[0-9]+' THEN
        (regexp_replace(codigo, '[^0-9]', '', 'g'))::bigint
      ELSE 0
    END
  ), 0)::integer
  INTO max_n
  FROM public.ser_atendimentos
  WHERE empresa_id = p_empresa_id
    AND deleted_at IS NULL;

  FOR cand IN max_n + 1 .. max_n + 5000 LOOP
    cod := 'ATD-' || lpad(cand::text, 6, '0');
    IF NOT EXISTS (
      SELECT 1
      FROM public.ser_atendimentos
      WHERE empresa_id = p_empresa_id
        AND codigo = cod
        AND deleted_at IS NULL
    ) THEN
      RETURN cod;
    END IF;
  END LOOP;

  RETURN 'ATD-' || lpad((extract(epoch FROM now())::bigint % 1000000)::text, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.fn_gerar_codigo_atendimento(uuid) IS
  'Próximo código de atendimento (ATD-000001) na unidade, sem colidir com outras filiais.';

GRANT EXECUTE ON FUNCTION public.fn_gerar_codigo_atendimento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_gerar_codigo_atendimento(uuid) TO service_role;

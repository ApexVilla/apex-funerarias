-- Evita dois usuários receberem o mesmo número de saída ao gerar em paralelo.
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_saida(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano text := to_char(current_date, 'YYYY');
  v_seq integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('estoque_saida:' || p_empresa_id::text));

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero_saida, '^SAI-' || v_ano || '-', ''), '')::integer
  ), 0) + 1
  INTO v_seq
  FROM public.estoque_saidas
  WHERE empresa_id = p_empresa_id
    AND numero_saida ~ ('^SAI-' || v_ano || '-[0-9]+$');

  RETURN 'SAI-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

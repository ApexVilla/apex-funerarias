-- Códigos CR mais curtos para leitura em campo (CR- + 8 hex ≈ 11 caracteres).

CREATE OR REPLACE FUNCTION public.fn_fin_novo_codigo_cr()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'CR-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
$$;

COMMENT ON FUNCTION public.fn_fin_novo_codigo_cr() IS
  'Código único curto para fin_contas_receber (ex.: CR-A1B2C3D4, máx. 30 chars).';

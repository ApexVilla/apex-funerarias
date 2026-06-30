-- Corrige códigos CR- que excediam VARCHAR(30) e impedia geração de parcelas.
-- fn_fin_novo_codigo_cr gerava 'CR-' + 32 chars = 35 caracteres.

CREATE OR REPLACE FUNCTION public.fn_fin_novo_codigo_cr()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'CR-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 27)
$$;

COMMENT ON FUNCTION public.fn_fin_novo_codigo_cr() IS
  'Gera código único para fin_contas_receber (máx. 30 caracteres: CR- + 27 hex).';

-- Repõe parcelas de contratos ativos que ficaram sem mensalidades por falha anterior.
DO $$
DECLARE
  r RECORD;
  n INTEGER;
BEGIN
  FOR r IN
    SELECT a.id, a.codigo
    FROM public.assinaturas a
    WHERE a.deleted_at IS NULL
      AND lower(coalesce(a.status, '')) IN ('ativo', 'suspenso')
      AND NOT EXISTS (
        SELECT 1
        FROM public.fin_contas_receber cr
        WHERE cr.assinatura_id = a.id
          AND cr.deleted_at IS NULL
          AND cr.tipo_documento = 'mensalidade'
      )
  LOOP
    n := public.fn_gerar_mensalidades(r.id, 12);
    RAISE NOTICE 'Backfill parcelas contrato % (%): % gerada(s)', r.codigo, r.id, n;
  END LOOP;
END $$;

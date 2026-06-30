-- Corrige contratos de migração com typo de ano (ex.: cliente_desde 2008-03-17, data_contratacao 2026-03-17).
UPDATE public.assinaturas a
SET
  data_contratacao = c.cliente_desde,
  updated_at = now()
FROM public.clientes c
WHERE c.id = a.cliente_id
  AND a.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND a.status = 'ativo'
  AND c.origem_canal = 'migracao'
  AND c.cliente_desde IS NOT NULL
  AND a.data_contratacao IS DISTINCT FROM c.cliente_desde
  AND EXTRACT(MONTH FROM a.data_contratacao) = EXTRACT(MONTH FROM c.cliente_desde)
  AND EXTRACT(DAY FROM a.data_contratacao) = EXTRACT(DAY FROM c.cliente_desde)
  AND EXTRACT(YEAR FROM a.data_contratacao) > EXTRACT(YEAR FROM c.cliente_desde)
  AND EXTRACT(YEAR FROM a.data_contratacao) >= EXTRACT(YEAR FROM CURRENT_DATE) - 1;

-- Impede gravação futura do mesmo typo (ajusta ano para cliente_desde quando aplicável).
CREATE OR REPLACE FUNCTION public.fn_assinaturas_corrigir_typo_ano_migracao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cliente_desde date;
  v_origem text;
BEGIN
  IF NEW.cliente_id IS NULL OR NEW.data_contratacao IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.cliente_desde, c.origem_canal
    INTO v_cliente_desde, v_origem
  FROM public.clientes c
  WHERE c.id = NEW.cliente_id
    AND c.deleted_at IS NULL;

  IF v_origem = 'migracao'
     AND v_cliente_desde IS NOT NULL
     AND EXTRACT(MONTH FROM NEW.data_contratacao) = EXTRACT(MONTH FROM v_cliente_desde)
     AND EXTRACT(DAY FROM NEW.data_contratacao) = EXTRACT(DAY FROM v_cliente_desde)
     AND EXTRACT(YEAR FROM NEW.data_contratacao) > EXTRACT(YEAR FROM v_cliente_desde)
     AND EXTRACT(YEAR FROM NEW.data_contratacao) >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
  THEN
    NEW.data_contratacao := make_date(
      EXTRACT(YEAR FROM v_cliente_desde)::int,
      EXTRACT(MONTH FROM NEW.data_contratacao)::int,
      LEAST(
        EXTRACT(DAY FROM NEW.data_contratacao)::int,
        EXTRACT(
          DAY FROM (
            date_trunc('month', make_date(
              EXTRACT(YEAR FROM v_cliente_desde)::int,
              EXTRACT(MONTH FROM NEW.data_contratacao)::int,
              1
            )) + INTERVAL '1 month - 1 day'
          )
        )::int
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assinaturas_corrigir_typo_ano_migracao ON public.assinaturas;

CREATE TRIGGER trg_assinaturas_corrigir_typo_ano_migracao
  BEFORE INSERT OR UPDATE OF data_contratacao, cliente_id
  ON public.assinaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_assinaturas_corrigir_typo_ano_migracao();

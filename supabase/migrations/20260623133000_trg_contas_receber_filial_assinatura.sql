-- Garante filial_id da parcela = filial do contrato (mensalidades e títulos vinculados).

CREATE OR REPLACE FUNCTION public.fn_fin_contas_receber_sync_filial_assinatura()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_filial uuid;
BEGIN
  IF NEW.assinatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.filial_id
    INTO v_filial
  FROM public.assinaturas a
  WHERE a.id = NEW.assinatura_id
    AND a.deleted_at IS NULL;

  IF v_filial IS NOT NULL THEN
    NEW.filial_id := v_filial;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_contas_receber_sync_filial_assinatura ON public.fin_contas_receber;

CREATE TRIGGER trg_fin_contas_receber_sync_filial_assinatura
  BEFORE INSERT OR UPDATE OF assinatura_id, filial_id
  ON public.fin_contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fin_contas_receber_sync_filial_assinatura();

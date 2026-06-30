-- Ao excluir parcela no financeiro (soft delete), remove da carteira do cobrador.

CREATE OR REPLACE FUNCTION public.fn_fin_cr_sync_cob_pendencia_exclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
    UPDATE public.cob_cobrancas_pendentes
    SET status = 'cobrado',
        updated_at = now()
    WHERE conta_receber_id = NEW.id
      AND status <> 'cobrado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_contas_receber_soft_delete_cob_sync ON public.fin_contas_receber;
CREATE TRIGGER fin_contas_receber_soft_delete_cob_sync
  AFTER UPDATE OF deleted_at ON public.fin_contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_fin_cr_sync_cob_pendencia_exclusao();

COMMENT ON FUNCTION public.fn_fin_cr_sync_cob_pendencia_exclusao() IS
  'Marca cob_cobrancas_pendentes como cobrado quando fin_contas_receber recebe deleted_at (parcela excluída).';

-- Corrige pendências órfãs já existentes (título excluído ou quitado).
UPDATE public.cob_cobrancas_pendentes cp
SET status = 'cobrado',
    updated_at = now()
FROM public.fin_contas_receber fr
WHERE cp.conta_receber_id = fr.id
  AND cp.status <> 'cobrado'
  AND (
    fr.deleted_at IS NOT NULL
    OR fr.status IN ('pago', 'cancelado')
    OR (COALESCE(fr.valor_aberto_centavos, 0) <= 0 AND fr.status <> 'pago_parcial')
  );

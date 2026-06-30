-- Alinha filial_id das parcelas com a filial do contrato (assinatura).
-- Evita título vencido sumir em Contas a Receber ao filtrar por unidade.

UPDATE public.fin_contas_receber cr
SET
  filial_id = a.filial_id,
  updated_at = now()
FROM public.assinaturas a
WHERE cr.assinatura_id = a.id
  AND cr.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND a.filial_id IS NOT NULL
  AND (cr.filial_id IS NULL OR cr.filial_id IS DISTINCT FROM a.filial_id);

-- Alinha data_contratacao com cliente_desde em contratos novos (não migração histórica).
-- Corrige casos em que o início exibia o dia de vencimento (ex.: 17/06) em vez da entrada na base (07/05).

UPDATE public.assinaturas a
SET
  data_contratacao = c.cliente_desde,
  updated_at = now()
FROM public.clientes c
WHERE c.id = a.cliente_id
  AND a.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND a.status = 'ativo'
  AND c.cliente_desde IS NOT NULL
  AND a.data_contratacao IS DISTINCT FROM c.cliente_desde
  AND c.cliente_desde >= DATE '2025-01-01'
  AND (c.origem_canal IS NULL OR c.origem_canal <> 'migracao');

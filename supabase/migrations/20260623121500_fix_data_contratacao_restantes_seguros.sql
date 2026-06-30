-- Corrige só casos seguros: data_contratacao à frente de cliente_desde (bug de cadastro),
-- sem alterar migração histórica (origem migracao ou contrato anterior à entrada na base).

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
  AND (c.origem_canal IS NULL OR c.origem_canal <> 'migracao')
  AND a.data_contratacao > c.cliente_desde
  AND (
    c.cliente_desde >= DATE '2025-01-01'
    OR (a.data_contratacao >= DATE '2026-01-01' AND a.created_at::date >= DATE '2026-05-01')
  );

-- Corrige propostas com pós-venda assumida mas status ainda «aguardando_contrato»
-- (ex.: proposta 039 — reedição do vendedor regravou o status).

UPDATE public.propostas_venda
SET status = 'em_pos_venda',
    updated_at = now()
WHERE status = 'aguardando_contrato'
  AND pos_venda_responsavel_id IS NOT NULL
  AND pos_venda_iniciado_em IS NOT NULL
  AND assinatura_id IS NULL
  AND contrato_gerado_em IS NULL;

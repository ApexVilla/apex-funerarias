-- Pós-venda: responsável pela análise antes de gerar o contrato.

ALTER TABLE public.propostas_venda
  ADD COLUMN IF NOT EXISTS pos_venda_responsavel_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS pos_venda_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pos_venda_observacoes text;

CREATE INDEX IF NOT EXISTS propostas_venda_pos_venda_responsavel_idx
  ON public.propostas_venda (pos_venda_responsavel_id)
  WHERE pos_venda_responsavel_id IS NOT NULL;

COMMENT ON COLUMN public.propostas_venda.pos_venda_responsavel_id IS
  'Usuário que assumiu a análise pós-venda da proposta.';
COMMENT ON COLUMN public.propostas_venda.pos_venda_iniciado_em IS
  'Momento em que a pós-venda foi iniciada (assumir análise).';
COMMENT ON COLUMN public.propostas_venda.pos_venda_observacoes IS
  'Observações internas da equipe durante a pós-venda.';

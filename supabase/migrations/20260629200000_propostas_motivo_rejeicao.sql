-- Motivo e auditoria ao rejeitar proposta comercial
ALTER TABLE public.propostas_venda
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text,
  ADD COLUMN IF NOT EXISTS rejeitada_em timestamptz,
  ADD COLUMN IF NOT EXISTS rejeitada_por uuid REFERENCES public.users(id);

COMMENT ON COLUMN public.propostas_venda.motivo_rejeicao IS 'Motivo informado pela equipe ao rejeitar a proposta.';
COMMENT ON COLUMN public.propostas_venda.rejeitada_em IS 'Data/hora em que a proposta foi rejeitada.';
COMMENT ON COLUMN public.propostas_venda.rejeitada_por IS 'Usuário que rejeitou a proposta.';

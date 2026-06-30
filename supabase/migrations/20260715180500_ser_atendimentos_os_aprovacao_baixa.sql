-- Aprovação da OS e registro de baixa no caixa

ALTER TABLE public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS os_aprovada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS os_aprovada_em timestamptz,
  ADD COLUMN IF NOT EXISTS os_aprovada_por text,
  ADD COLUMN IF NOT EXISTS baixa_registrada_em timestamptz;

COMMENT ON COLUMN public.ser_atendimentos.os_aprovada IS 'Ordem de serviço aprovada pela supervisão antes do recebimento.';
COMMENT ON COLUMN public.ser_atendimentos.baixa_registrada_em IS 'Data/hora em que o recebimento foi registrado no caixa.';

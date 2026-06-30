-- Desconto comercial no atendimento (valor + responsável pela autorização)

ALTER TABLE public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS valor_desconto_centavos bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_autorizado_por text;

COMMENT ON COLUMN public.ser_atendimentos.valor_desconto_centavos IS
  'Valor do desconto aplicado ao atendimento, em centavos (subtraído do subtotal de serviços + produtos).';

COMMENT ON COLUMN public.ser_atendimentos.desconto_autorizado_por IS
  'Nome de quem autorizou o desconto comercial.';

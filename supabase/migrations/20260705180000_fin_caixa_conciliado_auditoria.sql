-- Auditoria de conciliação manual no caixa.

ALTER TABLE public.fin_caixa_movimentos
    ADD COLUMN IF NOT EXISTS conciliado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS conciliado_por UUID;

COMMENT ON COLUMN public.fin_caixa_movimentos.conciliado_em IS 'Data/hora em que o operador confirmou a conciliação.';
COMMENT ON COLUMN public.fin_caixa_movimentos.conciliado_por IS 'Usuário que confirmou a conciliação.';

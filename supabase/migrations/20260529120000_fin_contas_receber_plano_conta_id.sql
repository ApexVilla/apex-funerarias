-- Classificação da receita (natureza) + embed no app Contas a Receber
ALTER TABLE public.fin_contas_receber
    ADD COLUMN IF NOT EXISTS plano_conta_id uuid REFERENCES public.fin_plano_contas (id);

CREATE INDEX IF NOT EXISTS idx_fin_contas_receber_plano_conta_id
    ON public.fin_contas_receber (plano_conta_id);

COMMENT ON COLUMN public.fin_contas_receber.plano_conta_id IS 'Natureza financeira (conta de receita no plano de contas).';

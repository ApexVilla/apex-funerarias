-- Conciliação manual por movimento de caixa (padrão: não conciliado).

ALTER TABLE public.fin_caixa_movimentos
    ADD COLUMN IF NOT EXISTS conciliado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fin_caixa_movimentos.conciliado IS
    'Marcado pelo operador após conferir o lançamento com extrato bancário ou comprovante.';

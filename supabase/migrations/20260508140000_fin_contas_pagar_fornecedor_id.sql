-- Vincula conta a pagar ao cadastro de fornecedores (estoque)
ALTER TABLE public.fin_contas_pagar
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_fornecedor_id
  ON public.fin_contas_pagar(fornecedor_id)
  WHERE fornecedor_id IS NOT NULL;

-- Migration to add advanced delivery tracking columns to public.assinaturas table
ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS entrega_entregador TEXT,
  ADD COLUMN IF NOT EXISTS entrega_data_saida DATE,
  ADD COLUMN IF NOT EXISTS entrega_data_retorno DATE,
  ADD COLUMN IF NOT EXISTS entrega_obs TEXT;

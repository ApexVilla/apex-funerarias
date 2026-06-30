-- Migration to add delivery confirmation columns to public.assinaturas table
ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS entrega_para TEXT,
  ADD COLUMN IF NOT EXISTS entrega_recebedor TEXT,
  ADD COLUMN IF NOT EXISTS entrega_data DATE;

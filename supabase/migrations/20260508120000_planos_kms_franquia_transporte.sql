-- Franquia de quilometragem para transporte/remoção (documentação OS e controle)
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS kms_franquia_transporte integer;

COMMENT ON COLUMN public.planos.kms_franquia_transporte IS 'KM previstos inclusos no plano para deslocamentos (remoção/transporte); usado em PDF da OS.';

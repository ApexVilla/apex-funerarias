-- Coluna segmento do plano (funerário, odonto, etc.) — usada pelo PlanoForm / PlanosStore.
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS tipo character varying(32) DEFAULT 'funerario';

COMMENT ON COLUMN public.planos.tipo IS 'Segmento: funerario, odontologico, optica, saude';

UPDATE public.planos
SET tipo = 'funerario'
WHERE tipo IS NULL OR trim(tipo) = '';

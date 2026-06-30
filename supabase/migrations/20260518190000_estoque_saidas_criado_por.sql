-- Quem registrou a saída (rascunho ou confirmação).

ALTER TABLE public.estoque_saidas
    ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES public.users (id) ON DELETE SET NULL;

UPDATE public.estoque_saidas
SET criado_por = processado_por
WHERE criado_por IS NULL
  AND processado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_saidas_criado_por ON public.estoque_saidas (criado_por);

-- Vínculo opcional de contrato (assinatura) à filial — usado em filtros e numeração por unidade.
ALTER TABLE public.assinaturas
    ADD COLUMN IF NOT EXISTS filial_id UUID REFERENCES public.filiais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assinaturas_filial ON public.assinaturas (filial_id);

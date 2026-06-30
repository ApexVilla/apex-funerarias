-- Unidade de origem do cobrador (ex.: Aparecida, Catalão, Ipameri — filiais da empresa).
ALTER TABLE public.cobradores
    ADD COLUMN IF NOT EXISTS filial_id uuid REFERENCES public.filiais (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cobradores.filial_id IS 'Filial/unidade à qual o cobrador pertence (origem operacional).';

CREATE INDEX IF NOT EXISTS idx_cobradores_filial_id ON public.cobradores (filial_id);

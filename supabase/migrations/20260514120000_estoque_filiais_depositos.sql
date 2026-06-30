-- Filiais e depósitos para organizar estoque (ex.: base x estoque em veículo/motorista)

CREATE TABLE IF NOT EXISTS public.filiais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_filiais_empresa ON public.filiais (empresa_id);
CREATE INDEX IF NOT EXISTS idx_filiais_empresa_ativo ON public.filiais (empresa_id, ativo);

CREATE TABLE IF NOT EXISTS public.estoque_depositos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    filial_id UUID REFERENCES public.filiais(id) ON DELETE SET NULL,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'central' CHECK (tipo IN ('central', 'motorista', 'outro')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_depositos_empresa ON public.estoque_depositos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_estoque_depositos_filial ON public.estoque_depositos (filial_id);

ALTER TABLE public.ser_produtos
    ADD COLUMN IF NOT EXISTS filial_id UUID REFERENCES public.filiais(id) ON DELETE SET NULL;

ALTER TABLE public.ser_produtos
    ADD COLUMN IF NOT EXISTS deposito_id UUID REFERENCES public.estoque_depositos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ser_produtos_filial ON public.ser_produtos (filial_id);
CREATE INDEX IF NOT EXISTS idx_ser_produtos_deposito ON public.ser_produtos (deposito_id);

ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS filiais_empresa_policy ON public.filiais;
CREATE POLICY filiais_empresa_policy ON public.filiais
    FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()))
    WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));

ALTER TABLE public.estoque_depositos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_depositos_empresa_policy ON public.estoque_depositos;
CREATE POLICY estoque_depositos_empresa_policy ON public.estoque_depositos
    FOR ALL
    USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()))
    WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));

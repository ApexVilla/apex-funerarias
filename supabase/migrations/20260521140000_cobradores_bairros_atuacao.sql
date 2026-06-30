-- Bairros vinculados à rota do cobrador (na cidade/região de atuação).
ALTER TABLE public.cobradores
    ADD COLUMN IF NOT EXISTS bairros_atuacao jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.cobradores.bairros_atuacao IS 'Lista JSON de nomes de bairros atendidos por este cobrador na região de atuação.';

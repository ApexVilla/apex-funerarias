-- Módulo de Contagem de Estoque (Inventário)

CREATE TABLE IF NOT EXISTS public.estoque_contagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    codigo VARCHAR(30) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'geral' CHECK (tipo IN ('geral', 'categoria', 'produto', 'item')),
    status VARCHAR(20) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_andamento', 'finalizada', 'cancelada')),
    titulo VARCHAR(200) NOT NULL,
    observacoes TEXT,
    filtro_categoria VARCHAR(100),
    total_itens INTEGER NOT NULL DEFAULT 0,
    itens_contados INTEGER NOT NULL DEFAULT 0,
    divergencias INTEGER NOT NULL DEFAULT 0,
    criado_por UUID,
    finalizado_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estoque_contagem_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contagem_id UUID NOT NULL REFERENCES public.estoque_contagens(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.ser_produtos(id),
    produto_codigo VARCHAR(30) NOT NULL,
    produto_nome VARCHAR(200) NOT NULL,
    categoria VARCHAR(100) DEFAULT 'Sem Categoria',
    estoque_sistema INTEGER NOT NULL DEFAULT 0,
    quantidade_contada INTEGER,
    divergencia INTEGER NOT NULL DEFAULT 0,
    observacao TEXT DEFAULT '',
    contado BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_contagens_empresa ON public.estoque_contagens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_estoque_contagens_status ON public.estoque_contagens(status);
CREATE INDEX IF NOT EXISTS idx_estoque_contagem_itens_contagem ON public.estoque_contagem_itens(contagem_id);
CREATE INDEX IF NOT EXISTS idx_estoque_contagem_itens_produto ON public.estoque_contagem_itens(produto_id);

ALTER TABLE public.estoque_contagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_contagem_itens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estoque_contagens' AND policyname = 'estoque_contagens_empresa_policy') THEN
        CREATE POLICY estoque_contagens_empresa_policy ON public.estoque_contagens
            FOR ALL USING (
                empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid())
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estoque_contagem_itens' AND policyname = 'estoque_contagem_itens_policy') THEN
        CREATE POLICY estoque_contagem_itens_policy ON public.estoque_contagem_itens
            FOR ALL USING (
                contagem_id IN (
                    SELECT id FROM public.estoque_contagens
                    WHERE empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid())
                )
            );
            
    END IF;
END $$;

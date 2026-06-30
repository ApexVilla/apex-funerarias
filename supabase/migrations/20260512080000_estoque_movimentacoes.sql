-- Tabela de movimentações de estoque (rastreabilidade de entradas, saídas, ajustes, transferências)

CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.ser_produtos(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'transferencia')),
    quantidade NUMERIC(12,3) NOT NULL,
    estoque_anterior NUMERIC(12,3) NOT NULL DEFAULT 0,
    estoque_posterior NUMERIC(12,3) NOT NULL DEFAULT 0,
    motivo TEXT,
    referencia_tipo TEXT CHECK (referencia_tipo IN ('entrada', 'atendimento', 'ajuste', 'kit', 'transferencia')),
    referencia_id UUID,
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estoque_movimentacoes_empresa ON public.estoque_movimentacoes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_estoque_movimentacoes_produto ON public.estoque_movimentacoes (produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_movimentacoes_created ON public.estoque_movimentacoes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_movimentacoes_empresa_created ON public.estoque_movimentacoes (empresa_id, created_at DESC);

ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso por empresa - Movimentações Estoque" ON public.estoque_movimentacoes
    FOR ALL USING (empresa_id IN (SELECT empresa_id FROM public.users WHERE id = auth.uid()));

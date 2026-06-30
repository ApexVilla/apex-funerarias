-- Adiciona registro de quem lançou cada movimento no caixa para auditoria.
ALTER TABLE public.fin_caixa_movimentos
    ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_caixa_movimentos_usuario
    ON public.fin_caixa_movimentos(usuario_id)
    WHERE usuario_id IS NOT NULL;

-- Backfill: usa usuario_abertura_id da sessão como melhor estimativa para
-- movimentações antigas sem responsável explícito.
UPDATE public.fin_caixa_movimentos m
SET usuario_id = s.usuario_abertura_id
FROM public.fin_caixa_sessoes s
WHERE m.sessao_id = s.id
  AND m.usuario_id IS NULL
  AND s.usuario_abertura_id IS NOT NULL;

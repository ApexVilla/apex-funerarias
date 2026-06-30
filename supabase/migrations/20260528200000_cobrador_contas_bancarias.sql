-- Caixas/contas de destino vinculados ao cobrador (baixa em campo usa o caixa dele).

CREATE TABLE IF NOT EXISTS public.cobrador_contas_bancarias (
    cobrador_id uuid NOT NULL REFERENCES public.cobradores (id) ON DELETE CASCADE,
    conta_bancaria_id uuid NOT NULL REFERENCES public.fin_contas_bancarias (id) ON DELETE CASCADE,
    principal boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cobrador_id, conta_bancaria_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cobrador_conta_principal_unica
    ON public.cobrador_contas_bancarias (cobrador_id)
    WHERE principal = true;

CREATE INDEX IF NOT EXISTS idx_cobrador_contas_conta
    ON public.cobrador_contas_bancarias (conta_bancaria_id);

COMMENT ON TABLE public.cobrador_contas_bancarias IS
    'Contas/caixas que o cobrador pode usar como destino ao receber em campo.';

ALTER TABLE public.cobrador_contas_bancarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cobrador_contas_bancarias_select ON public.cobrador_contas_bancarias;
CREATE POLICY cobrador_contas_bancarias_select ON public.cobrador_contas_bancarias
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.cobradores c
            WHERE c.id = cobrador_id
              AND public.rls_empresa_ou_do_mesmo_grupo(c.empresa_id)
        )
    );

DROP POLICY IF EXISTS cobrador_contas_bancarias_mutate ON public.cobrador_contas_bancarias;
CREATE POLICY cobrador_contas_bancarias_mutate ON public.cobrador_contas_bancarias
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.cobradores c
            WHERE c.id = cobrador_id
              AND public.rls_empresa_ou_do_mesmo_grupo(c.empresa_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.cobradores c
            WHERE c.id = cobrador_id
              AND public.rls_empresa_ou_do_mesmo_grupo(c.empresa_id)
        )
    );

-- Visibilidade de planos por unidade (CNPJ) do grupo — evita duplicar o mesmo plano em cada empresa.

CREATE TABLE IF NOT EXISTS public.planos_empresas (
    plano_id uuid NOT NULL REFERENCES public.planos (id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plano_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_planos_empresas_empresa_id ON public.planos_empresas (empresa_id);

COMMENT ON TABLE public.planos_empresas IS
    'Unidades do grupo em que o plano pode ser vendido/exibido (Onix, Fênix, filiais, etc.).';

-- Plano legado: uma linha por empresa_id do próprio registro
INSERT INTO public.planos_empresas (plano_id, empresa_id)
SELECT p.id, p.empresa_id
FROM public.planos p
WHERE p.deleted_at IS NULL
  AND p.empresa_id IS NOT NULL
ON CONFLICT (plano_id, empresa_id) DO NOTHING;

ALTER TABLE public.planos_empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planos_empresas_select ON public.planos_empresas;
CREATE POLICY planos_empresas_select ON public.planos_empresas
    FOR SELECT TO authenticated
    USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS planos_empresas_insert ON public.planos_empresas;
CREATE POLICY planos_empresas_insert ON public.planos_empresas
    FOR INSERT TO authenticated
    WITH CHECK (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_pode_gerenciar_planos()
    );

DROP POLICY IF EXISTS planos_empresas_delete ON public.planos_empresas;
CREATE POLICY planos_empresas_delete ON public.planos_empresas
    FOR DELETE TO authenticated
    USING (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_pode_gerenciar_planos()
    );

GRANT SELECT, INSERT, DELETE ON public.planos_empresas TO authenticated;

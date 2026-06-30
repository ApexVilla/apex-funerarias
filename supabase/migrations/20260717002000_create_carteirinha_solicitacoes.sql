-- Criação da tabela para solicitações de carteirinhas
CREATE TABLE IF NOT EXISTS public.carteirinha_solicitacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    assinatura_id UUID NOT NULL REFERENCES public.assinaturas(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    pessoa_tipo VARCHAR(20) NOT NULL CHECK (pessoa_tipo IN ('titular', 'beneficiario')),
    pessoa_id UUID NOT NULL,
    pessoa_nome VARCHAR(255) NOT NULL,
    conta_receber_id UUID REFERENCES public.fin_contas_receber(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    printed_at TIMESTAMPTZ
);

-- Habilitar RLS
ALTER TABLE public.carteirinha_solicitacoes ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS cs_select_empresa ON public.carteirinha_solicitacoes;
CREATE POLICY cs_select_empresa ON public.carteirinha_solicitacoes
    FOR SELECT TO authenticated
    USING (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    );

-- INSERT
DROP POLICY IF EXISTS cs_insert_staff ON public.carteirinha_solicitacoes;
CREATE POLICY cs_insert_staff ON public.carteirinha_solicitacoes
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    );

-- UPDATE
DROP POLICY IF EXISTS cs_update_staff ON public.carteirinha_solicitacoes;
CREATE POLICY cs_update_staff ON public.carteirinha_solicitacoes
    FOR UPDATE TO authenticated
    USING (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    )
    WITH CHECK (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    );

-- DELETE
DROP POLICY IF EXISTS cs_delete_staff ON public.carteirinha_solicitacoes;
CREATE POLICY cs_delete_staff ON public.carteirinha_solicitacoes
    FOR DELETE TO authenticated
    USING (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    );

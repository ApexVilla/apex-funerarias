-- Auditoria de alterações e ações no módulo de comissão operacional

CREATE TABLE IF NOT EXISTS public.comissao_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    acao TEXT NOT NULL,
    entidade_tipo TEXT,
    entidade_id TEXT,
    colaborador_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    colaborador_nome TEXT,
    campo_alterado TEXT,
    valor_anterior TEXT,
    valor_novo TEXT,
    descricao TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    usuario_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    usuario_nome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comissao_auditoria_empresa_data
    ON public.comissao_auditoria (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comissao_auditoria_colaborador
    ON public.comissao_auditoria (colaborador_id, created_at DESC);

COMMENT ON TABLE public.comissao_auditoria IS 'Histórico de alterações e ações no módulo de comissões (configuração, pagamentos, relatórios)';

ALTER TABLE public.comissao_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_comissao_auditoria ON public.comissao_auditoria;
CREATE POLICY select_comissao_auditoria ON public.comissao_auditoria
FOR SELECT TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS insert_comissao_auditoria ON public.comissao_auditoria;
CREATE POLICY insert_comissao_auditoria ON public.comissao_auditoria
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
);

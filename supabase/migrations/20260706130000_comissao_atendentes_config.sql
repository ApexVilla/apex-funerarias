-- Migration to configure commission for attendants and funeral agents

-- 1. Add atendente_id and agente_funerario_id to public.ser_atendimentos
ALTER TABLE public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS atendente_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agente_funerario_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Create public.comissao_config_padrao table
CREATE TABLE IF NOT EXISTS public.comissao_config_padrao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cargo TEXT NOT NULL CHECK (cargo IN ('atendente', 'agente_funerario', 'vendedor')),
    tipo_comissao TEXT NOT NULL CHECK (tipo_comissao IN ('percentual', 'fixo')) DEFAULT 'percentual',
    valor NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, cargo)
);

-- Enable RLS on comissao_config_padrao
ALTER TABLE public.comissao_config_padrao ENABLE ROW LEVEL SECURITY;

-- Policies for comissao_config_padrao
DROP POLICY IF EXISTS select_comissao_config ON public.comissao_config_padrao;
CREATE POLICY select_comissao_config ON public.comissao_config_padrao
FOR SELECT TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
);

DROP POLICY IF EXISTS insert_comissao_config ON public.comissao_config_padrao;
CREATE POLICY insert_comissao_config ON public.comissao_config_padrao
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

DROP POLICY IF EXISTS update_comissao_config ON public.comissao_config_padrao;
CREATE POLICY update_comissao_config ON public.comissao_config_padrao
FOR UPDATE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
)
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

DROP POLICY IF EXISTS delete_comissao_config ON public.comissao_config_padrao;
CREATE POLICY delete_comissao_config ON public.comissao_config_padrao
FOR DELETE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

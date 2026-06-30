-- Módulo de comissões: base operacional + regras híbridas (% + valor fixo) e override por plano

-- 1. Campos de vínculo em atendimentos (OS)
ALTER TABLE public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS atendente_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agente_funerario_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ser_atendimentos_atendente_id ON public.ser_atendimentos(atendente_id);
CREATE INDEX IF NOT EXISTS idx_ser_atendimentos_agente_funerario_id ON public.ser_atendimentos(agente_funerario_id);

-- 2. Configuração padrão por empresa e cargo
CREATE TABLE IF NOT EXISTS public.comissao_config_padrao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cargo TEXT NOT NULL CHECK (cargo IN ('atendente', 'agente_funerario', 'vendedor')),
    tipo_comissao TEXT NOT NULL CHECK (tipo_comissao IN ('percentual', 'fixo')) DEFAULT 'percentual',
    valor NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    percentual NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    valor_fixo_centavos INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, cargo)
);

ALTER TABLE public.comissao_config_padrao
  ADD COLUMN IF NOT EXISTS percentual NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS valor_fixo_centavos INTEGER NOT NULL DEFAULT 0;

-- Migra valores legados (tipo único) para o modelo híbrido
UPDATE public.comissao_config_padrao
SET
  percentual = CASE WHEN tipo_comissao = 'percentual' THEN valor ELSE percentual END,
  valor_fixo_centavos = CASE
    WHEN tipo_comissao = 'fixo' THEN ROUND(valor * 100)::integer
    ELSE valor_fixo_centavos
  END
WHERE percentual = 0 AND valor_fixo_centavos = 0 AND valor > 0;

ALTER TABLE public.comissao_config_padrao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_comissao_config ON public.comissao_config_padrao;
CREATE POLICY select_comissao_config ON public.comissao_config_padrao
FOR SELECT TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

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

-- 3. Comissão customizada por colaborador (users)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS comissao_tipo text CHECK (comissao_tipo IS NULL OR comissao_tipo IN ('percentual', 'fixo')),
  ADD COLUMN IF NOT EXISTS comissao_valor numeric(12, 2),
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric(5, 2),
  ADD COLUMN IF NOT EXISTS comissao_fixo_centavos integer;

COMMENT ON COLUMN public.users.comissao_percentual IS 'Percentual customizado do colaborador sobre base da comissão (adesão ou OS)';
COMMENT ON COLUMN public.users.comissao_fixo_centavos IS 'Valor fixo customizado por venda/OS do colaborador (centavos)';

UPDATE public.users
SET
  comissao_percentual = CASE WHEN comissao_tipo = 'percentual' THEN comissao_valor ELSE comissao_percentual END,
  comissao_fixo_centavos = CASE
    WHEN comissao_tipo = 'fixo' THEN ROUND(comissao_valor * 100)::integer
    ELSE comissao_fixo_centavos
  END
WHERE comissao_tipo IS NOT NULL
  AND comissao_valor IS NOT NULL
  AND comissao_percentual IS NULL
  AND comissao_fixo_centavos IS NULL;

-- 4. Comissão fixa por plano (ex.: bônus Plano Ônix)
ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS comissao_venda_fixa_centavos integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.planos.comissao_venda_fixa_centavos IS 'Bônus fixo (centavos) pago ao vendedor por venda deste plano, cumulativo com o percentual';

-- 5. Override vendedor + plano (ex.: agente com 6% + R$ fixo só no Ônix)
CREATE TABLE IF NOT EXISTS public.comissao_vendedor_plano (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plano_id UUID NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
    percentual NUMERIC(5, 2),
    valor_fixo_centavos INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (usuario_id, plano_id)
);

CREATE INDEX IF NOT EXISTS idx_comissao_vendedor_plano_usuario ON public.comissao_vendedor_plano(usuario_id);
CREATE INDEX IF NOT EXISTS idx_comissao_vendedor_plano_plano ON public.comissao_vendedor_plano(plano_id);

ALTER TABLE public.comissao_vendedor_plano ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_comissao_vendedor_plano ON public.comissao_vendedor_plano;
CREATE POLICY select_comissao_vendedor_plano ON public.comissao_vendedor_plano
FOR SELECT TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS insert_comissao_vendedor_plano ON public.comissao_vendedor_plano;
CREATE POLICY insert_comissao_vendedor_plano ON public.comissao_vendedor_plano
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

DROP POLICY IF EXISTS update_comissao_vendedor_plano ON public.comissao_vendedor_plano;
CREATE POLICY update_comissao_vendedor_plano ON public.comissao_vendedor_plano
FOR UPDATE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
)
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

DROP POLICY IF EXISTS delete_comissao_vendedor_plano ON public.comissao_vendedor_plano;
CREATE POLICY delete_comissao_vendedor_plano ON public.comissao_vendedor_plano
FOR DELETE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

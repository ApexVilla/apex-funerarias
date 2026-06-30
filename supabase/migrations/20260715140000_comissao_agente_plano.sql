-- Comissão operacional (agente funerário / atendente) por plano e overrides por colaborador+plano

ALTER TABLE public.planos
  ADD COLUMN IF NOT EXISTS comissao_agente_percentual NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_agente_fixo_centavos BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_atendente_percentual NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_atendente_fixo_centavos BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.planos.comissao_agente_percentual IS 'Percentual sobre faturamento da OS pago ao agente funerário quando o cliente possui este plano';
COMMENT ON COLUMN public.planos.comissao_agente_fixo_centavos IS 'Valor fixo por OS (centavos) pago ao agente funerário para clientes deste plano';
COMMENT ON COLUMN public.planos.comissao_atendente_percentual IS 'Percentual sobre faturamento da OS pago ao atendente quando o cliente possui este plano';
COMMENT ON COLUMN public.planos.comissao_atendente_fixo_centavos IS 'Valor fixo por OS (centavos) pago ao atendente para clientes deste plano';

CREATE TABLE IF NOT EXISTS public.comissao_operacional_plano (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plano_id UUID NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  cargo TEXT NOT NULL CHECK (cargo IN ('atendente', 'agente_funerario')),
  percentual NUMERIC(8,2),
  valor_fixo_centavos BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, plano_id, cargo)
);

CREATE INDEX IF NOT EXISTS idx_comissao_operacional_plano_usuario ON public.comissao_operacional_plano(usuario_id);
CREATE INDEX IF NOT EXISTS idx_comissao_operacional_plano_plano ON public.comissao_operacional_plano(plano_id);
CREATE INDEX IF NOT EXISTS idx_comissao_operacional_plano_cargo ON public.comissao_operacional_plano(cargo);

ALTER TABLE public.comissao_operacional_plano ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_comissao_operacional_plano ON public.comissao_operacional_plano;
CREATE POLICY select_comissao_operacional_plano ON public.comissao_operacional_plano
FOR SELECT TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS insert_comissao_operacional_plano ON public.comissao_operacional_plano;
CREATE POLICY insert_comissao_operacional_plano ON public.comissao_operacional_plano
FOR INSERT TO authenticated
WITH CHECK (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

DROP POLICY IF EXISTS update_comissao_operacional_plano ON public.comissao_operacional_plano;
CREATE POLICY update_comissao_operacional_plano ON public.comissao_operacional_plano
FOR UPDATE TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
)
WITH CHECK (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

DROP POLICY IF EXISTS delete_comissao_operacional_plano ON public.comissao_operacional_plano;
CREATE POLICY delete_comissao_operacional_plano ON public.comissao_operacional_plano
FOR DELETE TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro')
);

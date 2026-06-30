-- Acertos manuais de cobrança em campo (comissão de cobradores)

CREATE TABLE IF NOT EXISTS public.cob_acertos_manuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cobrador_id uuid NOT NULL REFERENCES public.cobradores(id) ON DELETE RESTRICT,
  data date NOT NULL DEFAULT CURRENT_DATE,
  periodo_info text,
  valores jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_arrecadado_centavos bigint NOT NULL CHECK (total_arrecadado_centavos >= 0),
  comissao_calculada_centavos bigint NOT NULL CHECK (comissao_calculada_centavos >= 0),
  comissao_final_centavos bigint NOT NULL CHECK (comissao_final_centavos >= 0),
  bonus_centavos bigint NOT NULL DEFAULT 0 CHECK (bonus_centavos >= 0),
  desconto_centavos bigint NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
  liquido_centavos bigint NOT NULL,
  observacoes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cob_acertos_manuais_empresa_data
  ON public.cob_acertos_manuais (empresa_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_cob_acertos_manuais_cobrador
  ON public.cob_acertos_manuais (cobrador_id, data DESC);

COMMENT ON TABLE public.cob_acertos_manuais IS
  'Acerto manual de valores arrecadados por cobrador em campo, com cálculo de comissão e emissão de recibo.';

ALTER TABLE public.cob_acertos_manuais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cob_acertos_manuais_select ON public.cob_acertos_manuais;
CREATE POLICY cob_acertos_manuais_select ON public.cob_acertos_manuais
  FOR SELECT USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_acertos_manuais_insert ON public.cob_acertos_manuais;
CREATE POLICY cob_acertos_manuais_insert ON public.cob_acertos_manuais
  FOR INSERT WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_acertos_manuais_delete ON public.cob_acertos_manuais;
CREATE POLICY cob_acertos_manuais_delete ON public.cob_acertos_manuais
  FOR DELETE USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

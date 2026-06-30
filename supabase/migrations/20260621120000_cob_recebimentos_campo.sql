-- Recebimentos de cobradores em campo (API PHP / relatórios de comissão)

CREATE TABLE IF NOT EXISTS public.cob_recebimentos_campo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_receber_id uuid REFERENCES public.fin_contas_receber(id) ON DELETE SET NULL,
  cobranca_pendente_id uuid REFERENCES public.cob_cobrancas_pendentes(id) ON DELETE SET NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  cobrador_id uuid NOT NULL REFERENCES public.cobradores(id) ON DELETE RESTRICT,
  data date NOT NULL DEFAULT CURRENT_DATE,
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  forma_pagamento text NOT NULL DEFAULT 'dinheiro'
    CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao', 'boleto', 'transferencia')),
  status text NOT NULL DEFAULT 'pendente_conferencia'
    CHECK (status IN ('confirmado', 'pendente_conferencia')),
  observacao text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cob_recebimentos_campo_empresa_data
  ON public.cob_recebimentos_campo (empresa_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_cob_recebimentos_campo_cobrador
  ON public.cob_recebimentos_campo (cobrador_id, data DESC);

COMMENT ON TABLE public.cob_recebimentos_campo IS
  'Registro de valores recebidos por cobradores em rota; conferência e comissões.';

ALTER TABLE public.cob_recebimentos_campo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cob_recebimentos_campo_select ON public.cob_recebimentos_campo;
CREATE POLICY cob_recebimentos_campo_select ON public.cob_recebimentos_campo
  FOR SELECT USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_recebimentos_campo_insert ON public.cob_recebimentos_campo;
CREATE POLICY cob_recebimentos_campo_insert ON public.cob_recebimentos_campo
  FOR INSERT WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_recebimentos_campo_update ON public.cob_recebimentos_campo;
CREATE POLICY cob_recebimentos_campo_update ON public.cob_recebimentos_campo
  FOR UPDATE USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_recebimentos_campo_delete ON public.cob_recebimentos_campo;
CREATE POLICY cob_recebimentos_campo_delete ON public.cob_recebimentos_campo
  FOR DELETE USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

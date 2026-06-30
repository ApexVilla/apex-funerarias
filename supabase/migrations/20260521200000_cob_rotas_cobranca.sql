-- Rotas de cobrança por cobrador (bairros → paradas ordenadas)

CREATE TABLE IF NOT EXISTS public.cob_rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cobrador_id uuid NOT NULL REFERENCES public.cobradores(id) ON DELETE RESTRICT,
  data date NOT NULL DEFAULT CURRENT_DATE,
  regiao text NOT NULL DEFAULT '',
  bairros jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'planejada'
    CHECK (status IN ('planejada', 'em_andamento', 'concluida')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cob_rotas_empresa_data ON public.cob_rotas (empresa_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_cob_rotas_cobrador ON public.cob_rotas (cobrador_id, data DESC);

CREATE TABLE IF NOT EXISTS public.cob_rota_paradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.cob_rotas(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cobranca_pendente_id uuid REFERENCES public.cob_cobrancas_pendentes(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL DEFAULT '',
  cliente_bairro text NOT NULL DEFAULT '',
  cliente_endereco text NOT NULL DEFAULT '',
  valor_centavos bigint NOT NULL DEFAULT 0,
  dias_atraso int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'visitado', 'ausente', 'pago')),
  observacao text,
  hora_visita timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cob_rota_paradas_rota ON public.cob_rota_paradas (rota_id, ordem);

ALTER TABLE public.cob_rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cob_rota_paradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cob_rotas_select ON public.cob_rotas;
CREATE POLICY cob_rotas_select ON public.cob_rotas
  FOR SELECT TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_rotas_insert ON public.cob_rotas;
CREATE POLICY cob_rotas_insert ON public.cob_rotas
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_rotas_update ON public.cob_rotas;
CREATE POLICY cob_rotas_update ON public.cob_rotas
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_rotas_delete ON public.cob_rotas;
CREATE POLICY cob_rotas_delete ON public.cob_rotas
  FOR DELETE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS cob_rota_paradas_select ON public.cob_rota_paradas;
CREATE POLICY cob_rota_paradas_select ON public.cob_rota_paradas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cob_rotas r
      WHERE r.id = cob_rota_paradas.rota_id
        AND public.rls_empresa_ou_do_mesmo_grupo(r.empresa_id)
    )
  );

DROP POLICY IF EXISTS cob_rota_paradas_insert ON public.cob_rota_paradas;
CREATE POLICY cob_rota_paradas_insert ON public.cob_rota_paradas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cob_rotas r
      WHERE r.id = cob_rota_paradas.rota_id
        AND public.rls_empresa_ou_do_mesmo_grupo(r.empresa_id)
    )
  );

DROP POLICY IF EXISTS cob_rota_paradas_update ON public.cob_rota_paradas;
CREATE POLICY cob_rota_paradas_update ON public.cob_rota_paradas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cob_rotas r
      WHERE r.id = cob_rota_paradas.rota_id
        AND public.rls_empresa_ou_do_mesmo_grupo(r.empresa_id)
    )
  );

DROP POLICY IF EXISTS cob_rota_paradas_delete ON public.cob_rota_paradas;
CREATE POLICY cob_rota_paradas_delete ON public.cob_rota_paradas
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cob_rotas r
      WHERE r.id = cob_rota_paradas.rota_id
        AND public.rls_empresa_ou_do_mesmo_grupo(r.empresa_id)
    )
  );

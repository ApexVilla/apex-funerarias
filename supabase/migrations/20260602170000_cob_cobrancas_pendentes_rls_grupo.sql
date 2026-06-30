-- Carteira (cobrador / escritório): permitir SELECT/INSERT/UPDATE no grupo econômico,
-- não apenas na empresa cadastral do usuário (ex.: operação em Catalão com users.empresa_id na matriz).

ALTER TABLE public.cob_cobrancas_pendentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cob_cobrancas_pendentes_select ON public.cob_cobrancas_pendentes;
DROP POLICY IF EXISTS cob_cobrancas_pendentes_insert ON public.cob_cobrancas_pendentes;
DROP POLICY IF EXISTS cob_cobrancas_pendentes_update ON public.cob_cobrancas_pendentes;
DROP POLICY IF EXISTS cob_cobrancas_pendentes_delete ON public.cob_cobrancas_pendentes;

CREATE POLICY cob_cobrancas_pendentes_select ON public.cob_cobrancas_pendentes
  FOR SELECT TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY cob_cobrancas_pendentes_insert ON public.cob_cobrancas_pendentes
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY cob_cobrancas_pendentes_update ON public.cob_cobrancas_pendentes
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

CREATE POLICY cob_cobrancas_pendentes_delete ON public.cob_cobrancas_pendentes
  FOR DELETE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

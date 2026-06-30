-- Alinha ser_servicos com ser_produtos: gestores do grupo podem editar serviços das filiais.

DROP POLICY IF EXISTS ser_servicos_empresa_isolation ON public.ser_servicos;
DROP POLICY IF EXISTS "Acesso por empresa - Servicos" ON public.ser_servicos;
DROP POLICY IF EXISTS ser_servicos_empresa_ou_grupo ON public.ser_servicos;

CREATE POLICY ser_servicos_empresa_ou_grupo ON public.ser_servicos
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

-- Hardening de seguranca (Fase 1.3)
-- ser_salas e ser_salas_reservas nao tinham empresa_id e usavam policy
-- "permitir tudo para usuarios autenticados" (USING true / CHECK true),
-- permitindo que qualquer empresa visse/alterasse salas de velorio de
-- outras unidades. Adiciona empresa_id, faz backfill (dados existentes
-- ficam na "Empresa Padrao" 00000000-0000-0000-0000-000000000001 -
-- eram registros sem vinculo e sem reservas) e aplica RLS por tenant.
--
-- ROLLBACK: remover as policies *_tenant, recriar a policy "permitir tudo"
-- e (opcional) DROP COLUMN empresa_id.

-- ser_salas -------------------------------------------------------------------
ALTER TABLE public.ser_salas ADD COLUMN IF NOT EXISTS empresa_id uuid;
UPDATE public.ser_salas
  SET empresa_id = '00000000-0000-0000-0000-000000000001'
  WHERE empresa_id IS NULL;
ALTER TABLE public.ser_salas ALTER COLUMN empresa_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ser_salas_empresa_id_fkey'
  ) THEN
    ALTER TABLE public.ser_salas
      ADD CONSTRAINT ser_salas_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ser_salas_empresa_id ON public.ser_salas(empresa_id);

-- ser_salas_reservas ----------------------------------------------------------
ALTER TABLE public.ser_salas_reservas ADD COLUMN IF NOT EXISTS empresa_id uuid;
UPDATE public.ser_salas_reservas r
  SET empresa_id = s.empresa_id
  FROM public.ser_salas s
  WHERE s.id = r.sala_id AND r.empresa_id IS NULL;
-- fallback para reservas orfas (nao deve existir; total_reservas = 0)
UPDATE public.ser_salas_reservas
  SET empresa_id = '00000000-0000-0000-0000-000000000001'
  WHERE empresa_id IS NULL;
ALTER TABLE public.ser_salas_reservas ALTER COLUMN empresa_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ser_salas_reservas_empresa_id_fkey'
  ) THEN
    ALTER TABLE public.ser_salas_reservas
      ADD CONSTRAINT ser_salas_reservas_empresa_id_fkey
      FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ser_salas_reservas_empresa_id ON public.ser_salas_reservas(empresa_id);

-- Policies --------------------------------------------------------------------
DROP POLICY IF EXISTS "Permitir tudo para usuários autenticados em ser_salas" ON public.ser_salas;
DROP POLICY IF EXISTS ser_salas_tenant_select ON public.ser_salas;
DROP POLICY IF EXISTS ser_salas_tenant_insert ON public.ser_salas;
DROP POLICY IF EXISTS ser_salas_tenant_update ON public.ser_salas;
DROP POLICY IF EXISTS ser_salas_tenant_delete ON public.ser_salas;

CREATE POLICY ser_salas_tenant_select ON public.ser_salas
  FOR SELECT TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY ser_salas_tenant_insert ON public.ser_salas
  FOR INSERT TO authenticated WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY ser_salas_tenant_update ON public.ser_salas
  FOR UPDATE TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY ser_salas_tenant_delete ON public.ser_salas
  FOR DELETE TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS "Permitir tudo para usuários autenticados em ser_salas_reservas" ON public.ser_salas_reservas;
DROP POLICY IF EXISTS ser_salas_reservas_tenant_select ON public.ser_salas_reservas;
DROP POLICY IF EXISTS ser_salas_reservas_tenant_insert ON public.ser_salas_reservas;
DROP POLICY IF EXISTS ser_salas_reservas_tenant_update ON public.ser_salas_reservas;
DROP POLICY IF EXISTS ser_salas_reservas_tenant_delete ON public.ser_salas_reservas;

CREATE POLICY ser_salas_reservas_tenant_select ON public.ser_salas_reservas
  FOR SELECT TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY ser_salas_reservas_tenant_insert ON public.ser_salas_reservas
  FOR INSERT TO authenticated WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY ser_salas_reservas_tenant_update ON public.ser_salas_reservas
  FOR UPDATE TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY ser_salas_reservas_tenant_delete ON public.ser_salas_reservas
  FOR DELETE TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

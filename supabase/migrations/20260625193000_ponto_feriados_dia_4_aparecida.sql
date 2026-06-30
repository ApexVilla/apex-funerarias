-- Feriados de ponto por filial (não conta falta; só colaboradores da filial registrada).

CREATE TABLE IF NOT EXISTS public.ponto_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  filial_id uuid NOT NULL REFERENCES public.filiais(id) ON DELETE CASCADE,
  data date NOT NULL,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (filial_id, data)
);

CREATE INDEX IF NOT EXISTS idx_ponto_feriados_filial_data ON public.ponto_feriados (filial_id, data);
CREATE INDEX IF NOT EXISTS idx_ponto_feriados_empresa_data ON public.ponto_feriados (empresa_id, data);

ALTER TABLE public.ponto_feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ponto_feriados_select ON public.ponto_feriados;
CREATE POLICY ponto_feriados_select ON public.ponto_feriados
FOR SELECT TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS ponto_feriados_insert ON public.ponto_feriados;
CREATE POLICY ponto_feriados_insert ON public.ponto_feriados
FOR INSERT TO authenticated
WITH CHECK (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
  )
);

DROP POLICY IF EXISTS ponto_feriados_update ON public.ponto_feriados;
CREATE POLICY ponto_feriados_update ON public.ponto_feriados
FOR UPDATE TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
  )
)
WITH CHECK (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
  )
);

DROP POLICY IF EXISTS ponto_feriados_delete ON public.ponto_feriados;
CREATE POLICY ponto_feriados_delete ON public.ponto_feriados
FOR DELETE TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
  )
);

-- Corpus Christi 2026 — filial Aparecida de Goiânia (Fênix matriz).
INSERT INTO public.ponto_feriados (empresa_id, filial_id, data, nome)
VALUES (
  '04d81f24-6712-4929-a329-b01d369fe8cb',
  '26b4822a-a209-42c9-8edf-7c3cd72313cb',
  '2026-06-04',
  'Corpus Christi'
)
ON CONFLICT (filial_id, data) DO UPDATE SET nome = EXCLUDED.nome;

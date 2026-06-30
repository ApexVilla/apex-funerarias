-- Folga / atestado lançados manualmente pelo RH na edição do espelho de ponto

CREATE TABLE IF NOT EXISTS public.ponto_dia_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('folga', 'atestado')),
  motivo text,
  registrado_por uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, data)
);

CREATE INDEX IF NOT EXISTS idx_ponto_dia_ocor_user_data
  ON public.ponto_dia_ocorrencias (user_id, data);

CREATE INDEX IF NOT EXISTS idx_ponto_dia_ocor_empresa_data
  ON public.ponto_dia_ocorrencias (empresa_id, data);

ALTER TABLE public.ponto_dia_ocorrencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_ponto_dia_ocorrencias ON public.ponto_dia_ocorrencias;
CREATE POLICY select_ponto_dia_ocorrencias ON public.ponto_dia_ocorrencias
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
      'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
      'gerente', 'supervisao', 'gestor', 'diretoria', 'financeiro', 'rh'
    )
  )
);

DROP POLICY IF EXISTS insert_ponto_dia_ocorrencias ON public.ponto_dia_ocorrencias;
CREATE POLICY insert_ponto_dia_ocorrencias ON public.ponto_dia_ocorrencias
FOR INSERT TO authenticated
WITH CHECK (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
  )
);

DROP POLICY IF EXISTS update_ponto_dia_ocorrencias ON public.ponto_dia_ocorrencias;
CREATE POLICY update_ponto_dia_ocorrencias ON public.ponto_dia_ocorrencias
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

DROP POLICY IF EXISTS delete_ponto_dia_ocorrencias ON public.ponto_dia_ocorrencias;
CREATE POLICY delete_ponto_dia_ocorrencias ON public.ponto_dia_ocorrencias
FOR DELETE TO authenticated
USING (
  public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  AND public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'supervisao', 'gestor', 'diretoria', 'rh'
  )
);

COMMENT ON TABLE public.ponto_dia_ocorrencias IS 'Justificativas de dia (folga ou atestado) lançadas pelo RH no espelho de ponto';

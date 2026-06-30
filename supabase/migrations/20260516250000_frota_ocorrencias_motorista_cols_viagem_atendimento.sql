-- Motorista: campos usados pelo formulário (antes só existiam no PHP / UI).
ALTER TABLE public.frota_motoristas
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS observacao text;

-- Viagem ↔ atendimento (idempotente se migração antiga já rodou).
ALTER TABLE public.frota_viagens
  ADD COLUMN IF NOT EXISTS atendimento_id uuid REFERENCES public.ser_atendimentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_frota_viagens_atendimento
  ON public.frota_viagens(atendimento_id);

-- Ocorrências da frota (antes só rota PHP inexistente no index.php).
CREATE TABLE IF NOT EXISTS public.frota_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  veiculo_id uuid NOT NULL REFERENCES public.frota_veiculos(id) ON DELETE CASCADE,
  motorista_id uuid REFERENCES public.frota_motoristas(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'avaria'
    CHECK (tipo = ANY (ARRAY['acidente'::text, 'multa'::text, 'avaria'::text, 'outro'::text])),
  data_ocorrencia date NOT NULL DEFAULT CURRENT_DATE,
  gravidade text NOT NULL DEFAULT 'leve'
    CHECK (gravidade = ANY (ARRAY['leve'::text, 'media'::text, 'grave'::text])),
  descricao text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status = ANY (ARRAY['pendente'::text, 'em_analise'::text, 'resolvido'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frota_ocorrencias_empresa ON public.frota_ocorrencias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_frota_ocorrencias_veiculo ON public.frota_ocorrencias(veiculo_id);

ALTER TABLE public.frota_ocorrencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frota_ocorrencias_select ON public.frota_ocorrencias;
CREATE POLICY frota_ocorrencias_select ON public.frota_ocorrencias
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS frota_ocorrencias_insert ON public.frota_ocorrencias;
CREATE POLICY frota_ocorrencias_insert ON public.frota_ocorrencias
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS frota_ocorrencias_update ON public.frota_ocorrencias;
CREATE POLICY frota_ocorrencias_update ON public.frota_ocorrencias
  FOR UPDATE TO authenticated
  USING (empresa_id = public.current_empresa_id())
  WITH CHECK (empresa_id = public.current_empresa_id());

DROP POLICY IF EXISTS frota_ocorrencias_delete ON public.frota_ocorrencias;
CREATE POLICY frota_ocorrencias_delete ON public.frota_ocorrencias
  FOR DELETE TO authenticated
  USING (empresa_id = public.current_empresa_id());

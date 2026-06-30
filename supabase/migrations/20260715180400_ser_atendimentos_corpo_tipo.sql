-- Campos de aspecto do corpo e tipo de atendimento (usados pelo formulário e PDFs)

ALTER TABLE public.ser_atendimentos
  ADD COLUMN IF NOT EXISTS tipo_atendimento text NOT NULL DEFAULT 'particular',
  ADD COLUMN IF NOT EXISTS inspecao_interna boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inspecao_externa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coleta_material boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS autoriza_remocao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orientacoes_tecnicas text,
  ADD COLUMN IF NOT EXISTS observacoes_corpo text,
  ADD COLUMN IF NOT EXISTS comentarios_falecido text,
  ADD COLUMN IF NOT EXISTS formulario_preparacao text;

ALTER TABLE public.ser_atendimentos
  DROP CONSTRAINT IF EXISTS ser_atendimentos_tipo_atendimento_check;

ALTER TABLE public.ser_atendimentos
  ADD CONSTRAINT ser_atendimentos_tipo_atendimento_check
  CHECK (tipo_atendimento IN ('particular', 'plano'));

COMMENT ON COLUMN public.ser_atendimentos.tipo_atendimento IS 'particular ou plano (titular com assinatura ativa).';

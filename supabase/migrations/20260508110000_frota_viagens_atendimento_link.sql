-- Vincular viagens da frota a atendimentos (para remoção/transporte do corpo)
ALTER TABLE public.frota_viagens
  ADD COLUMN IF NOT EXISTS atendimento_id uuid REFERENCES public.ser_atendimentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_frota_viagens_atendimento
  ON public.frota_viagens(atendimento_id);

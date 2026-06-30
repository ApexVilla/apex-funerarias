-- Adicionar paradas às viagens da frota
ALTER TABLE public.frota_viagens ADD COLUMN IF NOT EXISTS paradas jsonb DEFAULT '[]'::jsonb;

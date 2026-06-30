-- FK para join PostgREST estoque_kits -> planos (plano_id)
ALTER TABLE public.estoque_kits
  DROP CONSTRAINT IF EXISTS estoque_kits_plano_id_fkey;

ALTER TABLE public.estoque_kits
  ADD CONSTRAINT estoque_kits_plano_id_fkey
  FOREIGN KEY (plano_id) REFERENCES public.planos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_kits_plano_id ON public.estoque_kits(plano_id);

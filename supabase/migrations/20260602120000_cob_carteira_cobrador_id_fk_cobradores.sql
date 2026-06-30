-- cob_cobrancas_pendentes.cobrador_id deve apontar para public.cobradores (cadastro operacional),
-- não para users. O frontend (ClienteForm, Carteira, Rotas) usa cobradores.id.

ALTER TABLE public.cob_cobrancas_pendentes
  DROP CONSTRAINT IF EXISTS cob_cobrancas_pendentes_cobrador_id_fkey;

ALTER TABLE public.cob_cobrancas_pendentes
  ADD CONSTRAINT cob_cobrancas_pendentes_cobrador_id_fkey
  FOREIGN KEY (cobrador_id) REFERENCES public.cobradores(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cob_cobrancas_pendentes.cobrador_id IS
  'Cobrador da tabela cobradores responsável pela cobrança desta pendência.';

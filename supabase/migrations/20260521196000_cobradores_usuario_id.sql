-- Vínculo entre login (users) e cadastro operacional (cobradores) para filtrar carteira em Cobranças Pendentes.

ALTER TABLE public.cobradores
  ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cobradores.usuario_id IS
  'Usuário do sistema (perfil cobrador) vinculado a este cadastro; usado para filtrar cob_cobrancas_pendentes.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_cobradores_usuario_id_unico
  ON public.cobradores (usuario_id)
  WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cobradores_usuario_id ON public.cobradores (usuario_id);

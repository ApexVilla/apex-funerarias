-- Migration to add custom commission configuration for collaborators in users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS comissao_tipo text CHECK (comissao_tipo IS NULL OR comissao_tipo IN ('percentual', 'fixo')),
  ADD COLUMN IF NOT EXISTS comissao_valor numeric(12, 2);

COMMENT ON COLUMN public.users.comissao_tipo IS 'Tipo de comissão customizada do colaborador (percentual, fixo ou NULL para usar padrão)';
COMMENT ON COLUMN public.users.comissao_valor IS 'Valor da comissão customizada do colaborador (R$ ou %, ou NULL para usar padrão)';

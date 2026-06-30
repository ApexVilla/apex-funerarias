-- Dependentes: data de nascimento opcional no cadastro pelo contrato.
ALTER TABLE public.beneficiarios
  ALTER COLUMN data_nascimento DROP NOT NULL;

COMMENT ON COLUMN public.beneficiarios.data_nascimento IS
  'Data de nascimento do dependente; opcional no cadastro inicial.';

-- CRM: classificação vendedor interno / externo.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_vendedor varchar(20);

COMMENT ON COLUMN public.clientes.tipo_vendedor IS
  'Classificação comercial: interno ou externo.';

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_tipo_vendedor_check;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tipo_vendedor_check
  CHECK (tipo_vendedor IS NULL OR tipo_vendedor IN ('interno', 'externo'));

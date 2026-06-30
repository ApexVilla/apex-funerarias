-- Titular: CPF e data de nascimento opcionais temporariamente no cadastro de clientes.
ALTER TABLE public.clientes
  ALTER COLUMN cpf DROP NOT NULL,
  ALTER COLUMN data_nascimento DROP NOT NULL;

COMMENT ON COLUMN public.clientes.cpf IS 'CPF do titular; opcional até regularização do cadastro.';
COMMENT ON COLUMN public.clientes.data_nascimento IS 'Data de nascimento do titular; opcional até regularização do cadastro.';

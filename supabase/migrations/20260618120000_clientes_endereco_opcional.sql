-- Endereço residencial opcional no cadastro rápido (atendimento particular, etc.).
ALTER TABLE public.clientes
  ALTER COLUMN endereco_cep DROP NOT NULL,
  ALTER COLUMN endereco_logradouro DROP NOT NULL,
  ALTER COLUMN endereco_numero DROP NOT NULL,
  ALTER COLUMN endereco_bairro DROP NOT NULL,
  ALTER COLUMN endereco_cidade DROP NOT NULL,
  ALTER COLUMN endereco_estado DROP NOT NULL;

COMMENT ON COLUMN public.clientes.endereco_cep IS 'CEP residencial; opcional até regularização do cadastro.';

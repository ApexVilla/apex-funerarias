-- E-mail opcional no cadastro de clientes
ALTER TABLE public.clientes
  ALTER COLUMN email DROP NOT NULL;

COMMENT ON COLUMN public.clientes.email IS 'E-mail de contato (opcional)';

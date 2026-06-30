-- Define CNPJ padrão da Fênix Aparecida no banco
ALTER TABLE public.empresas
  ALTER COLUMN cnpj SET DEFAULT '03617822200095';

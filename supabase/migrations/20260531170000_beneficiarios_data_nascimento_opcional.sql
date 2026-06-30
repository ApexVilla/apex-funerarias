-- Data de nascimento opcional em dependentes (cadastro rápido / migração).
ALTER TABLE public.beneficiarios
    ALTER COLUMN data_nascimento DROP NOT NULL;

COMMENT ON COLUMN public.beneficiarios.data_nascimento IS
    'Data de nascimento do dependente; opcional no cadastro inicial.';

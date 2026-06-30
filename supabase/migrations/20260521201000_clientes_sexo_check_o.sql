-- Aceitar também 'O' (valor legado do formulário) além de M, F e Outro.

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_sexo_check;

ALTER TABLE public.clientes ADD CONSTRAINT clientes_sexo_check
  CHECK (
    sexo IS NULL
    OR sexo::text = ANY (ARRAY['M', 'F', 'Outro', 'O']::text[])
  );

COMMENT ON CONSTRAINT clientes_sexo_check ON public.clientes IS
  'Sexo: M, F, Outro (preferido) ou O (legado). NULL permitido.';

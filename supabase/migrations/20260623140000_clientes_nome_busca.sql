-- Busca por nome sem diferenciar acentos/caixa (coluna materializada para ILIKE rápido).

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT extensions.unaccent('unaccent', $1)
$$;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nome_busca text GENERATED ALWAYS AS (
    lower(
      trim(
        regexp_replace(
          public.immutable_unaccent(coalesce(nome, '')),
          '[,;]+',
          ' ',
          'g'
        )
      )
    )
  ) STORED;

ALTER TABLE public.beneficiarios
  ADD COLUMN IF NOT EXISTS nome_busca text GENERATED ALWAYS AS (
    lower(trim(public.immutable_unaccent(coalesce(nome, ''))))
  ) STORED;

CREATE INDEX IF NOT EXISTS clientes_nome_busca_trgm_idx
  ON public.clientes USING gin (nome_busca gin_trgm_ops);

CREATE INDEX IF NOT EXISTS beneficiarios_nome_busca_trgm_idx
  ON public.beneficiarios USING gin (nome_busca gin_trgm_ops);

COMMENT ON COLUMN public.clientes.nome_busca IS 'Nome normalizado (sem acento, minúsculo) para busca textual.';
COMMENT ON COLUMN public.beneficiarios.nome_busca IS 'Nome normalizado (sem acento, minúsculo) para busca textual.';

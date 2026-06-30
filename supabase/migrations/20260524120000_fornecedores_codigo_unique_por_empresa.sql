-- Código de fornecedor: único por empresa (multi-unidade / grupo Fênix).
-- Antes: UNIQUE (codigo) global — a segunda unidade não podia reutilizar 0001, 0002…
-- Depois: par (empresa_id, codigo) único.

ALTER TABLE public.fornecedores DROP CONSTRAINT IF EXISTS fornecedores_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_empresa_id_codigo_uidx
  ON public.fornecedores (empresa_id, codigo);

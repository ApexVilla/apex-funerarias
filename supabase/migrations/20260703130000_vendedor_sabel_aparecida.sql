-- Vendedora Isabel Rodrigues (Aparecida) — disponível no cadastro de contrato/cliente.
-- Sem login no sistema; apenas catálogo para vincular vendedor_id.

INSERT INTO public.users (
  id,
  codigo,
  nome,
  email,
  password,
  role,
  empresa_id,
  ativo,
  permissoes
)
VALUES (
  '7c9e1a42-8b3d-4f56-9e01-2a3b4c5d6e7f',
  'USR-7C9E1A42',
  'ISABEL RODRIGUES DA SILVA BATISTA',
  'sabel.batista@fenixfuneraria.com',
  'SEM_LOGIN',
  'vendedor',
  '04d81f24-6712-4929-a329-b01d369fe8cb',
  true,
  '{}'::jsonb
)
ON CONFLICT (email) DO UPDATE
SET
  nome = EXCLUDED.nome,
  role = EXCLUDED.role,
  empresa_id = EXCLUDED.empresa_id,
  ativo = true,
  updated_at = now();

-- Migration to add Recepção and Auxiliar de Serviços Gerais roles to user_roles catalog
INSERT INTO public.user_roles (codigo, nome, ativo)
VALUES
  ('recepcao', 'Recepção', true),
  ('auxiliar_servicos_gerais', 'Auxiliar de Serviços Gerais', true)
ON CONFLICT (codigo) DO UPDATE
SET
  nome = EXCLUDED.nome,
  ativo = EXCLUDED.ativo,
  updated_at = now();

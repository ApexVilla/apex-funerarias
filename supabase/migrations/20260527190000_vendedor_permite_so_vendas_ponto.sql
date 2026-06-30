-- Vendedor: remove flags administrativas salvas indevidamente (gestão de usuários, etc.).
-- O app também aplica teto em `resolverPermissoesUsuarioParaSessao` no login.

UPDATE public.users u
SET permissoes = jsonb_set(
  jsonb_set(
    COALESCE(u.permissoes, '{}'::jsonb),
    '{vendas_propostas,view_todos}',
    'false'::jsonb,
    true
  ),
  '{vendas_propostas,confirm}',
  'false'::jsonb,
  true
)
WHERE lower(COALESCE(u.role, '')) = 'vendedor';

UPDATE public.users u
SET permissoes = jsonb_set(
  COALESCE(u.permissoes, '{}'::jsonb),
  '{cfg_usuarios}',
  '{"liberado":false,"view":false,"create":false,"edit":false,"delete":false}'::jsonb,
  true
)
WHERE lower(COALESCE(u.role, '')) = 'vendedor'
  AND u.permissoes IS NOT NULL;

UPDATE public.users u
SET permissoes = jsonb_set(
  COALESCE(u.permissoes, '{}'::jsonb),
  '{cfg_empresa}',
  '{"liberado":false,"view":false,"edit":false}'::jsonb,
  true
)
WHERE lower(COALESCE(u.role, '')) = 'vendedor'
  AND u.permissoes IS NOT NULL;

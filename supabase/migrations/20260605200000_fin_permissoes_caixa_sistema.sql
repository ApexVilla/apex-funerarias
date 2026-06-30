-- Alinha permissões do sistema (users.permissoes) com regra de caixa por vínculo.

-- Atendentes / vendedores com tesouraria: só caixas vinculados (sem ver todos)
UPDATE public.users
SET permissoes = jsonb_set(
  COALESCE(permissoes, '{}'::jsonb),
  '{fin_tesouraria}',
  COALESCE(permissoes->'fin_tesouraria', '{}'::jsonb)
    || jsonb_build_object(
      'ver_todos_caixas', false,
      'view', COALESCE((permissoes->'fin_tesouraria'->>'view')::boolean, true),
      'liberado', COALESCE((permissoes->'fin_tesouraria'->>'liberado')::boolean, true)
    ),
  true
)
WHERE lower(trim(role::text)) IN (
  'atendente', 'vendedor', 'agentes_funerarios', 'agente_funerario'
)
AND (
  permissoes->'fin_tesouraria' IS NOT NULL
  OR permissoes ? 'fin_baixa_parcelas'
);

-- Gestão financeira: ver todos os caixas da unidade
UPDATE public.users
SET permissoes = jsonb_set(
  COALESCE(permissoes, '{}'::jsonb),
  '{fin_tesouraria}',
  COALESCE(permissoes->'fin_tesouraria', '{}'::jsonb)
    || '{"ver_todos_caixas": true}'::jsonb,
  true
)
WHERE lower(trim(role::text)) IN (
  'admin', 'admin_empresa', 'admin_sistema', 'administrador_geral', 'super_admin',
  'gerente', 'gestor', 'diretoria', 'supervisao', 'financeiro'
);

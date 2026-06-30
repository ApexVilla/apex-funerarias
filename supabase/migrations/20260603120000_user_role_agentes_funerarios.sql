-- Cargo oficial: Agentes Funerários (plural, exibição no cadastro de usuários)

INSERT INTO public.user_roles (codigo, nome, ativo)
VALUES ('agentes_funerarios', 'Agentes Funerários', true)
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome, ativo = true, updated_at = now();

-- Alinha o perfil legado ao mesmo nome exibido
UPDATE public.user_roles
SET nome = 'Agentes Funerários', updated_at = now()
WHERE codigo = 'agente_funerario';

COMMENT ON TABLE public.user_roles IS
  'Catálogo de cargos/perfil de usuário. agentes_funerarios = Agentes Funerários; agente_funerario mantido por compatibilidade.';

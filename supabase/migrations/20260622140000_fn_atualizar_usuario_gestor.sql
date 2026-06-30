-- Atualização de usuário por gestores (evita falhas silenciosas de RLS no PostgREST).
-- Inclui perfil administrador_geral nas funções de visão/gestão do grupo.

INSERT INTO public.user_roles (codigo, nome, ativo)
VALUES ('administrador_geral', 'Administrador Geral', true)
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome, ativo = EXCLUDED.ativo, updated_at = now();

CREATE OR REPLACE FUNCTION public.current_user_pode_ver_grupo_economico()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SET LOCAL row_security = off;
  SELECT lower(nullif(trim(COALESCE(u.role, '')), ''))
  INTO v_role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
  RETURN v_role IS NOT NULL
    AND v_role = ANY (
      ARRAY[
        'admin_sistema',
        'admin_empresa',
        'admin',
        'diretoria',
        'gerente',
        'supervisao',
        'gestor',
        'super_admin',
        'administrador_geral',
        'financeiro'
      ]::text[]
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_caller_pode_gerenciar_usuario(p_target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_alvo uuid;
BEGIN
  SET LOCAL row_security = off;
  IF auth.uid() IS NULL OR p_target_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_target_id = auth.uid() THEN
    RETURN true;
  END IF;

  SELECT u.empresa_id INTO v_empresa_alvo
  FROM public.users u
  WHERE u.id = p_target_id
  LIMIT 1;

  IF v_empresa_alvo IS NULL THEN
    RETURN false;
  END IF;

  IF v_empresa_alvo = public.current_empresa_id()
     AND public.auth_user_role_in(ARRAY[
       'admin',
       'admin_empresa',
       'admin_sistema',
       'gerente',
       'diretoria',
       'supervisao',
       'gestor',
       'super_admin',
       'administrador_geral'
     ]) THEN
    RETURN true;
  END IF;

  IF public.current_user_pode_ver_grupo_economico()
     AND public.auth_empresa_no_mesmo_grupo_economico(v_empresa_alvo) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_atualizar_usuario_gestor(
  p_usuario_id uuid,
  p_nome text,
  p_telefone text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_ativo boolean DEFAULT NULL,
  p_empresa_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.users%ROWTYPE;
  v_nome text;
  v_role text;
  v_empresa_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não informado';
  END IF;

  IF NOT public.auth_caller_pode_gerenciar_usuario(p_usuario_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar este usuário';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE id = p_usuario_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  v_nome := COALESCE(NULLIF(trim(p_nome), ''), v_target.nome);
  IF v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'Nome não pode ser vazio';
  END IF;

  v_role := public.normalize_user_role(COALESCE(NULLIF(trim(p_role), ''), v_target.role));

  v_empresa_id := COALESCE(p_empresa_id, v_target.empresa_id);

  IF p_empresa_id IS NOT NULL AND p_empresa_id IS DISTINCT FROM v_target.empresa_id THEN
    IF NOT public.current_user_pode_ver_grupo_economico() THEN
      RAISE EXCEPTION 'Sem permissão para alterar a empresa do usuário';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.auth_empresa_ids_do_meu_grupo_economico() eid
      WHERE eid = p_empresa_id
    ) THEN
      RAISE EXCEPTION 'Empresa destino fora do seu grupo econômico';
    END IF;
    v_empresa_id := p_empresa_id;
  END IF;

  UPDATE public.users
  SET
    nome = v_nome,
    telefone = CASE
      WHEN p_telefone IS NULL THEN telefone
      ELSE NULLIF(trim(p_telefone), '')
    END,
    role = v_role,
    ativo = COALESCE(p_ativo, ativo),
    empresa_id = v_empresa_id,
    updated_at = now()
  WHERE id = p_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falha ao atualizar usuário';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_caller_pode_gerenciar_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_caller_pode_gerenciar_usuario(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_atualizar_usuario_gestor(uuid, text, text, text, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_usuario_gestor(uuid, text, text, text, boolean, uuid) TO authenticated;

-- RLS: administrador_geral na mesma empresa
DROP POLICY IF EXISTS users_update_same_empresa_admin ON public.users;
CREATE POLICY users_update_same_empresa_admin
ON public.users
FOR UPDATE
TO authenticated
USING (
    id = auth.uid()
    OR (
        empresa_id = public.current_empresa_id()
        AND public.auth_user_role_in(ARRAY[
            'admin',
            'admin_empresa',
            'admin_sistema',
            'gerente',
            'diretoria',
            'supervisao',
            'gestor',
            'super_admin',
            'administrador_geral'
        ])
    )
    OR (
        public.current_user_pode_ver_grupo_economico()
        AND public.auth_empresa_no_mesmo_grupo_economico(users.empresa_id)
    )
)
WITH CHECK (
    id = auth.uid()
    OR (
        empresa_id = public.current_empresa_id()
        AND public.auth_user_role_in(ARRAY[
            'admin',
            'admin_empresa',
            'admin_sistema',
            'gerente',
            'diretoria',
            'supervisao',
            'gestor',
            'super_admin',
            'administrador_geral'
        ])
    )
    OR (
        public.current_user_pode_ver_grupo_economico()
        AND users.empresa_id IN (SELECT public.auth_empresa_ids_do_meu_grupo_economico())
    )
);

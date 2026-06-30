-- Funções adicionais por usuário (ex.: vendedor + atendente).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS roles_extra text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.users.roles_extra IS
  'Perfis complementares além de users.role (cargo principal). União de permissões no app.';

CREATE OR REPLACE FUNCTION public.normalize_user_roles_extra(
  p_primary text,
  p_extras text[]
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary text;
  v_out text[] := '{}';
  v_item text;
  v_norm text;
BEGIN
  v_primary := public.normalize_user_role(p_primary);

  IF p_extras IS NULL OR array_length(p_extras, 1) IS NULL THEN
    RETURN v_out;
  END IF;

  FOREACH v_item IN ARRAY p_extras LOOP
    v_norm := public.normalize_user_role(v_item);
    IF v_norm IS NULL OR v_norm = '' OR v_norm = v_primary THEN
      CONTINUE;
    END IF;
    IF v_norm IN ('admin', 'admin_sistema', 'admin_empresa', 'super_admin', 'administrador_geral') THEN
      CONTINUE;
    END IF;
    IF NOT v_norm = ANY (v_out) THEN
      v_out := array_append(v_out, v_norm);
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;

DROP FUNCTION IF EXISTS public.fn_atualizar_usuario_gestor(uuid, text, text, text, boolean, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_atualizar_usuario_gestor(
  p_usuario_id uuid,
  p_nome text,
  p_telefone text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_ativo boolean DEFAULT NULL,
  p_empresa_id uuid DEFAULT NULL,
  p_motivo_inativacao text DEFAULT NULL,
  p_roles_extra text[] DEFAULT NULL
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
  v_ativo boolean;
  v_motivo text;
  v_roles_extra text[];
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
  v_ativo := COALESCE(p_ativo, v_target.ativo, true);

  IF p_roles_extra IS NOT NULL THEN
    v_roles_extra := public.normalize_user_roles_extra(v_role, p_roles_extra);
  ELSE
    v_roles_extra := COALESCE(v_target.roles_extra, '{}');
  END IF;

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

  IF v_ativo THEN
    v_motivo := NULL;
  ELSE
    v_motivo := NULLIF(trim(COALESCE(p_motivo_inativacao, v_target.motivo_inativacao, '')), '');
    IF v_motivo IS NOT NULL AND v_motivo NOT IN ('ferias', 'desligamento', 'acidente', 'doenca', 'normal') THEN
      RAISE EXCEPTION 'Motivo de inativação inválido';
    END IF;
    IF v_motivo IS NULL THEN
      v_motivo := 'normal';
    END IF;
  END IF;

  UPDATE public.users
  SET
    nome = v_nome,
    telefone = CASE
      WHEN p_telefone IS NULL THEN telefone
      ELSE NULLIF(trim(p_telefone), '')
    END,
    role = v_role,
    roles_extra = v_roles_extra,
    ativo = v_ativo,
    empresa_id = v_empresa_id,
    motivo_inativacao = v_motivo,
    inativado_em = CASE
      WHEN v_ativo THEN NULL
      WHEN v_target.ativo = false AND v_target.inativado_em IS NOT NULL THEN v_target.inativado_em
      ELSE now()
    END,
    inativado_por = CASE
      WHEN v_ativo THEN NULL
      WHEN v_target.ativo = false AND v_target.inativado_por IS NOT NULL THEN v_target.inativado_por
      ELSE auth.uid()
    END,
    updated_at = now()
  WHERE id = p_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falha ao atualizar usuário';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_atualizar_usuario_gestor(uuid, text, text, text, boolean, uuid, text, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

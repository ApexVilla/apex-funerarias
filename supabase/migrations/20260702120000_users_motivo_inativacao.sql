-- Motivo de desativação do usuário (férias, desligamento, etc.) + auditoria.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS motivo_inativacao text,
  ADD COLUMN IF NOT EXISTS inativado_em timestamptz,
  ADD COLUMN IF NOT EXISTS inativado_por uuid REFERENCES public.users(id);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_motivo_inativacao_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_motivo_inativacao_check
  CHECK (
    motivo_inativacao IS NULL
    OR motivo_inativacao IN ('ferias', 'desligamento', 'acidente', 'doenca', 'normal')
  );

COMMENT ON COLUMN public.users.motivo_inativacao IS
  'Motivo da desativação: ferias, desligamento, acidente, doenca, normal.';
COMMENT ON COLUMN public.users.inativado_em IS 'Data/hora em que o usuário foi desativado.';
COMMENT ON COLUMN public.users.inativado_por IS 'Gestor que desativou o usuário.';

DROP FUNCTION IF EXISTS public.fn_atualizar_usuario_gestor(uuid, text, text, text, boolean, uuid);

-- fn_atualizar_usuario_gestor: persiste motivo ao inativar e limpa ao reativar
CREATE OR REPLACE FUNCTION public.fn_atualizar_usuario_gestor(
  p_usuario_id uuid,
  p_nome text,
  p_telefone text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_ativo boolean DEFAULT NULL,
  p_empresa_id uuid DEFAULT NULL,
  p_motivo_inativacao text DEFAULT NULL
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

GRANT EXECUTE ON FUNCTION public.fn_atualizar_usuario_gestor(uuid, text, text, text, boolean, uuid, text) TO authenticated;

-- Promove um dependente a titular do cadastro/contrato (ex.: falecimento do titular).

CREATE OR REPLACE FUNCTION public.fn_promover_beneficiario_titular(
  p_beneficiario_id uuid,
  p_motivo text DEFAULT NULL,
  p_registrar_ex_titular boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.beneficiarios%ROWTYPE;
  v_cli public.clientes%ROWTYPE;
  v_cpf_norm text;
  v_outro_id uuid;
  v_ex_ben_id uuid;
  v_user uuid;
  v_motivo text;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  SELECT * INTO v_b
  FROM public.beneficiarios
  WHERE id = p_beneficiario_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dependente não encontrado.';
  END IF;

  IF COALESCE(v_b.ativo, true) = false OR lower(COALESCE(v_b.status, 'ativo')) <> 'ativo' THEN
    RAISE EXCEPTION 'Só é possível promover um dependente ativo.';
  END IF;

  SELECT * INTO v_cli
  FROM public.clientes
  WHERE id = v_b.cliente_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro do titular não encontrado.';
  END IF;

  v_cpf_norm := public.fn_cpf_so_digitos(v_b.cpf);
  IF v_cpf_norm IS NOT NULL AND length(v_cpf_norm) = 11 THEN
    SELECT c.id INTO v_outro_id
    FROM public.clientes c
    WHERE c.deleted_at IS NULL
      AND c.id <> v_cli.id
      AND c.empresa_id = v_cli.empresa_id
      AND public.fn_cpf_so_digitos(c.cpf) = v_cpf_norm
    LIMIT 1;

    IF v_outro_id IS NOT NULL THEN
      RAISE EXCEPTION
        'CPF do dependente já está em outro cadastro. Unifique os clientes antes de promover a titular.';
    END IF;
  END IF;

  v_motivo := nullif(trim(COALESCE(p_motivo, '')), '');

  IF COALESCE(p_registrar_ex_titular, true) THEN
    INSERT INTO public.beneficiarios (
      empresa_id,
      cliente_id,
      assinatura_id,
      nome,
      cpf,
      data_nascimento,
      sexo,
      parentesco,
      tipo,
      status,
      ativo,
      data_inclusao,
      motivo_exclusao,
      rg_numero
    ) VALUES (
      v_b.empresa_id,
      v_b.cliente_id,
      v_b.assinatura_id,
      v_cli.nome,
      v_cli.cpf,
      v_cli.data_nascimento,
      v_cli.sexo,
      'Ex-titular (falecido)',
      'dependente',
      'inativo',
      false,
      CURRENT_DATE,
      COALESCE(v_motivo, 'Substituído por novo titular'),
      NULL
    )
    RETURNING id INTO v_ex_ben_id;
  END IF;

  UPDATE public.clientes
  SET
    nome = v_b.nome,
    cpf = NULLIF(trim(COALESCE(v_b.cpf, '')), ''),
    data_nascimento = v_b.data_nascimento,
    sexo = COALESCE(v_b.sexo, sexo),
    updated_at = now()
  WHERE id = v_cli.id;

  DELETE FROM public.beneficiarios
  WHERE id = v_b.id;

  INSERT INTO public.timeline_clientes (
    empresa_id,
    cliente_id,
    tipo_evento,
    categoria,
    titulo,
    descricao,
    referencia_tipo,
    referencia_id,
    dados_anteriores,
    dados_novos,
    criado_por,
    data_evento
  ) VALUES (
    v_cli.empresa_id,
    v_cli.id,
    'AUDITORIA',
    'beneficiario',
    'Novo titular do contrato',
    format(
      'O dependente "%s" (%s) passou a ser titular do cadastro. Titular anterior: "%s".%s',
      v_b.nome,
      COALESCE(v_b.parentesco, 'dependente'),
      v_cli.nome,
      CASE WHEN v_motivo IS NOT NULL THEN ' Motivo: ' || v_motivo ELSE '' END
    ),
    'beneficiario',
    p_beneficiario_id,
    jsonb_build_object(
      'titular_anterior', jsonb_build_object(
        'nome', v_cli.nome,
        'cpf', v_cli.cpf,
        'data_nascimento', v_cli.data_nascimento
      ),
      'beneficiario_promovido', jsonb_build_object(
        'id', v_b.id,
        'nome', v_b.nome,
        'cpf', v_b.cpf,
        'parentesco', v_b.parentesco
      )
    ),
    jsonb_build_object(
      'titular_novo', jsonb_build_object(
        'nome', v_b.nome,
        'cpf', v_b.cpf,
        'data_nascimento', v_b.data_nascimento
      ),
      'ex_titular_dependente_id', v_ex_ben_id
    ),
    v_user,
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'cliente_id', v_cli.id,
    'titular_anterior_nome', v_cli.nome,
    'titular_novo_nome', v_b.nome,
    'ex_titular_dependente_id', v_ex_ben_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_promover_beneficiario_titular(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_promover_beneficiario_titular(uuid, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_promover_beneficiario_titular IS
  'Substitui os dados do titular (cliente) pelos do dependente e registra o ex-titular como dependente inativo.';

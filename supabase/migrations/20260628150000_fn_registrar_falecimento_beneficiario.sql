-- Registra óbito do dependente: data, baixa (inativo) e auditoria.

CREATE OR REPLACE FUNCTION public.fn_registrar_falecimento_beneficiario(
  p_beneficiario_id uuid,
  p_data_falecimento date,
  p_motivo text DEFAULT NULL,
  p_origem text DEFAULT 'manual',
  p_atendimento_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.beneficiarios%ROWTYPE;
  v_user uuid;
  v_motivo text;
  v_origem text;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_beneficiario_id IS NULL THEN
    RAISE EXCEPTION 'Informe o beneficiário.';
  END IF;

  IF p_data_falecimento IS NULL THEN
    RAISE EXCEPTION 'Informe a data do óbito.';
  END IF;

  SELECT * INTO v_b
  FROM public.beneficiarios
  WHERE id = p_beneficiario_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dependente não encontrado.';
  END IF;

  IF v_b.data_falecimento IS NOT NULL OR lower(COALESCE(v_b.status, '')) = 'falecido' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'ja_registrado', true,
      'beneficiario_id', v_b.id,
      'data_falecimento', v_b.data_falecimento
    );
  END IF;

  v_motivo := nullif(trim(COALESCE(p_motivo, '')), '');
  v_origem := nullif(trim(COALESCE(p_origem, 'manual')), '');

  UPDATE public.beneficiarios
  SET
    data_falecimento = p_data_falecimento,
    data_exclusao = COALESCE(data_exclusao, p_data_falecimento),
    ativo = false,
    status = 'falecido',
    motivo_exclusao = COALESCE(v_motivo, 'Óbito registrado — baixa no plano'),
    updated_at = now()
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
    v_b.empresa_id,
    v_b.cliente_id,
    'AUDITORIA',
    'beneficiario',
    'Óbito do dependente',
    format(
      'Dependente "%s" (%s) registrado como falecido em %s. Baixa no plano.%s%s',
      v_b.nome,
      COALESCE(v_b.parentesco, 'dependente'),
      to_char(p_data_falecimento, 'DD/MM/YYYY'),
      CASE WHEN v_origem = 'atendimento' THEN ' Origem: atendimento funerário.' ELSE '' END,
      CASE WHEN v_motivo IS NOT NULL THEN ' Motivo: ' || v_motivo ELSE '' END
    ),
    'beneficiario',
    v_b.id,
    jsonb_build_object(
      'nome', v_b.nome,
      'status', v_b.status,
      'ativo', v_b.ativo,
      'data_falecimento', v_b.data_falecimento
    ),
    jsonb_build_object(
      'status', 'falecido',
      'ativo', false,
      'data_falecimento', p_data_falecimento,
      'data_exclusao', p_data_falecimento,
      'origem', v_origem,
      'atendimento_id', p_atendimento_id
    ),
    v_user,
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'ja_registrado', false,
    'beneficiario_id', v_b.id,
    'nome', v_b.nome,
    'data_falecimento', p_data_falecimento
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_registrar_falecimento_beneficiario(uuid, date, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_registrar_falecimento_beneficiario(uuid, date, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_registrar_falecimento_beneficiario IS
  'Marca dependente como falecido (data_falecimento), inativa no plano e grava na timeline.';

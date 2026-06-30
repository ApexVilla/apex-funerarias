-- Carteira: permissão por unidade (empresa cadastral, empresas_contexto ou grupo gestor)
-- e RPCs SECURITY DEFINER para atribuir cobrador/escritório sem bloqueio de RLS no cliente.

CREATE OR REPLACE FUNCTION public.auth_usuario_pode_operar_empresa(p_empresa uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_cadastro uuid;
  v_ctx jsonb;
BEGIN
  IF p_empresa IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;

  SELECT u.empresa_id, u.permissoes -> 'empresas_contexto'
  INTO v_empresa_cadastro, v_ctx
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF v_empresa_cadastro IS NULL AND v_ctx IS NULL THEN
    RETURN false;
  END IF;

  IF p_empresa = v_empresa_cadastro THEN
    RETURN true;
  END IF;

  IF v_ctx IS NOT NULL
     AND COALESCE((v_ctx ->> p_empresa::text)::boolean, false) THEN
    RETURN true;
  END IF;

  RETURN public.current_user_pode_ver_grupo_economico()
    AND public.auth_empresa_no_mesmo_grupo_economico(p_empresa);
END;
$$;

REVOKE ALL ON FUNCTION public.auth_usuario_pode_operar_empresa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_usuario_pode_operar_empresa(uuid) TO authenticated;

COMMENT ON FUNCTION public.auth_usuario_pode_operar_empresa(uuid) IS
  'True se o usuário pode operar dados da empresa (cadastro, empresas_contexto ou gestor do grupo).';

CREATE OR REPLACE FUNCTION public.rls_empresa_ou_do_mesmo_grupo(p_empresa uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.auth_usuario_pode_operar_empresa(p_empresa);
END;
$$;

-- Upsert de pendências (só o cliente informado)
CREATE OR REPLACE FUNCTION public.fn_cob_carteira_upsert_cliente(
  p_empresa_id uuid,
  p_cliente_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
  n2 int := 0;
BEGIN
  IF NOT public.auth_usuario_pode_operar_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sem permissão para operar carteira nesta unidade.'
      USING ERRCODE = '42501';
  END IF;

  IF p_empresa_id IS NULL OR p_cliente_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.cob_cobrancas_pendentes (
    empresa_id,
    conta_receber_id,
    cliente_id,
    valor_centavos,
    data_vencimento,
    dias_atraso,
    status,
    prioridade,
    tentativas,
    updated_at
  )
  SELECT
    fr.empresa_id,
    fr.id,
    fr.cliente_id,
    fr.valor_aberto_centavos,
    fr.data_vencimento::date,
    GREATEST(0, (CURRENT_DATE - fr.data_vencimento::date))::integer,
    'pendente',
    'media',
    0,
    now()
  FROM public.fin_contas_receber fr
  WHERE fr.empresa_id = p_empresa_id
    AND fr.cliente_id = p_cliente_id
    AND fr.deleted_at IS NULL
    AND fr.valor_aberto_centavos > 0
  ON CONFLICT (empresa_id, conta_receber_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;

  INSERT INTO public.cob_cobrancas_pendentes (
    empresa_id,
    conta_receber_id,
    cliente_id,
    valor_centavos,
    data_vencimento,
    dias_atraso,
    status,
    prioridade,
    tentativas,
    observacao,
    updated_at
  )
  SELECT
    a.empresa_id,
    NULL,
    a.cliente_id,
    coalesce(a.valor_mensal_centavos, 0),
    coalesce(a.data_primeiro_vencimento, a.data_contratacao, CURRENT_DATE)::date,
    0,
    'pendente',
    'media',
    0,
    'Contrato ' || coalesce(a.codigo, a.id::text),
    now()
  FROM public.assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.cliente_id = p_cliente_id
    AND a.deleted_at IS NULL
    AND a.status = 'ativo'
    AND NOT EXISTS (
      SELECT 1 FROM public.cob_cobrancas_pendentes cp
      WHERE cp.empresa_id = a.empresa_id
        AND cp.cliente_id = a.cliente_id
        AND cp.status IN ('pendente', 'em_andamento', 'promessa')
    );

  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n + n2;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_atribuir_cobrador(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_cobrador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF NOT public.auth_usuario_pode_operar_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sem permissão para operar carteira nesta unidade.'
      USING ERRCODE = '42501';
  END IF;
  IF p_cobrador_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'linhas', 0, 'erro', 'Cobrador inválido.');
  END IF;

  PERFORM public.fn_cob_carteira_upsert_cliente(p_empresa_id, p_cliente_id);

  UPDATE public.cob_cobrancas_pendentes
  SET
    cobrador_id = p_cobrador_id,
    canal_cobranca = 'cobrador',
    updated_at = now()
  WHERE empresa_id = p_empresa_id
    AND cliente_id = p_cliente_id
    AND status IN ('pendente', 'em_andamento', 'promessa');

  GET DIAGNOSTICS n = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', n > 0,
    'linhas', n,
    'erro', CASE WHEN n > 0 THEN NULL ELSE 'Nenhuma pendência encontrada para este cliente.' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_remover_cobrador(
  p_empresa_id uuid,
  p_cliente_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF NOT public.auth_usuario_pode_operar_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sem permissão para operar carteira nesta unidade.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.cob_cobrancas_pendentes
  SET
    cobrador_id = NULL,
    canal_cobranca = 'cobrador',
    updated_at = now()
  WHERE empresa_id = p_empresa_id
    AND cliente_id = p_cliente_id
    AND canal_cobranca = 'cobrador'
    AND cobrador_id IS NOT NULL
    AND status IN ('pendente', 'em_andamento', 'promessa');

  GET DIAGNOSTICS n = ROW_COUNT;

  RETURN jsonb_build_object('ok', n > 0, 'linhas', n);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_atribuir_escritorio(
  p_empresa_id uuid,
  p_cliente_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF NOT public.auth_usuario_pode_operar_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sem permissão para operar carteira nesta unidade.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_cob_carteira_upsert_cliente(p_empresa_id, p_cliente_id);

  UPDATE public.cob_cobrancas_pendentes
  SET
    canal_cobranca = 'escritorio',
    cobrador_id = NULL,
    updated_at = now()
  WHERE empresa_id = p_empresa_id
    AND cliente_id = p_cliente_id
    AND status IN ('pendente', 'em_andamento', 'promessa');

  GET DIAGNOSTICS n = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', n > 0,
    'linhas', n,
    'erro', CASE WHEN n > 0 THEN NULL ELSE 'Nenhuma pendência encontrada para este cliente.' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_remover_escritorio(
  p_empresa_id uuid,
  p_cliente_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF NOT public.auth_usuario_pode_operar_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sem permissão para operar carteira nesta unidade.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.cob_cobrancas_pendentes
  SET
    canal_cobranca = 'cobrador',
    updated_at = now()
  WHERE empresa_id = p_empresa_id
    AND cliente_id = p_cliente_id
    AND canal_cobranca = 'escritorio'
    AND status IN ('pendente', 'em_andamento', 'promessa');

  GET DIAGNOSTICS n = ROW_COUNT;

  RETURN jsonb_build_object('ok', n > 0, 'linhas', n);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_atribuir_cobrador_lote(
  p_empresa_ids uuid[],
  p_cliente_ids uuid[],
  p_cobrador_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  emp uuid;
BEGIN
  IF p_cliente_ids IS NULL OR cardinality(p_cliente_ids) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'linhas', 0);
  END IF;

  FOREACH emp IN ARRAY COALESCE(p_empresa_ids, ARRAY[]::uuid[])
  LOOP
    IF NOT public.auth_usuario_pode_operar_empresa(emp) THEN
      RAISE EXCEPTION 'Sem permissão para operar carteira nesta unidade.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF p_cobrador_id IS NULL THEN
    UPDATE public.cob_cobrancas_pendentes cp
    SET cobrador_id = NULL, canal_cobranca = 'cobrador', updated_at = now()
    WHERE cp.cliente_id = ANY (p_cliente_ids)
      AND cp.canal_cobranca = 'cobrador'
      AND cp.cobrador_id IS NOT NULL
      AND cp.status IN ('pendente', 'em_andamento', 'promessa')
      AND (
        cardinality(COALESCE(p_empresa_ids, ARRAY[]::uuid[])) = 0
        OR cp.empresa_id = ANY (p_empresa_ids)
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN jsonb_build_object('ok', n > 0, 'linhas', n);
  END IF;

  UPDATE public.cob_cobrancas_pendentes cp
  SET
    cobrador_id = p_cobrador_id,
    canal_cobranca = 'cobrador',
    updated_at = now()
  WHERE cp.cliente_id = ANY (p_cliente_ids)
    AND cp.status IN ('pendente', 'em_andamento', 'promessa')
    AND (
      cardinality(COALESCE(p_empresa_ids, ARRAY[]::uuid[])) = 0
      OR cp.empresa_id = ANY (p_empresa_ids)
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', n > 0, 'linhas', n);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cob_carteira_atribuir_cobrador(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cob_carteira_remover_cobrador(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cob_carteira_atribuir_escritorio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cob_carteira_remover_escritorio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cob_carteira_atribuir_cobrador_lote(uuid[], uuid[], uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_atribuir_cobrador(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_remover_cobrador(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_atribuir_escritorio(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_remover_escritorio(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_atribuir_cobrador_lote(uuid[], uuid[], uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_upsert_cliente(uuid, uuid) TO authenticated;

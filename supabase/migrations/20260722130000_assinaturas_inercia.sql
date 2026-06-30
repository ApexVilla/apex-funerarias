-- Inércia contratual: sem óbito e sem uso do plano funerário por 20 anos e 10 meses
-- → contrato inerte (não gera mensalidades). Inclusão/alteração reativa e volta a cobrar.

ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS em_inercia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inercia_desde date,
  ADD COLUMN IF NOT EXISTS inercia_ultimo_evento_em date;

COMMENT ON COLUMN public.assinaturas.em_inercia IS
  'Contrato inerte: não gera mensalidades até reativação (inclusão de dependente ou alteração contratual).';
COMMENT ON COLUMN public.assinaturas.inercia_desde IS 'Data em que o contrato entrou em inércia.';
COMMENT ON COLUMN public.assinaturas.inercia_ultimo_evento_em IS
  'Último óbito ou uso do plano funerário — referência para o prazo de 20 anos e 10 meses.';

-- Último evento que “movimenta” o plano (óbito de dependente ou atendimento tipo plano).
CREATE OR REPLACE FUNCTION public.fn_assinatura_ultimo_evento_plano(p_assinatura_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_contratacao date;
  v_obito date;
  v_atend date;
BEGIN
  SELECT a.cliente_id,
         COALESCE(a.data_contratacao::date, (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
    INTO v_cliente_id, v_contratacao
  FROM public.assinaturas a
  WHERE a.id = p_assinatura_id
    AND a.deleted_at IS NULL;

  IF v_cliente_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT MAX(b.data_falecimento)
    INTO v_obito
  FROM public.beneficiarios b
  WHERE b.assinatura_id = p_assinatura_id
    AND b.deleted_at IS NULL
    AND b.data_falecimento IS NOT NULL;

  SELECT MAX(COALESCE(sa.data_falecido, (sa.created_at AT TIME ZONE 'America/Sao_Paulo')::date))
    INTO v_atend
  FROM public.ser_atendimentos sa
  WHERE sa.cliente_id = v_cliente_id
    AND lower(COALESCE(sa.tipo_atendimento, '')) = 'plano';

  RETURN GREATEST(
    COALESCE(v_contratacao, CURRENT_DATE),
    COALESCE(v_obito, v_contratacao),
    COALESCE(v_atend, v_contratacao)
  );
END;
$$;

-- Atualiza referência do último evento (ex.: após óbito ou atendimento).
CREATE OR REPLACE FUNCTION public.fn_assinatura_atualizar_ultimo_evento_inercia(
  p_assinatura_id uuid,
  p_data_evento date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data date;
BEGIN
  IF p_assinatura_id IS NULL THEN
    RETURN;
  END IF;

  v_data := COALESCE(p_data_evento, public.fn_assinatura_ultimo_evento_plano(p_assinatura_id));

  UPDATE public.assinaturas
  SET inercia_ultimo_evento_em = v_data,
      updated_at = now()
  WHERE id = p_assinatura_id
    AND deleted_at IS NULL;
END;
$$;

-- Avalia se deve entrar em inércia (250 meses = 20a + 10m sem evento).
CREATE OR REPLACE FUNCTION public.fn_avaliar_inercia_assinatura(p_assinatura_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ass RECORD;
  v_ultimo date;
  v_meses_sem_evento integer;
  v_entrou boolean := false;
BEGIN
  SELECT *
    INTO v_ass
  FROM public.assinaturas
  WHERE id = p_assinatura_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF lower(COALESCE(v_ass.status, '')) NOT IN ('ativo', 'suspenso') THEN
    RETURN false;
  END IF;

  IF v_ass.em_inercia THEN
    RETURN false;
  END IF;

  v_ultimo := COALESCE(
    v_ass.inercia_ultimo_evento_em,
    public.fn_assinatura_ultimo_evento_plano(p_assinatura_id)
  );

  IF v_ultimo IS NULL THEN
    RETURN false;
  END IF;

  v_meses_sem_evento := (
    EXTRACT(YEAR FROM age(CURRENT_DATE, v_ultimo))::integer * 12
    + EXTRACT(MONTH FROM age(CURRENT_DATE, v_ultimo))::integer
  );

  IF v_meses_sem_evento >= 250 THEN
    UPDATE public.assinaturas
    SET em_inercia = true,
        inercia_desde = CURRENT_DATE,
        inercia_ultimo_evento_em = v_ultimo,
        updated_at = now()
    WHERE id = p_assinatura_id;

    INSERT INTO public.timeline_clientes (
      empresa_id,
      cliente_id,
      tipo_evento,
      categoria,
      titulo,
      descricao,
      referencia_tipo,
      referencia_id,
      dados_novos,
      data_evento
    ) VALUES (
      v_ass.empresa_id,
      v_ass.cliente_id,
      'AUDITORIA',
      'contrato',
      'Contrato em inércia',
      format(
        'Contrato %s entrou em inércia após %s meses sem óbito e sem uso do plano funerário (último evento: %s). Mensalidades suspensas até reativação.',
        COALESCE(v_ass.codigo, left(v_ass.id::text, 8)),
        v_meses_sem_evento,
        to_char(v_ultimo, 'DD/MM/YYYY')
      ),
      'assinatura',
      p_assinatura_id,
      jsonb_build_object(
        'em_inercia', true,
        'inercia_desde', CURRENT_DATE,
        'meses_sem_evento', v_meses_sem_evento
      ),
      now()
    );

    v_entrou := true;
  ELSE
    UPDATE public.assinaturas
    SET inercia_ultimo_evento_em = v_ultimo,
        updated_at = now()
    WHERE id = p_assinatura_id
      AND (inercia_ultimo_evento_em IS DISTINCT FROM v_ultimo);
  END IF;

  RETURN v_entrou;
END;
$$;

-- Reativa contrato inerte (inclusão de dependente, alteração manual, etc.).
CREATE OR REPLACE FUNCTION public.fn_reativar_assinatura_inercia(
  p_assinatura_id uuid,
  p_motivo text DEFAULT 'Reativação por alteração contratual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ass RECORD;
  v_user uuid;
BEGIN
  v_user := auth.uid();

  SELECT *
    INTO v_ass
  FROM public.assinaturas
  WHERE id = p_assinatura_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;

  IF NOT v_ass.em_inercia THEN
    RETURN jsonb_build_object('ok', true, 'reativado', false);
  END IF;

  UPDATE public.assinaturas
  SET em_inercia = false,
      inercia_desde = NULL,
      inercia_ultimo_evento_em = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_assinatura_id;

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
    v_ass.empresa_id,
    v_ass.cliente_id,
    'AUDITORIA',
    'contrato',
    'Contrato reativado (saiu da inércia)',
    format(
      'Contrato %s reativado. Motivo: %s. Geração de mensalidades liberada.',
      COALESCE(v_ass.codigo, left(v_ass.id::text, 8)),
      COALESCE(nullif(trim(p_motivo), ''), 'Reativação')
    ),
    'assinatura',
    p_assinatura_id,
    jsonb_build_object('em_inercia', true, 'inercia_desde', v_ass.inercia_desde),
    jsonb_build_object('em_inercia', false, 'reativado_em', CURRENT_DATE),
    v_user,
    now()
  );

  RETURN jsonb_build_object('ok', true, 'reativado', true);
END;
$$;

-- Avalia todos os contratos ativos/suspensos de uma empresa.
CREATE OR REPLACE FUNCTION public.fn_avaliar_inercia_empresa(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT a.id
    FROM public.assinaturas a
    WHERE a.empresa_id = p_empresa_id
      AND a.deleted_at IS NULL
      AND lower(COALESCE(a.status, '')) IN ('ativo', 'suspenso')
      AND NOT a.em_inercia
  LOOP
    IF public.fn_avaliar_inercia_assinatura(v_id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Backfill da data de referência
UPDATE public.assinaturas a
SET inercia_ultimo_evento_em = public.fn_assinatura_ultimo_evento_plano(a.id)
WHERE a.deleted_at IS NULL
  AND a.inercia_ultimo_evento_em IS NULL;

-- fn_gerar_mensalidades: bloqueia geração em inércia
CREATE OR REPLACE FUNCTION public.fn_gerar_mensalidades(p_assinatura_id uuid, p_meses integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_assinatura RECORD;
    v_plano RECORD;
    v_data_vencimento DATE;
    v_ultimo_venc DATE;
    v_ultima_parcela INTEGER;
    v_codigo_base TEXT;
    i INTEGER;
    v_count INTEGER := 0;
    v_status TEXT;
    v_parcela_num INTEGER;
BEGIN
    SELECT * INTO v_assinatura FROM assinaturas WHERE id = p_assinatura_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assinatura não encontrada';
    END IF;

    IF COALESCE(v_assinatura.em_inercia, false) THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_plano FROM planos WHERE id = v_assinatura.plano_id;

    SELECT MAX(cr.data_vencimento), MAX(cr.parcela_numero)
    INTO v_ultimo_venc, v_ultima_parcela
    FROM fin_contas_receber cr
    WHERE cr.assinatura_id = p_assinatura_id
      AND cr.deleted_at IS NULL
      AND cr.tipo_documento = 'mensalidade';

    IF v_ultimo_venc IS NOT NULL THEN
        v_data_vencimento := (
            DATE_TRUNC('month', v_ultimo_venc)
            + INTERVAL '1 month'
            + ((COALESCE(v_assinatura.dia_vencimento, EXTRACT(DAY FROM v_ultimo_venc)::INTEGER) - 1) || ' days')::INTERVAL
        )::DATE;
        v_parcela_num := COALESCE(v_ultima_parcela, 0);
    ELSE
        v_data_vencimento := COALESCE(v_assinatura.data_primeiro_vencimento, CURRENT_DATE);
        v_parcela_num := 0;
    END IF;

    FOR i IN 1..GREATEST(1, LEAST(COALESCE(p_meses, 12), 36)) LOOP
        v_parcela_num := v_parcela_num + 1;
        v_codigo_base := fn_fin_novo_codigo_cr();

        v_status := CASE
            WHEN v_data_vencimento < CURRENT_DATE THEN 'vencido'
            ELSE 'aberto'
        END;

        INSERT INTO fin_contas_receber (
            empresa_id,
            filial_id,
            codigo,
            cliente_id,
            assinatura_id,
            tipo_documento,
            descricao,
            valor_original_centavos,
            valor_juros_centavos,
            valor_multa_centavos,
            valor_desconto_centavos,
            valor_pago_centavos,
            data_emissao,
            data_vencimento,
            data_competencia,
            status,
            parcela_numero,
            total_parcelas,
            created_at
        ) VALUES (
            v_assinatura.empresa_id,
            v_assinatura.filial_id,
            v_codigo_base,
            v_assinatura.cliente_id,
            p_assinatura_id,
            'mensalidade',
            'Mensalidade ' || v_parcela_num || ' - ' || COALESCE(v_plano.nome, 'Plano Associativo'),
            v_assinatura.valor_mensal_centavos,
            0,
            0,
            0,
            0,
            CURRENT_DATE,
            v_data_vencimento,
            v_data_vencimento,
            v_status,
            v_parcela_num,
            NULL,
            NOW()
        );

        v_data_vencimento := (
            DATE_TRUNC('month', v_data_vencimento)
            + INTERVAL '1 month'
            + ((COALESCE(v_assinatura.dia_vencimento, EXTRACT(DAY FROM v_data_vencimento)::INTEGER) - 1) || ' days')::INTERVAL
        )::DATE;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;

-- Óbito de dependente: atualiza referência de inércia (reinicia contagem de 20a10m)
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

  IF v_b.assinatura_id IS NOT NULL THEN
    PERFORM public.fn_assinatura_atualizar_ultimo_evento_inercia(v_b.assinatura_id, p_data_falecimento);
  END IF;

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

GRANT EXECUTE ON FUNCTION public.fn_assinatura_ultimo_evento_plano(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_assinatura_atualizar_ultimo_evento_inercia(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_avaliar_inercia_assinatura(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reativar_assinatura_inercia(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_avaliar_inercia_empresa(uuid) TO authenticated;

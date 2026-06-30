-- Códigos CR- únicos por parcela (evita duplicate key em migrações com muitas mensalidades ou chamadas simultâneas).

CREATE OR REPLACE FUNCTION public.fn_fin_novo_codigo_cr()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'CR-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 27)
$$;

-- fn_gerar_mensalidades: continuidade a partir do último vencimento + filial_id
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

-- fn_gerar_mensalidades_com_historico: migração com histórico quitado + futuras
CREATE OR REPLACE FUNCTION public.fn_gerar_mensalidades_com_historico(
    p_assinatura_id uuid,
    p_ate_vencimento date,
    p_data_pagamento date DEFAULT CURRENT_DATE,
    p_meses_futuros integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_assinatura RECORD;
    v_plano RECORD;
    v_data_vencimento DATE;
    v_codigo_base TEXT;
    v_pagas INTEGER := 0;
    v_futuras INTEGER := 0;
    v_parcela INTEGER := 0;
    v_status TEXT;
    v_valor INTEGER;
    v_data_pg DATE;
    v_max_loop INTEGER := 0;
    v_existing_total INTEGER := 0;
BEGIN
    IF p_ate_vencimento IS NULL THEN
        RAISE EXCEPTION 'Informe até qual vencimento o cliente já pagou';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_existing_total
    FROM fin_contas_receber cr
    WHERE cr.assinatura_id = p_assinatura_id
      AND cr.deleted_at IS NULL
      AND cr.tipo_documento = 'mensalidade';

    IF v_existing_total > 0 THEN
        SELECT
            COUNT(*) FILTER (WHERE status = 'pago')::INTEGER,
            COUNT(*) FILTER (WHERE status IN ('aberto', 'vencido', 'parcial'))::INTEGER
        INTO v_pagas, v_futuras
        FROM fin_contas_receber cr
        WHERE cr.assinatura_id = p_assinatura_id
          AND cr.deleted_at IS NULL
          AND cr.tipo_documento = 'mensalidade';

        RETURN jsonb_build_object(
            'pagas', COALESCE(v_pagas, 0),
            'futuras', COALESCE(v_futuras, 0),
            'total', v_existing_total,
            'ja_existia', true
        );
    END IF;

    SELECT * INTO v_assinatura FROM assinaturas WHERE id = p_assinatura_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assinatura não encontrada';
    END IF;

    SELECT * INTO v_plano FROM planos WHERE id = v_assinatura.plano_id;
    v_valor := COALESCE(v_assinatura.valor_mensal_centavos, 0);
    v_data_vencimento := COALESCE(v_assinatura.data_primeiro_vencimento, CURRENT_DATE);
    v_data_pg := COALESCE(p_data_pagamento, CURRENT_DATE);

    WHILE v_data_vencimento <= p_ate_vencimento AND v_max_loop < 600 LOOP
        v_max_loop := v_max_loop + 1;
        v_parcela := v_parcela + 1;
        v_codigo_base := fn_fin_novo_codigo_cr();

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
            data_pagamento,
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
            'Mensalidade ' || v_parcela || ' (quitada) - ' || COALESCE(v_plano.nome, 'Plano Associativo'),
            v_valor,
            0,
            0,
            0,
            v_valor,
            LEAST(v_data_vencimento, CURRENT_DATE),
            v_data_vencimento,
            v_data_vencimento,
            v_data_pg,
            'pago',
            v_parcela,
            NULL,
            NOW()
        );

        v_pagas := v_pagas + 1;

        v_data_vencimento := (
            DATE_TRUNC('month', v_data_vencimento)
            + INTERVAL '1 month'
            + ((COALESCE(v_assinatura.dia_vencimento, EXTRACT(DAY FROM v_data_vencimento)) - 1) || ' days')::INTERVAL
        )::DATE;
    END LOOP;

    FOR i IN 1..GREATEST(1, LEAST(COALESCE(p_meses_futuros, 12), 36)) LOOP
        v_max_loop := v_max_loop + 1;
        IF v_max_loop > 650 THEN
            EXIT;
        END IF;

        v_parcela := v_parcela + 1;
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
            'Mensalidade ' || v_parcela || '/' || p_meses_futuros || ' - ' || COALESCE(v_plano.nome, 'Plano Associativo'),
            v_valor,
            0,
            0,
            0,
            0,
            CURRENT_DATE,
            v_data_vencimento,
            v_data_vencimento,
            v_status,
            v_parcela,
            p_meses_futuros,
            NOW()
        );

        v_futuras := v_futuras + 1;

        v_data_vencimento := (
            DATE_TRUNC('month', v_data_vencimento)
            + INTERVAL '1 month'
            + ((COALESCE(v_assinatura.dia_vencimento, EXTRACT(DAY FROM v_data_vencimento)) - 1) || ' days')::INTERVAL
        )::DATE;
    END LOOP;

    RETURN jsonb_build_object(
        'pagas', v_pagas,
        'futuras', v_futuras,
        'total', v_pagas + v_futuras
    );
END;
$function$;

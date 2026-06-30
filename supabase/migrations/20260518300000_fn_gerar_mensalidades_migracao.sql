-- Gera mensalidades de contrato migrado: histórico quitado + parcelas futuras em aberto.

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
BEGIN
    IF p_ate_vencimento IS NULL THEN
        RAISE EXCEPTION 'Informe até qual vencimento o cliente já pagou';
    END IF;

    SELECT * INTO v_assinatura FROM assinaturas WHERE id = p_assinatura_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assinatura não encontrada';
    END IF;

    SELECT * INTO v_plano FROM planos WHERE id = v_assinatura.plano_id;
    v_valor := COALESCE(v_assinatura.valor_mensal_centavos, 0);
    v_data_vencimento := COALESCE(v_assinatura.data_primeiro_vencimento, CURRENT_DATE);
    v_data_pg := COALESCE(p_data_pagamento, CURRENT_DATE);

    -- Histórico quitado (vencimento <= p_ate_vencimento)
    WHILE v_data_vencimento <= p_ate_vencimento AND v_max_loop < 600 LOOP
        v_max_loop := v_max_loop + 1;
        v_parcela := v_parcela + 1;
        v_codigo_base := 'CR-' || (EXTRACT(EPOCH FROM NOW())::BIGINT + v_parcela)::TEXT;

        INSERT INTO fin_contas_receber (
            empresa_id,
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

    -- Parcelas futuras em aberto / vencido
    FOR i IN 1..GREATEST(1, LEAST(COALESCE(p_meses_futuros, 12), 36)) LOOP
        v_max_loop := v_max_loop + 1;
        IF v_max_loop > 650 THEN
            EXIT;
        END IF;

        v_parcela := v_parcela + 1;
        v_codigo_base := 'CR-' || (EXTRACT(EPOCH FROM NOW())::BIGINT + v_parcela + 1000)::TEXT;

        v_status := CASE
            WHEN v_data_vencimento < CURRENT_DATE THEN 'vencido'
            ELSE 'aberto'
        END;

        INSERT INTO fin_contas_receber (
            empresa_id,
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

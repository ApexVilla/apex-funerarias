-- Continua geração de mensalidades a partir do último vencimento existente (não reinicia no primeiro vencimento)

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
        v_codigo_base := 'CR-' || (EXTRACT(EPOCH FROM NOW())::BIGINT + v_parcela_num)::TEXT;

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

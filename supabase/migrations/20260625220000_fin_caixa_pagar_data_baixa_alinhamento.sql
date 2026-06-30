-- Alinha fin_caixa_movimentos de contas a pagar com data_baixa (pagamento retroativo).
-- Corrige o caso em que a baixa foi registrada com data_pagamento correto em
-- fin_contas_pagar_baixas / fin_movimentacoes, mas o movimento físico do caixa
-- permaneceu na sessão/data em que o usuário clicou (ex.: hoje).

CREATE OR REPLACE FUNCTION public.fin_baixar_conta_pagar(
    p_conta_pagar_id uuid,
    p_valor_pago_centavos bigint,
    p_forma_pagamento_id uuid DEFAULT NULL,
    p_conta_bancaria_id uuid DEFAULT NULL,
    p_valor_desconto_centavos bigint DEFAULT 0,
    p_valor_juros_centavos bigint DEFAULT 0,
    p_valor_multa_centavos bigint DEFAULT 0,
    p_observacoes text DEFAULT NULL,
    p_data_pagamento date DEFAULT NULL,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_cp RECORD;
    v_baixa_id UUID;
    v_novo_status VARCHAR(20);
    v_total_devido BIGINT;
    v_conta_destino_id UUID;
    v_sessao_id UUID;
    v_uid UUID;
    v_data DATE;
    v_forma_tipo TEXT;
    v_conta_principal UUID;
    v_caixa_operador UUID;
    v_sessao_conta_id UUID;
    v_conta_destino_tipo TEXT;
BEGIN
    IF p_valor_pago_centavos IS NULL OR p_valor_pago_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor pago deve ser maior que zero';
    END IF;

    v_uid  := COALESCE(p_usuario_id, auth.uid());
    v_data := COALESCE(p_data_pagamento, CURRENT_DATE);

    SELECT lower(trim(COALESCE(fp.tipo, fp.nome, ''))) INTO v_forma_tipo
      FROM fin_formas_pagamento fp
     WHERE fp.id = p_forma_pagamento_id;

    SELECT * INTO v_cp
      FROM fin_contas_pagar
     WHERE id = p_conta_pagar_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Titulo a pagar % nao encontrado', p_conta_pagar_id;
    END IF;
    IF v_cp.status IN ('pago','cancelado') THEN
        RAISE EXCEPTION 'Titulo com status % nao pode ser baixado', v_cp.status;
    END IF;

    SELECT id INTO v_conta_principal
      FROM fin_contas_bancarias
     WHERE empresa_id = v_cp.empresa_id AND principal = true AND ativo = true
     ORDER BY created_at
     LIMIT 1;

    SELECT cb.id INTO v_caixa_operador
      FROM fin_contas_bancarias cb
     WHERE cb.empresa_id = v_cp.empresa_id
       AND lower(COALESCE(cb.tipo, '')) = 'caixa'
       AND cb.ativo = true
       AND (
           v_uid IS NULL
           OR cardinality(COALESCE(cb.autorizados_operacao, ARRAY[]::uuid[])) = 0
           OR v_uid = ANY(cb.autorizados_operacao)
       )
     ORDER BY
       CASE WHEN v_uid IS NOT NULL AND cb.autorizados_operacao @> ARRAY[v_uid] THEN 0 ELSE 1 END,
       cb.created_at
     LIMIT 1;

    IF v_forma_tipo IN ('dinheiro', 'especie', 'espécie') THEN
        v_conta_destino_id := COALESCE(p_conta_bancaria_id, v_caixa_operador, v_conta_principal);
    ELSE
        v_conta_destino_id := COALESCE(v_conta_principal, p_conta_bancaria_id);
    END IF;

    INSERT INTO fin_contas_pagar_baixas (
        empresa_id, conta_pagar_id,
        valor_pago_centavos, valor_desconto_centavos,
        valor_juros_centavos, valor_multa_centavos,
        forma_pagamento_id, conta_bancaria_id, observacoes,
        tipo, created_by, data_baixa
    ) VALUES (
        v_cp.empresa_id, p_conta_pagar_id,
        p_valor_pago_centavos, p_valor_desconto_centavos,
        p_valor_juros_centavos, p_valor_multa_centavos,
        p_forma_pagamento_id, v_conta_destino_id, p_observacoes,
        CASE
            WHEN p_valor_pago_centavos
                 >= (v_cp.valor_original_centavos - v_cp.valor_pago_centavos)
            THEN 'normal' ELSE 'parcial'
        END,
        v_uid,
        v_data
    ) RETURNING id INTO v_baixa_id;

    UPDATE fin_contas_pagar SET
        valor_pago_centavos     = valor_pago_centavos     + p_valor_pago_centavos,
        valor_desconto_centavos = valor_desconto_centavos + p_valor_desconto_centavos,
        valor_juros_centavos    = valor_juros_centavos    + p_valor_juros_centavos,
        valor_multa_centavos    = valor_multa_centavos    + p_valor_multa_centavos,
        updated_by              = v_uid
    WHERE id = p_conta_pagar_id;

    SELECT * INTO v_cp FROM fin_contas_pagar WHERE id = p_conta_pagar_id;

    v_total_devido := v_cp.valor_original_centavos
                    + v_cp.valor_juros_centavos
                    + v_cp.valor_multa_centavos
                    - v_cp.valor_desconto_centavos;

    IF v_cp.valor_pago_centavos >= v_total_devido THEN
        v_novo_status := 'pago';
    ELSE
        v_novo_status := 'pago_parcial';
    END IF;

    UPDATE fin_contas_pagar SET
        status              = v_novo_status,
        data_pagamento      = CASE WHEN v_novo_status = 'pago' THEN v_data ELSE data_pagamento END,
        forma_pagamento_id  = COALESCE(p_forma_pagamento_id, forma_pagamento_id),
        conta_bancaria_id   = COALESCE(v_conta_destino_id, conta_bancaria_id)
    WHERE id = p_conta_pagar_id;

    IF v_conta_destino_id IS NOT NULL THEN
        UPDATE fin_contas_bancarias
           SET saldo_atual_centavos = saldo_atual_centavos - p_valor_pago_centavos
         WHERE id = v_conta_destino_id;
    END IF;

    INSERT INTO fin_movimentacoes (
        empresa_id, filial_id, codigo, conta_bancaria_id,
        plano_conta_id, centro_custo_id,
        tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia,
        conta_pagar_id, conta_pagar_baixa_id,
        created_by
    ) VALUES (
        v_cp.empresa_id, v_cp.filial_id,
        'MOV-' || to_char(now(), 'YYYYMMDD-HH24MISS-US'),
        v_conta_destino_id,
        v_cp.plano_conta_id, v_cp.centro_custo_id,
        'despesa',
        'Pagamento: ' || v_cp.codigo || COALESCE(' - ' || v_cp.descricao, ''),
        p_valor_pago_centavos,
        v_data, v_cp.data_competencia,
        p_conta_pagar_id, v_baixa_id,
        v_uid
    );

    SELECT lower(COALESCE(cb.tipo, '')) INTO v_conta_destino_tipo
      FROM fin_contas_bancarias cb
     WHERE cb.id = v_conta_destino_id;

    v_sessao_conta_id := CASE
        WHEN v_conta_destino_tipo = 'caixa' THEN v_conta_destino_id
        ELSE v_caixa_operador
    END;

    IF v_sessao_conta_id IS NOT NULL AND v_uid IS NOT NULL THEN
        DELETE FROM fin_caixa_movimentos m
         WHERE m.referencia_tipo = 'fin_contas_pagar'
           AND m.referencia_id = p_conta_pagar_id
           AND m.valor_centavos = p_valor_pago_centavos
           AND m.data_movimentacao IS DISTINCT FROM v_data;

        SELECT s.id INTO v_sessao_id
          FROM fin_caixa_sessoes s
         WHERE s.conta_bancaria_id = v_sessao_conta_id
           AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = v_data
           AND (s.status = 'aberto' OR s.status = 'fechado')
         ORDER BY
           CASE WHEN s.status = 'aberto' THEN 0 ELSE 1 END,
           s.data_abertura DESC
         LIMIT 1;

        IF v_sessao_id IS NOT NULL THEN
            PERFORM public.fin_sync_baixas_caixa_pagar_sessao(v_sessao_id);
        END IF;
    END IF;

    RETURN v_baixa_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_baixar_conta_pagar(
    uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid
) TO authenticated;

-- Backfill: remove saídas de caixa com data divergente da baixa e recria na sessão correta.
DO $backfill$
DECLARE
    r RECORD;
    n integer;
    total integer := 0;
BEGIN
    DELETE FROM fin_caixa_movimentos m
     USING fin_contas_pagar_baixas b
     WHERE m.referencia_tipo = 'fin_contas_pagar'
       AND m.referencia_id = b.conta_pagar_id
       AND m.valor_centavos = b.valor_pago_centavos
       AND COALESCE(b.estornada, false) = false
       AND m.data_movimentacao IS DISTINCT FROM COALESCE(
             b.data_baixa,
             (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date
           );

    FOR r IN
        SELECT DISTINCT s.id AS sessao_id
          FROM fin_contas_pagar_baixas b
          JOIN fin_contas_bancarias cb ON cb.id = b.conta_bancaria_id
          JOIN fin_caixa_sessoes s ON s.conta_bancaria_id = cb.id
         WHERE COALESCE(b.estornada, false) = false
           AND lower(COALESCE(cb.tipo, '')) = 'caixa'
           AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = COALESCE(
                 b.data_baixa,
                 (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date
               )
        UNION
        SELECT DISTINCT s.id
          FROM fin_contas_pagar_baixas b
          JOIN fin_contas_bancarias cb_b ON cb_b.id = b.conta_bancaria_id
          JOIN fin_contas_bancarias cb_cx ON lower(COALESCE(cb_cx.tipo, '')) = 'caixa'
          JOIN fin_caixa_sessoes s ON s.conta_bancaria_id = cb_cx.id
         WHERE COALESCE(b.estornada, false) = false
           AND lower(COALESCE(cb_b.tipo, '')) IS DISTINCT FROM 'caixa'
           AND b.created_by IS NOT NULL
           AND (
               cardinality(COALESCE(cb_cx.autorizados_operacao, ARRAY[]::uuid[])) = 0
               OR b.created_by = ANY(cb_cx.autorizados_operacao)
           )
           AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = COALESCE(
                 b.data_baixa,
                 (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date
               )
    LOOP
        n := public.fin_sync_baixas_caixa_pagar_sessao(r.sessao_id);
        total := total + COALESCE(n, 0);
    END LOOP;

    RAISE NOTICE 'fin_caixa_pagar_data_baixa backfill: % movimento(s)', total;
END;
$backfill$;

UPDATE fin_caixa_sessoes s
   SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(s.id)
 WHERE s.status IN ('aberto', 'fechado')
   AND EXISTS (
       SELECT 1
         FROM fin_caixa_movimentos m
        WHERE m.sessao_id = s.id
          AND m.referencia_tipo = 'fin_contas_pagar'
   );

NOTIFY pgrst, 'reload schema';

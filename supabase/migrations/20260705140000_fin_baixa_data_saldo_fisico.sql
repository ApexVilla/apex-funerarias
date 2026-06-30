-- Data da baixa define sessão do caixa; saldo físico só espécie; PIX/cartão creditam conta principal.

CREATE OR REPLACE FUNCTION public.fin_movimento_impacta_saldo_fisico(
    p_tipo text,
    p_forma_pagamento text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN lower(trim(COALESCE(p_tipo, ''))) IN ('sangria', 'suprimento') THEN true
        WHEN lower(trim(COALESCE(p_tipo, ''))) NOT IN ('entrada', 'saida') THEN false
        ELSE lower(trim(COALESCE(p_forma_pagamento, ''))) NOT IN (
            'pix', 'pix_outros', 'cartao_credito', 'cartao_debito',
            'credito', 'debito', 'cheque', 'boleto', 'transferencia'
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.fin_caixa_saldo_fisico_sessao(p_sessao_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(s.saldo_abertura_centavos, 0)::bigint + COALESCE((
        SELECT SUM(
            CASE
                WHEN public.fin_movimento_impacta_saldo_fisico(m.tipo, m.forma_pagamento) THEN
                    CASE m.tipo
                        WHEN 'entrada' THEN m.valor_centavos
                        WHEN 'suprimento' THEN m.valor_centavos
                        WHEN 'saida' THEN -m.valor_centavos
                        WHEN 'sangria' THEN -m.valor_centavos
                        ELSE 0
                    END
                ELSE 0
            END
        )::bigint
        FROM fin_caixa_movimentos m
        WHERE m.sessao_id = p_sessao_id
    ), 0)::bigint
    FROM fin_caixa_sessoes s
    WHERE s.id = p_sessao_id;
$$;

CREATE OR REPLACE FUNCTION public.fin_sync_baixas_caixa_sessao(p_sessao_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_sess RECORD;
    v_dia date;
    v_inserted integer := 0;
BEGIN
    SELECT s.*, cb.tipo AS conta_tipo, cb.autorizados_operacao
      INTO v_sess
      FROM fin_caixa_sessoes s
      JOIN fin_contas_bancarias cb ON cb.id = s.conta_bancaria_id
     WHERE s.id = p_sessao_id;

    IF NOT FOUND OR v_sess.conta_tipo IS DISTINCT FROM 'caixa' THEN
        RETURN 0;
    END IF;

    v_dia := (v_sess.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date;

    WITH novos AS (
        INSERT INTO fin_caixa_movimentos (
            empresa_id, sessao_id, tipo, descricao, valor_centavos,
            referencia_id, referencia_tipo, forma_pagamento,
            usuario_id, data_movimentacao, created_at
        )
        SELECT
            b.empresa_id,
            p_sessao_id,
            'entrada',
            'Recebimento ' || cr.codigo || COALESCE(' - ' || cr.descricao, ''),
            b.valor_pago_centavos,
            b.conta_receber_id,
            'fin_contas_receber',
            COALESCE(
                (SELECT
                    CASE lower(trim(COALESCE(fp.tipo, fp.nome, 'dinheiro')))
                        WHEN 'dinheiro' THEN 'especie'
                        WHEN 'espécie' THEN 'especie'
                        WHEN 'especie' THEN 'especie'
                        WHEN 'pix' THEN 'pix'
                        WHEN 'cartao_credito' THEN 'cartao_credito'
                        WHEN 'cartao_debito' THEN 'cartao_debito'
                        WHEN 'cheque' THEN 'cheque'
                        ELSE lower(trim(COALESCE(fp.tipo, fp.nome, 'dinheiro')))
                    END
                 FROM fin_formas_pagamento fp
                 WHERE fp.id = b.forma_pagamento_id),
                'especie'
            ),
            b.created_by,
            COALESCE(b.data_baixa, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date),
            b.created_at
        FROM fin_contas_receber_baixas b
        JOIN fin_contas_receber cr ON cr.id = b.conta_receber_id
        WHERE COALESCE(b.estornada, false) = false
          AND COALESCE(b.data_baixa, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = v_dia
          AND (
              b.conta_bancaria_id = v_sess.conta_bancaria_id
              OR (
                  b.created_by IS NOT NULL
                  AND EXISTS (
                      SELECT 1
                        FROM fin_contas_bancarias cb_b
                       WHERE cb_b.id = b.conta_bancaria_id
                         AND lower(COALESCE(cb_b.tipo, '')) IS DISTINCT FROM 'caixa'
                  )
                  AND (
                      cardinality(COALESCE(v_sess.autorizados_operacao, ARRAY[]::uuid[])) = 0
                      OR b.created_by = ANY(v_sess.autorizados_operacao)
                  )
              )
          )
          AND NOT EXISTS (
              SELECT 1
                FROM fin_caixa_movimentos m
               WHERE m.referencia_tipo = 'fin_contas_receber'
                 AND m.referencia_id = b.conta_receber_id
                 AND m.valor_centavos = b.valor_pago_centavos
                 AND m.sessao_id = p_sessao_id
          )
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_inserted FROM novos;

    IF v_inserted > 0 AND v_sess.status = 'aberto' THEN
        UPDATE fin_caixa_sessoes s
           SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(p_sessao_id)
         WHERE s.id = p_sessao_id;
    END IF;

    RETURN v_inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_baixar_conta_receber(
    p_conta_receber_id uuid,
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
    v_cr RECORD;
    v_baixa_id UUID;
    v_novo_status VARCHAR(20);
    v_total_devido BIGINT;
    v_conta_saldo_id UUID;
    v_sessao_id UUID;
    v_uid UUID;
    v_data DATE;
    v_forma_tipo TEXT;
    v_conta_principal UUID;
    v_caixa_operador UUID;
BEGIN
    IF p_valor_pago_centavos IS NULL OR p_valor_pago_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor pago deve ser maior que zero';
    END IF;

    v_uid  := COALESCE(p_usuario_id, auth.uid());
    v_data := COALESCE(p_data_pagamento, CURRENT_DATE);

    SELECT lower(trim(COALESCE(fp.tipo, fp.nome, ''))) INTO v_forma_tipo
      FROM fin_formas_pagamento fp
     WHERE fp.id = p_forma_pagamento_id;

    SELECT * INTO v_cr
      FROM fin_contas_receber
     WHERE id = p_conta_receber_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Titulo a receber % nao encontrado', p_conta_receber_id;
    END IF;
    IF v_cr.status IN ('pago','cancelado') THEN
        RAISE EXCEPTION 'Titulo com status % nao pode ser baixado', v_cr.status;
    END IF;

    SELECT id INTO v_conta_principal
      FROM fin_contas_bancarias
     WHERE empresa_id = v_cr.empresa_id AND principal = true AND ativo = true
     ORDER BY created_at
     LIMIT 1;

    SELECT cb.id INTO v_caixa_operador
      FROM fin_contas_bancarias cb
     WHERE cb.empresa_id = v_cr.empresa_id
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
        v_conta_saldo_id := COALESCE(p_conta_bancaria_id, v_caixa_operador, v_conta_principal);
    ELSE
        v_conta_saldo_id := COALESCE(v_conta_principal, p_conta_bancaria_id);
    END IF;

    INSERT INTO fin_contas_receber_baixas (
        empresa_id, conta_receber_id,
        valor_pago_centavos, valor_desconto_centavos,
        valor_juros_centavos, valor_multa_centavos,
        forma_pagamento_id, conta_bancaria_id, observacoes,
        tipo, created_by, data_baixa
    ) VALUES (
        v_cr.empresa_id, p_conta_receber_id,
        p_valor_pago_centavos, p_valor_desconto_centavos,
        p_valor_juros_centavos, p_valor_multa_centavos,
        p_forma_pagamento_id, v_conta_saldo_id, p_observacoes,
        CASE
            WHEN p_valor_pago_centavos
                 >= (v_cr.valor_original_centavos - v_cr.valor_pago_centavos)
            THEN 'normal' ELSE 'parcial'
        END,
        v_uid,
        v_data
    ) RETURNING id INTO v_baixa_id;

    UPDATE fin_contas_receber SET
        valor_pago_centavos     = valor_pago_centavos     + p_valor_pago_centavos,
        valor_desconto_centavos = valor_desconto_centavos + p_valor_desconto_centavos,
        valor_juros_centavos    = valor_juros_centavos    + p_valor_juros_centavos,
        valor_multa_centavos    = valor_multa_centavos    + p_valor_multa_centavos,
        updated_by              = v_uid
    WHERE id = p_conta_receber_id;

    SELECT * INTO v_cr FROM fin_contas_receber WHERE id = p_conta_receber_id;

    v_total_devido := v_cr.valor_original_centavos
                    + v_cr.valor_juros_centavos
                    + v_cr.valor_multa_centavos
                    - v_cr.valor_desconto_centavos;

    IF v_cr.valor_pago_centavos >= v_total_devido THEN
        v_novo_status := 'pago';
    ELSE
        v_novo_status := 'pago_parcial';
    END IF;

    UPDATE fin_contas_receber SET
        status              = v_novo_status,
        data_pagamento      = CASE WHEN v_novo_status = 'pago' THEN v_data ELSE data_pagamento END,
        forma_pagamento_id  = COALESCE(p_forma_pagamento_id, forma_pagamento_id),
        conta_bancaria_id   = COALESCE(v_conta_saldo_id, conta_bancaria_id)
    WHERE id = p_conta_receber_id;

    IF v_conta_saldo_id IS NOT NULL THEN
        UPDATE fin_contas_bancarias
           SET saldo_atual_centavos = saldo_atual_centavos + p_valor_pago_centavos
         WHERE id = v_conta_saldo_id;
    END IF;

    INSERT INTO fin_movimentacoes (
        empresa_id, filial_id, codigo, conta_bancaria_id,
        plano_conta_id, centro_custo_id,
        tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia,
        conta_receber_id, conta_receber_baixa_id,
        created_by
    ) VALUES (
        v_cr.empresa_id, v_cr.filial_id,
        'MOV-' || to_char(now(), 'YYYYMMDD-HH24MISS-US'),
        v_conta_saldo_id,
        v_cr.plano_conta_id, v_cr.centro_custo_id,
        'receita',
        'Recebimento: ' || v_cr.codigo || COALESCE(' - ' || v_cr.descricao, ''),
        p_valor_pago_centavos,
        v_data, v_cr.data_competencia,
        p_conta_receber_id, v_baixa_id,
        v_uid
    );

    IF v_caixa_operador IS NOT NULL AND v_uid IS NOT NULL THEN
        SELECT s.id INTO v_sessao_id
          FROM fin_caixa_sessoes s
         WHERE s.conta_bancaria_id = v_caixa_operador
           AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = v_data
           AND (s.status = 'aberto' OR s.status = 'fechado')
         ORDER BY
           CASE WHEN s.status = 'aberto' THEN 0 ELSE 1 END,
           s.data_abertura DESC
         LIMIT 1;

        IF v_sessao_id IS NOT NULL THEN
            PERFORM public.fin_sync_baixas_caixa_sessao(v_sessao_id);
        END IF;
    END IF;

    RETURN v_baixa_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_movimento_impacta_saldo_fisico(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_caixa_saldo_fisico_sessao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_sync_baixas_caixa_sessao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_baixar_conta_receber(uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid) TO authenticated;

-- Recalcula saldo físico das sessões abertas
UPDATE fin_caixa_sessoes s
   SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(s.id)
 WHERE s.status = 'aberto';

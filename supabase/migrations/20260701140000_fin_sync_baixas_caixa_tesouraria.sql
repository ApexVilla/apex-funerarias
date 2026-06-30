-- Sincroniza baixas de Contas a Receber com movimentos de caixa (Tesouraria / caixa da atendente).
-- Cobre o caso em que a parcela foi baixada antes da abertura da sessão do dia.

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
    SELECT s.*, cb.tipo AS conta_tipo
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
          AND b.conta_bancaria_id = v_sess.conta_bancaria_id
          AND COALESCE(b.data_baixa, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = v_dia
          AND NOT EXISTS (
              SELECT 1
                FROM fin_caixa_movimentos m
               WHERE m.sessao_id = p_sessao_id
                 AND m.referencia_tipo = 'fin_contas_receber'
                 AND m.referencia_id = b.conta_receber_id
                 AND m.valor_centavos = b.valor_pago_centavos
          )
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_inserted FROM novos;

    IF v_inserted > 0 AND v_sess.status = 'aberto' THEN
        UPDATE fin_caixa_sessoes s
           SET saldo_sistema_centavos = s.saldo_abertura_centavos + COALESCE((
               SELECT SUM(
                   CASE m.tipo
                       WHEN 'entrada' THEN m.valor_centavos
                       WHEN 'suprimento' THEN m.valor_centavos
                       WHEN 'saida' THEN -m.valor_centavos
                       WHEN 'sangria' THEN -m.valor_centavos
                       ELSE 0
                   END
               )
               FROM fin_caixa_movimentos m
               WHERE m.sessao_id = p_sessao_id
           ), 0)
         WHERE s.id = p_sessao_id;
    END IF;

    RETURN v_inserted;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_sync_baixas_caixa_sessao(uuid) TO authenticated;

-- fin_baixar_conta_receber: data_movimentacao + sync na sessão do dia
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
    v_conta_origem_id UUID;
    v_sessao_id UUID;
    v_uid UUID;
    v_data DATE;
    v_forma_caixa TEXT;
BEGIN
    IF p_valor_pago_centavos IS NULL OR p_valor_pago_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor pago deve ser maior que zero';
    END IF;

    v_uid  := COALESCE(p_usuario_id, auth.uid());
    v_data := COALESCE(p_data_pagamento, CURRENT_DATE);

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
        p_forma_pagamento_id, p_conta_bancaria_id, p_observacoes,
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
        conta_bancaria_id   = COALESCE(p_conta_bancaria_id,  conta_bancaria_id)
    WHERE id = p_conta_receber_id;

    v_conta_origem_id := COALESCE(
        p_conta_bancaria_id,
        (SELECT id FROM fin_contas_bancarias
          WHERE empresa_id = v_cr.empresa_id AND principal = true LIMIT 1)
    );

    IF v_conta_origem_id IS NOT NULL THEN
        UPDATE fin_contas_bancarias
           SET saldo_atual_centavos = saldo_atual_centavos + p_valor_pago_centavos
         WHERE id = v_conta_origem_id;
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
        v_conta_origem_id,
        v_cr.plano_conta_id, v_cr.centro_custo_id,
        'receita',
        'Recebimento: ' || v_cr.codigo || COALESCE(' - ' || v_cr.descricao, ''),
        p_valor_pago_centavos,
        v_data, v_cr.data_competencia,
        p_conta_receber_id, v_baixa_id,
        v_uid
    );

    v_forma_caixa := COALESCE(
        (SELECT
            CASE lower(trim(COALESCE(tipo, nome, 'dinheiro')))
                WHEN 'dinheiro' THEN 'especie'
                WHEN 'espécie' THEN 'especie'
                WHEN 'especie' THEN 'especie'
                WHEN 'pix' THEN 'pix'
                WHEN 'cartao_credito' THEN 'cartao_credito'
                WHEN 'cartao_debito' THEN 'cartao_debito'
                WHEN 'cheque' THEN 'cheque'
                ELSE lower(trim(COALESCE(tipo, nome, 'dinheiro')))
            END
         FROM fin_formas_pagamento WHERE id = p_forma_pagamento_id),
        'especie'
    );

    IF v_conta_origem_id IS NOT NULL THEN
        SELECT id INTO v_sessao_id
          FROM fin_caixa_sessoes
         WHERE conta_bancaria_id = v_conta_origem_id
           AND status = 'aberto'
         LIMIT 1;

        IF v_sessao_id IS NULL THEN
            SELECT id INTO v_sessao_id
              FROM fin_caixa_sessoes
             WHERE conta_bancaria_id = v_conta_origem_id
               AND (data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = v_data
             ORDER BY data_abertura DESC
             LIMIT 1;
        END IF;

        IF v_sessao_id IS NOT NULL THEN
            PERFORM public.fin_sync_baixas_caixa_sessao(v_sessao_id);
        END IF;
    END IF;

    RETURN v_baixa_id;
END;
$function$;

-- Backfill: sessões abertas e dos últimos 7 dias em contas tipo caixa
DO $backfill$
DECLARE
    r RECORD;
    n integer;
    total integer := 0;
BEGIN
    FOR r IN
        SELECT s.id
          FROM fin_caixa_sessoes s
          JOIN fin_contas_bancarias cb ON cb.id = s.conta_bancaria_id
         WHERE cb.tipo = 'caixa'
           AND (
               s.status = 'aberto'
               OR (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date
                  >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 7
           )
    LOOP
        n := public.fin_sync_baixas_caixa_sessao(r.id);
        total := total + COALESCE(n, 0);
    END LOOP;
    RAISE NOTICE 'fin_sync_baixas_caixa backfill: % movimento(s)', total;
END;
$backfill$;

-- Tesouraria: sincroniza baixas na conta corrente (ex.: Fenix Aparecida / ITAÚ) e no caixa físico.
-- Antes, fin_sync_baixas_caixa_sessao ignorava contas tipo 'corrente', então boletos/PIX na conta
-- principal não apareciam no extrato diário da Tesouraria.

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

    IF NOT FOUND OR lower(COALESCE(v_sess.conta_tipo, '')) NOT IN ('caixa', 'corrente') THEN
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
            public.fin_montar_descricao_caixa_recebimento(
                cr.codigo,
                cr.descricao,
                cl.nome,
                a.codigo,
                b.pix_nome_pagador
            ),
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
                        WHEN 'boleto' THEN 'boleto'
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
        LEFT JOIN clientes cl ON cl.id = cr.cliente_id
        LEFT JOIN assinaturas a ON a.id = cr.assinatura_id
        WHERE COALESCE(b.estornada, false) = false
          AND COALESCE(b.data_baixa, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = v_dia
          AND b.conta_bancaria_id = v_sess.conta_bancaria_id
          AND NOT EXISTS (
              SELECT 1
                FROM fin_caixa_movimentos m
               WHERE m.referencia_tipo = 'fin_contas_receber'
                 AND m.referencia_id = b.conta_receber_id
                 AND m.tipo = 'entrada'
                 AND m.valor_centavos = b.valor_pago_centavos
          )
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_inserted FROM novos;

    IF v_inserted > 0 THEN
        UPDATE fin_caixa_sessoes s
           SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(p_sessao_id)
         WHERE s.id = p_sessao_id;
    END IF;

    RETURN v_inserted;
END;
$function$;

-- fin_baixar: sincroniza na conta onde o valor entrou (caixa OU corrente), não só no caixa do operador.
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
    p_usuario_id uuid DEFAULT NULL,
    p_pix_mesmo_pagador boolean DEFAULT NULL,
    p_pix_nome_pagador text DEFAULT NULL
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
    v_forma_caixa TEXT;
    v_eh_pix BOOLEAN := false;
    v_obs text;
    v_conta_principal UUID;
    v_caixa_operador UUID;
    v_hoje date;
    v_conta_tipo_sync TEXT;
BEGIN
    IF p_valor_pago_centavos IS NULL OR p_valor_pago_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor pago deve ser maior que zero';
    END IF;

    v_uid  := COALESCE(p_usuario_id, auth.uid());
    v_data := COALESCE(p_data_pagamento, CURRENT_DATE);
    v_hoje := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;

    SELECT lower(trim(COALESCE(fp.tipo, fp.nome, ''))) INTO v_forma_tipo
      FROM fin_formas_pagamento fp
     WHERE fp.id = p_forma_pagamento_id;

    SELECT
        CASE lower(trim(COALESCE(fp.tipo, fp.nome, 'dinheiro')))
            WHEN 'dinheiro' THEN 'especie'
            WHEN 'espécie' THEN 'especie'
            WHEN 'especie' THEN 'especie'
            WHEN 'pix' THEN 'pix'
            WHEN 'cartao_credito' THEN 'cartao_credito'
            WHEN 'cartao_debito' THEN 'cartao_debito'
            WHEN 'cheque' THEN 'cheque'
            WHEN 'boleto' THEN 'boleto'
            ELSE lower(trim(COALESCE(fp.tipo, fp.nome, 'dinheiro')))
        END
      INTO v_forma_caixa
      FROM fin_formas_pagamento fp
     WHERE fp.id = p_forma_pagamento_id;

    v_eh_pix := (v_forma_caixa = 'pix');

    IF v_eh_pix AND COALESCE(p_pix_mesmo_pagador, true) = false
       AND COALESCE(trim(p_pix_nome_pagador), '') = '' THEN
        RAISE EXCEPTION 'Informe o nome do pagador conforme aparece no comprovante PIX';
    END IF;

    v_obs := p_observacoes;
    IF v_eh_pix AND COALESCE(p_pix_mesmo_pagador, true) = false
       AND COALESCE(trim(p_pix_nome_pagador), '') <> '' THEN
        v_obs := trim(COALESCE(v_obs, '') || CASE WHEN v_obs IS NOT NULL AND trim(v_obs) <> '' THEN ' | ' ELSE '' END
            || 'PIX pagador: ' || trim(p_pix_nome_pagador));
    END IF;

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
        tipo, created_by, data_baixa,
        pix_mesmo_pagador, pix_nome_pagador
    ) VALUES (
        v_cr.empresa_id, p_conta_receber_id,
        p_valor_pago_centavos, p_valor_desconto_centavos,
        p_valor_juros_centavos, p_valor_multa_centavos,
        p_forma_pagamento_id, v_conta_saldo_id, v_obs,
        CASE
            WHEN p_valor_pago_centavos
                 >= (v_cr.valor_original_centavos - v_cr.valor_pago_centavos)
            THEN 'normal' ELSE 'parcial'
        END,
        v_uid,
        v_data,
        CASE WHEN v_eh_pix THEN COALESCE(p_pix_mesmo_pagador, true) ELSE NULL END,
        CASE WHEN v_eh_pix AND COALESCE(p_pix_mesmo_pagador, true) = false
             THEN trim(p_pix_nome_pagador) ELSE NULL END
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

    IF v_conta_saldo_id IS NOT NULL AND v_uid IS NOT NULL THEN
        SELECT lower(COALESCE(tipo, '')) INTO v_conta_tipo_sync
          FROM fin_contas_bancarias
         WHERE id = v_conta_saldo_id;

        IF v_conta_tipo_sync IN ('caixa', 'corrente') THEN
            v_sessao_id := NULL;
            SELECT s.id INTO v_sessao_id
              FROM fin_caixa_sessoes s
             WHERE s.conta_bancaria_id = v_conta_saldo_id
               AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = v_data
               AND (s.status = 'aberto' OR s.status = 'fechado')
             ORDER BY
               CASE WHEN s.status = 'aberto' THEN 0 ELSE 1 END,
               s.data_abertura DESC
             LIMIT 1;

            IF v_sessao_id IS NULL THEN
                INSERT INTO fin_caixa_sessoes (
                    empresa_id, conta_bancaria_id,
                    usuario_abertura_id, usuario_fechamento_id,
                    status, saldo_abertura_centavos, saldo_sistema_centavos,
                    data_abertura, data_fechamento,
                    observacoes_abertura, observacoes_fechamento
                ) VALUES (
                    v_cr.empresa_id,
                    v_conta_saldo_id,
                    v_uid,
                    CASE WHEN v_data = v_hoje THEN NULL ELSE v_uid END,
                    CASE WHEN v_data = v_hoje THEN 'aberto' ELSE 'fechado' END,
                    0,
                    0,
                    (v_data::timestamp AT TIME ZONE 'America/Sao_Paulo'),
                    CASE WHEN v_data = v_hoje THEN NULL
                         ELSE (v_data::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '12 hours'
                    END,
                    'Sessão automática — baixa de conta a receber',
                    CASE WHEN v_data = v_hoje THEN NULL
                         ELSE 'Sessão retroativa — baixa de conta a receber'
                    END
                )
                RETURNING id INTO v_sessao_id;
            END IF;

            IF v_sessao_id IS NOT NULL THEN
                PERFORM public.fin_sync_baixas_caixa_sessao(v_sessao_id);
            END IF;
        END IF;
    END IF;

    RETURN v_baixa_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_sync_baixas_caixa_sessao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_baixar_conta_receber(
    uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid, boolean, text
) TO authenticated;

-- Backfill: baixas em contas corrente/caixa sem movimento na Tesouraria
DO $backfill$
DECLARE
    r RECORD;
    v_sessao_id uuid;
    total integer := 0;
    n integer;
BEGIN
    FOR r IN
        SELECT DISTINCT
            b.empresa_id,
            b.created_by,
            b.conta_bancaria_id AS conta_id,
            COALESCE(b.data_baixa, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS dia
        FROM fin_contas_receber_baixas b
        JOIN fin_contas_bancarias cb ON cb.id = b.conta_bancaria_id
        WHERE COALESCE(b.estornada, false) = false
          AND b.created_by IS NOT NULL
          AND lower(COALESCE(cb.tipo, '')) IN ('caixa', 'corrente')
          AND COALESCE(b.data_baixa, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
              >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 90
          AND NOT EXISTS (
              SELECT 1 FROM fin_caixa_movimentos m
               WHERE m.referencia_tipo = 'fin_contas_receber'
                 AND m.referencia_id = b.conta_receber_id
                 AND m.valor_centavos = b.valor_pago_centavos
          )
    LOOP
        SELECT s.id INTO v_sessao_id
          FROM fin_caixa_sessoes s
         WHERE s.conta_bancaria_id = r.conta_id
           AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = r.dia
         ORDER BY s.data_abertura DESC
         LIMIT 1;

        IF v_sessao_id IS NULL THEN
            INSERT INTO fin_caixa_sessoes (
                empresa_id, conta_bancaria_id,
                usuario_abertura_id, usuario_fechamento_id,
                status,
                saldo_abertura_centavos, saldo_sistema_centavos,
                data_abertura, data_fechamento,
                observacoes_abertura, observacoes_fechamento
            ) VALUES (
                r.empresa_id, r.conta_id,
                r.created_by, r.created_by,
                'fechado',
                0, 0,
                (r.dia::timestamp AT TIME ZONE 'America/Sao_Paulo'),
                (r.dia::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '12 hours',
                'Sessão retroativa — backfill Tesouraria corrente/caixa',
                'Sessão retroativa — backfill Tesouraria corrente/caixa'
            )
            RETURNING id INTO v_sessao_id;
        END IF;

        n := public.fin_sync_baixas_caixa_sessao(v_sessao_id);
        total := total + COALESCE(n, 0);
    END LOOP;

    RAISE NOTICE 'backfill tesouraria corrente/caixa: % movimento(s)', total;
END;
$backfill$;

NOTIFY pgrst, 'reload schema';

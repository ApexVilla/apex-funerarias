-- Estorno de recebimento: remove entrada do caixa na sessão correta e enriquece descrição com cliente/contrato.

CREATE OR REPLACE FUNCTION public.fin_montar_descricao_caixa_recebimento(
    p_codigo text,
    p_descricao_cr text,
    p_cliente_nome text,
    p_contrato_codigo text,
    p_pix_nome_pagador text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT trim(both ' -' from concat_ws(
        ' - ',
        'Recebimento ' || nullif(trim(coalesce(p_codigo, '')), ''),
        nullif(trim(coalesce(p_cliente_nome, '')), ''),
        CASE
            WHEN nullif(trim(coalesce(p_contrato_codigo, '')), '') IS NOT NULL
            THEN 'Contrato ' || trim(p_contrato_codigo)
        END,
        CASE
            WHEN nullif(trim(coalesce(p_pix_nome_pagador, '')), '') IS NOT NULL
            THEN 'Pagador PIX: ' || trim(p_pix_nome_pagador)
        END,
        nullif(trim(coalesce(p_descricao_cr, '')), '')
    ));
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

CREATE OR REPLACE FUNCTION public.fin_estornar_conta_receber(
    p_conta_receber_id uuid,
    p_motivo text,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_empresa_id UUID;
    v_filial_id UUID;
    v_status_atual TEXT;
    v_movimento RECORD;
    v_caixa_mov RECORD;
    v_estorno_mov_id UUID;
    v_data_vencimento DATE;
    v_uid UUID;
    v_sessoes_recalc UUID[] := ARRAY[]::uuid[];
BEGIN
    v_uid := COALESCE(p_usuario_id, auth.uid());

    SELECT empresa_id, filial_id, status, data_vencimento
      INTO v_empresa_id, v_filial_id, v_status_atual, v_data_vencimento
      FROM fin_contas_receber
     WHERE id = p_conta_receber_id;

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Conta a receber não encontrada.';
    END IF;

    IF v_status_atual NOT IN ('pago', 'pago_parcial') THEN
        RAISE EXCEPTION 'Apenas títulos pagos ou parcialmente pagos podem ser estornados.';
    END IF;

    FOR v_movimento IN
        SELECT *
          FROM fin_movimentacoes
         WHERE conta_receber_id = p_conta_receber_id
           AND tipo = 'receita'
           AND valor_centavos > 0
    LOOP
        INSERT INTO fin_movimentacoes (
            empresa_id, filial_id, conta_bancaria_id, codigo, tipo, descricao,
            valor_centavos, data_movimentacao, data_competencia,
            conta_receber_id, created_at, observacoes, created_by
        ) VALUES (
            v_empresa_id, COALESCE(v_movimento.filial_id, v_filial_id),
            v_movimento.conta_bancaria_id,
            'EST-' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
            'estorno',
            'Estorno de Recebimento: ' || v_movimento.descricao || ' - Motivo: ' || p_motivo,
            ABS(v_movimento.valor_centavos),
            CURRENT_DATE, CURRENT_DATE,
            p_conta_receber_id, NOW(),
            'Estorno do movimento ' || v_movimento.id,
            v_uid
        ) RETURNING id INTO v_estorno_mov_id;

        IF v_movimento.conta_bancaria_id IS NOT NULL THEN
            UPDATE fin_contas_bancarias
               SET saldo_atual_centavos = saldo_atual_centavos - ABS(v_movimento.valor_centavos)
             WHERE id = v_movimento.conta_bancaria_id;
        END IF;
    END LOOP;

    FOR v_caixa_mov IN
        SELECT m.*
          FROM fin_caixa_movimentos m
         WHERE m.referencia_tipo = 'fin_contas_receber'
           AND m.referencia_id = p_conta_receber_id
           AND m.tipo = 'entrada'
    LOOP
        INSERT INTO fin_caixa_movimentos (
            empresa_id, sessao_id, tipo, descricao, valor_centavos,
            referencia_id, referencia_tipo, forma_pagamento, usuario_id,
            data_movimentacao, created_at
        ) VALUES (
            v_caixa_mov.empresa_id,
            v_caixa_mov.sessao_id,
            'saida',
            'Estorno de Recebimento: ' || v_caixa_mov.descricao || ' — Motivo: ' || p_motivo,
            v_caixa_mov.valor_centavos,
            COALESCE(v_estorno_mov_id, p_conta_receber_id),
            CASE WHEN v_estorno_mov_id IS NOT NULL THEN 'fin_movimentacoes' ELSE 'fin_contas_receber' END,
            v_caixa_mov.forma_pagamento,
            v_uid,
            COALESCE(v_caixa_mov.data_movimentacao, CURRENT_DATE),
            NOW()
        );

        DELETE FROM fin_caixa_movimentos WHERE id = v_caixa_mov.id;

        IF NOT v_caixa_mov.sessao_id = ANY(v_sessoes_recalc) THEN
            v_sessoes_recalc := array_append(v_sessoes_recalc, v_caixa_mov.sessao_id);
        END IF;
    END LOOP;

    IF cardinality(v_sessoes_recalc) > 0 THEN
        UPDATE fin_caixa_sessoes s
           SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(s.id)
         WHERE s.id = ANY(v_sessoes_recalc);
    END IF;

    DELETE FROM fin_contas_receber_baixas WHERE conta_receber_id = p_conta_receber_id;

    UPDATE fin_contas_receber SET
        status = CASE WHEN v_data_vencimento < CURRENT_DATE THEN 'vencido' ELSE 'aberto' END,
        valor_pago_centavos     = 0,
        valor_aberto_centavos   = valor_total_centavos,
        valor_juros_centavos    = 0,
        valor_multa_centavos    = 0,
        valor_desconto_centavos = 0,
        data_pagamento          = NULL,
        updated_by              = v_uid
    WHERE id = p_conta_receber_id;
END;
$function$;

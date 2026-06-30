-- Estorno na Tesouraria: remove a entrada original do extrato após lançar saída de estorno.
-- Corrige comportamento que mantinha entrada + saída (saldo líquido zero e título visível).

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
         WHERE m.referencia_id = p_conta_receber_id
           AND m.tipo = 'entrada'
           AND m.referencia_tipo IN ('fin_contas_receber', 'conta_receber')
           AND NOT EXISTS (
               SELECT 1
                 FROM fin_caixa_movimentos e
                WHERE e.sessao_id = m.sessao_id
                  AND e.tipo = 'saida'
                  AND e.descricao LIKE 'Estorno de Recebimento: ' || m.descricao || '%'
           )
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

-- Corrige estornos já feitos com a regra antiga (entrada + saída no extrato).
WITH entradas_estornadas AS (
    SELECT DISTINCT e.id, e.sessao_id
      FROM fin_caixa_movimentos e
     WHERE e.tipo = 'entrada'
       AND e.referencia_tipo IN ('fin_contas_receber', 'conta_receber')
       AND EXISTS (
           SELECT 1
             FROM fin_caixa_movimentos s
            WHERE s.sessao_id = e.sessao_id
              AND s.tipo = 'saida'
              AND s.descricao LIKE 'Estorno de Recebimento: ' || e.descricao || '%'
       )
),
removidas AS (
    DELETE FROM fin_caixa_movimentos m
     USING entradas_estornadas ee
     WHERE m.id = ee.id
     RETURNING ee.sessao_id
)
UPDATE fin_caixa_sessoes s
   SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(s.id)
 WHERE s.id IN (SELECT DISTINCT sessao_id FROM removidas);

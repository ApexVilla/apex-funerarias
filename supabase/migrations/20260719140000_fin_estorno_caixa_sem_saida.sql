-- Estorno na Tesouraria: apenas remove a entrada do extrato (sem lançar saída de estorno).
-- A parcela volta para em aberto; o caixa deixa de exibir o recebimento.

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
        );

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
    LOOP
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

-- Remove saídas de estorno antigas do extrato do caixa (regra anterior).
WITH removidas AS (
    DELETE FROM fin_caixa_movimentos
     WHERE tipo = 'saida'
       AND descricao LIKE 'Estorno de Recebimento:%'
    RETURNING sessao_id
)
UPDATE fin_caixa_sessoes s
   SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(s.id)
 WHERE s.id IN (SELECT DISTINCT sessao_id FROM removidas);

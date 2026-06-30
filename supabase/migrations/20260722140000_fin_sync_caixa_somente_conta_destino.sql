-- Caixa: sincroniza apenas baixas cuja conta_bancaria_id é o próprio caixa da sessão.
-- Antes, baixas na conta corrente (recepção) podiam aparecer no caixa do operador autorizado,
-- gerando valores de clientes da carteira de outro cobrador no caixa errado.

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

GRANT EXECUTE ON FUNCTION public.fin_sync_baixas_caixa_sessao(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

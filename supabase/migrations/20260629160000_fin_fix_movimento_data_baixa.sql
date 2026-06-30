-- Corrige movimentos cuja data_movimentacao foi gravada errada (bug anterior de sync).
WITH corrigidos AS (
    UPDATE fin_caixa_movimentos m
       SET data_movimentacao = COALESCE(
           (SELECT b.data_baixa
              FROM fin_contas_receber_baixas b
             WHERE b.conta_receber_id = m.referencia_id
               AND b.valor_pago_centavos = m.valor_centavos
               AND COALESCE(b.estornada, false) = false
             ORDER BY b.created_at DESC
             LIMIT 1),
           (SELECT (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date
              FROM fin_caixa_sessoes s WHERE s.id = m.sessao_id)
       )
     WHERE m.referencia_tipo = 'fin_contas_receber'
       AND COALESCE(m.data_movimentacao, (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
           <> (SELECT (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date
                 FROM fin_caixa_sessoes s WHERE s.id = m.sessao_id)
     RETURNING m.sessao_id
)
UPDATE fin_caixa_sessoes s
   SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(s.id)
 WHERE s.id IN (SELECT DISTINCT sessao_id FROM corrigidos);

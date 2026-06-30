-- Reassocia movimentos de caixa à sessão do dia correto (data_movimentacao).
-- Corrige casos em que sessao_id aponta para outro dia (ex.: migração que unificou sessões).

WITH orphans AS (
    SELECT
        m.id AS mov_id,
        m.sessao_id AS sessao_atual_id,
        m.data_movimentacao,
        m.created_at,
        s_atual.conta_bancaria_id
    FROM fin_caixa_movimentos m
    JOIN fin_caixa_sessoes s_atual ON s_atual.id = m.sessao_id
    WHERE m.data_movimentacao IS NOT NULL
      AND m.data_movimentacao <> (s_atual.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date
),
destinos AS (
    SELECT DISTINCT ON (o.mov_id)
        o.mov_id,
        s.id AS sessao_destino_id,
        o.sessao_atual_id
    FROM orphans o
    JOIN fin_caixa_sessoes s
      ON s.conta_bancaria_id = o.conta_bancaria_id
     AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = o.data_movimentacao
    ORDER BY o.mov_id, abs(EXTRACT(EPOCH FROM (s.data_abertura - o.created_at)))
),
updated AS (
    UPDATE fin_caixa_movimentos m
       SET sessao_id = d.sessao_destino_id
      FROM destinos d
     WHERE m.id = d.mov_id
       AND d.sessao_destino_id IS DISTINCT FROM m.sessao_id
    RETURNING m.sessao_id AS sessao_nova, d.sessao_atual_id AS sessao_antiga
),
sessoes_afetadas AS (
    SELECT DISTINCT sessao_nova AS id FROM updated
    UNION
    SELECT DISTINCT sessao_antiga AS id FROM updated
),
contas_afetadas AS (
    SELECT DISTINCT s.conta_bancaria_id
      FROM fin_caixa_sessoes s
     WHERE s.id IN (SELECT id FROM sessoes_afetadas)
)
UPDATE fin_caixa_sessoes s
   SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(s.id)
 WHERE s.conta_bancaria_id IN (SELECT conta_bancaria_id FROM contas_afetadas);

-- Atualiza saldo das contas caixa com sessão aberta
UPDATE fin_contas_bancarias cb
   SET saldo_atual_centavos = sub.saldo::integer,
       updated_at = now()
  FROM (
    SELECT s.conta_bancaria_id, public.fin_caixa_saldo_fisico_sessao(s.id) AS saldo
      FROM fin_caixa_sessoes s
     WHERE s.status = 'aberto'
  ) sub
 WHERE cb.id = sub.conta_bancaria_id
   AND cb.tipo = 'caixa';

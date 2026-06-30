-- Corrige 1º vencimento gravado a partir da data da proposta (+30d) em vez da data do contrato.
-- Padrão: cliente_desde = data_contratacao anterior à proposta; parcelas abertas deslocadas −1 mês.

WITH alvos AS (
  SELECT
    a.id AS assinatura_id,
    a.data_primeiro_vencimento AS pv_antigo,
    (a.data_contratacao + interval '30 days')::date AS pv_novo
  FROM assinaturas a
  JOIN clientes c ON c.id = a.cliente_id
  JOIN propostas_venda p ON p.assinatura_id = a.id
  WHERE a.deleted_at IS NULL
    AND COALESCE(p.contrato_migracao, false) = false
    AND c.cliente_desde = a.data_contratacao
    AND p.data_pedido > a.data_contratacao
    AND a.data_primeiro_vencimento = (p.data_pedido + interval '30 days')::date
),
upd_ass AS (
  UPDATE assinaturas a
  SET data_primeiro_vencimento = alvos.pv_novo
  FROM alvos
  WHERE a.id = alvos.assinatura_id
  RETURNING a.id
),
upd_prop AS (
  UPDATE propostas_venda p
  SET primeiro_vencimento = alvos.pv_novo
  FROM alvos
  WHERE p.assinatura_id = alvos.assinatura_id
  RETURNING p.id
)
UPDATE fin_contas_receber cr
SET data_vencimento = (cr.data_vencimento - interval '1 month')::date
FROM alvos
WHERE cr.assinatura_id = alvos.assinatura_id
  AND cr.deleted_at IS NULL
  AND cr.status IN ('aberto', 'pendente')
  AND cr.data_vencimento >= alvos.pv_antigo;

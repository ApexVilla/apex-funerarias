-- David Pereira Frota: dois contratos gerados no mesmo instante (18/06/2026)
-- CTR-000049 + CTR-000050, cada um com 12 parcelas de R$ 53,00.
-- Mantém CTR-000049; cancela duplicata e remove parcelas/beneficiários vinculados.

UPDATE assinaturas
SET status = 'cancelado',
    data_cancelamento = CURRENT_DATE,
    motivo_cancelamento = 'Contrato duplicado — mantido CTR-000049 (correção automática)'
WHERE id = '9a55489a-6817-4a79-8d4e-496f1c8bafbc'
  AND cliente_id = 'b1ae4329-a6dd-4721-b8cd-60fea4d1b519'
  AND codigo = 'CTR-000050';

UPDATE fin_contas_receber
SET deleted_at = now(),
    status = 'cancelado',
    observacoes = COALESCE(observacoes, '') || ' [Excluída: contrato duplicado CTR-000050]'
WHERE assinatura_id = '9a55489a-6817-4a79-8d4e-496f1c8bafbc'
  AND deleted_at IS NULL
  AND COALESCE(valor_pago_centavos, 0) = 0;

UPDATE beneficiarios
SET deleted_at = now()
WHERE assinatura_id = '9a55489a-6817-4a79-8d4e-496f1c8bafbc'
  AND deleted_at IS NULL;

UPDATE propostas_venda
SET assinatura_id = '38436149-56ce-488d-be70-fd1333748fe2'
WHERE id = '317f3885-e00f-4016-8798-fe58c563ac3a'
  AND cliente_id = 'b1ae4329-a6dd-4721-b8cd-60fea4d1b519';

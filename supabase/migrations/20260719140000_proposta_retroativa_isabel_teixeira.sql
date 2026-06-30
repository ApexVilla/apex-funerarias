-- Proposta retroativa: Isabel Teixeira de Campos (CTR-000027)
-- Transferência de outra funerária; necessário para comissão do vendedor Augusto.

INSERT INTO public.propostas_venda (
  empresa_id,
  plano_id,
  status,
  cobranca_confirmada,
  vendedor_id,
  contribuinte_nome,
  contribuinte_documento,
  contribuinte_data_nascimento,
  contribuinte_estado_civil,
  contribuinte_profissao,
  endereco_residencia,
  endereco_logradouro,
  endereco_numero,
  endereco_bairro,
  endereco_cep,
  endereco_cidade,
  endereco_uf,
  telefone_principal,
  primeiro_vencimento,
  primeira_parcela_paga_no_ato,
  metodo_cobranca,
  data_pedido,
  parcelas_recebidas_quantidade,
  parcelas_recebidas_total_centavos,
  dependentes_inclusos,
  cliente_id,
  assinatura_id,
  contrato_migracao,
  data_inicio_contrato,
  migracao_cobrar_apenas_fenix,
  contrato_gerado_em,
  cobrador_endereco_mesmo_residencial,
  cobrador_endereco_logradouro,
  cobrador_endereco_numero,
  cobrador_endereco_bairro,
  cobrador_endereco_cep,
  cobrador_endereco_cidade,
  cobrador_endereco_uf,
  observacoes,
  created_at,
  updated_at
)
SELECT
  c.empresa_id,
  a.plano_id,
  'contrato_gerado',
  true,
  c.vendedor_id,
  trim(c.nome),
  c.cpf,
  c.data_nascimento,
  c.estado_civil,
  c.profissao,
  concat_ws(
    ' — ',
    concat_ws(', ', c.endereco_logradouro, c.endereco_numero),
    concat('Bairro ', c.endereco_bairro, ' · ', c.endereco_complemento),
    concat(c.endereco_cidade, '/', c.endereco_estado),
    concat('CEP ', c.endereco_cep)
  ),
  c.endereco_logradouro,
  c.endereco_numero,
  c.endereco_bairro,
  replace(c.endereco_cep, '-', ''),
  c.endereco_cidade,
  c.endereco_estado,
  c.telefone_principal,
  a.data_primeiro_vencimento,
  true,
  coalesce(nullif(trim(a.forma_pagamento), ''), 'pix'),
  c.created_at::date,
  1,
  a.valor_mensal_centavos,
  0,
  c.id,
  a.id,
  true,
  a.data_contratacao,
  true,
  a.created_at,
  c.usa_endereco_residencial_cobranca,
  c.endereco_cob_logradouro,
  c.endereco_cob_numero,
  c.endereco_cob_bairro,
  replace(c.endereco_cob_cep, '-', ''),
  c.endereco_cob_cidade,
  c.endereco_cob_uf,
  'Proposta retroativa — transferência de outra funerária (CTR-000027) para vínculo de comissão de vendedor.',
  c.created_at,
  (
    SELECT coalesce(max(b.created_at), a.created_at)
    FROM public.fin_contas_receber cr
    JOIN public.fin_contas_receber_baixas b ON b.conta_receber_id = cr.id
    WHERE cr.assinatura_id = a.id
      AND cr.parcela_numero = 1
      AND cr.tipo_documento = 'mensalidade'
      AND cr.deleted_at IS NULL
      AND coalesce(b.estornada, false) = false
  )
FROM public.clientes c
JOIN public.assinaturas a
  ON a.cliente_id = c.id
 AND a.deleted_at IS NULL
 AND a.codigo = 'CTR-000027'
WHERE c.id = '4743e301-777f-4411-b8c3-45bcc85c7572'
  AND NOT EXISTS (
    SELECT 1
    FROM public.propostas_venda pv
    WHERE pv.cliente_id = c.id
       OR pv.assinatura_id = a.id
  );

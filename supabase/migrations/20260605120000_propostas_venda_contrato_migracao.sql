-- Transferência de outra funerária na proposta de venda

ALTER TABLE public.propostas_venda
  ADD COLUMN IF NOT EXISTS contrato_migracao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_inicio_contrato date,
  ADD COLUMN IF NOT EXISTS data_ultima_mensalidade_paga date,
  ADD COLUMN IF NOT EXISTS data_registro_ultimo_pagamento date,
  ADD COLUMN IF NOT EXISTS migracao_cobrar_apenas_fenix boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.propostas_venda.contrato_migracao IS
  'Cliente transferido de outra funerária; preserva tempo de contrato histórico.';
COMMENT ON COLUMN public.propostas_venda.data_inicio_contrato IS
  'Data de início do plano na funerária de origem (pode ser anos atrás).';
COMMENT ON COLUMN public.propostas_venda.migracao_cobrar_apenas_fenix IS
  'Quando true, não gera parcelas retroativas; cobrança só a partir do 1º vencimento na Fênix.';

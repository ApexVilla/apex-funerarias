-- Inclui status em_pos_venda no fluxo (entre liberada e contrato gerado).

ALTER TABLE public.propostas_venda
  DROP CONSTRAINT IF EXISTS propostas_venda_status_check;

ALTER TABLE public.propostas_venda
  ADD CONSTRAINT propostas_venda_status_check
  CHECK (status IN (
    'rascunho',
    'aguardando_contrato',
    'em_pos_venda',
    'contrato_gerado',
    'cancelado',
    'rejeitada'
  ));

COMMENT ON COLUMN public.propostas_venda.status IS
  'rascunho = vendedor; aguardando_contrato = fila; em_pos_venda = análise assumida; contrato_gerado = cliente+assinatura';

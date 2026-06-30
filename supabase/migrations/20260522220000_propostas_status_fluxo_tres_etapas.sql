-- Fluxo em 3 etapas: rascunho → aguardando_contrato → contrato_gerado

ALTER TABLE public.propostas_venda
  DROP CONSTRAINT IF EXISTS propostas_venda_status_check;

UPDATE public.propostas_venda
SET status = 'aguardando_contrato'
WHERE status = 'pendente_geracao_contrato';

UPDATE public.propostas_venda
SET status = 'contrato_gerado'
WHERE status = 'convertido';

ALTER TABLE public.propostas_venda
  ADD CONSTRAINT propostas_venda_status_check
  CHECK (status IN (
    'rascunho',
    'aguardando_contrato',
    'contrato_gerado',
    'cancelado',
    'rejeitada'
  ));

ALTER TABLE public.propostas_venda
  ALTER COLUMN status SET DEFAULT 'aguardando_contrato';

ALTER TABLE public.propostas_venda
  ADD COLUMN IF NOT EXISTS liberada_em timestamptz,
  ADD COLUMN IF NOT EXISTS contrato_gerado_em timestamptz;

UPDATE public.propostas_venda
SET liberada_em = COALESCE(liberada_em, updated_at)
WHERE status = 'aguardando_contrato' AND liberada_em IS NULL;

UPDATE public.propostas_venda
SET contrato_gerado_em = COALESCE(contrato_gerado_em, updated_at)
WHERE status = 'contrato_gerado' AND contrato_gerado_em IS NULL;

COMMENT ON COLUMN public.propostas_venda.status IS
  'rascunho = vendedor em preenchimento; aguardando_contrato = liberada para gerar contrato; contrato_gerado = cliente+assinatura criados';
COMMENT ON COLUMN public.propostas_venda.liberada_em IS
  'Quando o vendedor finalizou e enviou para a fila de contrato';
COMMENT ON COLUMN public.propostas_venda.contrato_gerado_em IS
  'Quando o contrato (assinatura) foi gerado no sistema';

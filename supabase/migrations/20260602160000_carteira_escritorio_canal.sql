-- Carteira de escritório: clientes que pagam na unidade (canal separado da carteira do cobrador).

ALTER TABLE public.cob_cobrancas_pendentes
  ADD COLUMN IF NOT EXISTS canal_cobranca text NOT NULL DEFAULT 'cobrador';

ALTER TABLE public.cob_cobrancas_pendentes
  DROP CONSTRAINT IF EXISTS cob_cobrancas_pendentes_canal_cobranca_check;

ALTER TABLE public.cob_cobrancas_pendentes
  ADD CONSTRAINT cob_cobrancas_pendentes_canal_cobranca_check
  CHECK (canal_cobranca IN ('cobrador', 'escritorio'));

COMMENT ON COLUMN public.cob_cobrancas_pendentes.canal_cobranca IS
  'cobrador = carteira do cobrador (cobrador_id); escritorio = pagamento direto na unidade (sem cobrador).';

-- Forma de pagamento "escritorio" em contratos
ALTER TABLE public.assinaturas
  DROP CONSTRAINT IF EXISTS assinaturas_forma_pagamento_check;

ALTER TABLE public.assinaturas
  ADD CONSTRAINT assinaturas_forma_pagamento_check
  CHECK (
    (forma_pagamento)::text = ANY (
      ARRAY[
        'cartao_credito',
        'debito_auto',
        'boleto',
        'pix',
        'dinheiro',
        'transferencia',
        'cobrador',
        'escritorio'
      ]::text[]
    )
  );

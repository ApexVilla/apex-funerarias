-- Permite forma de pagamento "cobrador" em contratos (já usada no ClienteForm).

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
        'cobrador'
      ]::text[]
    )
  );

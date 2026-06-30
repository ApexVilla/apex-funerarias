-- Caixas pessoais Sarah / Paula e acesso ao caixa geral + conta bancária Catalão.

-- Sarah: só ela no caixa dela
UPDATE public.fin_contas_bancarias
SET
  autorizados_visualizacao = ARRAY['b90067c7-1dd9-4ab1-bc6d-5477252b78b1']::uuid[],
  autorizados_operacao = ARRAY['b90067c7-1dd9-4ab1-bc6d-5477252b78b1']::uuid[],
  updated_at = now()
WHERE id = '1a4126c0-c53d-4abe-852c-5638165e5e42'
  AND lower(trim(nome)) = 'caixa sarah';

-- Paula: só ela no caixa dela
UPDATE public.fin_contas_bancarias
SET
  autorizados_visualizacao = ARRAY['349534f4-17b6-469b-83a8-079e11908439']::uuid[],
  autorizados_operacao = ARRAY['349534f4-17b6-469b-83a8-079e11908439']::uuid[],
  updated_at = now()
WHERE id = '17f5e3d4-6514-469a-994e-dbfe3d86983d'
  AND lower(trim(nome)) = 'caixa paula';

-- Conta bancária (corrente) Catalão: incluir Sarah e Paula
UPDATE public.fin_contas_bancarias
SET
  autorizados_visualizacao = (
    SELECT COALESCE(array_agg(DISTINCT u), '{}'::uuid[])
    FROM unnest(
      COALESCE(autorizados_visualizacao, '{}'::uuid[])
        || ARRAY[
          '349534f4-17b6-469b-83a8-079e11908439'::uuid,
          'b90067c7-1dd9-4ab1-bc6d-5477252b78b1'::uuid
        ]
    ) AS u
  ),
  autorizados_operacao = (
    SELECT COALESCE(array_agg(DISTINCT u), '{}'::uuid[])
    FROM unnest(
      COALESCE(autorizados_operacao, '{}'::uuid[])
        || ARRAY[
          '349534f4-17b6-469b-83a8-079e11908439'::uuid,
          'b90067c7-1dd9-4ab1-bc6d-5477252b78b1'::uuid
        ]
    ) AS u
  ),
  updated_at = now()
WHERE id = '7d6909f7-fbc8-4843-9d78-743d5c6f594d';

-- Retirar Sarah e Paula dos caixas de cobradores (não são caixa deles)
UPDATE public.fin_contas_bancarias
SET
  autorizados_visualizacao = array_remove(
    array_remove(COALESCE(autorizados_visualizacao, '{}'::uuid[]), 'b90067c7-1dd9-4ab1-bc6d-5477252b78b1'::uuid),
    '349534f4-17b6-469b-83a8-079e11908439'::uuid
  ),
  autorizados_operacao = array_remove(
    array_remove(COALESCE(autorizados_operacao, '{}'::uuid[]), 'b90067c7-1dd9-4ab1-bc6d-5477252b78b1'::uuid),
    '349534f4-17b6-469b-83a8-079e11908439'::uuid
  ),
  updated_at = now()
WHERE lower(nome) LIKE '%cobrador%'
   OR id IN (
     '33c2a88a-3bc4-481c-981d-dbea1bd1f5c7',
     'bbc3a8b2-8147-4480-9fee-83ac43826ece',
     '3cf95357-f7e6-4f73-8d63-b02a5db52f40',
     'e3a66e28-8d0b-4ca9-89e3-7b173b85a2d9'
   );

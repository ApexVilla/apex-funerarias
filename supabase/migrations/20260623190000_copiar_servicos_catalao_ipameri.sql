-- Copia catálogo de serviços funerários: Fenix Catalão → Fenix Ipameri.
INSERT INTO public.ser_servicos (
  id,
  nome,
  descricao,
  preco_base_centavos,
  categoria,
  ativo,
  empresa_id,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  src.nome,
  src.descricao,
  src.preco_base_centavos,
  src.categoria,
  src.ativo,
  'a1c5a3c4-39d9-4191-ad5c-244d827eb52e'::uuid,
  now(),
  now()
FROM public.ser_servicos src
WHERE src.empresa_id = 'a3c5a058-f8c5-40e8-a55f-0fefe866848d'
  AND NOT EXISTS (
    SELECT 1
    FROM public.ser_servicos dst
    WHERE dst.empresa_id = 'a1c5a3c4-39d9-4191-ad5c-244d827eb52e'
      AND lower(trim(dst.nome)) = lower(trim(src.nome))
  );

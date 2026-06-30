-- Impede quilometragem negativa: km_retorno deve ser >= km_saida quando informado.

UPDATE public.frota_viagens
SET km_retorno = km_saida
WHERE km_retorno IS NOT NULL AND km_saida IS NOT NULL AND km_retorno < km_saida;

ALTER TABLE public.frota_viagens
  DROP CONSTRAINT IF EXISTS frota_viagens_km_retorno_gte_saida;

ALTER TABLE public.frota_viagens
  ADD CONSTRAINT frota_viagens_km_retorno_gte_saida
  CHECK (km_retorno IS NULL OR km_saida IS NULL OR km_retorno >= km_saida);

COMMENT ON CONSTRAINT frota_viagens_km_retorno_gte_saida ON public.frota_viagens IS
  'Hodômetro de chegada não pode ser menor que o de saída.';

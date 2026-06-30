-- Carência de dependentes (ex.: 90 dias a partir da inclusão no contrato)
ALTER TABLE public.beneficiarios
  ADD COLUMN IF NOT EXISTS data_inclusao date,
  ADD COLUMN IF NOT EXISTS carencia_ativa boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_fim_carencia date;

COMMENT ON COLUMN public.beneficiarios.data_inclusao IS
  'Data de inclusão do dependente no contrato; início da contagem da carência.';
COMMENT ON COLUMN public.beneficiarios.carencia_ativa IS
  'Indica se o dependente ainda está no período de carência do plano.';
COMMENT ON COLUMN public.beneficiarios.data_fim_carencia IS
  'Último dia da carência (inclusão + dias do plano).';

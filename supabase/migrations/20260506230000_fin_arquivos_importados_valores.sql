-- Totais por arquivo de retorno (OFX/CNAB) para exibição na grade principal
ALTER TABLE public.fin_arquivos_importados
  ADD COLUMN IF NOT EXISTS valor_total_retorno_centavos bigint NOT NULL DEFAULT 0 CHECK (valor_total_retorno_centavos >= 0),
  ADD COLUMN IF NOT EXISTS valor_liquidado_centavos bigint NOT NULL DEFAULT 0 CHECK (valor_liquidado_centavos >= 0);

COMMENT ON COLUMN public.fin_arquivos_importados.valor_total_retorno_centavos IS 'Soma dos valores de crédito importados no extrato deste arquivo.';
COMMENT ON COLUMN public.fin_arquivos_importados.valor_liquidado_centavos IS 'Valor efetivamente aplicado em baixas de contas a receber neste processamento.';

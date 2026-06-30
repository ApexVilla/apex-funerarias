-- Escalabilidade (Fase 4.1)
-- Indices compostos para os filtros mais quentes (multi-tenant + status + datas),
-- alinhados ao dashboard executivo, listagens de titulos e carteira de cobranca.
-- Em producao foram criados com CREATE INDEX CONCURRENTLY (sem lock de escrita);
-- aqui ficam idempotentes e transacao-safe para demais ambientes.

CREATE INDEX IF NOT EXISTS idx_fin_cr_empresa_status_venc
  ON public.fin_contas_receber (empresa_id, status, data_vencimento)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_cr_empresa_pagamento
  ON public.fin_contas_receber (empresa_id, data_pagamento)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cob_pendentes_empresa_status
  ON public.cob_cobrancas_pendentes (empresa_id, status);

-- Listagem de atendimentos por tenant ordenada por data (clientes ja possui
-- cobertura ampla, inclusive trigram em nome_busca, por isso nao recebe novos indices).
CREATE INDEX IF NOT EXISTS idx_ser_atend_empresa_data
  ON public.ser_atendimentos (empresa_id, data_servico DESC);

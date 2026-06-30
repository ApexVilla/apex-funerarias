-- Impede pagamento duplicado de comissão no mesmo período/colaborador (além do UNIQUE por atendimento_id nos itens)

CREATE UNIQUE INDEX IF NOT EXISTS idx_comissao_op_pag_unico_periodo
    ON public.comissao_operacional_pagamento (empresa_id, colaborador_id, periodo_inicio, periodo_fim);

COMMENT ON INDEX public.idx_comissao_op_pag_unico_periodo IS
    'Uma comissão operacional por colaborador e período — evita pagamento em duplicidade';

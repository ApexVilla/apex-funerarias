-- Pagamento de comissão operacional (atendente / agente funerário) com recibo e itens por OS

CREATE TABLE IF NOT EXISTS public.comissao_operacional_pagamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    colaborador_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    cargo TEXT NOT NULL CHECK (cargo IN ('atendente', 'agente_funerario')),
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    numero_recibo TEXT NOT NULL,
    total_os INTEGER NOT NULL DEFAULT 0,
    faturamento_centavos INTEGER NOT NULL DEFAULT 0,
    valor_comissao_centavos INTEGER NOT NULL DEFAULT 0,
    observacoes TEXT,
    pago_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    pago_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    pago_por_nome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero_recibo)
);

CREATE INDEX IF NOT EXISTS idx_comissao_op_pag_colaborador
    ON public.comissao_operacional_pagamento(colaborador_id, periodo_inicio, periodo_fim);

CREATE TABLE IF NOT EXISTS public.comissao_operacional_pagamento_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pagamento_id UUID NOT NULL REFERENCES public.comissao_operacional_pagamento(id) ON DELETE CASCADE,
    atendimento_id UUID NOT NULL REFERENCES public.ser_atendimentos(id) ON DELETE RESTRICT,
    codigo_os TEXT NOT NULL,
    data_servico DATE,
    cliente_nome TEXT,
    valor_os_centavos INTEGER NOT NULL DEFAULT 0,
    valor_comissao_centavos INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (atendimento_id)
);

CREATE INDEX IF NOT EXISTS idx_comissao_op_pag_item_pagamento
    ON public.comissao_operacional_pagamento_item(pagamento_id);

COMMENT ON TABLE public.comissao_operacional_pagamento IS 'Registro de pagamento de comissão a atendentes/agentes funerários por período';
COMMENT ON TABLE public.comissao_operacional_pagamento_item IS 'OS incluídas em cada pagamento de comissão operacional (uma OS só pode ser paga uma vez)';

ALTER TABLE public.comissao_operacional_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_operacional_pagamento_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_comissao_op_pag ON public.comissao_operacional_pagamento;
CREATE POLICY select_comissao_op_pag ON public.comissao_operacional_pagamento
FOR SELECT TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS insert_comissao_op_pag ON public.comissao_operacional_pagamento;
CREATE POLICY insert_comissao_op_pag ON public.comissao_operacional_pagamento
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
);

DROP POLICY IF EXISTS select_comissao_op_pag_item ON public.comissao_operacional_pagamento_item;
CREATE POLICY select_comissao_op_pag_item ON public.comissao_operacional_pagamento_item
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.comissao_operacional_pagamento p
        WHERE p.id = pagamento_id
          AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
    )
);

DROP POLICY IF EXISTS insert_comissao_op_pag_item ON public.comissao_operacional_pagamento_item;
CREATE POLICY insert_comissao_op_pag_item ON public.comissao_operacional_pagamento_item
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.comissao_operacional_pagamento p
        WHERE p.id = pagamento_id
          AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
          AND public.current_user_role() IN (
              'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
              'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
          )
    )
);

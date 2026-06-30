-- Comissão de vendedor por faixas de volume + pagamento com recibo

CREATE TABLE IF NOT EXISTS public.comissao_vendedor_config (
    empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
    modo TEXT NOT NULL DEFAULT 'faixa' CHECK (modo IN ('faixa', 'percentual')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.comissao_vendedor_config IS 'Modo de cálculo da comissão comercial: faixa por volume confirmado ou percentual legado';

CREATE TABLE IF NOT EXISTS public.comissao_vendedor_faixa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    qtd_min INTEGER NOT NULL CHECK (qtd_min >= 1),
    qtd_max INTEGER CHECK (qtd_max IS NULL OR qtd_max >= qtd_min),
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, qtd_min, qtd_max)
);

CREATE INDEX IF NOT EXISTS idx_comissao_vendedor_faixa_empresa
    ON public.comissao_vendedor_faixa (empresa_id, ordem);

COMMENT ON TABLE public.comissao_vendedor_faixa IS 'Valor fixo por contrato confirmado conforme faixa de volume no período';

CREATE TABLE IF NOT EXISTS public.comissao_vendedor_pagamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    vendedor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    numero_recibo TEXT NOT NULL,
    total_contratos INTEGER NOT NULL DEFAULT 0,
    total_confirmados INTEGER NOT NULL DEFAULT 0,
    valor_comissao_centavos INTEGER NOT NULL DEFAULT 0,
    faixa_aplicada_label TEXT,
    valor_por_contrato_centavos INTEGER,
    observacoes TEXT,
    pago_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    pago_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    pago_por_nome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero_recibo),
    UNIQUE (empresa_id, vendedor_id, periodo_inicio, periodo_fim)
);

CREATE INDEX IF NOT EXISTS idx_comissao_vend_pag_vendedor
    ON public.comissao_vendedor_pagamento (vendedor_id, periodo_inicio, periodo_fim);

CREATE TABLE IF NOT EXISTS public.comissao_vendedor_pagamento_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pagamento_id UUID NOT NULL REFERENCES public.comissao_vendedor_pagamento(id) ON DELETE CASCADE,
    proposta_id UUID NOT NULL REFERENCES public.propostas_venda(id) ON DELETE RESTRICT,
    sequencial INTEGER NOT NULL DEFAULT 0,
    contribuinte_nome TEXT,
    plano_nome TEXT,
    data_confirmacao DATE,
    valor_comissao_centavos INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (proposta_id)
);

CREATE INDEX IF NOT EXISTS idx_comissao_vend_pag_item_pag
    ON public.comissao_vendedor_pagamento_item (pagamento_id);

ALTER TABLE public.comissao_vendedor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_vendedor_faixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_vendedor_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_vendedor_pagamento_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_comissao_vend_config ON public.comissao_vendedor_config;
CREATE POLICY select_comissao_vend_config ON public.comissao_vendedor_config
FOR SELECT TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS upsert_comissao_vend_config ON public.comissao_vendedor_config;
CREATE POLICY upsert_comissao_vend_config ON public.comissao_vendedor_config
FOR ALL TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
);

DROP POLICY IF EXISTS select_comissao_vend_faixa ON public.comissao_vendedor_faixa;
CREATE POLICY select_comissao_vend_faixa ON public.comissao_vendedor_faixa
FOR SELECT TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS manage_comissao_vend_faixa ON public.comissao_vendedor_faixa;
CREATE POLICY manage_comissao_vend_faixa ON public.comissao_vendedor_faixa
FOR ALL TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
);

DROP POLICY IF EXISTS select_comissao_vend_pag ON public.comissao_vendedor_pagamento;
CREATE POLICY select_comissao_vend_pag ON public.comissao_vendedor_pagamento
FOR SELECT TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS insert_comissao_vend_pag ON public.comissao_vendedor_pagamento;
CREATE POLICY insert_comissao_vend_pag ON public.comissao_vendedor_pagamento
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
);

DROP POLICY IF EXISTS select_comissao_vend_pag_item ON public.comissao_vendedor_pagamento_item;
CREATE POLICY select_comissao_vend_pag_item ON public.comissao_vendedor_pagamento_item
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.comissao_vendedor_pagamento p
        WHERE p.id = pagamento_id AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
    )
);

DROP POLICY IF EXISTS insert_comissao_vend_pag_item ON public.comissao_vendedor_pagamento_item;
CREATE POLICY insert_comissao_vend_pag_item ON public.comissao_vendedor_pagamento_item
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.comissao_vendedor_pagamento p
        WHERE p.id = pagamento_id AND public.rls_empresa_ou_do_mesmo_grupo(p.empresa_id)
        AND public.current_user_role() IN (
            'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
            'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
        )
    )
);

-- Faixas padrão para empresas que ainda não têm configuração
INSERT INTO public.comissao_vendedor_config (empresa_id, modo)
SELECT e.id, 'faixa'
FROM public.empresas e
WHERE NOT EXISTS (
    SELECT 1 FROM public.comissao_vendedor_config c WHERE c.empresa_id = e.id
);

INSERT INTO public.comissao_vendedor_faixa (empresa_id, qtd_min, qtd_max, valor_centavos, ordem)
SELECT e.id, f.qtd_min, f.qtd_max, f.valor_centavos, f.ordem
FROM public.empresas e
CROSS JOIN (
    VALUES
        (10, 20, 5300, 1),
        (21, 25, 5800, 2),
        (26, 30, 6300, 3),
        (31, NULL::integer, 10600, 4)
) AS f(qtd_min, qtd_max, valor_centavos, ordem)
WHERE NOT EXISTS (
    SELECT 1 FROM public.comissao_vendedor_faixa cf WHERE cf.empresa_id = e.id
);

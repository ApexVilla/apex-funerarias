-- Comissão operacional por serviço (modelo planilha: Roupa, Tanato, Fênix, Ônix, TP-3, etc.)

ALTER TABLE public.comissao_config_padrao
  ADD COLUMN IF NOT EXISTS modo_calculo text NOT NULL DEFAULT 'por_servico';

ALTER TABLE public.comissao_config_padrao
  DROP CONSTRAINT IF EXISTS comissao_config_padrao_modo_calculo_check;

ALTER TABLE public.comissao_config_padrao
  ADD CONSTRAINT comissao_config_padrao_modo_calculo_check
  CHECK (modo_calculo IN ('percentual_os', 'por_servico'));

COMMENT ON COLUMN public.comissao_config_padrao.modo_calculo IS
  'percentual_os = % + fixo sobre valor total da OS; por_servico = soma das comissões por item/serviço detectado na OS';

CREATE TABLE IF NOT EXISTS public.comissao_operacional_servico (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cargo text NOT NULL CHECK (cargo IN ('atendente', 'agente_funerario')),
    codigo text NOT NULL,
    nome text NOT NULL,
    descricao text,
    tipo_calculo text NOT NULL DEFAULT 'fixo' CHECK (tipo_calculo IN ('fixo', 'percentual')),
    valor_fixo_centavos integer NOT NULL DEFAULT 0,
    percentual numeric(5, 2) NOT NULL DEFAULT 0,
    palavras_chave text[] NOT NULL DEFAULT '{}',
    ordem integer NOT NULL DEFAULT 0,
    ativo boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, cargo, codigo)
);

CREATE INDEX IF NOT EXISTS idx_comissao_op_servico_empresa_cargo
    ON public.comissao_operacional_servico(empresa_id, cargo, ordem);

COMMENT ON TABLE public.comissao_operacional_servico IS
  'Tabela de comissão por tipo de serviço/preparação (atendente ou agente funerário), configurável por empresa';

ALTER TABLE public.comissao_operacional_servico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_comissao_op_servico ON public.comissao_operacional_servico;
CREATE POLICY select_comissao_op_servico ON public.comissao_operacional_servico
FOR SELECT TO authenticated
USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS insert_comissao_op_servico ON public.comissao_operacional_servico;
CREATE POLICY insert_comissao_op_servico ON public.comissao_operacional_servico
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
);

DROP POLICY IF EXISTS update_comissao_op_servico ON public.comissao_operacional_servico;
CREATE POLICY update_comissao_op_servico ON public.comissao_operacional_servico
FOR UPDATE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
)
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
);

DROP POLICY IF EXISTS delete_comissao_op_servico ON public.comissao_operacional_servico;
CREATE POLICY delete_comissao_op_servico ON public.comissao_operacional_servico
FOR DELETE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN (
        'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
        'gerente', 'supervisao', 'gestor', 'diretoria', 'rh', 'financeiro'
    )
);

-- Seed padrão (valores da planilha de controle) para empresas que ainda não têm configuração
INSERT INTO public.comissao_operacional_servico (
    empresa_id, cargo, codigo, nome, descricao, tipo_calculo,
    valor_fixo_centavos, percentual, palavras_chave, ordem
)
SELECT
    e.id,
    s.cargo,
    s.codigo,
    s.nome,
    s.descricao,
    s.tipo_calculo,
    s.valor_fixo_centavos,
    s.percentual,
    s.palavras_chave,
    s.ordem
FROM public.empresas e
CROSS JOIN (
    VALUES
    -- Atendente funerário
    ('atendente', 'roupa', 'Roupa / Vestimenta', 'Terno, roupa feminina ou vestimenta do falecido', 'fixo', 600, 0::numeric, ARRAY['terno', 'roupa', 'vestimenta', 'vestir'], 10),
    ('atendente', 'tanato', 'Tanatopraxia', 'Procedimento de tanatopraxia / embalsamamento', 'fixo', 3800, 0::numeric, ARRAY['tanato', 'tanatopraxia', 'embalsam'], 20),
    ('atendente', 'sala', 'Sala de Velório', 'Utilização de sala de velório', 'fixo', 3800, 0::numeric, ARRAY['sala de vel', 'sala vel', 'velorio', 'velório'], 30),
    ('atendente', 'tp3', 'TP-3', 'Preparação tipo 3 (formulário ou orientação técnica)', 'fixo', 3500, 0::numeric, ARRAY['tp-3', 'tp3', 'tp 3', 'tipo 3'], 40),
    ('atendente', 'tp4', 'TP-4', 'Preparação tipo 4 (formulário ou orientação técnica)', 'fixo', 1750, 0::numeric, ARRAY['tp-4', 'tp4', 'tp 4', 'tipo 4'], 50),
    ('atendente', 'particular', 'Particular', 'Percentual sobre o valor total quando OS é particular (sem plano)', 'percentual', 0, 2.00::numeric, ARRAY['particular'], 60),
    -- Agente funerário
    ('agente_funerario', 'roupa', 'Roupa / Vestimenta', 'Preparação e vestimenta do falecido', 'fixo', 1400, 0::numeric, ARRAY['terno', 'roupa', 'vestimenta', 'vestir'], 10),
    ('agente_funerario', 'fenix', 'Preparação Fênix', 'Preparação completa do plano Fênix', 'fixo', 9500, 0::numeric, ARRAY['fenix', 'fênix', 'plano fenix', 'plano fênix', 'preparacao fenix', 'preparação fênix', 'preparacao fênix'], 20),
    ('agente_funerario', 'onix', 'Preparação Ônix', 'Preparação completa do plano Ônix', 'fixo', 6500, 0::numeric, ARRAY['onix', 'ônix', 'plano onix', 'plano ônix', 'preparacao onix', 'preparação ônix'], 30),
    ('agente_funerario', 'tp3', 'TP-3', 'Preparação tipo 3', 'fixo', 3500, 0::numeric, ARRAY['tp-3', 'tp3', 'tp 3', 'tipo 3'], 40),
    ('agente_funerario', 'tp4', 'TP-4', 'Preparação tipo 4', 'fixo', 1750, 0::numeric, ARRAY['tp-4', 'tp4', 'tp 4', 'tipo 4'], 50),
    ('agente_funerario', 'particular', 'Particular', 'Percentual sobre valor total em OS particular', 'percentual', 0, 6.00::numeric, ARRAY['particular'], 60),
    ('agente_funerario', 'retirada', 'Retirada / Remoção', 'Remoção ou retirada do corpo', 'fixo', 3800, 0::numeric, ARRAY['remocao', 'remoção', 'retirada', 'busca', 'remover'], 70),
    ('agente_funerario', 'cortejo', 'Cortejo', 'Cortejo para cemitério ou cerimônia', 'fixo', 3800, 0::numeric, ARRAY['cortejo'], 80)
) AS s(cargo, codigo, nome, descricao, tipo_calculo, valor_fixo_centavos, percentual, palavras_chave, ordem)
WHERE NOT EXISTS (
    SELECT 1 FROM public.comissao_operacional_servico cos
    WHERE cos.empresa_id = e.id AND cos.cargo = s.cargo
);

-- Módulo Financeiro Completo (tabelas fin_*)

-- Contas Bancárias
CREATE TABLE IF NOT EXISTS public.fin_contas_bancarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    codigo VARCHAR(30) NOT NULL,
    nome VARCHAR(200) NOT NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'corrente',
    banco_nome VARCHAR(100),
    agencia VARCHAR(20),
    conta VARCHAR(30),
    pix_chave VARCHAR(100),
    pix_tipo VARCHAR(20),
    saldo_atual_centavos BIGINT NOT NULL DEFAULT 0,
    saldo_inicial_centavos BIGINT NOT NULL DEFAULT 0,
    cor VARCHAR(10),
    principal BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    autorizados_visualizacao UUID[] DEFAULT '{}',
    autorizados_transferencia UUID[] DEFAULT '{}',
    permite_abertura_com_outro_caixa_aberto BOOLEAN DEFAULT false,
    exclusivo_empresa BOOLEAN DEFAULT false,
    compoe_dfc_dre BOOLEAN DEFAULT true,
    permite_saldo_negativo BOOLEAN DEFAULT false,
    permite_fechar_com_saldo_em_caixa BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contas a Receber
CREATE TABLE IF NOT EXISTS public.fin_contas_receber (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    codigo VARCHAR(30) NOT NULL,
    cliente_id UUID,
    tipo_documento VARCHAR(50) DEFAULT 'outros',
    descricao TEXT,
    valor_original_centavos BIGINT NOT NULL DEFAULT 0,
    valor_juros_centavos BIGINT NOT NULL DEFAULT 0,
    valor_multa_centavos BIGINT NOT NULL DEFAULT 0,
    valor_desconto_centavos BIGINT NOT NULL DEFAULT 0,
    valor_total_centavos BIGINT NOT NULL DEFAULT 0,
    valor_pago_centavos BIGINT NOT NULL DEFAULT 0,
    valor_aberto_centavos BIGINT NOT NULL DEFAULT 0,
    data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
    data_vencimento DATE NOT NULL,
    data_competencia DATE NOT NULL DEFAULT CURRENT_DATE,
    data_pagamento DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'aberto',
    parcela_numero INTEGER NOT NULL DEFAULT 1,
    total_parcelas INTEGER NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contas a Pagar
CREATE TABLE IF NOT EXISTS public.fin_contas_pagar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    codigo VARCHAR(30) NOT NULL,
    fornecedor_id UUID,
    tipo_documento VARCHAR(50) DEFAULT 'outros',
    descricao TEXT,
    fornecedor_nome VARCHAR(200),
    plano_conta_id UUID,
    numero_nota_fiscal VARCHAR(50),
    valor_original_centavos BIGINT NOT NULL DEFAULT 0,
    valor_juros_centavos BIGINT NOT NULL DEFAULT 0,
    valor_multa_centavos BIGINT NOT NULL DEFAULT 0,
    valor_desconto_centavos BIGINT NOT NULL DEFAULT 0,
    valor_total_centavos BIGINT NOT NULL DEFAULT 0,
    valor_pago_centavos BIGINT NOT NULL DEFAULT 0,
    valor_aberto_centavos BIGINT NOT NULL DEFAULT 0,
    data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
    data_vencimento DATE NOT NULL,
    data_competencia DATE NOT NULL DEFAULT CURRENT_DATE,
    data_pagamento DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'aberto',
    requer_aprovacao BOOLEAN NOT NULL DEFAULT false,
    parcela_numero INTEGER NOT NULL DEFAULT 1,
    total_parcelas INTEGER NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Movimentações
CREATE TABLE IF NOT EXISTS public.fin_movimentacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    codigo VARCHAR(30) NOT NULL,
    conta_bancaria_id UUID REFERENCES public.fin_contas_bancarias(id),
    tipo VARCHAR(30) NOT NULL,
    descricao TEXT,
    valor_centavos BIGINT NOT NULL DEFAULT 0,
    data_movimentacao DATE NOT NULL DEFAULT CURRENT_DATE,
    data_competencia DATE NOT NULL DEFAULT CURRENT_DATE,
    conciliada BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plano de Contas
CREATE TABLE IF NOT EXISTS public.fin_plano_contas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    codigo VARCHAR(30) NOT NULL,
    nome VARCHAR(200) NOT NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'despesa',
    natureza VARCHAR(20) NOT NULL DEFAULT 'devedora',
    nivel INTEGER NOT NULL DEFAULT 1,
    pai_id UUID REFERENCES public.fin_plano_contas(id),
    aceita_lancamento BOOLEAN NOT NULL DEFAULT true,
    conta_sistema BOOLEAN NOT NULL DEFAULT false,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Centros de Custo
CREATE TABLE IF NOT EXISTS public.fin_centros_custo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    codigo VARCHAR(30) NOT NULL,
    nome VARCHAR(200) NOT NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'outros',
    pai_id UUID REFERENCES public.fin_centros_custo(id),
    responsavel_id UUID,
    orcamento_mensal_centavos BIGINT NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Formas de Pagamento
CREATE TABLE IF NOT EXISTS public.fin_formas_pagamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    codigo VARCHAR(30) NOT NULL,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'dinheiro',
    taxa_percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
    dias_recebimento INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessões de Caixa
CREATE TABLE IF NOT EXISTS public.fin_caixa_sessoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id),
    conta_bancaria_id UUID REFERENCES public.fin_contas_bancarias(id),
    usuario_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'aberto',
    saldo_abertura_centavos BIGINT NOT NULL DEFAULT 0,
    saldo_fechamento_centavos BIGINT,
    data_abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_fechamento TIMESTAMPTZ,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Movimentos de Caixa
CREATE TABLE IF NOT EXISTS public.fin_caixa_movimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_id UUID NOT NULL REFERENCES public.fin_caixa_sessoes(id),
    tipo VARCHAR(30) NOT NULL,
    descricao TEXT,
    valor_centavos BIGINT NOT NULL DEFAULT 0,
    forma_pagamento VARCHAR(50),
    usuario_id UUID,
    referencia_tipo VARCHAR(50),
    referencia_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

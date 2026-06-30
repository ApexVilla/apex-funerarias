-- ==========================================
-- Tabela: contratos_assinaturas_digitais
-- Gerencia o fluxo de assinatura digital de contratos
-- ==========================================

CREATE TABLE IF NOT EXISTS public.contratos_assinaturas_digitais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL,
    
    -- Referências ao contrato/cliente
    assinatura_id UUID NOT NULL,          -- FK para 'assinaturas' (contrato)
    cliente_id UUID NOT NULL,
    
    -- Token público (link de acesso sem login)
    token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    
    -- Dados do contrato no momento do envio (snapshot)
    contrato_numero TEXT,
    contrato_plano TEXT,
    titular_nome TEXT NOT NULL,
    titular_cpf TEXT,
    titular_telefone TEXT,
    
    -- Status do fluxo
    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'visualizado', 'assinado', 'expirado', 'cancelado')),
    
    -- Dados da assinatura quando preenchida
    assinatura_imagem_url TEXT,           -- URL no Supabase Storage
    assinado_em TIMESTAMPTZ,
    ip_assinatura INET,
    user_agent TEXT,
    dispositivo TEXT,                      -- 'mobile' | 'tablet' | 'desktop'
    
    -- Canal de envio
    canal_envio TEXT DEFAULT 'whatsapp'
        CHECK (canal_envio IN ('whatsapp', 'sms', 'email', 'presencial')),
    
    -- Quem enviou
    enviado_por UUID,
    enviado_em TIMESTAMPTZ DEFAULT now(),
    
    -- Expiração (padrão: 72h)
    expira_em TIMESTAMPTZ DEFAULT (now() + INTERVAL '72 hours'),
    
    -- Observações internas
    observacoes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_cad_token ON public.contratos_assinaturas_digitais (token);
CREATE INDEX IF NOT EXISTS idx_cad_assinatura_id ON public.contratos_assinaturas_digitais (assinatura_id);
CREATE INDEX IF NOT EXISTS idx_cad_cliente_id ON public.contratos_assinaturas_digitais (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cad_empresa_status ON public.contratos_assinaturas_digitais (empresa_id, status);

-- RLS
ALTER TABLE public.contratos_assinaturas_digitais ENABLE ROW LEVEL SECURITY;

-- SELECT: usuários autenticados do grupo veem os registros
CREATE POLICY cad_select_empresa ON public.contratos_assinaturas_digitais
    FOR SELECT TO authenticated
    USING (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    );

-- INSERT: staff autorizado
CREATE POLICY cad_insert_staff ON public.contratos_assinaturas_digitais
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    );

-- UPDATE: staff autorizado
CREATE POLICY cad_update_staff ON public.contratos_assinaturas_digitais
    FOR UPDATE TO authenticated
    USING (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    )
    WITH CHECK (
        public.is_active_user()
        AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    );

-- UPDATE especial para acesso anônimo (via token, para registrar a assinatura)
-- O cliente acessa sem login, mas só pode atualizar registros 'pendente' ou 'visualizado'
CREATE POLICY cad_update_anon_sign ON public.contratos_assinaturas_digitais
    FOR UPDATE TO anon
    USING (
        status IN ('pendente', 'visualizado')
        AND expira_em > now()
    )
    WITH CHECK (
        status IN ('pendente', 'visualizado', 'assinado')
    );

-- SELECT anônimo por token (para a página pública de assinatura)
CREATE POLICY cad_select_anon_token ON public.contratos_assinaturas_digitais
    FOR SELECT TO anon
    USING (
        status IN ('pendente', 'visualizado', 'assinado')
        AND expira_em > now()
    );

-- ==========================================
-- Bucket no Storage para as imagens de assinatura
-- ==========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'assinaturas-digitais',
    'assinaturas-digitais',
    true,
    1048576,  -- 1MB máximo
    ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage: qualquer um pode fazer upload (o cliente assina sem login)
CREATE POLICY storage_assinaturas_insert ON storage.objects
    FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'assinaturas-digitais');

CREATE POLICY storage_assinaturas_select ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'assinaturas-digitais');

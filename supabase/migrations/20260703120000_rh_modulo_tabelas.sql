-- Migração para criação do Módulo de Recursos Humanos (RH)

-- 1. Detalhes de Colaboradores (Dados Complementares)
CREATE TABLE IF NOT EXISTS public.rh_colaborador_detalhes (
    usuario_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    data_admissao DATE,
    salario_base NUMERIC(12, 2) DEFAULT 0.00,
    cpf TEXT,
    rg TEXT,
    pis TEXT,
    contato_emergencia TEXT,
    endereco TEXT,
    escolaridade TEXT,
    observacoes TEXT,
    empresa_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS em rh_colaborador_detalhes
ALTER TABLE public.rh_colaborador_detalhes ENABLE ROW LEVEL SECURITY;

-- Políticas para rh_colaborador_detalhes
DROP POLICY IF EXISTS select_rh_colaborador_detalhes ON public.rh_colaborador_detalhes;
CREATE POLICY select_rh_colaborador_detalhes ON public.rh_colaborador_detalhes
FOR SELECT TO authenticated
USING (
    usuario_id = auth.uid()
    OR (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
    )
);

DROP POLICY IF EXISTS insert_rh_colaborador_detalhes ON public.rh_colaborador_detalhes;
CREATE POLICY insert_rh_colaborador_detalhes ON public.rh_colaborador_detalhes
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

DROP POLICY IF EXISTS update_rh_colaborador_detalhes ON public.rh_colaborador_detalhes;
CREATE POLICY update_rh_colaborador_detalhes ON public.rh_colaborador_detalhes
FOR UPDATE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
)
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

DROP POLICY IF EXISTS delete_rh_colaborador_detalhes ON public.rh_colaborador_detalhes;
CREATE POLICY delete_rh_colaborador_detalhes ON public.rh_colaborador_detalhes
FOR DELETE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);


-- 2. Controle de Férias
CREATE TABLE IF NOT EXISTS public.rh_ferias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('agendada', 'gozo', 'concluida', 'cancelada')) DEFAULT 'agendada',
    observacoes TEXT,
    empresa_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS em rh_ferias
ALTER TABLE public.rh_ferias ENABLE ROW LEVEL SECURITY;

-- Políticas para rh_ferias
DROP POLICY IF EXISTS select_rh_ferias ON public.rh_ferias;
CREATE POLICY select_rh_ferias ON public.rh_ferias
FOR SELECT TO authenticated
USING (
    usuario_id = auth.uid()
    OR (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
    )
);

DROP POLICY IF EXISTS insert_rh_ferias ON public.rh_ferias;
CREATE POLICY insert_rh_ferias ON public.rh_ferias
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

DROP POLICY IF EXISTS update_rh_ferias ON public.rh_ferias;
CREATE POLICY update_rh_ferias ON public.rh_ferias
FOR UPDATE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
)
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

DROP POLICY IF EXISTS delete_rh_ferias ON public.rh_ferias;
CREATE POLICY delete_rh_ferias ON public.rh_ferias
FOR DELETE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);


-- 3. Gestão de Benefícios
CREATE TABLE IF NOT EXISTS public.rh_beneficios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('vale_refeicao', 'vale_alimentacao', 'vale_transporte', 'plano_saude', 'plano_odontologico', 'seguro_vida', 'outro')),
    valor NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ativo BOOLEAN NOT NULL DEFAULT true,
    observacoes TEXT,
    empresa_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS em rh_beneficios
ALTER TABLE public.rh_beneficios ENABLE ROW LEVEL SECURITY;

-- Políticas para rh_beneficios
DROP POLICY IF EXISTS select_rh_beneficios ON public.rh_beneficios;
CREATE POLICY select_rh_beneficios ON public.rh_beneficios
FOR SELECT TO authenticated
USING (
    usuario_id = auth.uid()
    OR (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
    )
);

DROP POLICY IF EXISTS insert_rh_beneficios ON public.rh_beneficios;
CREATE POLICY insert_rh_beneficios ON public.rh_beneficios
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

DROP POLICY IF EXISTS update_rh_beneficios ON public.rh_beneficios;
CREATE POLICY update_rh_beneficios ON public.rh_beneficios
FOR UPDATE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
)
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

DROP POLICY IF EXISTS delete_rh_beneficios ON public.rh_beneficios;
CREATE POLICY delete_rh_beneficios ON public.rh_beneficios
FOR DELETE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);


-- 4. Ocorrências e Histórico
CREATE TABLE IF NOT EXISTS public.rh_ocorrencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('advertencia', 'suspensao', 'elogio', 'promocao', 'afastamento', 'outro')),
    data DATE NOT NULL,
    descricao TEXT NOT NULL,
    criado_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
    empresa_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS em rh_ocorrencias
ALTER TABLE public.rh_ocorrencias ENABLE ROW LEVEL SECURITY;

-- Políticas para rh_ocorrencias
DROP POLICY IF EXISTS select_rh_ocorrencias ON public.rh_ocorrencias;
CREATE POLICY select_rh_ocorrencias ON public.rh_ocorrencias
FOR SELECT TO authenticated
USING (
    usuario_id = auth.uid()
    OR (
        public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
        AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
    )
);

DROP POLICY IF EXISTS insert_rh_ocorrencias ON public.rh_ocorrencias;
CREATE POLICY insert_rh_ocorrencias ON public.rh_ocorrencias
FOR INSERT TO authenticated
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

DROP POLICY IF EXISTS update_rh_ocorrencias ON public.rh_ocorrencias;
CREATE POLICY update_rh_ocorrencias ON public.rh_ocorrencias
FOR UPDATE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
)
WITH CHECK (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

DROP POLICY IF EXISTS delete_rh_ocorrencias ON public.rh_ocorrencias;
CREATE POLICY delete_rh_ocorrencias ON public.rh_ocorrencias
FOR DELETE TO authenticated
USING (
    public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor', 'diretoria', 'rh')
);

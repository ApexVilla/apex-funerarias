-- Criação da tabela de registros de ponto eletrônico
CREATE TABLE IF NOT EXISTS public.ponto_registros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL,
    user_id UUID NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('entrada', 'inicio_intervalo', 'fim_intervalo', 'saida')),
    timestamp timestamptz NOT NULL,
    observacao text,
    foto text, -- Armazena a imagem base64 capturada pela câmera
    created_at timestamptz DEFAULT now()
);

-- Habilita Row Level Security (RLS)
ALTER TABLE public.ponto_registros ENABLE ROW LEVEL SECURITY;

-- Política de Leitura: O colaborador pode ver suas próprias batidas,
-- e gestores/gerentes/diretores/admins da mesma empresa podem ver as batidas de todos.
DROP POLICY IF EXISTS select_ponto_registros ON public.ponto_registros;
CREATE POLICY select_ponto_registros ON public.ponto_registros
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR (
        empresa_id = public.current_empresa_id()
        AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor')
    )
);

-- Política de Inserção: Colaboradores autenticados podem inserir apenas seus próprios registros
DROP POLICY IF EXISTS insert_ponto_registros ON public.ponto_registros;
CREATE POLICY insert_ponto_registros ON public.ponto_registros
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
);

-- Política de Atualização/Exclusão: Apenas admins e gestores podem atualizar registros (ex. para ajustes manuais autorizados)
DROP POLICY IF EXISTS update_ponto_registros ON public.ponto_registros;
CREATE POLICY update_ponto_registros ON public.ponto_registros
FOR UPDATE
TO authenticated
USING (
    empresa_id = public.current_empresa_id()
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor')
)
WITH CHECK (
    empresa_id = public.current_empresa_id()
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema', 'super_admin', 'gerente', 'supervisao', 'gestor')
);

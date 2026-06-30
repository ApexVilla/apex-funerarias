-- Migration: Criação da tabela de créditos de clientes e RLS correspondente
-- Nome do arquivo: 20260530150000_fin_creditos_clientes.sql

CREATE TABLE IF NOT EXISTS public.fin_creditos_clientes (
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    saldo_centavos BIGINT NOT NULL DEFAULT 0 CHECK (saldo_centavos >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (empresa_id, cliente_id)
);

-- Habilita RLS (Row-Level Security) na tabela
ALTER TABLE public.fin_creditos_clientes ENABLE ROW LEVEL SECURITY;

-- Remove a policy antiga caso já exista para evitar erros de reexecução
DROP POLICY IF EXISTS fin_creditos_clientes_staff_all_grupo ON public.fin_creditos_clientes;

-- Cria policy para acesso de grupo econômico igual às demais tabelas financeiras
CREATE POLICY fin_creditos_clientes_staff_all_grupo
  ON public.fin_creditos_clientes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(empresa_id)
  );

-- Cria índices para acelerar buscas frequentes
CREATE INDEX IF NOT EXISTS idx_fin_creditos_clientes_cliente_id ON public.fin_creditos_clientes(cliente_id);

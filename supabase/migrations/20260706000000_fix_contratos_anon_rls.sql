-- =========================================================================
-- Migração: Fix RLS anônimo e Bucket Privado de Assinaturas Digitais
-- =========================================================================

-- 1. Remover a política RLS permissiva (SELECT anônimo) da tabela contratos_assinaturas_digitais
DROP POLICY IF EXISTS cad_select_anon_token ON public.contratos_assinaturas_digitais;

-- 2. Criar a RPC segura buscar_contrato_por_token (SECURITY DEFINER)
-- Isso permite o acesso anônimo controlado, retornando dados apenas pelo token válido
CREATE OR REPLACE FUNCTION public.buscar_contrato_por_token(p_token text)
RETURNS SETOF public.contratos_assinaturas_digitais
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.contratos_assinaturas_digitais
  WHERE token = p_token
    AND status IN ('pendente', 'visualizado', 'assinado')
    AND expira_em > now();
END;
$$;

-- Garantir permissão de execução para roles públicas e autenticadas
GRANT EXECUTE ON FUNCTION public.buscar_contrato_por_token(text) TO anon, authenticated;

-- 3. Hardening do Storage Bucket 'assinaturas-digitais'
-- Alterar o bucket para privado
UPDATE storage.buckets
SET public = false
WHERE id = 'assinaturas-digitais';

-- Remover a política de SELECT anônimo permissiva no bucket
DROP POLICY IF EXISTS storage_assinaturas_select ON storage.objects;

-- Criar nova política de SELECT restrita apenas a usuários autenticados (staff)
CREATE POLICY storage_assinaturas_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'assinaturas-digitais');

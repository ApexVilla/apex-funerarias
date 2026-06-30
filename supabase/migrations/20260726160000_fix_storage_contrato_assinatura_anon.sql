-- Corrige download anônimo do PDF de contrato para assinatura digital.
-- A policy storage_contratos_pendentes_select lia contratos_assinaturas_digitais
-- diretamente, mas o role anon perdeu SELECT nessa tabela (migração 20260706000000).
-- A subquery EXISTS falhava silenciosamente e o cliente via erro "{}" na tela.

CREATE OR REPLACE FUNCTION public.contrato_assinatura_pdf_token_valido(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contratos_assinaturas_digitais cad
    WHERE cad.token = p_token
      AND cad.expira_em > now()
      AND cad.status IN ('pendente', 'visualizado', 'assinado')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.contrato_assinatura_pdf_token_valido(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contrato_assinatura_pdf_token_valido(text) TO anon, authenticated;

DROP POLICY IF EXISTS storage_contratos_pendentes_select ON storage.objects;

CREATE POLICY storage_contratos_pendentes_select ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (
        bucket_id = 'assinaturas-digitais'
        AND name ~ '^contratos-pendentes/[a-f0-9]{64}\.pdf$'
        AND public.contrato_assinatura_pdf_token_valido(
            regexp_replace(name, '^contratos-pendentes/([a-f0-9]+)\.pdf$', '\1')
        )
    );

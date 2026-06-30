-- PDF do contrato anexado ao link de assinatura digital + aceite dos termos

ALTER TABLE public.contratos_assinaturas_digitais
    ADD COLUMN IF NOT EXISTS contrato_pdf_path TEXT,
    ADD COLUMN IF NOT EXISTS aceite_termos_em TIMESTAMPTZ;

COMMENT ON COLUMN public.contratos_assinaturas_digitais.contrato_pdf_path IS
    'Caminho no bucket assinaturas-digitais (ex.: contratos-pendentes/{token}.pdf)';
COMMENT ON COLUMN public.contratos_assinaturas_digitais.aceite_termos_em IS
    'Momento em que o titular declarou ter lido e aceito o contrato antes de assinar';

-- Permitir PDF no bucket de assinaturas digitais
UPDATE storage.buckets
SET
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    file_size_limit = 5242880
WHERE id = 'assinaturas-digitais';

-- Cliente anônimo pode baixar o PDF vinculado a um token válido
CREATE POLICY storage_contratos_pendentes_select ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (
        bucket_id = 'assinaturas-digitais'
        AND name ~ '^contratos-pendentes/[a-f0-9]{64}\.pdf$'
        AND EXISTS (
            SELECT 1
            FROM public.contratos_assinaturas_digitais cad
            WHERE cad.token = regexp_replace(name, '^contratos-pendentes/([a-f0-9]+)\.pdf$', '\1')
              AND cad.expira_em > now()
              AND cad.status IN ('pendente', 'visualizado', 'assinado')
        )
    );

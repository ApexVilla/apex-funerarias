-- Permite cadastrar dependentes no cliente sem contrato ativo (vinculados só por cliente_id).
ALTER TABLE public.beneficiarios
  ALTER COLUMN assinatura_id DROP NOT NULL;

COMMENT ON COLUMN public.beneficiarios.assinatura_id IS
  'Contrato ao qual o dependente está vinculado; NULL quando cadastrado apenas no cliente (sem plano).';

-- CPF único por colaborador (RH) e cobrador — impede cadastro duplicado no sistema.

CREATE UNIQUE INDEX IF NOT EXISTS rh_colaborador_detalhes_cpf_norm_uidx
  ON public.rh_colaborador_detalhes (
    lower(regexp_replace(trim(cpf), '\D', '', 'g'))
  )
  WHERE cpf IS NOT NULL
    AND length(regexp_replace(trim(cpf), '\D', '', 'g')) = 11;

CREATE UNIQUE INDEX IF NOT EXISTS cobradores_cpf_norm_uidx
  ON public.cobradores (
    empresa_id,
    lower(regexp_replace(trim(cpf), '\D', '', 'g'))
  )
  WHERE cpf IS NOT NULL
    AND trim(cpf) <> ''
    AND length(regexp_replace(trim(cpf), '\D', '', 'g')) = 11
    AND lower(coalesce(status, 'ativo')) <> 'inativo';

COMMENT ON INDEX public.rh_colaborador_detalhes_cpf_norm_uidx IS
  'Um CPF não pode estar em dois colaboradores (rh_colaborador_detalhes).';
COMMENT ON INDEX public.cobradores_cpf_norm_uidx IS
  'Um CPF não pode repetir entre cobradores ativos da mesma empresa.';

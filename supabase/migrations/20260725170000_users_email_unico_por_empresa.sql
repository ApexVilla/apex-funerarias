-- E-mail de login único por unidade (empresa).

CREATE UNIQUE INDEX IF NOT EXISTS users_empresa_email_norm_uidx
  ON public.users (
    empresa_id,
    lower(trim(email))
  )
  WHERE deleted_at IS NULL
    AND email IS NOT NULL
    AND trim(email) <> '';

COMMENT ON INDEX public.users_empresa_email_norm_uidx IS
  'Um e-mail de login não pode repetir na mesma unidade (empresa).';

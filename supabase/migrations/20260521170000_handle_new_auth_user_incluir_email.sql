-- Trigger auth.users -> public.users estava sem coluna `email`, deixando perfis com email NULL
-- (lista em Config vazia no e-mail; confusão no login). Corrige função e faz backfill a partir de auth.users.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_nome text;
  v_empresa_id uuid;
  v_role text;
  v_codigo text;
  v_email text;
BEGIN
  v_email := lower(trim(COALESCE(NEW.email, '')));
  v_nome := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'nome'), ''),
    CASE WHEN v_email <> '' THEN split_part(v_email, '@', 1) ELSE NULL END,
    'Usuário'
  );
  v_empresa_id := NULLIF(NEW.raw_user_meta_data->>'empresa_id', '')::uuid;
  v_role := public.normalize_user_role(NEW.raw_user_meta_data->>'role');
  v_codigo := 'USR-' || UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 8));

  INSERT INTO public.users (
    id,
    codigo,
    nome,
    email,
    password,
    role,
    empresa_id,
    permissoes
  )
  VALUES (
    NEW.id,
    v_codigo,
    v_nome,
    NULLIF(v_email, ''),
    'SUPABASE_AUTH',
    v_role,
    v_empresa_id,
    '{}'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
    SET nome = COALESCE(EXCLUDED.nome, public.users.nome),
        email = COALESCE(NULLIF(EXCLUDED.email, ''), public.users.email),
        role = COALESCE(NULLIF(EXCLUDED.role, ''), public.users.role),
        empresa_id = COALESCE(EXCLUDED.empresa_id, public.users.empresa_id),
        updated_at = now();

  RETURN NEW;
END;
$$;

-- Perfis já criados com email NULL
UPDATE public.users u
SET email = lower(trim(au.email)),
    updated_at = now()
FROM auth.users au
WHERE u.id = au.id
  AND au.email IS NOT NULL
  AND trim(au.email) <> ''
  AND (u.email IS NULL OR trim(u.email) = '');

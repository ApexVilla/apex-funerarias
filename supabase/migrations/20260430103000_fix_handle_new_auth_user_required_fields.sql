-- Corrige trigger de sync auth.users -> public.users
-- para preencher colunas obrigatórias do schema legado.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
  v_empresa_id uuid;
  v_role text;
  v_codigo text;
BEGIN
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1), 'Usuário');
  v_empresa_id := NULLIF(NEW.raw_user_meta_data->>'empresa_id', '')::uuid;
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'vendedor');
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
    NEW.email,
    'SUPABASE_AUTH',
    v_role,
    v_empresa_id,
    '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

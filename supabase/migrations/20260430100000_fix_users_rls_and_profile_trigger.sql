-- Garante que o perfil em public.users seja criado automaticamente
-- ao registrar um usuário novo no auth.users.

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_empresa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.empresa_id
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.role, '')
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

DROP POLICY IF EXISTS users_select_same_empresa ON public.users;
CREATE POLICY users_select_same_empresa
ON public.users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR empresa_id = public.current_empresa_id()
);

DROP POLICY IF EXISTS users_update_same_empresa_admin ON public.users;
CREATE POLICY users_update_same_empresa_admin
ON public.users
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR (
    empresa_id = public.current_empresa_id()
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema')
  )
)
WITH CHECK (
  id = auth.uid()
  OR (
    empresa_id = public.current_empresa_id()
    AND public.current_user_role() IN ('admin', 'admin_empresa', 'admin_sistema')
  )
);

DROP POLICY IF EXISTS users_insert_own_profile ON public.users;
CREATE POLICY users_insert_own_profile
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
  v_empresa_id uuid;
BEGIN
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1), 'Usuário');
  v_empresa_id := NULLIF(NEW.raw_user_meta_data->>'empresa_id', '')::uuid;

  INSERT INTO public.users (id, nome, email, role, empresa_id, permissoes)
  VALUES (
    NEW.id,
    v_nome,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor'),
    v_empresa_id,
    '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

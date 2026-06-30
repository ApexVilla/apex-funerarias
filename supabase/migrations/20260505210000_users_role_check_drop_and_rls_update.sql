-- Garante remoção do CHECK legado (6 perfis) em qualquer instalação; reforça FK ao catálogo.
-- Ajusta RLS de UPDATE para o mesmo conjunto de perfis que podem criar usuários (admin_create_user).
-- Remove a policy genérica "Only admins can manage users" (só role = 'admin'), que atrapalha e é redundante com as outras.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND c.conname = 'users_role_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_role_fkey
      FOREIGN KEY (role) REFERENCES public.user_roles (codigo);
  END IF;
END $$;

DROP POLICY IF EXISTS "Only admins can manage users" ON public.users;

DROP POLICY IF EXISTS users_update_same_empresa_admin ON public.users;
CREATE POLICY users_update_same_empresa_admin
ON public.users
FOR UPDATE
TO authenticated
USING (
  id = auth.uid()
  OR (
    empresa_id = public.current_empresa_id()
    AND lower(nullif(trim(public.current_user_role()), '')) = ANY (ARRAY[
      'admin',
      'admin_empresa',
      'admin_sistema',
      'gerente',
      'diretoria',
      'supervisao',
      'gestor',
      'super_admin'
    ]::text[])
  )
)
WITH CHECK (
  id = auth.uid()
  OR (
    empresa_id = public.current_empresa_id()
    AND lower(nullif(trim(public.current_user_role()), '')) = ANY (ARRAY[
      'admin',
      'admin_empresa',
      'admin_sistema',
      'gerente',
      'diretoria',
      'supervisao',
      'gestor',
      'super_admin'
    ]::text[])
  )
);

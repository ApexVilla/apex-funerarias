-- is_active_user() e get_user_empresa_id() liam public.users sob RLS; a política
-- "All active users can view user list" usa is_active_user() → recursão infinita (42P17).
-- Solução: plpgsql SECURITY DEFINER com SET LOCAL row_security = off (igual current_empresa_id).

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND COALESCE(u.ativo, true) = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_empresa_id()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN (SELECT u.empresa_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1);
END;
$$;

REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO anon;

REVOKE ALL ON FUNCTION public.get_user_empresa_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_empresa_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_empresa_id() TO anon;

-- Pelo menos um depósito por empresa (quando ainda não existir nenhum).
INSERT INTO public.estoque_depositos (empresa_id, nome, tipo, ativo)
SELECT e.id, 'Depósito principal', 'central', true
FROM public.empresas e
WHERE NOT EXISTS (SELECT 1 FROM public.estoque_depositos d WHERE d.empresa_id = e.id);

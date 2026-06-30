-- Bootstrap de perfil no login: lê public.users ou cria a partir de auth.users (SECURITY DEFINER).
-- Resolve casos em que o trigger não rodou, linha foi apagada, ou SELECT direto falha por RLS.

CREATE OR REPLACE FUNCTION public.fn_auth_bootstrap_perfil()
RETURNS SETOF public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    au RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()) THEN
        RETURN QUERY
        SELECT *
        FROM public.users u
        WHERE u.id = auth.uid();
        RETURN;
    END IF;

    SELECT u.id, u.email, u.raw_user_meta_data
    INTO au
    FROM auth.users u
    WHERE u.id = auth.uid();

    IF NOT FOUND THEN
        RETURN;
    END IF;

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
        au.id,
        'USR-' || UPPER(SUBSTRING(REPLACE(au.id::text, '-', '') FROM 1 FOR 8)),
        COALESCE(au.raw_user_meta_data->>'nome', split_part(au.email, '@', 1), 'Usuário'),
        lower(trim(au.email)),
        'SUPABASE_AUTH',
        public.normalize_user_role(au.raw_user_meta_data->>'role'),
        NULLIF(au.raw_user_meta_data->>'empresa_id', '')::uuid,
        '{}'::jsonb
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN QUERY
    SELECT *
    FROM public.users u
    WHERE u.id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.fn_auth_bootstrap_perfil() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_auth_bootstrap_perfil() TO authenticated;

COMMENT ON FUNCTION public.fn_auth_bootstrap_perfil() IS
    'Usado no login: devolve o perfil public.users do usuário autenticado; cria a linha a partir de auth.users se faltar.';

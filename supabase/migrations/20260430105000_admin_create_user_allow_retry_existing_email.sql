-- Permite reaproveitar e-mail já existente no Auth:
-- - atualiza senha/metadata
-- - cria perfil em public.users se estiver faltando

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_nome text,
  p_role text DEFAULT 'vendedor',
  p_empresa_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_empresa_id uuid;
  v_instance_id uuid;
  v_requester_role text;
  v_target_role text;
  v_email text;
BEGIN
  v_requester_role := public.current_user_role();
  v_target_role := COALESCE(NULLIF(trim(p_role), ''), 'vendedor');
  v_email := lower(trim(p_email));

  IF v_requester_role NOT IN ('admin', 'admin_empresa', 'admin_sistema') THEN
    RAISE EXCEPTION 'Sem permissão para criar usuário';
  END IF;

  v_empresa_id := COALESCE(p_empresa_id, public.current_empresa_id());
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não identificada';
  END IF;

  IF v_requester_role <> 'admin_sistema' AND v_empresa_id <> public.current_empresa_id() THEN
    RAISE EXCEPTION 'Sem permissão para criar usuário para outra empresa';
  END IF;

  SELECT u.id
    INTO v_uid
  FROM auth.users u
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    -- Reprocessa cadastro já existente (evita travar por "E-mail já cadastrado")
    UPDATE auth.users
       SET encrypted_password = crypt(p_password, gen_salt('bf')),
           raw_user_meta_data = jsonb_build_object(
             'nome', COALESCE(NULLIF(trim(p_nome), ''), split_part(v_email, '@', 1)),
             'empresa_id', v_empresa_id::text,
             'role', v_target_role
           ),
           updated_at = now()
     WHERE id = v_uid;

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
      v_uid,
      'USR-' || UPPER(SUBSTRING(REPLACE(v_uid::text, '-', '') FROM 1 FOR 8)),
      COALESCE(NULLIF(trim(p_nome), ''), split_part(v_email, '@', 1)),
      v_email,
      'SUPABASE_AUTH',
      v_target_role,
      v_empresa_id,
      '{}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE
      SET nome = EXCLUDED.nome,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          empresa_id = EXCLUDED.empresa_id,
          updated_at = now();

    RETURN v_uid;
  END IF;

  SELECT u.instance_id
    INTO v_instance_id
  FROM auth.users u
  LIMIT 1;

  v_uid := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_instance_id,
    v_uid,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'nome', COALESCE(NULLIF(trim(p_nome), ''), split_part(v_email, '@', 1)),
      'empresa_id', v_empresa_id::text,
      'role', v_target_role
    ),
    now(),
    now()
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    email,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_uid,
    jsonb_build_object(
      'sub', v_uid::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_email,
    v_email,
    now(),
    now()
  );

  RETURN v_uid;
END;
$$;

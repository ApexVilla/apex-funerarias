-- Corrige RPC admin_create_user para não inserir coluna gerada (confirmed_at).

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
BEGIN
  v_requester_role := public.current_user_role();

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

  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(p_email)) THEN
    RAISE EXCEPTION 'E-mail já cadastrado';
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
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'nome', COALESCE(NULLIF(trim(p_nome), ''), split_part(lower(trim(p_email)), '@', 1)),
      'empresa_id', v_empresa_id::text,
      'role', COALESCE(NULLIF(trim(p_role), ''), 'vendedor')
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
      'email', lower(trim(p_email)),
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    lower(trim(p_email)),
    lower(trim(p_email)),
    now(),
    now()
  );

  RETURN v_uid;
END;
$$;

-- Atualização do próprio perfil sem depender de RLS UPDATE em public.users.
CREATE OR REPLACE FUNCTION public.fn_atualizar_meu_perfil(
  p_nome text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_must_change_password boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_nome IS NOT NULL AND trim(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome não pode ser vazio';
  END IF;

  UPDATE public.users
  SET
    nome = COALESCE(NULLIF(trim(p_nome), ''), nome),
    telefone = CASE
      WHEN p_telefone IS NULL THEN telefone
      ELSE NULLIF(trim(p_telefone), '')
    END,
    must_change_password = COALESCE(p_must_change_password, must_change_password),
    updated_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_atualizar_meu_perfil(text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_meu_perfil(text, text, boolean) TO authenticated;

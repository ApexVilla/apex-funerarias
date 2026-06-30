-- Tabela temporária para reset de senha via trigger (evita problemas com schema cache do PostgREST)
CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id UUID NOT NULL,
  new_password TEXT NOT NULL,
  requested_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_insert_reset" ON public.password_resets;
CREATE POLICY "admin_insert_reset" ON public.password_resets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('admin', 'admin_sistema', 'admin_empresa', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "no_select" ON public.password_resets;
CREATE POLICY "no_select" ON public.password_resets FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.trg_handle_password_reset()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(NEW.new_password, gen_salt('bf'))
  WHERE id = NEW.target_user_id;

  UPDATE public.users
  SET must_change_password = true
  WHERE id = NEW.target_user_id;

  DELETE FROM public.password_resets WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_password_reset ON public.password_resets;
CREATE TRIGGER on_password_reset
  AFTER INSERT ON public.password_resets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_handle_password_reset();

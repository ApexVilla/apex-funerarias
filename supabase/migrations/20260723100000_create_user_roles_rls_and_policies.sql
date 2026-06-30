-- Migração para habilitar RLS e políticas de acesso na tabela user_roles
-- Leitura para autenticados; escrita para perfis administrativos e gestores do grupo

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_user_roles ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_authenticated ON public.user_roles;

CREATE POLICY select_user_roles ON public.user_roles
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS manage_user_roles ON public.user_roles;
CREATE POLICY manage_user_roles ON public.user_roles
FOR ALL TO authenticated
USING (
  public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'diretoria', 'supervisao', 'gestor', 'administrador_geral'
  )
)
WITH CHECK (
  public.current_user_role() IN (
    'admin', 'admin_empresa', 'admin_sistema', 'super_admin',
    'gerente', 'diretoria', 'supervisao', 'gestor', 'administrador_geral'
  )
);

NOTIFY pgrst, 'reload schema';

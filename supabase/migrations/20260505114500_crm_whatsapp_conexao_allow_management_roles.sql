drop policy if exists crm_whatsapp_conexoes_insert on public.crm_whatsapp_conexoes;
create policy crm_whatsapp_conexoes_insert on public.crm_whatsapp_conexoes
for insert
with check (
  empresa_id = public.current_empresa_id()
  and public.current_user_role() in (
    'admin', 'admin_empresa', 'admin_sistema',
    'gerente', 'diretoria', 'supervisao', 'gestor', 'super_admin'
  )
);

drop policy if exists crm_whatsapp_conexoes_update on public.crm_whatsapp_conexoes;
create policy crm_whatsapp_conexoes_update on public.crm_whatsapp_conexoes
for update
using (
  empresa_id = public.current_empresa_id()
  and public.current_user_role() in (
    'admin', 'admin_empresa', 'admin_sistema',
    'gerente', 'diretoria', 'supervisao', 'gestor', 'super_admin'
  )
)
with check (
  empresa_id = public.current_empresa_id()
  and public.current_user_role() in (
    'admin', 'admin_empresa', 'admin_sistema',
    'gerente', 'diretoria', 'supervisao', 'gestor', 'super_admin'
  )
);

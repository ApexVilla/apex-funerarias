-- Alinhar RLS de cobradores ao multitenant por grupo econômico
-- Evita que usuários restritos (ex.: Catalão) fiquem impedidos de carregar cobradores registrados sob a Matriz (Aparecida).

drop policy if exists "cobradores_empresa_select" on public.cobradores;
create policy "cobradores_empresa_select" on public.cobradores
  for select using (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

drop policy if exists "cobradores_empresa_insert" on public.cobradores;
create policy "cobradores_empresa_insert" on public.cobradores
  for insert with check (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

drop policy if exists "cobradores_empresa_update" on public.cobradores;
create policy "cobradores_empresa_update" on public.cobradores
  for update using (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  with check (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

drop policy if exists "cobradores_empresa_delete" on public.cobradores;
create policy "cobradores_empresa_delete" on public.cobradores
  for delete using (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

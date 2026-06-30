-- Propostas: vendedor vê só as próprias; cargos altos veem todas da empresa

drop policy if exists propostas_venda_select on public.propostas_venda;
create policy propostas_venda_select on public.propostas_venda
for select
using (
  empresa_id = public.current_empresa_id()
  and (
    lower(coalesce(public.current_user_role(), '')) = any (
      array[
        'admin',
        'admin_empresa',
        'admin_sistema',
        'super_admin',
        'gerente',
        'gestor',
        'supervisao',
        'diretoria'
      ]
    )
    or vendedor_id = auth.uid()
  )
);

drop policy if exists propostas_venda_insert on public.propostas_venda;
create policy propostas_venda_insert on public.propostas_venda
for insert
with check (
  empresa_id = public.current_empresa_id()
  and (
    lower(coalesce(public.current_user_role(), '')) = any (
      array[
        'admin',
        'admin_empresa',
        'admin_sistema',
        'super_admin',
        'gerente',
        'gestor',
        'supervisao',
        'diretoria'
      ]
    )
    or vendedor_id = auth.uid()
  )
);

drop policy if exists propostas_venda_update on public.propostas_venda;
create policy propostas_venda_update on public.propostas_venda
for update
using (
  empresa_id = public.current_empresa_id()
  and (
    lower(coalesce(public.current_user_role(), '')) = any (
      array[
        'admin',
        'admin_empresa',
        'admin_sistema',
        'super_admin',
        'gerente',
        'gestor',
        'supervisao',
        'diretoria'
      ]
    )
    or vendedor_id = auth.uid()
  )
)
with check (
  empresa_id = public.current_empresa_id()
  and (
    lower(coalesce(public.current_user_role(), '')) = any (
      array[
        'admin',
        'admin_empresa',
        'admin_sistema',
        'super_admin',
        'gerente',
        'gestor',
        'supervisao',
        'diretoria'
      ]
    )
    or vendedor_id = auth.uid()
  )
);

drop policy if exists propostas_venda_delete on public.propostas_venda;
create policy propostas_venda_delete on public.propostas_venda
for delete
using (
  empresa_id = public.current_empresa_id()
  and (
    lower(coalesce(public.current_user_role(), '')) = any (
      array[
        'admin',
        'admin_empresa',
        'admin_sistema',
        'super_admin',
        'gerente',
        'gestor',
        'supervisao',
        'diretoria'
      ]
    )
    or vendedor_id = auth.uid()
  )
);

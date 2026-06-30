-- Tabela dedicada de cobradores
create table if not exists public.cobradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  cpf text,
  telefone text,
  email text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'ferias', 'afastado')),
  area_atuacao text,
  comissao_percentual numeric(5,2) not null default 5,
  comissao_por_metodo jsonb not null default '{"dinheiro":5,"pix":5,"cartao":5,"boleto":5,"transferencia":5}'::jsonb,
  data_admissao date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cobradores_empresa on public.cobradores(empresa_id);
create index if not exists idx_cobradores_status on public.cobradores(status);

alter table public.cobradores enable row level security;

drop policy if exists "cobradores_empresa_select" on public.cobradores;
create policy "cobradores_empresa_select" on public.cobradores
  for select using (empresa_id = public.current_empresa_id());

drop policy if exists "cobradores_empresa_insert" on public.cobradores;
create policy "cobradores_empresa_insert" on public.cobradores
  for insert with check (empresa_id = public.current_empresa_id());

drop policy if exists "cobradores_empresa_update" on public.cobradores;
create policy "cobradores_empresa_update" on public.cobradores
  for update using (empresa_id = public.current_empresa_id());

drop policy if exists "cobradores_empresa_delete" on public.cobradores;
create policy "cobradores_empresa_delete" on public.cobradores
  for delete using (empresa_id = public.current_empresa_id());

-- Propostas de venda (orçamento / inscrição digital) — fila para geração de contrato

create table if not exists public.propostas_venda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  sequencial integer not null default 0,
  status text not null default 'pendente_geracao_contrato'
    check (status in ('rascunho', 'pendente_geracao_contrato', 'convertido', 'cancelado')),
  plano_id uuid references public.planos(id) on delete set null,
  vendedor_id uuid references public.users(id) on delete set null,

  whatsapp_unidade text,

  contribuinte_nome text not null,
  contribuinte_documento text not null,
  contribuinte_rg text,
  contribuinte_data_nascimento date,
  contribuinte_estado_civil text,
  contribuinte_naturalidade_uf text,
  contribuinte_naturalidade_cidade text,
  contribuinte_profissao text,
  contribuinte_religiao text,

  endereco_residencia text,
  endereco_cep text,
  endereco_cidade text,
  endereco_uf text,
  telefone_principal text,
  telefone_alternativo text,
  email text,

  taxa_adesao_padrao_centavos integer,
  taxa_adesao_recebida_centavos integer,
  taxa_adesao_min_centavos integer,
  taxa_adesao_max_centavos integer,

  primeiro_vencimento date not null,
  primeira_parcela_paga_no_ato boolean not null default false,
  metodo_cobranca text not null default 'boleto',
  data_pedido date not null default ((timezone('America/Sao_Paulo', now())))::date,

  dependentes_inclusos integer not null default 0,
  observacoes text,

  cliente_id uuid,
  assinatura_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (empresa_id, sequencial)
);

create index if not exists idx_propostas_venda_empresa_created
  on public.propostas_venda (empresa_id, created_at desc);
create index if not exists idx_propostas_venda_vendedor
  on public.propostas_venda (vendedor_id);
create index if not exists idx_propostas_venda_status
  on public.propostas_venda (empresa_id, status);

create or replace function public.propostas_venda_bump_sequencial()
returns trigger
language plpgsql
as $$
begin
  if new.sequencial is null or new.sequencial = 0 then
    select coalesce(max(sequencial), 0) + 1
      into new.sequencial
    from public.propostas_venda
    where empresa_id = new.empresa_id;
  end if;
  return new;
end;
$$;

create or replace function public.propostas_venda_set_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_propostas_venda_sequencial on public.propostas_venda;
create trigger trg_propostas_venda_sequencial
  before insert on public.propostas_venda
  for each row execute function public.propostas_venda_bump_sequencial();

drop trigger if exists trg_propostas_venda_updated on public.propostas_venda;
create trigger trg_propostas_venda_updated
  before update on public.propostas_venda
  for each row execute function public.propostas_venda_set_updated();

alter table public.propostas_venda enable row level security;

drop policy if exists propostas_venda_select on public.propostas_venda;
create policy propostas_venda_select on public.propostas_venda
for select
using (empresa_id = public.current_empresa_id());

drop policy if exists propostas_venda_insert on public.propostas_venda;
create policy propostas_venda_insert on public.propostas_venda
for insert
with check (empresa_id = public.current_empresa_id());

drop policy if exists propostas_venda_update on public.propostas_venda;
create policy propostas_venda_update on public.propostas_venda
for update
using (empresa_id = public.current_empresa_id())
with check (empresa_id = public.current_empresa_id());

drop policy if exists propostas_venda_delete on public.propostas_venda;
create policy propostas_venda_delete on public.propostas_venda
for delete
using (empresa_id = public.current_empresa_id());

grant select, insert, update, delete on public.propostas_venda to authenticated;

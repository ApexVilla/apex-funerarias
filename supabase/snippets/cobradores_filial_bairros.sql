-- Rode no SQL Editor do Supabase se faltar filial_id ou bairros_atuacao em public.cobradores.
-- Seguro repetir (IF NOT EXISTS).

alter table public.cobradores
    add column if not exists filial_id uuid references public.filiais (id) on delete set null;

comment on column public.cobradores.filial_id is 'Filial/unidade à qual o cobrador pertence (origem operacional).';

create index if not exists idx_cobradores_filial_id on public.cobradores (filial_id);

alter table public.cobradores
    add column if not exists bairros_atuacao jsonb not null default '[]'::jsonb;

comment on column public.cobradores.bairros_atuacao is 'Lista JSON de nomes de bairros na rota deste cobrador.';

-- Garantia extra para ambientes onde a migration anterior não foi aplicada
-- Evita erro de schema cache ausente para dependentes_detalhes/parcela recebida

alter table public.propostas_venda
  add column if not exists parcelas_recebidas_quantidade integer not null default 0,
  add column if not exists parcelas_recebidas_total_centavos integer not null default 0,
  add column if not exists dependentes_detalhes jsonb not null default '[]'::jsonb;

alter table public.propostas_venda
  drop constraint if exists propostas_venda_parcelas_recebidas_quantidade_check;

alter table public.propostas_venda
  add constraint propostas_venda_parcelas_recebidas_quantidade_check
  check (parcelas_recebidas_quantidade >= 0);

alter table public.propostas_venda
  drop constraint if exists propostas_venda_parcelas_recebidas_total_centavos_check;

alter table public.propostas_venda
  add constraint propostas_venda_parcelas_recebidas_total_centavos_check
  check (parcelas_recebidas_total_centavos >= 0);

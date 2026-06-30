-- Fechamento financeiro de atendimento:
-- - representante_nome / representante_contato
-- - pagamentos_divididos (jsonb com múltiplas formas)

alter table public.ser_atendimentos
  add column if not exists representante_nome text,
  add column if not exists representante_contato text,
  add column if not exists pagamentos_divididos jsonb not null default '[]'::jsonb;

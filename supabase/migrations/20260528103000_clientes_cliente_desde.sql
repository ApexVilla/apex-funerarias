-- Data de referência comercial / migração: quando o contato entrou na base (pode ser anterior ao created_at).
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS cliente_desde date;

COMMENT ON COLUMN public.clientes.cliente_desde IS 'Data de entrada do contato na operação (migração ou início real); usada em relatórios e histórico.';

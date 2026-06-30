-- Regras operacionais por conta bancária/caixa
-- Configuráveis no cadastro da conta.

ALTER TABLE IF EXISTS public.fin_contas_bancarias
  ADD COLUMN IF NOT EXISTS permite_abertura_com_outro_caixa_aberto boolean NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS public.fin_contas_bancarias
  ADD COLUMN IF NOT EXISTS exclusivo_empresa boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.fin_contas_bancarias
  ADD COLUMN IF NOT EXISTS compoe_dfc_dre boolean NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS public.fin_contas_bancarias
  ADD COLUMN IF NOT EXISTS permite_saldo_negativo boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.fin_contas_bancarias
  ADD COLUMN IF NOT EXISTS permite_fechar_com_saldo_em_caixa boolean NOT NULL DEFAULT true;

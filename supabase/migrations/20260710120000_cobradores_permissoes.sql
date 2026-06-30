-- Migration to add collector permissions, limits and module visibility columns to public.cobradores table.
ALTER TABLE public.cobradores
  ADD COLUMN IF NOT EXISTS alcada_desconto numeric(5,2) not null default 10.00,
  ADD COLUMN IF NOT EXISTS exigir_gps boolean not null default true,
  ADD COLUMN IF NOT EXISTS estorno_mesmo_dia boolean not null default false,
  ADD COLUMN IF NOT EXISTS prorrogar_vencimento boolean not null default false,
  ADD COLUMN IF NOT EXISTS recebimento_offline boolean not null default false,
  ADD COLUMN IF NOT EXISTS receber_pix_manual boolean not null default true,
  ADD COLUMN IF NOT EXISTS modulo_carteira boolean not null default true,
  ADD COLUMN IF NOT EXISTS modulo_rotas boolean not null default true,
  ADD COLUMN IF NOT EXISTS modulo_recebimentos boolean not null default true,
  ADD COLUMN IF NOT EXISTS modulo_comissoes boolean not null default true,
  ADD COLUMN IF NOT EXISTS modulo_ponto boolean not null default true;

COMMENT ON COLUMN public.cobradores.alcada_desconto IS 'Percentual máximo de desconto que o cobrador pode aplicar em campo.';
COMMENT ON COLUMN public.cobradores.exigir_gps IS 'Exigência de geolocalização no momento de baixar parcelas.';
COMMENT ON COLUMN public.cobradores.estorno_mesmo_dia IS 'Permissão de estorno de recebimentos no mesmo dia.';
COMMENT ON COLUMN public.cobradores.prorrogar_vencimento IS 'Permissão de prorrogar vencimentos.';
COMMENT ON COLUMN public.cobradores.recebimento_offline IS 'Possibilidade de recebimento offline.';
COMMENT ON COLUMN public.cobradores.receber_pix_manual IS 'Permissão de registrar PIX manual.';
COMMENT ON COLUMN public.cobradores.modulo_carteira IS 'Módulo Carteira visível.';
COMMENT ON COLUMN public.cobradores.modulo_rotas IS 'Módulo Rotas visível.';
COMMENT ON COLUMN public.cobradores.modulo_recebimentos IS 'Módulo Recebimentos visível.';
COMMENT ON COLUMN public.cobradores.modulo_comissoes IS 'Módulo Comissões visível.';
COMMENT ON COLUMN public.cobradores.modulo_ponto IS 'Módulo Ponto visível.';

-- Backfill values for existing collectors matching the default frontend mock data.

-- 1. Bruno Catalão (Cobrador Externo Sênior)
UPDATE public.cobradores
SET 
  alcada_desconto = 15.00,
  exigir_gps = true,
  estorno_mesmo_dia = true,
  prorrogar_vencimento = false,
  recebimento_offline = true,
  receber_pix_manual = true,
  modulo_carteira = true,
  modulo_rotas = true,
  modulo_recebimentos = true,
  modulo_comissoes = true,
  modulo_ponto = true
WHERE nome ILIKE '%bruno%';

-- 2. Ederlan Silva (Cobrador Externo Master)
UPDATE public.cobradores
SET 
  alcada_desconto = 10.00,
  exigir_gps = true,
  estorno_mesmo_dia = false,
  prorrogar_vencimento = false,
  recebimento_offline = false,
  receber_pix_manual = true,
  modulo_carteira = true,
  modulo_rotas = true,
  modulo_recebimentos = true,
  modulo_comissoes = true,
  modulo_ponto = true
WHERE nome ILIKE '%ederlan%';

-- 3. Ana Julia Santos (Cobradora Interna / Escritório)
UPDATE public.cobradores
SET 
  alcada_desconto = 20.00,
  exigir_gps = false,
  estorno_mesmo_dia = true,
  prorrogar_vencimento = true,
  recebimento_offline = false,
  receber_pix_manual = true,
  modulo_carteira = true,
  modulo_rotas = false,
  modulo_recebimentos = true,
  modulo_comissoes = true,
  modulo_ponto = true
WHERE nome ILIKE '%ana julia%';

-- 4. Carlos Eduardo Souza (Cobrador Externo Júnior)
UPDATE public.cobradores
SET 
  alcada_desconto = 5.00,
  exigir_gps = true,
  estorno_mesmo_dia = false,
  prorrogar_vencimento = false,
  recebimento_offline = false,
  receber_pix_manual = false,
  modulo_carteira = true,
  modulo_rotas = true,
  modulo_recebimentos = true,
  modulo_comissoes = false,
  modulo_ponto = true
WHERE nome ILIKE '%carlos%eduardo%';

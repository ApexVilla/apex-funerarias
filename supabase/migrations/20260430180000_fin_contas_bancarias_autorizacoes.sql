-- Controle de autorização por usuário em contas bancárias.
-- - autorizados_visualizacao: quem pode visualizar a conta
-- - autorizados_transferencia: quem pode realizar transferências/sangria/suprimento

ALTER TABLE IF EXISTS public.fin_contas_bancarias
  ADD COLUMN IF NOT EXISTS autorizados_visualizacao uuid[] DEFAULT '{}'::uuid[];

ALTER TABLE IF EXISTS public.fin_contas_bancarias
  ADD COLUMN IF NOT EXISTS autorizados_transferencia uuid[] DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.fin_user_pode_visualizar_conta(
  p_conta_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN cardinality(COALESCE(cb.autorizados_visualizacao, '{}'::uuid[])) = 0 THEN true
      ELSE p_user_id = ANY(cb.autorizados_visualizacao)
    END,
    false
  )
  FROM public.fin_contas_bancarias cb
  WHERE cb.id = p_conta_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fin_user_pode_transferir_conta(
  p_conta_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN cardinality(COALESCE(cb.autorizados_transferencia, '{}'::uuid[])) = 0 THEN true
      ELSE p_user_id = ANY(cb.autorizados_transferencia)
    END,
    false
  )
  FROM public.fin_contas_bancarias cb
  WHERE cb.id = p_conta_id
  LIMIT 1;
$$;

-- Operadores do caixa: quem pode abrir/fechar, baixar parcelas e lançar movimentos na conta.

ALTER TABLE IF EXISTS public.fin_contas_bancarias
  ADD COLUMN IF NOT EXISTS autorizados_operacao uuid[] DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.fin_contas_bancarias.autorizados_operacao IS
  'Usuários autorizados a operar o caixa (abrir/fechar, baixa, entrada/saída). Vazio usa autorizados_visualizacao; se ambos vazios, todos da empresa.';

CREATE OR REPLACE FUNCTION public.fin_user_pode_operar_conta(
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
      WHEN cardinality(COALESCE(cb.autorizados_operacao, '{}'::uuid[])) > 0 THEN
        p_user_id = ANY(cb.autorizados_operacao)
      WHEN cardinality(COALESCE(cb.autorizados_visualizacao, '{}'::uuid[])) > 0 THEN
        p_user_id = ANY(cb.autorizados_visualizacao)
      ELSE true
    END,
    false
  )
  FROM public.fin_contas_bancarias cb
  WHERE cb.id = p_conta_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fin_user_pode_operar_conta(uuid, uuid) TO authenticated;

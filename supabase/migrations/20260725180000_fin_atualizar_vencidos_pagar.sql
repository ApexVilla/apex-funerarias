-- Atualiza status de contas a pagar vencidas (paridade com fin_atualizar_vencidos_receber).

CREATE OR REPLACE FUNCTION public.fin_atualizar_vencidos_pagar(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.fin_contas_pagar
       SET status = 'vencido',
           updated_at = now()
     WHERE empresa_id = p_empresa_id
       AND deleted_at IS NULL
       AND status IN ('aberto', 'aprovado')
       AND data_vencimento < CURRENT_DATE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fin_atualizar_vencidos_pagar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_atualizar_vencidos_pagar(uuid) TO anon;

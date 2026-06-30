-- Cria pendências de carteira (cob_cobrancas_pendentes) a partir de títulos em aberto em fin_contas_receber,
-- para que a tela «Carteira por cobrador» liste clientes com contrato/mensalidade mesmo antes de haver linha manual na carteira.

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_upsert_pendencias_de_titulos(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n int := 0;
BEGIN
  INSERT INTO public.cob_cobrancas_pendentes (
    empresa_id,
    conta_receber_id,
    cliente_id,
    valor_centavos,
    data_vencimento,
    dias_atraso,
    status,
    prioridade,
    tentativas,
    updated_at
  )
  SELECT
    fr.empresa_id,
    fr.id,
    fr.cliente_id,
    fr.valor_aberto_centavos,
    fr.data_vencimento::date,
    GREATEST(0, (CURRENT_DATE - fr.data_vencimento::date))::integer,
    'pendente',
    'media',
    0,
    now()
  FROM public.fin_contas_receber fr
  WHERE fr.empresa_id = p_empresa_id
    AND fr.deleted_at IS NULL
    AND fr.cliente_id IS NOT NULL
    AND fr.valor_aberto_centavos > 0
  ON CONFLICT (empresa_id, conta_receber_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.fn_cob_carteira_upsert_pendencias_de_titulos(uuid) IS
  'Sincroniza cob_cobrancas_pendentes com fin_contas_receber em aberto (valor_aberto_centavos > 0).';

GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_upsert_pendencias_de_titulos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_upsert_pendencias_de_titulos(uuid) TO service_role;

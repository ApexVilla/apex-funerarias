-- Carteira: só entra cliente quando for atribuído explicitamente (não listar todos os contratos).
-- Sincronização por cliente cria/atualiza pendências dos títulos em aberto daquele cliente.

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

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_upsert_cliente(
  p_empresa_id uuid,
  p_cliente_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n int := 0;
  n2 int := 0;
BEGIN
  IF p_empresa_id IS NULL OR p_cliente_id IS NULL THEN
    RETURN 0;
  END IF;

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
    AND fr.cliente_id = p_cliente_id
    AND fr.deleted_at IS NULL
    AND fr.valor_aberto_centavos > 0
  ON CONFLICT (empresa_id, conta_receber_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;

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
    observacao,
    updated_at
  )
  SELECT
    a.empresa_id,
    NULL,
    a.cliente_id,
    coalesce(a.valor_mensal_centavos, 0),
    coalesce(a.data_primeiro_vencimento, a.data_contratacao, CURRENT_DATE)::date,
    0,
    'pendente',
    'media',
    0,
    'Contrato ' || coalesce(a.codigo, a.id::text),
    now()
  FROM public.assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.cliente_id = p_cliente_id
    AND a.deleted_at IS NULL
    AND a.status = 'ativo'
    AND NOT EXISTS (
      SELECT 1 FROM public.cob_cobrancas_pendentes cp
      WHERE cp.empresa_id = a.empresa_id
        AND cp.cliente_id = a.cliente_id
        AND cp.status IN ('pendente', 'em_andamento', 'promessa')
    );

  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n + n2;
END;
$$;

COMMENT ON FUNCTION public.fn_cob_carteira_upsert_cliente(uuid, uuid) IS
  'Cria pendências de carteira só para o cliente informado (títulos em aberto ou contrato ativo).';

REVOKE ALL ON FUNCTION public.fn_cob_carteira_upsert_cliente(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_upsert_cliente(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cob_carteira_upsert_cliente(uuid, uuid) TO service_role;

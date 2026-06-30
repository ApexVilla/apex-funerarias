-- Código interno de cliente: sequencial numérico por empresa (001, 002, …).
-- Propostas de venda ≠ contrato; carteira do cobrador usa títulos/contratos ativos.

-- 1) Código único por empresa (001, 002… podem repetir entre unidades diferentes).
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_codigo_key;

-- 2) Renumera clientes existentes por ordem de cadastro, por unidade.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY empresa_id ORDER BY created_at NULLS LAST, id) AS rn
  FROM public.clientes
  WHERE deleted_at IS NULL
)
UPDATE public.clientes c
SET codigo = lpad(r.rn::text, 3, '0'),
    updated_at = now()
FROM ranked r
WHERE c.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_empresa_codigo_uidx
  ON public.clientes (empresa_id, codigo)
  WHERE deleted_at IS NULL;

-- 3) Função atômica para novos cadastros.
CREATE OR REPLACE FUNCTION public.fn_proximo_codigo_cliente(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  max_n integer := 0;
  cand integer;
  cod text;
BEGIN
  IF p_empresa_id IS NULL THEN
    RETURN '001';
  END IF;

  SELECT coalesce(max(
    CASE
      WHEN codigo ~ '^\d+$' THEN codigo::integer
      ELSE 0
    END
  ), 0)
  INTO max_n
  FROM public.clientes
  WHERE empresa_id = p_empresa_id
    AND deleted_at IS NULL;

  FOR cand IN max_n + 1 .. max_n + 5000 LOOP
    cod := CASE WHEN cand < 1000 THEN lpad(cand::text, 3, '0') ELSE cand::text END;
    IF NOT EXISTS (
      SELECT 1 FROM public.clientes
      WHERE empresa_id = p_empresa_id AND codigo = cod AND deleted_at IS NULL
    ) THEN
      RETURN cod;
    END IF;
  END LOOP;

  RETURN lpad((extract(epoch FROM now())::bigint % 100000)::text, 3, '0');
END;
$$;

COMMENT ON FUNCTION public.fn_proximo_codigo_cliente(uuid) IS
  'Próximo código interno numérico do cliente na unidade (001, 002, …).';

GRANT EXECUTE ON FUNCTION public.fn_proximo_codigo_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_proximo_codigo_cliente(uuid) TO service_role;

-- 4) Carteira: incluir contratos ativos com método cobrador mesmo sem título em aberto ainda.
CREATE OR REPLACE FUNCTION public.fn_cob_carteira_upsert_pendencias_de_titulos(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n int := 0;
  n2 int := 0;
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

  -- Contratos ativos sem linha na carteira (proposta convertida ainda sem título em aberto).
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
    AND a.deleted_at IS NULL
    AND a.status = 'ativo'
    AND a.cliente_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.cob_cobrancas_pendentes cp
      WHERE cp.empresa_id = a.empresa_id
        AND cp.cliente_id = a.cliente_id
    );

  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n + n2;
END;
$$;

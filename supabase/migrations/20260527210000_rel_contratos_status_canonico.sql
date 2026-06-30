-- Corrige filtros de status em rel_contratos (ativa/cancelada → ativo/cancelado).

CREATE OR REPLACE FUNCTION public.rel_contratos(
  p_empresa_id uuid,
  p_periodo_inicio date DEFAULT (date_trunc('month', CURRENT_DATE::timestamp with time zone))::date,
  p_periodo_fim date DEFAULT ((date_trunc('month', CURRENT_DATE::timestamp with time zone) + '1 mon -1 days'::interval))::date,
  p_departamento_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_contratos_ativos BIGINT;
  v_cancelados_periodo INTEGER;
  v_novos_periodo INTEGER;
  v_mrr_atual_centavos BIGINT;
  v_churn_rate NUMERIC;
BEGIN
  SELECT count(*)
  INTO v_contratos_ativos
  FROM assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.status = 'ativo'
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = a.vendedor_id
          AND u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
      )
    );

  SELECT COALESCE(SUM(a.valor_mensal_centavos), 0)
  INTO v_mrr_atual_centavos
  FROM assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.status = 'ativo'
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = a.vendedor_id
          AND u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
      )
    );

  SELECT count(*)
  INTO v_cancelados_periodo
  FROM assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.status = 'cancelado'
    AND a.data_cancelamento BETWEEN p_periodo_inicio AND p_periodo_fim
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = a.vendedor_id
          AND u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
      )
    );

  SELECT count(*)
  INTO v_novos_periodo
  FROM assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.created_at >= p_periodo_inicio
    AND a.created_at <= p_periodo_fim
    AND (
      p_departamento_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = a.vendedor_id
          AND u.empresa_id = p_empresa_id
          AND u.departamento_id = p_departamento_id
      )
    );

  v_churn_rate := CASE WHEN v_contratos_ativos + v_cancelados_periodo > 0
    THEN ROUND(v_cancelados_periodo::NUMERIC / (v_contratos_ativos + v_cancelados_periodo) * 100, 2)
    ELSE 0 END;

  v_result := jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_periodo_inicio, 'fim', p_periodo_fim),
    'departamento_id', p_departamento_id,
    'contratos_ativos', v_contratos_ativos,
    'mrr_anual_centavos', v_mrr_atual_centavos * 12,
    'mrr_atual_centavos', v_mrr_atual_centavos,
    'novos_periodo', v_novos_periodo,
    'cancelados_periodo', v_cancelados_periodo,
    'churn_rate', v_churn_rate,
    'net_growth', v_novos_periodo - v_cancelados_periodo,
    'gerado_em', now()
  );

  RETURN v_result;
END;
$function$;

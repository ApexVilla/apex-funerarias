-- 6) Dashboard com filial opcional
DROP FUNCTION IF EXISTS public.fin_dashboard_executivo(uuid);
DROP FUNCTION IF EXISTS public.fin_dashboard_executivo(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fin_dashboard_executivo(
    p_empresa_id uuid,
    p_filial_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_result JSONB;
    v_mes_atual_inicio DATE := date_trunc('month', CURRENT_DATE)::date;
    v_mes_atual_fim DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date;
BEGIN
    SELECT jsonb_build_object(
        'saldo_total_centavos', (
            SELECT COALESCE(SUM(saldo_atual_centavos), 0)
              FROM fin_contas_bancarias
             WHERE empresa_id = p_empresa_id AND ativo = true
        ),
        'contas_bancarias', (
            SELECT count(*) FROM fin_contas_bancarias
             WHERE empresa_id = p_empresa_id AND ativo = true
        ),
        'receitas_mes_centavos', (
            SELECT COALESCE(SUM(valor_pago_centavos), 0)
              FROM fin_contas_receber
             WHERE empresa_id = p_empresa_id
               AND deleted_at IS NULL
               AND data_pagamento BETWEEN v_mes_atual_inicio AND v_mes_atual_fim
               AND status IN ('pago', 'pago_parcial')
               AND (p_filial_id IS NULL OR filial_id = p_filial_id)
        ),
        'receitas_previstas_mes_centavos', (
            SELECT COALESCE(SUM(valor_aberto_centavos), 0)
              FROM fin_contas_receber
             WHERE empresa_id = p_empresa_id
               AND deleted_at IS NULL
               AND data_vencimento BETWEEN v_mes_atual_inicio AND v_mes_atual_fim
               AND status IN ('aberto', 'pago_parcial', 'vencido')
               AND (p_filial_id IS NULL OR filial_id = p_filial_id)
        ),
        'despesas_mes_centavos', (
            SELECT COALESCE(SUM(valor_pago_centavos), 0)
              FROM fin_contas_pagar
             WHERE empresa_id = p_empresa_id
               AND deleted_at IS NULL
               AND data_pagamento BETWEEN v_mes_atual_inicio AND v_mes_atual_fim
               AND status IN ('pago', 'pago_parcial')
               AND (p_filial_id IS NULL OR filial_id = p_filial_id)
        ),
        'despesas_previstas_mes_centavos', (
            SELECT COALESCE(SUM(valor_aberto_centavos), 0)
              FROM fin_contas_pagar
             WHERE empresa_id = p_empresa_id
               AND deleted_at IS NULL
               AND data_vencimento BETWEEN v_mes_atual_inicio AND v_mes_atual_fim
               AND status IN ('aberto', 'aprovado', 'pago_parcial', 'vencido')
               AND (p_filial_id IS NULL OR filial_id = p_filial_id)
        ),
        'total_vencido_receber_centavos', (
            SELECT COALESCE(SUM(valor_aberto_centavos), 0)
              FROM fin_contas_receber
             WHERE empresa_id = p_empresa_id
               AND deleted_at IS NULL
               AND status = 'vencido'
               AND (p_filial_id IS NULL OR filial_id = p_filial_id)
        ),
        'total_vencido_pagar_centavos', (
            SELECT COALESCE(SUM(valor_aberto_centavos), 0)
              FROM fin_contas_pagar
             WHERE empresa_id = p_empresa_id
               AND deleted_at IS NULL
               AND status = 'vencido'
               AND (p_filial_id IS NULL OR filial_id = p_filial_id)
        ),
        'titulos_receber_abertos', (
            SELECT count(*) FROM fin_contas_receber
             WHERE empresa_id = p_empresa_id
               AND deleted_at IS NULL
               AND status IN ('aberto', 'pago_parcial', 'vencido')
               AND (p_filial_id IS NULL OR filial_id = p_filial_id)
        ),
        'titulos_pagar_abertos', (
            SELECT count(*) FROM fin_contas_pagar
             WHERE empresa_id = p_empresa_id
               AND deleted_at IS NULL
               AND status IN ('aberto', 'aprovado', 'pago_parcial', 'vencido')
               AND (p_filial_id IS NULL OR filial_id = p_filial_id)
        ),
        'aprovacoes_pendentes', (
            SELECT count(*) FROM fin_aprovacoes_pagamento
             WHERE empresa_id = p_empresa_id AND status = 'pendente'
        ),
        'conciliacoes_pendentes', (
            SELECT count(*) FROM fin_conciliacoes
             WHERE empresa_id = p_empresa_id AND status = 'em_andamento'
        ),
        'filial_filtrada', p_filial_id IS NOT NULL
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_dashboard_executivo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_dashboard_executivo(uuid, uuid) TO anon;

-- 7) Relatório fluxo de caixa: schema correto + filial
DROP FUNCTION IF EXISTS public.rel_fluxo_caixa(uuid, date, date, uuid);
DROP FUNCTION IF EXISTS public.rel_fluxo_caixa(uuid, date, date, uuid, uuid);

CREATE OR REPLACE FUNCTION public.rel_fluxo_caixa(
    p_empresa_id uuid,
    p_periodo_inicio date DEFAULT CURRENT_DATE,
    p_periodo_fim date DEFAULT ((CURRENT_DATE + INTERVAL '30 days')::date),
    p_conta_bancaria_id uuid DEFAULT NULL,
    p_filial_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result JSONB;
  v_saldo_inicial BIGINT;
  v_movimentacoes JSONB;
  v_saldos_diarios JSONB;
  v_entradas BIGINT;
  v_saidas BIGINT;
BEGIN
  SELECT COALESCE(SUM(saldo_atual_centavos), 0)
    INTO v_saldo_inicial
    FROM fin_contas_bancarias
   WHERE empresa_id = p_empresa_id
     AND ativo = true
     AND (p_conta_bancaria_id IS NULL OR id = p_conta_bancaria_id);

  SELECT
    COALESCE(SUM(CASE WHEN m.tipo IN ('receita', 'transferencia_entrada', 'ajuste_credito', 'resgate', 'estorno')
                      AND m.valor_centavos > 0 THEN m.valor_centavos
                      WHEN m.tipo IN ('receita', 'transferencia_entrada', 'ajuste_credito', 'resgate', 'estorno')
                      AND m.valor_centavos < 0 THEN 0
                      WHEN m.tipo NOT IN ('despesa', 'transferencia_saida', 'ajuste_debito', 'aplicacao')
                      THEN GREATEST(m.valor_centavos, 0)
                      ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.tipo IN ('despesa', 'transferencia_saida', 'ajuste_debito', 'aplicacao')
                      THEN m.valor_centavos
                      WHEN m.tipo = 'estorno' AND m.valor_centavos < 0 THEN ABS(m.valor_centavos)
                      ELSE 0 END), 0)
    INTO v_entradas, v_saidas
    FROM fin_movimentacoes m
   WHERE m.empresa_id = p_empresa_id
     AND m.data_movimentacao BETWEEN p_periodo_inicio AND p_periodo_fim
     AND (p_conta_bancaria_id IS NULL OR m.conta_bancaria_id = p_conta_bancaria_id)
     AND (p_filial_id IS NULL OR m.filial_id = p_filial_id);

  SELECT jsonb_agg(mov ORDER BY mov.data_movimentacao, mov.created_at)
    INTO v_movimentacoes
    FROM (
      SELECT
        m.data_movimentacao,
        m.created_at,
        m.tipo,
        CASE
          WHEN m.tipo IN ('receita', 'transferencia_entrada', 'ajuste_credito', 'resgate') THEN 'credito'
          WHEN m.tipo IN ('despesa', 'transferencia_saida', 'ajuste_debito', 'aplicacao') THEN 'debito'
          WHEN m.tipo = 'estorno' AND m.valor_centavos >= 0 THEN 'credito'
          ELSE 'debito'
        END AS fluxo_tipo,
        m.descricao,
        m.valor_centavos,
        m.filial_id
      FROM fin_movimentacoes m
     WHERE m.empresa_id = p_empresa_id
       AND m.data_movimentacao BETWEEN p_periodo_inicio AND p_periodo_fim
       AND (p_conta_bancaria_id IS NULL OR m.conta_bancaria_id = p_conta_bancaria_id)
       AND (p_filial_id IS NULL OR m.filial_id = p_filial_id)
    ) mov;

  SELECT jsonb_agg(sd ORDER BY sd.data)
    INTO v_saldos_diarios
    FROM (
      SELECT data, SUM(saldo_final_centavos) AS saldo_final_centavos
        FROM mv_fluxo_caixa_diario
       WHERE empresa_id = p_empresa_id
         AND data BETWEEN p_periodo_inicio AND p_periodo_fim
         AND (p_conta_bancaria_id IS NULL OR conta_bancaria_id = p_conta_bancaria_id)
       GROUP BY data
    ) sd;

  v_result := jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_periodo_inicio, 'fim', p_periodo_fim),
    'saldo_inicial_centavos', v_saldo_inicial - (v_entradas - v_saidas),
    'entradas_periodo_centavos', v_entradas,
    'saidas_periodo_centavos', v_saidas,
    'saldo_final_centavos', v_saldo_inicial,
    'movimentacoes_periodo', COALESCE(v_movimentacoes, '[]'::jsonb),
    'historico_saldos', COALESCE(v_saldos_diarios, '[]'::jsonb),
    'filial_filtrada', p_filial_id IS NOT NULL,
    'gerado_em', now()
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rel_fluxo_caixa(uuid, date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rel_fluxo_caixa(uuid, date, date, uuid, uuid) TO anon;

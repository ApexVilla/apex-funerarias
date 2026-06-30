-- Saldo inicial/final do fluxo de caixa: corrigir períodos passados.
-- Antes: saldo_inicial = saldo_atual_hoje - (entradas - saídas do período), válido só se o período
-- incluir todas as movimentações até hoje. Para mês passado o valor ficava errado.

CREATE OR REPLACE FUNCTION public.fin_movimento_signed_centavos(p_tipo text, p_valor bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_tipo IN ('despesa', 'transferencia_saida', 'ajuste_debito', 'aplicacao')
      THEN -ABS(p_valor)
    WHEN p_tipo = 'estorno'
      THEN p_valor
    WHEN p_tipo IN ('receita', 'transferencia_entrada', 'ajuste_credito', 'resgate')
      THEN ABS(p_valor)
    ELSE ABS(p_valor)
  END;
$$;

CREATE OR REPLACE FUNCTION public.fin_resumo_saldo_periodo(
    p_empresa_id uuid,
    p_data_inicio date,
    p_data_fim date,
    p_conta_bancaria_id uuid DEFAULT NULL,
    p_filial_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_saldo_atual BIGINT;
  v_delta_desde_inicio BIGINT;
  v_delta_apos_fim BIGINT;
BEGIN
  SELECT COALESCE(SUM(saldo_atual_centavos), 0)
    INTO v_saldo_atual
    FROM fin_contas_bancarias
   WHERE empresa_id = p_empresa_id
     AND ativo = true
     AND (p_conta_bancaria_id IS NULL OR id = p_conta_bancaria_id);

  SELECT COALESCE(SUM(public.fin_movimento_signed_centavos(m.tipo, m.valor_centavos)), 0)
    INTO v_delta_desde_inicio
    FROM fin_movimentacoes m
   WHERE m.empresa_id = p_empresa_id
     AND m.data_movimentacao >= p_data_inicio
     AND (p_conta_bancaria_id IS NULL OR m.conta_bancaria_id = p_conta_bancaria_id)
     AND (p_filial_id IS NULL OR m.filial_id = p_filial_id);

  SELECT COALESCE(SUM(public.fin_movimento_signed_centavos(m.tipo, m.valor_centavos)), 0)
    INTO v_delta_apos_fim
    FROM fin_movimentacoes m
   WHERE m.empresa_id = p_empresa_id
     AND m.data_movimentacao > p_data_fim
     AND (p_conta_bancaria_id IS NULL OR m.conta_bancaria_id = p_conta_bancaria_id)
     AND (p_filial_id IS NULL OR m.filial_id = p_filial_id);

  RETURN jsonb_build_object(
    'saldo_inicial_centavos', v_saldo_atual - v_delta_desde_inicio,
    'saldo_final_centavos', v_saldo_atual - v_delta_apos_fim
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_movimento_signed_centavos(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_resumo_saldo_periodo(uuid, date, date, uuid, uuid) TO authenticated;

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
  v_saldo_atual BIGINT;
  v_saldo_inicial BIGINT;
  v_saldo_final BIGINT;
  v_movimentacoes JSONB;
  v_saldos_diarios JSONB;
  v_entradas BIGINT;
  v_saidas BIGINT;
  v_delta_desde_inicio BIGINT;
  v_delta_apos_fim BIGINT;
BEGIN
  SELECT COALESCE(SUM(saldo_atual_centavos), 0)
    INTO v_saldo_atual
    FROM fin_contas_bancarias
   WHERE empresa_id = p_empresa_id
     AND ativo = true
     AND (p_conta_bancaria_id IS NULL OR id = p_conta_bancaria_id);

  SELECT COALESCE(SUM(public.fin_movimento_signed_centavos(m.tipo, m.valor_centavos)), 0)
    INTO v_delta_desde_inicio
    FROM fin_movimentacoes m
   WHERE m.empresa_id = p_empresa_id
     AND m.data_movimentacao >= p_periodo_inicio
     AND (p_conta_bancaria_id IS NULL OR m.conta_bancaria_id = p_conta_bancaria_id)
     AND (p_filial_id IS NULL OR m.filial_id = p_filial_id);

  SELECT COALESCE(SUM(public.fin_movimento_signed_centavos(m.tipo, m.valor_centavos)), 0)
    INTO v_delta_apos_fim
    FROM fin_movimentacoes m
   WHERE m.empresa_id = p_empresa_id
     AND m.data_movimentacao > p_periodo_fim
     AND (p_conta_bancaria_id IS NULL OR m.conta_bancaria_id = p_conta_bancaria_id)
     AND (p_filial_id IS NULL OR m.filial_id = p_filial_id);

  v_saldo_inicial := v_saldo_atual - v_delta_desde_inicio;
  v_saldo_final := v_saldo_atual - v_delta_apos_fim;

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
    'saldo_inicial_centavos', v_saldo_inicial,
    'entradas_periodo_centavos', v_entradas,
    'saidas_periodo_centavos', v_saidas,
    'saldo_final_centavos', v_saldo_final,
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

-- Hardening de seguranca (Fase 1.6)
-- Funcoes SECURITY DEFINER que recebem empresa_id (direta ou indiretamente)
-- mas NAO validavam se o chamador pode operar aquela empresa. Sem isso, um
-- usuario autenticado da empresa A poderia passar o id da empresa B e
-- ler/alterar dados de outro tenant (IDOR via RPC).
--
-- Adiciona guarda public.auth_usuario_pode_operar_empresa(...) e, para
-- funcoes sem guarda que nao tem uso anonimo legitimo, remove o acesso de
-- anon/PUBLIC (mantendo authenticated).
--
-- ROLLBACK: recriar as funcoes sem a guarda e re-conceder a anon.

-- 1) fin_dashboard_executivo --------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_dashboard_executivo(p_empresa_id uuid, p_filial_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result JSONB;
    v_mes_atual_inicio DATE := date_trunc('month', CURRENT_DATE)::date;
    v_mes_atual_fim DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date;
BEGIN
    IF NOT public.auth_usuario_pode_operar_empresa(p_empresa_id) THEN
        RAISE EXCEPTION 'Sem permissao para acessar dados desta empresa.' USING ERRCODE = '42501';
    END IF;

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

-- 2) rel_fluxo_caixa ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rel_fluxo_caixa(p_empresa_id uuid, p_periodo_inicio date DEFAULT CURRENT_DATE, p_periodo_fim date DEFAULT ((CURRENT_DATE + '30 days'::interval))::date, p_conta_bancaria_id uuid DEFAULT NULL::uuid, p_filial_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF NOT public.auth_usuario_pode_operar_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sem permissao para acessar dados desta empresa.' USING ERRCODE = '42501';
  END IF;

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

-- 3) fin_realizar_sangria (guarda apos derivar empresa da sessao) ------------
CREATE OR REPLACE FUNCTION public.fin_realizar_sangria(p_sessao_id uuid, p_conta_destino_id uuid, p_valor_centavos bigint, p_descricao text, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_empresa_id uuid;
    v_conta_origem_id uuid;
    v_movimento_caixa_id uuid;
    v_mov_saida_id uuid;
    v_mov_entrada_id uuid;
    v_transferencia_id uuid;
    v_sessao_destino_id uuid;
    v_descricao text;
    v_saldo_origem bigint;
    v_permite_negativo boolean;
    v_data_mov date;
BEGIN
    IF p_valor_centavos IS NULL OR p_valor_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor da sangria deve ser maior que zero';
    END IF;

    IF p_conta_destino_id IS NULL THEN
        RAISE EXCEPTION 'Conta de destino e obrigatoria';
    END IF;

    SELECT s.empresa_id, s.conta_bancaria_id
      INTO v_empresa_id, v_conta_origem_id
      FROM fin_caixa_sessoes s
     WHERE s.id = p_sessao_id
       AND s.status = 'aberto';

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Sessao de caixa nao encontrada ou fechada';
    END IF;

    IF NOT public.auth_usuario_pode_operar_empresa(v_empresa_id) THEN
        RAISE EXCEPTION 'Sem permissao para operar o caixa desta empresa.' USING ERRCODE = '42501';
    END IF;

    IF v_conta_origem_id = p_conta_destino_id THEN
        RAISE EXCEPTION 'Conta de origem e destino devem ser diferentes';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM fin_contas_bancarias
         WHERE id = p_conta_destino_id AND empresa_id = v_empresa_id AND ativo = true
    ) THEN
        RAISE EXCEPTION 'Conta de destino invalida para esta empresa';
    END IF;

    v_descricao := NULLIF(trim(COALESCE(p_descricao, '')), '');
    IF v_descricao IS NULL THEN
        v_descricao := 'Sangria de caixa';
    END IF;

    SELECT saldo_atual_centavos, COALESCE(permite_saldo_negativo, false)
      INTO v_saldo_origem, v_permite_negativo
      FROM fin_contas_bancarias
     WHERE id = v_conta_origem_id;

    IF NOT v_permite_negativo AND v_saldo_origem < p_valor_centavos THEN
        RAISE EXCEPTION 'Saldo insuficiente na conta de origem para sangria';
    END IF;

    v_transferencia_id := gen_random_uuid();
    v_data_mov := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;

    INSERT INTO fin_caixa_movimentos (
        empresa_id, sessao_id, tipo, descricao, valor_centavos,
        forma_pagamento, usuario_id, data_movimentacao, created_at
    ) VALUES (
        v_empresa_id, p_sessao_id, 'sangria', v_descricao, p_valor_centavos,
        'transferencia', p_usuario_id, v_data_mov, NOW()
    ) RETURNING id INTO v_movimento_caixa_id;

    INSERT INTO fin_movimentacoes (
        empresa_id, conta_bancaria_id, codigo, tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia, transferencia_id,
        observacoes, created_by, created_at
    ) VALUES (
        v_empresa_id, v_conta_origem_id,
        'TS-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text,
        'transferencia_saida', 'Sangria: ' || v_descricao, p_valor_centavos,
        v_data_mov, v_data_mov, v_transferencia_id,
        'Caixa mov. ' || v_movimento_caixa_id::text,
        p_usuario_id, NOW()
    ) RETURNING id INTO v_mov_saida_id;

    UPDATE fin_contas_bancarias
       SET saldo_atual_centavos = saldo_atual_centavos - p_valor_centavos,
           updated_at = NOW()
     WHERE id = v_conta_origem_id;

    INSERT INTO fin_movimentacoes (
        empresa_id, conta_bancaria_id, codigo, tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia, transferencia_id,
        observacoes, created_by, created_at
    ) VALUES (
        v_empresa_id, p_conta_destino_id,
        'TE-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text,
        'transferencia_entrada', 'Sangria recebida: ' || v_descricao, p_valor_centavos,
        v_data_mov, v_data_mov, v_transferencia_id,
        'Caixa mov. ' || v_movimento_caixa_id::text,
        p_usuario_id, NOW()
    ) RETURNING id INTO v_mov_entrada_id;

    UPDATE fin_contas_bancarias
       SET saldo_atual_centavos = saldo_atual_centavos + p_valor_centavos,
           updated_at = NOW()
     WHERE id = p_conta_destino_id;

    UPDATE fin_caixa_movimentos
       SET referencia_id = v_mov_entrada_id,
           referencia_tipo = 'fin_movimentacoes'
     WHERE id = v_movimento_caixa_id;

    SELECT id INTO v_sessao_destino_id
      FROM fin_caixa_sessoes
     WHERE conta_bancaria_id = p_conta_destino_id
       AND empresa_id = v_empresa_id
       AND status = 'aberto'
     ORDER BY data_abertura DESC
     LIMIT 1;

    IF v_sessao_destino_id IS NOT NULL THEN
        INSERT INTO fin_caixa_movimentos (
            empresa_id, sessao_id, tipo, descricao, valor_centavos,
            forma_pagamento, referencia_id, referencia_tipo, usuario_id,
            data_movimentacao, created_at
        ) VALUES (
            v_empresa_id, v_sessao_destino_id, 'entrada',
            'Sangria recebida: ' || v_descricao, p_valor_centavos,
            'transferencia', v_mov_entrada_id, 'fin_movimentacoes', p_usuario_id,
            v_data_mov, NOW()
        );
    END IF;

    RETURN v_movimento_caixa_id;
END;
$function$;

-- 4) Remover acesso anon/PUBLIC de funcoes de escrita/info sem guarda --------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN ('fn_unificar_clientes', 'fn_gerar_mensalidades',
                        'fn_gerar_mensalidades_com_historico', 'obter_permissoes_usuario')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC;', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated;', r.proname, r.args);
  END LOOP;
END $$;

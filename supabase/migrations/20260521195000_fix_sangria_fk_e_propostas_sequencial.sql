-- Sangria/suprimento: transferencia_id deve existir em fin_transferencias (FK).
-- Propostas: evita sequencial duplicado em inserts simultâneos.

CREATE OR REPLACE FUNCTION public.propostas_venda_bump_sequencial()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF new.sequencial IS NULL OR new.sequencial = 0 THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('propostas_venda_seq:' || new.empresa_id::text, 0)
    );
    SELECT coalesce(max(sequencial), 0) + 1
      INTO new.sequencial
      FROM public.propostas_venda
      WHERE empresa_id = new.empresa_id;
  END IF;
  RETURN new;
END;
$function$;

DROP FUNCTION IF EXISTS public.fin_realizar_sangria(uuid, uuid, bigint, text);
DROP FUNCTION IF EXISTS public.fin_realizar_sangria(uuid, uuid, bigint, text, uuid);

CREATE OR REPLACE FUNCTION public.fin_realizar_sangria(
    p_sessao_id uuid,
    p_conta_destino_id uuid,
    p_valor_centavos bigint,
    p_descricao text,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
    IF p_valor_centavos IS NULL OR p_valor_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor da sangria deve ser maior que zero';
    END IF;

    IF p_conta_destino_id IS NULL THEN
        RAISE EXCEPTION 'Conta de destino é obrigatória';
    END IF;

    SELECT s.empresa_id, s.conta_bancaria_id
      INTO v_empresa_id, v_conta_origem_id
      FROM fin_caixa_sessoes s
     WHERE s.id = p_sessao_id
       AND s.status = 'aberto';

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Sessão de caixa não encontrada ou fechada';
    END IF;

    IF v_conta_origem_id = p_conta_destino_id THEN
        RAISE EXCEPTION 'Conta de origem e destino devem ser diferentes';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM fin_contas_bancarias
         WHERE id = p_conta_destino_id AND empresa_id = v_empresa_id AND ativo = true
    ) THEN
        RAISE EXCEPTION 'Conta de destino inválida para esta empresa';
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

    INSERT INTO fin_transferencias (
        id, empresa_id, codigo, conta_origem_id, conta_destino_id,
        valor_centavos, data_transferencia, status, observacoes, created_by, created_at
    ) VALUES (
        v_transferencia_id,
        v_empresa_id,
        'TRF-SANG-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text,
        v_conta_origem_id,
        p_conta_destino_id,
        p_valor_centavos,
        CURRENT_DATE,
        'realizada',
        v_descricao,
        p_usuario_id,
        NOW()
    );

    INSERT INTO fin_caixa_movimentos (
        empresa_id, sessao_id, tipo, descricao, valor_centavos,
        forma_pagamento, usuario_id, created_at
    ) VALUES (
        v_empresa_id, p_sessao_id, 'sangria', v_descricao, p_valor_centavos,
        'transferencia', p_usuario_id, NOW()
    ) RETURNING id INTO v_movimento_caixa_id;

    INSERT INTO fin_movimentacoes (
        empresa_id, conta_bancaria_id, codigo, tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia, transferencia_id,
        observacoes, created_by, created_at
    ) VALUES (
        v_empresa_id, v_conta_origem_id,
        'TS-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text,
        'transferencia_saida', 'Sangria: ' || v_descricao, p_valor_centavos,
        CURRENT_DATE, CURRENT_DATE, v_transferencia_id,
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
        CURRENT_DATE, CURRENT_DATE, v_transferencia_id,
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
            forma_pagamento, referencia_id, referencia_tipo, usuario_id, created_at
        ) VALUES (
            v_empresa_id, v_sessao_destino_id, 'entrada',
            'Sangria recebida: ' || v_descricao, p_valor_centavos,
            'transferencia', v_mov_entrada_id, 'fin_movimentacoes', p_usuario_id, NOW()
        );
    END IF;

    RETURN v_movimento_caixa_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.fin_realizar_suprimento(uuid, uuid, bigint, text);
DROP FUNCTION IF EXISTS public.fin_realizar_suprimento(uuid, uuid, bigint, text, uuid);

CREATE OR REPLACE FUNCTION public.fin_realizar_suprimento(
    p_sessao_id uuid,
    p_conta_origem_id uuid,
    p_valor_centavos bigint,
    p_descricao text,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_empresa_id uuid;
    v_conta_destino_id uuid;
    v_movimento_caixa_id uuid;
    v_mov_saida_id uuid;
    v_mov_entrada_id uuid;
    v_transferencia_id uuid;
    v_sessao_origem_id uuid;
    v_descricao text;
    v_saldo_origem bigint;
    v_permite_negativo boolean;
BEGIN
    IF p_valor_centavos IS NULL OR p_valor_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor do suprimento deve ser maior que zero';
    END IF;

    IF p_conta_origem_id IS NULL THEN
        RAISE EXCEPTION 'Conta de origem é obrigatória';
    END IF;

    SELECT s.empresa_id, s.conta_bancaria_id
      INTO v_empresa_id, v_conta_destino_id
      FROM fin_caixa_sessoes s
     WHERE s.id = p_sessao_id
       AND s.status = 'aberto';

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Sessão de caixa não encontrada ou fechada';
    END IF;

    IF v_conta_destino_id = p_conta_origem_id THEN
        RAISE EXCEPTION 'Conta de origem e destino devem ser diferentes';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM fin_contas_bancarias
         WHERE id = p_conta_origem_id AND empresa_id = v_empresa_id AND ativo = true
    ) THEN
        RAISE EXCEPTION 'Conta de origem inválida para esta empresa';
    END IF;

    v_descricao := NULLIF(trim(COALESCE(p_descricao, '')), '');
    IF v_descricao IS NULL THEN
        v_descricao := 'Suprimento de caixa';
    END IF;

    SELECT saldo_atual_centavos, COALESCE(permite_saldo_negativo, false)
      INTO v_saldo_origem, v_permite_negativo
      FROM fin_contas_bancarias
     WHERE id = p_conta_origem_id;

    IF NOT v_permite_negativo AND v_saldo_origem < p_valor_centavos THEN
        RAISE EXCEPTION 'Saldo insuficiente na conta de origem para suprimento';
    END IF;

    v_transferencia_id := gen_random_uuid();

    INSERT INTO fin_transferencias (
        id, empresa_id, codigo, conta_origem_id, conta_destino_id,
        valor_centavos, data_transferencia, status, observacoes, created_by, created_at
    ) VALUES (
        v_transferencia_id,
        v_empresa_id,
        'TRF-SUPR-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text,
        p_conta_origem_id,
        v_conta_destino_id,
        p_valor_centavos,
        CURRENT_DATE,
        'realizada',
        v_descricao,
        p_usuario_id,
        NOW()
    );

    INSERT INTO fin_caixa_movimentos (
        empresa_id, sessao_id, tipo, descricao, valor_centavos,
        forma_pagamento, usuario_id, created_at
    ) VALUES (
        v_empresa_id, p_sessao_id, 'suprimento', v_descricao, p_valor_centavos,
        'transferencia', p_usuario_id, NOW()
    ) RETURNING id INTO v_movimento_caixa_id;

    INSERT INTO fin_movimentacoes (
        empresa_id, conta_bancaria_id, codigo, tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia, transferencia_id,
        observacoes, created_by, created_at
    ) VALUES (
        v_empresa_id, p_conta_origem_id,
        'TS-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text,
        'transferencia_saida', 'Suprimento: ' || v_descricao, p_valor_centavos,
        CURRENT_DATE, CURRENT_DATE, v_transferencia_id,
        'Caixa mov. ' || v_movimento_caixa_id::text,
        p_usuario_id, NOW()
    ) RETURNING id INTO v_mov_saida_id;

    UPDATE fin_contas_bancarias
       SET saldo_atual_centavos = saldo_atual_centavos - p_valor_centavos,
           updated_at = NOW()
     WHERE id = p_conta_origem_id;

    INSERT INTO fin_movimentacoes (
        empresa_id, conta_bancaria_id, codigo, tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia, transferencia_id,
        observacoes, created_by, created_at
    ) VALUES (
        v_empresa_id, v_conta_destino_id,
        'TE-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text,
        'transferencia_entrada', 'Suprimento recebido: ' || v_descricao, p_valor_centavos,
        CURRENT_DATE, CURRENT_DATE, v_transferencia_id,
        'Caixa mov. ' || v_movimento_caixa_id::text,
        p_usuario_id, NOW()
    ) RETURNING id INTO v_mov_entrada_id;

    UPDATE fin_contas_bancarias
       SET saldo_atual_centavos = saldo_atual_centavos + p_valor_centavos,
           updated_at = NOW()
     WHERE id = v_conta_destino_id;

    UPDATE fin_caixa_movimentos
       SET referencia_id = v_mov_entrada_id,
           referencia_tipo = 'fin_movimentacoes'
     WHERE id = v_movimento_caixa_id;

    SELECT id INTO v_sessao_origem_id
      FROM fin_caixa_sessoes
     WHERE conta_bancaria_id = p_conta_origem_id
       AND empresa_id = v_empresa_id
       AND status = 'aberto'
     ORDER BY data_abertura DESC
     LIMIT 1;

    IF v_sessao_origem_id IS NOT NULL THEN
        INSERT INTO fin_caixa_movimentos (
            empresa_id, sessao_id, tipo, descricao, valor_centavos,
            forma_pagamento, referencia_id, referencia_tipo, usuario_id, created_at
        ) VALUES (
            v_empresa_id, v_sessao_origem_id, 'saida',
            'Suprimento enviado: ' || v_descricao, p_valor_centavos,
            'transferencia', v_mov_saida_id, 'fin_movimentacoes', p_usuario_id, NOW()
        );
    END IF;

    RETURN v_movimento_caixa_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_realizar_sangria(uuid, uuid, bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_realizar_sangria(uuid, uuid, bigint, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fin_realizar_suprimento(uuid, uuid, bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_realizar_suprimento(uuid, uuid, bigint, text, uuid) TO authenticated;

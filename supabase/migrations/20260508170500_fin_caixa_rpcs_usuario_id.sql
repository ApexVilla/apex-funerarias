-- Atualiza RPCs de caixa para registrar usuário responsável pelo lançamento.
-- Permite que o modal de detalhes mostre quem realizou a operação.

-- =====================================================
-- 1) fin_realizar_sangria com p_usuario_id
-- =====================================================
DROP FUNCTION IF EXISTS public.fin_realizar_sangria(uuid, uuid, bigint, text);

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
AS $function$
DECLARE
    v_empresa_id UUID;
    v_movimento_id UUID;
    v_destino_mov_id UUID;
    v_codigo TEXT;
    v_sessao_destino_id UUID;
BEGIN
    SELECT empresa_id INTO v_empresa_id FROM fin_caixa_sessoes WHERE id = p_sessao_id;
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Sessão não encontrada ou empresa_id nulo para sessao %', p_sessao_id;
    END IF;

    v_codigo := 'SANG-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text;

    INSERT INTO fin_caixa_movimentos (
        empresa_id, sessao_id, tipo, descricao, valor_centavos,
        usuario_id, created_at
    ) VALUES (
        v_empresa_id, p_sessao_id, 'sangria', p_descricao, p_valor_centavos,
        p_usuario_id, NOW()
    ) RETURNING id INTO v_movimento_id;

    INSERT INTO fin_movimentacoes (
        empresa_id, conta_bancaria_id, codigo, tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia, created_at, observacoes, created_by
    ) VALUES (
        v_empresa_id, p_conta_destino_id, v_codigo, 'transferencia_entrada',
        'Sangria de Caixa: ' || p_descricao, p_valor_centavos,
        CURRENT_DATE, CURRENT_DATE, NOW(),
        'Origem: Caixa Movimento ' || v_movimento_id,
        p_usuario_id
    ) RETURNING id INTO v_destino_mov_id;

    UPDATE fin_contas_bancarias
    SET saldo_atual_centavos = saldo_atual_centavos + p_valor_centavos
    WHERE id = p_conta_destino_id;

    UPDATE fin_caixa_movimentos
    SET referencia_id = v_destino_mov_id, referencia_tipo = 'fin_movimentacoes'
    WHERE id = v_movimento_id;

    SELECT id INTO v_sessao_destino_id
    FROM fin_caixa_sessoes
    WHERE conta_bancaria_id = p_conta_destino_id AND status = 'aberto'
    LIMIT 1;

    IF v_sessao_destino_id IS NOT NULL THEN
        INSERT INTO fin_caixa_movimentos (
            empresa_id, sessao_id, tipo, descricao, valor_centavos,
            referencia_id, referencia_tipo, usuario_id, created_at
        ) VALUES (
            v_empresa_id, v_sessao_destino_id, 'suprimento',
            'Transferência de Caixa: ' || p_descricao, p_valor_centavos,
            v_destino_mov_id, 'fin_movimentacoes', p_usuario_id, NOW()
        );
    END IF;

    RETURN v_movimento_id;
END;
$function$;

-- =====================================================
-- 2) fin_realizar_suprimento com p_usuario_id
-- =====================================================
DROP FUNCTION IF EXISTS public.fin_realizar_suprimento(uuid, uuid, bigint, text);

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
AS $function$
DECLARE
    v_empresa_id UUID;
    v_movimento_id UUID;
    v_origem_mov_id UUID;
    v_codigo TEXT;
    v_sessao_origem_id UUID;
BEGIN
    SELECT empresa_id INTO v_empresa_id FROM fin_caixa_sessoes WHERE id = p_sessao_id;
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Sessão não encontrada ou empresa_id nulo para sessao %', p_sessao_id;
    END IF;

    v_codigo := 'SUPR-' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text;

    INSERT INTO fin_caixa_movimentos (
        empresa_id, sessao_id, tipo, descricao, valor_centavos,
        usuario_id, created_at
    ) VALUES (
        v_empresa_id, p_sessao_id, 'suprimento', p_descricao, p_valor_centavos,
        p_usuario_id, NOW()
    ) RETURNING id INTO v_movimento_id;

    INSERT INTO fin_movimentacoes (
        empresa_id, conta_bancaria_id, codigo, tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia, created_at, observacoes, created_by
    ) VALUES (
        v_empresa_id, p_conta_origem_id, v_codigo, 'transferencia_saida',
        'Suprimento de Caixa: ' || p_descricao, p_valor_centavos,
        CURRENT_DATE, CURRENT_DATE, NOW(),
        'Destino: Caixa Movimento ' || v_movimento_id,
        p_usuario_id
    ) RETURNING id INTO v_origem_mov_id;

    UPDATE fin_contas_bancarias
    SET saldo_atual_centavos = saldo_atual_centavos - p_valor_centavos
    WHERE id = p_conta_origem_id;

    UPDATE fin_caixa_movimentos
    SET referencia_id = v_origem_mov_id, referencia_tipo = 'fin_movimentacoes'
    WHERE id = v_movimento_id;

    SELECT id INTO v_sessao_origem_id
    FROM fin_caixa_sessoes
    WHERE conta_bancaria_id = p_conta_origem_id AND status = 'aberto'
    LIMIT 1;

    IF v_sessao_origem_id IS NOT NULL THEN
        INSERT INTO fin_caixa_movimentos (
            empresa_id, sessao_id, tipo, descricao, valor_centavos,
            referencia_id, referencia_tipo, usuario_id, created_at
        ) VALUES (
            v_empresa_id, v_sessao_origem_id, 'sangria',
            'Transferência para Caixa: ' || p_descricao, p_valor_centavos,
            v_origem_mov_id, 'fin_movimentacoes', p_usuario_id, NOW()
        );
    END IF;

    RETURN v_movimento_id;
END;
$function$;

-- Garante que TODO movimento em fin_caixa_movimentos sempre tenha o usuário
-- responsável correto, evitando confusão como a do SISPAG SALÁRIOS (12/05/2026),
-- em que o pagamento feito pela Daneimy ficou gravado com o usuário da Edna
-- (que apenas era a abridora da sessão de caixa).
--
-- Camadas de defesa:
--   1) Trigger BEFORE INSERT que preenche usuario_id se vier NULL.
--      Prioridade: usuario_id informado > auth.uid() > usuario_abertura_id da sessão.
--      Nunca sobrescreve um usuario_id que tenha vindo explícito.
--   2) fin_baixar_conta_pagar passa a aceitar p_usuario_id (igual ao CR),
--      usa auth.uid() como fallback e grava o MESMO usuário em todas as 3 tabelas
--      (fin_contas_pagar_baixas, fin_movimentacoes, fin_caixa_movimentos).
--      Também usa v_cp.codigo direto (sem padding "CP-     1").
--   3) fin_estornar_conta_pagar / fin_estornar_conta_receber passam a gravar
--      usuario_id no fin_caixa_movimentos do estorno (antes ficava NULL).

-- =====================================================
-- 1) TRIGGER DE GARANTIA EM fin_caixa_movimentos
-- =====================================================
CREATE OR REPLACE FUNCTION public.fin_caixa_movimentos_set_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_user UUID;
BEGIN
    IF NEW.usuario_id IS NULL THEN
        BEGIN
            NEW.usuario_id := auth.uid();
        EXCEPTION WHEN OTHERS THEN
            NEW.usuario_id := NULL;
        END;
    END IF;

    IF NEW.usuario_id IS NULL AND NEW.sessao_id IS NOT NULL THEN
        SELECT usuario_abertura_id
          INTO v_session_user
          FROM public.fin_caixa_sessoes
         WHERE id = NEW.sessao_id;
        NEW.usuario_id := v_session_user;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_caixa_movimentos_set_usuario
    ON public.fin_caixa_movimentos;

CREATE TRIGGER trg_fin_caixa_movimentos_set_usuario
    BEFORE INSERT ON public.fin_caixa_movimentos
    FOR EACH ROW
    EXECUTE FUNCTION public.fin_caixa_movimentos_set_usuario();


-- =====================================================
-- 2) fin_baixar_conta_pagar com p_usuario_id explícito
-- =====================================================
DROP FUNCTION IF EXISTS public.fin_baixar_conta_pagar(uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date);
DROP FUNCTION IF EXISTS public.fin_baixar_conta_pagar(uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid);

CREATE OR REPLACE FUNCTION public.fin_baixar_conta_pagar(
    p_conta_pagar_id uuid,
    p_valor_pago_centavos bigint,
    p_forma_pagamento_id uuid DEFAULT NULL,
    p_conta_bancaria_id uuid DEFAULT NULL,
    p_valor_desconto_centavos bigint DEFAULT 0,
    p_valor_juros_centavos bigint DEFAULT 0,
    p_valor_multa_centavos bigint DEFAULT 0,
    p_observacoes text DEFAULT NULL,
    p_data_pagamento date DEFAULT NULL,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_cp RECORD;
    v_baixa_id UUID;
    v_novo_status VARCHAR(20);
    v_total_devido BIGINT;
    v_conta_destino_id UUID;
    v_sessao_id UUID;
    v_uid UUID;
    v_data DATE;
BEGIN
    v_uid  := COALESCE(p_usuario_id, auth.uid());
    v_data := COALESCE(p_data_pagamento, CURRENT_DATE);

    SELECT * INTO v_cp
      FROM fin_contas_pagar
     WHERE id = p_conta_pagar_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Titulo a pagar % nao encontrado', p_conta_pagar_id;
    END IF;
    IF v_cp.status IN ('pago','cancelado') THEN
        RAISE EXCEPTION 'Titulo com status % nao pode ser baixado', v_cp.status;
    END IF;

    INSERT INTO fin_contas_pagar_baixas (
        empresa_id, conta_pagar_id,
        valor_pago_centavos, valor_desconto_centavos,
        valor_juros_centavos, valor_multa_centavos,
        forma_pagamento_id, conta_bancaria_id, observacoes,
        tipo, created_by
    ) VALUES (
        v_cp.empresa_id, p_conta_pagar_id,
        p_valor_pago_centavos, p_valor_desconto_centavos,
        p_valor_juros_centavos, p_valor_multa_centavos,
        p_forma_pagamento_id, p_conta_bancaria_id, p_observacoes,
        CASE
            WHEN p_valor_pago_centavos
                 >= (v_cp.valor_original_centavos - v_cp.valor_pago_centavos)
            THEN 'normal' ELSE 'parcial'
        END,
        v_uid
    ) RETURNING id INTO v_baixa_id;

    UPDATE fin_contas_pagar SET
        valor_pago_centavos     = valor_pago_centavos     + p_valor_pago_centavos,
        valor_desconto_centavos = valor_desconto_centavos + p_valor_desconto_centavos,
        valor_juros_centavos    = valor_juros_centavos    + p_valor_juros_centavos,
        valor_multa_centavos    = valor_multa_centavos    + p_valor_multa_centavos,
        updated_by              = v_uid
    WHERE id = p_conta_pagar_id;

    SELECT * INTO v_cp FROM fin_contas_pagar WHERE id = p_conta_pagar_id;

    v_total_devido := v_cp.valor_original_centavos
                    + v_cp.valor_juros_centavos
                    + v_cp.valor_multa_centavos
                    - v_cp.valor_desconto_centavos;

    IF v_cp.valor_pago_centavos >= v_total_devido THEN
        v_novo_status := 'pago';
    ELSE
        v_novo_status := 'pago_parcial';
    END IF;

    UPDATE fin_contas_pagar SET
        status              = v_novo_status,
        data_pagamento      = CASE WHEN v_novo_status = 'pago' THEN v_data ELSE data_pagamento END,
        forma_pagamento_id  = COALESCE(p_forma_pagamento_id, forma_pagamento_id),
        conta_bancaria_id   = COALESCE(p_conta_bancaria_id,  conta_bancaria_id)
    WHERE id = p_conta_pagar_id;

    v_conta_destino_id := COALESCE(
        p_conta_bancaria_id,
        (SELECT id FROM fin_contas_bancarias
          WHERE empresa_id = v_cp.empresa_id AND principal = true LIMIT 1)
    );

    IF v_conta_destino_id IS NOT NULL THEN
        UPDATE fin_contas_bancarias
           SET saldo_atual_centavos = saldo_atual_centavos - p_valor_pago_centavos
         WHERE id = v_conta_destino_id;
    END IF;

    INSERT INTO fin_movimentacoes (
        empresa_id, codigo, conta_bancaria_id,
        plano_conta_id, centro_custo_id,
        tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia,
        conta_pagar_id, conta_pagar_baixa_id,
        created_by
    ) VALUES (
        v_cp.empresa_id,
        'MOV-' || to_char(now(), 'YYYYMMDD-HH24MISS-US'),
        v_conta_destino_id,
        v_cp.plano_conta_id, v_cp.centro_custo_id,
        'despesa',
        'Pagamento: ' || v_cp.codigo || COALESCE(' - ' || v_cp.descricao, ''),
        p_valor_pago_centavos,
        v_data, v_cp.data_competencia,
        p_conta_pagar_id, v_baixa_id,
        v_uid
    );

    IF v_conta_destino_id IS NOT NULL THEN
        SELECT id INTO v_sessao_id
          FROM fin_caixa_sessoes
         WHERE conta_bancaria_id = v_conta_destino_id
           AND status = 'aberto'
         LIMIT 1;

        IF v_sessao_id IS NOT NULL THEN
            INSERT INTO fin_caixa_movimentos (
                empresa_id, sessao_id, tipo, descricao, valor_centavos,
                referencia_id, referencia_tipo, forma_pagamento,
                usuario_id, created_at
            ) VALUES (
                v_cp.empresa_id, v_sessao_id, 'saida',
                'Pagamento ' || v_cp.codigo
                    || COALESCE(' - ' || v_cp.descricao, ''),
                p_valor_pago_centavos,
                p_conta_pagar_id, 'fin_contas_pagar',
                COALESCE(
                    (SELECT tipo FROM fin_formas_pagamento WHERE id = p_forma_pagamento_id),
                    'dinheiro'
                ),
                v_uid,
                (v_data::text || 'T' || to_char(now(), 'HH24:MI:SS'))::timestamptz
            );
        END IF;
    END IF;

    RETURN v_baixa_id;
END;
$function$;


-- =====================================================
-- 3) fin_estornar_conta_pagar grava usuario_id no caixa
-- =====================================================
DROP FUNCTION IF EXISTS public.fin_estornar_conta_pagar(uuid, text);
DROP FUNCTION IF EXISTS public.fin_estornar_conta_pagar(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.fin_estornar_conta_pagar(
    p_conta_pagar_id uuid,
    p_motivo text,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_empresa_id UUID;
    v_status_atual TEXT;
    v_movimento RECORD;
    v_sessao_id UUID;
    v_estorno_mov_id UUID;
    v_data_vencimento DATE;
    v_uid UUID;
BEGIN
    v_uid := COALESCE(p_usuario_id, auth.uid());

    SELECT empresa_id, status, data_vencimento
      INTO v_empresa_id, v_status_atual, v_data_vencimento
      FROM fin_contas_pagar
     WHERE id = p_conta_pagar_id;

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Conta a pagar não encontrada.';
    END IF;

    IF v_status_atual NOT IN ('pago', 'pago_parcial') THEN
        RAISE EXCEPTION 'Apenas contas pagas ou parcialmente pagas podem ser estornadas.';
    END IF;

    FOR v_movimento IN
        SELECT *
          FROM fin_movimentacoes
         WHERE conta_pagar_id = p_conta_pagar_id
           AND tipo = 'saida_pagamento'
    LOOP
        INSERT INTO fin_movimentacoes (
            empresa_id, conta_bancaria_id, codigo, tipo, descricao,
            valor_centavos, data_movimentacao, data_competencia,
            conta_pagar_id, created_at, observacoes, created_by
        ) VALUES (
            v_empresa_id, v_movimento.conta_bancaria_id,
            'EST-' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
            'estorno_pagamento',
            'Estorno de Pagamento: ' || v_movimento.descricao || ' - Motivo: ' || p_motivo,
            ABS(v_movimento.valor_centavos),
            CURRENT_DATE, CURRENT_DATE,
            p_conta_pagar_id, NOW(),
            'Estorno do movimento ' || v_movimento.id,
            v_uid
        ) RETURNING id INTO v_estorno_mov_id;

        UPDATE fin_contas_bancarias
           SET saldo_atual_centavos = saldo_atual_centavos + ABS(v_movimento.valor_centavos)
         WHERE id = v_movimento.conta_bancaria_id;

        SELECT id INTO v_sessao_id
          FROM fin_caixa_sessoes
         WHERE conta_bancaria_id = v_movimento.conta_bancaria_id
           AND status = 'aberto'
         LIMIT 1;

        IF v_sessao_id IS NOT NULL THEN
            INSERT INTO fin_caixa_movimentos (
                empresa_id, sessao_id, tipo, descricao, valor_centavos,
                referencia_id, referencia_tipo, usuario_id, created_at
            ) VALUES (
                v_empresa_id, v_sessao_id, 'entrada',
                'Estorno de Pagamento: ' || v_movimento.descricao,
                ABS(v_movimento.valor_centavos),
                v_estorno_mov_id, 'fin_movimentacoes',
                v_uid, NOW()
            );
        END IF;
    END LOOP;

    UPDATE fin_contas_pagar SET
        status = CASE WHEN v_data_vencimento < CURRENT_DATE THEN 'vencido' ELSE 'aberto' END,
        valor_pago_centavos     = 0,
        valor_aberto_centavos   = valor_total_centavos,
        valor_juros_centavos    = 0,
        valor_multa_centavos    = 0,
        valor_desconto_centavos = 0,
        data_pagamento          = NULL,
        updated_by              = v_uid
    WHERE id = p_conta_pagar_id;
END;
$function$;


-- =====================================================
-- 4) fin_estornar_conta_receber grava usuario_id no caixa
-- =====================================================
DROP FUNCTION IF EXISTS public.fin_estornar_conta_receber(uuid, text);
DROP FUNCTION IF EXISTS public.fin_estornar_conta_receber(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.fin_estornar_conta_receber(
    p_conta_receber_id uuid,
    p_motivo text,
    p_usuario_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_empresa_id UUID;
    v_status_atual TEXT;
    v_movimento RECORD;
    v_sessao_id UUID;
    v_estorno_mov_id UUID;
    v_data_vencimento DATE;
    v_uid UUID;
BEGIN
    v_uid := COALESCE(p_usuario_id, auth.uid());

    SELECT empresa_id, status, data_vencimento
      INTO v_empresa_id, v_status_atual, v_data_vencimento
      FROM fin_contas_receber
     WHERE id = p_conta_receber_id;

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Conta a receber não encontrada.';
    END IF;

    IF v_status_atual NOT IN ('pago', 'pago_parcial') THEN
        RAISE EXCEPTION 'Apenas títulos pagos ou parcialmente pagos podem ser estornados.';
    END IF;

    FOR v_movimento IN
        SELECT *
          FROM fin_movimentacoes
         WHERE conta_receber_id = p_conta_receber_id
           AND tipo = 'receita'
    LOOP
        INSERT INTO fin_movimentacoes (
            empresa_id, conta_bancaria_id, codigo, tipo, descricao,
            valor_centavos, data_movimentacao, data_competencia,
            conta_receber_id, created_at, observacoes, created_by
        ) VALUES (
            v_empresa_id, v_movimento.conta_bancaria_id,
            'EST-' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
            'estorno_recebimento',
            'Estorno de Recebimento: ' || v_movimento.descricao || ' - Motivo: ' || p_motivo,
            -ABS(v_movimento.valor_centavos),
            CURRENT_DATE, CURRENT_DATE,
            p_conta_receber_id, NOW(),
            'Estorno do movimento ' || v_movimento.id,
            v_uid
        ) RETURNING id INTO v_estorno_mov_id;

        IF v_movimento.conta_bancaria_id IS NOT NULL THEN
            UPDATE fin_contas_bancarias
               SET saldo_atual_centavos = saldo_atual_centavos - ABS(v_movimento.valor_centavos)
             WHERE id = v_movimento.conta_bancaria_id;

            SELECT id INTO v_sessao_id
              FROM fin_caixa_sessoes
             WHERE conta_bancaria_id = v_movimento.conta_bancaria_id
               AND status = 'aberto'
             LIMIT 1;

            IF v_sessao_id IS NOT NULL THEN
                INSERT INTO fin_caixa_movimentos (
                    empresa_id, sessao_id, tipo, descricao, valor_centavos,
                    referencia_id, referencia_tipo, usuario_id, created_at
                ) VALUES (
                    v_empresa_id, v_sessao_id, 'saida',
                    'Estorno de Recebimento: ' || v_movimento.descricao,
                    ABS(v_movimento.valor_centavos),
                    v_estorno_mov_id, 'fin_movimentacoes',
                    v_uid, NOW()
                );
            END IF;
        END IF;
    END LOOP;

    DELETE FROM fin_contas_receber_baixas
     WHERE conta_receber_id = p_conta_receber_id;

    UPDATE fin_contas_receber SET
        status = CASE WHEN v_data_vencimento < CURRENT_DATE THEN 'vencido' ELSE 'aberto' END,
        valor_pago_centavos     = 0,
        valor_aberto_centavos   = valor_total_centavos,
        valor_juros_centavos    = 0,
        valor_multa_centavos    = 0,
        valor_desconto_centavos = 0,
        data_pagamento          = NULL,
        updated_by              = v_uid
    WHERE id = p_conta_receber_id;
END;
$function$;

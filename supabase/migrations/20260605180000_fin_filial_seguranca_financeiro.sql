-- Isolamento por filial em movimentações, dashboard, fluxo (relatório) e validações de valor.

-- 1) filial_id em fin_movimentacoes
ALTER TABLE public.fin_movimentacoes
  ADD COLUMN IF NOT EXISTS filial_id UUID REFERENCES public.filiais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_movimentacoes_filial
  ON public.fin_movimentacoes (filial_id)
  WHERE filial_id IS NOT NULL;

COMMENT ON COLUMN public.fin_movimentacoes.filial_id IS 'Unidade (filial) da movimentação; herdado do título ou informado na operação.';

-- Backfill a partir dos títulos vinculados
UPDATE public.fin_movimentacoes m
SET filial_id = cr.filial_id
FROM public.fin_contas_receber cr
WHERE m.conta_receber_id = cr.id
  AND m.filial_id IS NULL
  AND cr.filial_id IS NOT NULL;

UPDATE public.fin_movimentacoes m
SET filial_id = cp.filial_id
FROM public.fin_contas_pagar cp
WHERE m.conta_pagar_id = cp.id
  AND m.filial_id IS NULL
  AND cp.filial_id IS NOT NULL;

-- 2) Validação de valores não negativos nos títulos
ALTER TABLE public.fin_contas_receber
  DROP CONSTRAINT IF EXISTS fin_contas_receber_valor_original_nonneg;
ALTER TABLE public.fin_contas_receber
  ADD CONSTRAINT fin_contas_receber_valor_original_nonneg
  CHECK (valor_original_centavos >= 0);

ALTER TABLE public.fin_contas_pagar
  DROP CONSTRAINT IF EXISTS fin_contas_pagar_valor_original_nonneg;
ALTER TABLE public.fin_contas_pagar
  ADD CONSTRAINT fin_contas_pagar_valor_original_nonneg
  CHECK (valor_original_centavos >= 0);

-- 3) fin_baixar_conta_receber: valor > 0 + filial_id na movimentação
CREATE OR REPLACE FUNCTION public.fin_baixar_conta_receber(
    p_conta_receber_id uuid,
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
    v_cr RECORD;
    v_baixa_id UUID;
    v_novo_status VARCHAR(20);
    v_total_devido BIGINT;
    v_conta_origem_id UUID;
    v_sessao_id UUID;
    v_uid UUID;
    v_data DATE;
    v_forma_caixa TEXT;
BEGIN
    IF p_valor_pago_centavos IS NULL OR p_valor_pago_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor pago deve ser maior que zero';
    END IF;

    v_uid  := COALESCE(p_usuario_id, auth.uid());
    v_data := COALESCE(p_data_pagamento, CURRENT_DATE);

    SELECT * INTO v_cr
      FROM fin_contas_receber
     WHERE id = p_conta_receber_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Titulo a receber % nao encontrado', p_conta_receber_id;
    END IF;
    IF v_cr.status IN ('pago','cancelado') THEN
        RAISE EXCEPTION 'Titulo com status % nao pode ser baixado', v_cr.status;
    END IF;

    INSERT INTO fin_contas_receber_baixas (
        empresa_id, conta_receber_id,
        valor_pago_centavos, valor_desconto_centavos,
        valor_juros_centavos, valor_multa_centavos,
        forma_pagamento_id, conta_bancaria_id, observacoes,
        tipo, created_by
    ) VALUES (
        v_cr.empresa_id, p_conta_receber_id,
        p_valor_pago_centavos, p_valor_desconto_centavos,
        p_valor_juros_centavos, p_valor_multa_centavos,
        p_forma_pagamento_id, p_conta_bancaria_id, p_observacoes,
        CASE
            WHEN p_valor_pago_centavos
                 >= (v_cr.valor_original_centavos - v_cr.valor_pago_centavos)
            THEN 'normal' ELSE 'parcial'
        END,
        v_uid
    ) RETURNING id INTO v_baixa_id;

    UPDATE fin_contas_receber SET
        valor_pago_centavos     = valor_pago_centavos     + p_valor_pago_centavos,
        valor_desconto_centavos = valor_desconto_centavos + p_valor_desconto_centavos,
        valor_juros_centavos    = valor_juros_centavos    + p_valor_juros_centavos,
        valor_multa_centavos    = valor_multa_centavos    + p_valor_multa_centavos,
        updated_by              = v_uid
    WHERE id = p_conta_receber_id;

    SELECT * INTO v_cr FROM fin_contas_receber WHERE id = p_conta_receber_id;

    v_total_devido := v_cr.valor_original_centavos
                    + v_cr.valor_juros_centavos
                    + v_cr.valor_multa_centavos
                    - v_cr.valor_desconto_centavos;

    IF v_cr.valor_pago_centavos >= v_total_devido THEN
        v_novo_status := 'pago';
    ELSE
        v_novo_status := 'pago_parcial';
    END IF;

    UPDATE fin_contas_receber SET
        status              = v_novo_status,
        data_pagamento      = CASE WHEN v_novo_status = 'pago' THEN v_data ELSE data_pagamento END,
        forma_pagamento_id  = COALESCE(p_forma_pagamento_id, forma_pagamento_id),
        conta_bancaria_id   = COALESCE(p_conta_bancaria_id,  conta_bancaria_id)
    WHERE id = p_conta_receber_id;

    v_conta_origem_id := COALESCE(
        p_conta_bancaria_id,
        (SELECT id FROM fin_contas_bancarias
          WHERE empresa_id = v_cr.empresa_id AND principal = true LIMIT 1)
    );

    IF v_conta_origem_id IS NOT NULL THEN
        UPDATE fin_contas_bancarias
           SET saldo_atual_centavos = saldo_atual_centavos + p_valor_pago_centavos
         WHERE id = v_conta_origem_id;
    END IF;

    INSERT INTO fin_movimentacoes (
        empresa_id, filial_id, codigo, conta_bancaria_id,
        plano_conta_id, centro_custo_id,
        tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia,
        conta_receber_id, conta_receber_baixa_id,
        created_by
    ) VALUES (
        v_cr.empresa_id, v_cr.filial_id,
        'MOV-' || to_char(now(), 'YYYYMMDD-HH24MISS-US'),
        v_conta_origem_id,
        v_cr.plano_conta_id, v_cr.centro_custo_id,
        'receita',
        'Recebimento: ' || v_cr.codigo || COALESCE(' - ' || v_cr.descricao, ''),
        p_valor_pago_centavos,
        v_data, v_cr.data_competencia,
        p_conta_receber_id, v_baixa_id,
        v_uid
    );

    v_forma_caixa := COALESCE(
        (SELECT
            CASE lower(trim(COALESCE(tipo, nome, 'dinheiro')))
                WHEN 'dinheiro' THEN 'especie'
                WHEN 'espécie' THEN 'especie'
                WHEN 'especie' THEN 'especie'
                WHEN 'pix' THEN 'pix'
                WHEN 'cartao_credito' THEN 'cartao_credito'
                WHEN 'cartao_debito' THEN 'cartao_debito'
                WHEN 'cheque' THEN 'cheque'
                ELSE lower(trim(COALESCE(tipo, nome, 'dinheiro')))
            END
         FROM fin_formas_pagamento WHERE id = p_forma_pagamento_id),
        'especie'
    );

    IF v_conta_origem_id IS NOT NULL THEN
        SELECT id INTO v_sessao_id
          FROM fin_caixa_sessoes
         WHERE conta_bancaria_id = v_conta_origem_id
           AND status = 'aberto'
         LIMIT 1;

        IF v_sessao_id IS NOT NULL THEN
            INSERT INTO fin_caixa_movimentos (
                empresa_id, sessao_id, tipo, descricao, valor_centavos,
                referencia_id, referencia_tipo, forma_pagamento,
                usuario_id, created_at
            ) VALUES (
                v_cr.empresa_id, v_sessao_id, 'entrada',
                'Recebimento ' || v_cr.codigo
                    || COALESCE(' - ' || v_cr.descricao, ''),
                p_valor_pago_centavos,
                p_conta_receber_id, 'fin_contas_receber',
                v_forma_caixa,
                v_uid,
                now()
            );
        END IF;
    END IF;

    RETURN v_baixa_id;
END;
$function$;

-- 4) fin_baixar_conta_pagar: valor > 0 + filial_id
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
    IF p_valor_pago_centavos IS NULL OR p_valor_pago_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor pago deve ser maior que zero';
    END IF;

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
        empresa_id, filial_id, codigo, conta_bancaria_id,
        plano_conta_id, centro_custo_id,
        tipo, descricao, valor_centavos,
        data_movimentacao, data_competencia,
        conta_pagar_id, conta_pagar_baixa_id,
        created_by
    ) VALUES (
        v_cp.empresa_id, v_cp.filial_id,
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

-- 5) Estornos: propagar filial_id
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
    v_filial_id UUID;
    v_status_atual TEXT;
    v_movimento RECORD;
    v_sessao_id UUID;
    v_estorno_mov_id UUID;
    v_data_vencimento DATE;
    v_uid UUID;
BEGIN
    v_uid := COALESCE(p_usuario_id, auth.uid());

    SELECT empresa_id, filial_id, status, data_vencimento
      INTO v_empresa_id, v_filial_id, v_status_atual, v_data_vencimento
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
           AND tipo IN ('despesa', 'saida_pagamento')
    LOOP
        INSERT INTO fin_movimentacoes (
            empresa_id, filial_id, conta_bancaria_id, codigo, tipo, descricao,
            valor_centavos, data_movimentacao, data_competencia,
            conta_pagar_id, created_at, observacoes, created_by
        ) VALUES (
            v_empresa_id, COALESCE(v_movimento.filial_id, v_filial_id),
            v_movimento.conta_bancaria_id,
            'EST-' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
            'estorno',
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

    DELETE FROM fin_contas_pagar_baixas WHERE conta_pagar_id = p_conta_pagar_id;

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
    v_filial_id UUID;
    v_status_atual TEXT;
    v_movimento RECORD;
    v_sessao_id UUID;
    v_estorno_mov_id UUID;
    v_data_vencimento DATE;
    v_uid UUID;
BEGIN
    v_uid := COALESCE(p_usuario_id, auth.uid());

    SELECT empresa_id, filial_id, status, data_vencimento
      INTO v_empresa_id, v_filial_id, v_status_atual, v_data_vencimento
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
           AND tipo IN ('receita', 'estorno_recebimento')
           AND valor_centavos > 0
    LOOP
        INSERT INTO fin_movimentacoes (
            empresa_id, filial_id, conta_bancaria_id, codigo, tipo, descricao,
            valor_centavos, data_movimentacao, data_competencia,
            conta_receber_id, created_at, observacoes, created_by
        ) VALUES (
            v_empresa_id, COALESCE(v_movimento.filial_id, v_filial_id),
            v_movimento.conta_bancaria_id,
            'EST-' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
            'estorno',
            'Estorno de Recebimento: ' || v_movimento.descricao || ' - Motivo: ' || p_motivo,
            ABS(v_movimento.valor_centavos),
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

    DELETE FROM fin_contas_receber_baixas WHERE conta_receber_id = p_conta_receber_id;

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

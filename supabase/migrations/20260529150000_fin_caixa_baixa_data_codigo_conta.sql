-- Caixa: movimento na sessão do dia do pagamento; código de conta único por empresa.

CREATE OR REPLACE FUNCTION public.fn_proximo_codigo_conta_bancaria(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int := 0;
  v_codigo text;
BEGIN
  SELECT coalesce(max(
    CASE
      WHEN codigo ~ '^CB-[0-9]+$' THEN substring(codigo from 4)::int
      ELSE 0
    END
  ), 0)
  INTO v_max
  FROM public.fin_contas_bancarias
  WHERE empresa_id = p_empresa_id;

  v_codigo := 'CB-' || lpad((v_max + 1)::text, 4, '0');
  RETURN v_codigo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_proximo_codigo_conta_bancaria(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_proximo_codigo_conta_bancaria(uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fin_contas_bancarias_empresa_codigo_key'
  ) THEN
    ALTER TABLE public.fin_contas_bancarias
      ADD CONSTRAINT fin_contas_bancarias_empresa_codigo_key UNIQUE (empresa_id, codigo);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Não foi possível criar UNIQUE(empresa_id, codigo): existem duplicatas na mesma empresa.';
END;
$$;

-- fin_baixar_conta_receber: caixa do dia do pagamento
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
           AND (data_abertura::date = v_data)
         ORDER BY data_abertura DESC
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

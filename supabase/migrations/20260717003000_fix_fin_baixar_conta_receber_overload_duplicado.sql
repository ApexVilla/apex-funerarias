-- BUGFIX CRÍTICO: fin_baixar_conta_receber tinha duas versões (overloads) coexistindo no banco:
--
--   1) public.fin_baixar_conta_receber(uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid)
--      — 10 parâmetros, sem suporte a PIX. Foi a versão mantida/evoluída em todas as migrations
--      seguintes (20260530160000, 20260531150000, 20260605180000, 20260605180300, 20260701140000,
--      20260705120000, 20260705140000), recebendo: SECURITY DEFINER hardening, isolamento por
--      filial, sincronização de sessão de caixa por data da baixa (não só "sessão aberta hoje") e
--      separação correta de saldo físico (espécie) vs PIX/cartão/cheque.
--
--   2) public.fin_baixar_conta_receber(uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date,
--      uuid, boolean, text) — 12 parâmetros (criada em 20260522180000, com p_pix_mesmo_pagador e
--      p_pix_nome_pagador). NUNCA foi removida pelas migrations seguintes (nenhuma fazia
--      DROP FUNCTION dela), então ficou "congelada" com a lógica de maio/2026.
--
-- O frontend (lib/FinanceiroStore.tsx -> baixarContaReceber) SEMPRE envia
-- p_pix_mesmo_pagador/p_pix_nome_pagador nomeados (mesmo que null). Como a versão de 10 parâmetros
-- não tem esses nomes, o PostgREST/Postgres só consegue casar a chamada com a versão de 12
-- parâmetros — ou seja: TODA baixa de conta a receber feita pela tela normal (Contas a Receber /
-- Cobrança) estava caindo na versão ANTIGA, sem nenhuma das correções de filial/caixa/saldo físico
-- feitas nos dois meses seguintes. (A importação de OFX, que não envia os parâmetros de PIX, casava
-- corretamente com a versão de 10 parâmetros — por isso o sintoma não era óbvio em todos os fluxos.)
--
-- Esta migration unifica em UMA única função (12 parâmetros, com suporte a PIX) usando a lógica mais
-- recente (20260705140000) como base, e remove a versão antiga para eliminar a ambiguidade de vez.

DROP FUNCTION IF EXISTS public.fin_baixar_conta_receber(
    uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid, boolean, text
);
DROP FUNCTION IF EXISTS public.fin_baixar_conta_receber(
    uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid
);

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
    p_usuario_id uuid DEFAULT NULL,
    p_pix_mesmo_pagador boolean DEFAULT NULL,
    p_pix_nome_pagador text DEFAULT NULL
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
    v_conta_saldo_id UUID;
    v_sessao_id UUID;
    v_uid UUID;
    v_data DATE;
    v_forma_tipo TEXT;
    v_forma_caixa TEXT;
    v_eh_pix BOOLEAN := false;
    v_obs text;
    v_conta_principal UUID;
    v_caixa_operador UUID;
BEGIN
    IF p_valor_pago_centavos IS NULL OR p_valor_pago_centavos <= 0 THEN
        RAISE EXCEPTION 'Valor pago deve ser maior que zero';
    END IF;

    v_uid  := COALESCE(p_usuario_id, auth.uid());
    v_data := COALESCE(p_data_pagamento, CURRENT_DATE);

    SELECT lower(trim(COALESCE(fp.tipo, fp.nome, ''))) INTO v_forma_tipo
      FROM fin_formas_pagamento fp
     WHERE fp.id = p_forma_pagamento_id;

    -- Forma canônica usada para classificar o lançamento no caixa físico (mesma tabela de mapeamento
    -- usada em fin_sync_baixas_caixa_sessao) e para detectar PIX independente do texto cadastrado.
    v_forma_caixa := COALESCE(
        (SELECT
            CASE lower(trim(COALESCE(fp.tipo, fp.nome, 'dinheiro')))
                WHEN 'dinheiro' THEN 'especie'
                WHEN 'espécie' THEN 'especie'
                WHEN 'especie' THEN 'especie'
                WHEN 'pix' THEN 'pix'
                WHEN 'cartao_credito' THEN 'cartao_credito'
                WHEN 'cartao_debito' THEN 'cartao_debito'
                WHEN 'cheque' THEN 'cheque'
                ELSE lower(trim(COALESCE(fp.tipo, fp.nome, 'dinheiro')))
            END
         FROM fin_formas_pagamento fp
         WHERE fp.id = p_forma_pagamento_id),
        'especie'
    );
    v_eh_pix := (v_forma_caixa = 'pix');

    IF v_eh_pix AND COALESCE(p_pix_mesmo_pagador, true) = false
       AND COALESCE(trim(p_pix_nome_pagador), '') = '' THEN
        RAISE EXCEPTION 'Informe o nome do pagador conforme aparece no comprovante PIX';
    END IF;

    v_obs := p_observacoes;
    IF v_eh_pix AND COALESCE(p_pix_mesmo_pagador, true) = false
       AND COALESCE(trim(p_pix_nome_pagador), '') <> '' THEN
        v_obs := trim(COALESCE(v_obs, '') || CASE WHEN v_obs IS NOT NULL AND trim(v_obs) <> '' THEN ' | ' ELSE '' END
            || 'PIX pagador: ' || trim(p_pix_nome_pagador));
    END IF;

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

    SELECT id INTO v_conta_principal
      FROM fin_contas_bancarias
     WHERE empresa_id = v_cr.empresa_id AND principal = true AND ativo = true
     ORDER BY created_at
     LIMIT 1;

    SELECT cb.id INTO v_caixa_operador
      FROM fin_contas_bancarias cb
     WHERE cb.empresa_id = v_cr.empresa_id
       AND lower(COALESCE(cb.tipo, '')) = 'caixa'
       AND cb.ativo = true
       AND (
           v_uid IS NULL
           OR cardinality(COALESCE(cb.autorizados_operacao, ARRAY[]::uuid[])) = 0
           OR v_uid = ANY(cb.autorizados_operacao)
       )
     ORDER BY
       CASE WHEN v_uid IS NOT NULL AND cb.autorizados_operacao @> ARRAY[v_uid] THEN 0 ELSE 1 END,
       cb.created_at
     LIMIT 1;

    IF v_forma_tipo IN ('dinheiro', 'especie', 'espécie') THEN
        v_conta_saldo_id := COALESCE(p_conta_bancaria_id, v_caixa_operador, v_conta_principal);
    ELSE
        v_conta_saldo_id := COALESCE(v_conta_principal, p_conta_bancaria_id);
    END IF;

    INSERT INTO fin_contas_receber_baixas (
        empresa_id, conta_receber_id,
        valor_pago_centavos, valor_desconto_centavos,
        valor_juros_centavos, valor_multa_centavos,
        forma_pagamento_id, conta_bancaria_id, observacoes,
        tipo, created_by, data_baixa,
        pix_mesmo_pagador, pix_nome_pagador
    ) VALUES (
        v_cr.empresa_id, p_conta_receber_id,
        p_valor_pago_centavos, p_valor_desconto_centavos,
        p_valor_juros_centavos, p_valor_multa_centavos,
        p_forma_pagamento_id, v_conta_saldo_id, v_obs,
        CASE
            WHEN p_valor_pago_centavos
                 >= (v_cr.valor_original_centavos - v_cr.valor_pago_centavos)
            THEN 'normal' ELSE 'parcial'
        END,
        v_uid,
        v_data,
        CASE WHEN v_eh_pix THEN COALESCE(p_pix_mesmo_pagador, true) ELSE NULL END,
        CASE WHEN v_eh_pix AND COALESCE(p_pix_mesmo_pagador, true) = false
             THEN trim(p_pix_nome_pagador) ELSE NULL END
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
        conta_bancaria_id   = COALESCE(v_conta_saldo_id, conta_bancaria_id)
    WHERE id = p_conta_receber_id;

    IF v_conta_saldo_id IS NOT NULL THEN
        UPDATE fin_contas_bancarias
           SET saldo_atual_centavos = saldo_atual_centavos + p_valor_pago_centavos
         WHERE id = v_conta_saldo_id;
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
        v_conta_saldo_id,
        v_cr.plano_conta_id, v_cr.centro_custo_id,
        'receita',
        'Recebimento: ' || v_cr.codigo || COALESCE(' - ' || v_cr.descricao, ''),
        p_valor_pago_centavos,
        v_data, v_cr.data_competencia,
        p_conta_receber_id, v_baixa_id,
        v_uid
    );

    IF v_caixa_operador IS NOT NULL AND v_uid IS NOT NULL THEN
        SELECT s.id INTO v_sessao_id
          FROM fin_caixa_sessoes s
         WHERE s.conta_bancaria_id = v_caixa_operador
           AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = v_data
           AND (s.status = 'aberto' OR s.status = 'fechado')
         ORDER BY
           CASE WHEN s.status = 'aberto' THEN 0 ELSE 1 END,
           s.data_abertura DESC
         LIMIT 1;

        IF v_sessao_id IS NOT NULL THEN
            PERFORM public.fin_sync_baixas_caixa_sessao(v_sessao_id);
        END IF;
    END IF;

    RETURN v_baixa_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_baixar_conta_receber(
    uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid, boolean, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Paridade com fin_baixar_conta_receber (corrigida em 20260717003000): fin_baixar_conta_pagar
-- ainda usava a lógica antiga — lançava a saída no caixa só se houvesse uma sessão com
-- status = 'aberto' no momento da baixa, sem olhar a DATA do pagamento. Isso tinha dois efeitos:
--
--   1) Pagamento com data retroativa (ex.: pago hoje mas com data_pagamento de ontem) entrava na
--      sessão de HOJE em vez da sessão do dia correto — distorce o saldo físico dos dois dias.
--   2) Se não houvesse nenhuma sessão aberta no momento da baixa (caixa do dia ainda não tinha sido
--      aberto), a saída nunca era lançada em fin_caixa_movimentos — ao abrir o caixa depois, a
--      despesa "desaparecia" da Tesouraria (diferente de Contas a Receber, que já tinha
--      fin_sync_baixas_caixa_sessao para recuperar esses casos).
--
-- Esta migration cria o equivalente para despesas (fin_sync_baixas_caixa_pagar_sessao) e atualiza
-- fin_baixar_conta_pagar para casar a sessão pela data da baixa + sincronizar/recuperar pendências,
-- no mesmo padrão já usado para recebimentos.

ALTER TABLE public.fin_contas_pagar_baixas
  ADD COLUMN IF NOT EXISTS data_baixa date,
  ADD COLUMN IF NOT EXISTS estornada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fin_contas_pagar_baixas.data_baixa IS
  'Data em que o pagamento foi registrado (baixa). Usada para encaixar o lançamento na sessão de caixa do dia correto.';

UPDATE public.fin_contas_pagar_baixas
   SET data_baixa = (created_at AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE data_baixa IS NULL;

CREATE OR REPLACE FUNCTION public.fin_sync_baixas_caixa_pagar_sessao(p_sessao_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_sess RECORD;
    v_dia date;
    v_inserted integer := 0;
BEGIN
    SELECT s.*, cb.tipo AS conta_tipo, cb.autorizados_operacao
      INTO v_sess
      FROM fin_caixa_sessoes s
      JOIN fin_contas_bancarias cb ON cb.id = s.conta_bancaria_id
     WHERE s.id = p_sessao_id;

    IF NOT FOUND OR v_sess.conta_tipo IS DISTINCT FROM 'caixa' THEN
        RETURN 0;
    END IF;

    v_dia := (v_sess.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date;

    WITH novos AS (
        INSERT INTO fin_caixa_movimentos (
            empresa_id, sessao_id, tipo, descricao, valor_centavos,
            referencia_id, referencia_tipo, forma_pagamento,
            usuario_id, data_movimentacao, created_at
        )
        SELECT
            b.empresa_id,
            p_sessao_id,
            'saida',
            'Pagamento ' || cp.codigo || COALESCE(' - ' || cp.descricao, ''),
            b.valor_pago_centavos,
            b.conta_pagar_id,
            'fin_contas_pagar',
            COALESCE(
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
                 WHERE fp.id = b.forma_pagamento_id),
                'especie'
            ),
            b.created_by,
            COALESCE(b.data_baixa, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date),
            b.created_at
        FROM fin_contas_pagar_baixas b
        JOIN fin_contas_pagar cp ON cp.id = b.conta_pagar_id
        WHERE COALESCE(b.estornada, false) = false
          AND COALESCE(b.data_baixa, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date) = v_dia
          AND (
              b.conta_bancaria_id = v_sess.conta_bancaria_id
              OR (
                  b.created_by IS NOT NULL
                  AND EXISTS (
                      SELECT 1
                        FROM fin_contas_bancarias cb_b
                       WHERE cb_b.id = b.conta_bancaria_id
                         AND lower(COALESCE(cb_b.tipo, '')) IS DISTINCT FROM 'caixa'
                  )
                  AND (
                      cardinality(COALESCE(v_sess.autorizados_operacao, ARRAY[]::uuid[])) = 0
                      OR b.created_by = ANY(v_sess.autorizados_operacao)
                  )
              )
          )
          AND NOT EXISTS (
              SELECT 1
                FROM fin_caixa_movimentos m
               WHERE m.referencia_tipo = 'fin_contas_pagar'
                 AND m.referencia_id = b.conta_pagar_id
                 AND m.valor_centavos = b.valor_pago_centavos
                 AND m.sessao_id = p_sessao_id
          )
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_inserted FROM novos;

    IF v_inserted > 0 AND v_sess.status = 'aberto' THEN
        UPDATE fin_caixa_sessoes s
           SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(p_sessao_id)
         WHERE s.id = p_sessao_id;
    END IF;

    RETURN v_inserted;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_sync_baixas_caixa_pagar_sessao(uuid) TO authenticated;

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
    v_forma_tipo TEXT;
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

    SELECT id INTO v_conta_principal
      FROM fin_contas_bancarias
     WHERE empresa_id = v_cp.empresa_id AND principal = true AND ativo = true
     ORDER BY created_at
     LIMIT 1;

    SELECT cb.id INTO v_caixa_operador
      FROM fin_contas_bancarias cb
     WHERE cb.empresa_id = v_cp.empresa_id
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
        v_conta_destino_id := COALESCE(p_conta_bancaria_id, v_caixa_operador, v_conta_principal);
    ELSE
        v_conta_destino_id := COALESCE(v_conta_principal, p_conta_bancaria_id);
    END IF;

    INSERT INTO fin_contas_pagar_baixas (
        empresa_id, conta_pagar_id,
        valor_pago_centavos, valor_desconto_centavos,
        valor_juros_centavos, valor_multa_centavos,
        forma_pagamento_id, conta_bancaria_id, observacoes,
        tipo, created_by, data_baixa
    ) VALUES (
        v_cp.empresa_id, p_conta_pagar_id,
        p_valor_pago_centavos, p_valor_desconto_centavos,
        p_valor_juros_centavos, p_valor_multa_centavos,
        p_forma_pagamento_id, v_conta_destino_id, p_observacoes,
        CASE
            WHEN p_valor_pago_centavos
                 >= (v_cp.valor_original_centavos - v_cp.valor_pago_centavos)
            THEN 'normal' ELSE 'parcial'
        END,
        v_uid,
        v_data
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
        conta_bancaria_id   = COALESCE(v_conta_destino_id, conta_bancaria_id)
    WHERE id = p_conta_pagar_id;

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
            PERFORM public.fin_sync_baixas_caixa_pagar_sessao(v_sessao_id);
        END IF;
    END IF;

    RETURN v_baixa_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_baixar_conta_pagar(
    uuid, bigint, uuid, uuid, bigint, bigint, bigint, text, date, uuid
) TO authenticated;

-- Backfill: recupera saídas de caixa que ficaram sem lançamento físico (sessões abertas e dos
-- últimos 7 dias em contas tipo caixa) — mesmo princípio do backfill feito para recebimentos em
-- 20260701140000.
DO $backfill$
DECLARE
    r RECORD;
    n integer;
    total integer := 0;
BEGIN
    FOR r IN
        SELECT s.id
          FROM fin_caixa_sessoes s
          JOIN fin_contas_bancarias cb ON cb.id = s.conta_bancaria_id
         WHERE cb.tipo = 'caixa'
           AND (
               s.status = 'aberto'
               OR (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date
                  >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 7
           )
    LOOP
        n := public.fin_sync_baixas_caixa_pagar_sessao(r.id);
        total := total + COALESCE(n, 0);
    END LOOP;
    RAISE NOTICE 'fin_sync_baixas_caixa_pagar backfill: % movimento(s)', total;
END;
$backfill$;

-- Recalcula saldo físico das sessões abertas (já considerando as saídas recém-sincronizadas)
UPDATE fin_caixa_sessoes s
   SET saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(s.id)
 WHERE s.status = 'aberto';

NOTIFY pgrst, 'reload schema';

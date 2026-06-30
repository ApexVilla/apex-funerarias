-- Corrige carteira: remove placeholders duplicados e exige título em aberto na sincronização.

CREATE OR REPLACE FUNCTION public.fn_cob_carteira_upsert_pendencias_de_titulos(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n int := 0;
  n2 int := 0;
BEGIN
  INSERT INTO public.cob_cobrancas_pendentes (
    empresa_id,
    conta_receber_id,
    cliente_id,
    valor_centavos,
    data_vencimento,
    dias_atraso,
    status,
    prioridade,
    tentativas,
    updated_at
  )
  SELECT
    fr.empresa_id,
    fr.id,
    fr.cliente_id,
    fr.valor_aberto_centavos,
    fr.data_vencimento::date,
    GREATEST(0, (CURRENT_DATE - fr.data_vencimento::date))::integer,
    'pendente',
    'media',
    0,
    now()
  FROM public.fin_contas_receber fr
  WHERE fr.empresa_id = p_empresa_id
    AND fr.deleted_at IS NULL
    AND fr.cliente_id IS NOT NULL
    AND fr.valor_aberto_centavos > 0
    AND fr.status NOT IN ('pago', 'cancelado')
  ON CONFLICT (empresa_id, conta_receber_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;

  -- Remove placeholder sem título quando já existe pendência vinculada ao mesmo vencimento.
  DELETE FROM public.cob_cobrancas_pendentes cp_ph
  WHERE cp_ph.empresa_id = p_empresa_id
    AND cp_ph.conta_receber_id IS NULL
    AND cp_ph.status IN ('pendente', 'em_andamento', 'promessa')
    AND EXISTS (
      SELECT 1
        FROM public.cob_cobrancas_pendentes cp_t
       WHERE cp_t.empresa_id = cp_ph.empresa_id
         AND cp_t.cliente_id = cp_ph.cliente_id
         AND cp_t.conta_receber_id IS NOT NULL
         AND cp_t.data_vencimento = cp_ph.data_vencimento
         AND cp_t.status IN ('pendente', 'em_andamento', 'promessa')
    );

  -- Contrato ativo: só placeholder se não houver título em aberto nem pendência operacional.
  INSERT INTO public.cob_cobrancas_pendentes (
    empresa_id,
    conta_receber_id,
    cliente_id,
    valor_centavos,
    data_vencimento,
    dias_atraso,
    status,
    prioridade,
    tentativas,
    observacao,
    updated_at
  )
  SELECT
    a.empresa_id,
    NULL,
    a.cliente_id,
    coalesce(a.valor_mensal_centavos, 0),
    coalesce(a.data_primeiro_vencimento, a.data_contratacao, CURRENT_DATE)::date,
    0,
    'pendente',
    'media',
    0,
    'Contrato ' || coalesce(a.codigo, a.id::text),
    now()
  FROM public.assinaturas a
  WHERE a.empresa_id = p_empresa_id
    AND a.deleted_at IS NULL
    AND a.status = 'ativo'
    AND a.cliente_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_contas_receber fr
      WHERE fr.empresa_id = a.empresa_id
        AND fr.cliente_id = a.cliente_id
        AND fr.deleted_at IS NULL
        AND fr.valor_aberto_centavos > 0
        AND fr.status NOT IN ('pago', 'cancelado')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.cob_cobrancas_pendentes cp
      WHERE cp.empresa_id = a.empresa_id
        AND cp.cliente_id = a.cliente_id
        AND cp.status IN ('pendente', 'em_andamento', 'promessa')
    );

  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n + n2;
END;
$$;

COMMENT ON FUNCTION public.fn_cob_carteira_upsert_pendencias_de_titulos(uuid) IS
  'Sincroniza cob_cobrancas_pendentes com títulos em aberto; remove placeholders duplicados.';

-- Reparo: recebimento de campo de hoje sem baixa financeira (Joana / Caixa Samir).
DO $$
DECLARE
  v_rec record;
  v_titulo uuid;
  v_forma uuid;
  v_baixa uuid;
BEGIN
  FOR v_rec IN
    SELECT r.id, r.empresa_id, r.cliente_id, r.valor_centavos, r.data, r.cobranca_pendente_id
      FROM public.cob_recebimentos_campo r
     WHERE r.conta_receber_id IS NULL
       AND r.data >= CURRENT_DATE - 7
  LOOP
    SELECT fr.id INTO v_titulo
      FROM public.fin_contas_receber fr
     WHERE fr.empresa_id = v_rec.empresa_id
       AND fr.cliente_id = v_rec.cliente_id
       AND fr.deleted_at IS NULL
       AND fr.valor_aberto_centavos > 0
       AND fr.status NOT IN ('pago', 'cancelado')
     ORDER BY fr.data_vencimento, fr.parcela_numero NULLS LAST
     LIMIT 1;

    IF v_titulo IS NULL THEN
      CONTINUE;
    END IF;

    SELECT fp.id INTO v_forma
      FROM public.fin_formas_pagamento fp
     WHERE fp.empresa_id = v_rec.empresa_id
       AND fp.ativo = true
       AND lower(coalesce(fp.tipo, '')) IN ('dinheiro', 'especie')
     LIMIT 1;

    IF v_forma IS NULL THEN
      SELECT fp.id INTO v_forma
        FROM public.fin_formas_pagamento fp
       WHERE fp.empresa_id = v_rec.empresa_id AND fp.ativo = true
       LIMIT 1;
    END IF;

    v_baixa := public.fin_baixar_conta_receber(
      v_titulo,
      v_rec.valor_centavos,
      v_forma,
      COALESCE(
        (
          SELECT ccb.conta_bancaria_id
            FROM public.cobrador_contas_bancarias ccb
            JOIN public.cob_recebimentos_campo rc ON rc.cobrador_id = ccb.cobrador_id
           WHERE rc.id = v_rec.id
           ORDER BY ccb.principal DESC
           LIMIT 1
        ),
        (
          SELECT cb.id
            FROM public.fin_contas_bancarias cb
           WHERE cb.empresa_id = v_rec.empresa_id
             AND cb.ativo = true
             AND cb.principal = true
           LIMIT 1
        )
      ),
      0, 0, 0,
      'Reparo automático — recebimento em campo sem título vinculado',
      v_rec.data::date,
      NULL
    );

    UPDATE public.cob_recebimentos_campo
       SET conta_receber_id = v_titulo,
           updated_at = now()
     WHERE id = v_rec.id;

    UPDATE public.cob_cobrancas_pendentes
       SET status = 'cobrado', updated_at = now()
     WHERE empresa_id = v_rec.empresa_id
       AND conta_receber_id = v_titulo
       AND status <> 'cobrado';
  END LOOP;
END;
$$;

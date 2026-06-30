-- Mantém ser_produtos.estoque_atual alinhado à soma dos saldos por depósito após confirmar entrada/saída.

CREATE OR REPLACE FUNCTION public.fn_sync_estoque_atual_produto(p_produto_id uuid)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(quantidade), 0)::numeric(12,3)
  FROM public.estoque_saldo_deposito
  WHERE produto_id = p_produto_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_confirmar_entrada_estoque(p_entrada_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entrada RECORD;
    v_item RECORD;
    v_estoque_anterior numeric(12,3);
    v_estoque_posterior numeric(12,3);
    v_valor_custo_atual INTEGER;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    SELECT * INTO v_entrada
    FROM public.estoque_entradas
    WHERE id = p_entrada_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Entrada não encontrada: %', p_entrada_id;
    END IF;

    IF v_entrada.status <> 'confirmada' THEN
        RAISE EXCEPTION 'Somente entradas com status confirmada podem ser processadas.';
    END IF;

    IF v_entrada.processado_em IS NOT NULL THEN
        RAISE EXCEPTION 'Entrada já foi processada em %', v_entrada.processado_em;
    END IF;

    IF v_entrada.deposito_id IS NULL THEN
        RAISE EXCEPTION 'Depósito não selecionado na entrada. Informe o destino do estoque.';
    END IF;

    FOR v_item IN
        SELECT ei.produto_id, ei.quantidade, ei.valor_unitario_centavos
        FROM public.estoque_entrada_itens ei
        WHERE ei.entrada_id = p_entrada_id
    LOOP
        SELECT COALESCE(p.valor_custo_centavos, 0)
        INTO v_valor_custo_atual
        FROM public.ser_produtos p
        WHERE p.id = v_item.produto_id
        FOR UPDATE;

        v_estoque_anterior := public.fn_sync_estoque_atual_produto(v_item.produto_id);

        INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
        VALUES (v_entrada.empresa_id, v_item.produto_id, v_entrada.deposito_id, v_item.quantidade)
        ON CONFLICT (produto_id, deposito_id) DO UPDATE
        SET quantidade = public.estoque_saldo_deposito.quantidade + EXCLUDED.quantidade,
            updated_at = NOW();

        v_estoque_posterior := public.fn_sync_estoque_atual_produto(v_item.produto_id);

        UPDATE public.ser_produtos
        SET estoque_atual = v_estoque_posterior,
            ultima_entrada_em = NOW(),
            ultima_entrada_valor_centavos = v_item.valor_unitario_centavos,
            valor_custo_centavos = CASE
                WHEN v_item.valor_unitario_centavos > v_valor_custo_atual THEN v_item.valor_unitario_centavos
                ELSE v_valor_custo_atual
            END,
            updated_at = NOW()
        WHERE id = v_item.produto_id;

        INSERT INTO public.estoque_movimentacoes (
            empresa_id, produto_id, tipo, quantidade,
            estoque_anterior, estoque_posterior,
            motivo, referencia_tipo, referencia_id, usuario_id,
            deposito_destino_id
        ) VALUES (
            v_entrada.empresa_id,
            v_item.produto_id,
            'entrada',
            v_item.quantidade,
            v_estoque_anterior,
            v_estoque_posterior,
            'Entrada de estoque confirmada - Doc: ' || v_entrada.numero_documento,
            'entrada',
            p_entrada_id,
            v_user_id,
            v_entrada.deposito_id
        );
    END LOOP;

    UPDATE public.estoque_entradas
    SET processado_em = NOW(),
        updated_at = NOW()
    WHERE id = p_entrada_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_confirmar_saida_estoque(p_saida_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saida RECORD;
  v_item RECORD;
  v_saldo_atual numeric(12,3);
  v_estoque_anterior numeric(12,3);
  v_estoque_posterior numeric(12,3);
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_saida
  FROM public.estoque_saidas
  WHERE id = p_saida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saída não encontrada: %', p_saida_id;
  END IF;

  IF v_saida.status = 'cancelada' THEN
    RAISE EXCEPTION 'Saída cancelada não pode ser confirmada';
  END IF;

  IF v_saida.status = 'confirmada' AND v_saida.processado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Saída já confirmada em %', v_saida.processado_em;
  END IF;

  IF v_saida.deposito_id IS NULL THEN
    SELECT id INTO v_saida.deposito_id
    FROM public.estoque_depositos
    WHERE empresa_id = v_saida.empresa_id
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_saida.deposito_id IS NULL THEN
      RAISE EXCEPTION 'Nenhum depósito cadastrado para a empresa.';
    END IF;

    UPDATE public.estoque_saidas
    SET deposito_id = v_saida.deposito_id
    WHERE id = p_saida_id;
  END IF;

  FOR v_item IN
    SELECT si.produto_id, si.quantidade
    FROM public.estoque_saida_itens si
    WHERE si.saida_id = p_saida_id
  LOOP
    v_estoque_anterior := public.fn_sync_estoque_atual_produto(v_item.produto_id);

    INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
    VALUES (v_saida.empresa_id, v_item.produto_id, v_saida.deposito_id, 0)
    ON CONFLICT (produto_id, deposito_id) DO NOTHING;

    SELECT COALESCE(quantidade, 0) INTO v_saldo_atual
    FROM public.estoque_saldo_deposito
    WHERE produto_id = v_item.produto_id
      AND deposito_id = v_saida.deposito_id
    FOR UPDATE;

    IF v_saldo_atual < v_item.quantidade THEN
      RAISE EXCEPTION 'Estoque insuficiente no depósito selecionado para o produto % (disponível: %, solicitado: %)',
        v_item.produto_id, v_saldo_atual, v_item.quantidade;
    END IF;

    UPDATE public.estoque_saldo_deposito
    SET quantidade = v_saldo_atual - v_item.quantidade,
        updated_at = now()
    WHERE produto_id = v_item.produto_id
      AND deposito_id = v_saida.deposito_id;

    v_estoque_posterior := public.fn_sync_estoque_atual_produto(v_item.produto_id);

    UPDATE public.ser_produtos
    SET estoque_atual = v_estoque_posterior,
        updated_at = now()
    WHERE id = v_item.produto_id;

    INSERT INTO public.estoque_movimentacoes (
      empresa_id, produto_id, tipo, quantidade,
      estoque_anterior, estoque_posterior,
      motivo, referencia_tipo, referencia_id, usuario_id,
      deposito_origem_id
    ) VALUES (
      v_saida.empresa_id,
      v_item.produto_id,
      'saida',
      v_item.quantidade,
      v_estoque_anterior,
      v_estoque_posterior,
      'Saída de estoque confirmada - ' || v_saida.numero_saida,
      'saida',
      p_saida_id,
      v_user_id,
      v_saida.deposito_id
    );
  END LOOP;

  UPDATE public.estoque_saidas
  SET status = 'confirmada',
      processado_em = now(),
      updated_at = now()
  WHERE id = p_saida_id;
END;
$$;

-- Reconcilia estoque global com saldos por depósito (dados legados)
UPDATE public.ser_produtos p
SET estoque_atual = sub.total,
    updated_at = now()
FROM (
  SELECT produto_id, COALESCE(SUM(quantidade), 0) AS total
  FROM public.estoque_saldo_deposito
  GROUP BY produto_id
) sub
WHERE p.id = sub.produto_id;

NOTIFY pgrst, 'reload schema';

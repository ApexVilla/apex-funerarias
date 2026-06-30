-- Saída de estoque: linhas de kit (baixa dos produtos do kit na confirmação)

ALTER TABLE public.estoque_saida_itens
  ALTER COLUMN produto_id DROP NOT NULL;

ALTER TABLE public.estoque_saida_itens
  ADD COLUMN IF NOT EXISTS kit_id uuid REFERENCES public.estoque_kits(id) ON DELETE RESTRICT;

ALTER TABLE public.estoque_saida_itens
  DROP CONSTRAINT IF EXISTS estoque_saida_itens_produto_ou_kit;

ALTER TABLE public.estoque_saida_itens
  ADD CONSTRAINT estoque_saida_itens_produto_ou_kit CHECK (
    (produto_id IS NOT NULL AND kit_id IS NULL)
    OR (produto_id IS NULL AND kit_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_estoque_saida_itens_kit ON public.estoque_saida_itens (kit_id);

CREATE OR REPLACE FUNCTION public.fn_confirmar_saida_estoque(p_saida_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saida RECORD;
  v_item RECORD;
  v_kit_item RECORD;
  v_produto_id uuid;
  v_qtd_baixa numeric(12,3);
  v_saldo_atual numeric(12,3);
  v_estoque_atual numeric(12,3);
  v_user_id uuid;
  v_kit_nome text;
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
    SELECT si.produto_id, si.kit_id, si.quantidade
    FROM public.estoque_saida_itens si
    WHERE si.saida_id = p_saida_id
  LOOP
    IF v_item.kit_id IS NOT NULL THEN
      SELECT nome INTO v_kit_nome FROM public.estoque_kits WHERE id = v_item.kit_id;

      IF NOT EXISTS (
        SELECT 1 FROM public.estoque_kit_itens ki WHERE ki.kit_id = v_item.kit_id
      ) THEN
        RAISE EXCEPTION 'Kit % não possui itens cadastrados', COALESCE(v_kit_nome, v_item.kit_id::text);
      END IF;

      FOR v_kit_item IN
        SELECT ki.produto_id, ki.quantidade AS qtd_por_kit
        FROM public.estoque_kit_itens ki
        WHERE ki.kit_id = v_item.kit_id
      LOOP
        v_produto_id := v_kit_item.produto_id;
        v_qtd_baixa := v_item.quantidade * v_kit_item.qtd_por_kit;

        INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
        VALUES (v_saida.empresa_id, v_produto_id, v_saida.deposito_id, 0)
        ON CONFLICT (produto_id, deposito_id) DO NOTHING;

        SELECT COALESCE(quantidade, 0) INTO v_saldo_atual
        FROM public.estoque_saldo_deposito
        WHERE produto_id = v_produto_id
          AND deposito_id = v_saida.deposito_id
        FOR UPDATE;

        IF v_saldo_atual < v_qtd_baixa THEN
          RAISE EXCEPTION 'Estoque insuficiente no depósito para o kit % (produto %, disponível: %, necessário: %)',
            COALESCE(v_kit_nome, v_item.kit_id::text), v_produto_id, v_saldo_atual, v_qtd_baixa;
        END IF;

        UPDATE public.estoque_saldo_deposito
        SET quantidade = v_saldo_atual - v_qtd_baixa,
            updated_at = now()
        WHERE produto_id = v_produto_id
          AND deposito_id = v_saida.deposito_id;

        SELECT COALESCE(estoque_atual, 0) INTO v_estoque_atual
        FROM public.ser_produtos
        WHERE id = v_produto_id;

        INSERT INTO public.estoque_movimentacoes (
          empresa_id, produto_id, tipo, quantidade,
          estoque_anterior, estoque_posterior,
          motivo, referencia_tipo, referencia_id, usuario_id
        ) VALUES (
          v_saida.empresa_id,
          v_produto_id,
          'saida',
          v_qtd_baixa,
          v_estoque_atual,
          v_estoque_atual - v_qtd_baixa,
          'Saída kit ' || COALESCE(v_kit_nome, '') || ' - ' || v_saida.numero_saida,
          'kit',
          p_saida_id,
          v_user_id
        );
      END LOOP;
    ELSE
      v_produto_id := v_item.produto_id;
      v_qtd_baixa := v_item.quantidade;

      INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
      VALUES (v_saida.empresa_id, v_produto_id, v_saida.deposito_id, 0)
      ON CONFLICT (produto_id, deposito_id) DO NOTHING;

      SELECT COALESCE(quantidade, 0) INTO v_saldo_atual
      FROM public.estoque_saldo_deposito
      WHERE produto_id = v_produto_id
        AND deposito_id = v_saida.deposito_id
      FOR UPDATE;

      IF v_saldo_atual < v_qtd_baixa THEN
        RAISE EXCEPTION 'Estoque insuficiente no depósito selecionado para o produto % (disponível: %, solicitado: %)',
          v_produto_id, v_saldo_atual, v_qtd_baixa;
      END IF;

      UPDATE public.estoque_saldo_deposito
      SET quantidade = v_saldo_atual - v_qtd_baixa,
          updated_at = now()
      WHERE produto_id = v_produto_id
        AND deposito_id = v_saida.deposito_id;

      SELECT COALESCE(estoque_atual, 0) INTO v_estoque_atual
      FROM public.ser_produtos
      WHERE id = v_produto_id;

      INSERT INTO public.estoque_movimentacoes (
        empresa_id, produto_id, tipo, quantidade,
        estoque_anterior, estoque_posterior,
        motivo, referencia_tipo, referencia_id, usuario_id
      ) VALUES (
        v_saida.empresa_id,
        v_produto_id,
        'saida',
        v_qtd_baixa,
        v_estoque_atual,
        v_estoque_atual - v_qtd_baixa,
        'Saída de estoque confirmada - ' || v_saida.numero_saida,
        'saida',
        p_saida_id,
        v_user_id
      );
    END IF;
  END LOOP;

  UPDATE public.estoque_saidas
  SET status = 'confirmada',
      processado_em = now(),
      updated_at = now()
  WHERE id = p_saida_id;
END;
$$;

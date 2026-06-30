-- Módulo de Saídas de Estoque - Depósito Granular
ALTER TABLE public.estoque_saidas
  ADD COLUMN IF NOT EXISTS deposito_id uuid REFERENCES public.estoque_depositos(id) ON DELETE SET NULL;

-- Atualiza fn_confirmar_saida_estoque para tratar saldo por depósito (estoque_saldo_deposito)
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
  v_estoque_atual numeric(12,3);
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

  -- Se não há depósito informado na saída, tentamos obter o primeiro depósito ativo da filial/empresa
  IF v_saida.deposito_id IS NULL THEN
    SELECT id INTO v_saida.deposito_id
    FROM public.estoque_depositos
    WHERE empresa_id = v_saida.empresa_id
      AND deleted_at IS NULL
    LIMIT 1;
    
    IF v_saida.deposito_id IS NULL THEN
      RAISE EXCEPTION 'Nenhum depósito cadastrado para a empresa.';
    END IF;
    
    -- Salva o deposito_id de fallback na saída
    UPDATE public.estoque_saidas
    SET deposito_id = v_saida.deposito_id
    WHERE id = p_saida_id;
  END IF;

  FOR v_item IN
    SELECT si.produto_id, si.quantidade
    FROM public.estoque_saida_itens si
    WHERE si.saida_id = p_saida_id
  LOOP
    -- Garante que exista um registro em estoque_saldo_deposito para este produto e depósito
    INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, saldo)
    VALUES (v_saida.empresa_id, v_item.produto_id, v_saida.deposito_id, 0)
    ON CONFLICT (produto_id, deposito_id) DO NOTHING;

    -- Busca e bloqueia o saldo do depósito para atualizar
    SELECT COALESCE(saldo, 0) INTO v_saldo_atual
    FROM public.estoque_saldo_deposito
    WHERE produto_id = v_item.produto_id
      AND deposito_id = v_saida.deposito_id
    FOR UPDATE;

    IF v_saldo_atual < v_item.quantidade THEN
      RAISE EXCEPTION 'Estoque insuficiente no depósito selecionado para o produto % (disponível: %, solicitado: %)',
        v_item.produto_id, v_saldo_atual, v_item.quantidade;
    END IF;

    -- Decrementa o saldo do depósito
    UPDATE public.estoque_saldo_deposito
    SET saldo = v_saldo_atual - v_item.quantidade,
        updated_at = now()
    WHERE produto_id = v_item.produto_id
      AND deposito_id = v_saida.deposito_id;

    -- Também busca o estoque global para registrar na movimentação
    SELECT COALESCE(estoque_atual, 0) INTO v_estoque_atual
    FROM public.ser_produtos
    WHERE id = v_item.produto_id;

    INSERT INTO public.estoque_movimentacoes (
      empresa_id, produto_id, tipo, quantidade,
      estoque_anterior, estoque_posterior,
      motivo, referencia_tipo, referencia_id, usuario_id
    ) VALUES (
      v_saida.empresa_id,
      v_item.produto_id,
      'saida',
      v_item.quantidade,
      v_estoque_atual,
      v_estoque_atual - v_item.quantidade,
      'Saída de estoque confirmada - ' || v_saida.numero_saida,
      'saida',
      p_saida_id,
      v_user_id
    );
  END LOOP;

  UPDATE public.estoque_saidas
  SET status = 'confirmada',
      processado_em = now(),
      updated_at = now()
  WHERE id = p_saida_id;
END;
$$;

NOTIFY pgrst, 'reload schema';

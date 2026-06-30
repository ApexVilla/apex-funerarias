-- Adicionar deposito_id em estoque_entradas para rastrear origem/destino granular
ALTER TABLE public.estoque_entradas 
ADD COLUMN IF NOT EXISTS deposito_id UUID REFERENCES public.estoque_depositos(id) ON DELETE SET NULL;

-- Atualizar RPC de confirmação para lidar com saldos granulares por depósito
CREATE OR REPLACE FUNCTION public.fn_confirmar_entrada_estoque(p_entrada_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entrada RECORD;
    v_item RECORD;
    v_estoque_atual_total NUMERIC(12,3);
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Bloquear entrada para evitar concorrência
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

    -- Iterar itens da entrada
    FOR v_item IN
        SELECT ei.produto_id, ei.quantidade, ei.valor_unitario_centavos
        FROM public.estoque_entrada_itens ei
        WHERE ei.entrada_id = p_entrada_id
    LOOP
        -- Saldo total do produto antes da entrada (usado para histórico)
        SELECT COALESCE(p.estoque_atual, 0) INTO v_estoque_atual_total
        FROM public.ser_produtos p
        WHERE p.id = v_item.produto_id
        FOR UPDATE;

        -- 1) Upsert saldo no depósito destino
        INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
        VALUES (v_entrada.empresa_id, v_item.produto_id, v_entrada.deposito_id, v_item.quantidade)
        ON CONFLICT (produto_id, deposito_id) DO UPDATE
        SET quantidade = public.estoque_saldo_deposito.quantidade + EXCLUDED.quantidade,
            updated_at = NOW();

        -- 2) Atualizar metadados de última entrada no produto
        -- Nota: O trigger trg_sync_produto_total_on_saldo em estoque_saldo_deposito 
        -- cuidará de atualizar p.estoque_atual automaticamente.
        UPDATE public.ser_produtos
        SET ultima_entrada_em = NOW(),
            ultima_entrada_valor_centavos = v_item.valor_unitario_centavos,
            updated_at = NOW()
        WHERE id = v_item.produto_id;

        -- 3) Registrar movimentação histórica
        INSERT INTO public.estoque_movimentacoes (
            empresa_id, 
            produto_id, 
            tipo, 
            quantidade,
            estoque_anterior, 
            estoque_posterior,
            motivo, 
            referencia_tipo, 
            referencia_id, 
            usuario_id,
            deposito_destino_id
        ) VALUES (
            v_entrada.empresa_id,
            v_item.produto_id,
            'entrada',
            v_item.quantidade,
            v_estoque_atual_total,
            v_estoque_atual_total + v_item.quantidade,
            'Entrada de estoque confirmada - Doc: ' || v_entrada.numero_documento,
            'entrada',
            p_entrada_id,
            v_user_id,
            v_entrada.deposito_id
        );
    END LOOP;

    -- Marcar entrada como processada
    UPDATE public.estoque_entradas
    SET status = 'confirmada',
        processado_em = NOW(),
        updated_at = NOW()
    WHERE id = p_entrada_id;
END;
$$;

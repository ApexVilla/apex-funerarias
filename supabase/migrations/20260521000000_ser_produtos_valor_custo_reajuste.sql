-- Adicionar coluna de valor de custo em ser_produtos
ALTER TABLE public.ser_produtos 
ADD COLUMN IF NOT EXISTS valor_custo_centavos INTEGER NOT NULL DEFAULT 0;

-- Atualizar RPC para lidar com reajuste automático de custo
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
    v_valor_custo_atual INTEGER;
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
        -- Buscar dados atuais do produto
        SELECT COALESCE(p.estoque_atual, 0), COALESCE(p.valor_custo_centavos, 0)
        INTO v_estoque_atual_total, v_valor_custo_atual
        FROM public.ser_produtos p
        WHERE p.id = v_item.produto_id
        FOR UPDATE;

        -- 1) Upsert saldo no depósito destino
        INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
        VALUES (v_entrada.empresa_id, v_item.produto_id, v_entrada.deposito_id, v_item.quantidade)
        ON CONFLICT (produto_id, deposito_id) DO UPDATE
        SET quantidade = public.estoque_saldo_deposito.quantidade + EXCLUDED.quantidade,
            updated_at = NOW();

        -- 2) Atualizar custo e metadados de última entrada
        -- Se o valor unitário da entrada for maior que o custo atual, atualizamos o custo (reajuste)
        UPDATE public.ser_produtos
        SET ultima_entrada_em = NOW(),
            ultima_entrada_valor_centavos = v_item.valor_unitario_centavos,
            valor_custo_centavos = CASE 
                WHEN v_item.valor_unitario_centavos > v_valor_custo_atual THEN v_item.valor_unitario_centavos
                ELSE v_valor_custo_atual
            END,
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
            'Entrada de estoque confirmada - Doc: ' || v_entrada.numero_documento || 
            CASE WHEN v_item.valor_unitario_centavos > v_valor_custo_atual THEN ' (Reajuste de custo aplicado)' ELSE '' END,
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

-- Função RPC para confirmar entrada de estoque atomicamente
-- Evita race conditions ao atualizar saldos de produtos

CREATE OR REPLACE FUNCTION public.fn_confirmar_entrada_estoque(p_entrada_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_entrada RECORD;
    v_item RECORD;
    v_estoque_atual NUMERIC(12,3);
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

    IF v_entrada.status = 'confirmada' AND v_entrada.processado_em IS NOT NULL THEN
        RAISE EXCEPTION 'Entrada já foi confirmada e processada em %', v_entrada.processado_em;
    END IF;

    FOR v_item IN
        SELECT ei.produto_id, ei.quantidade, ei.valor_unitario_centavos
        FROM public.estoque_entrada_itens ei
        WHERE ei.entrada_id = p_entrada_id
    LOOP
        SELECT COALESCE(p.estoque_atual, 0) INTO v_estoque_atual
        FROM public.ser_produtos p
        WHERE p.id = v_item.produto_id
        FOR UPDATE;

        UPDATE public.ser_produtos
        SET estoque_atual = v_estoque_atual + v_item.quantidade,
            ultima_entrada_em = NOW(),
            ultima_entrada_valor_centavos = v_item.valor_unitario_centavos,
            updated_at = NOW()
        WHERE id = v_item.produto_id;

        INSERT INTO public.estoque_movimentacoes (
            empresa_id, produto_id, tipo, quantidade,
            estoque_anterior, estoque_posterior,
            motivo, referencia_tipo, referencia_id, usuario_id
        ) VALUES (
            v_entrada.empresa_id,
            v_item.produto_id,
            'entrada',
            v_item.quantidade,
            v_estoque_atual,
            v_estoque_atual + v_item.quantidade,
            'Entrada de estoque confirmada - Doc: ' || v_entrada.numero_documento,
            'entrada',
            p_entrada_id,
            v_user_id
        );
    END LOOP;

    UPDATE public.estoque_entradas
    SET status = 'confirmada',
        processado_em = NOW(),
        updated_at = NOW()
    WHERE id = p_entrada_id;
END;
$$;

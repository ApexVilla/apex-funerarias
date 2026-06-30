-- Movimentos de caixa gerados pela importação OFX/CNAB (para estorno)
ALTER TABLE public.fin_caixa_movimentos
ADD COLUMN IF NOT EXISTS arquivo_importacao_id uuid REFERENCES public.fin_arquivos_importados(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_caixa_movimentos_arquivo_importacao
ON public.fin_caixa_movimentos(arquivo_importacao_id)
WHERE arquivo_importacao_id IS NOT NULL;

COMMENT ON COLUMN public.fin_caixa_movimentos.arquivo_importacao_id IS 'Origem: importação retorno OFX/CNAB — usado no estorno das baixas.';

-- Estorna baixas registradas no JSON erros.baixas_aplicadas e remove movimentos de caixa deste arquivo (somente se permitido).
CREATE OR REPLACE FUNCTION public.fin_estornar_baixas_retorno_arquivo(
    p_arquivo_id uuid,
    p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_arquivo public.fin_arquivos_importados%ROWTYPE;
    v_cr_id uuid;
    v_val bigint;
    v_mov RECORD;
    v_rows int := 0;
    v_delta int;
    i int := 0;
    len int;
    elem jsonb;
BEGIN
    SELECT * INTO v_arquivo FROM public.fin_arquivos_importados WHERE id = p_arquivo_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Arquivo de importação não encontrado';
    END IF;

    IF COALESCE(v_arquivo.valor_liquidado_centavos, 0) <= 0 THEN
        RAISE EXCEPTION 'Este retorno não possui valor liquidado para estornar';
    END IF;

    IF v_arquivo.erros IS NULL
        OR jsonb_typeof(v_arquivo.erros -> 'baixas_aplicadas') <> 'array'
        OR jsonb_array_length(COALESCE(v_arquivo.erros -> 'baixas_aplicadas', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'Não há registro de baixas (baixas_aplicadas) neste arquivo. Reimporte ou estorne manualmente nos títulos.';
    END IF;

    -- Caixa deve estar aberto na conta bancária do arquivo
    IF NOT EXISTS (
        SELECT 1
        FROM public.fin_caixa_sessoes s
        WHERE s.empresa_id = v_arquivo.empresa_id
          AND s.conta_bancaria_id = v_arquivo.conta_bancaria_id
          AND s.status = 'aberto'
    ) THEN
        RAISE EXCEPTION 'Caixa fechado nesta conta bancária. Abra o caixa para estornar as baixas deste retorno.';
    END IF;

    -- Movimentos de caixa deste arquivo em sessão já fechada bloqueiam estorno
    FOR v_mov IN
        SELECT m.id, s.status AS st
        FROM public.fin_caixa_movimentos m
        JOIN public.fin_caixa_sessoes s ON s.id = m.sessao_id
        WHERE m.arquivo_importacao_id = p_arquivo_id
    LOOP
        IF v_mov.st = 'fechado' THEN
            RAISE EXCEPTION 'Há lançamentos de caixa deste retorno em sessão já fechada. Estorno automático não permitido.';
        END IF;
    END LOOP;

    len := jsonb_array_length(COALESCE(v_arquivo.erros -> 'baixas_aplicadas', '[]'::jsonb));
    WHILE i < len LOOP
        elem := COALESCE(v_arquivo.erros -> 'baixas_aplicadas', '[]'::jsonb) -> i;

        v_cr_id := NULLIF(trim(elem ->> 'conta_receber_id'), '')::uuid;
        v_val := COALESCE((elem ->> 'valor_centavos')::bigint, 0);
        IF v_cr_id IS NOT NULL AND v_val > 0 THEN
            UPDATE public.fin_contas_receber cr
            SET
                valor_pago_centavos = cr.valor_pago_centavos - LEAST(cr.valor_pago_centavos, v_val),
                valor_aberto_centavos = cr.valor_aberto_centavos + LEAST(cr.valor_pago_centavos, v_val),
                status = CASE
                    WHEN cr.valor_pago_centavos - LEAST(cr.valor_pago_centavos, v_val) <= 0 THEN
                        CASE
                            WHEN cr.data_vencimento < CURRENT_DATE THEN 'vencido'::text
                            ELSE 'aberto'::text
                        END
                    ELSE 'pago_parcial'::text
                END,
                data_pagamento = CASE
                    WHEN cr.valor_pago_centavos - LEAST(cr.valor_pago_centavos, v_val) <= 0 THEN NULL
                    ELSE cr.data_pagamento
                END
            WHERE cr.id = v_cr_id
              AND cr.empresa_id = v_arquivo.empresa_id
              AND cr.deleted_at IS NULL;

            GET DIAGNOSTICS v_delta = ROW_COUNT;
            v_rows := v_rows + v_delta;
        END IF;

        i := i + 1;
    END LOOP;

    DELETE FROM public.fin_caixa_movimentos
    WHERE arquivo_importacao_id = p_arquivo_id;

    UPDATE public.fin_arquivos_importados
    SET
        valor_liquidado_centavos = 0,
        status = 'pendente_conciliacao',
        erros = COALESCE(erros, '{}'::jsonb)
            || jsonb_build_object(
                'baixas_aplicadas', '[]'::jsonb,
                'finalizado', false,
                'pendente_motivo',
                'Baixas estornadas. Revincule títulos no contas a receber antes de nova importação.',
                'estornado_em', to_jsonb(now()),
                'estorno_motivo', to_jsonb(COALESCE(NULLIF(trim(p_motivo), ''), 'Estorno via retorno'))
            )
    WHERE id = p_arquivo_id;

    RETURN jsonb_build_object(
        'ok', true,
        'titulos_atualizados', v_rows,
        'arquivo_id', p_arquivo_id
    );
END;
$$;

COMMENT ON FUNCTION public.fin_estornar_baixas_retorno_arquivo(uuid, text) IS
'Estorna baixas do retorno (fin_contas_receber + remove movimentos caixa do arquivo). Exige caixa aberto na conta e nenhum movimento em sessão fechada.';

GRANT EXECUTE ON FUNCTION public.fin_estornar_baixas_retorno_arquivo(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_estornar_baixas_retorno_arquivo(uuid, text) TO service_role;

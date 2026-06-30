-- Evita recorrência: consolidação de sessões duplicadas não move mais movimentos entre dias.
-- Novo trigger alinha sessao_id à data_movimentacao ao gravar movimentos.

CREATE OR REPLACE FUNCTION public.fin_caixa_sessao_id_para_data(
    p_conta_bancaria_id uuid,
    p_data_movimentacao date,
    p_created_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT s.id
      FROM public.fin_caixa_sessoes s
     WHERE s.conta_bancaria_id = p_conta_bancaria_id
       AND (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date = p_data_movimentacao
     ORDER BY abs(EXTRACT(EPOCH FROM (s.data_abertura - p_created_at)))
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fin_caixa_alinhar_movimento_sessao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_sess RECORD;
    v_destino uuid;
BEGIN
    IF NEW.data_movimentacao IS NULL OR NEW.sessao_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT s.id, s.conta_bancaria_id,
           (s.data_abertura AT TIME ZONE 'America/Sao_Paulo')::date AS dia_sessao
      INTO v_sess
      FROM public.fin_caixa_sessoes s
     WHERE s.id = NEW.sessao_id;

    IF NOT FOUND OR v_sess.dia_sessao = NEW.data_movimentacao THEN
        RETURN NEW;
    END IF;

    v_destino := public.fin_caixa_sessao_id_para_data(
        v_sess.conta_bancaria_id,
        NEW.data_movimentacao,
        COALESCE(NEW.created_at, now())
    );

    IF v_destino IS NOT NULL THEN
        NEW.sessao_id := v_destino;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fin_caixa_alinhar_movimento_sessao ON public.fin_caixa_movimentos;

CREATE TRIGGER trg_fin_caixa_alinhar_movimento_sessao
    BEFORE INSERT OR UPDATE OF sessao_id, data_movimentacao
    ON public.fin_caixa_movimentos
    FOR EACH ROW
    EXECUTE FUNCTION public.fin_caixa_alinhar_movimento_sessao();

-- Consolida sessões abertas duplicadas SEM mover movimentos entre dias
CREATE OR REPLACE FUNCTION public.fin_caixa_consolidar_sessoes_abertas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_old RECORD;
    v_saldo bigint;
BEGIN
    IF NEW.status IS DISTINCT FROM 'aberto' OR NEW.conta_bancaria_id IS NULL THEN
        RETURN NEW;
    END IF;

    FOR v_old IN
        SELECT id
          FROM public.fin_caixa_sessoes
         WHERE conta_bancaria_id = NEW.conta_bancaria_id
           AND status = 'aberto'
           AND id <> NEW.id
    LOOP
        -- Não move movimentos: cada lançamento permanece na sessão do seu dia.
        UPDATE public.fin_caixa_sessoes
           SET
               status = 'fechado',
               saldo_sistema_centavos = public.fin_caixa_saldo_fisico_sessao(id),
               data_fechamento = COALESCE(data_fechamento, now()),
               observacoes_fechamento = COALESCE(
                   observacoes_fechamento,
                   'Auto-fechamento — sessão duplicada; movimentos mantidos na sessão do dia.'
               )
         WHERE id = v_old.id;
    END LOOP;

    UPDATE public.fin_caixa_sessoes
       SET saldo_abertura_centavos = 0
     WHERE id = NEW.id
       AND status = 'aberto'
       AND EXISTS (
           SELECT 1
             FROM public.fin_caixa_movimentos m
            WHERE m.sessao_id = NEW.id
       );

    v_saldo := public.fin_caixa_saldo_fisico_sessao(NEW.id);

    UPDATE public.fin_caixa_sessoes
       SET saldo_sistema_centavos = v_saldo
     WHERE id = NEW.id;

    RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

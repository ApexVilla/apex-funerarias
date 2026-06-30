-- Garante auditoria completa ao conciliar (usuário + data) mesmo se o cliente enviar só conciliado=true.

CREATE OR REPLACE FUNCTION public.fin_caixa_movimentos_conciliacao_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF COALESCE(NEW.conciliado, false) = true THEN
        IF TG_OP = 'INSERT' OR COALESCE(OLD.conciliado, false) = false THEN
            NEW.conciliado_em := COALESCE(NEW.conciliado_em, now());
            NEW.conciliado_por := COALESCE(NEW.conciliado_por, auth.uid());
        END IF;
    ELSE
        NEW.conciliado_em := NULL;
        NEW.conciliado_por := NULL;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fin_caixa_movimentos_conciliacao_audit ON public.fin_caixa_movimentos;

CREATE TRIGGER trg_fin_caixa_movimentos_conciliacao_audit
    BEFORE INSERT OR UPDATE OF conciliado, conciliado_em, conciliado_por
    ON public.fin_caixa_movimentos
    FOR EACH ROW
    EXECUTE FUNCTION public.fin_caixa_movimentos_conciliacao_audit();

CREATE OR REPLACE FUNCTION public.fin_conciliar_caixa_movimento(p_movimento_id uuid)
RETURNS public.fin_caixa_movimentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_row public.fin_caixa_movimentos;
BEGIN
    UPDATE public.fin_caixa_movimentos
       SET conciliado = true,
           conciliado_em = now(),
           conciliado_por = auth.uid()
     WHERE id = p_movimento_id
     RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimento de caixa não encontrado.';
    END IF;

    RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_estornar_conciliacao_caixa_movimento(p_movimento_id uuid)
RETURNS public.fin_caixa_movimentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_row public.fin_caixa_movimentos;
BEGIN
    UPDATE public.fin_caixa_movimentos
       SET conciliado = false,
           conciliado_em = NULL,
           conciliado_por = NULL
     WHERE id = p_movimento_id
     RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimento de caixa não encontrado.';
    END IF;

    RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_conciliar_caixa_movimento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_estornar_conciliacao_caixa_movimento(uuid) TO authenticated;

-- Corrige conciliações antigas sem auditoria (usa quem lançou + data do lançamento como referência).
UPDATE public.fin_caixa_movimentos
   SET conciliado_em = COALESCE(conciliado_em, created_at),
       conciliado_por = COALESCE(conciliado_por, usuario_id)
 WHERE conciliado = true
   AND (conciliado_em IS NULL OR conciliado_por IS NULL);

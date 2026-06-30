-- Garante no máximo uma sessão aberta por conta de caixa (todas as unidades).
-- Corrige duplicatas existentes, índice único parcial e triggers de consolidação/saldo.

-- 1) Corrige contas com mais de uma sessão aberta
DO $$
DECLARE
  r RECORD;
  v_ativa uuid;
  v_old uuid;
  v_saldo bigint;
BEGIN
  FOR r IN
    SELECT conta_bancaria_id,
           array_agg(id ORDER BY data_abertura DESC) AS ids
    FROM public.fin_caixa_sessoes
    WHERE status = 'aberto'
      AND conta_bancaria_id IS NOT NULL
    GROUP BY conta_bancaria_id
    HAVING COUNT(*) > 1
  LOOP
    v_ativa := r.ids[1];

    FOR i IN 2..array_length(r.ids, 1)
    LOOP
      v_old := r.ids[i];

      UPDATE public.fin_caixa_movimentos
      SET sessao_id = v_ativa
      WHERE sessao_id = v_old;

      UPDATE public.fin_caixa_sessoes
      SET
        status = 'fechado',
        saldo_abertura_centavos = 0,
        saldo_sistema_centavos = 0,
        saldo_informado_centavos = 0,
        diferenca_centavos = 0,
        data_fechamento = COALESCE(data_fechamento, now()),
        observacoes_fechamento = COALESCE(
          observacoes_fechamento,
          'Correção automática — sessão duplicada; movimentos unificados na sessão mais recente.'
        )
      WHERE id = v_old;
    END LOOP;

    UPDATE public.fin_caixa_sessoes
    SET saldo_abertura_centavos = 0
    WHERE id = v_ativa
      AND status = 'aberto';

    v_saldo := public.fin_caixa_saldo_fisico_sessao(v_ativa);

    UPDATE public.fin_caixa_sessoes
    SET saldo_sistema_centavos = v_saldo
    WHERE id = v_ativa;

    UPDATE public.fin_contas_bancarias cb
    SET saldo_atual_centavos = v_saldo::integer,
        updated_at = now()
    WHERE cb.id = r.conta_bancaria_id
      AND cb.tipo = 'caixa';
  END LOOP;
END;
$$;

-- 2) Índice único: uma sessão aberta por conta
CREATE UNIQUE INDEX IF NOT EXISTS ux_fin_caixa_sessao_aberta_por_conta
  ON public.fin_caixa_sessoes (conta_bancaria_id)
  WHERE status = 'aberto' AND conta_bancaria_id IS NOT NULL;

-- 3) Consolida sessões abertas duplicadas (insert/update)
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
    UPDATE public.fin_caixa_movimentos
    SET sessao_id = NEW.id
    WHERE sessao_id = v_old.id;

    UPDATE public.fin_caixa_sessoes
    SET
      status = 'fechado',
      saldo_abertura_centavos = 0,
      saldo_sistema_centavos = 0,
      saldo_informado_centavos = 0,
      diferenca_centavos = 0,
      data_fechamento = COALESCE(data_fechamento, now()),
      observacoes_fechamento = COALESCE(
        observacoes_fechamento,
        'Auto-fechamento — sessão duplicada unificada na sessão mais recente.'
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

DROP TRIGGER IF EXISTS trg_fin_caixa_consolidar_sessoes_abertas ON public.fin_caixa_sessoes;

CREATE TRIGGER trg_fin_caixa_consolidar_sessoes_abertas
  AFTER INSERT OR UPDATE OF status, conta_bancaria_id
  ON public.fin_caixa_sessoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fin_caixa_consolidar_sessoes_abertas();

-- 4) Mantém saldo_sistema alinhado aos movimentos em sessões abertas
CREATE OR REPLACE FUNCTION public.fin_caixa_movimentos_sync_saldo_sessao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sessao_id uuid;
  v_saldo bigint;
BEGIN
  v_sessao_id := COALESCE(NEW.sessao_id, OLD.sessao_id);
  IF v_sessao_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_saldo := public.fin_caixa_saldo_fisico_sessao(v_sessao_id);

  UPDATE public.fin_caixa_sessoes
  SET saldo_sistema_centavos = v_saldo
  WHERE id = v_sessao_id
    AND status = 'aberto';

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_fin_caixa_movimentos_sync_saldo ON public.fin_caixa_movimentos;

CREATE TRIGGER trg_fin_caixa_movimentos_sync_saldo
  AFTER INSERT OR UPDATE OR DELETE
  ON public.fin_caixa_movimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fin_caixa_movimentos_sync_saldo_sessao();

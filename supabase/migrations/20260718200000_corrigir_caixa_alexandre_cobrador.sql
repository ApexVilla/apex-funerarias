-- Corrige caixa alexadre-Cobrador: sessão duplicada + saldo de abertura fantasma (R$ 204).
-- Movimentos reais em espécie: R$ 68 (12/06) + R$ 53 + R$ 68 (16/06) = R$ 189,00.

DO $$
DECLARE
  v_conta uuid := '83622cb9-59dd-4200-952c-76e5d983df35';
  v_sessao_antiga uuid := '3039aad1-96f3-4916-be3b-71b28bf27877';
  v_sessao_ativa uuid := 'cb884067-9375-4909-8c2c-169ae641b199';
  v_saldo bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_contas_bancarias WHERE id = v_conta) THEN
    RAISE NOTICE 'Conta alexadre-Cobrador não encontrada; migração ignorada.';
    RETURN;
  END IF;

  -- Unifica movimentos na sessão mais recente
  UPDATE public.fin_caixa_movimentos
  SET sessao_id = v_sessao_ativa
  WHERE sessao_id = v_sessao_antiga;

  -- Fecha sessão duplicada (sem saldo — valor já está na sessão ativa)
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
      'Correção automática — sessão duplicada; movimentos unificados na sessão posterior.'
    )
  WHERE id = v_sessao_antiga
    AND status = 'aberto';

  -- Sessão ativa: abertura zerada, saldo só dos recebimentos em espécie
  UPDATE public.fin_caixa_sessoes
  SET
    saldo_abertura_centavos = 0,
    saldo_informado_centavos = NULL,
    diferenca_centavos = NULL
  WHERE id = v_sessao_ativa
    AND status = 'aberto';

  v_saldo := public.fin_caixa_saldo_fisico_sessao(v_sessao_ativa);

  UPDATE public.fin_caixa_sessoes
  SET saldo_sistema_centavos = v_saldo
  WHERE id = v_sessao_ativa;

  UPDATE public.fin_contas_bancarias
  SET saldo_atual_centavos = v_saldo::integer,
      updated_at = now()
  WHERE id = v_conta;

  -- Sessão de maio fechada com saldo informado sem movimentos — alinha sistema
  UPDATE public.fin_caixa_sessoes
  SET saldo_informado_centavos = saldo_sistema_centavos
  WHERE id = '3f0d8323-2b99-48a2-b7d5-c8865170c384'
    AND saldo_sistema_centavos = 0
    AND COALESCE(saldo_informado_centavos, 0) > 0;
END;
$$;

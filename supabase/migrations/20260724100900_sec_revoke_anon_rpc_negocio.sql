-- Hardening (Fase 1, complemento): remover anon/PUBLIC das RPCs de mutacao de
-- negocio que sobraram executaveis por anon. Sao chamadas apenas por usuarios
-- autenticados pelo app. Seguro porque:
--   * authenticated mantem EXECUTE (app continua funcionando);
--   * chamadas internas entre funcoes SECURITY DEFINER rodam como o owner;
--   * funcoes de trigger nao verificam privilegio EXECUTE.
-- NAO toca no fluxo anonimo legitimo (portal do cliente e assinatura por token)
-- nem nos helpers usados dentro de policies de RLS.

DO $$
DECLARE
  r record;
  alvos text[] := ARRAY[
    'fn_cob_carteira_atribuir_cobrador',
    'fn_cob_carteira_atribuir_cobrador_lote',
    'fn_cob_carteira_atribuir_escritorio',
    'fn_cob_carteira_remover_cobrador',
    'fn_cob_carteira_remover_escritorio',
    'fn_cob_carteira_upsert_cliente',
    'fn_cob_carteira_upsert_pendencias_de_titulos',
    'fn_cob_carteira_status_cliente',
    'fn_confirmar_entrada_estoque',
    'fn_confirmar_saida_estoque',
    'fn_efetivar_transferencia_estoque',
    'fn_promover_beneficiario_titular',
    'fn_registrar_falecimento_beneficiario',
    'fn_atualizar_usuario_gestor',
    'fn_atualizar_meu_perfil',
    'propostas_venda_inserir'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (alvos)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC;', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated;', r.proname, r.args);
  END LOOP;
END $$;

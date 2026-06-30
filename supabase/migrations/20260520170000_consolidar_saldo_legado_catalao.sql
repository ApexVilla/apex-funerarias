-- Fênix Catalão: saldo estava no depósito "legado"; saídas usam "Depósito Geral" filial Catalão.
-- Consolida saldo legado → depósito oficial da unidade Catalão.

DO $$
DECLARE
  v_legado uuid := '04647327-0f16-4110-aa29-db9790bbcfc2';
  v_catalao uuid := 'd84e0e2e-7d8e-47ca-ba4a-b4effb85a4fb';
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM estoque_depositos WHERE id = v_legado)
     OR NOT EXISTS (SELECT 1 FROM estoque_depositos WHERE id = v_catalao) THEN
    RAISE NOTICE 'Depósitos legado/Catalão não encontrados — migração ignorada.';
    RETURN;
  END IF;

  FOR r IN
    SELECT empresa_id, produto_id, quantidade
    FROM public.estoque_saldo_deposito
    WHERE deposito_id = v_legado
      AND quantidade > 0
  LOOP
    INSERT INTO public.estoque_saldo_deposito (empresa_id, produto_id, deposito_id, quantidade)
    VALUES (r.empresa_id, r.produto_id, v_catalao, r.quantidade)
    ON CONFLICT (produto_id, deposito_id)
    DO UPDATE SET quantidade = public.estoque_saldo_deposito.quantidade + EXCLUDED.quantidade;
  END LOOP;

  DELETE FROM public.estoque_saldo_deposito WHERE deposito_id = v_legado;
END $$;

-- Realinha ser_produtos.estoque_atual com soma dos depósitos (Fênix Catalão)
DO $$
DECLARE
  v_emp uuid := 'a3c5a058-f8c5-40e8-a55f-0fefe866848d';
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_sync_estoque_atual_produto') THEN
    FOR r IN SELECT id FROM public.ser_produtos WHERE empresa_id = v_emp
    LOOP
      PERFORM public.fn_sync_estoque_atual_produto(r.id);
    END LOOP;
  END IF;
END $$;

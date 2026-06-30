-- Visão consolidada do grupo econômico (admin, diretoria, gerente, etc.): mesma lógica de frota_veiculos.
-- Função central para policies de estoque (evita repetir e mantém leitura de users com RLS desligado).

CREATE OR REPLACE FUNCTION public.rls_empresa_ou_do_mesmo_grupo(p_empresa uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  IF p_empresa = (SELECT u.empresa_id FROM public.users u WHERE u.id = auth.uid() LIMIT 1) THEN
    RETURN true;
  END IF;
  RETURN public.current_user_pode_ver_grupo_economico()
    AND public.auth_empresa_no_mesmo_grupo_economico(p_empresa);
END;
$$;

REVOKE ALL ON FUNCTION public.rls_empresa_ou_do_mesmo_grupo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_empresa_ou_do_mesmo_grupo(uuid) TO authenticated;

-- ser_produtos
DROP POLICY IF EXISTS "Acesso por empresa - Produtos" ON public.ser_produtos;
DROP POLICY IF EXISTS ser_produtos_empresa_isolation ON public.ser_produtos;
DROP POLICY IF EXISTS ser_produtos_empresa_ou_grupo ON public.ser_produtos;
CREATE POLICY ser_produtos_empresa_ou_grupo ON public.ser_produtos
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

-- filiais / depósitos
DROP POLICY IF EXISTS filiais_empresa_policy ON public.filiais;
DROP POLICY IF EXISTS filiais_empresa_ou_grupo ON public.filiais;
CREATE POLICY filiais_empresa_policy ON public.filiais
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_depositos_empresa_policy ON public.estoque_depositos;
DROP POLICY IF EXISTS estoque_depositos_empresa_ou_grupo ON public.estoque_depositos;
CREATE POLICY estoque_depositos_empresa_policy ON public.estoque_depositos
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

-- movimentações / saldos / transferências
DROP POLICY IF EXISTS "Acesso por empresa - Movimentações Estoque" ON public.estoque_movimentacoes;
DROP POLICY IF EXISTS estoque_movimentacoes_empresa_ou_grupo ON public.estoque_movimentacoes;
CREATE POLICY estoque_movimentacoes_empresa_ou_grupo ON public.estoque_movimentacoes
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_saldo_deposito_empresa_policy ON public.estoque_saldo_deposito;
DROP POLICY IF EXISTS estoque_saldo_deposito_empresa_ou_grupo ON public.estoque_saldo_deposito;
CREATE POLICY estoque_saldo_deposito_empresa_ou_grupo ON public.estoque_saldo_deposito
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_transferencias_empresa_policy ON public.estoque_transferencias;
DROP POLICY IF EXISTS estoque_transferencias_empresa_ou_grupo ON public.estoque_transferencias;
CREATE POLICY estoque_transferencias_empresa_ou_grupo ON public.estoque_transferencias
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_transferencia_itens_policy ON public.estoque_transferencia_itens;
DROP POLICY IF EXISTS estoque_transferencia_itens_empresa_ou_grupo ON public.estoque_transferencia_itens;
CREATE POLICY estoque_transferencia_itens_empresa_ou_grupo ON public.estoque_transferencia_itens
  FOR ALL TO authenticated
  USING (
    transferencia_id IN (
      SELECT tr.id FROM public.estoque_transferencias tr
      WHERE public.rls_empresa_ou_do_mesmo_grupo(tr.empresa_id)
    )
  )
  WITH CHECK (
    transferencia_id IN (
      SELECT tr.id FROM public.estoque_transferencias tr
      WHERE public.rls_empresa_ou_do_mesmo_grupo(tr.empresa_id)
    )
  );

-- entradas
DROP POLICY IF EXISTS estoque_entradas_select_empresa ON public.estoque_entradas;
DROP POLICY IF EXISTS estoque_entradas_insert_empresa ON public.estoque_entradas;
DROP POLICY IF EXISTS estoque_entradas_update_empresa ON public.estoque_entradas;
DROP POLICY IF EXISTS estoque_entradas_delete_empresa ON public.estoque_entradas;

CREATE POLICY estoque_entradas_select_empresa ON public.estoque_entradas
  FOR SELECT TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY estoque_entradas_insert_empresa ON public.estoque_entradas
  FOR INSERT TO authenticated WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY estoque_entradas_update_empresa ON public.estoque_entradas
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY estoque_entradas_delete_empresa ON public.estoque_entradas
  FOR DELETE TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

-- itens de entrada (via entrada.empresa_id)
DROP POLICY IF EXISTS estoque_entrada_itens_select_empresa ON public.estoque_entrada_itens;
DROP POLICY IF EXISTS estoque_entrada_itens_insert_empresa ON public.estoque_entrada_itens;
DROP POLICY IF EXISTS estoque_entrada_itens_update_empresa ON public.estoque_entrada_itens;
DROP POLICY IF EXISTS estoque_entrada_itens_delete_empresa ON public.estoque_entrada_itens;

CREATE POLICY estoque_entrada_itens_select_empresa ON public.estoque_entrada_itens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.estoque_entradas e
    WHERE e.id = estoque_entrada_itens.entrada_id
      AND public.rls_empresa_ou_do_mesmo_grupo(e.empresa_id)
  ));
CREATE POLICY estoque_entrada_itens_insert_empresa ON public.estoque_entrada_itens
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.estoque_entradas e
    WHERE e.id = estoque_entrada_itens.entrada_id
      AND public.rls_empresa_ou_do_mesmo_grupo(e.empresa_id)
  ));
CREATE POLICY estoque_entrada_itens_update_empresa ON public.estoque_entrada_itens
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.estoque_entradas e
    WHERE e.id = estoque_entrada_itens.entrada_id
      AND public.rls_empresa_ou_do_mesmo_grupo(e.empresa_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.estoque_entradas e
    WHERE e.id = estoque_entrada_itens.entrada_id
      AND public.rls_empresa_ou_do_mesmo_grupo(e.empresa_id)
  ));
CREATE POLICY estoque_entrada_itens_delete_empresa ON public.estoque_entrada_itens
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.estoque_entradas e
    WHERE e.id = estoque_entrada_itens.entrada_id
      AND public.rls_empresa_ou_do_mesmo_grupo(e.empresa_id)
  ));

-- contagens
DROP POLICY IF EXISTS estoque_contagens_empresa_policy ON public.estoque_contagens;
DROP POLICY IF EXISTS estoque_contagens_empresa_ou_grupo ON public.estoque_contagens;
CREATE POLICY estoque_contagens_empresa_ou_grupo ON public.estoque_contagens
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_contagem_itens_policy ON public.estoque_contagem_itens;
DROP POLICY IF EXISTS estoque_contagem_itens_empresa_ou_grupo ON public.estoque_contagem_itens;
CREATE POLICY estoque_contagem_itens_empresa_ou_grupo ON public.estoque_contagem_itens
  FOR ALL TO authenticated
  USING (
    contagem_id IN (
      SELECT c.id FROM public.estoque_contagens c
      WHERE public.rls_empresa_ou_do_mesmo_grupo(c.empresa_id)
    )
  )
  WITH CHECK (
    contagem_id IN (
      SELECT c.id FROM public.estoque_contagens c
      WHERE public.rls_empresa_ou_do_mesmo_grupo(c.empresa_id)
    )
  );

-- kits / fornecedores / equipamentos
DROP POLICY IF EXISTS "Acesso por empresa - Kits Estoque" ON public.estoque_kits;
DROP POLICY IF EXISTS estoque_kits_empresa_ou_grupo ON public.estoque_kits;
CREATE POLICY estoque_kits_empresa_ou_grupo ON public.estoque_kits
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS "Acesso por empresa - Kit Itens" ON public.estoque_kit_itens;
DROP POLICY IF EXISTS estoque_kit_itens_empresa_ou_grupo ON public.estoque_kit_itens;
CREATE POLICY estoque_kit_itens_empresa_ou_grupo ON public.estoque_kit_itens
  FOR ALL TO authenticated
  USING (
    kit_id IN (
      SELECT k.id FROM public.estoque_kits k
      WHERE public.rls_empresa_ou_do_mesmo_grupo(k.empresa_id)
    )
  )
  WITH CHECK (
    kit_id IN (
      SELECT k.id FROM public.estoque_kits k
      WHERE public.rls_empresa_ou_do_mesmo_grupo(k.empresa_id)
    )
  );

DROP POLICY IF EXISTS "Acesso por empresa - Fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS fornecedores_empresa_ou_grupo ON public.fornecedores;
CREATE POLICY fornecedores_empresa_ou_grupo ON public.fornecedores
  FOR ALL TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_equipamentos_select ON public.estoque_equipamentos;
DROP POLICY IF EXISTS estoque_equipamentos_insert ON public.estoque_equipamentos;
DROP POLICY IF EXISTS estoque_equipamentos_update ON public.estoque_equipamentos;
DROP POLICY IF EXISTS estoque_equipamentos_delete ON public.estoque_equipamentos;

CREATE POLICY estoque_equipamentos_select ON public.estoque_equipamentos
  FOR SELECT TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY estoque_equipamentos_insert ON public.estoque_equipamentos
  FOR INSERT TO authenticated WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY estoque_equipamentos_update ON public.estoque_equipamentos
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));
CREATE POLICY estoque_equipamentos_delete ON public.estoque_equipamentos
  FOR DELETE TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

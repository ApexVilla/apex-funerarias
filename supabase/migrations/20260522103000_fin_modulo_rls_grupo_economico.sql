-- Financeiro (fin_*): RLS por grupo econômico, como fin_contas_bancarias e estoque.
-- Antes, várias policies exigiam users.empresa_id = tabela.empresa_id, o que bloqueava
-- INSERT/SELECT ao alternar unidade no header (empresa da linha ≠ empresa do cadastro do usuário).

-- Idempotente: remove policies desta migração se já existirem (reexecução ou aplicação parcial).
DROP POLICY IF EXISTS fin_aprovacoes_pagamento_staff_all_grupo ON public.fin_aprovacoes_pagamento;
DROP POLICY IF EXISTS fin_arquivos_importados_staff_all_grupo ON public.fin_arquivos_importados;
DROP POLICY IF EXISTS fin_centros_custo_staff_select_grupo ON public.fin_centros_custo;
DROP POLICY IF EXISTS fin_centros_custo_admins_manage_grupo ON public.fin_centros_custo;
DROP POLICY IF EXISTS fin_conciliacoes_staff_all_grupo ON public.fin_conciliacoes;
DROP POLICY IF EXISTS fin_conciliacoes_itens_staff_all_grupo ON public.fin_conciliacoes_itens;
DROP POLICY IF EXISTS fin_contas_pagar_staff_all_grupo ON public.fin_contas_pagar;
DROP POLICY IF EXISTS fin_contas_pagar_baixas_staff_all_grupo ON public.fin_contas_pagar_baixas;
DROP POLICY IF EXISTS fin_contas_pagar_rateios_staff_all_grupo ON public.fin_contas_pagar_rateios;
DROP POLICY IF EXISTS fin_contas_receber_staff_all_grupo ON public.fin_contas_receber;
DROP POLICY IF EXISTS fin_contas_receber_baixas_staff_all_grupo ON public.fin_contas_receber_baixas;
DROP POLICY IF EXISTS fin_contas_receber_renegociacoes_staff_all_grupo ON public.fin_contas_receber_renegociacoes;
DROP POLICY IF EXISTS fin_dre_configuracao_staff_select_grupo ON public.fin_dre_configuracao;
DROP POLICY IF EXISTS fin_dre_configuracao_admins_manage_grupo ON public.fin_dre_configuracao;
DROP POLICY IF EXISTS fin_extratos_bancarios_staff_all_grupo ON public.fin_extratos_bancarios;
DROP POLICY IF EXISTS fin_formas_pagamento_staff_select_grupo ON public.fin_formas_pagamento;
DROP POLICY IF EXISTS fin_formas_pagamento_admins_manage_grupo ON public.fin_formas_pagamento;
DROP POLICY IF EXISTS fin_lancamentos_contabeis_staff_all_grupo ON public.fin_lancamentos_contabeis;
DROP POLICY IF EXISTS fin_movimentacoes_staff_all_grupo ON public.fin_movimentacoes;
DROP POLICY IF EXISTS fin_orcamento_centro_custo_staff_select_grupo ON public.fin_orcamento_centro_custo;
DROP POLICY IF EXISTS fin_orcamento_centro_custo_admins_manage_grupo ON public.fin_orcamento_centro_custo;
DROP POLICY IF EXISTS fin_plano_contas_staff_select_grupo ON public.fin_plano_contas;
DROP POLICY IF EXISTS fin_plano_contas_admins_manage_grupo ON public.fin_plano_contas;
DROP POLICY IF EXISTS fin_regras_conciliacao_staff_all_grupo ON public.fin_regras_conciliacao;
DROP POLICY IF EXISTS fin_saldos_diarios_staff_select_grupo ON public.fin_saldos_diarios;
DROP POLICY IF EXISTS fin_saldos_diarios_admins_manage_grupo ON public.fin_saldos_diarios;
DROP POLICY IF EXISTS fin_transferencias_staff_all_grupo ON public.fin_transferencias;

-- ---------------------------------------------------------------------------
-- DROP policies antigas (nome exato do banco)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can manage aprovacoes" ON public.fin_aprovacoes_pagamento;
DROP POLICY IF EXISTS "Staff can manage arquivos_importados" ON public.fin_arquivos_importados;
DROP POLICY IF EXISTS "Admins can manage centros_custo" ON public.fin_centros_custo;
DROP POLICY IF EXISTS "Staff can read centros_custo" ON public.fin_centros_custo;
DROP POLICY IF EXISTS "Staff can manage conciliacoes" ON public.fin_conciliacoes;
DROP POLICY IF EXISTS "Staff can manage conciliacoes_itens" ON public.fin_conciliacoes_itens;
DROP POLICY IF EXISTS "Staff can manage contas_pagar" ON public.fin_contas_pagar;
DROP POLICY IF EXISTS "Staff can manage cp_baixas" ON public.fin_contas_pagar_baixas;
DROP POLICY IF EXISTS "Staff can manage rateios" ON public.fin_contas_pagar_rateios;
DROP POLICY IF EXISTS "Staff can manage contas_receber" ON public.fin_contas_receber;
DROP POLICY IF EXISTS "Staff can manage cr_baixas" ON public.fin_contas_receber_baixas;
DROP POLICY IF EXISTS "Staff can manage renegociacoes" ON public.fin_contas_receber_renegociacoes;
DROP POLICY IF EXISTS "Admins can manage dre_config" ON public.fin_dre_configuracao;
DROP POLICY IF EXISTS "Staff can read dre_config" ON public.fin_dre_configuracao;
DROP POLICY IF EXISTS "Staff can manage extratos" ON public.fin_extratos_bancarios;
DROP POLICY IF EXISTS "Admins can manage formas_pagamento" ON public.fin_formas_pagamento;
DROP POLICY IF EXISTS "Staff can read formas_pagamento" ON public.fin_formas_pagamento;
DROP POLICY IF EXISTS "Financeiro can manage lancamentos" ON public.fin_lancamentos_contabeis;
DROP POLICY IF EXISTS "Staff can manage movimentacoes" ON public.fin_movimentacoes;
DROP POLICY IF EXISTS "Admins can manage orcamento" ON public.fin_orcamento_centro_custo;
DROP POLICY IF EXISTS "Staff can read orcamento" ON public.fin_orcamento_centro_custo;
DROP POLICY IF EXISTS "Admins can manage plano_contas" ON public.fin_plano_contas;
DROP POLICY IF EXISTS "Staff can read plano_contas" ON public.fin_plano_contas;
DROP POLICY IF EXISTS "Staff can manage regras_conciliacao" ON public.fin_regras_conciliacao;
DROP POLICY IF EXISTS "Staff can read saldos_diarios" ON public.fin_saldos_diarios;
DROP POLICY IF EXISTS "System can manage saldos_diarios" ON public.fin_saldos_diarios;
DROP POLICY IF EXISTS "Staff can manage transferencias" ON public.fin_transferencias;

-- fin_aprovacoes_pagamento
CREATE POLICY fin_aprovacoes_pagamento_staff_all_grupo
  ON public.fin_aprovacoes_pagamento
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_aprovacoes_pagamento.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_aprovacoes_pagamento.empresa_id)
  );

-- fin_arquivos_importados
CREATE POLICY fin_arquivos_importados_staff_all_grupo
  ON public.fin_arquivos_importados
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_arquivos_importados.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_arquivos_importados.empresa_id)
  );

-- fin_centros_custo
CREATE POLICY fin_centros_custo_staff_select_grupo
  ON public.fin_centros_custo
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_centros_custo.empresa_id)
  );

CREATE POLICY fin_centros_custo_admins_manage_grupo
  ON public.fin_centros_custo
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_centros_custo.empresa_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_centros_custo.empresa_id)
  );

-- fin_conciliacoes
CREATE POLICY fin_conciliacoes_staff_all_grupo
  ON public.fin_conciliacoes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_conciliacoes.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_conciliacoes.empresa_id)
  );

-- fin_conciliacoes_itens (empresa via conciliação pai)
CREATE POLICY fin_conciliacoes_itens_staff_all_grupo
  ON public.fin_conciliacoes_itens
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND EXISTS (
      SELECT 1
      FROM public.fin_conciliacoes c
      WHERE c.id = fin_conciliacoes_itens.conciliacao_id
        AND public.rls_empresa_ou_do_mesmo_grupo(c.empresa_id)
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND EXISTS (
      SELECT 1
      FROM public.fin_conciliacoes c
      WHERE c.id = fin_conciliacoes_itens.conciliacao_id
        AND public.rls_empresa_ou_do_mesmo_grupo(c.empresa_id)
    )
  );

-- fin_contas_pagar
CREATE POLICY fin_contas_pagar_staff_all_grupo
  ON public.fin_contas_pagar
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_pagar.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_pagar.empresa_id)
  );

-- fin_contas_pagar_baixas
CREATE POLICY fin_contas_pagar_baixas_staff_all_grupo
  ON public.fin_contas_pagar_baixas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_pagar_baixas.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_pagar_baixas.empresa_id)
  );

-- fin_contas_pagar_rateios (empresa via conta a pagar)
CREATE POLICY fin_contas_pagar_rateios_staff_all_grupo
  ON public.fin_contas_pagar_rateios
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND EXISTS (
      SELECT 1
      FROM public.fin_contas_pagar cp
      WHERE cp.id = fin_contas_pagar_rateios.conta_pagar_id
        AND public.rls_empresa_ou_do_mesmo_grupo(cp.empresa_id)
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND EXISTS (
      SELECT 1
      FROM public.fin_contas_pagar cp
      WHERE cp.id = fin_contas_pagar_rateios.conta_pagar_id
        AND public.rls_empresa_ou_do_mesmo_grupo(cp.empresa_id)
    )
  );

-- fin_contas_receber
CREATE POLICY fin_contas_receber_staff_all_grupo
  ON public.fin_contas_receber
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_receber.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_receber.empresa_id)
  );

-- fin_contas_receber_baixas
CREATE POLICY fin_contas_receber_baixas_staff_all_grupo
  ON public.fin_contas_receber_baixas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_receber_baixas.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_receber_baixas.empresa_id)
  );

-- fin_contas_receber_renegociacoes
CREATE POLICY fin_contas_receber_renegociacoes_staff_all_grupo
  ON public.fin_contas_receber_renegociacoes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_receber_renegociacoes.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_contas_receber_renegociacoes.empresa_id)
  );

-- fin_dre_configuracao
CREATE POLICY fin_dre_configuracao_staff_select_grupo
  ON public.fin_dre_configuracao
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_dre_configuracao.empresa_id)
  );

CREATE POLICY fin_dre_configuracao_admins_manage_grupo
  ON public.fin_dre_configuracao
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_dre_configuracao.empresa_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_dre_configuracao.empresa_id)
  );

-- fin_extratos_bancarios
CREATE POLICY fin_extratos_bancarios_staff_all_grupo
  ON public.fin_extratos_bancarios
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_extratos_bancarios.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_extratos_bancarios.empresa_id)
  );

-- fin_formas_pagamento
CREATE POLICY fin_formas_pagamento_staff_select_grupo
  ON public.fin_formas_pagamento
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_formas_pagamento.empresa_id)
  );

CREATE POLICY fin_formas_pagamento_admins_manage_grupo
  ON public.fin_formas_pagamento
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_formas_pagamento.empresa_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_formas_pagamento.empresa_id)
  );

-- fin_lancamentos_contabeis
CREATE POLICY fin_lancamentos_contabeis_staff_all_grupo
  ON public.fin_lancamentos_contabeis
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_lancamentos_contabeis.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_lancamentos_contabeis.empresa_id)
  );

-- fin_movimentacoes
CREATE POLICY fin_movimentacoes_staff_all_grupo
  ON public.fin_movimentacoes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_movimentacoes.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_movimentacoes.empresa_id)
  );

-- fin_orcamento_centro_custo
CREATE POLICY fin_orcamento_centro_custo_staff_select_grupo
  ON public.fin_orcamento_centro_custo
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_orcamento_centro_custo.empresa_id)
  );

CREATE POLICY fin_orcamento_centro_custo_admins_manage_grupo
  ON public.fin_orcamento_centro_custo
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_orcamento_centro_custo.empresa_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_orcamento_centro_custo.empresa_id)
  );

-- fin_plano_contas (roles expandidos; policies em authenticated — uso típico do app)
CREATE POLICY fin_plano_contas_staff_select_grupo
  ON public.fin_plano_contas
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_plano_contas.empresa_id)
  );

CREATE POLICY fin_plano_contas_admins_manage_grupo
  ON public.fin_plano_contas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY (
          (ARRAY[
            'admin'::character varying,
            'gerente'::character varying,
            'admin_empresa'::character varying,
            'administrador_geral'::character varying,
            'super_admin'::character varying,
            'gestor'::character varying,
            'admin_sistema'::character varying,
            'financeiro'::character varying
          ])::text[]
        )
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_plano_contas.empresa_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY (
          (ARRAY[
            'admin'::character varying,
            'gerente'::character varying,
            'admin_empresa'::character varying,
            'administrador_geral'::character varying,
            'super_admin'::character varying,
            'gestor'::character varying,
            'admin_sistema'::character varying,
            'financeiro'::character varying
          ])::text[]
        )
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_plano_contas.empresa_id)
  );

-- fin_regras_conciliacao
CREATE POLICY fin_regras_conciliacao_staff_all_grupo
  ON public.fin_regras_conciliacao
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_regras_conciliacao.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_regras_conciliacao.empresa_id)
  );

-- fin_saldos_diarios
CREATE POLICY fin_saldos_diarios_staff_select_grupo
  ON public.fin_saldos_diarios
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_saldos_diarios.empresa_id)
  );

CREATE POLICY fin_saldos_diarios_admins_manage_grupo
  ON public.fin_saldos_diarios
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_saldos_diarios.empresa_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.ativo, true)
        AND (u.role)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying])::text[])
    )
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_saldos_diarios.empresa_id)
  );

-- fin_transferencias
CREATE POLICY fin_transferencias_staff_all_grupo
  ON public.fin_transferencias
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_transferencias.empresa_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND COALESCE(u.ativo, true))
    AND public.rls_empresa_ou_do_mesmo_grupo(fin_transferencias.empresa_id)
  );

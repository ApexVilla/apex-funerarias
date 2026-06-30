-- Módulo de Saídas de Estoque (baixa manual / catálogo de produtos)

CREATE TABLE IF NOT EXISTS public.estoque_saidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero_saida text NOT NULL,
  solicitante text,
  departamento text,
  motivo text NOT NULL DEFAULT 'consumo' CHECK (motivo IN (
    'consumo', 'atendimento', 'perda', 'doacao', 'devolucao', 'outro'
  )),
  data_saida date NOT NULL DEFAULT current_date,
  observacoes text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'confirmada', 'cancelada')),
  processado_em timestamptz,
  processado_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estoque_saida_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saida_id uuid NOT NULL REFERENCES public.estoque_saidas(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.ser_produtos(id) ON DELETE RESTRICT,
  quantidade numeric(12,3) NOT NULL CHECK (quantidade > 0),
  valor_unitario_centavos integer NOT NULL DEFAULT 0 CHECK (valor_unitario_centavos >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_saidas_empresa ON public.estoque_saidas (empresa_id, data_saida DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_saidas_status ON public.estoque_saidas (empresa_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_saidas_numero_empresa
  ON public.estoque_saidas (empresa_id, numero_saida);
CREATE INDEX IF NOT EXISTS idx_estoque_saida_itens_saida ON public.estoque_saida_itens (saida_id);
CREATE INDEX IF NOT EXISTS idx_estoque_saida_itens_produto ON public.estoque_saida_itens (produto_id);

-- Permite referenciar saídas nas movimentações
ALTER TABLE public.estoque_movimentacoes
  DROP CONSTRAINT IF EXISTS estoque_movimentacoes_referencia_tipo_check;

ALTER TABLE public.estoque_movimentacoes
  ADD CONSTRAINT estoque_movimentacoes_referencia_tipo_check
  CHECK (referencia_tipo IS NULL OR referencia_tipo IN (
    'entrada', 'saida', 'atendimento', 'ajuste', 'kit', 'transferencia'
  ));

CREATE OR REPLACE FUNCTION public.fn_gerar_numero_saida(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano text := to_char(current_date, 'YYYY');
  v_seq integer;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero_saida, '^SAI-' || v_ano || '-', ''), '')::integer
  ), 0) + 1
  INTO v_seq
  FROM public.estoque_saidas
  WHERE empresa_id = p_empresa_id
    AND numero_saida ~ ('^SAI-' || v_ano || '-[0-9]+$');

  RETURN 'SAI-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_gerar_numero_saida(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_confirmar_saida_estoque(p_saida_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saida RECORD;
  v_item RECORD;
  v_estoque_atual numeric(12,3);
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_saida
  FROM public.estoque_saidas
  WHERE id = p_saida_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saída não encontrada: %', p_saida_id;
  END IF;

  IF v_saida.status = 'cancelada' THEN
    RAISE EXCEPTION 'Saída cancelada não pode ser confirmada';
  END IF;

  IF v_saida.status = 'confirmada' AND v_saida.processado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Saída já confirmada em %', v_saida.processado_em;
  END IF;

  FOR v_item IN
    SELECT si.produto_id, si.quantidade
    FROM public.estoque_saida_itens si
    WHERE si.saida_id = p_saida_id
  LOOP
    SELECT COALESCE(p.estoque_atual, 0) INTO v_estoque_atual
    FROM public.ser_produtos p
    WHERE p.id = v_item.produto_id
    FOR UPDATE;

    IF v_estoque_atual < v_item.quantidade THEN
      RAISE EXCEPTION 'Estoque insuficiente para o produto % (disponível: %, solicitado: %)',
        v_item.produto_id, v_estoque_atual, v_item.quantidade;
    END IF;

    UPDATE public.ser_produtos
    SET estoque_atual = v_estoque_atual - v_item.quantidade,
        updated_at = now()
    WHERE id = v_item.produto_id;

    INSERT INTO public.estoque_movimentacoes (
      empresa_id, produto_id, tipo, quantidade,
      estoque_anterior, estoque_posterior,
      motivo, referencia_tipo, referencia_id, usuario_id
    ) VALUES (
      v_saida.empresa_id,
      v_item.produto_id,
      'saida',
      v_item.quantidade,
      v_estoque_atual,
      v_estoque_atual - v_item.quantidade,
      'Saída de estoque confirmada - ' || v_saida.numero_saida,
      'saida',
      p_saida_id,
      v_user_id
    );
  END LOOP;

  UPDATE public.estoque_saidas
  SET status = 'confirmada',
      processado_em = now(),
      updated_at = now()
  WHERE id = p_saida_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_confirmar_saida_estoque(uuid) TO authenticated;

ALTER TABLE public.estoque_saidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_saida_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_saidas_select_empresa ON public.estoque_saidas;
CREATE POLICY estoque_saidas_select_empresa ON public.estoque_saidas
  FOR SELECT TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_saidas_insert_empresa ON public.estoque_saidas;
CREATE POLICY estoque_saidas_insert_empresa ON public.estoque_saidas
  FOR INSERT TO authenticated WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_saidas_update_empresa ON public.estoque_saidas;
CREATE POLICY estoque_saidas_update_empresa ON public.estoque_saidas
  FOR UPDATE TO authenticated
  USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id))
  WITH CHECK (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_saidas_delete_empresa ON public.estoque_saidas;
CREATE POLICY estoque_saidas_delete_empresa ON public.estoque_saidas
  FOR DELETE TO authenticated USING (public.rls_empresa_ou_do_mesmo_grupo(empresa_id));

DROP POLICY IF EXISTS estoque_saida_itens_select_empresa ON public.estoque_saida_itens;
CREATE POLICY estoque_saida_itens_select_empresa ON public.estoque_saida_itens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.estoque_saidas s
    WHERE s.id = estoque_saida_itens.saida_id
      AND public.rls_empresa_ou_do_mesmo_grupo(s.empresa_id)
  ));

DROP POLICY IF EXISTS estoque_saida_itens_insert_empresa ON public.estoque_saida_itens;
CREATE POLICY estoque_saida_itens_insert_empresa ON public.estoque_saida_itens
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.estoque_saidas s
    WHERE s.id = estoque_saida_itens.saida_id
      AND public.rls_empresa_ou_do_mesmo_grupo(s.empresa_id)
  ));

DROP POLICY IF EXISTS estoque_saida_itens_update_empresa ON public.estoque_saida_itens;
CREATE POLICY estoque_saida_itens_update_empresa ON public.estoque_saida_itens
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.estoque_saidas s
    WHERE s.id = estoque_saida_itens.saida_id
      AND public.rls_empresa_ou_do_mesmo_grupo(s.empresa_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.estoque_saidas s
    WHERE s.id = estoque_saida_itens.saida_id
      AND public.rls_empresa_ou_do_mesmo_grupo(s.empresa_id)
  ));

DROP POLICY IF EXISTS estoque_saida_itens_delete_empresa ON public.estoque_saida_itens;
CREATE POLICY estoque_saida_itens_delete_empresa ON public.estoque_saida_itens
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.estoque_saidas s
    WHERE s.id = estoque_saida_itens.saida_id
      AND public.rls_empresa_ou_do_mesmo_grupo(s.empresa_id)
  ));

NOTIFY pgrst, 'reload schema';

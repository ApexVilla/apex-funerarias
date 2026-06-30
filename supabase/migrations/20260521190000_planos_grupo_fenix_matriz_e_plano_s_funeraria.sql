-- Planos funerários em todas as empresas do grupo Fênix:
-- 1) Copia da matriz (Fenix de Aparecida) para unidades que ainda não têm o mesmo nome de plano.
-- 2) Cadastro do "Plano S Funerária" em todas as empresas do grupo (modelo baseado no plano Fênix da matriz).

DO $$
DECLARE
  v_matriz uuid := '04d81f24-6712-4929-a329-b01d369fe8cb';
  v_grupo uuid;
  v_src record;
  r_empresa record;
  v_codigo text;
BEGIN
  SELECT e.grupo_empresa_id INTO v_grupo
  FROM public.empresas e
  WHERE e.id = v_matriz;

  IF v_grupo IS NULL THEN
    RAISE NOTICE 'Matriz % sem grupo_empresa_id; nada a fazer.', v_matriz;
  ELSE
  -- Modelo para "Plano S Funerária": preferir "Plano Fênix" na matriz
  SELECT p.* INTO v_src
  FROM public.planos p
  WHERE p.empresa_id = v_matriz
    AND p.deleted_at IS NULL
    AND (p.nome ILIKE '%fênix%' OR p.nome ILIKE '%fenix%')
  ORDER BY p.valor_mensal_centavos ASC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT p.* INTO v_src
    FROM public.planos p
    WHERE p.empresa_id = v_matriz
      AND p.deleted_at IS NULL
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE NOTICE 'Matriz sem planos ativos; nada a fazer.';
  ELSE
  -- A) Réplica: cada plano ativo da matriz -> demais empresas do mesmo grupo (mesmo nome ainda não existe)
  INSERT INTO public.planos (
    id,
    codigo,
    configuracao_negocio_id,
    nome,
    descricao,
    descricao_completa,
    categoria,
    status,
    icone_url,
    imagem_url,
    valor_mensal_centavos,
    valor_anual_centavos,
    desconto_anual_percentual,
    taxa_adesao_centavos,
    numero_max_beneficiarios,
    idade_minima_contratante,
    idade_maxima_contratante,
    idade_maxima_beneficiario,
    carencia_dias,
    vigencia_meses,
    renovacao_automatica,
    permite_cancelamento,
    multa_cancelamento_percentual,
    permite_adicionar_beneficiarios_apos,
    custo_beneficiario_adicional_centavos,
    carencia_beneficiario_adicional_dias,
    beneficios,
    servicos_inclusos,
    comissao_venda_inicial,
    comissao_recorrente,
    comissao_gerente_inicial,
    comissao_gerente_recorrente,
    criado_por_user_id,
    empresa_id,
    categoria_id,
    updated_by
  )
  SELECT
    gen_random_uuid(),
    upper('PLN-' || substr(md5(p.id::text || e.id::text), 1, 8)),
    p.configuracao_negocio_id,
    p.nome,
    p.descricao,
    p.descricao_completa,
    p.categoria,
    p.status,
    p.icone_url,
    p.imagem_url,
    p.valor_mensal_centavos,
    p.valor_anual_centavos,
    p.desconto_anual_percentual,
    p.taxa_adesao_centavos,
    p.numero_max_beneficiarios,
    p.idade_minima_contratante,
    p.idade_maxima_contratante,
    p.idade_maxima_beneficiario,
    p.carencia_dias,
    p.vigencia_meses,
    p.renovacao_automatica,
    p.permite_cancelamento,
    p.multa_cancelamento_percentual,
    p.permite_adicionar_beneficiarios_apos,
    p.custo_beneficiario_adicional_centavos,
    p.carencia_beneficiario_adicional_dias,
    p.beneficios,
    COALESCE(p.servicos_inclusos, '[]'::jsonb),
    p.comissao_venda_inicial,
    p.comissao_recorrente,
    p.comissao_gerente_inicial,
    p.comissao_gerente_recorrente,
    NULL,
    e.id,
    p.categoria_id,
    NULL
  FROM public.planos p
  CROSS JOIN public.empresas e
  WHERE e.grupo_empresa_id = v_grupo
    AND e.id <> v_matriz
    AND p.empresa_id = v_matriz
    AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.planos x
      WHERE x.empresa_id = e.id
        AND x.deleted_at IS NULL
        AND lower(trim(x.nome)) = lower(trim(p.nome))
    );

  -- B) Plano S Funerária em todas as empresas do grupo (inclui matriz)
  FOR r_empresa IN
    SELECT e.id
    FROM public.empresas e
    WHERE e.grupo_empresa_id = v_grupo
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.planos x
      WHERE x.empresa_id = r_empresa.id
        AND x.deleted_at IS NULL
        AND lower(trim(x.nome)) IN ('plano s funerária', 'plano s funeraria')
    ) THEN
      CONTINUE;
    END IF;

    v_codigo := upper('PLN-' || substr(md5(r_empresa.id::text || 'PLANOSFUNERARIA'), 1, 8));
    WHILE EXISTS (SELECT 1 FROM public.planos z WHERE z.codigo = v_codigo) LOOP
      v_codigo := upper('PLN-' || substr(md5(r_empresa.id::text || random()::text || clock_timestamp()::text), 1, 8));
    END LOOP;

    INSERT INTO public.planos (
      id,
      codigo,
      configuracao_negocio_id,
      nome,
      descricao,
      descricao_completa,
      categoria,
      status,
      icone_url,
      imagem_url,
      valor_mensal_centavos,
      valor_anual_centavos,
      desconto_anual_percentual,
      taxa_adesao_centavos,
      numero_max_beneficiarios,
      idade_minima_contratante,
      idade_maxima_contratante,
      idade_maxima_beneficiario,
      carencia_dias,
      vigencia_meses,
      renovacao_automatica,
      permite_cancelamento,
      multa_cancelamento_percentual,
      permite_adicionar_beneficiarios_apos,
      custo_beneficiario_adicional_centavos,
      carencia_beneficiario_adicional_dias,
      beneficios,
      servicos_inclusos,
      comissao_venda_inicial,
      comissao_recorrente,
      comissao_gerente_inicial,
      comissao_gerente_recorrente,
      criado_por_user_id,
      empresa_id,
      categoria_id,
      updated_by
    )
    VALUES (
      gen_random_uuid(),
      v_codigo,
      v_src.configuracao_negocio_id,
      'Plano S Funerária',
      'Plano funerário categoria S — rede Fênix (assistência familiar).',
      'PLANO S FUNERÁRIA — rede Fênix' || chr(10) || chr(10)
        || COALESCE(v_src.descricao_completa, v_src.descricao, ''),
      v_src.categoria,
      'ativo',
      v_src.icone_url,
      v_src.imagem_url,
      GREATEST(100, ROUND(v_src.valor_mensal_centavos::numeric * 0.80)::integer),
      v_src.valor_anual_centavos,
      v_src.desconto_anual_percentual,
      v_src.taxa_adesao_centavos,
      v_src.numero_max_beneficiarios,
      v_src.idade_minima_contratante,
      v_src.idade_maxima_contratante,
      v_src.idade_maxima_beneficiario,
      v_src.carencia_dias,
      v_src.vigencia_meses,
      v_src.renovacao_automatica,
      v_src.permite_cancelamento,
      v_src.multa_cancelamento_percentual,
      v_src.permite_adicionar_beneficiarios_apos,
      v_src.custo_beneficiario_adicional_centavos,
      v_src.carencia_beneficiario_adicional_dias,
      v_src.beneficios,
      COALESCE(v_src.servicos_inclusos, '[]'::jsonb),
      v_src.comissao_venda_inicial,
      v_src.comissao_recorrente,
      v_src.comissao_gerente_inicial,
      v_src.comissao_gerente_recorrente,
      NULL,
      r_empresa.id,
      v_src.categoria_id,
      NULL
    );
  END LOOP;
  END IF;
  END IF;
END;
$$;

-- Plano Ônix / Plano Fênix: benefícios, preços de catálogo e composição dos kits de atendimento.
-- Matriz: Fenix de Aparecida (04d81f24-6712-4929-a329-b01d369fe8cb)

CREATE OR REPLACE FUNCTION public.upsert_ser_produto_catalogo(
  p_empresa_id uuid,
  p_nome text,
  p_preco_centavos integer,
  p_categoria text DEFAULT 'servico_plano'
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.ser_produtos
  WHERE empresa_id = p_empresa_id
    AND lower(trim(nome)) = lower(trim(p_nome))
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.ser_produtos (
      id, nome, codigo, preco_centavos, empresa_id, ativo, categoria, estoque_atual
    )
    VALUES (
      gen_random_uuid(),
      p_nome,
      upper('PRD-' || substr(md5(p_empresa_id::text || p_nome || random()::text), 1, 8)),
      p_preco_centavos,
      p_empresa_id,
      true,
      p_categoria,
      0
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ser_produtos
    SET
      nome = p_nome,
      preco_centavos = p_preco_centavos,
      ativo = true,
      updated_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

DO $$
DECLARE
  v_matriz uuid := '04d81f24-6712-4929-a329-b01d369fe8cb';
  v_kit_fenix uuid := '8085d11b-0f02-447b-a895-6d2e42faf987';
  v_kit_onix uuid := '38577376-04fd-4ba7-ab2b-14aa479ec81e';

  v_remocao uuid;
  v_cortejo uuid;
  v_velas uuid;
  v_tule uuid;
  v_casticais uuid;
  v_flores uuid;
  v_kit_assist uuid;
  v_urna_fenix uuid;
  v_urna_onix uuid;
  v_sala uuid;
  v_invol uuid;
  v_tanato uuid;
  v_terno uuid;
  v_coroa uuid;

  v_benef_fenix jsonb := '[
    {"nome":"Remoção do hospital","incluido":true},
    {"nome":"Cortejo para cemitério","incluido":true},
    {"nome":"Velas para velório","incluido":true},
    {"nome":"Tule de nylon","incluido":true},
    {"nome":"Castiçais, suportes e paramentos","incluido":true},
    {"nome":"Flores ornamentais","incluido":true},
    {"nome":"Kit assistencial","incluido":true},
    {"nome":"Urna plano Fênix 190x64","incluido":true},
    {"nome":"Sala de velório","incluido":true},
    {"nome":"Invólucro padrão","incluido":true},
    {"nome":"Clínicas e Dentistas Conveniados","incluido":true}
  ]'::jsonb;

  v_benef_onix jsonb := '[
    {"nome":"Remoção do hospital","incluido":true},
    {"nome":"Cortejo para cemitério","incluido":true},
    {"nome":"Velas para velório","incluido":true},
    {"nome":"Tule de nylon","incluido":true},
    {"nome":"Castiçais, suportes e paramentos","incluido":true},
    {"nome":"Flores ornamentais","incluido":true},
    {"nome":"Kit assistencial","incluido":true},
    {"nome":"Urna plano Ônix 190x64","incluido":true},
    {"nome":"Tanatopraxia","incluido":true},
    {"nome":"Terno simples","incluido":true},
    {"nome":"Coroa de flores","incluido":true},
    {"nome":"Sala de velório","incluido":true},
    {"nome":"Invólucro padrão","incluido":true},
    {"nome":"Clínicas e Dentistas Conveniados","incluido":true}
  ]'::jsonb;
BEGIN
  -- Serviços (atendimento / tabela avulsa)
  UPDATE public.ser_servicos
  SET preco_base_centavos = 35050, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Remoção hospital');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 34942, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Cortejo para cemitério');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 4205, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Velas');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 2020, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Tule');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 23724, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Castiçais');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 11000, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Kit assistencial');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 100000, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Tanatopraxia');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 20000, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Terno simples');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 25000, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Terno completo');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 20000, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Roupa feminina');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 32951, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Coroa de flores plano');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 100000, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Sala de velório');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 30000, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) IN (lower('Invólucro'), lower('Invol'));

  UPDATE public.ser_servicos
  SET nome = 'Urna plano Ônix', preco_base_centavos = 123500, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Urna plano');

  UPDATE public.ser_servicos
  SET preco_base_centavos = 589850, ativo = true
  WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Urna particular');

  IF NOT EXISTS (
    SELECT 1 FROM public.ser_servicos
    WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Urna plano Fênix')
  ) THEN
    INSERT INTO public.ser_servicos (id, nome, descricao, preco_base_centavos, categoria, ativo, empresa_id)
    VALUES (
      gen_random_uuid(),
      'Urna plano Fênix',
      'Urna 190x64 inclusa no Plano Fênix',
      345917,
      'funerario',
      true,
      v_matriz
    );
  ELSE
    UPDATE public.ser_servicos
    SET preco_base_centavos = 345917, ativo = true
    WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Urna plano Fênix');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ser_servicos
    WHERE empresa_id = v_matriz AND lower(trim(nome)) = lower('Flores ornamentais')
  ) THEN
    INSERT INTO public.ser_servicos (id, nome, descricao, preco_base_centavos, categoria, ativo, empresa_id)
    VALUES (
      gen_random_uuid(),
      'Flores ornamentais',
      'Flores para ornamentação do velório',
      0,
      'funerario',
      true,
      v_matriz
    );
  END IF;

  -- Produtos de catálogo / kit (matriz)
  v_remocao := public.upsert_ser_produto_catalogo(v_matriz, 'Remoção hospital', 35050);
  v_cortejo := public.upsert_ser_produto_catalogo(v_matriz, 'Cortejo para cemitério', 34942);
  v_velas := public.upsert_ser_produto_catalogo(v_matriz, 'Velas para velório', 4205);
  v_tule := public.upsert_ser_produto_catalogo(v_matriz, 'Tule de nylon', 2020);
  v_casticais := public.upsert_ser_produto_catalogo(v_matriz, 'Castiçais, suportes e paramentos', 23724);
  v_flores := public.upsert_ser_produto_catalogo(v_matriz, 'Flores ornamentais', 0);
  v_kit_assist := public.upsert_ser_produto_catalogo(v_matriz, 'Kit assistencial', 11000);
  v_sala := public.upsert_ser_produto_catalogo(v_matriz, 'Sala de velório', 100000);
  v_invol := public.upsert_ser_produto_catalogo(v_matriz, 'Invólucro padrão', 30000);
  v_tanato := public.upsert_ser_produto_catalogo(v_matriz, 'Tanatopraxia', 100000);
  v_terno := public.upsert_ser_produto_catalogo(v_matriz, 'Terno simples', 20000);
  v_coroa := public.upsert_ser_produto_catalogo(v_matriz, 'Coroa de flores plano', 32951);
  v_urna_fenix := public.upsert_ser_produto_catalogo(v_matriz, 'Urna plano Fênix 190x64', 345917, 'urna');
  v_urna_onix := public.upsert_ser_produto_catalogo(v_matriz, 'Urna plano Ônix 190x64', 123500, 'urna');

  -- Benefícios dos planos — somente Fenix de Aparecida
  UPDATE public.planos
  SET beneficios = v_benef_fenix, updated_at = now()
  WHERE deleted_at IS NULL
    AND empresa_id = v_matriz
    AND lower(trim(nome)) IN ('plano fênix', 'plano fenix');

  UPDATE public.planos
  SET beneficios = v_benef_onix, updated_at = now()
  WHERE deleted_at IS NULL
    AND empresa_id = v_matriz
    AND lower(trim(nome)) IN ('plano ônix', 'plano onix');

  -- Recompor kits
  DELETE FROM public.estoque_kit_itens
  WHERE kit_id IN (v_kit_fenix, v_kit_onix);

  INSERT INTO public.estoque_kit_itens (kit_id, produto_id, quantidade) VALUES
    (v_kit_fenix, v_remocao, 1),
    (v_kit_fenix, v_cortejo, 1),
    (v_kit_fenix, v_velas, 1),
    (v_kit_fenix, v_tule, 1),
    (v_kit_fenix, v_casticais, 1),
    (v_kit_fenix, v_flores, 1),
    (v_kit_fenix, v_kit_assist, 1),
    (v_kit_fenix, v_urna_fenix, 1),
    (v_kit_fenix, v_sala, 1),
    (v_kit_fenix, v_invol, 1);

  INSERT INTO public.estoque_kit_itens (kit_id, produto_id, quantidade) VALUES
    (v_kit_onix, v_remocao, 1),
    (v_kit_onix, v_cortejo, 1),
    (v_kit_onix, v_velas, 1),
    (v_kit_onix, v_tule, 1),
    (v_kit_onix, v_casticais, 1),
    (v_kit_onix, v_flores, 1),
    (v_kit_onix, v_kit_assist, 1),
    (v_kit_onix, v_urna_onix, 1),
    (v_kit_onix, v_tanato, 1),
    (v_kit_onix, v_terno, 1),
    (v_kit_onix, v_coroa, 1),
    (v_kit_onix, v_sala, 1),
    (v_kit_onix, v_invol, 1);

  UPDATE public.estoque_kits
  SET
    descricao = 'Kit completo do Plano Fênix — remoção, cortejo, ornamentação, urna 190x64, sala e invólucro.',
    updated_at = now()
  WHERE id = v_kit_fenix;

  UPDATE public.estoque_kits
  SET
    descricao = 'Kit completo do Plano Ônix — inclui Fênix + tanatopraxia, terno, coroa e urna plano Ônix 190x64.',
    updated_at = now()
  WHERE id = v_kit_onix;
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_ser_produto_catalogo(uuid, text, integer, text);

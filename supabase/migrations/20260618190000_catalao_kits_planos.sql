-- Kits de atendimento (Fênix, Ônix, S Funerária) para Fenix de Catalão.

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
  v_catalao uuid := 'a3c5a058-f8c5-40e8-a55f-0fefe866848d';
  v_plano_fenix uuid := 'a0f17ef3-4e15-4697-87af-4a0ec978f102';
  v_plano_onix uuid := '77118205-3df1-44f3-a833-7930aeb8fa95';
  v_plano_s uuid := '1cddfe43-459f-420c-a883-e51ab7f8a8f8';

  v_kit_fenix uuid;
  v_kit_onix uuid;
  v_kit_s uuid;

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

  -- Produtos já existentes no estoque de Catalão (kit S Funerária)
  v_s_invol uuid := '5e7832c9-bd65-4d5b-8c3a-71d91d7087f5';
  v_s_saco uuid := 'a8979b14-8e80-437f-b947-41fe6253b0f8';
  v_s_tule uuid := '5c30671a-12db-43fa-a754-8527207256e0';
  v_s_urna uuid := '143a15f6-5569-40bd-89ee-af2b272198e2';
  v_s_vela uuid := 'ad85f387-7568-4687-84d6-7b8c00a148b0';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = v_catalao) THEN
    RAISE NOTICE 'Empresa Catalão não encontrada; migração ignorada.';
    RETURN;
  END IF;

  -- Catálogo de produtos/serviços do kit (preços da tabela de Catalão)
  v_remocao := public.upsert_ser_produto_catalogo(v_catalao, 'Remoção hospital', 9000);
  v_cortejo := public.upsert_ser_produto_catalogo(v_catalao, 'Cortejo para cemitério', 14000);
  v_velas := public.upsert_ser_produto_catalogo(v_catalao, 'Velas para velório', 4000);
  v_tule := public.upsert_ser_produto_catalogo(v_catalao, 'Tule de nylon', 3000);
  v_casticais := public.upsert_ser_produto_catalogo(v_catalao, 'Castiçais, suportes e paramentos', 25317);
  v_flores := public.upsert_ser_produto_catalogo(v_catalao, 'Flores ornamentais', 35000);
  v_kit_assist := public.upsert_ser_produto_catalogo(v_catalao, 'Kit assistencial', 11000);
  v_sala := public.upsert_ser_produto_catalogo(v_catalao, 'Sala de velório', 100000);
  v_invol := public.upsert_ser_produto_catalogo(v_catalao, 'Invólucro padrão', 30000);
  v_tanato := public.upsert_ser_produto_catalogo(v_catalao, 'Tanatopraxia', 100000);
  v_terno := public.upsert_ser_produto_catalogo(v_catalao, 'Terno simples', 20000);
  v_coroa := public.upsert_ser_produto_catalogo(v_catalao, 'Coroa de flores plano', 40000);
  v_urna_fenix := public.upsert_ser_produto_catalogo(v_catalao, 'Urna plano Fênix 190x64', 345917, 'urna');
  v_urna_onix := public.upsert_ser_produto_catalogo(v_catalao, 'Urna plano Ônix 190x64', 589850, 'urna');

  -- Kit Plano Fênix
  SELECT id INTO v_kit_fenix
  FROM public.estoque_kits
  WHERE empresa_id = v_catalao AND plano_id = v_plano_fenix
  LIMIT 1;

  IF v_kit_fenix IS NULL THEN
    INSERT INTO public.estoque_kits (empresa_id, plano_id, nome, descricao)
    VALUES (
      v_catalao,
      v_plano_fenix,
      'Kit Plano Fênix',
      'Kit completo do Plano Fênix — Catalão: remoção, cortejo, ornamentação, urna 190x64, sala e invólucro.'
    )
    RETURNING id INTO v_kit_fenix;
  ELSE
    UPDATE public.estoque_kits
    SET
      nome = 'Kit Plano Fênix',
      descricao = 'Kit completo do Plano Fênix — Catalão: remoção, cortejo, ornamentação, urna 190x64, sala e invólucro.',
      updated_at = now()
    WHERE id = v_kit_fenix;
    DELETE FROM public.estoque_kit_itens WHERE kit_id = v_kit_fenix;
  END IF;

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

  -- Kit Plano Ônix
  SELECT id INTO v_kit_onix
  FROM public.estoque_kits
  WHERE empresa_id = v_catalao AND plano_id = v_plano_onix
  LIMIT 1;

  IF v_kit_onix IS NULL THEN
    INSERT INTO public.estoque_kits (empresa_id, plano_id, nome, descricao)
    VALUES (
      v_catalao,
      v_plano_onix,
      'Kit Plano Ônix',
      'Kit completo do Plano Ônix — Catalão: Fênix + tanatopraxia, terno, coroa e urna plano Ônix 190x64.'
    )
    RETURNING id INTO v_kit_onix;
  ELSE
    UPDATE public.estoque_kits
    SET
      nome = 'Kit Plano Ônix',
      descricao = 'Kit completo do Plano Ônix — Catalão: Fênix + tanatopraxia, terno, coroa e urna plano Ônix 190x64.',
      updated_at = now()
    WHERE id = v_kit_onix;
    DELETE FROM public.estoque_kit_itens WHERE kit_id = v_kit_onix;
  END IF;

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

  -- Kit Plano S Funerária (produtos do estoque físico)
  SELECT id INTO v_kit_s
  FROM public.estoque_kits
  WHERE empresa_id = v_catalao AND plano_id = v_plano_s
  LIMIT 1;

  IF v_kit_s IS NULL THEN
    INSERT INTO public.estoque_kits (empresa_id, plano_id, nome, descricao)
    VALUES (
      v_catalao,
      v_plano_s,
      'Kit Plano S Funerária',
      'Kit básico do Plano S Funerária — Catalão: urna M61, remoção, tule, vela e invólucro.'
    )
    RETURNING id INTO v_kit_s;
  ELSE
    UPDATE public.estoque_kits
    SET
      nome = 'Kit Plano S Funerária',
      descricao = 'Kit básico do Plano S Funerária — Catalão: urna M61, remoção, tule, vela e invólucro.',
      updated_at = now()
    WHERE id = v_kit_s;
    DELETE FROM public.estoque_kit_itens WHERE kit_id = v_kit_s;
  END IF;

  INSERT INTO public.estoque_kit_itens (kit_id, produto_id, quantidade) VALUES
    (v_kit_s, v_s_invol, 1),
    (v_kit_s, v_s_saco, 1),
    (v_kit_s, v_s_tule, 1),
    (v_kit_s, v_s_urna, 1),
    (v_kit_s, v_s_vela, 1);
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_ser_produto_catalogo(uuid, text, integer, text);

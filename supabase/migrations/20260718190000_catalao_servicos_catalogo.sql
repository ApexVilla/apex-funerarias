-- Catálogo de serviços funerários — unidade Fenix de Catalão.
-- Valores tabela avulsa para atendimentos particulares e referência comercial.

CREATE OR REPLACE FUNCTION public.upsert_ser_servico_catalogo(
  p_empresa_id uuid,
  p_nome text,
  p_preco_centavos integer,
  p_categoria text DEFAULT 'geral',
  p_descricao text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.ser_servicos
  WHERE empresa_id = p_empresa_id
    AND lower(trim(nome)) = lower(trim(p_nome))
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.ser_servicos (
      id, nome, descricao, preco_base_centavos, categoria, ativo, empresa_id
    )
    VALUES (
      gen_random_uuid(),
      p_nome,
      p_descricao,
      p_preco_centavos,
      p_categoria,
      true,
      p_empresa_id
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ser_servicos
    SET
      nome = p_nome,
      descricao = COALESCE(p_descricao, descricao),
      preco_base_centavos = p_preco_centavos,
      categoria = p_categoria,
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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = v_catalao) THEN
    RAISE NOTICE 'Empresa Catalão não encontrada; migração ignorada.';
    RETURN;
  END IF;

  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Ornamentação', 35000, 'geral', 'Flores e ornamentação do velório');
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Tule', 3000, 'geral', 'Tule de nylon');
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Terno completo', 25000, 'urnas', 'Masculino e feminino');
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Terno masculino simples', 20000, 'urnas', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Vestimenta feminina', 15000, 'urnas', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Sala de velório sem cortejo', 100000, 'velorio', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Sala de velório com cortejo', 120000, 'velorio', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Tanatopraxia para associado', 100000, 'urnas', 'Associado / plano');
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Tanatopraxia particular', 120000, 'urnas', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Remoção', 9000, 'traslado', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Cortejo', 14000, 'velorio', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Paramentação particular', 25000, 'geral', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Translado associado', 350, 'traslado', 'Valor por quilômetro — associado/plano');
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Translado particular', 380, 'traslado', 'Valor por quilômetro — particular');
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Formalização', 80000, 'documentacao', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Embalsamamento', 150000, 'urnas', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Vela', 4000, 'geral', NULL);
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'TP3', 140000, 'urnas', 'Tanatopraxia tipo 3');
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Remoção de outra funerária', 38000, 'traslado', 'Retirada do corpo em outra funerária');
  PERFORM public.upsert_ser_servico_catalogo(v_catalao, 'Invólucro', 30000, 'geral', NULL);
END;
$$;

DROP FUNCTION IF EXISTS public.upsert_ser_servico_catalogo(uuid, text, integer, text, text);

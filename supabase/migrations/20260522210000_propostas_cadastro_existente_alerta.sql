-- Sinalização quando proposta é criada para titular/dependente já cadastrado no sistema

ALTER TABLE public.propostas_venda
  ADD COLUMN IF NOT EXISTS cadastro_existente_alerta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cadastro_existente_alertas jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.propostas_venda.cadastro_existente_alerta IS
  'true quando titular ou dependente já tinha cadastro/contrato/proposta aberta no momento do salvamento';
COMMENT ON COLUMN public.propostas_venda.cadastro_existente_alertas IS
  'Lista de mensagens exibidas ao vendedor (json array de strings)';

CREATE OR REPLACE FUNCTION public.propostas_venda_inserir(
  p_payload jsonb,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_id uuid;
  v_seq integer;
  v_tentativa integer;
  v_dep jsonb;
  v_alerta boolean;
  v_alertas jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    SELECT pv.id, pv.sequencial
      INTO v_id, v_seq
      FROM public.propostas_venda pv
     WHERE pv.client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', v_id,
        'sequencial', v_seq,
        'idempotent', true
      );
    END IF;
  END IF;

  v_empresa_id := NULLIF(trim(p_payload->>'empresa_id'), '')::uuid;
  IF v_empresa_id IS NULL OR NOT public.rls_empresa_ou_do_mesmo_grupo(v_empresa_id) THEN
    RAISE EXCEPTION 'Empresa não permitida para este usuário' USING ERRCODE = '42501';
  END IF;

  v_dep := COALESCE(p_payload->'dependentes_detalhes', '[]'::jsonb);
  IF jsonb_typeof(v_dep) IS DISTINCT FROM 'array' THEN
    v_dep := '[]'::jsonb;
  END IF;

  v_alerta := COALESCE((p_payload->>'cadastro_existente_alerta')::boolean, false);
  v_alertas := COALESCE(p_payload->'cadastro_existente_alertas', '[]'::jsonb);
  IF jsonb_typeof(v_alertas) IS DISTINCT FROM 'array' THEN
    v_alertas := '[]'::jsonb;
  END IF;

  FOR v_tentativa IN 1..5 LOOP
    BEGIN
      INSERT INTO public.propostas_venda (
        empresa_id,
        plano_id,
        status,
        cobranca_confirmada,
        vendedor_id,
        client_request_id,
        whatsapp_unidade,
        contribuinte_nome,
        contribuinte_documento,
        contribuinte_rg,
        contribuinte_data_nascimento,
        contribuinte_estado_civil,
        contribuinte_naturalidade_uf,
        contribuinte_naturalidade_cidade,
        contribuinte_profissao,
        contribuinte_religiao,
        endereco_residencia,
        endereco_cep,
        endereco_cidade,
        endereco_uf,
        telefone_principal,
        telefone_alternativo,
        email,
        taxa_adesao_padrao_centavos,
        taxa_adesao_recebida_centavos,
        taxa_adesao_min_centavos,
        taxa_adesao_max_centavos,
        primeiro_vencimento,
        primeira_parcela_paga_no_ato,
        metodo_cobranca,
        cobrador_endereco_mesmo_residencial,
        cobrador_endereco_entrega,
        cobrador_endereco_cep,
        cobrador_endereco_cidade,
        cobrador_endereco_uf,
        data_pedido,
        parcelas_recebidas_quantidade,
        parcelas_recebidas_total_centavos,
        dependentes_inclusos,
        dependentes_detalhes,
        observacoes,
        cadastro_existente_alerta,
        cadastro_existente_alertas
      ) VALUES (
        v_empresa_id,
        NULLIF(trim(p_payload->>'plano_id'), '')::uuid,
        COALESCE(NULLIF(trim(p_payload->>'status'), ''), 'pendente_geracao_contrato'),
        COALESCE((p_payload->>'cobranca_confirmada')::boolean, false),
        v_uid,
        p_client_request_id,
        NULLIF(trim(p_payload->>'whatsapp_unidade'), ''),
        COALESCE(NULLIF(trim(p_payload->>'contribuinte_nome'), ''), 'Rascunho'),
        COALESCE(NULLIF(trim(p_payload->>'contribuinte_documento'), ''), '00000000000'),
        NULLIF(trim(p_payload->>'contribuinte_rg'), ''),
        NULLIF(trim(p_payload->>'contribuinte_data_nascimento'), '')::date,
        NULLIF(trim(p_payload->>'contribuinte_estado_civil'), ''),
        NULLIF(trim(p_payload->>'contribuinte_naturalidade_uf'), ''),
        NULLIF(trim(p_payload->>'contribuinte_naturalidade_cidade'), ''),
        NULLIF(trim(p_payload->>'contribuinte_profissao'), ''),
        NULLIF(trim(p_payload->>'contribuinte_religiao'), ''),
        NULLIF(trim(p_payload->>'endereco_residencia'), ''),
        NULLIF(trim(p_payload->>'endereco_cep'), ''),
        NULLIF(trim(p_payload->>'endereco_cidade'), ''),
        NULLIF(trim(p_payload->>'endereco_uf'), ''),
        NULLIF(trim(p_payload->>'telefone_principal'), ''),
        NULLIF(trim(p_payload->>'telefone_alternativo'), ''),
        NULLIF(trim(p_payload->>'email'), ''),
        (p_payload->>'taxa_adesao_padrao_centavos')::integer,
        (p_payload->>'taxa_adesao_recebida_centavos')::integer,
        (p_payload->>'taxa_adesao_min_centavos')::integer,
        (p_payload->>'taxa_adesao_max_centavos')::integer,
        COALESCE(NULLIF(trim(p_payload->>'primeiro_vencimento'), '')::date, CURRENT_DATE),
        COALESCE((p_payload->>'primeira_parcela_paga_no_ato')::boolean, false),
        COALESCE(NULLIF(trim(p_payload->>'metodo_cobranca'), ''), 'boleto'),
        (p_payload->>'cobrador_endereco_mesmo_residencial')::boolean,
        NULLIF(trim(p_payload->>'cobrador_endereco_entrega'), ''),
        NULLIF(trim(p_payload->>'cobrador_endereco_cep'), ''),
        NULLIF(trim(p_payload->>'cobrador_endereco_cidade'), ''),
        NULLIF(trim(p_payload->>'cobrador_endereco_uf'), ''),
        COALESCE(NULLIF(trim(p_payload->>'data_pedido'), '')::date, (timezone('America/Sao_Paulo', now()))::date),
        COALESCE((p_payload->>'parcelas_recebidas_quantidade')::integer, 0),
        COALESCE((p_payload->>'parcelas_recebidas_total_centavos')::integer, 0),
        COALESCE((p_payload->>'dependentes_inclusos')::integer, 0),
        v_dep,
        NULLIF(trim(p_payload->>'observacoes'), ''),
        v_alerta,
        v_alertas
      )
      RETURNING id, sequencial INTO v_id, v_seq;

      RETURN jsonb_build_object(
        'id', v_id,
        'sequencial', v_seq,
        'idempotent', false
      );

    EXCEPTION
      WHEN unique_violation THEN
        IF p_client_request_id IS NOT NULL THEN
          SELECT pv.id, pv.sequencial
            INTO v_id, v_seq
            FROM public.propostas_venda pv
           WHERE pv.client_request_id = p_client_request_id;
          IF FOUND THEN
            RETURN jsonb_build_object(
              'id', v_id,
              'sequencial', v_seq,
              'idempotent', true
            );
          END IF;
        END IF;

        IF v_tentativa >= 5 THEN
          RAISE;
        END IF;

        PERFORM public.propostas_venda_sync_sequencia_contadores();
    END;
  END LOOP;

  RAISE EXCEPTION 'Não foi possível gerar o número da proposta. Aguarde e tente novamente.';
END;
$function$;

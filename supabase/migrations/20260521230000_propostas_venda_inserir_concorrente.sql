-- Fluxo concorrente: vários vendedores salvando ao mesmo tempo sem erro de sequencial.
-- 1) Reserva atômica do número (lock + contador)
-- 2) Chave idempotente por tentativa de salvamento (toque duplo / retry de rede)
-- 3) RPC única de inserção com retry interno

ALTER TABLE public.propostas_venda
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS propostas_venda_client_request_id_key
  ON public.propostas_venda (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.propostas_venda_sync_sequencia_contadores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.propostas_venda_sequencia_grupo (grupo_empresa_id, ultimo_sequencial)
  SELECT grupo_empresa_id, coalesce(max(sequencial), 0)
    FROM public.propostas_venda
   WHERE grupo_empresa_id IS NOT NULL
   GROUP BY grupo_empresa_id
  ON CONFLICT (grupo_empresa_id) DO UPDATE
    SET ultimo_sequencial = GREATEST(
      public.propostas_venda_sequencia_grupo.ultimo_sequencial,
      EXCLUDED.ultimo_sequencial
    );

  INSERT INTO public.propostas_venda_sequencia (empresa_id, ultimo_sequencial)
  SELECT empresa_id, coalesce(max(sequencial), 0)
    FROM public.propostas_venda
   WHERE grupo_empresa_id IS NULL
   GROUP BY empresa_id
  ON CONFLICT (empresa_id) DO UPDATE
    SET ultimo_sequencial = GREATEST(
      public.propostas_venda_sequencia.ultimo_sequencial,
      EXCLUDED.ultimo_sequencial
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.propostas_venda_reservar_sequencial(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_grupo_id uuid;
  v_next integer;
  v_lock_key bigint;
BEGIN
  IF p_empresa_id IS NULL THEN
    RETURN 1;
  END IF;

  SELECT grupo_empresa_id INTO v_grupo_id
    FROM public.empresas
   WHERE id = p_empresa_id;

  IF v_grupo_id IS NOT NULL THEN
    v_lock_key := hashtextextended('propostas_venda_grupo:' || v_grupo_id::text, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    INSERT INTO public.propostas_venda_sequencia_grupo (grupo_empresa_id, ultimo_sequencial)
    VALUES (v_grupo_id, 1)
    ON CONFLICT (grupo_empresa_id) DO UPDATE
      SET ultimo_sequencial = public.propostas_venda_sequencia_grupo.ultimo_sequencial + 1
    RETURNING ultimo_sequencial INTO v_next;
  ELSE
    v_lock_key := hashtextextended('propostas_venda_empresa:' || p_empresa_id::text, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    INSERT INTO public.propostas_venda_sequencia (empresa_id, ultimo_sequencial)
    VALUES (p_empresa_id, 1)
    ON CONFLICT (empresa_id) DO UPDATE
      SET ultimo_sequencial = public.propostas_venda_sequencia.ultimo_sequencial + 1
    RETURNING ultimo_sequencial INTO v_next;
  END IF;

  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.propostas_venda_bump_sequencial()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_grupo_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN new;
  END IF;

  SELECT grupo_empresa_id INTO v_grupo_id
    FROM public.empresas
   WHERE id = new.empresa_id;

  new.grupo_empresa_id := v_grupo_id;
  new.sequencial := public.propostas_venda_reservar_sequencial(new.empresa_id);

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.propostas_venda_proximo_sequencial(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_grupo_id uuid;
  v_ultimo integer;
BEGIN
  IF p_empresa_id IS NULL THEN
    RETURN 1;
  END IF;

  SELECT grupo_empresa_id INTO v_grupo_id
    FROM public.empresas
   WHERE id = p_empresa_id;

  IF v_grupo_id IS NOT NULL THEN
    SELECT ultimo_sequencial INTO v_ultimo
      FROM public.propostas_venda_sequencia_grupo
     WHERE grupo_empresa_id = v_grupo_id;
    IF v_ultimo IS NULL THEN
      SELECT coalesce(max(sequencial), 0) INTO v_ultimo
        FROM public.propostas_venda
       WHERE grupo_empresa_id = v_grupo_id;
    END IF;
  ELSE
    SELECT ultimo_sequencial INTO v_ultimo
      FROM public.propostas_venda_sequencia
     WHERE empresa_id = p_empresa_id;
    IF v_ultimo IS NULL THEN
      SELECT coalesce(max(sequencial), 0) INTO v_ultimo
        FROM public.propostas_venda
       WHERE empresa_id = p_empresa_id;
    END IF;
  END IF;

  RETURN coalesce(v_ultimo, 0) + 1;
END;
$function$;

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
        observacoes
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
        NULLIF(trim(p_payload->>'observacoes'), '')
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

REVOKE ALL ON FUNCTION public.propostas_venda_sync_sequencia_contadores() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.propostas_venda_reservar_sequencial(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.propostas_venda_inserir(jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.propostas_venda_inserir(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propostas_venda_proximo_sequencial(uuid) TO authenticated;

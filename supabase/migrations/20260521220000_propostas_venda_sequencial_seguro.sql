-- Sequencial de proposta: grupo inteiro (todas as filiais), só no servidor, com lock transacional.

CREATE OR REPLACE FUNCTION public.propostas_venda_bump_sequencial()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_grupo_id uuid;
  v_next integer;
  v_lock_key bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN new;
  END IF;

  SELECT grupo_empresa_id INTO v_grupo_id
    FROM public.empresas
   WHERE id = new.empresa_id;

  new.grupo_empresa_id := v_grupo_id;
  -- Nunca confiar em sequencial enviado pelo app
  new.sequencial := NULL;

  IF v_grupo_id IS NOT NULL THEN
    v_lock_key := hashtextextended('propostas_venda_grupo:' || v_grupo_id::text, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    INSERT INTO public.propostas_venda_sequencia_grupo (grupo_empresa_id, ultimo_sequencial)
    VALUES (v_grupo_id, 1)
    ON CONFLICT (grupo_empresa_id) DO UPDATE
      SET ultimo_sequencial = public.propostas_venda_sequencia_grupo.ultimo_sequencial + 1
    RETURNING ultimo_sequencial INTO v_next;

    new.sequencial := v_next;
  ELSE
    v_lock_key := hashtextextended('propostas_venda_empresa:' || new.empresa_id::text, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    INSERT INTO public.propostas_venda_sequencia (empresa_id, ultimo_sequencial)
    VALUES (new.empresa_id, 1)
    ON CONFLICT (empresa_id) DO UPDATE
      SET ultimo_sequencial = public.propostas_venda_sequencia.ultimo_sequencial + 1
    RETURNING ultimo_sequencial INTO v_next;

    new.sequencial := v_next;
  END IF;

  RETURN new;
END;
$function$;

-- Alinha contadores com o maior sequencial já gravado (proteção após falhas parciais)
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

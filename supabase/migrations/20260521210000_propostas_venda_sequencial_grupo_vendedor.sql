-- Proposta: sequencial numérico único por grupo econômico (Fênix = 1, 2, 3…),
-- independente do vendedor e da filial dentro do mesmo grupo.
-- Filial sem grupo: sequencial continua por empresa_id.

ALTER TABLE public.propostas_venda
  ADD COLUMN IF NOT EXISTS grupo_empresa_id uuid REFERENCES public.empresa_grupos(id) ON DELETE SET NULL;

UPDATE public.propostas_venda pv
   SET grupo_empresa_id = e.grupo_empresa_id
  FROM public.empresas e
 WHERE e.id = pv.empresa_id
   AND pv.grupo_empresa_id IS DISTINCT FROM e.grupo_empresa_id;

-- Remove unique antiga antes de renumerar (evita colisão temporária empresa_id+sequencial)
ALTER TABLE public.propostas_venda
  DROP CONSTRAINT IF EXISTS propostas_venda_empresa_id_sequencial_key;

-- Renumera propostas existentes por grupo (ordem de criação) para não colidir na nova unique
WITH renumerado AS (
  SELECT pv.id,
         e.grupo_empresa_id,
         row_number() OVER (
           PARTITION BY e.grupo_empresa_id
           ORDER BY pv.created_at ASC NULLS LAST, pv.id ASC
         )::integer AS novo_seq
    FROM public.propostas_venda pv
    JOIN public.empresas e ON e.id = pv.empresa_id
   WHERE e.grupo_empresa_id IS NOT NULL
)
UPDATE public.propostas_venda pv
   SET sequencial = r.novo_seq,
       grupo_empresa_id = r.grupo_empresa_id
  FROM renumerado r
 WHERE pv.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS propostas_venda_grupo_sequencial_key
  ON public.propostas_venda (grupo_empresa_id, sequencial)
  WHERE grupo_empresa_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS propostas_venda_empresa_sequencial_sem_grupo_key
  ON public.propostas_venda (empresa_id, sequencial)
  WHERE grupo_empresa_id IS NULL;

-- Contador por grupo (substitui lógica só por empresa quando há grupo)
CREATE TABLE IF NOT EXISTS public.propostas_venda_sequencia_grupo (
  grupo_empresa_id uuid PRIMARY KEY REFERENCES public.empresa_grupos(id) ON DELETE CASCADE,
  ultimo_sequencial integer NOT NULL DEFAULT 0
);

INSERT INTO public.propostas_venda_sequencia_grupo (grupo_empresa_id, ultimo_sequencial)
SELECT e.grupo_empresa_id, coalesce(max(pv.sequencial), 0)
  FROM public.propostas_venda pv
  JOIN public.empresas e ON e.id = pv.empresa_id
 WHERE e.grupo_empresa_id IS NOT NULL
 GROUP BY e.grupo_empresa_id
ON CONFLICT (grupo_empresa_id) DO UPDATE
  SET ultimo_sequencial = GREATEST(
    public.propostas_venda_sequencia_grupo.ultimo_sequencial,
    EXCLUDED.ultimo_sequencial
  );

CREATE OR REPLACE FUNCTION public.propostas_venda_bump_sequencial()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_grupo_id uuid;
  v_next integer;
BEGIN
  SELECT grupo_empresa_id INTO v_grupo_id
    FROM public.empresas
   WHERE id = new.empresa_id;

  new.grupo_empresa_id := v_grupo_id;

  IF new.sequencial IS NULL OR new.sequencial <= 0 THEN
    IF v_grupo_id IS NOT NULL THEN
      INSERT INTO public.propostas_venda_sequencia_grupo (grupo_empresa_id, ultimo_sequencial)
      VALUES (v_grupo_id, 1)
      ON CONFLICT (grupo_empresa_id) DO UPDATE
        SET ultimo_sequencial = public.propostas_venda_sequencia_grupo.ultimo_sequencial + 1
      RETURNING ultimo_sequencial INTO v_next;
      new.sequencial := v_next;
    ELSE
      INSERT INTO public.propostas_venda_sequencia (empresa_id, ultimo_sequencial)
      VALUES (new.empresa_id, 1)
      ON CONFLICT (empresa_id) DO UPDATE
        SET ultimo_sequencial = public.propostas_venda_sequencia.ultimo_sequencial + 1
      RETURNING ultimo_sequencial INTO v_next;
      new.sequencial := v_next;
    END IF;
  END IF;

  RETURN new;
END;
$function$;

-- Próximo número visível para todos os vendedores (ignora RLS de “só minhas propostas”)
CREATE OR REPLACE FUNCTION public.propostas_venda_proximo_sequencial(p_empresa_id uuid)
RETURNS integer
LANGUAGE plpgsql
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

REVOKE ALL ON FUNCTION public.propostas_venda_proximo_sequencial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propostas_venda_proximo_sequencial(uuid) TO authenticated;

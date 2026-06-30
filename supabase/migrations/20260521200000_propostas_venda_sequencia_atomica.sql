-- Sequencial de proposta por empresa: contador atômico (evita duplicate key em toque duplo / concorrência).

CREATE TABLE IF NOT EXISTS public.propostas_venda_sequencia (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  ultimo_sequencial integer NOT NULL DEFAULT 0
);

INSERT INTO public.propostas_venda_sequencia (empresa_id, ultimo_sequencial)
SELECT pv.empresa_id, coalesce(max(pv.sequencial), 0)
  FROM public.propostas_venda pv
 GROUP BY pv.empresa_id
ON CONFLICT (empresa_id) DO UPDATE
  SET ultimo_sequencial = GREATEST(
    public.propostas_venda_sequencia.ultimo_sequencial,
    EXCLUDED.ultimo_sequencial
  );

CREATE OR REPLACE FUNCTION public.propostas_venda_bump_sequencial()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_next integer;
BEGIN
  IF new.sequencial IS NULL OR new.sequencial <= 0 THEN
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

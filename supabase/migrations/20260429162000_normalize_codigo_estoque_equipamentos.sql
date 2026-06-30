UPDATE public.estoque_equipamentos
SET codigo = 'EQP-' || LPAD((codigo)::INTEGER::TEXT, 3, '0')
WHERE codigo ~ '^[0-9]+$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.estoque_equipamentos e2
    WHERE e2.empresa_id = public.estoque_equipamentos.empresa_id
      AND e2.codigo = 'EQP-' || LPAD((public.estoque_equipamentos.codigo)::INTEGER::TEXT, 3, '0')
      AND e2.id <> public.estoque_equipamentos.id
  );

CREATE OR REPLACE FUNCTION public.fn_gerar_codigo_equipamento(p_empresa_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_next_num INTEGER;
BEGIN
    SELECT COALESCE(
        MAX(
            CASE
                WHEN codigo ~ '^EQP-[0-9]+$' THEN SUBSTRING(codigo FROM 5)::INTEGER
                WHEN codigo ~ '^[0-9]+$' THEN codigo::INTEGER
                ELSE 0
            END
        ),
        0
    ) + 1
    INTO v_next_num
    FROM public.estoque_equipamentos
    WHERE empresa_id = p_empresa_id;

    RETURN 'EQP-' || LPAD(v_next_num::TEXT, 3, '0');
END;
$$;

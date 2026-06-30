-- REC-CART passa a ficar sob "Receita operacional" (ou equivalente no ramo 4.x), para aparecer na árvore do módulo Naturezas.
CREATE OR REPLACE FUNCTION public.fin_garantir_natureza_carteirinha_cliente(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_pai_id uuid;
    v_pai_nivel integer;
BEGIN
    IF p_empresa_id IS NULL THEN
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id) THEN
        RETURN;
    END IF;

    -- Pasta / grupo "Receita operacional" no plano clonado (nome ou ramo 4.x + "operacional").
    SELECT c.id, c.nivel
    INTO v_pai_id, v_pai_nivel
    FROM public.fin_plano_contas c
    WHERE c.empresa_id = p_empresa_id
      AND c.tipo = 'receita'
      AND COALESCE(c.ativo, true)
      AND (
          lower(trim(c.nome)) = 'receita operacional'
          OR lower(c.nome) LIKE '%receita%operacional%'
          OR (
              split_part(c.codigo, '.', 1) = '4'
              AND position('.' in c.codigo) > 0
              AND lower(c.nome) LIKE '%operacional%'
          )
      )
    ORDER BY
        CASE WHEN lower(trim(c.nome)) = 'receita operacional' THEN 0 ELSE 1 END,
        CASE WHEN lower(c.nome) LIKE '%receita%operacional%' THEN 0 ELSE 1 END,
        CASE WHEN c.aceita_lancamento IS NOT TRUE THEN 0 ELSE 1 END,
        c.nivel DESC,
        length(c.codigo) DESC,
        c.id
    LIMIT 1;

    IF EXISTS (
        SELECT 1
        FROM public.fin_plano_contas c
        WHERE c.empresa_id = p_empresa_id
          AND c.codigo = 'REC-CART'
    ) THEN
        IF v_pai_id IS NOT NULL THEN
            UPDATE public.fin_plano_contas c
            SET
                pai_id = v_pai_id,
                nivel = v_pai_nivel + 1,
                updated_at = now()
            WHERE c.empresa_id = p_empresa_id
              AND c.codigo = 'REC-CART'
              AND (
                  c.pai_id IS DISTINCT FROM v_pai_id
                  OR c.nivel IS DISTINCT FROM v_pai_nivel + 1
              );
        END IF;
        RETURN;
    END IF;

    INSERT INTO public.fin_plano_contas (
        empresa_id,
        codigo,
        nome,
        tipo,
        natureza,
        nivel,
        pai_id,
        aceita_lancamento,
        conta_sistema,
        ativo
    )
    VALUES (
        p_empresa_id,
        'REC-CART',
        'Carteirinha cliente',
        'receita',
        'credora',
        CASE WHEN v_pai_id IS NULL THEN 2 ELSE v_pai_nivel + 1 END,
        v_pai_id,
        true,
        true,
        true
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fin_garantir_natureza_carteirinha_cliente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_garantir_natureza_carteirinha_cliente(uuid) TO authenticated;

COMMENT ON FUNCTION public.fin_garantir_natureza_carteirinha_cliente(uuid) IS 'Idempotente: garante REC-CART / Carteirinha cliente; vincula ao grupo Receita operacional quando existir no plano.';

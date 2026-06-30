-- Garante a conta de receita "Carteirinha cliente" (REC-CART) na empresa ao abrir o financeiro,
-- sem depender só de migration batch (evita sumir em Tesouraria / Nova receita).
CREATE OR REPLACE FUNCTION public.fin_garantir_natureza_carteirinha_cliente(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF p_empresa_id IS NULL THEN
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id) THEN
        RETURN;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.fin_plano_contas c
        WHERE c.empresa_id = p_empresa_id
          AND c.codigo = 'REC-CART'
    ) THEN
        RETURN;
    END IF;

    INSERT INTO public.fin_plano_contas (
        empresa_id,
        codigo,
        nome,
        tipo,
        natureza,
        nivel,
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
        2,
        true,
        true,
        true
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fin_garantir_natureza_carteirinha_cliente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_garantir_natureza_carteirinha_cliente(uuid) TO authenticated;

COMMENT ON FUNCTION public.fin_garantir_natureza_carteirinha_cliente(uuid) IS 'Idempotente: cria fin_plano_contas REC-CART / Carteirinha cliente se não existir na empresa.';

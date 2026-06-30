-- Natureza de receita padrão para emissão / cobrança de carteirinha de cliente (plano de contas).
-- Código REC-CART: aparece no select "Natureza financeira" em Nova receita (Contas a Receber).
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
SELECT
    e.id,
    'REC-CART',
    'Carteirinha cliente',
    'receita',
    'credora',
    2,
    true,
    true,
    true
FROM public.empresas e
WHERE NOT EXISTS (
    SELECT 1
    FROM public.fin_plano_contas c
    WHERE c.empresa_id = e.id
      AND c.codigo = 'REC-CART'
);

-- Garante uma configuração padrão explícita de comissão para o cargo "vendedor" em todas as
-- empresas que possuem usuários vendedores. Antes desta migration não existia nenhuma linha em
-- comissao_config_padrao para cargo = 'vendedor', e o cálculo de comissão dependia de um valor
-- de fallback (50%) codificado diretamente no frontend (pages/comissoes/ComissoesVendedores.tsx).
-- Esta migration torna esse padrão explícito e auditável no banco, sem alterar o comportamento
-- atual (mantém 50% / sem valor fixo). Não sobrescreve configurações já existentes.

INSERT INTO public.comissao_config_padrao (empresa_id, cargo, tipo_comissao, valor, percentual, valor_fixo_centavos)
SELECT DISTINCT u.empresa_id, 'vendedor', 'percentual', 50.00, 50.00, 0
FROM public.users u
WHERE u.role = 'vendedor'
  AND u.empresa_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.comissao_config_padrao c
    WHERE c.empresa_id = u.empresa_id AND c.cargo = 'vendedor'
  );

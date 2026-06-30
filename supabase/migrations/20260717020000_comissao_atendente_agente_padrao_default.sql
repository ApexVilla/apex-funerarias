-- Garante uma configuração padrão explícita de comissão para os cargos "atendente" e
-- "agente_funerario" em todas as empresas que possuem usuários nesses cargos mas ainda não têm
-- nenhuma linha em comissao_config_padrao (ex.: Fenix de Catalão). Sem esta migration, o cálculo
-- de comissão dependia de valores de fallback codificados no frontend
-- (pages/rh/ComissoesAtendentes.tsx): 2% sem valor fixo para atendente, e R$ 50 fixo sem
-- percentual para agente funerário. Esta migration preserva exatamente esse comportamento atual
-- (não altera nenhum valor já efetivo), apenas o torna explícito e auditável no banco.
-- Não sobrescreve configurações já existentes (ex.: Fenix de Aparecida, que já tem valores
-- customizados).

INSERT INTO public.comissao_config_padrao (empresa_id, cargo, tipo_comissao, valor, percentual, valor_fixo_centavos)
SELECT DISTINCT u.empresa_id, 'atendente', 'percentual', 2.00, 2.00, 0
FROM public.users u
WHERE u.role = 'atendente'
  AND u.empresa_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.comissao_config_padrao c
    WHERE c.empresa_id = u.empresa_id AND c.cargo = 'atendente'
  );

INSERT INTO public.comissao_config_padrao (empresa_id, cargo, tipo_comissao, valor, percentual, valor_fixo_centavos)
SELECT DISTINCT u.empresa_id, 'agente_funerario', 'fixo', 50.00, 0.00, 5000
FROM public.users u
WHERE u.role IN ('agente_funerario', 'agentes_funerarios')
  AND u.empresa_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.comissao_config_padrao c
    WHERE c.empresa_id = u.empresa_id AND c.cargo = 'agente_funerario'
  );

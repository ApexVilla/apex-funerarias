-- Filtros adicionais alinhados às funções RPC (conta bancária no fluxo; centro de custo no DRE).
-- O catálogo guarda pickFrom para o app montar selects.

UPDATE public.rel_configuracao
SET parametros = '[
  {"name":"p_periodo_inicio","type":"date","label":"Período inicial"},
  {"name":"p_periodo_fim","type":"date","label":"Período final"},
  {"name":"p_conta_bancaria_id","type":"uuid","label":"Conta bancária","optional":true,"pickFrom":{"table":"fin_contas_bancarias","value":"id","label":"nome"}}
]'::jsonb
WHERE codigo IN ('FIN_DEP_01', 'GER_DEP_05');

UPDATE public.rel_configuracao
SET parametros = '[
  {"name":"p_data_inicio","type":"date","label":"Data inicial"},
  {"name":"p_data_fim","type":"date","label":"Data final"},
  {"name":"p_centro_custo_id","type":"uuid","label":"Centro de custo","optional":true,"pickFrom":{"table":"fin_centros_custo","value":"id","label":"nome"}}
]'::jsonb
WHERE codigo = 'FIN_DEP_05';

-- Adiciona filtro opcional de cobrador nos relatórios de comissão da cobrança.
-- Observação: o frontend já possui fallback caso a função ainda não aceite p_cobrador_id.

update public.rel_configuracao
set parametros = '[
  {"name":"p_periodo_inicio","type":"date","label":"Período inicial"},
  {"name":"p_periodo_fim","type":"date","label":"Período final"},
  {"name":"p_cobrador_id","type":"uuid","label":"Cobrador","optional":true,"pickFrom":{"table":"users","value":"id","label":"nome"}}
]'::jsonb
where codigo in ('COB_DEP_03', 'COB_DEP_04', 'COB_DEP_05');

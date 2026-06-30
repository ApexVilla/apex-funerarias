-- Mapeia relatórios do catálogo (seed Fenix) para funções reais do banco.
-- p_empresa_id é injetado pelo app; aqui só definimos fonte_nome e filtros de período/data.

update public.rel_configuracao as r
set
  tipo_fonte = 'function',
  fonte_nome = m.fonte_nome,
  parametros = m.parametros::jsonb
from (
  values
    -- Financeiro
    ('FIN_DEP_01', 'rel_fluxo_caixa', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('FIN_DEP_02', 'rel_contas_pagar', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('FIN_DEP_03', 'rel_contas_receber', '[{"name":"p_data_referencia","type":"date","label":"Data de referência"}]'),
    ('FIN_DEP_04', 'rel_rentabilidade', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('FIN_DEP_05', 'rel_dre_comparativo', '[{"name":"p_data_inicio","type":"date","label":"Data inicial"},{"name":"p_data_fim","type":"date","label":"Data final"},{"name":"p_centro_custo_id","type":"text","label":"Centro de custo ID (opcional)"}]'),
    -- Comercial
    ('COM_DEP_01', 'rel_contratos', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('COM_DEP_02', 'rel_contratos', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('COM_DEP_03', 'rel_contratos', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('COM_DEP_04', 'rel_contratos', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('COM_DEP_05', 'rel_contratos', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    -- Cobrança
    ('COB_DEP_01', 'rel_inadimplencia', '[{"name":"p_data_referencia","type":"date","label":"Data de referência"}]'),
    ('COB_DEP_02', 'rel_contas_receber', '[{"name":"p_data_referencia","type":"date","label":"Data de referência"}]'),
    ('COB_DEP_03', 'rel_comissoes', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('COB_DEP_04', 'rel_comissoes', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('COB_DEP_05', 'rel_comissoes', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    -- Clientes
    ('CLI_DEP_01', 'fn_relatorio_clientes', '[]'),
    ('CLI_DEP_02', 'fn_relatorio_clientes', '[]'),
    ('CLI_DEP_03', 'fn_relatorio_clientes', '[]'),
    ('CLI_DEP_04', 'fn_relatorio_clientes', '[]'),
    ('CLI_DEP_05', 'fn_relatorio_clientes', '[]'),
    -- Auditoria
    ('AUD_DEP_01', 'rel_logs_auditoria', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('AUD_DEP_02', 'rel_logs_auditoria', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('AUD_DEP_03', 'rel_logs_auditoria', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('AUD_DEP_04', 'rel_logs_auditoria', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('AUD_DEP_05', 'rel_logs_auditoria', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    -- Gerencial
    ('GER_DEP_01', 'rel_crescimento', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('GER_DEP_02', 'rel_crescimento', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('GER_DEP_03', 'rel_crescimento', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('GER_DEP_04', 'rel_rentabilidade', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('GER_DEP_05', 'rel_fluxo_caixa', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    -- Operacional / atendimento (sinistros — dados reais do módulo)
    ('OPE_DEP_01', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('OPE_DEP_02', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('OPE_DEP_03', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('OPE_DEP_04', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('OPE_DEP_05', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('ATE_DEP_01', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('ATE_DEP_02', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('ATE_DEP_03', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('ATE_DEP_04', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]'),
    ('ATE_DEP_05', 'rel_sinistros', '[{"name":"p_periodo_inicio","type":"date","label":"Período inicial"},{"name":"p_periodo_fim","type":"date","label":"Período final"}]')
) as m(codigo, fonte_nome, parametros)
where r.codigo = m.codigo;

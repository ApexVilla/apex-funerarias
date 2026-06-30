-- Seed de relatórios por departamento (5 cada) para a empresa Fênix.
-- Empresa alvo: 04d81f24-6712-4929-a329-b01d369fe8cb

CREATE OR REPLACE FUNCTION public.fn_relatorio_placeholder()
RETURNS TABLE (mensagem text, gerado_em timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT 'Relatório em construção'::text AS mensagem, now() AS gerado_em;
$$;

INSERT INTO public.rel_configuracao (
  id,
  empresa_id,
  codigo,
  nome,
  descricao,
  setor,
  categoria,
  icone,
  ordem,
  tipo_fonte,
  fonte_nome,
  parametros,
  ativo
)
VALUES
-- FINANCEIRO
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FIN_DEP_01','Fluxo de Caixa por Departamento','Entradas e saídas separadas por centro de custo/departamento.','financeiro','financeiro','DollarSign',10,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FIN_DEP_02','Contas a Pagar por Departamento','Obrigações a pagar agrupadas por departamento.','financeiro','financeiro','DollarSign',11,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FIN_DEP_03','Contas a Receber por Departamento','Recebimentos previstos por departamento.','financeiro','financeiro','DollarSign',12,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FIN_DEP_04','Resultado Mensal por Departamento','Receita, custo e margem por departamento no mês.','financeiro','financeiro','DollarSign',13,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FIN_DEP_05','Orçado x Realizado por Departamento','Comparativo de orçamento e realizado por departamento.','financeiro','financeiro','DollarSign',14,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- COMERCIAL
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COM_DEP_01','Vendas por Departamento','Volume de contratos/vendas por departamento.','comercial','comercial','Users',20,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COM_DEP_02','Leads Convertidos por Departamento','Conversão de leads por área comercial.','comercial','comercial','Users',21,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COM_DEP_03','Ticket Médio por Departamento','Ticket médio de vendas por departamento.','comercial','comercial','Users',22,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COM_DEP_04','Cancelamentos por Departamento','Taxa de cancelamento por departamento comercial.','comercial','comercial','Users',23,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COM_DEP_05','Ranking de Equipe por Departamento','Desempenho da equipe comercial por departamento.','comercial','comercial','Users',24,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- OPERACIONAL
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','OPE_DEP_01','Atendimentos por Departamento','Total de atendimentos operacionais por departamento.','operacional','operacional','Briefcase',30,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','OPE_DEP_02','Tempo Médio de Execução por Departamento','Tempo médio por atividade e departamento.','operacional','operacional','Briefcase',31,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','OPE_DEP_03','Produtividade da Equipe por Departamento','Produtividade operacional por departamento.','operacional','operacional','Briefcase',32,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','OPE_DEP_04','Não Conformidades por Departamento','Ocorrências e desvios por departamento.','operacional','operacional','Briefcase',33,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','OPE_DEP_05','SLA Cumprido por Departamento','Aderência ao SLA por departamento operacional.','operacional','operacional','Briefcase',34,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- ESTOQUE
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','EST_DEP_01','Inventário Atual por Departamento','Posição de estoque por departamento/área.','operacional','estoque','Package',40,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','EST_DEP_02','Entradas de Estoque por Departamento','Movimentações de entrada por departamento.','operacional','estoque','Package',41,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','EST_DEP_03','Saídas de Estoque por Departamento','Movimentações de saída por departamento.','operacional','estoque','Package',42,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','EST_DEP_04','Itens Críticos por Departamento','Itens abaixo do mínimo por departamento.','operacional','estoque','Package',43,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','EST_DEP_05','Giro de Estoque por Departamento','Índice de giro de estoque por departamento.','operacional','estoque','Package',44,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- FROTA
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FRO_DEP_01','Custos de Frota por Departamento','Custos de combustível, manutenção e pneus por departamento.','operacional','frota','Truck',50,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FRO_DEP_02','Quilometragem por Departamento','Km rodado por área/departamento.','operacional','frota','Truck',51,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FRO_DEP_03','Manutenções por Departamento','Manutenções preventivas/corretivas por departamento.','operacional','frota','Truck',52,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FRO_DEP_04','Consumo Médio por Departamento','Consumo médio de combustível por departamento.','operacional','frota','Truck',53,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','FRO_DEP_05','Disponibilidade da Frota por Departamento','Disponibilidade operacional dos veículos por departamento.','operacional','frota','Truck',54,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- ATENDIMENTO
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','ATE_DEP_01','Chamados por Departamento','Volume de chamados/atendimentos por departamento.','operacional','atendimento','FileText',60,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','ATE_DEP_02','Tempo de Resposta por Departamento','Tempo de resposta médio por departamento.','operacional','atendimento','FileText',61,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','ATE_DEP_03','Reabertura de Chamados por Departamento','Taxa de reabertura por departamento.','operacional','atendimento','FileText',62,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','ATE_DEP_04','Satisfação (NPS) por Departamento','Indicador de satisfação por departamento.','operacional','atendimento','FileText',63,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','ATE_DEP_05','Atendimentos Finalizados por Departamento','Total de atendimentos encerrados por departamento.','operacional','atendimento','FileText',64,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- COBRANÇA
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COB_DEP_01','Inadimplência por Departamento','Inadimplência segmentada por departamento.','inadimplencia','cobranca','TrendingUp',70,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COB_DEP_02','Recebimentos por Departamento','Recebimentos efetivados por departamento.','inadimplencia','cobranca','TrendingUp',71,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COB_DEP_03','Acordos Firmados por Departamento','Acordos de cobrança por departamento.','inadimplencia','cobranca','TrendingUp',72,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COB_DEP_04','Acordos Quebrados por Departamento','Acordos não cumpridos por departamento.','inadimplencia','cobranca','TrendingUp',73,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','COB_DEP_05','Efetividade de Cobrança por Departamento','Eficiência da equipe de cobrança por departamento.','inadimplencia','cobranca','TrendingUp',74,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- CLIENTES
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','CLI_DEP_01','Base de Clientes por Departamento','Distribuição da base ativa por departamento.','marketing','clientes','Users',80,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','CLI_DEP_02','Novos Clientes por Departamento','Novos clientes captados por departamento.','marketing','clientes','Users',81,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','CLI_DEP_03','Churn de Clientes por Departamento','Perda de clientes por departamento.','marketing','clientes','Users',82,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','CLI_DEP_04','Segmentação de Clientes por Departamento','Perfil e segmentação por departamento.','marketing','clientes','Users',83,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','CLI_DEP_05','Retenção de Clientes por Departamento','Taxa de retenção por departamento.','marketing','clientes','Users',84,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- RH
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','RH_DEP_01','Headcount por Departamento','Quantidade de colaboradores por departamento.','rh','rh','Users',90,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','RH_DEP_02','Absenteísmo por Departamento','Faltas e afastamentos por departamento.','rh','rh','Users',91,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','RH_DEP_03','Turnover por Departamento','Rotatividade de pessoal por departamento.','rh','rh','Users',92,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','RH_DEP_04','Treinamentos por Departamento','Capacitações realizadas por departamento.','rh','rh','Users',93,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','RH_DEP_05','Custo de Pessoal por Departamento','Custo de folha e benefícios por departamento.','rh','rh','Users',94,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- GERENCIAL
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','GER_DEP_01','KPIs Gerenciais por Departamento','Indicadores chave de performance por departamento.','gerencial','gerencial','PieChart',100,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','GER_DEP_02','Metas x Realizado por Departamento','Comparativo de metas e resultados por departamento.','gerencial','gerencial','PieChart',101,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','GER_DEP_03','Indicadores de Eficiência por Departamento','Eficiência operacional e financeira por departamento.','gerencial','gerencial','PieChart',102,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','GER_DEP_04','Análise de Custos por Departamento','Custos diretos e indiretos por departamento.','gerencial','gerencial','PieChart',103,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','GER_DEP_05','Painel Executivo Consolidado','Visão consolidada de todos os departamentos.','gerencial','gerencial','PieChart',104,'function','fn_relatorio_placeholder','[]'::jsonb,true),

-- AUDITORIA
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','AUD_DEP_01','Acessos por Departamento','Logs de acesso ao sistema por departamento.','auditoria','auditoria','Shield',110,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','AUD_DEP_02','Alterações Críticas por Departamento','Mudanças sensíveis em dados por departamento.','auditoria','auditoria','Shield',111,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','AUD_DEP_03','Exclusões por Departamento','Registros removidos por departamento.','auditoria','auditoria','Shield',112,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','AUD_DEP_04','Permissões por Departamento','Matriz de permissões por departamento.','auditoria','auditoria','Shield',113,'function','fn_relatorio_placeholder','[]'::jsonb,true),
(gen_random_uuid(),'04d81f24-6712-4929-a329-b01d369fe8cb','AUD_DEP_05','Conformidade por Departamento','Checklist de conformidade e riscos por departamento.','auditoria','auditoria','Shield',114,'function','fn_relatorio_placeholder','[]'::jsonb,true)
ON CONFLICT (empresa_id, codigo) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  setor = EXCLUDED.setor,
  categoria = EXCLUDED.categoria,
  icone = EXCLUDED.icone,
  ordem = EXCLUDED.ordem,
  tipo_fonte = EXCLUDED.tipo_fonte,
  fonte_nome = EXCLUDED.fonte_nome,
  parametros = EXCLUDED.parametros,
  ativo = EXCLUDED.ativo,
  updated_at = now();

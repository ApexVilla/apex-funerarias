import { CHAVE_NIVEL_PADRAO } from './permissoesNiveis';

/** Catálogo único de módulos/rotinas — usado em ConfigPage e em lib/acessoModulos. */

export type RotinaCatalogo = {
  id: string;
  numero: string;
  nome: string;
  acoes: Array<{ id: string; label: string }>;
};

export type ModuloCatalogo = {
  id: string;
  codigo: string;
  label: string;
  rotinas: RotinaCatalogo[];
};

const ACOES_PADRAO = [
  { id: 'liberado', label: 'Liberada' },
  { id: 'view', label: 'Visualizar' },
  { id: 'create', label: 'Incluir' },
  { id: 'edit', label: 'Editar' },
  { id: 'delete', label: 'Excluir' },
];

const L = { id: 'liberado', label: 'Liberada' };

export const MODULES: ModuloCatalogo[] = [
  {
    id: 'dashboard',
    codigo: '000',
    label: 'Dashboard',
    rotinas: [
      { id: 'dashboard_view', numero: '001', nome: 'Painel Executivo', acoes: [L, { id: 'view', label: 'Visualizar' }] },
    ],
  },
  {
    id: 'atendimentos',
    codigo: '700',
    label: 'Atendimentos',
    rotinas: [
      { id: 'atd_lista', numero: '701', nome: 'Lista de Atendimentos', acoes: ACOES_PADRAO },
      { id: 'atd_novo', numero: '702', nome: 'Novo Atendimento', acoes: [L, { id: 'create', label: 'Incluir' }] },
      { id: 'atd_servicos', numero: '703', nome: 'Serviços Funerários', acoes: ACOES_PADRAO },
      { id: 'atd_salas', numero: '704', nome: 'Salas e Capelas', acoes: ACOES_PADRAO },
    ],
  },
  {
    id: 'planos',
    codigo: '300',
    label: 'Planos',
    rotinas: [
      { id: 'planos_gerencia', numero: '301', nome: 'Gerência de Planos', acoes: ACOES_PADRAO },
      { id: 'planos_categorias', numero: '302', nome: 'Categorias e Benefícios', acoes: ACOES_PADRAO },
    ],
  },
  {
    id: 'vendas',
    codigo: '400',
    label: 'Vendas / Propostas',
    rotinas: [
      {
        id: 'vendas_propostas',
        numero: '401',
        nome: 'Propostas',
        acoes: [
          ...ACOES_PADRAO,
          { id: 'confirm', label: 'Confirmar / cancelar proposta' },
          { id: 'view_todos', label: 'Ver propostas de todos + pós-venda e gerar contrato' },
        ],
      },
    ],
  },
  {
    id: 'clientes',
    codigo: '500',
    label: 'Clientes / CRM',
    rotinas: [
      { id: 'cli_lista', numero: '501', nome: 'Todos os Clientes', acoes: ACOES_PADRAO },
      { id: 'cli_contratos', numero: '502', nome: 'Contratos', acoes: ACOES_PADRAO },
      { id: 'cli_pipeline', numero: '503', nome: 'Pipeline CRM', acoes: ACOES_PADRAO },
      { id: 'cli_tarefas', numero: '504', nome: 'Tarefas CRM', acoes: ACOES_PADRAO },
    ],
  },
  {
    id: 'financeiro',
    codigo: '200',
    label: 'Financeiro',
    rotinas: [
      { id: 'fin_dashboard', numero: '201', nome: 'Visão Geral Financeira', acoes: [L, { id: 'view', label: 'Visualizar' }] },
      {
        id: 'fin_receber',
        numero: '202',
        nome: 'Contas a Receber',
        acoes: [...ACOES_PADRAO, { id: 'baixar', label: 'Baixar' }, { id: 'estornar', label: 'Estornar' }],
      },
      {
        id: 'fin_pagar',
        numero: '203',
        nome: 'Contas a Pagar',
        acoes: [...ACOES_PADRAO, { id: 'baixar', label: 'Baixar' }, { id: 'estornar', label: 'Estornar' }],
      },
      { id: 'fin_fluxo', numero: '204', nome: 'Fluxo de Caixa', acoes: [L, { id: 'view', label: 'Visualizar' }] },
      {
        id: 'fin_tesouraria',
        numero: '205',
        nome: 'Tesouraria',
        acoes: [
          L,
          { id: 'view', label: 'Visualizar' },
          { id: 'abrir_caixa', label: 'Abrir Caixa' },
          { id: 'fechar_caixa', label: 'Fechar o dia' },
          { id: 'create', label: 'Lançar' },
          {
            id: 'ver_todos_caixas',
            label: 'Ver todos os caixas da unidade',
          },
        ],
      },
      {
        id: 'fin_contas_bancarias',
        numero: '206',
        nome: 'Contas Bancárias',
        acoes: [
          ...ACOES_PADRAO,
          { id: 'gerenciar_operadores', label: 'Vincular operadores aos caixas' },
        ],
      },
      { id: 'fin_plano_contas', numero: '207', nome: 'Plano de Contas', acoes: ACOES_PADRAO },
      { id: 'fin_centros_custo', numero: '208', nome: 'Centros de Custo', acoes: ACOES_PADRAO },
      { id: 'fin_baixa_parcelas', numero: '209', nome: 'Baixa de Parcelas', acoes: [L, { id: 'view', label: 'Visualizar' }, { id: 'baixar', label: 'Baixar' }] },
      { id: 'fin_cobranca', numero: '210', nome: 'Cobrança', acoes: ACOES_PADRAO },
      { id: 'fin_dre', numero: '211', nome: 'DRE', acoes: [L, { id: 'view', label: 'Visualizar' }] },
      { id: 'fin_ofx', numero: '212', nome: 'Importação OFX / CNAB', acoes: [L, { id: 'view', label: 'Visualizar' }, { id: 'import', label: 'Importar' }] },
    ],
  },
  {
    id: 'estoque',
    codigo: '100',
    label: 'Estoque',
    rotinas: [
      { id: 'est_produtos', numero: '101', nome: 'Produtos', acoes: ACOES_PADRAO },
      { id: 'est_kits', numero: '102', nome: 'Kits', acoes: ACOES_PADRAO },
      { id: 'est_entradas', numero: '103', nome: 'Entradas', acoes: [L, { id: 'view', label: 'Visualizar' }, { id: 'create', label: 'Registrar' }] },
      { id: 'est_movimentacoes', numero: '104', nome: 'Movimentações', acoes: [L, { id: 'view', label: 'Visualizar' }] },
      { id: 'est_fornecedores', numero: '105', nome: 'Fornecedores', acoes: ACOES_PADRAO },
    ],
  },
  {
    id: 'frota',
    codigo: '600',
    label: 'Frota',
    rotinas: [
      { id: 'frota_veiculos', numero: '601', nome: 'Veículos', acoes: ACOES_PADRAO },
      { id: 'frota_motoristas', numero: '602', nome: 'Motoristas', acoes: ACOES_PADRAO },
      { id: 'frota_viagens', numero: '603', nome: 'Viagens', acoes: ACOES_PADRAO },
      { id: 'frota_abastecimentos', numero: '604', nome: 'Abastecimentos', acoes: ACOES_PADRAO },
    ],
  },
  {
    id: 'cobradores',
    codigo: '650',
    label: 'Cobradores',
    rotinas: [
      { id: 'cob_lista', numero: '651', nome: 'Lista de Cobradores', acoes: ACOES_PADRAO },
      { id: 'cob_carteira', numero: '652', nome: 'Carteira por Cobrador', acoes: [L, { id: 'view', label: 'Visualizar' }] },
      { id: 'cob_carteira_escritorio', numero: '654', nome: 'Carteira do Escritório', acoes: [L, { id: 'view', label: 'Visualizar' }] },
      { id: 'cob_rotas', numero: '653', nome: 'Rotas', acoes: ACOES_PADRAO },
    ],
  },
  {
    id: 'ponto',
    codigo: '900',
    label: 'Gestão de Jornada',
    rotinas: [
      { id: 'ponto_registro', numero: '901', nome: 'Registro de Ponto', acoes: [L, { id: 'view', label: 'Visualizar' }, { id: 'create', label: 'Registrar' }] },
      {
        id: 'ponto_espelho',
        numero: '902',
        nome: 'Espelho de Ponto',
        acoes: [
          L,
          { id: 'view', label: 'Visualizar' },
          { id: 'view_todos', label: 'Ver folha de ponto de todos os colaboradores' },
          { id: 'edit', label: 'Editar folha (ajuste manual)' },
        ],
      },
    ],
  },
  {
    id: 'rh',
    codigo: '960',
    label: 'Recursos Humanos',
    rotinas: [
      { id: 'rh_colaboradores', numero: '961', nome: 'Colaboradores', acoes: ACOES_PADRAO },
      { id: 'rh_ferias', numero: '962', nome: 'Controle de Férias', acoes: ACOES_PADRAO },
      { id: 'rh_beneficios', numero: '963', nome: 'Gestão de Benefícios', acoes: ACOES_PADRAO },
      { id: 'rh_ocorrencias', numero: '964', nome: 'Histórico de Ocorrências', acoes: ACOES_PADRAO },
    ],
  },
  {
    id: 'documentos',
    codigo: '950',
    label: 'Documentos',
    rotinas: [{ id: 'doc_modelos', numero: '951', nome: 'Modelos de Documentos', acoes: ACOES_PADRAO }],
  },
  {
    id: 'crm',
    codigo: '800',
    label: 'CRM WhatsApp',
    rotinas: [
      { id: 'crm_modulo', numero: '801', nome: 'Módulo CRM', acoes: [L, { id: 'view', label: 'Visualizar' }] },
      { id: 'crm_conexao', numero: '802', nome: 'Conexão WhatsApp', acoes: [L, { id: 'view', label: 'Visualizar' }, { id: 'edit', label: 'Configurar' }] },
      { id: 'crm_contatos', numero: '803', nome: 'Contatos', acoes: ACOES_PADRAO },
    ],
  },
  {
    id: 'relatorios',
    codigo: '990',
    label: 'Relatórios',
    rotinas: [
      {
        id: 'rel_geral',
        numero: '991',
        nome: 'Visualizar Relatórios',
        acoes: [L, { id: 'view', label: 'Visualizar' }, { id: 'export', label: 'Exportar' }],
      },
    ],
  },
  {
    id: 'comissoes',
    codigo: '955',
    label: 'Comissões',
    rotinas: [
      {
        id: 'com_cobradores',
        numero: '952',
        nome: 'Comissão de Cobradores',
        acoes: [L, { id: 'view', label: 'Visualizar' }],
      },
      {
        id: 'com_atendentes',
        numero: '953',
        nome: 'Comissão de Atendentes',
        acoes: [L, { id: 'view', label: 'Visualizar' }],
      },
      {
        id: 'com_vendedores',
        numero: '954',
        nome: 'Comissão de Vendedores',
        acoes: [L, { id: 'view', label: 'Visualizar' }],
      },
    ],
  },
  {
    id: 'config',
    codigo: '999',
    label: 'Configurações',
    rotinas: [
      {
        id: 'cfg_empresa',
        numero: '9991',
        nome: 'Dados da Empresa',
        acoes: [L, { id: 'view', label: 'Visualizar' }, { id: 'edit', label: 'Editar' }],
      },
      { id: 'cfg_usuarios', numero: '9992', nome: 'Gestão de Usuários', acoes: ACOES_PADRAO },
    ],
  },
];

/**
 * Garante todas as rotinas do catálogo no JSON salvo (com ações explícitas true/false).
 * Sem isso, só algumas chaves (ex.: financeiro) ativam modo restritivo e o cargo ainda
 * libera dashboard — ex.: gerente com matriz parcial.
 */
export function montarSnapshotCompletoPermissoes(
  parcial: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parcial };
  for (const mod of MODULES) {
    for (const rot of mod.rotinas) {
      const prevRaw = out[rot.id];
      const prev =
        prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)
          ? { ...(prevRaw as Record<string, boolean>) }
          : {};
      const merged: Record<string, boolean> = prev;
      for (const a of rot.acoes) {
        if (!(a.id in merged)) merged[a.id] = false;
      }
      out[rot.id] = merged;
    }
  }
  return out;
}

/** Persiste só rotinas com ao menos uma ação true (+ chaves especiais). Evita snapshot gigante no banco. */
export function compactarPermissoesParaSalvar(
  parcial: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(parcial)) {
    if (key === 'empresas_contexto' || key === 'ponto_config') {
      if (val && typeof val === 'object') out[key] = val;
      continue;
    }
    if (key === CHAVE_NIVEL_PADRAO && typeof val === 'string' && val.trim()) {
      out[key] = val.trim();
      continue;
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const temAlgumTrue = Object.values(val as Record<string, unknown>).some((v) => v === true);
    if (temAlgumTrue) out[key] = val;
  }
  return out;
}

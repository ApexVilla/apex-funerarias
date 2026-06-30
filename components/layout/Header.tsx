import React from 'react';
import { Menu, Bell, ChevronRight, ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { ContextoOperacionalSelector } from './ContextoOperacionalSelector';

export const routeLabels: Record<string, string> = {
  '/inicio': 'Início',
  '/dashboard': 'Dashboard',
  '/planos': 'Planos',
  '/planos/gerencia': 'Gerência de Planos',
  '/planos/novo': 'Novo Plano',
  '/planos/categorias': 'Benefícios',
  '/clientes': 'Clientes',
  '/clientes/lista': 'Clientes',
  '/clientes/novo': 'Novo Cliente',
  '/clientes/oportunidades': 'Pipeline CRM',
  '/clientes/tarefas': 'Tarefas CRM',
  '/clientes/contratos': 'Contratos',
  '/atendimentos': 'Atendimentos',
  '/atendimentos/novo': 'Novo Atendimento',
  '/estoque': 'Estoque',
  '/estoque/produtos': 'Produtos',
  '/estoque/produtos/novo': 'Novo Produto',
  '/estoque/filiais-depositos': 'Filiais e depósitos',
  '/estoque/transferencias': 'Transferências',
  '/estoque/transferencias/nova': 'Nova transferência',
  '/estoque/entradas': 'Entradas',
  '/estoque/entradas/nova': 'Nova Entrada',
  '/estoque/movimentacoes': 'Movimentações',
  '/estoque/fornecedores': 'Fornecedores',
  '/estoque/fornecedores/novo': 'Novo Fornecedor',
  '/estoque/kits': 'Kits',
  '/estoque/saidas': 'Saídas de Estoque',
  '/estoque/contagens': 'Contagem de Estoque',
  '/estoque/equipamentos': 'Equipamentos',
  '/financeiro': 'Financeiro',
  '/financeiro/dashboard': 'Dashboard Financeiro',
  '/financeiro/baixa-parcelas': 'Baixa de Parcelas',
  '/financeiro/tesouraria': 'Tesouraria',
  '/financeiro/contas-receber': 'Contas a Receber',
  '/financeiro/contas-pagar': 'Contas a Pagar',
  '/financeiro/fluxo-caixa': 'Fluxo de Caixa',
  '/financeiro/contas-bancarias': 'Contas Bancárias',
  '/financeiro/plano-contas': 'Plano de Contas',
  '/financeiro/naturezas': 'Naturezas Financeiras',
  '/financeiro/centros-custo': 'Centros de Custo',
  '/financeiro/dre': 'DRE',
  '/financeiro/cobranca': 'Cobrança',
  '/financeiro/importacao-ofx': 'Importação OFX / CNAB',
  '/ponto': 'Ponto',
  '/ponto/registro': 'Registro de Ponto',
  '/ponto/espelho': 'Espelho de Ponto',
  '/ponto/jornadas': 'Gestão de Jornada',
  '/documentos/modelos': 'Documentos',
  '/relatorios': 'Relatórios',
  '/config': 'Configurações',
  '/venda': 'Vendas',
  '/venda/propostas': 'Propostas de Venda',
  '/venda/nova': 'Nova Proposta',
  '/rh': 'Recursos Humanos',
  '/rh/colaboradores': 'Colaboradores',
  '/rh/presenca-banco-horas': 'Painel de Presença',
  '/rh/espelho-ponto': 'Espelho de Ponto',
  '/rh/ferias': 'Controle de Férias',
  '/rh/beneficios': 'Gestão de Benefícios',
  '/rh/ocorrencias': 'Histórico de Ocorrências',
  '/rh/comissoes': 'Comissões de Atendimento',
  '/comissoes': 'Comissões',
  '/comissoes/cobradores': 'Comissões de Cobradores',
  '/comissoes/atendimentos': 'Comissões de Atendimento',
  '/comissoes/vendedores': 'Comissões de Vendas',
  '/cobradores': 'Cobradores',
  '/cobradores/lista': 'Cobradores',
  '/cobradores/pendentes': 'Cobranças Pendentes',
  '/cobradores/rotas': 'Rotas de Cobrança',
  '/cobradores/carteira': 'Carteira',
  '/cobradores/recebimentos': 'Recebimentos de Campo',
  '/cobradores/impressoes': 'Impressões',
  '/cobradores/comissoes': 'Comissões de Cobradores',
  '/cobradores/relatorios': 'Relatórios de Cobrança',
  '/crm': 'CRM WhatsApp',
  '/crm/clientes': 'Clientes CRM',
  '/crm/contatos': 'Contatos WhatsApp',
  '/crm/conexao': 'Conexão WhatsApp',
  '/crm/dashboard': 'Dashboard CRM',
  '/frota': 'Frota',
  '/frota/veiculos': 'Veículos',
  '/frota/motoristas': 'Motoristas',
  '/frota/viagens': 'Viagens',
  '/frota/abastecimentos': 'Abastecimentos',
  '/frota/manutencao': 'Manutenção',
  '/frota/gastos': 'Gastos da Frota',
  '/frota/ocorrencias': 'Ocorrências',
};

function getBreadcrumb(pathname: string, search = ''): { section: string; page: string } {
  const label = routeLabels[pathname];
  if (label) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length > 1) {
      const sectionLabel = routeLabels['/' + parts[0]] || parts[0];
      return { section: sectionLabel, page: label };
    }
    return { section: 'APex-Plan', page: label };
  }

  // Handle dynamic routes like /clientes/:id
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2) {
    // Perfil dinâmico: por padrão tratar como contexto contratual.
    if (parts[0] === 'clientes' && parts.length === 2) {
      const tab = new URLSearchParams(search).get('tab');
      if (tab === 'geral') return { section: 'Clientes', page: 'Visão geral' };
      return { section: 'Contratos', page: 'Detalhes' };
    }
    const sectionLabel = routeLabels['/' + parts[0]] || parts[0];
    if (parts[parts.length - 1] === 'editar') return { section: sectionLabel, page: 'Editar' };
    return { section: sectionLabel, page: 'Detalhes' };
  }

  return { section: 'APex-Plan', page: 'Início' };
}

export const Header: React.FC<{
  onMenuClick: () => void;
  sidebarCollapsed?: boolean;
}> = ({ onMenuClick, sidebarCollapsed = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { section, page } = getBreadcrumb(location.pathname, location.search);
  const userInitial = (user?.nome || 'U').charAt(0).toUpperCase();
  const canGoBack = location.pathname !== '/inicio' && location.pathname !== '/dashboard';

  return (
    <header
      className={`fixed top-0 right-0 z-30 flex h-16 w-full max-w-full items-center justify-between border-b bg-white px-4 md:pr-6 transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        sidebarCollapsed ? 'md:pl-[92px]' : 'md:pl-[296px]'
      }`}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-md"
        >
          <Menu className="h-6 w-6" />
        </button>

        {canGoBack && (
          <button
            onClick={() => navigate(-1)}
            className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            title="Voltar para a tela anterior"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
        )}

        {/* Dynamic Breadcrumb */}
        <div className="hidden md:flex items-center gap-1.5 text-sm">
          <span className="text-gray-500">{section}</span>
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-medium text-gray-900">{page}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ContextoOperacionalSelector />
        {/* Notifications — badge hidden until real system is implemented */}
        <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
          <Bell className="h-5 w-5" />
        </button>

        <div className="h-8 w-px bg-gray-200 hidden md:block" />

        {/* User Avatar */}
        <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded-md transition-colors">
          <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold text-sm">
            {userInitial}
          </div>
          <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
            {user?.nome || 'Usuário'}
          </span>
        </div>
      </div>
    </header>
  );
};
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  Search,
  ArrowRight,
  Boxes,
  DollarSign,
  ClipboardList,
  Store,
  Users,
  Car,
  HandHeart,
  MessageCircle,
  Timer,
  Files,
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  ListChecks,
  BadgePercent,
  KanbanSquare,
  UserCheck,
  MessageSquareShare,
  Link2,
  ContactRound,
  ActivitySquare,
  ScanLine,
  CalendarClock,
  FileBadge2,
  Handshake,
  LineChart,
  Package,
  PackageSearch,
  PackagePlus,
  PackageMinus,
  Building2,
  Layers,
  ArrowLeftRight,
  Truck,
  ClipboardCheck,
  Monitor,
  CarFront,
  UserCog,
  Route,
  Fuel,
  Wallet,
  MapPin,
  Briefcase,
  DoorOpen,
  X,
  Sparkles,
  Star,
  Landmark,
  HandCoins,
  FileUp,
  PhoneCall,
  Receipt,
  CreditCard,
  Coins,
  FileText,
  Wrench,
  PieChart,
  type LucideIcon,
} from 'lucide-react';
import { canAccessDocumentosByRole } from '../lib/documentosRules';
import { usuarioPodeVerModulo, usuarioPodeVerRotina } from '../lib/acessoModulos';
import {
  favoritoIdModulo,
  favoritoIdPath,
  ordenarComFavoritosPrimeiro,
  useNavegacaoFavoritos,
} from '../lib/navegacaoFavoritos';
import { FavoritoEstrelaButton } from '../components/common/FavoritoEstrelaButton';

type Rotina = {
  numero: string;
  nome: string;
  path: string;
  /** ID da rotina no catálogo — filtra por matriz granular. */
  rotinaId?: string;
  icon: LucideIcon;
  descricao: string;
};

type Modulo = {
  id: string;
  codigo: string;
  nome: string;
  submodulo: string;
  icon: LucideIcon;
  iconBg: string;
  rotinas: Rotina[];
};

const modulos: Modulo[] = [
  {
    id: 'atendimentos',
    codigo: '700',
    nome: 'Atendimento',
    submodulo: 'Gestao de Atendimento',
    icon: HandHeart,
    iconBg: 'bg-pink-50 text-pink-600 dark:bg-pink-950/30 dark:text-pink-400 border-pink-100 dark:border-pink-850',
    rotinas: [
      { numero: '701', nome: 'Lista de Atendimentos', path: '/atendimentos', icon: ListChecks, descricao: 'Consulta e acompanha atendimentos registrados.' },
      { numero: '702', nome: 'Novo Atendimento', path: '/atendimentos/novo', icon: ClipboardPlus, descricao: 'Cadastra um novo atendimento no sistema.' },
      { numero: '704', nome: 'Salas e Capelas', path: '/atendimentos/salas', icon: DoorOpen, descricao: 'Gestão de salas de velório e reservas (12h).' },
      { numero: '705', nome: 'Serviços Funerários', path: '/atendimentos/servicos', icon: ClipboardList, descricao: 'Catálogo de serviços funerários cadastrados.' },
    ],
  },
  {
    id: 'planos',
    codigo: '300',
    nome: 'Plano',
    submodulo: 'Gestao Comercial',
    icon: ClipboardList,
    iconBg: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400 border-violet-100 dark:border-violet-850',
    rotinas: [
      { numero: '301', nome: 'Gerencia de Planos', path: '/planos/gerencia', icon: ClipboardList, descricao: 'Gerencia planos, valores e configuracoes comerciais.' },
      { numero: '302', nome: 'Categorias e Beneficios', path: '/planos/categorias', icon: BadgePercent, descricao: 'Organiza categorias e beneficios dos planos.' },
    ],
  },
  {
    id: 'vendas',
    codigo: '400',
    nome: 'Vendas',
    submodulo: 'Propostas',
    icon: Store,
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-100 dark:border-emerald-850',
    rotinas: [
      { numero: '401', nome: 'Propostas', path: '/venda/propostas', rotinaId: 'vendas_propostas', icon: ListChecks, descricao: 'Lista, acompanha e permite criar nova proposta.' },
    ],
  },
  {
    id: 'clientes',
    codigo: '500',
    nome: 'Clientes',
    submodulo: 'CRM',
    icon: Users,
    iconBg: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-400 border-cyan-100 dark:border-cyan-850',
    rotinas: [
      { numero: '501', nome: 'Todos os Clientes', path: '/clientes/lista', icon: Users, descricao: 'Exibe cadastro completo de clientes.' },
      { numero: '502', nome: 'Contratos', path: '/clientes/contratos', icon: FileBadge2, descricao: 'Controla contratos vinculados aos clientes.' },
      { numero: '503', nome: 'Pipeline CRM', path: '/clientes/oportunidades', icon: KanbanSquare, descricao: 'Acompanha oportunidades por etapa de venda.' },
      { numero: '504', nome: 'Tarefas CRM', path: '/clientes/tarefas', icon: UserCheck, descricao: 'Gerencia tarefas e pendencias do CRM.' },
    ],
  },
  {
    id: 'crm',
    codigo: '800',
    nome: 'CRM',
    submodulo: 'WhatsApp CRM',
    icon: MessageCircle,
    iconBg: 'bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400 border-teal-100 dark:border-teal-850',
    rotinas: [
      { numero: '801', nome: 'Modulo CRM', path: '/crm', icon: MessageCircle, descricao: 'Area principal do CRM WhatsApp.' },
      { numero: '802', nome: 'Conexao WhatsApp', path: '/crm/conexao', icon: Link2, descricao: 'Configura e valida conexao com WhatsApp.' },
      { numero: '803', nome: 'Clientes CRM', path: '/crm/clientes', icon: ContactRound, descricao: 'Gerencia base de clientes do CRM.' },
      { numero: '804', nome: 'Contatos WhatsApp', path: '/crm/contatos', icon: MessageSquareShare, descricao: 'Organiza contatos e conversas do WhatsApp.' },
      { numero: '805', nome: 'Dashboard CRM', path: '/crm/dashboard', icon: ActivitySquare, descricao: 'Mostra indicadores de desempenho do CRM.' },
    ],
  },
  {
    id: 'ponto',
    codigo: '900',
    nome: 'Ponto',
    submodulo: 'Jornada e Frequencia',
    icon: Timer,
    iconBg: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 border-indigo-100 dark:border-indigo-850',
    rotinas: [
      { numero: '901', nome: 'Registro de Ponto', path: '/ponto/registro', rotinaId: 'ponto_registro', icon: ScanLine, descricao: 'Registra entradas, saidas e pausas da jornada.' },
      { numero: '902', nome: 'Espelho de Ponto', path: '/ponto/espelho', rotinaId: 'ponto_espelho', icon: CalendarClock, descricao: 'Consulta espelho consolidado de ponto.' },
    ],
  },
  {
    id: 'rh',
    codigo: '960',
    nome: 'Recursos Humanos',
    submodulo: 'Gestão de Pessoas',
    icon: Briefcase,
    iconBg: 'bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400 border-teal-100 dark:border-teal-850',
    rotinas: [
      { numero: '961', nome: 'Colaboradores', path: '/rh/colaboradores', rotinaId: 'rh_colaboradores', icon: Users, descricao: 'Cadastro, admissão e dados complementares de colaboradores.' },
      { numero: '962', nome: 'Controle de Férias', path: '/rh/ferias', rotinaId: 'rh_ferias', icon: CalendarClock, descricao: 'Programação, gozo e histórico de férias de colaboradores.' },
      { numero: '965', nome: 'Painel de Presença', path: '/rh/presenca-banco-horas', rotinaId: 'ponto_espelho', icon: FileText, descricao: 'Presença da equipe, status operacional e banco de horas consolidado.' },
      { numero: '966', nome: 'Gestão de Jornada', path: '/ponto/jornadas', rotinaId: 'ponto_espelho', icon: Timer, descricao: 'Definição de regimes de jornada (8h, 6h, 12x36) e escalas dos colaboradores.' },
      { numero: '963', nome: 'Gestão de Benefícios', path: '/rh/beneficios', rotinaId: 'rh_beneficios', icon: Wallet, descricao: 'Atribuição e controle de benefícios dos colaboradores.' },
      { numero: '964', nome: 'Histórico de Ocorrências', path: '/rh/ocorrencias', rotinaId: 'rh_ocorrencias', icon: ClipboardCheck, descricao: 'Advertências, suspensões, promoções e afastamentos.' },
    ],
  },
  {
    id: 'documentos',
    codigo: '950',
    nome: 'Documentos',
    submodulo: 'Modelos Padrao',
    icon: Files,
    iconBg: 'bg-slate-50 text-slate-600 dark:bg-slate-950/30 dark:text-slate-400 border-slate-100 dark:border-slate-850',
    rotinas: [
      { numero: '951', nome: 'Modelos de Documentos', path: '/documentos/modelos', icon: Files, descricao: 'Cria e edita modelos padrao de documentos.' },
    ],
  },
  {
    id: 'financeiro',
    codigo: '200',
    nome: 'Financeiro',
    submodulo: 'Contas e Cobranca',
    icon: DollarSign,
    iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border-amber-100 dark:border-amber-850',
    rotinas: [
      { numero: '201', nome: 'Visão Geral Financeira', path: '/financeiro/dashboard', rotinaId: 'fin_dashboard', icon: Landmark, descricao: 'Dashboard com indicadores principais de receitas, despesas e saldos.' },
      { numero: '202', nome: 'Baixa de Parcelas', path: '/financeiro/baixa-parcelas', rotinaId: 'fin_baixa_parcelas', icon: HandCoins, descricao: 'Recebimento de mensalidades no balcão de atendimento.' },
      { numero: '203', nome: 'Importação OFX / CNAB', path: '/financeiro/importacao-ofx', rotinaId: 'fin_ofx', icon: FileUp, descricao: 'OFX ou retorno Sicredi (.crt) — baixa automática de boletos.' },
      { numero: '204', nome: 'Central de Cobrança', path: '/financeiro/cobranca', rotinaId: 'fin_cobranca', icon: PhoneCall, descricao: 'Central de cobrança com fila de contatos, promessas e recebimento.' },
      { numero: '205', nome: 'Tesouraria', path: '/financeiro/tesouraria', rotinaId: 'fin_tesouraria', icon: Wallet, descricao: 'Abertura, fechamento do dia e conferência na tesouraria.' },
      { numero: '206', nome: 'Contas a Receber', path: '/financeiro/contas-receber', rotinaId: 'fin_receber', icon: Receipt, descricao: 'Gerenciamento de recebíveis, parcelas e cobranças de clientes.' },
      { numero: '207', nome: 'Contas a Pagar', path: '/financeiro/contas-pagar', rotinaId: 'fin_pagar', icon: CreditCard, descricao: 'Controle de despesas, pagamentos e vencimentos a fornecedores.' },
      { numero: '208', nome: 'Fluxo de Caixa', path: '/financeiro/fluxo-caixa', rotinaId: 'fin_fluxo', icon: Coins, descricao: 'Análise e histórico detalhado das movimentações de entradas e saídas.' },
      { numero: '209', nome: 'Contas Bancárias', path: '/financeiro/contas-bancarias', rotinaId: 'fin_contas_bancarias', icon: Building2, descricao: 'Cadastro, conciliação e movimentações de contas bancárias.' },
      { numero: '210', nome: 'Plano de Contas', path: '/financeiro/plano-contas', rotinaId: 'fin_plano_contas', icon: FileText, descricao: 'Visualização hierárquica e estruturada das contas contábeis.' },
      { numero: '211', nome: 'Naturezas Financeiras', path: '/financeiro/naturezas', rotinaId: 'fin_plano_contas', icon: FileText, descricao: 'Estrutura de categorias de receitas e despesas organizadas.' },
      { numero: '212', nome: 'Centros de Custo', path: '/financeiro/centros-custo', rotinaId: 'fin_centros_custo', icon: PieChart, descricao: 'Gestão de centros de custo e distribuição de resultados.' },
      { numero: '213', nome: 'DRE', path: '/financeiro/dre', rotinaId: 'fin_dre', icon: LineChart, descricao: 'Demonstração do Resultado do Exercício com análise financeira vertical.' },
    ],
  },
  {
    id: 'estoque',
    codigo: '100',
    nome: 'Estoque',
    submodulo: 'Produtos e Movimentacao',
    icon: Boxes,
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border-blue-100 dark:border-blue-850',
    rotinas: [
      { numero: '101', nome: 'Produtos', path: '/estoque/produtos', icon: Package, descricao: 'Cadastro e controle dos produtos em estoque.' },
      { numero: '102', nome: 'Filiais e depositos', path: '/estoque/filiais-depositos', icon: Building2, descricao: 'Unidades, depósitos centrais e estoque em motorista ou veículo.' },
      { numero: '103', nome: 'Kits', path: '/estoque/kits', icon: PackageSearch, descricao: 'Gerencia kits compostos por varios itens.' },
      { numero: '104', nome: 'Entradas', path: '/estoque/entradas', icon: PackagePlus, descricao: 'Registra entradas e reposicoes de estoque.' },
      { numero: '105', nome: 'Saidas', path: '/estoque/saidas', icon: PackageMinus, descricao: 'Saidas manuais com controle e recibo.' },
      { numero: '106', nome: 'Transferencias', path: '/estoque/transferencias', icon: Layers, descricao: 'Transfira saldos entre depósitos da mesma empresa com confirmacao.' },
      { numero: '107', nome: 'Movimentacoes', path: '/estoque/movimentacoes', icon: ArrowLeftRight, descricao: 'Historico de ajustes, transferencias efetivadas e saidas.' },
      { numero: '108', nome: 'Fornecedores', path: '/estoque/fornecedores', icon: Truck, descricao: 'Cadastro de fornecedores vinculados ao estoque.' },
      { numero: '109', nome: 'Contagem de estoque', path: '/estoque/contagens', icon: ClipboardCheck, descricao: 'Inventario fisico por categoria, produto ou geral.' },
      { numero: '110', nome: 'Equipamentos', path: '/estoque/equipamentos', icon: Monitor, descricao: 'Registro e controle de equipamentos internos.' },
    ],
  },
  {
    id: 'frota',
    codigo: '600',
    nome: 'Frota',
    submodulo: 'Operacao',
    icon: Car,
    iconBg: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 border-rose-100 dark:border-rose-850',
    rotinas: [
      { numero: '601', nome: 'Veiculos', path: '/frota/veiculos', icon: CarFront, descricao: 'Gerencia cadastro e status dos veiculos.' },
      { numero: '602', nome: 'Motoristas', path: '/frota/motoristas', icon: UserCog, descricao: 'Controla dados e habilitacoes de motoristas.' },
      { numero: '603', nome: 'Viagens', path: '/frota/viagens', icon: Route, descricao: 'Planeja e acompanha operacoes de viagem.' },
      { numero: '604', nome: 'Abastecimentos', path: '/frota/abastecimentos', icon: Fuel, descricao: 'Registra consumo e custos de combustivel.' },
      { numero: '605', nome: 'Manutenção', path: '/frota/manutencao', icon: Wrench, descricao: 'Registro e controle de manutenções preventivas e corretivas.' },
      { numero: '606', nome: 'Gastos', path: '/frota/gastos', icon: DollarSign, descricao: 'Controle de despesas gerais vinculadas aos veículos.' },
    ],
  },
  {
    id: 'cobradores',
    codigo: '650',
    nome: 'Cobradores',
    submodulo: 'Cobranca Externa',
    icon: Briefcase,
    iconBg: 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400 border-orange-100 dark:border-orange-850',
    rotinas: [
      { numero: '651', nome: 'Lista de Cobradores', path: '/cobradores/lista', icon: Users, descricao: 'Cadastro e gestao dos cobradores.' },
      { numero: '652', nome: 'Carteira por Cobrador', path: '/cobradores/carteira', icon: Wallet, descricao: 'Contratos e clientes atribuidos ao cobrador.' },
      { numero: '653', nome: 'Rotas', path: '/cobradores/rotas', icon: MapPin, descricao: 'Planejamento de rotas de cobranca.' },
      { numero: '655', nome: 'Cobranças Pendentes', path: '/cobradores/pendentes', icon: ClipboardCheck, descricao: 'Acompanhamento de cobranças pendentes e recebimentos externos.' },
    ],
  },
  {
    id: 'comissoes',
    codigo: '950',
    nome: 'Comissões',
    submodulo: 'Gestão de Comissões',
    icon: Coins,
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-100 dark:border-emerald-850',
    rotinas: [
      { numero: '951', nome: 'Menu de Comissões', path: '/comissoes', icon: Coins, descricao: 'Painel centralizador de comissões por departamento.' },
      { numero: '952', nome: 'Comissão de Cobradores', path: '/comissoes/cobradores', rotinaId: 'com_cobradores', icon: Wallet, descricao: 'Comissões dos cobradores sobre os recebimentos em campo.' },
      { numero: '953', nome: 'Comissão de Atendentes', path: '/comissoes/atendimentos', rotinaId: 'com_atendentes', icon: UserCheck, descricao: 'Comissões de atendentes e agentes funerários por OS concluída.' },
      { numero: '954', nome: 'Comissão de Vendedores', path: '/comissoes/vendedores', rotinaId: 'com_vendedores', icon: BadgePercent, descricao: 'Comissões de vendedores sobre contratos e adesões.' },
    ],
  },
];

// Mapeamento de estilos ricos para cada módulo para elevar a estética visual e o profissionalismo
const moduleThemeStyles: Record<string, {
  gradient: string;
  borderLeft: string;
  glow: string;
  textColor: string;
  accentBg: string;
  hoverBorder: string;
}> = {
  atendimentos: {
    gradient: 'from-pink-500 to-rose-600',
    borderLeft: 'border-l-pink-500',
    glow: 'shadow-pink-500/10 dark:shadow-pink-950/15',
    textColor: 'text-pink-600 dark:text-pink-400',
    accentBg: 'bg-pink-500',
    hoverBorder: 'hover:border-pink-300 dark:hover:border-pink-700',
  },
  planos: {
    gradient: 'from-violet-500 to-purple-600',
    borderLeft: 'border-l-violet-500',
    glow: 'shadow-violet-500/10 dark:shadow-violet-950/15',
    textColor: 'text-violet-600 dark:text-violet-400',
    accentBg: 'bg-violet-500',
    hoverBorder: 'hover:border-violet-300 dark:hover:border-violet-700',
  },
  vendas: {
    gradient: 'from-emerald-500 to-teal-600',
    borderLeft: 'border-l-emerald-500',
    glow: 'shadow-emerald-500/10 dark:shadow-emerald-950/15',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-500',
    hoverBorder: 'hover:border-emerald-300 dark:hover:border-emerald-700',
  },
  clientes: {
    gradient: 'from-cyan-500 to-blue-600',
    borderLeft: 'border-l-cyan-500',
    glow: 'shadow-cyan-500/10 dark:shadow-cyan-950/15',
    textColor: 'text-cyan-600 dark:text-cyan-400',
    accentBg: 'bg-cyan-500',
    hoverBorder: 'hover:border-cyan-300 dark:hover:border-cyan-700',
  },
  crm: {
    gradient: 'from-teal-500 to-emerald-600',
    borderLeft: 'border-l-teal-500',
    glow: 'shadow-teal-500/10 dark:shadow-teal-950/15',
    textColor: 'text-teal-600 dark:text-teal-400',
    accentBg: 'bg-teal-500',
    hoverBorder: 'hover:border-teal-300 dark:hover:border-teal-700',
  },
  ponto: {
    gradient: 'from-indigo-500 to-blue-600',
    borderLeft: 'border-l-indigo-500',
    glow: 'shadow-indigo-500/10 dark:shadow-indigo-950/15',
    textColor: 'text-indigo-600 dark:text-indigo-400',
    accentBg: 'bg-indigo-500',
    hoverBorder: 'hover:border-indigo-300 dark:hover:border-indigo-700',
  },
  documentos: {
    gradient: 'from-slate-500 to-slate-700',
    borderLeft: 'border-l-slate-500',
    glow: 'shadow-slate-500/10 dark:shadow-slate-950/15',
    textColor: 'text-slate-600 dark:text-slate-400',
    accentBg: 'bg-slate-600',
    hoverBorder: 'hover:border-slate-300 dark:hover:border-slate-700',
  },
  financeiro: {
    gradient: 'from-amber-500 to-orange-600',
    borderLeft: 'border-l-amber-500',
    glow: 'shadow-amber-500/10 dark:shadow-amber-950/15',
    textColor: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-500',
    hoverBorder: 'hover:border-amber-300 dark:hover:border-amber-700',
  },
  estoque: {
    gradient: 'from-blue-500 to-indigo-600',
    borderLeft: 'border-l-blue-500',
    glow: 'shadow-blue-500/10 dark:shadow-blue-950/15',
    textColor: 'text-blue-600 dark:text-blue-400',
    accentBg: 'bg-blue-500',
    hoverBorder: 'hover:border-blue-300 dark:hover:border-blue-700',
  },
  frota: {
    gradient: 'from-rose-500 to-red-600',
    borderLeft: 'border-l-rose-500',
    glow: 'shadow-rose-500/10 dark:shadow-rose-950/15',
    textColor: 'text-rose-600 dark:text-rose-400',
    accentBg: 'bg-rose-500',
    hoverBorder: 'hover:border-rose-300 dark:hover:border-rose-700',
  },
  cobradores: {
    gradient: 'from-orange-500 to-amber-600',
    borderLeft: 'border-l-orange-500',
    glow: 'shadow-orange-500/10 dark:shadow-orange-950/15',
    textColor: 'text-orange-600 dark:text-orange-400',
    accentBg: 'bg-orange-500',
    hoverBorder: 'hover:border-orange-300 dark:hover:border-orange-700',
  },
  comissoes: {
    gradient: 'from-emerald-500 to-green-650',
    borderLeft: 'border-l-emerald-500',
    glow: 'shadow-emerald-500/10 dark:shadow-emerald-950/15',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-500',
    hoverBorder: 'hover:border-emerald-300 dark:hover:border-emerald-700',
  },
};

const moduloHubPath: Record<string, string> = {
  atendimentos: '/atendimentos',
  planos: '/planos',
  vendas: '/venda',
  clientes: '/clientes',
  crm: '/crm',
  ponto: '/ponto',
  documentos: '/documentos',
  financeiro: '/financeiro',
  estoque: '/estoque',
  frota: '/frota',
  cobradores: '/cobradores',
  comissoes: '/comissoes',
};

export const InicioModulos: React.FC = () => {
  const { user } = useAuth();
  const { favoritos, isFavorito, toggle } = useNavegacaoFavoritos(user?.id);
  const [busca, setBusca] = useState('');
  
  // Estado para armazenar o módulo selecionado para exibição no Modal
  const [moduloSelecionado, setModuloSelecionado] = useState<Modulo | null>(null);
  // Estado de filtro de rotina interno no próprio Modal para facilitar navegação em módulos densos (ex: Estoque)
  const [buscaModal, setBuscaModal] = useState('');

  const termo = busca.trim().toLowerCase();

  const modulosPermitidos = useMemo(() => {
    const isMobileApp = import.meta.env.VITE_APP_MODE === 'colaboradores' || (window as any).__MOBILE_APP__;
    const role = (user?.role || '').toLowerCase();
    const isAdminOuDonoEmpresa = ['admin', 'admin_sistema', 'admin_empresa'].includes(role);
    
    let list = modulos;
    if (!isAdminOuDonoEmpresa) {
      const perms = user?.permissoes as Record<string, unknown> | undefined;
      list = modulos
        .filter((modulo) => {
          if (modulo.id === 'documentos' && !canAccessDocumentosByRole(role)) {
            return false;
          }
          return usuarioPodeVerModulo(user?.role, perms, modulo.id, user?.roles_extra);
        })
        .map((modulo) => ({
          ...modulo,
          rotinas: modulo.rotinas.filter((rotina) => {
            if (!rotina.rotinaId) return true;
            return usuarioPodeVerRotina(perms, rotina.rotinaId);
          }),
        }))
        .filter((modulo) => modulo.rotinas.length > 0);
    }

    if (isMobileApp) {
      const allowedIds = new Set(['ponto', 'frota', 'vendas', 'cobradores']);
      list = list.filter((m) => allowedIds.has(m.id));
    }
    return list;
  }, [user]);

  const modulosFiltrados = useMemo(() => {
    if (!termo) return modulosPermitidos;

    return modulosPermitidos
      .map((modulo) => ({
        ...modulo,
        rotinas: modulo.rotinas.filter(
          (rotina) =>
            rotina.nome.toLowerCase().includes(termo) || rotina.numero.toLowerCase().includes(termo),
        ),
      }))
      .filter((modulo) => modulo.rotinas.length > 0);
  }, [termo, modulosPermitidos]);

  const modulosExibidos = useMemo(
    () =>
      ordenarComFavoritosPrimeiro(modulosFiltrados, favoritos, (m) => favoritoIdModulo(m.id)),
    [modulosFiltrados, favoritos],
  );

  const favoritosAcessiveis = useMemo(() => {
    const idsModulos = new Set(modulosPermitidos.map((m) => favoritoIdModulo(m.id)));
    const idsRotinas = new Set(
      modulosPermitidos.flatMap((m) => m.rotinas.map((r) => favoritoIdPath(r.path))),
    );
    return favoritos.filter((f) => idsModulos.has(f.id) || idsRotinas.has(f.id));
  }, [favoritos, modulosPermitidos]);

  const totalRotinas = modulosFiltrados.reduce((acc, modulo) => acc + modulo.rotinas.length, 0);

  const rotinasEncontradas = useMemo(
    () =>
      modulosFiltrados.flatMap((modulo) =>
        modulo.rotinas.map((rotina) => ({
          ...rotina,
          moduloCodigo: modulo.codigo,
          moduloNome: modulo.nome,
          moduloId: modulo.id,
          iconBg: modulo.iconBg,
        })),
      ),
    [modulosFiltrados],
  );

  // Filtra as rotinas do módulo aberto no Modal de acordo com a busca interna do Modal
  const rotinasModuloAbertoFiltradas = useMemo(() => {
    if (!moduloSelecionado) return [];
    if (!buscaModal.trim()) return moduloSelecionado.rotinas;
    const termoModal = buscaModal.trim().toLowerCase();
    return moduloSelecionado.rotinas.filter(
      (rotina) =>
        rotina.nome.toLowerCase().includes(termoModal) ||
        rotina.numero.toLowerCase().includes(termoModal)
    );
  }, [moduloSelecionado, buscaModal]);

  const handleAbrirModulo = (modulo: Modulo) => {
    setModuloSelecionado(modulo);
    setBuscaModal('');
  };

  const handleFecharModulo = () => {
    setModuloSelecionado(null);
    setBuscaModal('');
  };

  // Obtém as iniciais do usuário para o avatar
  const avatarIniciais = useMemo(() => {
    if (!user?.nome) return 'US';
    const partes = user.nome.trim().split(' ');
    if (partes.length >= 2) {
      return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
    }
    return partes[0].slice(0, 2).toUpperCase();
  }, [user]);

  // Função para formatar o nome da role para algo amigável em português
  const formatarRole = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin':
      case 'admin_sistema':
        return 'Administrador do Sistema';
      case 'admin_empresa':
        return 'Administrador da Empresa';
      case 'cobrador':
        return 'Operador Cobrador';
      case 'vendedor':
        return 'Agente de Vendas';
      default:
        return role || 'Operador';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 -m-6 px-6 py-6 space-y-6">
      {/* HEADER EXECUTIVO */}
      <header
        className="relative overflow-hidden rounded-2xl text-white"
        style={{ background: 'linear-gradient(135deg, var(--accent-color, #1e3a5f) 0%, #0f2342 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
          <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="white" /></pattern></defs>
            <rect width="100%" height="100%" fill="url(#dot-grid)" />
          </svg>
        </div>
        <div className="relative z-10 px-8 pt-7 pb-0 flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-base font-black select-none">
              {avatarIniciais}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest bg-white/15 border border-white/10 px-2.5 py-0.5 rounded-full text-white/80">
                  {formatarRole(user?.role || '')}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                  <Sparkles className="h-3 w-3" /> APex-Plan ERP
                </span>
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-white truncate">
                Olá, {user?.nome?.split(' ')[0] || 'Usuário'} — bem-vindo ao painel operacional
              </h1>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <div className="bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
              <p className="text-[9px] font-bold uppercase tracking-widest text-blue-200 mb-0.5">Módulos</p>
              <p className="text-xl font-black text-white leading-none">{modulosPermitidos.length}</p>
            </div>
            <div className="bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
              <p className="text-[9px] font-bold uppercase tracking-widest text-blue-200 mb-0.5">Rotinas</p>
              <p className="text-xl font-black text-white leading-none">{totalRotinas}</p>
            </div>
          </div>
        </div>
        <div className="relative z-10 px-8 py-5">
          <div className="relative max-w-lg group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300 group-focus-within:text-white transition-colors pointer-events-none" />
            <input
              id="busca-rotina" type="text" value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar módulo ou rotina..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white/12 border border-white/15 text-white text-sm placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-white/25 focus:bg-white/18 transition-all"
            />
            {busca && (
              <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* FAVORITOS — início rápido */}
      {!termo && favoritosAcessiveis.length > 0 && (
        <section className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900 dark:border-amber-900/50 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <h2 className="text-sm font-black uppercase tracking-widest text-amber-800 dark:text-amber-300">
              Favoritos
            </h2>
            <span className="text-[10px] font-bold text-amber-600/80 dark:text-amber-500/80">
              ({favoritosAcessiveis.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {favoritosAcessiveis.map((f) => (
              <Link
                key={f.id}
                to={f.path}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm hover:border-amber-300 hover:shadow-md transition-all dark:bg-slate-900 dark:border-amber-800 dark:text-white"
              >
                {f.label}
                <ArrowRight className="h-3.5 w-3.5 text-amber-500" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* INDICADOR DE BUSCA */}
      {termo && (
        <section className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-slate-600 dark:text-slate-400 animate-[fadeIn_0.2s_ease-out]">
          <div>
            Resultado da pesquisa: <span className="font-bold text-slate-900 dark:text-white">{totalRotinas}</span> rotina(s) encontrada(s) para <span className="italic font-semibold text-blue-600">"{busca}"</span>.
          </div>
          <button 
            onClick={() => setBusca('')}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider"
          >
            Limpar Filtro
          </button>
        </section>
      )}

      {/* BUSCA: resultados */}
      {termo ? (
        <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rotinasEncontradas.map((rotina) => {
            const mTheme = moduleThemeStyles[rotina.moduloId] || moduleThemeStyles.documentos;
            const favId = favoritoIdPath(rotina.path);
            return (
              <div
                key={rotina.numero}
                className="group relative flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all duration-150"
              >
              <Link to={rotina.path} className="flex flex-1 items-start gap-3 min-w-0">
                <div className={`flex-shrink-0 rounded-lg p-2.5 ${rotina.iconBg} mt-0.5 group-hover:scale-105 transition-transform`}>
                  <rotina.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[9px] font-black uppercase tracking-widest ${mTheme.textColor} mb-0.5`}>
                    {rotina.moduloNome} · {rotina.numero}
                  </p>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                    {rotina.nome}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{rotina.descricao}</p>
                </div>
                <ArrowRight className="flex-shrink-0 h-4 w-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all mt-1" />
              </Link>
              <FavoritoEstrelaButton
                ativo={isFavorito(favId)}
                onToggle={() =>
                  toggle({ id: favId, label: rotina.nome, path: rotina.path })
                }
                className="mt-0.5"
              />
              </div>
            );
          })}
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modulosExibidos.map((modulo, index) => {
            const mTheme = moduleThemeStyles[modulo.id] || moduleThemeStyles.documentos;
            const favModId = favoritoIdModulo(modulo.id);
            const hubPath = moduloHubPath[modulo.id] || modulo.rotinas[0]?.path || '/inicio';
            return (
              <article
                key={modulo.id}
                onClick={() => handleAbrirModulo(modulo)}
                style={{ animationDelay: `${index * 40}ms` }}
                className="group flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden"
              >
                <div className={`h-[3px] w-full bg-gradient-to-r ${mTheme.gradient}`} />
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <div className={`rounded-xl p-3 ${modulo.iconBg} group-hover:scale-105 transition-transform duration-200`}>
                      <modulo.icon className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <FavoritoEstrelaButton
                        ativo={isFavorito(favModId)}
                        onToggle={() =>
                          toggle({ id: favModId, label: modulo.nome, path: hubPath })
                        }
                      />
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${mTheme.textColor} border-current/30 bg-slate-50 dark:bg-slate-800 mt-0.5`}>
                        {modulo.rotinas.length} {modulo.rotinas.length === 1 ? 'rotina' : 'rotinas'}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Módulo {modulo.codigo}</p>
                    <h2 className="text-base font-black text-slate-800 dark:text-white tracking-tight mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {modulo.nome}
                    </h2>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">{modulo.submodulo}</p>
                    <ul className="space-y-1.5">
                      {modulo.rotinas.slice(0, 3).map((r) => (
                        <li key={r.numero} className="flex items-center gap-2 min-w-0">
                          <span className={`w-1 h-1 rounded-full flex-shrink-0 bg-gradient-to-r ${mTheme.gradient} opacity-70`} />
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.nome}</span>
                        </li>
                      ))}
                      {modulo.rotinas.length > 3 && (
                        <li className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full flex-shrink-0 bg-slate-300 dark:bg-slate-600" />
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">+{modulo.rotinas.length - 3} mais</span>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Clique para acessar</span>
                  <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${mTheme.textColor} group-hover:gap-2.5 transition-all duration-200`}>
                    Ver rotinas <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {!modulosFiltrados.length && (
        <div className="text-center py-16">
          <Search className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
          <p className="font-bold text-slate-600 dark:text-slate-400 mb-1">Nenhum resultado</p>
          <p className="text-sm text-slate-400 mb-4">Tente outro termo ou código (ex: 200, 700)</p>
          <button onClick={() => setBusca('')} className="text-xs font-bold uppercase tracking-wider text-blue-600 hover:underline">Limpar busca</button>
        </div>
      )}

      {moduloSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-sm" onClick={handleFecharModulo}>
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
            <div className={`h-1 w-full bg-gradient-to-r ${moduleThemeStyles[moduloSelecionado.id]?.gradient || 'from-slate-500 to-slate-700'}`} />
            <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3.5">
                <div className={`rounded-xl p-3 ${moduloSelecionado.iconBg}`}>
                  {React.createElement(moduloSelecionado.icon, { className: 'h-5 w-5' })}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[9px] font-black uppercase tracking-widest ${moduleThemeStyles[moduloSelecionado.id]?.textColor || 'text-slate-500'}`}>
                      Módulo {moduloSelecionado.codigo}
                    </span>
                    <span className="text-[9px] text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{moduloSelecionado.submodulo}</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">{moduloSelecionado.nome}</h3>
                </div>
              </div>
              <button type="button" onClick={handleFecharModulo} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {moduloSelecionado.rotinas.length > 3 && (
              <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
                <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <input type="text" value={buscaModal} onChange={(e) => setBuscaModal(e.target.value)}
                  placeholder="Filtrar rotinas..." className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none" />
                {buscaModal && <button onClick={() => setBuscaModal('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-3.5 w-3.5" /></button>}
              </div>
            )}

            <div className="overflow-y-auto flex-1 p-6">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                {rotinasModuloAbertoFiltradas.length} rotina(s) disponível(is)
              </p>
              {rotinasModuloAbertoFiltradas.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {rotinasModuloAbertoFiltradas.map((rotina) => {
                    const mTheme = moduleThemeStyles[moduloSelecionado.id] || moduleThemeStyles.documentos;
                    const favId = favoritoIdPath(rotina.path);
                    return (
                      <div
                        key={rotina.numero}
                        className="group relative flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:shadow-sm transition-all duration-150"
                      >
                      <Link to={rotina.path} onClick={handleFecharModulo} className="flex flex-1 items-start gap-3 min-w-0"
                      >
                        <div className={`flex-shrink-0 rounded-lg p-2 ${moduloSelecionado.iconBg} mt-0.5 group-hover:scale-105 transition-transform`}>
                          <rotina.icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${mTheme.textColor}`}>{rotina.numero}</span>
                          <h4 className="text-xs font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                            {rotina.nome}
                          </h4>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{rotina.descricao}</p>
                        </div>
                        <ArrowRight className="flex-shrink-0 h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all mt-1" />
                      </Link>
                      <FavoritoEstrelaButton
                        ativo={isFavorito(favId)}
                        onToggle={() =>
                          toggle({ id: favId, label: rotina.nome, path: rotina.path })
                        }
                        className="mt-0.5"
                      />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-sm text-slate-400">Nenhuma rotina para "{buscaModal}"</div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/20">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">APex-Plan ERP</span>
              <button type="button" onClick={handleFecharModulo} className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors uppercase tracking-wider">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

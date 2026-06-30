import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  HandHeart,
  DollarSign,
  BarChart,
  Settings,
  LogOut,
  Shield,
  DoorOpen,
  ChevronDown,
  ChevronRight,
  Receipt,
  CreditCard,
  Coins,
  Building2,
  FileText,
  PieChart,
  Target,
  CheckSquare,
  Plus,
  ListChecks,
  Tags,
  HandCoins,
  PhoneCall,
  Landmark,
  Boxes,
  Layers,
  PackagePlus,
  ArrowLeftRight,
  Truck,
  MessageCircle,
  Car,
  Fuel,
  Wrench,
  Map,
  Wallet,
  MapPin,
  ClipboardCheck,
  BriefcaseBusiness,
  Monitor,
  PackageMinus,
  Warehouse,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Printer,
  Star,
  Store,
  Timer,
  Activity,
  CalendarClock,
  Files,
  FileUp,
  KeyRound,
  User,
  UserCheck,
  BadgePercent,
} from 'lucide-react';
import { canAccessDocumentosByRole } from '../../lib/documentosRules';
import { usuarioPodeVerModulo, usuarioPodeVerRotina, usuarioPossuiMatrizGranular } from '../../lib/acessoModulos';
import { usuarioPodeAcessarRotinaFinanceiraPorPath } from '../../lib/financeiroMenuPermissoes';
import { buildConfigPath, parseConfigTabFromSearch } from '../../lib/configNav';
import { FENIX_LOGO_PATH, resolveLogoUrl } from '../../lib/fenixLogo';
import {
  favoritoIdModulo,
  favoritoIdPath,
  type FavoritoNav,
  useNavegacaoFavoritos,
} from '../../lib/navegacaoFavoritos';
import { FavoritoEstrelaButton } from '../common/FavoritoEstrelaButton';
import { resolveModulePath } from '../../lib/TabsContext';

function SidebarLogo({
  logoUrl,
  alt,
  expanded,
  fallbackLetter,
}: {
  logoUrl?: string | null;
  alt: string;
  expanded: boolean;
  fallbackLetter: string;
}) {
  const primarySrc = logoUrl?.trim() || '';
  const [src, setSrc] = useState(primarySrc || FENIX_LOGO_PATH);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(src) && !failed;

  useEffect(() => {
    setFailed(false);
    setSrc(primarySrc || FENIX_LOGO_PATH);
  }, [primarySrc]);

  const handleImgError = () => {
    if (src !== FENIX_LOGO_PATH) {
      setSrc(FENIX_LOGO_PATH);
      return;
    }
    setFailed(true);
  };

  if (!showImg) {
    return (
      <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-black text-white">{fallbackLetter}</span>
      </div>
    );
  }

  if (expanded) {
    return (
      <div className="flex-1 min-w-0">
        <div className="inline-flex max-w-full items-center rounded-lg bg-white px-2.5 py-1.5">
          <img
            src={src}
            alt={alt}
            referrerPolicy="no-referrer"
            className="max-h-10 w-auto max-w-[168px] object-contain object-left"
            onError={handleImgError}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        className="max-h-9 max-w-9 object-contain"
        onError={handleImgError}
      />
    </div>
  );
}

const planosSubItems = [
  { icon: ListChecks, label: 'Gerência de Planos', path: '/planos/gerencia' },
  { icon: Tags, label: 'Benefícios', path: '/planos/categorias' },
];

const vendaSubItems = [
  { icon: FileText, label: 'Propostas', path: '/venda/propostas' },
];

const clientesSubItems = [
  { icon: Users, label: 'Clientes', path: '/clientes/lista' },
  { icon: Shield, label: 'Contratos', path: '/clientes/contratos' },
  { icon: Target, label: 'Pipeline CRM', path: '/clientes/oportunidades' },
  { icon: CheckSquare, label: 'Tarefas CRM', path: '/clientes/tarefas' },
];

const financeiroSubItems = [
  { icon: DollarSign, label: 'Dashboard Financeiro', path: '/financeiro/dashboard' },
  { icon: HandCoins, label: 'Baixa de Parcelas', path: '/financeiro/baixa-parcelas' },
  { icon: FileUp, label: 'Importação OFX / CNAB', path: '/financeiro/importacao-ofx' },
  { icon: PhoneCall, label: 'Cobrança', path: '/financeiro/cobranca' },
  { icon: Landmark, label: 'Tesouraria', path: '/financeiro/tesouraria' },
  { icon: Receipt, label: 'Contas a Receber', path: '/financeiro/contas-receber' },
  { icon: CreditCard, label: 'Contas a Pagar', path: '/financeiro/contas-pagar' },
  { icon: Coins, label: 'Fluxo de Caixa', path: '/financeiro/fluxo-caixa' },
  { icon: Building2, label: 'Contas Bancárias', path: '/financeiro/contas-bancarias' },
  { icon: FileText, label: 'Plano de Contas', path: '/financeiro/plano-contas' },
  { icon: FileText, label: 'Naturezas Financeiras', path: '/financeiro/naturezas' },
  { icon: PieChart, label: 'Centros de Custo', path: '/financeiro/centros-custo' },
  { icon: BarChart, label: 'DRE', path: '/financeiro/dre' },
];

const estoqueSubItems = [
  { icon: Boxes, label: 'Produtos', path: '/estoque/produtos' },
  { icon: Warehouse, label: 'Filiais e depósitos', path: '/estoque/filiais-depositos' },
  { icon: Layers, label: 'Transferências', path: '/estoque/transferencias' },
  { icon: PackagePlus, label: 'Kits', path: '/estoque/kits' },
  { icon: PackagePlus, label: 'Entradas', path: '/estoque/entradas' },
  { icon: PackageMinus, label: 'Saídas', path: '/estoque/saidas' },
  { icon: ArrowLeftRight, label: 'Movimentações', path: '/estoque/movimentacoes' },
  { icon: Truck, label: 'Fornecedores', path: '/estoque/fornecedores' },
  { icon: ClipboardCheck, label: 'Contagem de Estoque', path: '/estoque/contagens' },
  { icon: Monitor, label: 'Equipamentos', path: '/estoque/equipamentos' },
];

const frotaSubItems = [
  { icon: Car, label: 'Veículos', path: '/frota/veiculos' },
  { icon: Users, label: 'Motoristas', path: '/frota/motoristas' },
  { icon: Map, label: 'Viagens', path: '/frota/viagens' },
  { icon: Fuel, label: 'Abastecimentos', path: '/frota/abastecimentos' },
  { icon: Wrench, label: 'Manutenção', path: '/frota/manutencao' },
  { icon: DollarSign, label: 'Gastos da Frota', path: '/frota/gastos' },
];

const cobradoresSubItems = [
  { icon: Users, label: 'Cobradores', path: '/cobradores/lista' },
  { icon: ClipboardCheck, label: 'Cobranças Pendentes', path: '/cobradores/pendentes' },
  { icon: MapPin, label: 'Rotas de Cobrança', path: '/cobradores/rotas' },
  { icon: BriefcaseBusiness, label: 'Carteira', path: '/cobradores/carteira' },
];

const cobradoresSubItemsPerfilCobrador = [
  { icon: ClipboardCheck, label: 'Minha carteira', path: '/cobradores/pendentes' },
  { icon: Printer, label: 'Reimprimir recibo', path: '/cobradores/pendentes?aba=reimprimir' },
];

const pontoSubItems = [
  { icon: Timer, label: 'Registro de Ponto', path: '/ponto/registro' },
  { icon: CalendarClock, label: 'Espelho de Ponto', path: '/ponto/espelho' },
];

const rhSubItems = [
  { icon: Users, label: 'Colaboradores', path: '/rh/colaboradores', rotinaId: 'rh_colaboradores' },
  { icon: CalendarClock, label: 'Controle de Férias', path: '/rh/ferias', rotinaId: 'rh_ferias' },
  { icon: Activity, label: 'Painel de Presença', path: '/rh/presenca-banco-horas', rotinaId: 'ponto_espelho' },
  { icon: Timer, label: 'Gestão de Jornada', path: '/ponto/jornadas', isControlePonto: true },
  { icon: Wallet, label: 'Gestão de Benefícios', path: '/rh/beneficios', rotinaId: 'rh_beneficios' },
  { icon: ClipboardCheck, label: 'Histórico de Ocorrências', path: '/rh/ocorrencias', rotinaId: 'rh_ocorrencias' },
];

const comissoesSubItems = [
  { icon: Coins, label: 'Menu de Comissões', path: '/comissoes' },
  { icon: Wallet, label: 'Comissões de Cobradores', path: '/comissoes/cobradores', rotinaId: 'com_cobradores' },
  { icon: UserCheck, label: 'Comissões de Atendimento', path: '/comissoes/atendimentos', rotinaId: 'com_atendentes' },
  { icon: BadgePercent, label: 'Comissões de Vendas', path: '/comissoes/vendedores', rotinaId: 'com_vendedores' },
];

const configuracoesSubItems = [
  { icon: User, label: 'Meu Perfil', path: '/config' },
  { icon: Building2, label: 'Empresa', path: '/config?tab=empresa' },
  { icon: Users, label: 'Usuários', path: '/config?tab=usuarios' },
  { icon: Shield, label: 'Permissões', path: '/config?tab=permissoes' },
  { icon: KeyRound, label: 'Alterar Senha', path: '/config?tab=seguranca' },
];

interface SidebarNavItemProps {
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  expanded: boolean;
  onClick?: () => void;
  favoritoItem?: FavoritoNav;
  favoritoAtivo?: boolean;
  onToggleFavorito?: (item: FavoritoNav) => void;
}

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  to,
  end,
  icon: Icon,
  label,
  expanded,
  onClick,
  favoritoItem,
  favoritoAtivo = false,
  onToggleFavorito,
}) => {
  return (
    <div className="flex items-center gap-0.5 group/nav">
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        className={({ isActive }) => `
          flex flex-1 items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 group relative min-w-0
          ${isActive 
            ? 'bg-gradient-to-r from-blue-600/30 to-indigo-600/20 text-white font-bold border-l-4 border-blue-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]' 
            : 'text-slate-300 hover:text-white hover:bg-slate-800/40 hover:translate-x-1'
          }
        `}
      >
        <Icon className="h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110 shrink-0" />
        {expanded && <span className="text-xs font-semibold tracking-wide truncate">{label}</span>}
      </NavLink>
      {expanded && favoritoItem && onToggleFavorito && (
        <FavoritoEstrelaButton
          ativo={favoritoAtivo}
          onToggle={() => onToggleFavorito(favoritoItem)}
          className="mr-1 opacity-60 group-hover/nav:opacity-100"
        />
      )}
    </div>
  );
};

interface SidebarSubNavItemProps {
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  activeOverride?: boolean;
  favoritoItem?: FavoritoNav;
  favoritoAtivo?: boolean;
  onToggleFavorito?: (item: FavoritoNav) => void;
}

const SidebarSubNavItem: React.FC<SidebarSubNavItemProps> = ({
  to,
  end,
  icon: Icon,
  label,
  onClick,
  activeOverride,
  favoritoItem,
  favoritoAtivo = false,
  onToggleFavorito,
}) => {
  return (
    <div className="flex items-center gap-0.5 group/sub">
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        className={({ isActive }) => {
          const active = activeOverride ?? isActive;
          return `
            flex flex-1 items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all duration-200 group min-w-0
            ${active 
              ? 'bg-gradient-to-r from-blue-600/20 to-indigo-600/10 text-white font-bold border-l-2 border-blue-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]' 
              : 'text-slate-300 hover:text-white hover:bg-slate-800/30 hover:translate-x-0.5'
            }
          `;
        }}
      >
        <Icon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-105 shrink-0" />
        <span className="truncate">{label}</span>
      </NavLink>
      {favoritoItem && onToggleFavorito && (
        <FavoritoEstrelaButton
          ativo={favoritoAtivo}
          onToggle={() => onToggleFavorito(favoritoItem)}
          className="opacity-50 group-hover/sub:opacity-100"
          size="sm"
        />
      )}
    </div>
  );
};

interface SidebarNavGroupProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  expanded: boolean;
  onClick: () => void;
  favoritoItem?: FavoritoNav;
  favoritoAtivo?: boolean;
  onToggleFavorito?: (item: FavoritoNav) => void;
}

const SidebarNavGroup: React.FC<SidebarNavGroupProps> = ({
  to,
  icon: Icon,
  label,
  isActive,
  isOpen,
  onToggle,
  expanded,
  onClick,
  favoritoItem,
  favoritoAtivo = false,
  onToggleFavorito,
}) => {
  return (
    <div className={`
      flex items-center justify-between w-full rounded-lg transition-all duration-300 pr-1
      ${isActive ? 'bg-slate-800/40 text-white border-l-4 border-blue-500/50' : 'text-slate-300 hover:bg-slate-800/25 hover:text-white'}
    `}>
      <NavLink
        to={to}
        end
        onClick={onClick}
        className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-lg min-w-0"
      >
        <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
        {expanded && <span className="text-xs font-semibold tracking-wide truncate">{label}</span>}
      </NavLink>
      {expanded && (
        <div className="flex items-center flex-shrink-0">
          {favoritoItem && onToggleFavorito && (
            <FavoritoEstrelaButton
              ativo={favoritoAtivo}
              onToggle={() => onToggleFavorito(favoritoItem)}
              className="opacity-60 hover:opacity-100"
            />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors mr-1"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};

const iconPorModuloId: Record<string, React.ComponentType<{ className?: string }>> = {
  planos: ClipboardList,
  vendas: Store,
  atendimentos: HandHeart,
  estoque: Boxes,
  frota: Car,
  cobradores: Wallet,
  ponto: Timer,
  rh: BriefcaseBusiness,
  documentos: Files,
  clientes: Users,
  crm: MessageCircle,
  financeiro: DollarSign,
  config: Settings,
  relatorios: BarChart,
  dashboard: LayoutDashboard,
};

const todasRotinasSidebar = [
  ...planosSubItems,
  ...vendaSubItems,
  ...clientesSubItems,
  ...financeiroSubItems,
  ...estoqueSubItems,
  ...frotaSubItems,
  ...cobradoresSubItems,
  ...pontoSubItems,
  ...rhSubItems,
  ...configuracoesSubItems,
  { icon: DoorOpen, label: 'Salas e Capelas', path: '/atendimentos/salas' },
  { icon: ClipboardList, label: 'Serviços Funerários', path: '/atendimentos/servicos' },
  { icon: Store, label: 'Conexão WhatsApp', path: '/crm/conexao' },
  { icon: Users, label: 'Clientes CRM', path: '/crm/clientes' },
  { icon: PhoneCall, label: 'Contatos WhatsApp', path: '/crm/contatos' },
  { icon: BarChart, label: 'Dashboard CRM', path: '/crm/dashboard' },
];

function iconParaFavorito(fav: FavoritoNav): React.ComponentType<{ className?: string }> {
  if (fav.id.startsWith('mod:')) {
    return iconPorModuloId[fav.id.slice(4)] || LayoutDashboard;
  }
  const found = todasRotinasSidebar.find((r) => favoritoIdPath(r.path) === fav.id);
  return found?.icon || Star;
}

export const Sidebar: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}> = ({ isOpen, onClose, collapsed, onCollapsedChange }) => {
  const { user, empresa, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [atendimentosOpen, setAtendimentosOpen] = useState(location.pathname.startsWith('/atendimentos'));
  const [planosOpen, setPlanosOpen] = useState(location.pathname.startsWith('/planos'));
  const [vendaOpen, setVendaOpen] = useState(location.pathname.startsWith('/venda'));
  const [clientesOpen, setClientesOpen] = useState(location.pathname.startsWith('/clientes'));
  const [estoqueOpen, setEstoqueOpen] = useState(location.pathname.startsWith('/estoque'));
  const [frotaOpen, setFrotaOpen] = useState(location.pathname.startsWith('/frota'));
  const [cobradoresOpen, setCobradoresOpen] = useState(location.pathname.startsWith('/cobradores'));
  const [pontoOpen, setPontoOpen] = useState(location.pathname.startsWith('/ponto'));
  const [rhOpen, setRhOpen] = useState(location.pathname.startsWith('/rh'));
  const [comissoesOpen, setComissoesOpen] = useState(location.pathname.startsWith('/comissoes'));
  const [financeiroOpen, setFinanceiroOpen] = useState(location.pathname.startsWith('/financeiro'));
  const [crmOpen, setCrmOpen] = useState(location.pathname.startsWith('/crm'));
  const [configOpen, setConfigOpen] = useState(location.pathname.startsWith('/config'));

  const handleSubItemClick = (groupSetter: (open: boolean) => void) => {
    groupSetter(false);
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  useEffect(() => {
    if (!isSidebarHovered && collapsed) {
      setAtendimentosOpen(false);
      setPlanosOpen(false);
      setVendaOpen(false);
      setClientesOpen(false);
      setEstoqueOpen(false);
      setFrotaOpen(false);
      setCobradoresOpen(false);
      setPontoOpen(false);
      setRhOpen(false);
      setComissoesOpen(false);
      setFinanceiroOpen(false);
      setCrmOpen(false);
      setConfigOpen(false);
    }
  }, [isSidebarHovered, collapsed]);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  /** Hub de módulos — não exige rotina `dashboard_view`. Dashboard executivo é separado. */
  const inicioNavItem = { icon: LayoutDashboard, label: 'Início', path: '/inicio' as const };
  const dashboardNavItem = { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' as const };

  const bottomNavItems = [
    { id: 'relatorios', icon: BarChart, label: 'Relatórios', path: '/relatorios' },
  ];

  const isMobileApp = import.meta.env.VITE_APP_MODE === 'colaboradores' || (window as any).__MOBILE_APP__;

  const hasPermission = (moduloId: string) => {
    if (isMobileApp) {
      const allowedMobileModules = new Set(['ponto', 'frota', 'vendas', 'cobradores', 'config', 'inicio']);
      if (!allowedMobileModules.has(moduloId)) return false;
    }
    return usuarioPodeVerModulo(
      user?.role,
      user?.permissoes as Record<string, unknown> | undefined,
      moduloId,
      user?.roles_extra,
    );
  };

  const { favoritos, isFavorito, toggle } = useNavegacaoFavoritos(user?.id);

  const favMod = (moduloId: string, label: string, path: string): FavoritoNav => ({
    id: favoritoIdModulo(moduloId),
    label,
    path,
  });

  const favPath = (path: string, label: string): FavoritoNav => ({
    id: favoritoIdPath(path),
    label,
    path,
  });

  const subFavoritoProps = (path: string, label: string) => ({
    favoritoItem: favPath(path, label),
    favoritoAtivo: isFavorito(favoritoIdPath(path)),
    onToggleFavorito: toggle,
  });

  const modFavoritoProps = (moduloId: string, label: string, path: string) => ({
    favoritoItem: favMod(moduloId, label, path),
    favoritoAtivo: isFavorito(favoritoIdModulo(moduloId)),
    onToggleFavorito: toggle,
  });

  const showVendas =
    user?.role === 'admin' ||
    user?.role === 'admin_sistema' ||
    user?.role === 'admin_empresa' ||
    hasPermission('vendas');

  const isAtendimentosActive = location.pathname.startsWith('/atendimentos');
  const isPlanosActive = location.pathname.startsWith('/planos');
  const isVendaActive = location.pathname.startsWith('/venda');
  const isEstoqueActive = location.pathname.startsWith('/estoque');
  const isFrotaActive = location.pathname.startsWith('/frota');
  const isCobradoresActive = location.pathname.startsWith('/cobradores');
  const cobradoresMenuItems =
    user?.role === 'cobrador' ? cobradoresSubItemsPerfilCobrador : cobradoresSubItems;
  const isPontoActive = location.pathname.startsWith('/ponto');
  const isRhActive = location.pathname.startsWith('/rh');
  const isComissoesActive = location.pathname.startsWith('/comissoes');
  const isFinanceiroActive = location.pathname.startsWith('/financeiro');
  const isCrmActive = location.pathname.startsWith('/crm');
  const isConfigActive = location.pathname.startsWith('/config');
  const isDocumentosActive = location.pathname.startsWith('/documentos');
  const isDesktopSidebarVisible = !collapsed || isSidebarHovered;
  const isSubNavItemActive = (path: string) => {
    const [itemPathname, itemSearch] = path.split('?');
    if (location.pathname !== itemPathname) return false;
    if (!itemSearch) return !location.search;
    return location.search.replace(/^\?/, '') === itemSearch;
  };

  const permissoesUsuario = user?.permissoes as Record<string, unknown> | undefined;
  const roleLower = (user?.role || '').toLowerCase();
  const isAdminConfig =
    roleLower === 'admin' ||
    roleLower === 'admin_sistema' ||
    roleLower === 'admin_empresa' ||
    roleLower === 'super_admin';

  const podeAcessarConfiguracoes =
    hasPermission('config') ||
    isAdminConfig ||
    usuarioPodeVerRotina(permissoesUsuario, 'cfg_empresa') ||
    usuarioPodeVerRotina(permissoesUsuario, 'cfg_usuarios') ||
    Boolean(user?.id);

  const financeiroSubItemsVisiveis = useMemo(
    () =>
      financeiroSubItems.filter((sub) =>
        usuarioPodeAcessarRotinaFinanceiraPorPath(user?.role, permissoesUsuario, sub.path),
      ),
    [user?.role, permissoesUsuario],
  );

  const comissoesSubItemsVisiveis = useMemo(
    () =>
      comissoesSubItems.filter((sub) => {
        if (!sub.rotinaId) return true;
        return usuarioPodeVerRotina(permissoesUsuario, sub.rotinaId);
      }),
    [permissoesUsuario],
  );

  const configuracoesSubItemsVisiveis = useMemo(() => {
    return configuracoesSubItems.filter((sub) => {
      const tab = parseConfigTabFromSearch(sub.path.includes('?') ? `?${sub.path.split('?')[1]}` : '');
      if (tab === 'perfil' || tab === 'seguranca') return true;
      if (tab === 'empresa') {
        if (roleLower === 'vendedor') return false;
        return isAdminConfig || usuarioPodeVerRotina(permissoesUsuario, 'cfg_empresa');
      }
      if (tab === 'usuarios') {
        if (roleLower === 'vendedor') return false;
        return (
          isAdminConfig ||
          usuarioPodeVerRotina(permissoesUsuario, 'cfg_usuarios') ||
          ['gerente', 'gestor', 'gestor_executivo', 'diretoria', 'supervisao', 'financeiro'].includes(roleLower)
        );
      }
      return true;
    });
  }, [permissoesUsuario, isAdminConfig, roleLower]);

  useEffect(() => {
    if (location.pathname.startsWith('/config')) {
      setConfigOpen(true);
    }
  }, [location.pathname, location.search]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <aside
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`
          fixed top-0 left-0 z-50 h-screen text-white shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none
          ${isDesktopSidebarVisible ? 'w-[280px]' : 'w-[76px]'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          bg-gradient-to-b from-slate-950 via-[#13192b] to-slate-950 border-r border-slate-800/80 flex flex-col justify-between
        `}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo */}
          <div
            className={`flex items-center gap-3 p-4 border-b border-slate-800/60 min-h-[64px] ${
              !isDesktopSidebarVisible ? 'justify-center' : ''
            }`}
            onDoubleClick={() => onCollapsedChange(!collapsed)}
          >
            <SidebarLogo
              logoUrl={resolveLogoUrl(empresa?.logo_url)}
              alt={empresa?.nome || 'Fênix Funerária'}
              expanded={isDesktopSidebarVisible}
              fallbackLetter={(empresa?.nome || 'A').charAt(0).toUpperCase()}
            />
            {isDesktopSidebarVisible && !resolveLogoUrl(empresa?.logo_url)?.trim() && (
              <span className="flex-1 min-w-0 text-base font-extrabold truncate tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-200 to-white">
                {empresa?.nome || 'APex-Plan'}
              </span>
            )}
            {isDesktopSidebarVisible && (
              <div className="ml-auto flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onCollapsedChange(!collapsed)}
                  className="hidden md:inline-flex p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200"
                  title={collapsed ? 'Fixar painel' : 'Recolher painel'}
                >
                  {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>

          {!isDesktopSidebarVisible && (
            <button
              type="button"
              onClick={() => setIsSidebarHovered(true)}
              className="hidden md:flex absolute top-20 -right-3 h-10 w-6 items-center justify-center rounded-r-lg bg-slate-900 border-y border-r border-slate-800 text-slate-400 hover:text-white transition-all shadow-xl"
              title="Expandir painel"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {/* Navigation */}
          <nav
            className={`flex-1 overflow-y-auto py-4 px-3 space-y-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800/80 [&::-webkit-scrollbar-thumb]:rounded-full ${isDesktopSidebarVisible ? '' : 'px-2'}`}
            style={{ maxHeight: 'calc(100vh - 180px)' }}
          >
            {/* Início: sempre (ponto de entrada); Dashboard executivo: só com permissão Painel Executivo */}
            <SidebarNavItem
              to={inicioNavItem.path}
              icon={inicioNavItem.icon}
              label={inicioNavItem.label}
              expanded={isDesktopSidebarVisible}
              onClick={() => window.innerWidth < 768 && onClose()}
              favoritoItem={favPath(inicioNavItem.path, inicioNavItem.label)}
              favoritoAtivo={isFavorito(favoritoIdPath(inicioNavItem.path))}
              onToggleFavorito={toggle}
            />

            {hasPermission('dashboard') && (
              <SidebarNavItem
                to={dashboardNavItem.path}
                icon={dashboardNavItem.icon}
                label={dashboardNavItem.label}
                expanded={isDesktopSidebarVisible}
                onClick={() => window.innerWidth < 768 && onClose()}
                favoritoItem={favPath(dashboardNavItem.path, dashboardNavItem.label)}
                favoritoAtivo={isFavorito(favoritoIdPath(dashboardNavItem.path))}
                onToggleFavorito={toggle}
              />
            )}

            {favoritos.length > 0 && isDesktopSidebarVisible && (
              <div className="mb-2 pb-2 border-b border-amber-500/20">
                <p className="px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-amber-400/90 flex items-center gap-1.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  Favoritos
                </p>
                <div className="space-y-0.5">
                  {favoritos.map((fav) => (
                    <SidebarNavItem
                      key={fav.id}
                      to={fav.path}
                      icon={iconParaFavorito(fav)}
                      label={fav.label}
                      expanded={isDesktopSidebarVisible}
                      onClick={() => window.innerWidth < 768 && onClose()}
                      favoritoItem={fav}
                      favoritoAtivo
                      onToggleFavorito={toggle}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Planos with sub-menu */}
            {hasPermission('planos') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/planos"
                  icon={ClipboardList}
                  label="Planos"
                  isActive={isPlanosActive}
                  isOpen={planosOpen}
                  onToggle={() => setPlanosOpen(!planosOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setPlanosOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('planos', 'Planos', '/planos')}
                />

                {planosOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {planosSubItems.map((sub) => (
                      <SidebarSubNavItem
                        key={sub.path}
                        to={sub.path}
                        end={sub.path === '/planos'}
                        icon={sub.icon}
                        label={sub.label}
                        onClick={() => handleSubItemClick(setPlanosOpen)}
                        {...subFavoritoProps(sub.path, sub.label)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Vendas */}
            {showVendas && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/venda"
                  icon={Store}
                  label="Vendas"
                  isActive={isVendaActive}
                  isOpen={vendaOpen}
                  onToggle={() => setVendaOpen(!vendaOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setVendaOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('vendas', 'Vendas', '/venda')}
                />

                {vendaOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {vendaSubItems.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setVendaOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Atendimentos with sub-menu */}
            {hasPermission('atendimentos') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/atendimentos"
                  icon={HandHeart}
                  label="Atendimentos"
                  isActive={isAtendimentosActive}
                  isOpen={atendimentosOpen}
                  onToggle={() => setAtendimentosOpen(!atendimentosOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setAtendimentosOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('atendimentos', 'Atendimentos', '/atendimentos')}
                />

                {atendimentosOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    <SidebarSubNavItem to="/atendimentos/salas" icon={DoorOpen} label="Salas e Capelas" onClick={() => handleSubItemClick(setAtendimentosOpen)} {...subFavoritoProps('/atendimentos/salas', 'Salas e Capelas')} />
                    <SidebarSubNavItem to="/atendimentos/servicos" icon={ClipboardList} label="Serviços Funerários" onClick={() => handleSubItemClick(setAtendimentosOpen)} {...subFavoritoProps('/atendimentos/servicos', 'Serviços Funerários')} />
                  </div>
                )}
              </div>
            )}

            {/* Estoque with sub-menu */}
            {hasPermission('estoque') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/estoque"
                  icon={Boxes}
                  label="Estoque"
                  isActive={isEstoqueActive}
                  isOpen={estoqueOpen}
                  onToggle={() => setEstoqueOpen(!estoqueOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setEstoqueOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('estoque', 'Estoque', '/estoque')}
                />

                {estoqueOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3 max-h-60 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                    {estoqueSubItems.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} end={sub.path === '/estoque'} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setEstoqueOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Frota with sub-menu */}
            {hasPermission('frota') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/frota"
                  icon={Car}
                  label="Frota"
                  isActive={isFrotaActive}
                  isOpen={frotaOpen}
                  onToggle={() => setFrotaOpen(!frotaOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setFrotaOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('frota', 'Frota', '/frota')}
                />

                {frotaOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {frotaSubItems.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setFrotaOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cobradores with sub-menu */}
            {hasPermission('cobradores') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/cobradores"
                  icon={Wallet}
                  label="Cobradores"
                  isActive={isCobradoresActive}
                  isOpen={cobradoresOpen}
                  onToggle={() => setCobradoresOpen(!cobradoresOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setCobradoresOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('cobradores', 'Cobradores', '/cobradores')}
                />

                {cobradoresOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {cobradoresMenuItems.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setCobradoresOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ponto with sub-menu */}
            {hasPermission('ponto') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/ponto"
                  icon={Timer}
                  label="Ponto"
                  isActive={isPontoActive}
                  isOpen={pontoOpen}
                  onToggle={() => setPontoOpen(!pontoOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setPontoOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('ponto', 'Ponto', '/ponto')}
                />

                {pontoOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {pontoSubItems.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setPontoOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recursos Humanos with sub-menu */}
            {hasPermission('rh') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/rh"
                  icon={BriefcaseBusiness}
                  label="Recursos Humanos"
                  isActive={isRhActive}
                  isOpen={rhOpen}
                  onToggle={() => setRhOpen(!rhOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setRhOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('rh', 'Recursos Humanos', '/rh')}
                />

                {rhOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {rhSubItems.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setRhOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comissões with sub-menu */}
            {hasPermission('comissoes') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/comissoes"
                  icon={Coins}
                  label="Comissões"
                  isActive={isComissoesActive}
                  isOpen={comissoesOpen}
                  onToggle={() => setComissoesOpen(!comissoesOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setComissoesOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('comissoes', 'Comissões', '/comissoes')}
                />

                {comissoesOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {comissoesSubItemsVisiveis.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setComissoesOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Documentos */}
            {hasPermission('documentos') && canAccessDocumentosByRole(user?.role) && (
              <SidebarNavItem
                to="/documentos/modelos"
                icon={Files}
                label="Documentos"
                expanded={isDesktopSidebarVisible}
                onClick={() => window.innerWidth < 768 && onClose()}
                {...modFavoritoProps('documentos', 'Documentos', '/documentos/modelos')}
              />
            )}

            {/* Clientes / CRM with sub-menu */}
            {hasPermission('clientes') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/clientes"
                  icon={Users}
                  label="Clientes"
                  isActive={location.pathname.startsWith('/clientes')}
                  isOpen={clientesOpen}
                  onToggle={() => setClientesOpen(!clientesOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setClientesOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('clientes', 'Clientes', '/clientes')}
                />

                {clientesOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {clientesSubItems.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} end={sub.path === '/clientes'} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setClientesOpen)} activeOverride={isSubNavItemActive(sub.path)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CRM separado */}
            {hasPermission('crm') && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/crm"
                  icon={MessageCircle}
                  label="CRM WhatsApp"
                  isActive={isCrmActive}
                  isOpen={crmOpen}
                  onToggle={() => setCrmOpen(!crmOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setCrmOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('crm', 'CRM WhatsApp', '/crm')}
                />

                {crmOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {[
                      { icon: Store, label: 'Conexão WhatsApp', path: '/crm/conexao' },
                      { icon: Users, label: 'Clientes CRM', path: '/crm/clientes' },
                      { icon: PhoneCall, label: 'Contatos WhatsApp', path: '/crm/contatos' },
                      { icon: BarChart, label: 'Dashboard CRM', path: '/crm/dashboard' }
                    ].map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setCrmOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Financeiro with sub-menu */}
            {(hasPermission('financeiro') || financeiroSubItemsVisiveis.length > 0) && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/financeiro"
                  icon={DollarSign}
                  label="Financeiro"
                  isActive={isFinanceiroActive}
                  isOpen={financeiroOpen}
                  onToggle={() => setFinanceiroOpen(!financeiroOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setFinanceiroOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('financeiro', 'Financeiro', '/financeiro')}
                />

                {financeiroOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3 max-h-60 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
                    {financeiroSubItemsVisiveis.map((sub) => (
                      <SidebarSubNavItem key={sub.path} to={sub.path} end={sub.path === '/financeiro'} icon={sub.icon} label={sub.label} onClick={() => handleSubItemClick(setFinanceiroOpen)} {...subFavoritoProps(sub.path, sub.label)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="my-2 border-t border-slate-800/60" />

            {bottomNavItems.map((item) => hasPermission(item.id) && (
              <SidebarNavItem
                key={item.path}
                to={item.path}
                icon={item.icon}
                label={item.label}
                expanded={isDesktopSidebarVisible}
                onClick={() => window.innerWidth < 768 && onClose()}
                {...subFavoritoProps(item.path, item.label)}
              />
            ))}

            {podeAcessarConfiguracoes && (
              <div className="space-y-1">
                <SidebarNavGroup
                  to="/config"
                  icon={Settings}
                  label="Configurações"
                  isActive={isConfigActive}
                  isOpen={configOpen}
                  onToggle={() => setConfigOpen(!configOpen)}
                  expanded={isDesktopSidebarVisible}
                  onClick={() => {
                    setConfigOpen(true);
                    if (window.innerWidth < 768) onClose();
                  }}
                  {...modFavoritoProps('config', 'Configurações', '/config')}
                />

                {configOpen && isDesktopSidebarVisible && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-800/80 pl-3">
                    {configuracoesSubItemsVisiveis.map((sub) => (
                      <SidebarSubNavItem
                        key={sub.path}
                        to={buildConfigPath(parseConfigTabFromSearch(sub.path.includes('?') ? `?${sub.path.split('?')[1]}` : ''))}
                        end={sub.path === '/config'}
                        icon={sub.icon}
                        label={sub.label}
                        onClick={() => handleSubItemClick(setConfigOpen)}
                        activeOverride={isSubNavItemActive(sub.path)}
                        {...subFavoritoProps(sub.path, sub.label)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t border-slate-800/60 bg-slate-950/80 backdrop-blur-md shrink-0"
        >
          {isDesktopSidebarVisible && (
            <div className="flex items-center gap-3 mb-4 p-1">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
                {(user?.nome || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden flex-1">
                <p className="text-xs font-bold truncate text-slate-200">{user?.nome || 'Usuário'}</p>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{user?.email || 'usuario@sistema.com'}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 border border-transparent transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            {isDesktopSidebarVisible && 'Sair da Conta'}
          </button>
          {isDesktopSidebarVisible && (
            <p className="mt-3 px-4 text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center">
              APex-Plan v1.0.1
            </p>
          )}
        </div>
      </aside>
    </>
  );
};
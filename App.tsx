import React, { Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Login } from './pages/Login';
import { ToastProvider } from './lib/ToastStore';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { usuarioPodeVerModulo } from './lib/acessoModulos';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { LoadingFallback } from './components/ui/LoadingFallback';

const AuthenticatedShell = lazyWithRetry(() =>
  import('./components/AuthenticatedShell').then((m) => ({ default: m.AuthenticatedShell })),
);
const InicioModulos = lazyWithRetry(() =>
  import('./pages/InicioModulos').then((m) => ({ default: m.InicioModulos })),
);
const PrimeiroAcesso = lazyWithRetry(() =>
  import('./pages/PrimeiroAcesso').then((m) => ({ default: m.PrimeiroAcesso })),
);

const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha').then(m => ({ default: m.RedefinirSenha })));
const AssinarContrato = lazy(() => import('./pages/AssinarContrato').then(m => ({ default: m.AssinarContratoPage })));
const Dashboard = lazy(() => import('./pages/Dashboard'));

const PlanosList = lazy(() => import('./pages/planos/PlanosList').then(m => ({ default: m.PlanosList })));
const PlanoForm = lazy(() => import('./pages/planos/PlanoForm').then(m => ({ default: m.PlanoForm })));
const CategoriasPage = lazy(() => import('./pages/planos/CategoriasPage').then(m => ({ default: m.CategoriasPage })));
const PlanosMenu = lazy(() => import('./pages/planos/PlanosMenu').then(m => ({ default: m.PlanosMenu })));

const VendaMenu = lazy(() => import('./pages/venda/VendaMenu').then(m => ({ default: m.VendaMenu })));
const NovaPropostaPage = lazy(() => import('./pages/venda/NovaPropostaPage').then(m => ({ default: m.NovaPropostaPage })));
const PropostasListPage = lazy(() => import('./pages/venda/PropostasListPage').then(m => ({ default: m.PropostasListPage })));

const ClientesMenu = lazy(() => import('./pages/clientes/ClientesMenu').then(m => ({ default: m.ClientesMenu })));
const ClientesList = lazy(() => import('./pages/clientes/ClientesList').then(m => ({ default: m.ClientesList })));
const ClienteForm = lazy(() => import('./pages/clientes/ClienteForm').then(m => ({ default: m.ClienteForm })));
const ClienteProfile = lazy(() => import('./pages/clientes/ClienteProfile').then(m => ({ default: m.ClienteProfile })));
const OportunidadesPipeline = lazy(() => import('./pages/clientes/OportunidadesPipeline').then(m => ({ default: m.OportunidadesPipeline })));
const TarefasCRM = lazy(() => import('./pages/clientes/TarefasCRM').then(m => ({ default: m.TarefasCRM })));
const ContratosList = lazy(() => import('./pages/clientes/ContratosList').then(m => ({ default: m.ContratosList })));
const CRMWhatsAppMenu = lazy(() => import('./pages/clientes/CRMWhatsAppMenu').then(m => ({ default: m.CRMWhatsAppMenu })));
const CRMClientesPage = lazy(() => import('./pages/clientes/CRMClientesPage').then(m => ({ default: m.CRMClientesPage })));
const CRMContatosPage = lazy(() => import('./pages/clientes/CRMContatosPage').then(m => ({ default: m.CRMContatosPage })));
const CRMDashboardPage = lazy(() => import('./pages/clientes/CRMDashboardPage').then(m => ({ default: m.CRMDashboardPage })));
const CRMConexaoWhatsAppPage = lazy(() => import('./pages/clientes/CRMConexaoWhatsAppPage').then(m => ({ default: m.CRMConexaoWhatsAppPage })));

const AtendimentosList = lazy(() => import('./pages/atendimentos/AtendimentosList').then(m => ({ default: m.AtendimentosList })));
const AtendimentoForm = lazy(() => import('./pages/atendimentos/AtendimentoForm').then(m => ({ default: m.AtendimentoForm })));
const ServicosFunerariosList = lazy(() => import('./pages/atendimentos/ServicosFunerariosList').then(m => ({ default: m.ServicosFunerariosList })));
const SalasListPage = lazy(() => import('./pages/atendimentos/Salas').then(m => ({ default: m.SalasListPage })));

const FinanceiroMenu = lazy(() => import('./pages/financeiro/FinanceiroMenu').then(m => ({ default: m.FinanceiroMenu })));
const FinanceiroDashboard = lazy(() => import('./pages/financeiro/FinanceiroDashboard').then(m => ({ default: m.FinanceiroDashboard })));
const ContasReceber = lazy(() => import('./pages/financeiro/ContasReceber').then(m => ({ default: m.ContasReceber })));
const ContasPagar = lazy(() => import('./pages/financeiro/ContasPagar').then(m => ({ default: m.ContasPagar })));
const FluxoCaixa = lazy(() => import('./pages/financeiro/FluxoCaixa').then(m => ({ default: m.FluxoCaixa })));
const ContasBancarias = lazy(() => import('./pages/financeiro/ContasBancarias').then(m => ({ default: m.ContasBancarias })));
const NaturezasFinanceiras = lazy(() => import('./pages/financeiro/NaturezasFinanceiras').then(m => ({ default: m.NaturezasFinanceiras })));
const CentrosCusto = lazy(() => import('./pages/financeiro/CentrosCusto').then(m => ({ default: m.CentrosCusto })));
const PlanoContas = lazy(() => import('./pages/financeiro/PlanoContas').then(m => ({ default: m.PlanoContas })));
const BaixaParcelas = lazy(() => import('./pages/financeiro/BaixaParcelas').then(m => ({ default: m.BaixaParcelas })));
const Tesouraria = lazy(() => import('./pages/financeiro/Tesouraria').then(m => ({ default: m.Tesouraria })));
const Cobranca = lazy(() => import('./pages/financeiro/Cobranca').then(m => ({ default: m.Cobranca })));
const ImportacaoOfx = lazy(() => import('./pages/financeiro/ImportacaoOfx').then(m => ({ default: m.ImportacaoOfx })));
const DRE = lazy(() => import('./pages/financeiro/DRE').then(m => ({ default: m.DRE })));

const RelatoriosList = lazy(() => import('./pages/relatorios/RelatoriosList').then(m => ({ default: m.RelatoriosList })));
const RelatorioView = lazy(() => import('./pages/relatorios/RelatorioView').then(m => ({ default: m.RelatorioView })));
const ConfigPage = lazy(() => import('./pages/ConfigPage').then(m => ({ default: m.ConfigPage })));

const EstoqueMenu = lazy(() => import('./pages/estoque/EstoqueMenu').then(m => ({ default: m.EstoqueMenu })));
const EstoqueProdutos = lazy(() => import('./pages/estoque/EstoqueProdutos').then(m => ({ default: m.EstoqueProdutos })));
const EstoqueEntradas = lazy(() => import('./pages/estoque/EstoqueEntradas').then(m => ({ default: m.EstoqueEntradas })));
const EstoqueMovimentacoes = lazy(() => import('./pages/estoque/EstoqueMovimentacoes').then(m => ({ default: m.EstoqueMovimentacoes })));
const EstoqueFornecedores = lazy(() => import('./pages/estoque/EstoqueFornecedores').then(m => ({ default: m.EstoqueFornecedores })));
const EstoqueProdutoForm = lazy(() => import('./pages/estoque/EstoqueProdutoForm').then(m => ({ default: m.EstoqueProdutoForm })));
const EstoqueEntradaForm = lazy(() => import('./pages/estoque/EstoqueEntradaForm').then(m => ({ default: m.EstoqueEntradaForm })));
const EstoqueFornecedorForm = lazy(() => import('./pages/estoque/EstoqueFornecedorForm').then(m => ({ default: m.EstoqueFornecedorForm })));
const EstoqueKitsList = lazy(() => import('./pages/estoque/EstoqueKitsList').then(m => ({ default: m.EstoqueKitsList })));
const EstoqueKitForm = lazy(() => import('./pages/estoque/EstoqueKitForm').then(m => ({ default: m.EstoqueKitForm })));
const EstoqueSaidas = lazy(() => import('./pages/estoque/EstoqueSaidas').then(m => ({ default: m.EstoqueSaidas })));
const EstoqueSaidaForm = lazy(() => import('./pages/estoque/EstoqueSaidaForm').then(m => ({ default: m.EstoqueSaidaForm })));
const EstoqueSaidaRecibo = lazy(() => import('./pages/estoque/EstoqueSaidaRecibo').then(m => ({ default: m.EstoqueSaidaRecibo })));
const EstoqueContagens = lazy(() => import('./pages/estoque/EstoqueContagens').then(m => ({ default: m.EstoqueContagens })));
const EstoqueContagemForm = lazy(() => import('./pages/estoque/EstoqueContagemForm').then(m => ({ default: m.EstoqueContagemForm })));
const EstoqueEquipamentosList = lazy(() => import('./pages/estoque/EstoqueEquipamentosList').then(m => ({ default: m.EstoqueEquipamentosList })));
const EstoqueEquipamentoForm = lazy(() => import('./pages/estoque/EstoqueEquipamentoForm').then(m => ({ default: m.EstoqueEquipamentoForm })));
const EstoqueFiliaisDepositos = lazy(() => import('./pages/estoque/EstoqueFiliaisDepositos').then(m => ({ default: m.EstoqueFiliaisDepositos })));
const EstoqueTransferencias = lazy(() => import('./pages/estoque/EstoqueTransferencias').then(m => ({ default: m.EstoqueTransferencias })));
const EstoqueTransferenciaForm = lazy(() => import('./pages/estoque/EstoqueTransferenciaForm').then(m => ({ default: m.EstoqueTransferenciaForm })));

const FrotaMenu = lazy(() => import('./pages/frota/FrotaMenu').then(m => ({ default: m.FrotaMenu })));
const VeiculosList = lazy(() => import('./pages/frota/VeiculosList').then(m => ({ default: m.VeiculosList })));
const MotoristasList = lazy(() => import('./pages/frota/MotoristasList').then(m => ({ default: m.MotoristasList })));
const AbastecimentosList = lazy(() => import('./pages/frota/AbastecimentosList').then(m => ({ default: m.AbastecimentosList })));
const GastosFrota = lazy(() => import('./pages/frota/GastosFrota').then(m => ({ default: m.GastosFrota })));
const ManutencaoList = lazy(() => import('./pages/frota/ManutencaoList').then(m => ({ default: m.ManutencaoList })));
const ViagensList = lazy(() => import('./pages/frota/ViagensList').then(m => ({ default: m.ViagensList })));
const VeiculoForm = lazy(() => import('./pages/frota/VeiculoForm').then(m => ({ default: m.VeiculoForm })));
const MotoristaForm = lazy(() => import('./pages/frota/MotoristaForm').then(m => ({ default: m.MotoristaForm })));
const AbastecimentoForm = lazy(() => import('./pages/frota/AbastecimentoForm').then(m => ({ default: m.AbastecimentoForm })));
const ManutencaoForm = lazy(() => import('./pages/frota/ManutencaoForm').then(m => ({ default: m.ManutencaoForm })));
const ViagemForm = lazy(() => import('./pages/frota/ViagemForm').then(m => ({ default: m.ViagemForm })));
const OcorrenciasList = lazy(() => import('./pages/frota/OcorrenciasList').then(m => ({ default: m.OcorrenciasList })));
const OcorrenciaForm = lazy(() => import('./pages/frota/OcorrenciaForm').then(m => ({ default: m.OcorrenciaForm })));

const CobradoresMenu = lazy(() => import('./pages/cobradores/CobradoresMenu').then(m => ({ default: m.CobradoresMenu })));
const CobradoresList = lazy(() => import('./pages/cobradores/CobradoresList').then(m => ({ default: m.CobradoresList })));
const CobrancasPendentes = lazy(() => import('./pages/cobradores/CobrancasPendentes').then(m => ({ default: m.CobrancasPendentes })));
const RotasCobranca = lazy(() => import('./pages/cobradores/RotasCobranca').then(m => ({ default: m.RotasCobranca })));
const ComissoesCobradores = lazy(() => import('./pages/cobradores/ComissoesCobradores').then(m => ({ default: m.ComissoesCobradores })));
const CobradorForm = lazy(() => import('./pages/cobradores/CobradorForm').then(m => ({ default: m.CobradorForm })));
const RotaForm = lazy(() => import('./pages/cobradores/RotaForm').then(m => ({ default: m.RotaForm })));
const RecebimentosList = lazy(() => import('./pages/cobradores/RecebimentosList').then(m => ({ default: m.RecebimentosList })));
const RecebimentoForm = lazy(() => import('./pages/cobradores/RecebimentoForm').then(m => ({ default: m.RecebimentoForm })));
const RelatoriosCobranca = lazy(() => import('./pages/cobradores/RelatoriosCobranca').then(m => ({ default: m.RelatoriosCobranca })));
const CarteiraCobrador = lazy(() => import('./pages/cobradores/CarteiraCobrador').then(m => ({ default: m.CarteiraCobrador })));
const ConfiguracaoPermissoesCobradores = lazy(() => import('./pages/cobradores/ConfiguracaoPermissoesCobradores').then(m => ({ default: m.ConfiguracaoPermissoesCobradores })));
const CobradorImpressoes = lazy(() => import('./pages/cobradores/CobradorImpressoes').then(m => ({ default: m.CobradorImpressoes })));
const CobradorRotaGestor = lazy(() =>
    import('./components/cobradores/CobradorRotaGestor').then((m) => ({ default: m.CobradorRotaGestor })),
);


const PontoMenu = lazy(() => import('./pages/ponto/PontoMenu').then(m => ({ default: m.PontoMenu })));
const PontoRegistro = lazy(() => import('./pages/ponto/PontoRegistro').then(m => ({ default: m.PontoRegistro })));
const PontoEspelho = lazy(() => import('./pages/ponto/PontoEspelho').then(m => ({ default: m.PontoEspelho })));
const PontoJornadas = lazy(() => import('./pages/ponto/PontoJornadas').then(m => ({ default: m.PontoJornadas })));

const RhMenu = lazy(() => import('./pages/rh/RhMenu').then(m => ({ default: m.RhMenu })));
const ColaboradoresList = lazy(() => import('./pages/rh/ColaboradoresList').then(m => ({ default: m.ColaboradoresList })));
const FeriasList = lazy(() => import('./pages/rh/FeriasList').then(m => ({ default: m.FeriasList })));
const BeneficiosList = lazy(() => import('./pages/rh/BeneficiosList').then(m => ({ default: m.BeneficiosList })));
const RhOcorrenciasList = lazy(() => import('./pages/rh/OcorrenciasList').then(m => ({ default: m.OcorrenciasList })));
const ComissoesAtendentes = lazy(() => import('./pages/rh/ComissoesAtendentes').then(m => ({ default: m.ComissoesAtendentes })));
const PresencaBancoHoras = lazy(() => import('./pages/rh/PresencaBancoHoras').then(m => ({ default: m.PresencaBancoHoras })));
const ComissoesMenu = lazy(() => import('./pages/comissoes/ComissoesMenu').then(m => ({ default: m.ComissoesMenu })));
const ComissoesVendedores = lazy(() => import('./pages/comissoes/ComissoesVendedores').then(m => ({ default: m.ComissoesVendedores })));

const DocumentosModelosPage = lazy(() => import('./pages/documentos/DocumentosModelosPage').then(m => ({ default: m.DocumentosModelosPage })));

// Fallback de último recurso — só pega erros que escapam do RouteErrorBoundary no Layout
class AppErrorBoundary extends React.Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[AppErrorBoundary]', error, info.componentStack);
    }
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-slate-950 px-6">
          <p className="text-gray-700 dark:text-gray-300 text-center max-w-md text-sm leading-relaxed">
            Não foi possível carregar o sistema. Isso costuma ocorrer após uma atualização ou com conexão instável.
          </p>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const NovaPropostaPageWrapper: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  return <NovaPropostaPage key={id || 'nova'} />;
};

const ClienteFormWrapper: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  return <ClienteForm key={id || 'novo'} />;
};

const PlanoFormWrapper: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  return <PlanoForm key={id || 'novo'} />;
};

const AtendimentoFormWrapper: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  return <AtendimentoForm key={id || 'novo'} />;
};

const EstoqueProdutoFormWrapper: React.FC = () => {
  const { produtoId } = useParams<{ produtoId?: string }>();
  return <EstoqueProdutoForm key={produtoId || 'novo'} />;
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingFallback />;
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;
  if (user.must_change_password && location.pathname !== '/primeiro-acesso') {
    return <Navigate to="/primeiro-acesso" replace />;
  }
  if (!user.must_change_password && location.pathname === '/primeiro-acesso') {
    return <Navigate to="/inicio" replace />;
  }
  return <>{children}</>;
};

/** Painel executivo (`/dashboard`) — exige módulo `dashboard` / rotina `dashboard_view` no perfil. */
const DashboardAccessRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const allowed = usuarioPodeVerModulo(
    user?.role,
    user?.permissoes as Record<string, unknown> | undefined,
    'dashboard',
    user?.roles_extra,
  );
  if (!allowed) return <Navigate to="/inicio" replace />;
  return <>{children}</>;
};

const RhAccessRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const allowed = usuarioPodeVerModulo(
    user?.role,
    user?.permissoes as Record<string, unknown> | undefined,
    'rh',
    user?.roles_extra,
  );
  if (!allowed) return <Navigate to="/inicio" replace />;
  return <>{children}</>;
};

const PontoAccessRoute = lazy(() => import('./components/PontoAccessRoute'));
const DocumentosAccessRoute = lazy(() => import('./components/DocumentosAccessRoute'));
const FinTesourariaAccessRoute = lazy(() => import('./components/financeiro/FinTesourariaAccessRoute'));
const FinBaixaParcelasAccessRoute = lazy(() => import('./components/financeiro/FinBaixaParcelasAccessRoute'));
const FinRotinaAccessRoute = lazy(() => import('./components/financeiro/FinRotinaAccessRoute'));

const ThemeInitializer: React.FC = () => {
  useEffect(() => {
    const savedTema = localStorage.getItem('fenix_theme');
    const savedAccent = localStorage.getItem('apex_accent_color');
    const root = document.documentElement;

    if (savedTema === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    if (savedAccent) {
      root.style.setProperty('--accent-color', savedAccent);
      root.style.setProperty('--accent-color-hover', savedAccent);
      
      const clean = savedAccent.replace('#', '');
      const amount = 60;
      const r = Math.max(0, parseInt(clean.slice(0, 2), 16) - amount);
      const g = Math.max(0, parseInt(clean.slice(2, 4), 16) - amount);
      const b = Math.max(0, parseInt(clean.slice(4, 6), 16) - amount);
      const sidebarBg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      
      root.style.setProperty('--sidebar-bg', sidebarBg);
    }
  }, []);

  return null;
};

const CobradoresIndexRoute: React.FC = () => <CobradoresMenu />;

const App: React.FC = () => {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <ThemeInitializer />
          <AppErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/redefinir-senha" element={<RedefinirSenha />} />
              <Route path="/assinar/:token" element={<AssinarContrato />} />

              <Route element={
                <ProtectedRoute>
                  <AuthenticatedShell />
                </ProtectedRoute>
              }>
                <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
                <Route path="/inicio" element={<InicioModulos />} />
                <Route
                  path="/dashboard"
                  element={
                    <DashboardAccessRoute>
                      <Dashboard />
                    </DashboardAccessRoute>
                  }
                />

                {/* Planos */}
                <Route path="/planos" element={<PlanosMenu />} />
                <Route path="/planos/gerencia" element={<PlanosList />} />
                <Route path="/planos/cadastro" element={<Navigate to="/planos/gerencia" replace />} />
                <Route path="/planos/novo" element={<PlanoFormWrapper />} />
                <Route path="/planos/categorias" element={<CategoriasPage />} />
                <Route path="/planos/historico" element={<Navigate to="/planos/gerencia" replace />} />
                <Route path="/planos/:id" element={<PlanoFormWrapper />} />

                {/* Vendas / propostas */}
                <Route path="/venda" element={<VendaMenu />} />
                <Route path="/venda/nova" element={<NovaPropostaPageWrapper />} />
                <Route path="/venda/propostas" element={<PropostasListPage />} />
                <Route path="/venda/propostas/:id/editar" element={<NovaPropostaPageWrapper />} />

                {/* Clientes / CRM */}
                <Route path="/clientes" element={<ClientesMenu />} />
                <Route path="/clientes/lista" element={<ClientesList />} />
                <Route path="/clientes/novo" element={<ClienteFormWrapper />} />
                <Route path="/clientes/oportunidades" element={<OportunidadesPipeline />} />
                <Route path="/clientes/tarefas" element={<TarefasCRM />} />
                <Route path="/clientes/contratos" element={<ContratosList />} />
                <Route path="/clientes/crm" element={<Navigate to="/crm" replace />} />
                <Route path="/clientes/crm/clientes" element={<Navigate to="/crm/clientes" replace />} />
                <Route path="/clientes/crm/contatos" element={<Navigate to="/crm/contatos" replace />} />
                <Route path="/clientes/crm/dashboard" element={<Navigate to="/crm/dashboard" replace />} />

                {/* CRM separado */}
                <Route path="/crm" element={<CRMWhatsAppMenu />} />
                <Route path="/crm/conexao" element={<CRMConexaoWhatsAppPage />} />
                <Route path="/crm/clientes" element={<CRMClientesPage />} />
                <Route path="/crm/contatos" element={<CRMContatosPage />} />
                <Route path="/crm/dashboard" element={<CRMDashboardPage />} />
                <Route path="/clientes/:id/editar" element={<ClienteFormWrapper />} />
                <Route path="/clientes/:id" element={<ClienteProfile />} />

                {/* Atendimentos */}
                <Route path="/atendimentos" element={<AtendimentosList />} />
                <Route path="/atendimentos/salas" element={<SalasListPage />} />
                <Route path="/atendimentos/servicos" element={<ServicosFunerariosList />} />
                <Route path="/atendimentos/novo" element={<AtendimentoFormWrapper />} />
                <Route path="/atendimentos/:id" element={<AtendimentoFormWrapper />} />

                {/* Estoque */}
                <Route path="/estoque" element={<EstoqueMenu />} />
                <Route path="/estoque/produtos" element={<EstoqueProdutos />} />
                <Route path="/estoque/produtos/novo" element={<EstoqueProdutoFormWrapper />} />
                <Route path="/estoque/produtos/:produtoId/editar" element={<EstoqueProdutoFormWrapper />} />
                <Route path="/estoque/filiais-depositos" element={<EstoqueFiliaisDepositos />} />
                <Route path="/estoque/transferencias" element={<EstoqueTransferencias />} />
                <Route path="/estoque/transferencias/nova" element={<EstoqueTransferenciaForm />} />
                <Route path="/estoque/transferencias/:transferenciaId" element={<EstoqueTransferenciaForm />} />
                <Route path="/estoque/kits" element={<EstoqueKitsList />} />
                <Route path="/estoque/kits/novo" element={<EstoqueKitForm />} />
                <Route path="/estoque/kits/:id/editar" element={<EstoqueKitForm />} />
                <Route path="/estoque/entradas" element={<EstoqueEntradas />} />
                <Route path="/estoque/entradas/nova" element={<EstoqueEntradaForm />} />
                <Route path="/estoque/entradas/:entradaId/editar" element={<EstoqueEntradaForm />} />
                <Route path="/estoque/movimentacoes" element={<EstoqueMovimentacoes />} />
                <Route path="/estoque/fornecedores" element={<EstoqueFornecedores />} />
                <Route path="/estoque/fornecedores/novo" element={<EstoqueFornecedorForm />} />
                <Route path="/estoque/fornecedores/:fornecedorId/editar" element={<EstoqueFornecedorForm />} />
                <Route path="/estoque/saidas" element={<EstoqueSaidas />} />
                <Route path="/estoque/saidas/nova" element={<EstoqueSaidaForm />} />
                <Route path="/estoque/saidas/:saidaId/editar" element={<EstoqueSaidaForm />} />
                <Route path="/estoque/saidas/:saidaId/recibo" element={<EstoqueSaidaRecibo />} />
                <Route path="/estoque/contagens" element={<EstoqueContagens />} />
                <Route path="/estoque/contagens/nova" element={<EstoqueContagemForm />} />
                <Route path="/estoque/contagens/:contagemId" element={<EstoqueContagemForm />} />
                <Route path="/estoque/equipamentos" element={<EstoqueEquipamentosList />} />
                <Route path="/estoque/equipamentos/novo" element={<EstoqueEquipamentoForm />} />
                <Route path="/estoque/equipamentos/:id/editar" element={<EstoqueEquipamentoForm />} />

                {/* Frota */}
                <Route path="/frota" element={<FrotaMenu />} />
                <Route path="/frota/veiculos" element={<VeiculosList />} />
                <Route path="/frota/veiculos/novo" element={<VeiculoForm />} />
                <Route path="/frota/veiculos/:id" element={<VeiculoForm />} />
                <Route path="/frota/veiculos/:id/editar" element={<VeiculoForm />} />
                <Route path="/frota/motoristas" element={<MotoristasList />} />
                <Route path="/frota/motoristas/novo" element={<MotoristaForm />} />
                <Route path="/frota/motoristas/:id" element={<MotoristaForm />} />
                <Route path="/frota/motoristas/:id/editar" element={<MotoristaForm />} />
                <Route path="/frota/abastecimentos" element={<AbastecimentosList />} />
                <Route path="/frota/abastecimentos/novo" element={<AbastecimentoForm />} />
                <Route path="/frota/abastecimentos/:id" element={<AbastecimentoForm />} />
                <Route path="/frota/gastos" element={<GastosFrota />} />
                <Route path="/frota/manutencao" element={<ManutencaoList />} />
                <Route path="/frota/manutencao/nova" element={<ManutencaoForm />} />
                <Route path="/frota/manutencao/:id" element={<ManutencaoForm />} />
                <Route path="/frota/manutencao/:id/editar" element={<ManutencaoForm />} />
                <Route path="/frota/viagens" element={<ViagensList />} />
                <Route path="/frota/viagens/nova" element={<ViagemForm />} />
                <Route path="/frota/viagens/:id" element={<ViagemForm />} />
                <Route path="/frota/viagens/:id/editar" element={<ViagemForm />} />
                <Route path="/frota/ocorrencias" element={<OcorrenciasList />} />
                <Route path="/frota/ocorrencias/nova" element={<OcorrenciaForm />} />
                <Route path="/frota/ocorrencias/:id" element={<OcorrenciaForm />} />
                <Route path="/frota/ocorrencias/:id/editar" element={<OcorrenciaForm />} />

                {/* Cobradores — rotas estáticas antes de /cobradores/:id para não capturar "carteira", "rotas", etc. */}
                <Route path="/cobradores" element={<CobradoresIndexRoute />} />
                <Route path="/cobradores/lista" element={<CobradorRotaGestor><CobradoresList /></CobradorRotaGestor>} />
                <Route path="/cobradores/novo" element={<CobradorRotaGestor><CobradorForm /></CobradorRotaGestor>} />
                <Route path="/cobradores/pendentes" element={<CobrancasPendentes />} />
                <Route path="/cobradores/rotas" element={<RotasCobranca />} />
                <Route path="/cobradores/rotas/nova" element={<RotaForm />} />
                <Route path="/cobradores/rotas/:id" element={<RotaForm />} />
                <Route path="/cobradores/rotas/:id/editar" element={<RotaForm />} />
                <Route path="/cobradores/recebimentos" element={<CobradorRotaGestor><RecebimentosList /></CobradorRotaGestor>} />
                <Route path="/cobradores/impressoes" element={<CobradorImpressoes />} />
                <Route path="/cobradores/recebimentos/novo" element={<RecebimentoForm />} />
                <Route path="/cobradores/recebimentos/:id" element={<RecebimentoForm />} />
                <Route path="/cobradores/carteira" element={<CarteiraCobrador />} />
                <Route path="/cobradores/carteira-escritorio" element={<Navigate to="/cobradores/carteira" replace />} />
                <Route path="/cobradores/comissoes" element={<ComissoesCobradores />} />
                <Route path="/cobradores/relatorios" element={<CobradorRotaGestor><RelatoriosCobranca /></CobradorRotaGestor>} />
                <Route path="/cobradores/permissoes" element={<CobradorRotaGestor><ConfiguracaoPermissoesCobradores /></CobradorRotaGestor>} />
                <Route path="/cobradores/:id/editar" element={<CobradorRotaGestor><CobradorForm /></CobradorRotaGestor>} />
                <Route path="/cobradores/:id" element={<CobradorRotaGestor><CobradorForm /></CobradorRotaGestor>} />

                {/* Ponto */}
                <Route path="/ponto" element={<PontoAccessRoute><PontoMenu /></PontoAccessRoute>} />
                <Route path="/ponto/registro" element={<PontoAccessRoute><PontoRegistro /></PontoAccessRoute>} />
                <Route path="/ponto/espelho" element={<PontoAccessRoute><PontoEspelho modoRH={false} /></PontoAccessRoute>} />
                <Route path="/ponto/jornadas" element={<PontoAccessRoute><PontoJornadas /></PontoAccessRoute>} />

                {/* Recursos Humanos (RH) */}
                <Route path="/rh" element={<RhAccessRoute><RhMenu /></RhAccessRoute>} />
                <Route path="/rh/colaboradores" element={<RhAccessRoute><ColaboradoresList /></RhAccessRoute>} />
                <Route path="/rh/presenca-banco-horas" element={<RhAccessRoute><PresencaBancoHoras /></RhAccessRoute>} />
                <Route path="/rh/espelho-ponto" element={<RhAccessRoute><PontoEspelho modoRH={true} /></RhAccessRoute>} />
                <Route path="/rh/ferias" element={<RhAccessRoute><FeriasList /></RhAccessRoute>} />
                <Route path="/rh/beneficios" element={<RhAccessRoute><BeneficiosList /></RhAccessRoute>} />
                <Route path="/rh/ocorrencias" element={<RhAccessRoute><RhOcorrenciasList /></RhAccessRoute>} />
                <Route path="/rh/comissoes" element={<RhAccessRoute><ComissoesAtendentes /></RhAccessRoute>} />

                {/* Comissões por Departamento */}
                <Route path="/comissoes" element={<ComissoesMenu />} />
                <Route path="/comissoes/cobradores" element={<ComissoesCobradores />} />
                <Route path="/comissoes/atendimentos" element={<ComissoesAtendentes />} />
                <Route path="/comissoes/vendedores" element={<ComissoesVendedores />} />

                {/* Documentos */}
                <Route path="/documentos/modelos" element={<DocumentosAccessRoute><DocumentosModelosPage /></DocumentosAccessRoute>} />

                {/* Financeiro */}
                <Route path="/financeiro" element={<FinRotinaAccessRoute path="/financeiro"><FinanceiroMenu /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/dashboard" element={<FinRotinaAccessRoute path="/financeiro/dashboard"><FinanceiroDashboard /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/contas-receber" element={<FinRotinaAccessRoute path="/financeiro/contas-receber"><ContasReceber /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/contas-pagar" element={<FinRotinaAccessRoute path="/financeiro/contas-pagar"><ContasPagar /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/fluxo-caixa" element={<FinRotinaAccessRoute path="/financeiro/fluxo-caixa"><FluxoCaixa /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/contas-bancarias" element={<FinRotinaAccessRoute path="/financeiro/contas-bancarias"><ContasBancarias /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/plano-contas" element={<FinRotinaAccessRoute path="/financeiro/plano-contas"><PlanoContas /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/naturezas" element={<FinRotinaAccessRoute path="/financeiro/naturezas"><NaturezasFinanceiras /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/centros-custo" element={<FinRotinaAccessRoute path="/financeiro/centros-custo"><CentrosCusto /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/baixa-parcelas" element={<FinBaixaParcelasAccessRoute><BaixaParcelas /></FinBaixaParcelasAccessRoute>} />
                <Route path="/financeiro/importacao-ofx" element={<FinRotinaAccessRoute path="/financeiro/importacao-ofx"><ImportacaoOfx /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/cobranca" element={<FinRotinaAccessRoute path="/financeiro/cobranca"><Cobranca /></FinRotinaAccessRoute>} />
                <Route path="/financeiro/tesouraria" element={<FinTesourariaAccessRoute><Tesouraria /></FinTesourariaAccessRoute>} />
                <Route path="/financeiro/dre" element={<FinRotinaAccessRoute path="/financeiro/dre"><DRE /></FinRotinaAccessRoute>} />

                {/* Relatórios */}
                <Route path="/relatorios" element={<RelatoriosList />} />
                <Route path="/relatorios/:codigo" element={<RelatorioView />} />

                <Route path="/config" element={<ConfigPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </AppErrorBoundary>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
};

export default App;

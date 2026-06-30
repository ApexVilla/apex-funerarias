import React, { Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Login } from '@/pages/Login';
import { ToastProvider } from '@/lib/ToastStore';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { usuarioPodeVerModulo } from '@/lib/acessoModulos';
import { Layout } from '@/components/layout/Layout';
import { ApexLoader } from '@/components/ui/ApexLoader';
import { InicioModulos } from '@/pages/InicioModulos';
import { PrimeiroAcesso } from '@/pages/PrimeiroAcesso';
import LazyProviders from '@/LazyProviders';

const RedefinirSenha = lazy(() => import('@/pages/RedefinirSenha').then(m => ({ default: m.RedefinirSenha })));

// Vendas
const VendaMenu = lazy(() => import('@/pages/venda/VendaMenu').then(m => ({ default: m.VendaMenu })));
const NovaPropostaPage = lazy(() => import('@/pages/venda/NovaPropostaPage').then(m => ({ default: m.NovaPropostaPage })));
const PropostasListPage = lazy(() => import('@/pages/venda/PropostasListPage').then(m => ({ default: m.PropostasListPage })));

// Frota
const FrotaMenu = lazy(() => import('@/pages/frota/FrotaMenu').then(m => ({ default: m.FrotaMenu })));
const VeiculosList = lazy(() => import('@/pages/frota/VeiculosList').then(m => ({ default: m.VeiculosList })));
const MotoristasList = lazy(() => import('@/pages/frota/MotoristasList').then(m => ({ default: m.MotoristasList })));
const AbastecimentosList = lazy(() => import('@/pages/frota/AbastecimentosList').then(m => ({ default: m.AbastecimentosList })));
const GastosFrota = lazy(() => import('@/pages/frota/GastosFrota').then(m => ({ default: m.GastosFrota })));
const ManutencaoList = lazy(() => import('@/pages/frota/ManutencaoList').then(m => ({ default: m.ManutencaoList })));
const ViagensList = lazy(() => import('@/pages/frota/ViagensList').then(m => ({ default: m.ViagensList })));
const VeiculoForm = lazy(() => import('@/pages/frota/VeiculoForm').then(m => ({ default: m.VeiculoForm })));
const MotoristaForm = lazy(() => import('@/pages/frota/MotoristaForm').then(m => ({ default: m.MotoristaForm })));
const AbastecimentoForm = lazy(() => import('@/pages/frota/AbastecimentoForm').then(m => ({ default: m.AbastecimentoForm })));
const ManutencaoForm = lazy(() => import('@/pages/frota/ManutencaoForm').then(m => ({ default: m.ManutencaoForm })));
const ViagemForm = lazy(() => import('@/pages/frota/ViagemForm').then(m => ({ default: m.ViagemForm })));
const OcorrenciasList = lazy(() => import('@/pages/frota/OcorrenciasList').then(m => ({ default: m.OcorrenciasList })));
const OcorrenciaForm = lazy(() => import('@/pages/frota/OcorrenciaForm').then(m => ({ default: m.OcorrenciaForm })));

// Cobradores
const CobradoresMenu = lazy(() => import('@/pages/cobradores/CobradoresMenu').then(m => ({ default: m.CobradoresMenu })));
const CobradoresList = lazy(() => import('@/pages/cobradores/CobradoresList').then(m => ({ default: m.CobradoresList })));
const CobrancasPendentes = lazy(() => import('@/pages/cobradores/CobrancasPendentes').then(m => ({ default: m.CobrancasPendentes })));
const RotasCobranca = lazy(() => import('@/pages/cobradores/RotasCobranca').then(m => ({ default: m.RotasCobranca })));
const ComissoesCobradores = lazy(() => import('@/pages/cobradores/ComissoesCobradores').then(m => ({ default: m.ComissoesCobradores })));
const CobradorForm = lazy(() => import('@/pages/cobradores/CobradorForm').then(m => ({ default: m.CobradorForm })));
const RotaForm = lazy(() => import('@/pages/cobradores/RotaForm').then(m => ({ default: m.RotaForm })));
const RecebimentosList = lazy(() => import('@/pages/cobradores/RecebimentosList').then(m => ({ default: m.RecebimentosList })));
const RecebimentoForm = lazy(() => import('@/pages/cobradores/RecebimentoForm').then(m => ({ default: m.RecebimentoForm })));
const RelatoriosCobranca = lazy(() => import('@/pages/cobradores/RelatoriosCobranca').then(m => ({ default: m.RelatoriosCobranca })));
const CarteiraCobrador = lazy(() => import('@/pages/cobradores/CarteiraCobrador').then(m => ({ default: m.CarteiraCobrador })));
const ConfiguracaoPermissoesCobradores = lazy(() => import('@/pages/cobradores/ConfiguracaoPermissoesCobradores').then(m => ({ default: m.ConfiguracaoPermissoesCobradores })));
const CobradorImpressoes = lazy(() => import('@/pages/cobradores/CobradorImpressoes').then(m => ({ default: m.CobradorImpressoes })));
const CobradorRotaGestor = lazy(() => import('@/components/cobradores/CobradorRotaGestor').then((m) => ({ default: m.CobradorRotaGestor })));

// Ponto
const PontoMenu = lazy(() => import('@/pages/ponto/PontoMenu').then(m => ({ default: m.PontoMenu })));
const PontoRegistro = lazy(() => import('@/pages/ponto/PontoRegistro').then(m => ({ default: m.PontoRegistro })));
const PontoEspelho = lazy(() => import('@/pages/ponto/PontoEspelho').then(m => ({ default: m.PontoEspelho })));
const PontoJornadas = lazy(() => import('@/pages/ponto/PontoJornadas').then(m => ({ default: m.PontoJornadas })));

const ConfigPage = lazy(() => import('@/pages/ConfigPage').then(m => ({ default: m.ConfigPage })));

class AppErrorBoundary extends React.Component<{ children: ReactNode }, { crashed: boolean; error: Error | null }> {
  state = { crashed: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { crashed: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-slate-950 px-6 py-8 overflow-auto">
          <p className="text-gray-700 dark:text-gray-300 text-center max-w-md text-sm leading-relaxed">
            Não foi possível carregar o aplicativo.
          </p>
          <pre className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-4 rounded border border-red-200 dark:border-red-900/50 w-full max-w-lg overflow-auto whitespace-pre-wrap word-break-all max-h-[300px]">
            {this.state.error ? `${this.state.error.message}\n\nStack: ${this.state.error.stack}` : 'Erro desconhecido'}
          </pre>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
    <ApexLoader />
  </div>
);

const NovaPropostaPageWrapper: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  return <NovaPropostaPage key={id || 'nova'} />;
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

const PontoAccessRoute = lazy(() => import('@/components/PontoAccessRoute'));

const CobradoresIndexRoute: React.FC = () => <CobradoresMenu />;

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
      root.style.setProperty('--accent-brand', savedAccent);
    }
  }, []);
  return null;
};

export const App: React.FC = () => {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <ThemeInitializer />
          <AppErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                {/* Rotas Públicas */}
                <Route path="/" element={<Login />} />
                <Route path="/redefinir-senha" element={<RedefinirSenha />} />
                <Route path="/primeiro-acesso" element={<ProtectedRoute><PrimeiroAcesso /></ProtectedRoute>} />

                {/* Rotas Privadas (Layout Principal) */}
                <Route element={<ProtectedRoute><LazyProviders><Layout /></LazyProviders></ProtectedRoute>}>
                  <Route path="/inicio" element={<InicioModulos />} />

                  {/* Vendas */}
                  <Route path="/venda" element={<VendaMenu />} />
                  <Route path="/venda/nova" element={<NovaPropostaPageWrapper />} />
                  <Route path="/venda/propostas" element={<PropostasListPage />} />
                  <Route path="/venda/propostas/:id/editar" element={<NovaPropostaPageWrapper />} />

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

                  {/* Cobradores */}
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

                  {/* Configurações básicas */}
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

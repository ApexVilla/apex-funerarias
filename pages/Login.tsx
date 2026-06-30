import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, Loader2, ArrowRight, Lock, Mail } from 'lucide-react';
import { Button, Input } from '../components/ui/Components';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { APEX_FAVICON_PATH, APEX_PLAN_NAME, APEX_PLAN_TAGLINE, APEX_PLAN_VENDOR } from '../lib/apexBranding';
import { UsuarioInativoAviso } from '../components/auth/UsuarioInativoAviso';
import { readLoginBlockInativo, type LoginBlockInativo } from '../lib/usuarioInativacao';
import { consumirAvisoSessaoExpirada } from '../lib/authSessionUtils';

const ResetPasswordModal = lazy(() => import('../components/ResetPasswordModal'));

const LOGIN_EMAIL_KEY = 'funeraria_login_email';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshUser } = useAuth();
  /** Cobre auth + perfil + troca de rota — evita o formulário “solto” sem spinner antes do redirect. */
  const [entradaEmAndamento, setEntradaEmAndamento] = useState(false);
  const [faseEntrada, setFaseEntrada] = useState<'credenciais' | 'perfil' | 'redirecionando'>('credenciais');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');
  const [loginBlockInativo, setLoginBlockInativo] = useState<LoginBlockInativo | null>(null);

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(LOGIN_EMAIL_KEY);
      if (savedEmail) {
        setFormData((prev) => ({ ...prev, email: savedEmail }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const block = readLoginBlockInativo();
    if (block) {
      setLoginBlockInativo(block);
      setEntradaEmAndamento(false);
      setFaseEntrada('credenciais');
      setError('');
      return;
    }
    const sessaoExpirada = consumirAvisoSessaoExpirada();
    if (sessaoExpirada) {
      setError(sessaoExpirada);
    }
  }, []);

  // Redireciona quando o perfil já estiver carregado (evita corrida com ProtectedRoute)
  useEffect(() => {
    if (authLoading || !user?.id) return;
    const dest = user.must_change_password ? '/primeiro-acesso' : '/inicio';
    setFaseEntrada('redirecionando');
    navigate(dest, { replace: true });
    const t = window.setTimeout(() => {
      setEntradaEmAndamento(false);
      setFaseEntrada('credenciais');
    }, 320);
    return () => window.clearTimeout(t);
  }, [authLoading, user?.id, user?.must_change_password, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntradaEmAndamento(true);
    setFaseEntrada('credenciais');
    setError('');

    try {
      const normalizedEmail = formData.email.trim().toLowerCase();
      const password = formData.password.replace(/\r\n|\r|\n/g, '').trim();
      const { data: signData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) throw authError;

      // Baixa o painel em paralelo enquanto o perfil carrega (Wi‑Fi lento).
      void import('../components/AuthenticatedShell');
      void import('../pages/InicioModulos');

      try {
        localStorage.setItem(LOGIN_EMAIL_KEY, normalizedEmail);
      } catch {
        /* ignore */
      }

      setFaseEntrada('perfil');
      await new Promise((r) => setTimeout(r, 150));
      const perfil = await refreshUser(signData.session);
      if (!perfil) {
        const block = readLoginBlockInativo();
        if (block) {
          setLoginBlockInativo(block);
          setEntradaEmAndamento(false);
          setFaseEntrada('credenciais');
          return;
        }
        const dominio = normalizedEmail.split('@')[1] || '';
        const dicaEmail =
          dominio && !dominio.includes('fenixfuneraria')
            ? ' O e-mail cadastrado costuma terminar em @fenixfuneraria.com (não @remixfuneraria.com).'
            : '';
        setError(
          'A senha foi aceita, mas o perfil do usuário não carregou a tempo.' +
            dicaEmail +
            ' Verifique a internet, tente de novo ou use o e-mail que o administrador cadastrou. Se persistir, contate o suporte.',
        );
        setEntradaEmAndamento(false);
        setFaseEntrada('credenciais');
        return;
      }
      // Redirect único via useEffect quando `user` e `authLoading` estiverem estáveis (evita flash do formulário)
    } catch (err: unknown) {
      console.error('Login error:', err);
      const raw = (err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: string }).message)
        : err instanceof Error
          ? err.message
          : ''
      ).trim();
      const lower = raw.toLowerCase();

      if (
        lower.includes('invalid login credentials') ||
        lower.includes('invalid credentials') ||
        lower.includes('invalid_grant')
      ) {
        setError('Credenciais inválidas. Confira e-mail/senha e tente novamente.');
      } else if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
        setError('E-mail ainda não confirmado. Peça ao administrador para confirmar a conta ou use recuperação de senha.');
      } else if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
        setError('Muitas tentativas de login. Aguarde alguns minutos e tente de novo.');
      } else if (lower.includes('failed to fetch') || lower.includes('network')) {
        setError('Sem conexão com o servidor. Verifique a internet ou se o endereço do sistema está correto.');
      } else if (
        lower.includes('database error') ||
        lower.includes('unexpected_failure') ||
        lower.includes('500') ||
        lower.includes('502') ||
        lower.includes('503')
      ) {
        setError(
          'O servidor de autenticação falhou ao validar o usuário. Se o problema continuar, avise o suporte (pode ser cadastro incompleto no painel Supabase).',
        );
      } else if (raw) {
        setError(`Não foi possível entrar: ${raw}`);
      } else {
        setError('Não foi possível entrar agora. Tente novamente em instantes.');
      }
      setEntradaEmAndamento(false);
      setFaseEntrada('credenciais');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setResetError('Informe o e-mail da sua conta.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/#/redefinir-senha`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      setResetError(err?.message || 'Erro ao enviar o e-mail de recuperação.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 relative">
      {(entradaEmAndamento || authLoading || faseEntrada === 'redirecionando') && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="apex-spinner-container">
            <div className="apex-spinner"></div>
            <div className="apex-loader">
              <span>Carregando</span>
              <div className="apex-loader-words">
                <span className="apex-loader-word">Planos</span>
                <span className="apex-loader-word">Clientes</span>
                <span className="apex-loader-word">Financeiro</span>
                <span className="apex-loader-word">Contratos</span>
                <span className="apex-loader-word">Planos</span>
              </div>
            </div>
          </div>
          <div className="text-center px-6 max-w-sm mt-2">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              {authLoading 
                ? 'Verificando sessão ativa…' 
                : faseEntrada === 'credenciais' 
                ? 'Validando credenciais…'
                : faseEntrada === 'perfil' 
                ? 'Carregando seu perfil…'
                : 'Abrindo o sistema…'}
            </p>
          </div>
        </div>
      )}
      {/* Left Column - Brand (CSS-only animations) */}
      <div className="w-full md:w-1/2 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-8 md:p-16 flex flex-col justify-between relative overflow-hidden text-white animate-[fadeIn_0.5s_ease-out]">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-3 p-3 bg-white/10 rounded-2xl border border-white/20 mb-8">
            <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-lg shrink-0">
              <img src={APEX_FAVICON_PATH} alt="" className="h-8 w-8 object-contain" aria-hidden />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">{APEX_PLAN_NAME}</p>
              <p className="text-xs text-blue-200/90">{APEX_PLAN_TAGLINE}</p>
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-blue-200">
            Gestão inteligente e integrada
          </h1>

          <p className="text-lg text-blue-100/80 max-w-lg leading-relaxed">
            Planos, finanças, CRM e atendimentos em um único ambiente — {APEX_PLAN_NAME}.
          </p>
        </div>

        <p className="relative z-10 mt-12 md:mt-0 text-sm text-blue-200/70 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Plataforma {APEX_PLAN_NAME} · desenvolvida por</span>
          <a
            href="https://apexvilla.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-200 hover:text-white hover:underline transition-colors duration-150 font-medium"
          >
            apexvilla.com.br
          </a>
        </p>
      </div>

      {/* Right Column - Login Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 sm:p-12 relative animate-[fadeIn_0.5s_ease-out]">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-100/70 via-transparent to-gray-200/70 opacity-70 pointer-events-none" />

        <div className="w-full max-w-[420px] bg-white p-8 rounded-3xl shadow-2xl shadow-gray-200 border border-gray-100 relative z-10">
          <div className="text-center mb-8">
            <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 ring-1 ring-blue-100">
              <img src={APEX_FAVICON_PATH} alt="" className="h-9 w-9 object-contain" aria-hidden />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Bem-vindo(a)</h2>
            <p className="text-gray-500">
              Acesso ao <span className="font-semibold text-gray-800">{APEX_PLAN_NAME}</span>
            </p>
          </div>



          {loginBlockInativo ? (
            <UsuarioInativoAviso
              block={loginBlockInativo}
              onFechar={() => setLoginBlockInativo(null)}
            />
          ) : (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute left-3 top-9 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                  <Mail className="h-5 w-5" />
                </div>
                <Input
                  label="Email Corporativo"
                  type="email"
                  placeholder="seu@empresa.com"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={entradaEmAndamento}
                  className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="relative group">
                <div className="absolute left-3 top-9 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                  <Lock className="h-5 w-5" />
                </div>
                <Input
                  label="Senha"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={entradaEmAndamento}
                  className="pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => { setShowResetForm(true); setResetEmail(formData.email); setResetSent(false); setResetError(''); }}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors hover:underline"
              >
                Esqueceu a senha?
              </button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2 overflow-hidden">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-6 rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] group"
              disabled={entradaEmAndamento}
            >
              {entradaEmAndamento ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Entrando…</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Acessar Plataforma</span>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </Button>
          </form>
          )}

          <div className="mt-8 space-y-3 text-center text-sm text-gray-500">
            <p>
              Ainda não tem acesso?{' '}
              <a
                href="https://wa.me/5562981254228"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 font-semibold hover:text-blue-700 hover:underline"
              >
                Fale com o suporte
              </a>
            </p>
            <p className="text-xs text-gray-400">
              Desenvolvido por{' '}
              <a
                href="https://apexvilla.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors duration-150"
              >
                apexvilla.com.br
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Modal Esqueceu a Senha - lazy loaded */}
      {showResetForm && (
        <Suspense fallback={null}>
          <ResetPasswordModal
            resetEmail={resetEmail}
            setResetEmail={setResetEmail}
            resetSent={resetSent}
            setResetSent={setResetSent}
            resetError={resetError}
            setResetError={setResetError}
            resetLoading={resetLoading}
            onSubmit={handleResetPassword}
            onClose={() => setShowResetForm(false)}
          />
        </Suspense>
      )}
    </div>
  );
};
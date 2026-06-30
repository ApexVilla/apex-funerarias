import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button, Input } from '../components/ui/Components';
import { supabase } from '../lib/supabase';

export const RedefinirSenha: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const paramsStr = hash.includes('?') ? hash.split('?')[1] : '';
    const params = new URLSearchParams(paramsStr);

    const recoveryToken = params.get('recovery_token');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (recoveryToken) {
      // Link gerado pelo admin - verifica token via API do Supabase
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      fetch(`${supabaseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({ type: 'recovery', token_hash: recoveryToken }),
      })
        .then((res) => res.json())
        .then(async (data) => {
          if (data.access_token && data.refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
            });
            if (error) {
              setError('Link de recuperação inválido ou expirado.');
            } else {
              setSessionReady(true);
              window.history.replaceState(null, '', `${window.location.pathname}#/redefinir-senha`);
            }
          } else {
            setError(data.error_description || data.msg || 'Link inválido ou expirado. Solicite um novo link.');
          }
        })
        .catch(() => setError('Erro ao verificar o link. Tente novamente.'));
    } else if (accessToken && refreshToken) {
      // Fallback: tokens diretos na URL (via redirect do Supabase)
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
        if (error) {
          setError('Link de recuperação inválido ou expirado.');
        } else {
          setSessionReady(true);
          window.history.replaceState(null, '', `${window.location.pathname}#/redefinir-senha`);
        }
      });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSessionReady(true);
        } else {
          setError('Link inválido ou expirado. Solicite um novo link ao administrador.');
        }
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/'), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erro ao redefinir senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        {success ? (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Senha Redefinida!</h2>
            <p className="text-sm text-gray-600">Sua senha foi alterada com sucesso. Você será redirecionado para o login...</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <KeyRound className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Nova Senha</h2>
                <p className="text-sm text-gray-500">Defina uma nova senha para sua conta</p>
              </div>
            </div>

            {!sessionReady && !error && (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Verificando link...</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl mb-4">
                {error}
              </div>
            )}

            {sessionReady && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Input
                    label="Nova Senha"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <Input
                  label="Confirmar Nova Senha"
                  type="password"
                  placeholder="Repita a nova senha"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />

                {password && confirm && password !== confirm && (
                  <p className="text-sm text-red-600">As senhas não coincidem.</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !password || !confirm || password !== confirm}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Salvando...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Redefinir Senha</span>
                    </div>
                  )}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};

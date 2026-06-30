import React from 'react';
import { KeyRound, Mail, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { Button, Input } from './ui/Components';

interface ResetPasswordModalProps {
  resetEmail: string;
  setResetEmail: (v: string) => void;
  resetSent: boolean;
  setResetSent: (v: boolean) => void;
  resetError: string;
  setResetError: (v: string) => void;
  resetLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  resetEmail,
  setResetEmail,
  resetSent,
  resetError,
  resetLoading,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-[fadeIn_0.2s_ease-out]">
        {resetSent ? (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">E-mail Enviado!</h3>
            <p className="text-sm text-gray-600">
              Enviamos um link de recuperação para <strong>{resetEmail}</strong>.
              Verifique sua caixa de entrada e spam.
            </p>
            <Button className="w-full mt-4" onClick={onClose}>
              Voltar ao Login
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Recuperar Senha</h3>
                <p className="text-xs text-gray-500">Enviaremos um link por e-mail</p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="relative group">
                <div className="absolute left-3 top-9 text-gray-400 group-focus-within:text-blue-600 transition-colors">
                  <Mail className="h-5 w-5" />
                </div>
                <Input
                  label="E-mail da sua conta"
                  type="email"
                  placeholder="seu@empresa.com"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="pl-10"
                />
              </div>

              {resetError && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  {resetError}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={resetLoading}>
                {resetLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Enviando...</span>
                  </div>
                ) : (
                  'Enviar Link de Recuperação'
                )}
              </Button>

              <button
                type="button"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mt-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordModal;

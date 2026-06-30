import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Input } from '../components/ui/Components';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastStore';
import { supabase } from '../lib/supabase';
import { atualizarMeuPerfil } from '../lib/userProfileService';

export const PrimeiroAcesso: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return <Navigate to="/" replace />;
  if (!user.must_change_password) return <Navigate to="/inicio" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      showToast('A senha precisa ter pelo menos 6 caracteres.', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      showToast('As senhas não conferem.', 'warning');
      return;
    }

    try {
      setSaving(true);
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;

      const { error: profileError } = await atualizarMeuPerfil({
        mustChangePassword: false,
      });
      if (profileError) throw new Error(profileError);

      await refreshUser();
      showToast('Senha alterada com sucesso. Acesso liberado.', 'success');
      navigate('/inicio', { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível alterar a senha.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="text-xl font-bold text-amber-900">Primeiro acesso</h1>
        <p className="mt-1 text-sm text-amber-800">
          Por segurança, você precisa definir uma nova senha para continuar.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <Input
          label="Nova senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          required
        />
        <Input
          label="Confirmar nova senha"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repita a senha"
          required
        />
        <Button type="submit" loading={saving} className="w-full">
          Alterar senha e continuar
        </Button>
      </form>
    </div>
  );
};

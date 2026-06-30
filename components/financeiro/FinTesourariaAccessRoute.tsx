import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { usuarioPodeAcessarTesouraria } from '../../lib/finCaixaPermissoes';

const FinTesourariaAccessRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const perms = user?.permissoes as Record<string, unknown> | undefined;
  if (!usuarioPodeAcessarTesouraria(user?.role, perms)) {
    return <Navigate to="/inicio" replace />;
  }
  return <>{children}</>;
};

export default FinTesourariaAccessRoute;

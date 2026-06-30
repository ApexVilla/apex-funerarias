import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { usuarioPodeAcessarBaixaParcelas } from '../../lib/finCaixaPermissoes';

const FinBaixaParcelasAccessRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const perms = user?.permissoes as Record<string, unknown> | undefined;
  if (!usuarioPodeAcessarBaixaParcelas(user?.role, perms)) {
    return <Navigate to="/inicio" replace />;
  }
  return <>{children}</>;
};

export default FinBaixaParcelasAccessRoute;

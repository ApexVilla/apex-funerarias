import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { canAccessPonto } from '../lib/pontoRules';

const PontoAccessRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (!canAccessPonto(user?.role, user?.permissoes as Record<string, unknown> | undefined)) {
    return <Navigate to="/inicio" replace />;
  }
  return <>{children}</>;
};

export default PontoAccessRoute;

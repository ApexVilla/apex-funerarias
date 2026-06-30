import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { canAccessDocumentosByRole } from '../lib/documentosRules';

const DocumentosAccessRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (!canAccessDocumentosByRole(user?.role)) return <Navigate to="/inicio" replace />;
  return <>{children}</>;
};

export default DocumentosAccessRoute;

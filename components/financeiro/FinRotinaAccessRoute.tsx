import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { usuarioPodeAcessarBaixaParcelas } from '../../lib/finCaixaPermissoes';
import {
  usuarioPodeAcessarHubFinanceiro,
  usuarioPodeAcessarRotinaFinanceiraPorPath,
} from '../../lib/financeiroMenuPermissoes';

type Props = {
  /** Caminho da rotina (ex.: `/financeiro/contas-receber`) ou hub `/financeiro`. */
  path: string;
  children: React.ReactNode;
};

const FinRotinaAccessRoute: React.FC<Props> = ({ path, children }) => {
  const { user } = useAuth();
  const perms = user?.permissoes as Record<string, unknown> | undefined;
  const role = user?.role;

  const allowed =
    path === '/financeiro'
      ? usuarioPodeAcessarHubFinanceiro(role, perms)
      : usuarioPodeAcessarRotinaFinanceiraPorPath(role, perms, path);

  if (!allowed) {
    const fallback = usuarioPodeAcessarBaixaParcelas(role, perms)
      ? '/financeiro/baixa-parcelas'
      : '/inicio';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default FinRotinaAccessRoute;

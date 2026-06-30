import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { usuarioEhCobradorCampoRestrito } from '../../lib/cobradorUsuarioLink';

/** Bloqueia cobrador em campo de telas de gestão (lista, relatórios, todos os recebimentos, etc.). */
export const CobradorRotaGestor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    if (usuarioEhCobradorCampoRestrito(user?.role)) {
        return <Navigate to="/cobradores/pendentes" replace />;
    }
    return <>{children}</>;
};

import React from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import { Timer, CalendarClock, Users } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { canAccessPontoByRole } from '../../lib/pontoRules';

export const PontoMenu: React.FC = () => {
  const { user } = useAuth();
  const canManage = canAccessPontoByRole(user?.role);

  const items = [
    {
      icon: Timer,
      label: 'Registro de Ponto',
      path: '/ponto/registro',
      description: 'Marcação de entrada, saída e intervalo com cálculo automático de jornada.',
      color: '#2563eb',
    },
    {
      icon: CalendarClock,
      label: 'Espelho de Ponto',
      path: '/ponto/espelho',
      description: 'Resumo diário com horas trabalhadas, pendências e status da jornada.',
      color: '#0ea5e9',
    },
    ...(canManage
      ? [
          {
            icon: Users,
            label: 'Gestão de Jornada',
            path: '/ponto/jornadas',
            description: 'Definição da jornada por colaborador: 8h, 6h, 12x36 ou personalizado.',
            color: '#7c3aed',
          },
        ]
      : []),
  ];

  return (
    <ModuleMenu
      title="Gestão de Ponto"
      subtitle="Controle de jornada com marcações e conferência diária"
      accentColor="#3730a3"
      items={items}
    />
  );
};

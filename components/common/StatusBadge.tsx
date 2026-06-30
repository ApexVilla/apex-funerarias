import React from 'react';
import { Badge } from '../ui/Components';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  let variant: 'default' | 'success' | 'warning' | 'danger' = 'default';

  if (!status) {
    return (
      <Badge variant="default" className={className}>
        N/A
      </Badge>
    );
  }

  const normalized = status.toLowerCase().replace(/\s/g, '_');
  switch (normalized) {
    case 'ativo':
      variant = 'success';
      break;
    case 'inativo':
    case 'cancelado':
      variant = 'default';
      break;
    case 'suspenso':
    case 'inercia':
    case 'inerte':
      variant = 'warning';
      break;
    case 'inadimplente':
      variant = 'danger';
      break;
    case 'aguardando':
    case 'aberto':
    case 'pendente':
      variant = 'warning';
      break;
    case 'em_andamento':
      variant = 'default';
      break;
    case 'concluido':
      variant = 'success';
      break;
    default:
      variant = 'default';
  }

  const labels: Record<string, string> = {
    aguardando: 'Aguardando',
    em_andamento: 'Em Andamento',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
    aberto: 'Aberto',
    pendente: 'Pendente',
    inercia: 'Inércia',
    inerte: 'Inércia',
  };
  const label = labels[normalized] ?? status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
};
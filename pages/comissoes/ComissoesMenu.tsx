import React from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import {
  Wallet, UserCheck, BadgePercent, Coins
} from 'lucide-react';

export const ComissoesMenu: React.FC = () => {
  const items = [
    {
      icon: Wallet,
      label: 'Comissões de Cobradores',
      path: '/comissoes/cobradores',
      description: 'Cálculo e acompanhamento de comissões de cobradores sobre recebimentos externos.',
      color: '#0ea5e9' // Sky Blue
    },
    {
      icon: UserCheck,
      label: 'Comissões de Atendimento',
      path: '/comissoes/atendimentos',
      description: 'Comissões dos atendentes e agentes funerários associados às Ordens de Serviço (OS).',
      color: '#0d9488' // Teal
    },
    {
      icon: BadgePercent,
      label: 'Comissões de Vendas',
      path: '/comissoes/vendedores',
      description: 'Cálculo de comissões de vendedores sobre novas adesões e propostas assinadas.',
      color: '#eab308' // Amber
    }
  ];

  return (
    <ModuleMenu
      title="Gestão de Comissões"
      subtitle="Gerenciamento de faturamento e comissões por departamento de atuação"
      accentColor="#059669"
      items={items}
    />
  );
};

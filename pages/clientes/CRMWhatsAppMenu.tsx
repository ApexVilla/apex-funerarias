import React from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import { MessageCircle, Users, BarChart3, PlugZap } from 'lucide-react';

export const CRMWhatsAppMenu: React.FC = () => {
  const items = [
    {
      icon: Users,
      label: 'Clientes CRM',
      path: '/crm/clientes',
      description: 'Lista da carteira com busca/filtros e telefone mascarado para vendedor.',
      color: '#185FA5'
    },
    {
      icon: MessageCircle,
      label: 'Contatos WhatsApp',
      path: '/crm/contatos',
      description: 'Registre interações com data/hora automática e histórico por cliente.',
      color: '#1f7acb'
    },
    {
      icon: PlugZap,
      label: 'Conexão WhatsApp',
      path: '/crm/conexao',
      description: 'Configure número oficial, provedor e token de integração da empresa.',
      color: '#159f6d'
    },
    {
      icon: BarChart3,
      label: 'Dashboard CRM',
      path: '/crm/dashboard',
      description: 'Acompanhe inadimplência, bloqueios, contatos do dia e ranking de atividade.',
      color: '#0f4b85'
    }
  ];

  return (
    <ModuleMenu
      title="CRM WhatsApp"
      subtitle="Gestão comercial protegida para equipe de vendas"
      items={items}
    />
  );
};

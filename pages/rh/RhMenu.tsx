import React from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import {
  Users, CalendarClock, Wallet, ClipboardCheck, DollarSign, Timer, FileText, Activity
} from 'lucide-react';

export const RhMenu: React.FC = () => {
  const items = [
    {
      icon: Users,
      label: 'Colaboradores',
      path: '/rh/colaboradores',
      description: 'Cadastro completo, admissão, documentos e dados dos colaboradores.',
      color: '#0d9488' // Teal
    },
    {
      icon: CalendarClock,
      label: 'Controle de Férias',
      path: '/rh/ferias',
      description: 'Planejamento, agendamentos, gozo e histórico de férias da equipe.',
      color: '#3b82f6' // Blue
    },
    {
      icon: FileText,
      label: 'Painel de Presença',
      path: '/rh/presenca-banco-horas',
      description: 'Presença da equipe em tempo real, status operacional e banco de horas consolidado.',
      color: '#6366f1' // Indigo
    },
    {
      icon: Timer,
      label: 'Gestão de Jornada',
      path: '/ponto/jornadas',
      description: 'Definição de regimes de jornada (8h, 6h, 12x36) e escalas dos colaboradores.',
      color: '#d946ef' // Fuchsia
    },
    {
      icon: Wallet,
      label: 'Gestão de Benefícios',
      path: '/rh/beneficios',
      description: 'Vale transporte, vale alimentação, plano de saúde e outros benefícios.',
      color: '#8b5cf6' // Violet
    },
    {
      icon: ClipboardCheck,
      label: 'Histórico de Ocorrências',
      path: '/rh/ocorrencias',
      description: 'Registro de advertências, suspensões, promoções e transferências.',
      color: '#f59e0b' // Amber
    },
    {
      icon: DollarSign,
      label: 'Comissões de Atendimento',
      path: '/rh/comissoes',
      description: 'Acompanhamento e configuração de comissões por ordem de serviço.',
      color: '#059669' // Green
    }
  ];

  return (
    <ModuleMenu
      title="Recursos Humanos"
      subtitle="Gerencie os colaboradores, férias, benefícios e ocorrências"
      accentColor="#0d9488"
      items={items}
    />
  );
};

import React from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import {
    Shield, Target, CheckSquare, List, UserPlus
} from 'lucide-react';

export const ClientesMenu: React.FC = () => {
    //   { icon: Users, label: 'Todos os Clientes', path: '/clientes' },
    //   { icon: Shield, label: 'Contratos', path: '/clientes/contratos' },
    //   { icon: Target, label: 'Pipeline CRM', path: '/clientes/oportunidades' },
    //   { icon: CheckSquare, label: 'Tarefas CRM', path: '/clientes/tarefas' },

    const items = [
        {
            icon: List,
            label: 'Clientes',
            path: '/clientes/lista',
            description: 'Visualize, pesquise e gerencie a base de clientes ativos e inativos.',
            color: '#3b82f6' // Blue
        },
        {
            icon: Shield,
            label: 'Contratos',
            path: '/clientes/contratos?view=all', // Assuming query param or reuse list
            description: 'Gerencie contratos, assinaturas e termos de adesão.',
            color: '#8b5cf6' // Violet
        },
        {
            icon: Target,
            label: 'Pipeline CRM',
            path: '/clientes/oportunidades',
            description: 'Acompanhe negociações e oportunidades de venda em andamento.',
            color: '#f59e0b' // Amber
        },
        {
            icon: CheckSquare,
            label: 'Tarefas CRM',
            path: '/clientes/tarefas',
            description: 'Gerencie follow-ups, reuniões e tarefas pendentes com clientes.',
            color: '#ef4444' // Red
        }
    ];

    return (
        <ModuleMenu
            title="Gestão de Clientes"
            subtitle="Operação comercial organizada por cadastro, contratos e CRM"
            accentColor="#0e7490"
            items={items}
        />
    );
};

import React from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import {
    ListChecks, Tags
} from 'lucide-react';

export const PlanosMenu: React.FC = () => {
    const items = [
        {
            icon: ListChecks,
            label: 'Gerência de Planos',
            path: '/planos/gerencia',
            description: 'Lista de planos, permissões por perfil e auditoria (criações e alterações).',
            color: '#3b82f6' // Blue
        },
        {
            icon: Tags,
            label: 'Benefícios',
            path: '/planos/categorias',
            description: 'Gerencie o catálogo de benefícios disponíveis nos planos.',
            color: '#8b5cf6' // Violet
        }
    ];

    return (
        <ModuleMenu
            title="Gestão de Planos"
            subtitle="Selecione uma opção para gerenciar o catálogo de planos"
            accentColor="#6d28d9"
            items={items}
        />
    );
};

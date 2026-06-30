import React from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import { Boxes, PackagePlus, PackageMinus, ArrowLeftRight, Truck, Monitor, ClipboardCheck, Building2, Layers } from 'lucide-react';

export const EstoqueMenu: React.FC = () => {
    const items = [
        {
            icon: Boxes,
            label: 'Produtos',
            path: '/estoque/produtos',
            description: 'Cadastro e consulta de itens de estoque.',
            color: '#3b82f6'
        },
        {
            icon: Building2,
            label: 'Filiais e depósitos',
            path: '/estoque/filiais-depositos',
            description: 'Unidades, depósitos centrais e estoque em motorista/veículo.',
            color: '#0ea5e9'
        },
        {
            icon: PackagePlus,
            label: 'Kits',
            path: '/estoque/kits',
            description: 'Agrupamentos de itens associados a planos.',
            color: '#ec4899'
        },
        {
            icon: PackagePlus,
            label: 'Entradas',
            path: '/estoque/entradas',
            description: 'Registro de compras e entrada de mercadorias.',
            color: '#10b981'
        },
        {
            icon: PackageMinus,
            label: 'Saídas',
            path: '/estoque/saidas',
            description: 'Saídas manuais com controle e recibo.',
            color: '#ef4444'
        },
        {
            icon: Layers,
            label: 'Transferências',
            path: '/estoque/transferencias',
            description: 'Transfira saldos entre depósitos da mesma empresa com confirmação.',
            color: '#6366f1'
        },
        {
            icon: ArrowLeftRight,
            label: 'Movimentações',
            path: '/estoque/movimentacoes',
            description: 'Histórico de ajustes, transferências e saídas.',
            color: '#f59e0b'
        },
        {
            icon: Truck,
            label: 'Fornecedores',
            path: '/estoque/fornecedores',
            description: 'Gestão de fornecedores vinculados ao estoque.',
            color: '#8b5cf6'
        },
        {
            icon: ClipboardCheck,
            label: 'Contagem de Estoque',
            path: '/estoque/contagens',
            description: 'Inventário físico por categoria, produto ou geral.',
            color: '#059669'
        },
        {
            icon: Monitor,
            label: 'Equipamentos',
            path: '/estoque/equipamentos',
            description: 'Registro e controle de equipamentos internos.',
            color: '#64748b'
        }
    ];

    return (
        <ModuleMenu
            title="Gestão de Estoque"
            subtitle="Selecione uma opção para administrar materiais e movimentações"
            accentColor="#1d4ed8"
            items={items}
        />
    );
};

import React, { useMemo } from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import { Users, ClipboardList, MapPin, DollarSign, BarChart2, Wallet, BriefcaseBusiness, ShieldCheck, Printer } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { usuarioEhCobradorCampoRestrito, usuarioEhGestorCobranca } from '../../lib/cobradorUsuarioLink';

export const CobradoresMenu: React.FC = () => {
    const { user } = useAuth();
    const cobradorRestrito = usuarioEhCobradorCampoRestrito(user?.role);
    const gestor = usuarioEhGestorCobranca(user?.role);

    const items = useMemo(() => {
        const todos = [
            {
                icon: Users,
                label: 'Cobradores',
                path: '/cobradores/lista',
                description: 'Cadastro e gestão de cobradores ativos, áreas e comissões.',
                color: '#3b82f6',
                gestorOnly: true,
            },
            {
                icon: ClipboardList,
                label: cobradorRestrito ? 'Minha carteira' : 'Cobranças Pendentes',
                path: '/cobradores/pendentes',
                description: cobradorRestrito
                    ? 'Clientes da sua rota, baixa em campo e reimpressão de recibo.'
                    : 'Fila de cobranças atribuídas por cobrador com controle de status.',
                color: '#f59e0b',
                gestorOnly: false,
            },
            {
                icon: Printer,
                label: 'Reimprimir recibo',
                path: '/cobradores/pendentes?aba=reimprimir',
                description: 'Buscar cliente por nome ou CPF e reimprimir comprovante térmico de parcelas já pagas.',
                color: '#059669',
                gestorOnly: false,
            },
            {
                icon: MapPin,
                label: 'Rotas de Cobrança',
                path: '/cobradores/rotas',
                description: 'Roteiros diários de visitas por região e bairro.',
                color: '#10b981',
                gestorOnly: false,
            },
            {
                icon: DollarSign,
                label: 'Recebimentos',
                path: '/cobradores/recebimentos',
                description: 'Registro de valores recebidos em campo pelos cobradores.',
                color: '#8b5cf6',
                gestorOnly: true,
            },
            {
                icon: Printer,
                label: cobradorRestrito ? 'Minhas impressões / Meu caixa' : 'Impressões / Meu caixa',
                path: '/cobradores/impressoes',
                description: 'Resumo por período e conferência do caixa. Para buscar cliente e reimprimir recibo, use «Reimprimir recibo».',
                color: '#6366f1',
                gestorOnly: false,
            },
            {
                icon: BriefcaseBusiness,
                label: cobradorRestrito ? 'Minha carteira' : 'Carteira',
                path: '/cobradores/carteira',
                description: cobradorRestrito
                    ? 'Clientes da sua carteira de cobrança.'
                    : 'Selecione o cobrador ou Escritório e consulte a carteira.',
                color: '#0ea5e9',
                gestorOnly: false,
            },

            {
                icon: BarChart2,
                label: 'Relatórios',
                path: '/cobradores/relatorios',
                description: 'Performance, inadimplência e evolução por cobrador.',
                color: '#6366f1',
                gestorOnly: true,
            },
        ];
        return todos
            .filter((item) => gestor || !item.gestorOnly)
            .map(({ gestorOnly: _omit, ...item }) => item);
    }, [cobradorRestrito, gestor]);

    return (
        <ModuleMenu
            title={cobradorRestrito ? 'Minha área de cobrança' : 'Gestão de Cobradores'}
            subtitle={
                cobradorRestrito
                    ? 'Cobranças, rotas, carteira e comprovantes do seu cadastro de cobrador'
                    : 'Controle completo de cobradores, cobranças pendentes, rotas e comissões'
            }
            accentColor="#c2410c"
            items={items}
        />
    );
};

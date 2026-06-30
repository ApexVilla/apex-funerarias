import React, { useMemo } from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import { useAuth } from '../../lib/AuthContext';
import { usuarioPodeAcessarRotinaFinanceiraPorPath } from '../../lib/financeiroMenuPermissoes';
import {
    DollarSign, HandCoins, Landmark, Receipt, CreditCard, PhoneCall,
    Coins, Building2, FileText, PieChart, FileUp, BarChart3
} from 'lucide-react';

export const FinanceiroMenu: React.FC = () => {
    const { user } = useAuth();
    const perms = user?.permissoes as Record<string, unknown> | undefined;

    const items = useMemo(() => {
        const todos = [
            { icon: DollarSign, label: 'Dashboard Financeiro', path: '/financeiro/dashboard', description: 'Dashboard financeiro com indicadores principais.', color: '#3b82f6' },
            { icon: HandCoins, label: 'Baixa de Parcelas', path: '/financeiro/baixa-parcelas', description: 'Recebimento de mensalidades no balcão.', color: '#10b981' },
            { icon: FileUp, label: 'Importação OFX / CNAB', path: '/financeiro/importacao-ofx', description: 'OFX ou retorno Sicredi (.crt) — baixa automática de boletos.', color: '#2563eb' },
            { icon: PhoneCall, label: 'Cobrança', path: '/financeiro/cobranca', description: 'Central de cobrança com fila de contatos, promessas e recebimento.', color: '#f97316' },
            { icon: Landmark, label: 'Tesouraria', path: '/financeiro/tesouraria', description: 'Abertura e fechamento do dia (tesouraria).', color: '#f59e0b' },
            { icon: Receipt, label: 'Contas a Receber', path: '/financeiro/contas-receber', description: 'Gerenciamento de recebíveis e cobranças.', color: '#8b5cf6' },
            { icon: CreditCard, label: 'Contas a Pagar', path: '/financeiro/contas-pagar', description: 'Controle de despesas e pagamentos a fornecedores.', color: '#ef4444' },
            { icon: Coins, label: 'Fluxo de Caixa', path: '/financeiro/fluxo-caixa', description: 'Relatório detalhado de entradas e saídas.', color: '#06b6d4' },
            { icon: Building2, label: 'Contas Bancárias', path: '/financeiro/contas-bancarias', description: 'Cadastro e conciliação de contas bancárias.', color: '#64748b' },
            { icon: FileText, label: 'Plano de Contas', path: '/financeiro/plano-contas', description: 'Visualização hierárquica da estrutura contábil da empresa.', color: '#64748b' },
            { icon: FileText, label: 'Naturezas Financeiras', path: '/financeiro/naturezas', description: 'Estrutura de categorias de receitas e despesas.', color: '#64748b' },
            { icon: PieChart, label: 'Centros de Custo', path: '/financeiro/centros-custo', description: 'Gestão de centros de custo e resultados.', color: '#64748b' },
            { icon: BarChart3, label: 'DRE', path: '/financeiro/dre', description: 'Demonstração do Resultado do Exercício com análise vertical.', color: '#059669' },
        ];
        return todos.filter((item) =>
            usuarioPodeAcessarRotinaFinanceiraPorPath(user?.role, perms, item.path),
        );
    }, [user?.role, perms]);

    return (
        <ModuleMenu
            title="Gestão Financeira"
            subtitle="Controle total das finanças da empresa"
            accentColor="#b45309"
            items={items}
        />
    );
};

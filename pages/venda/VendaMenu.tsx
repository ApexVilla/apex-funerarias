import React from 'react';
import { ModuleMenu } from '../../components/common/ModuleMenu';
import { ClipboardList, FileSignature, Headphones } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { usuarioPodeGerarContratoProposta } from '../../lib/propostasVisibilidade';

export const VendaMenu: React.FC = () => {
  const { user } = useAuth();
  const podeAdminContrato = usuarioPodeGerarContratoProposta(
    user?.role,
    user?.permissoes as Record<string, unknown>,
    user?.roles_extra,
  );

  const items = [
    {
      icon: ClipboardList,
      label: 'Propostas',
      path: '/venda/propostas',
      description: 'Acompanhe propostas registradas e use a lista para criar uma nova proposta.',
      color: '#2563eb',
    },
    ...(podeAdminContrato
      ? [
          {
            icon: FileSignature,
            label: 'Fila para contrato',
            path: '/venda/propostas?fila=contrato',
            description: 'Propostas liberadas pelo vendedor — assumir pós-venda e depois gerar contrato.',
            color: '#7c3aed',
          },
          {
            icon: Headphones,
            label: 'Pós-venda em andamento',
            path: '/venda/propostas?fila=pos-venda',
            description: 'Quem está analisando cada proposta e há quanto tempo.',
            color: '#0d9488',
          },
        ]
      : []),
  ];

  return (
    <ModuleMenu
      title="Vendas"
      subtitle="Orçamentos e inscrições digitais para formalizar pedidos e contratos"
      accentColor="#047857"
      items={items}
    />
  );
};

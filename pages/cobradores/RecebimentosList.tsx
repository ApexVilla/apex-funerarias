import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    DollarSign, Plus, Search, Calendar, User, 
    Filter, ArrowRight, CheckCircle2, Clock
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { listarRecebimentosCampo } from '../../lib/cobRecebimentosSupabase';
import { useCobradorEscopo } from '../../lib/useCobradorEscopo';
import { mensagemErroSupabase } from '../../lib/supabaseErrorMessage';

interface Recebimento {
    id: string;
    data: string;
    valor_centavos: number;
    cliente_nome: string;
    cobrador_nome: string;
    forma_pagamento: string;
    status: 'confirmado' | 'pendente_conferencia';
}

const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export const RecebimentosList: React.FC = () => {
    const navigate = useNavigate();
    const { dataRevisionEmpresa } = useEmpresaContextoAtivo();
    const { empresaIdsFiltro } = useEmpresaIdsOperacao();
    const { showToast } = useToast();
    const { cobradorRestrito, meuCobradorId } = useCobradorEscopo(empresaIdsFiltro);
    const [items, setItems] = useState<Recebimento[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (empresaIdsFiltro.length === 0) return;
            setLoading(true);
            try {
                const rows = await listarRecebimentosCampo(empresaIdsFiltro, {
                    ...(cobradorRestrito && meuCobradorId ? { cobrador_id: meuCobradorId } : {}),
                });
                setItems(
                    rows.map((r) => ({
                        id: r.id,
                        data: r.data,
                        valor_centavos: r.valor_centavos,
                        cliente_nome: r.cliente_nome,
                        cobrador_nome: r.cobrador_nome,
                        forma_pagamento: r.forma_pagamento,
                        status: r.status,
                    })),
                );
            } catch (error) {
                showToast(mensagemErroSupabase(error, 'Erro ao carregar recebimentos'), 'error');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [empresaIdsFiltro.join(','), dataRevisionEmpresa, showToast, cobradorRestrito, meuCobradorId]);

    return (
        <div className="space-y-6">
            <PageHeader
                title={cobradorRestrito ? 'Meus recebimentos' : 'Recebimentos de Campo'}
                subtitle={
                    cobradorRestrito
                        ? 'Somente os valores que você recebeu em campo.'
                        : 'Registro e conferência de valores recebidos pelos cobradores'
                }
                actionButton={
                    <Button onClick={() => navigate('/cobradores/recebimentos/novo')}>
                        <Plus className="h-4 w-4 mr-2" /> Novo Recebimento
                    </Button>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 bg-green-50 border-green-100">
                    <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Total Recebido (Mês)</p>
                    <p className="text-3xl font-bold text-green-700 mt-1">R$ 12.450,00</p>
                </Card>
                <Card className="p-4 bg-amber-50 border-amber-100">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Aguardando Conferência</p>
                    <p className="text-3xl font-bold text-amber-700 mt-1">R$ 1.890,00</p>
                </Card>
                <Card className="p-4 bg-blue-50 border-blue-100">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Média por Cobrador</p>
                    <p className="text-3xl font-bold text-blue-700 mt-1">R$ 2.490,00</p>
                </Card>
            </div>

            <Card className="overflow-hidden border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Data</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Cliente</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Cobrador</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Forma</th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-600">Valor</th>
                                <th className="text-center py-3 px-4 font-semibold text-gray-600">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-gray-400">
                                        <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                        Nenhum recebimento registrado no período.
                                    </td>
                                </tr>
                            ) : (
                                items.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer" onClick={() => navigate(`/cobradores/recebimentos/${item.id}`)}>
                                        <td className="py-3 px-4 text-gray-600">
                                            {new Date(item.data).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-slate-100">{item.cliente_nome}</td>
                                        <td className="py-3 px-4 text-gray-600">{item.cobrador_nome}</td>
                                        <td className="py-3 px-4">
                                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 capitalize">{item.forma_pagamento}</span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-slate-100">
                                            {formatCurrency(item.valor_centavos)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                item.status === 'confirmado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {item.status === 'confirmado' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                                {item.status === 'confirmado' ? 'Confirmado' : 'Pendente'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

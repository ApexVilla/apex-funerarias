import React, { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, FileText, Calendar, Search, Filter } from 'lucide-react';
import { useFinanceiro, ContaBancaria, Movimentacao, formatCentavos } from '../../lib/FinanceiroStore';
import { Button, Input, Select, Badge } from '../../components/ui/Components';

interface ExtratoContaModalProps {
    conta: ContaBancaria;
    onClose: () => void;
}

export const ExtratoContaModal: React.FC<ExtratoContaModalProps> = ({ conta, onClose }) => {
    const { loadMovimentacoes, movimentacoes, loading } = useFinanceiro();
    const [searchTerm, setSearchTerm] = useState('');
    const [tipoFilter, setTipoFilter] = useState<string>('todos');

    useEffect(() => {
        if (conta) {
            loadMovimentacoes({ conta_bancaria_id: conta.id });
        }
    }, [conta, loadMovimentacoes]);

    const filteredMovimentacoes = movimentacoes.filter(mov => {
        const matchesSearch = mov.descricao.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTipo = tipoFilter === 'todos' ||
            (tipoFilter === 'entrada' && (mov.tipo === 'receita' || mov.tipo === 'transferencia_entrada')) ||
            (tipoFilter === 'saida' && (mov.tipo === 'despesa' || mov.tipo === 'transferencia_saida'));
        return matchesSearch && matchesTipo;
    });

    const getTipoBadge = (tipo: string) => {
        switch (tipo) {
            case 'receita':
                return <Badge variant="success">Receita</Badge>;
            case 'despesa':
                return <Badge variant="danger">Despesa</Badge>;
            case 'transferencia_entrada':
                return <Badge variant="info">Transf. Entrada</Badge>;
            case 'transferencia_saida':
                return <Badge variant="warning">Transf. Saída</Badge>;
            default:
                return <Badge variant="default">{tipo}</Badge>;
        }
    };

    const isEntrada = (tipo: string) => {
        return tipo === 'receita' || tipo === 'transferencia_entrada';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b shrink-0">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-gray-900">Extrato Bancário</h2>
                            <Badge variant={conta.ativo ? "success" : "secondary"}>
                                {conta.ativo ? 'Ativa' : 'Inativa'}
                            </Badge>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{conta.nome} - {conta.banco_nome}</p>
                    </div>
                    <div className="text-right mr-4">
                        <p className="text-sm text-gray-500">Saldo Atual</p>
                        <p className={`text-2xl font-bold ${conta.saldo_atual_centavos >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCentavos(conta.saldo_atual_centavos)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Filters */}
                <div className="p-4 border-b bg-gray-50 flex flex-col md:flex-row gap-4 shrink-0">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Buscar lançamentos..."
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-48">
                        <Select
                            value={tipoFilter}
                            onChange={(e) => setTipoFilter(e.target.value)}
                        >
                            <option value="todos">Todas as Movimentações</option>
                            <option value="entrada">Entradas (Receitas/Transf)</option>
                            <option value="saida">Saídas (Despesas/Transf)</option>
                        </Select>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-auto p-0">
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : filteredMovimentacoes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <FileText className="h-12 w-12 mb-2 opacity-20" />
                            <p>Nenhuma movimentação encontrada neste período.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="px-6 py-3">Data</th>
                                    <th className="px-6 py-3">Tipo</th>
                                    <th className="px-6 py-3">Descrição</th>
                                    <th className="px-6 py-3 text-right">Valor</th>
                                    <th className="px-6 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredMovimentacoes.map((mov) => (
                                    <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                            {new Date(mov.data_movimentacao).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getTipoBadge(mov.tipo)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{mov.descricao}</div>
                                            {mov.conciliada && <span className="text-xs text-green-600 flex items-center gap-1"><Calendar className="h-3 w-3" /> Conciliado</span>}
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-right font-medium ${isEntrada(mov.tipo) ? 'text-green-600' : 'text-red-600'}`}>
                                            {isEntrada(mov.tipo) ? '+' : '-'}{formatCentavos(mov.valor_centavos)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            {mov.conciliada ? (
                                                <Badge variant="success" className="bg-green-100 text-green-700 border-green-200">Conciliado</Badge>
                                            ) : (
                                                <Badge variant="warning" className="bg-yellow-100 text-yellow-700 border-yellow-200">Pendente</Badge>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex justify-end shrink-0">
                    <Button onClick={onClose}>Fechar</Button>
                </div>
            </div>
        </div>
    );
};

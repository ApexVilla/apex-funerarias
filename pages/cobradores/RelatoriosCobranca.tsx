import React from 'react';
import { 
    BarChart2, TrendingUp, TrendingDown, Users, 
    Calendar, Download, ArrowLeft, Filter
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Select } from '../../components/ui/Components';
import { useNavigate } from 'react-router-dom';

export const RelatoriosCobranca: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="space-y-6 pb-12">
            <PageHeader
                title="Relatórios de Cobrança"
                subtitle="Análise de performance, inadimplência e evolução das arrecadações"
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => navigate('/cobradores')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                }
            />

            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 bg-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Arrecadação Total</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">R$ 145.670,00</p>
                            <p className="text-xs text-green-600 font-medium flex items-center gap-1 mt-1">
                                <TrendingUp className="h-3 w-3" /> +12% vs mês ant.
                            </p>
                        </div>
                        <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                            <BarChart2 className="h-6 w-6" />
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Inadimplência</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">14.2%</p>
                            <p className="text-xs text-red-600 font-medium flex items-center gap-1 mt-1">
                                <TrendingDown className="h-3 w-3" /> -2% vs mês ant.
                            </p>
                        </div>
                        <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                            <TrendingDown className="h-6 w-6" />
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Média por Visita</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">R$ 142,00</p>
                            <p className="text-xs text-gray-400 mt-1">Total de 1.024 visitas</p>
                        </div>
                        <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                            <Users className="h-6 w-6" />
                        </div>
                    </div>
                </Card>

                <Card className="p-4 bg-white">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Meta do Mês</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">82%</p>
                            <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
                                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: '82%' }}></div>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Filters */}
            <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="w-full md:w-48">
                        <Select label="Mês de Referência">
                            <option>Abril 2026</option>
                            <option>Março 2026</option>
                            <option>Fevereiro 2026</option>
                        </Select>
                    </div>
                    <div className="w-full md:w-48">
                        <Select label="Cobrador">
                            <option>Todos os Cobradores</option>
                        </Select>
                    </div>
                    <Button className="md:ml-auto">
                        <Download className="h-4 w-4 mr-2" /> Gerar PDF
                    </Button>
                </div>
            </Card>

            {/* Report Content Placeholder */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-blue-600" /> Arrecadação Mensal
                    </h3>
                    <div className="h-64 bg-gray-50 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-200">
                        <p className="text-gray-400 text-sm">Gráfico de evolução será carregado aqui</p>
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Users className="h-5 w-5 text-blue-600" /> Performance por Cobrador
                    </h3>
                    <div className="h-64 bg-gray-50 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-200">
                        <p className="text-gray-400 text-sm">Comparativo entre cobradores</p>
                    </div>
                </Card>
            </div>
        </div>
    );
};

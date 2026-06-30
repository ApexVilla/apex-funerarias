import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Target, Plus, DollarSign, Clock, CheckCircle, XCircle,
    TrendingUp, ChevronRight, Calendar, User, MoreHorizontal
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge, Select, Input } from '../../components/ui/Components';
import { useClienteStore } from '../../lib/ClienteStore';

const ESTAGIOS = [
    { key: 'lead', label: 'Lead', color: 'from-gray-400 to-gray-500', bg: 'bg-gray-50' },
    { key: 'qualificado', label: 'Qualificado', color: 'from-blue-400 to-blue-500', bg: 'bg-blue-50' },
    { key: 'proposta', label: 'Proposta', color: 'from-violet-400 to-violet-500', bg: 'bg-violet-50' },
    { key: 'negociacao', label: 'Negociação', color: 'from-amber-400 to-amber-500', bg: 'bg-amber-50' },
    { key: 'fechado_ganho', label: 'Ganho', color: 'from-emerald-400 to-emerald-500', bg: 'bg-emerald-50' },
    { key: 'fechado_perdido', label: 'Perdido', color: 'from-red-400 to-red-500', bg: 'bg-red-50' },
];

export const OportunidadesPipeline: React.FC = () => {
    const navigate = useNavigate();
    const { oportunidades, loadOportunidades, updateOportunidade, formatCentavos } = useClienteStore();
    const [viewMode, setViewMode] = useState<'kanban' | 'lista'>('kanban');

    useEffect(() => { loadOportunidades(); }, [loadOportunidades]);

    const byEstagio = useMemo(() => {
        const map: Record<string, typeof oportunidades> = {};
        ESTAGIOS.forEach(e => { map[e.key] = []; });
        oportunidades.forEach(o => {
            if (map[o.estagio]) map[o.estagio].push(o);
            else if (map['lead']) map['lead'].push(o);
        });
        return map;
    }, [oportunidades]);

    const totals = useMemo(() => ({
        total: oportunidades.length,
        valor: oportunidades.reduce((s, o) => s + (o.valor_estimado_centavos || 0), 0),
        abertas: oportunidades.filter(o => !o.status || o.status === 'aberta').length,
        ganhas: oportunidades.filter(o => o.estagio === 'fechado_ganho').length,
        perdidas: oportunidades.filter(o => o.estagio === 'fechado_perdido').length,
    }), [oportunidades]);

    const handleMoveEstagio = async (opId: string, novoEstagio: string) => {
        await updateOportunidade(opId, { estagio: novoEstagio });
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Pipeline CRM"
                subtitle={`${totals.total} oportunidades • ${formatCentavos(totals.valor)} em pipeline`}
                actionButton={
                    <div className="flex gap-2">
                        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                            >Kanban</button>
                            <button
                                onClick={() => setViewMode('lista')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${viewMode === 'lista' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                            >Lista</button>
                        </div>
                        <Button><Plus className="h-4 w-4 mr-1" /> Nova Oportunidade</Button>
                    </div>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center"><Target className="h-5 w-5 text-white" /></div>
                        <div><p className="text-xs text-gray-500 font-medium">Total</p><p className="text-xl font-bold">{totals.total}</p></div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center"><DollarSign className="h-5 w-5 text-white" /></div>
                        <div><p className="text-xs text-gray-500 font-medium">Valor Total</p><p className="text-lg font-bold">{formatCentavos(totals.valor)}</p></div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-white" /></div>
                        <div><p className="text-xs text-gray-500 font-medium">Ganhas</p><p className="text-xl font-bold text-emerald-600">{totals.ganhas}</p></div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center"><XCircle className="h-5 w-5 text-white" /></div>
                        <div><p className="text-xs text-gray-500 font-medium">Perdidas</p><p className="text-xl font-bold text-red-600">{totals.perdidas}</p></div>
                    </div>
                </Card>
            </div>

            {/* Kanban View */}
            {viewMode === 'kanban' && (
                <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: '500px' }}>
                    {ESTAGIOS.map(est => (
                        <div key={est.key} className="flex-shrink-0 w-72">
                            <div className={`rounded-t-xl p-3 ${est.bg}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${est.color}`} />
                                        <span className="text-sm font-semibold text-gray-700">{est.label}</span>
                                    </div>
                                    <Badge variant="outline">{(byEstagio[est.key] || []).length}</Badge>
                                </div>
                            </div>
                            <div className={`rounded-b-xl border border-t-0 p-2 space-y-2 min-h-[400px] ${est.bg} bg-opacity-30`}>
                                {(byEstagio[est.key] || []).map(op => (
                                    <Card key={op.id} className="p-3 hover:shadow-md transition-all cursor-pointer bg-white">
                                        <p className="font-medium text-gray-900 text-sm mb-1">{op.titulo}</p>
                                        {op.descricao && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{op.descricao}</p>}
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t">
                                            <span className="text-xs font-semibold text-emerald-600">
                                                {formatCentavos(op.valor_estimado_centavos)}
                                            </span>
                                            {op.probabilidade != null && (
                                                <Badge variant={op.probabilidade >= 70 ? 'success' : op.probabilidade >= 40 ? 'warning' : 'outline'}>
                                                    {op.probabilidade}%
                                                </Badge>
                                            )}
                                        </div>
                                        {op.data_previsao_fechamento && (
                                            <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(op.data_previsao_fechamento).toLocaleDateString('pt-BR')}
                                            </div>
                                        )}
                                    </Card>
                                ))}
                                {(byEstagio[est.key] || []).length === 0 && (
                                    <div className="flex items-center justify-center h-32 text-xs text-gray-400">
                                        Sem oportunidades
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* List View */}
            {viewMode === 'lista' && (
                <Card className="overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-600 font-medium border-b">
                            <tr>
                                <th className="px-6 py-4">Oportunidade</th>
                                <th className="px-6 py-4">Estágio</th>
                                <th className="px-6 py-4">Valor</th>
                                <th className="px-6 py-4">Probabilidade</th>
                                <th className="px-6 py-4">Previsão</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {oportunidades.map(op => (
                                <tr key={op.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="font-medium text-gray-900">{op.titulo}</p>
                                        {op.descricao && <p className="text-xs text-gray-500 truncate max-w-xs">{op.descricao}</p>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <Select
                                            value={op.estagio}
                                            onChange={(e) => handleMoveEstagio(op.id, e.target.value)}
                                            className="text-xs h-8"
                                        >
                                            {ESTAGIOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                                        </Select>
                                    </td>
                                    <td className="px-6 py-4 font-semibold text-emerald-600">{formatCentavos(op.valor_estimado_centavos)}</td>
                                    <td className="px-6 py-4">
                                        {op.probabilidade != null ? (
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-1.5 bg-gray-200 rounded-full">
                                                    <div className={`h-1.5 rounded-full ${op.probabilidade >= 70 ? 'bg-emerald-500' : op.probabilidade >= 40 ? 'bg-amber-500' : 'bg-gray-400'}`} style={{ width: `${op.probabilidade}%` }} />
                                                </div>
                                                <span className="text-xs">{op.probabilidade}%</span>
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 text-xs">
                                        {op.data_previsao_fechamento ? new Date(op.data_previsao_fechamento).toLocaleDateString('pt-BR') : '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <Badge variant={op.status === 'aberta' ? 'default' : op.status === 'ganha' ? 'success' : 'danger'}>
                                            {op.status || 'aberta'}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                            {oportunidades.length === 0 && (
                                <tr><td colSpan={6} className="text-center py-12 text-gray-500">Nenhuma oportunidade cadastrada</td></tr>
                            )}
                        </tbody>
                    </table>
                </Card>
            )}
        </div>
    );
};

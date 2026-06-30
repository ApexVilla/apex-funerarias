import React, { useState, useEffect, useMemo } from 'react';
import {
    CheckSquare, Plus, Calendar, Clock, AlertCircle,
    Phone, Mail, User, Flag, CheckCircle
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Badge, Select, Input } from '../../components/ui/Components';
import { useClienteStore } from '../../lib/ClienteStore';

export const TarefasCRM: React.FC = () => {
    const { tarefasCrm, loadTarefasCrm, updateTarefaCrm } = useClienteStore();
    const [filter, setFilter] = useState<'todas' | 'pendentes' | 'concluidas'>('pendentes');

    useEffect(() => { loadTarefasCrm(); }, [loadTarefasCrm]);

    const filtered = useMemo(() => {
        if (filter === 'pendentes') return tarefasCrm.filter(t => !t.concluida);
        if (filter === 'concluidas') return tarefasCrm.filter(t => t.concluida);
        return tarefasCrm;
    }, [tarefasCrm, filter]);

    const stats = useMemo(() => ({
        total: tarefasCrm.length,
        pendentes: tarefasCrm.filter(t => !t.concluida).length,
        atrasadas: tarefasCrm.filter(t => !t.concluida && t.data_vencimento && new Date(t.data_vencimento) < new Date()).length,
        concluidas: tarefasCrm.filter(t => t.concluida).length,
    }), [tarefasCrm]);

    const handleToggleConcluida = async (id: string, concluida: boolean) => {
        await updateTarefaCrm(id, {
            concluida: !concluida,
            data_conclusao: !concluida ? new Date().toISOString() : undefined,
        });
    };

    const getPrioridadeColor = (p: string) => {
        const map: Record<string, string> = {
            urgente: 'text-red-600 bg-red-50 border-red-200',
            alta: 'text-orange-600 bg-orange-50 border-orange-200',
            media: 'text-amber-600 bg-amber-50 border-amber-200',
            baixa: 'text-gray-500 bg-gray-50 border-gray-200',
        };
        return map[p] || map['media'];
    };

    const getTipoIcon = (tipo?: string) => {
        const map: Record<string, React.ReactNode> = {
            ligacao: <Phone className="h-4 w-4" />,
            email: <Mail className="h-4 w-4" />,
            reuniao: <User className="h-4 w-4" />,
            followup: <Clock className="h-4 w-4" />,
        };
        return map[tipo || ''] || <CheckSquare className="h-4 w-4" />;
    };

    const isOverdue = (t: typeof tarefasCrm[0]) => !t.concluida && t.data_vencimento && new Date(t.data_vencimento) < new Date();

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tarefas CRM"
                subtitle={`${stats.pendentes} pendentes, ${stats.atrasadas} atrasadas`}
                actionButton={<Button><Plus className="h-4 w-4 mr-1" /> Nova Tarefa</Button>}
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 cursor-pointer" onClick={() => setFilter('todas')}>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center"><CheckSquare className="h-5 w-5 text-white" /></div>
                        <div><p className="text-xs text-gray-500 font-medium">Total</p><p className="text-xl font-bold">{stats.total}</p></div>
                    </div>
                </Card>
                <Card className="p-4 cursor-pointer" onClick={() => setFilter('pendentes')}>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center"><Clock className="h-5 w-5 text-white" /></div>
                        <div><p className="text-xs text-gray-500 font-medium">Pendentes</p><p className="text-xl font-bold text-amber-600">{stats.pendentes}</p></div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center"><AlertCircle className="h-5 w-5 text-white" /></div>
                        <div><p className="text-xs text-gray-500 font-medium">Atrasadas</p><p className="text-xl font-bold text-red-600">{stats.atrasadas}</p></div>
                    </div>
                </Card>
                <Card className="p-4 cursor-pointer" onClick={() => setFilter('concluidas')}>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-white" /></div>
                        <div><p className="text-xs text-gray-500 font-medium">Concluídas</p><p className="text-xl font-bold text-emerald-600">{stats.concluidas}</p></div>
                    </div>
                </Card>
            </div>

            {/* Tasks List */}
            <div className="space-y-3">
                {filtered.length === 0 ? (
                    <Card className="p-12 text-center text-gray-500">
                        <CheckSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>Nenhuma tarefa encontrada</p>
                    </Card>
                ) : (
                    filtered.map(tarefa => (
                        <Card key={tarefa.id} className={`p-4 hover:shadow-md transition-all ${isOverdue(tarefa) ? 'border-l-4 border-l-red-500' : ''}`}>
                            <div className="flex items-start gap-4">
                                <button
                                    onClick={() => handleToggleConcluida(tarefa.id, tarefa.concluida)}
                                    className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${tarefa.concluida
                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : 'border-gray-300 hover:border-blue-500'
                                        }`}
                                >
                                    {tarefa.concluida && <CheckCircle className="h-3 w-3" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`${tarefa.concluida ? 'line-through text-gray-400' : 'text-gray-900 font-medium'}`}>
                                            {tarefa.titulo}
                                        </span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getPrioridadeColor(tarefa.prioridade)}`}>
                                            {tarefa.prioridade}
                                        </span>
                                        {tarefa.tipo && (
                                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                                {getTipoIcon(tarefa.tipo)} {tarefa.tipo}
                                            </span>
                                        )}
                                    </div>
                                    {tarefa.descricao && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{tarefa.descricao}</p>}
                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                                        {tarefa.data_vencimento && (
                                            <span className={`flex items-center gap-1 ${isOverdue(tarefa) ? 'text-red-500 font-semibold' : ''}`}>
                                                <Calendar className="h-3 w-3" />
                                                {new Date(tarefa.data_vencimento).toLocaleDateString('pt-BR')}
                                                {isOverdue(tarefa) && ' (Atrasada)'}
                                            </span>
                                        )}
                                        {tarefa.data_conclusao && (
                                            <span className="flex items-center gap-1 text-emerald-500">
                                                <CheckCircle className="h-3 w-3" />
                                                Concluída em {new Date(tarefa.data_conclusao).toLocaleDateString('pt-BR')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

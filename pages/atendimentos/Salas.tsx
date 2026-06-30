import React, { useEffect, useState } from 'react';
import { Button, Card } from '../../components/ui/Components';
import { DoorOpen, Plus, Calendar, Clock, User, UserSquare2, RefreshCw } from 'lucide-react';
import { useSalasStore } from '../../lib/SalasStore';
import { SalaReservaModal } from '../../components/atendimentos/SalaReservaModal';
import { PageHeader } from '../../components/common/PageHeader';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '../../lib/ToastStore';

export const SalasListPage: React.FC = () => {
    const { salas, reservas, loadSalas, loadReservas, loading } = useSalasStore();
    const { showToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    useEffect(() => {
        loadSalas();
        loadReservas({ data: selectedDate });
    }, [loadSalas, loadReservas, selectedDate]);

    const handleNovaReserva = () => {
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Salas de Velório e Capelas"
                subtitle="Gerencie as reservas e a disponibilidade das salas (padrão de 12 horas)."
                actionButton={
                    <Button onClick={handleNovaReserva}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Reserva
                    </Button>
                }
            />

            <Card className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Data Selecionada</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                        />
                    </div>
                    <Button variant="outline" onClick={() => loadReservas({ data: selectedDate })} disabled={loading} className="shrink-0 h-[38px]">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </Card>

            {loading && !salas.length ? (
                <div className="text-center py-12 text-slate-400 font-medium">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Carregando salas e capelas...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {salas.map(sala => {
                        const reservasDaSala = reservas.filter(r => r.sala_id === sala.id);
                        const agora = new Date();
                        const ocupadaAgora = reservasDaSala.some(r => {
                            const start = new Date(r.data_inicio);
                            const end = new Date(r.data_fim);
                            return r.status !== 'cancelada' && agora >= start && agora <= end;
                        });

                        return (
                            <Card key={sala.id} className="flex flex-col border border-slate-200 shadow-sm hover:shadow-2xl hover:border-slate-300 transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
                                {/* Header background gradient based on occupancy */}
                                <div className={`h-1.5 w-full transition-all duration-300 group-hover:h-2 ${ocupadaAgora ? 'bg-gradient-to-r from-rose-500 to-red-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600'}`} />
                                
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                                    <div className="flex items-center gap-2 max-w-[70%]">
                                        <DoorOpen className={`h-4.5 w-4.5 shrink-0 ${ocupadaAgora ? 'text-rose-500' : 'text-emerald-500'}`} />
                                        <h3 className="font-black text-slate-800 text-sm tracking-tight truncate">{sala.nome}</h3>
                                    </div>
                                    <span className={`px-2.5 py-0.5 text-[9px] uppercase font-bold rounded-full border tracking-wider transition-colors duration-300 ${
                                        ocupadaAgora 
                                            ? 'bg-rose-50 border-rose-200 text-rose-700' 
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    }`}>
                                        {ocupadaAgora ? 'Ocupada' : 'Livre'}
                                    </span>
                                </div>
                                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                                    <div className="space-y-3">
                                        {/* Room description info details */}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Capacidade</p>
                                                <p className="font-bold text-slate-700 mt-0.5">{sala.capacidade} Pessoas</p>
                                            </div>
                                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Localização</p>
                                                <p className="font-bold text-slate-700 mt-0.5 truncate" title={sala.localizacao || 'Interno'}>{sala.localizacao || 'Central'}</p>
                                            </div>
                                        </div>
                                        
                                        {/* Timeline of reservations */}
                                        <div className="space-y-3 pt-3 border-t border-slate-100">
                                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reservas do Dia</h4>
                                            {reservasDaSala.length === 0 ? (
                                                <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                                    Nenhuma reserva hoje
                                                </div>
                                            ) : (
                                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                                    {reservasDaSala.map(reserva => (
                                                        <div key={reserva.id} className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 text-xs hover:bg-slate-50 transition-colors">
                                                            <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                                                <span className="font-bold text-slate-700 flex items-center gap-1">
                                                                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                                    {format(new Date(reserva.data_inicio), 'HH:mm')} - {format(new Date(reserva.data_fim), 'HH:mm')}
                                                                </span>
                                                                <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                                                                    reserva.status === 'em_andamento' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                                                    reserva.status === 'concluida' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                                    reserva.status === 'cancelada' ? 'bg-slate-100 border-slate-200 text-slate-600' :
                                                                    'bg-blue-50 border-blue-200 text-blue-700'
                                                                }`}>
                                                                    {reserva.status.replace('_', ' ')}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-0.5 text-slate-600 pl-4.5 border-l-2 border-slate-200">
                                                                {reserva.falecido_nome && (
                                                                    <p className="truncate font-medium text-slate-700"><span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Falecido:</span> {reserva.falecido_nome}</p>
                                                                )}
                                                                {reserva.responsavel_nome && (
                                                                    <p className="truncate text-[11px]"><span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Resp:</span> {reserva.responsavel_nome}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {isModalOpen && (
                <SalaReservaModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => {
                        setIsModalOpen(false);
                        showToast('Reserva criada com sucesso!', 'success');
                    }}
                />
            )}
        </div>
    );
};

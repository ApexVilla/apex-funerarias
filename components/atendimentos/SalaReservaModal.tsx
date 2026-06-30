import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button, Input } from '../ui/Components';
import { useSalasStore } from '../../lib/SalasStore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const SalaReservaModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const { salas, salvarReserva, loading } = useSalasStore();
    const [formData, setFormData] = useState({
        sala_id: '',
        falecido_nome: '',
        responsavel_nome: '',
        data_inicio: '',
        observacoes: ''
    });
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!formData.sala_id) {
            setError('Selecione uma sala.');
            return;
        }
        if (!formData.data_inicio) {
            setError('Informe a data e hora de início.');
            return;
        }

        const sucesso = await salvarReserva({
            ...formData,
            status: 'agendada'
        });

        if (sucesso) {
            onSuccess?.();
        } else {
            setError('Erro ao salvar a reserva. Tente novamente.');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nova Reserva de Sala">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Sala / Capela *</label>
                    <select
                        name="sala_id"
                        value={formData.sala_id}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                        required
                    >
                        <option value="">Selecione...</option>
                        {salas.filter(s => s.status === 'disponivel').map(s => (
                            <option key={s.id} value={s.id}>{s.nome} ({s.capacidade} pessoas)</option>
                        ))}
                    </select>
                </div>

                <Input
                    label="Data e Hora de Início *"
                    name="data_inicio"
                    type="datetime-local"
                    value={formData.data_inicio}
                    onChange={handleChange}
                    required
                />
                <p className="text-xs text-slate-500 mt-1">A reserva terá duração padrão de 12 horas.</p>

                <Input
                    label="Nome do Falecido"
                    name="falecido_nome"
                    value={formData.falecido_nome}
                    onChange={handleChange}
                    placeholder="Nome para exibição/painel"
                />

                <Input
                    label="Nome do Responsável"
                    name="responsavel_nome"
                    value={formData.responsavel_nome}
                    onChange={handleChange}
                />

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Observações</label>
                    <textarea
                        name="observacoes"
                        value={formData.observacoes}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                        rows={3}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Salvando...' : 'Confirmar Reserva'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

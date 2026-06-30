import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useEmpresaIdsOperacao, filtrarQueryPorEmpresaIds } from './useEmpresaIdsOperacao';

// ==================== TYPES ====================
export interface Sala {
    id: string;
    empresa_id?: string;
    nome: string;
    capacidade: number;
    status: 'disponivel' | 'manutencao';
    localizacao?: string;
    observacoes?: string;
    criado_em: string;
}

export interface SalaReserva {
    id: string;
    empresa_id?: string;
    sala_id: string;
    sala_nome?: string;
    atendimento_id?: string;
    falecido_nome?: string;
    responsavel_nome?: string;
    data_inicio: string;
    data_fim: string;
    status: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
    observacoes?: string;
    criado_em: string;
}

interface SalasContextValue {
    loading: boolean;
    error: string | null;
    salas: Sala[];
    reservas: SalaReserva[];
    
    loadSalas: () => Promise<void>;
    loadReservas: (filters?: { sala_id?: string, data?: string }) => Promise<void>;
    salvarSala: (data: Partial<Sala>) => Promise<boolean>;
    salvarReserva: (data: Partial<SalaReserva>) => Promise<boolean>;
    atualizarStatusReserva: (id: string, status: SalaReserva['status']) => Promise<boolean>;
}

const SalasContext = createContext<SalasContextValue | null>(null);

export function useSalasStore() {
    const ctx = useContext(SalasContext);
    if (!ctx) throw new Error('useSalasStore deve ser usado dentro de SalasProvider');
    return ctx;
}

export const SalasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [salas, setSalas] = useState<Sala[]>([]);
    const [reservas, setReservas] = useState<SalaReserva[]>([]);
    const { empresaIdOperacao, empresaIdsFiltro } = useEmpresaIdsOperacao();

    const handleError = (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setError(message);
        console.error('[SalasStore]', message);
    };

    const loadSalas = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('ser_salas')
                .select('*')
                .order('nome');
            query = filtrarQueryPorEmpresaIds(query, empresaIdsFiltro);
            const { data, error: err } = await query;
            if (err) throw err;
            setSalas(data || []);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaIdsFiltro]);

    const loadReservas = useCallback(async (filters?: { sala_id?: string, data?: string }) => {
        setLoading(true);
        try {
            let query = supabase
                .from('ser_salas_reservas')
                .select(`
                    *,
                    salas:sala_id ( nome )
                `)
                .order('data_inicio', { ascending: true });

            query = filtrarQueryPorEmpresaIds(query, empresaIdsFiltro);
            if (filters?.sala_id) query = query.eq('sala_id', filters.sala_id);
            if (filters?.data) {
                // simple filter for day: start of day to end of day
                const start = new Date(filters.data);
                start.setHours(0, 0, 0, 0);
                const end = new Date(filters.data);
                end.setHours(23, 59, 59, 999);
                query = query.gte('data_inicio', start.toISOString()).lte('data_inicio', end.toISOString());
            }

            const { data, error: err } = await query;
            if (err) throw err;
            
            const list = (data || []).map((r: any) => ({
                ...r,
                sala_nome: r.salas?.nome
            }));
            
            setReservas(list);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaIdsFiltro]);

    const salvarSala = useCallback(async (data: Partial<Sala>) => {
        setLoading(true);
        try {
            const payload: Partial<Sala> = { ...data };
            if (!payload.empresa_id) payload.empresa_id = empresaIdOperacao;
            if (!payload.empresa_id) throw new Error('Empresa ativa não definida. Recarregue a página e tente novamente.');
            const { error: err } = await supabase
                .from('ser_salas')
                .upsert(payload);
            if (err) throw err;
            await loadSalas();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [loadSalas, empresaIdOperacao]);

    const salvarReserva = useCallback(async (data: Partial<SalaReserva>) => {
        setLoading(true);
        try {
            // Se for nova, define tempo de 12 horas por padrao se nao houver data_fim
            const reservaData: Partial<SalaReserva> = { ...data };
            if (!reservaData.empresa_id) reservaData.empresa_id = empresaIdOperacao;
            if (!reservaData.empresa_id) throw new Error('Empresa ativa não definida. Recarregue a página e tente novamente.');
            if (!reservaData.id && reservaData.data_inicio && !reservaData.data_fim) {
                const d = new Date(reservaData.data_inicio);
                d.setHours(d.getHours() + 12);
                reservaData.data_fim = d.toISOString();
            }

            const { error: err } = await supabase
                .from('ser_salas_reservas')
                .upsert(reservaData);
            if (err) throw err;
            await loadReservas();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [loadReservas, empresaIdOperacao]);

    const atualizarStatusReserva = useCallback(async (id: string, status: SalaReserva['status']) => {
        setLoading(true);
        try {
            const { error: err } = await supabase
                .from('ser_salas_reservas')
                .update({ status })
                .eq('id', id);
            if (err) throw err;
            await loadReservas();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [loadReservas]);

    return (
        <SalasContext.Provider value={{
            loading, error, salas, reservas,
            loadSalas, loadReservas, salvarSala, salvarReserva, atualizarStatusReserva
        }}>
            {children}
        </SalasContext.Provider>
    );
};

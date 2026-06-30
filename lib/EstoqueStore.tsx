import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useEmpresaIdsOperacao } from './useEmpresaIdsOperacao';

export interface ProdutoEstoque {
    id: string;
    empresa_id: string;
    codigo: string;
    nome: string;
    categoria?: string;
    estoque_atual: number;
    estoque_minimo: number;
    preco_centavos: number;
    observacoes?: string;
    ativo: boolean;
    ultima_entrada_em?: string | null;
    ultima_entrada_valor_centavos?: number | null;
    created_at?: string;
    updated_at?: string;
}

export interface FornecedorEstoque {
    id: string;
    empresa_id: string;
    codigo: string;
    nome: string;
    razao_social?: string;
    cnpj_cpf?: string | null;
    tipo: string;
    contato?: { nome?: string; telefone?: string; email?: string } | null;
    endereco?: Record<string, string> | null;
    condicoes?: string | null;
    ativo: boolean;
    created_at?: string;
    updated_at?: string;
    deleted_at?: string | null;
}

export interface KitEstoque {
    id: string;
    empresa_id: string;
    plano_id?: string | null;
    nome: string;
    descricao?: string;
    created_at?: string;
    updated_at?: string;
}

export interface KitItemEstoque {
    id: string;
    kit_id: string;
    produto_id: string;
    quantidade: number;
}

export interface EntradaEstoque {
    id: string;
    empresa_id: string;
    numero_documento: string;
    fornecedor_nome?: string | null;
    data_entrada: string;
    valor_total_centavos: number;
    status: 'pendente' | 'confirmada';
    observacoes?: string | null;
    processado_em?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface EntradaItemEstoque {
    id: string;
    entrada_id: string;
    produto_id: string;
    quantidade: number;
    valor_unitario_centavos: number;
    subtotal_centavos: number;
}

export interface EquipamentoEstoque {
    id: string;
    empresa_id: string;
    nome: string;
    codigo?: string;
    numero_serie?: string;
    marca?: string;
    modelo?: string;
    data_aquisicao?: string;
    valor_aquisicao?: number;
    status: string;
    localizacao?: string;
    descricao?: string;
    created_at?: string;
    updated_at?: string;
}

export interface MovimentacaoEstoque {
    id: string;
    empresa_id: string;
    produto_id: string;
    tipo: 'entrada' | 'saida' | 'ajuste' | 'transferencia';
    quantidade: number;
    estoque_anterior: number;
    estoque_posterior: number;
    motivo?: string;
    referencia_tipo?: string;
    referencia_id?: string;
    usuario_id?: string;
    created_at?: string;
    produto_nome?: string;
    usuario_nome?: string;
}

interface EstoqueContextValue {
    loading: boolean;
    error: string | null;
    empresaId: string;

    produtos: ProdutoEstoque[];
    loadProdutos: () => Promise<void>;
    createProduto: (data: Partial<ProdutoEstoque>) => Promise<ProdutoEstoque | null>;
    updateProduto: (id: string, data: Partial<ProdutoEstoque>) => Promise<void>;
    deleteProduto: (id: string) => Promise<void>;

    fornecedores: FornecedorEstoque[];
    loadFornecedores: (filters?: Record<string, string>) => Promise<void>;
    deleteFornecedor: (id: string) => Promise<void>;

    kits: KitEstoque[];
    loadKits: () => Promise<void>;
    deleteKit: (id: string) => Promise<void>;

    entradas: EntradaEstoque[];
    loadEntradas: () => Promise<void>;

    equipamentos: EquipamentoEstoque[];
    loadEquipamentos: () => Promise<void>;

    movimentacoes: MovimentacaoEstoque[];
    loadMovimentacoes: (filters?: Record<string, string>) => Promise<void>;

    confirmarEntrada: (entradaId: string) => Promise<boolean>;
}

const EstoqueContext = createContext<EstoqueContextValue | null>(null);

export function useEstoque() {
    const ctx = useContext(EstoqueContext);
    if (!ctx) throw new Error('useEstoque deve ser usado dentro de EstoqueProvider');
    return ctx;
}

export const EstoqueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { empresaIdOperacao, empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const empresaId = empresaIdOperacao;

    const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
    const [fornecedores, setFornecedores] = useState<FornecedorEstoque[]>([]);
    const [kits, setKits] = useState<KitEstoque[]>([]);
    const [entradas, setEntradas] = useState<EntradaEstoque[]>([]);
    const [equipamentos, setEquipamentos] = useState<EquipamentoEstoque[]>([]);
    const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([]);

    const handleError = (err: unknown) => {
        let message = 'Erro desconhecido';
        if (err instanceof Error) {
            message = err.message;
        } else if (typeof err === 'object' && err !== null && 'message' in err) {
            message = (err as any).message;
            if ((err as any).details) message += ` (${(err as any).details})`;
        }
        setError(message);
        console.error('[Estoque]', message, err);
    };

    // ── Produtos ──
    const loadProdutos = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const empresaIds = empresaIdsFiltro;
            const { data, error: queryError } = await supabase
                .from('ser_produtos')
                .select('*')
                .in('empresa_id', empresaIds)
                .order('codigo', { ascending: true });
            if (queryError) throw queryError;
            setProdutos((data ?? []) as ProdutoEstoque[]);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, empresaIdsFiltro, dataRevisionEmpresa]);

    const createProduto = useCallback(async (data: Partial<ProdutoEstoque>): Promise<ProdutoEstoque | null> => {
        if (!empresaId) return null;
        const codigo = (data.codigo ?? '').trim();
        if (!codigo) {
            handleError(new Error('Informe o código do produto.'));
            return null;
        }
        setLoading(true);
        setError(null);
        try {
            const { data: inserted, error: insertError } = await supabase
                .from('ser_produtos')
                .insert({ empresa_id: empresaId, ativo: true, estoque_atual: 0, ...data, codigo })
                .select()
                .single();
            if (insertError) throw insertError;
            await loadProdutos();
            return inserted as ProdutoEstoque;
        } catch (err) {
            handleError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadProdutos]);

    const updateProduto = useCallback(async (id: string, data: Partial<ProdutoEstoque>) => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const { error: updateError } = await supabase
                .from('ser_produtos')
                .update({ ...data, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (updateError) throw updateError;
            await loadProdutos();
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadProdutos]);

    const deleteProduto = useCallback(async (id: string) => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const { error: updateError } = await supabase
                .from('ser_produtos')
                .update({ ativo: false, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (updateError) throw updateError;
            await loadProdutos();
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadProdutos]);

    // ── Fornecedores ──
    const loadFornecedores = useCallback(async (filters?: Record<string, string>) => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const empresaIds = empresaIdsFiltro;
            let query = supabase
                .from('fornecedores')
                .select('*')
                .in('empresa_id', empresaIds)
                .is('deleted_at', null)
                .order('nome', { ascending: true });

            if (filters?.status === 'ativo') query = query.eq('ativo', true);
            if (filters?.status === 'inativo') query = query.eq('ativo', false);
            if (filters?.tipo) query = query.eq('tipo', filters.tipo);
            if (filters?.search) {
                query = query.or(`nome.ilike.%${filters.search}%,cnpj_cpf.ilike.%${filters.search}%,razao_social.ilike.%${filters.search}%`);
            }

            const { data, error: queryError } = await query;
            if (queryError) throw queryError;
            setFornecedores((data ?? []) as FornecedorEstoque[]);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, empresaIdsFiltro, dataRevisionEmpresa]);

    const deleteFornecedor = useCallback(async (id: string) => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const { error: updateError } = await supabase
                .from('fornecedores')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id);
            if (updateError) throw updateError;
            await loadFornecedores();
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadFornecedores]);

    // ── Kits ──
    const loadKits = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const empresaIds = empresaIdsFiltro;
            const { data, error: queryError } = await supabase
                .from('estoque_kits')
                .select('*')
                .in('empresa_id', empresaIds)
                .order('nome', { ascending: true });
            if (queryError) throw queryError;
            setKits((data ?? []) as KitEstoque[]);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, empresaIdsFiltro, dataRevisionEmpresa]);

    const deleteKit = useCallback(async (id: string) => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const { error: deleteError } = await supabase
                .from('estoque_kits')
                .delete()
                .eq('id', id);
            if (deleteError) throw deleteError;
            await loadKits();
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadKits]);

    // ── Entradas ──
    const loadEntradas = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const empresaIds = empresaIdsFiltro;
            const { data, error: queryError } = await supabase
                .from('estoque_entradas')
                .select('*')
                .in('empresa_id', empresaIds)
                .order('data_entrada', { ascending: false });
            if (queryError) throw queryError;
            setEntradas((data ?? []) as EntradaEstoque[]);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, empresaIdsFiltro, dataRevisionEmpresa]);

    // ── Equipamentos ──
    const loadEquipamentos = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const empresaIds = empresaIdsFiltro;
            const { data, error: queryError } = await supabase
                .from('estoque_equipamentos')
                .select('*')
                .in('empresa_id', empresaIds)
                .is('deleted_at', null)
                .order('nome', { ascending: true });
            if (queryError) throw queryError;
            setEquipamentos((data ?? []) as EquipamentoEstoque[]);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, empresaIdsFiltro, dataRevisionEmpresa]);

    // ── Movimentações ──
    const loadMovimentacoes = useCallback(async (filters?: Record<string, string>) => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const empresaIds = empresaIdsFiltro;
            let query = supabase
                .from('estoque_movimentacoes')
                .select(`
                    *,
                    ser_produtos:produto_id ( nome ),
                    users:usuario_id ( nome )
                `)
                .in('empresa_id', empresaIds)
                .order('created_at', { ascending: false })
                .limit(200);

            if (filters?.tipo) query = query.eq('tipo', filters.tipo);
            if (filters?.produto_id) query = query.eq('produto_id', filters.produto_id);
            if (filters?.data_inicio) query = query.gte('created_at', filters.data_inicio);
            if (filters?.data_fim) query = query.lte('created_at', `${filters.data_fim}T23:59:59`);

            const { data, error: queryError } = await query;
            if (queryError) throw queryError;

            const mapped = (data ?? []).map((m: any) => ({
                ...m,
                produto_nome: m.ser_produtos?.nome || '',
                usuario_nome: m.users?.nome || '',
            }));
            setMovimentacoes(mapped as MovimentacaoEstoque[]);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, empresaIdsFiltro, dataRevisionEmpresa]);

    // ── Confirmar Entrada (RPC atômico) ──
    const confirmarEntrada = useCallback(async (entradaId: string): Promise<boolean> => {
        if (!empresaId) return false;
        setLoading(true);
        setError(null);
        try {
            const { error: rpcError } = await supabase.rpc('fn_confirmar_entrada_estoque', {
                p_entrada_id: entradaId,
            });
            if (rpcError) throw rpcError;
            await loadEntradas();
            await loadProdutos();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadEntradas, loadProdutos]);

    const value: EstoqueContextValue = {
        loading, error, empresaId,
        produtos, loadProdutos, createProduto, updateProduto, deleteProduto,
        fornecedores, loadFornecedores, deleteFornecedor,
        kits, loadKits, deleteKit,
        entradas, loadEntradas,
        equipamentos, loadEquipamentos,
        movimentacoes, loadMovimentacoes,
        confirmarEntrada,
    };

    return (
        <EstoqueContext.Provider value={value}>
            {children}
        </EstoqueContext.Provider>
    );
};

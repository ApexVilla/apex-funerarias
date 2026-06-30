import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from './supabase';
import { safeJsonParse } from './jsonSafe';
import { resolveEmpresaIdForRelatorios } from './relatorioEmpresaId';
import { resolveFilialIdForRelatorios } from './relatorioFilialId';

/** Catálogo de parâmetros do relatório (JSON em rel_configuracao.parametros). */
export interface RelatorioParamSpec {
    name: string;
    type: 'date' | 'text' | 'number' | 'uuid';
    label?: string;
    default?: unknown;
    /** Se true, valor vazio não é enviado ao RPC. */
    optional?: boolean;
    /** Lista opções a partir de uma tabela (empresa atual). */
    pickFrom?: {
        table: string;
        value: string;
        label: string;
    };
}

export interface RelatorioConfig {
    id: string;
    codigo: string;
    nome: string;
    descricao: string;
    setor: 'financeiro' | 'operacional' | 'sinistros' | 'gerencial' | 'rh' | 'inadimplencia' | 'marketing' | 'auditoria' | 'comercial';
    categoria: string | null;
    icone: string;
    parametros: RelatorioParamSpec[];
    fonte_nome: string; // nome da function/view
    tipo_fonte: 'function' | 'view' | 'query' | 'materialized_view';
    is_favorito: boolean;
    ordem_favorito: number;
}

export interface RelatorioExecucao {
    id: string; // id do histórico (temp)
    status: 'sucesso' | 'erro' | 'timeout';
    dados: any; // JSON retornado pela function
    parametros_usados: any;
    gerado_em: string;
}

interface RelatoriosState {
    relatorios: RelatorioConfig[];
    favoritos: RelatorioConfig[];
    loading: boolean;
    executing: boolean;
    error: string | null;
    currentResult: RelatorioExecucao | null;

    loadRelatorios: () => Promise<void>;
    toggleFavorito: (relatorio: RelatorioConfig) => Promise<void>;
    executarRelatorio: (relatorio: RelatorioConfig, params: any) => Promise<void>;
    clearResult: () => void;
}

const RelatoriosContext = createContext<RelatoriosState | null>(null);

/** Só envia parâmetros declarados no catálogo (evita erro em RPCs sem argumentos). */
function buildRpcPayload(relatorio: RelatorioConfig, params: Record<string, unknown>): Record<string, unknown> {
    const spec = relatorio.parametros || [];
    if (spec.length === 0) return {};
    const out: Record<string, unknown> = {};
    for (const p of spec) {
        const v = params[p.name];
        if (v !== undefined && v !== '') out[p.name] = v;
    }
    return out;
}

export function useRelatorios() {
    const context = useContext(RelatoriosContext);
    if (!context) throw new Error('useRelatorios must be used within RelatoriosProvider');
    return context;
}

export const RelatoriosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [relatorios, setRelatorios] = useState<RelatorioConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [executing, setExecuting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentResult, setCurrentResult] = useState<RelatorioExecucao | null>(null);

    const getUserId = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id;
    };

    const loadRelatorios = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase
                .from('view_relatorios_disponiveis')
                .select('*')
                .order('setor')
                .order('nome');

            if (error) throw error;

            // Parse JSON fields safely
            const parsedData = (data || []).map((r: any) => {
                let parametros = r.parametros;
                if (typeof parametros === 'string') {
                    parametros = safeJsonParse(parametros, [] as RelatorioParamSpec[]);
                }
                if (!Array.isArray(parametros)) parametros = [];
                return {
                    ...r,
                    parametros,
                    is_favorito: !!r.is_favorito
                };
            });

            setRelatorios(parsedData);
        } catch (err: any) {
            console.error('Erro ao carregar relatórios:', err);
            setError('Falha ao carregar lista de relatórios.');
        } finally {
            setLoading(false);
        }
    }, []);

    const toggleFavorito = useCallback(async (relatorio: RelatorioConfig) => {
        const userId = await getUserId();
        if (!userId) return;

        try {
            if (relatorio.is_favorito) {
                // Remover
                await supabase
                    .from('rel_favoritos')
                    .delete()
                    .match({ relatorio_id: relatorio.id, usuario_id: userId });
            } else {
                // Adicionar
                await supabase
                    .from('rel_favoritos')
                    .insert({ relatorio_id: relatorio.id, usuario_id: userId });
            }
            // Reload list to update is_favorito status
            await loadRelatorios();
        } catch (err) {
            console.error('Erro ao atualizar favorito:', err);
        }
    }, [loadRelatorios]);

    const executarRelatorio = useCallback(async (relatorio: RelatorioConfig, params: any) => {
        setExecuting(true);
        setError(null);
        setCurrentResult(null);

        try {
            let resultData: any = null;

            const nomeFonte = (relatorio.fonte_nome || '').trim();
            if (!nomeFonte) {
                throw new Error('Este relatório não tem fonte de dados configurada.');
            }

            // 1. Executa conforme o tipo
            if (relatorio.tipo_fonte === 'function') {
                const rpcArgs = buildRpcPayload(relatorio, params);
                const precisaEmpresa =
                    nomeFonte.startsWith('rel_') || nomeFonte === 'fn_relatorio_clientes';
                if (precisaEmpresa) {
                    const empresaId = await resolveEmpresaIdForRelatorios();
                    if (!empresaId) {
                        throw new Error('Empresa não identificada. Faça login novamente.');
                    }
                    rpcArgs.p_empresa_id = empresaId;
                    const filialRelatorio = resolveFilialIdForRelatorios();
                    if (filialRelatorio) {
                        rpcArgs.p_filial_id = filialRelatorio;
                    }
                }
                let { data, error } = await supabase.rpc(nomeFonte, rpcArgs);

                if (error && Object.prototype.hasOwnProperty.call(rpcArgs, 'p_filial_id')) {
                    const msg = String((error as { message?: string }).message || '').toLowerCase();
                    if (msg.includes('p_filial_id') || msg.includes('function') || msg.includes('signature')) {
                        const fallbackArgs = { ...rpcArgs };
                        delete (fallbackArgs as Record<string, unknown>).p_filial_id;
                        const retry = await supabase.rpc(nomeFonte, fallbackArgs);
                        data = retry.data;
                        error = retry.error;
                    }
                }

                // Compatibilidade: alguns ambientes ainda não possuem p_cobrador_id na assinatura.
                if (error && Object.prototype.hasOwnProperty.call(rpcArgs, 'p_cobrador_id')) {
                    const msg = String((error as any)?.message || '').toLowerCase();
                    const hint = String((error as any)?.hint || '').toLowerCase();
                    const detail = String((error as any)?.details || '').toLowerCase();
                    const assinaturaInvalida =
                        msg.includes('p_cobrador_id') ||
                        hint.includes('p_cobrador_id') ||
                        detail.includes('p_cobrador_id') ||
                        msg.includes('function') ||
                        msg.includes('signature');

                    if (assinaturaInvalida) {
                        const fallbackArgs = { ...rpcArgs };
                        delete (fallbackArgs as any).p_cobrador_id;
                        const retry = await supabase.rpc(nomeFonte, fallbackArgs);
                        data = retry.data;
                        error = retry.error;
                    }
                }

                if (error) throw error;
                resultData = data;
            } else if (relatorio.tipo_fonte === 'materialized_view' || relatorio.tipo_fonte === 'view') {
                const { data, error } = await supabase.from(nomeFonte).select('*');
                if (error) throw error;
                resultData = data;
            } else if (relatorio.tipo_fonte === 'query') {
                throw new Error(
                    'Relatórios do tipo SQL personalizado ainda não são executados pelo app. Use um relatório com função ou view.'
                );
            } else {
                throw new Error(`Tipo de fonte não suportado: ${relatorio.tipo_fonte}`);
            }

            setCurrentResult({
                id: 'temp-' + Date.now(),
                status: 'sucesso',
                dados: resultData,
                parametros_usados: params,
                gerado_em: new Date().toISOString()
            });

        } catch (err: any) {
            console.error('Erro na execução do relatório:', err);
            setError(`Erro ao gerar relatório: ${err.message}`);
            setCurrentResult({
                id: 'error-' + Date.now(),
                status: 'erro',
                dados: null, // clear previous data on error
                parametros_usados: params,
                gerado_em: new Date().toISOString()
            });
        } finally {
            setExecuting(false);
        }
    }, []);

    const clearResult = useCallback(() => setCurrentResult(null), []);

    useEffect(() => {
        loadRelatorios();
    }, [loadRelatorios]);

    // Deriva favoritos da lista completa
    const favoritos = relatorios.filter(r => r.is_favorito).sort((a, b) => a.ordem_favorito - b.ordem_favorito);

    return (
        <RelatoriosContext.Provider value={{
            relatorios,
            favoritos,
            loading,
            executing,
            error,
            currentResult,
            loadRelatorios,
            toggleFavorito,
            executarRelatorio,
            clearResult
        }}>
            {children}
        </RelatoriosContext.Provider>
    );
};

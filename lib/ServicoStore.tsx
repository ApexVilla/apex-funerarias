import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';

// ==================== TYPES ====================
export interface Falecido {
    id: string;
    cliente_id: string;
    nome: string;
    cpf?: string;
    data_nascimento?: string;
    data_falecimento: string;
    local_falecimento?: string;
    parentesco?: string;
    created_at: string;
}

export interface ServicoItem {
    id: string;
    nome: string;
    descricao?: string;
    preco_base_centavos: number;
    categoria?: string;
    ativo: boolean;
}

export interface ProdutoItem {
    id: string;
    nome: string;
    descricao?: string;
    preco_centavos: number;
    estoque_atual: number;
    ativo: boolean;
}

export interface AtendimentoSB {
    id: string;
    empresa_id: string;
    codigo: string;
    cliente_id: string;
    falecido_id?: string;
    usuario_id: string;
    data_servico: string;
    status: 'aguardando' | 'em_andamento' | 'concluido' | 'cancelado';
    tipo_atendimento: 'particular' | 'plano';
    valor_total_centavos: number;
    valor_pago_centavos: number;
    valor_desconto_centavos?: number;
    desconto_autorizado_por?: string | null;
    observacoes?: string;
    
    // Aspecto do Corpo
    inspecao_interna?: boolean;
    inspecao_externa?: boolean;
    coleta_material?: boolean;
    orientacoes_tecnicas?: string;
    observacoes_corpo?: string;
    comentarios_falecido?: string;
    autoriza_remocao?: boolean;
    formulario_preparacao?: string | null;
    local_velorio?: string;
    local_sepultamento?: string;
    religiao_falecido?: string;
    data_falecido?: string;
    data_nascimento_falecido?: string;
    onde_corpo_se_encontra?: string;
    motivo_morte?: string;
    medico_nome_crm?: string;
    declaracao_obito_certidao?: string;
    representante_nome?: string;
    representante_contato?: string;
    pagamentos_divididos?: Array<{ forma: string; valor_centavos: number }>;
    os_aprovada?: boolean;
    os_aprovada_em?: string | null;
    os_aprovada_por?: string | null;
    baixa_registrada_em?: string | null;
    atendente_id?: string | null;
    agente_funerario_id?: string | null;

    created_at: string;
    updated_at: string;
}

export interface ViagemAtendimentoResumo {
    id: string;
    status: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada' | string;
    origem?: string | null;
    destino?: string | null;
    data_saida?: string | null;
    hora_saida?: string | null;
    placa?: string | null;
    motorista_nome?: string | null;
}

export interface AtendimentoDetalhado extends AtendimentoSB {
    cliente_nome: string;
    falecido_nome?: string;
    usuario_nome?: string;
    itens_servicos: any[];
    itens_produtos: any[];
    viagens?: ViagemAtendimentoResumo[];
}

// ==================== CONTEXT ====================
interface ServicoContextValue {
    loading: boolean;
    error: string | null;
    atendimentos: AtendimentoDetalhado[];
    servicos: ServicoItem[];
    produtos: ProdutoItem[];
    falecidos: Falecido[];
    
    loadAtendimentos: (filters?: any) => Promise<void>;
    loadCatalogos: (empresaIdOrIds?: string | string[]) => Promise<void>;
    loadFalecidos: (clienteId?: string) => Promise<void>;
    
    salvarAtendimento: (data: any) => Promise<string | null>;
    atualizarAtendimento: (id: string, data: any) => Promise<boolean>;
    getAtendimento: (id: string) => Promise<AtendimentoDetalhado | null>;
    upsertFalecido: (data: any) => Promise<string | null>;
}

const ServicoContext = createContext<ServicoContextValue | null>(null);

export function useServicoStore() {
    const ctx = useContext(ServicoContext);
    if (!ctx) throw new Error('useServicoStore deve ser usado dentro de ServicoProvider');
    return ctx;
}

// ==================== PROVIDER ====================
export const ServicoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { empresaIdEfetivo, dataRevisionEmpresa } = useEmpresaContextoAtivo();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [atendimentos, setAtendimentos] = useState<AtendimentoDetalhado[]>([]);
    const [servicos, setServicos] = useState<ServicoItem[]>([]);
    const [produtos, setProdutos] = useState<ProdutoItem[]>([]);
    const [falecidos, setFalecidos] = useState<Falecido[]>([]);

    const handleError = (err: unknown) => {
        let message = 'Erro desconhecido';
        if (err instanceof Error) {
            message = err.message;
        } else if (typeof err === 'object' && err !== null && 'message' in err) {
            message = String((err as { message: unknown }).message);
            const details = (err as { details?: string }).details;
            const hint = (err as { hint?: string }).hint;
            if (details) message += ` (${details})`;
            else if (hint) message += ` (${hint})`;
        }
        setError(message);
        console.error('[ServicoStore]', message, err);
    };

    const getSessionContext = useCallback(async () => {
        const localUser = (() => {
            try { return JSON.parse(sessionStorage.getItem('user') || '{}'); } catch { return {}; }
        })();
        const empresaDoContexto = (empresaIdEfetivo || '').trim();
        const localEmpresaId =
            empresaDoContexto ||
            localUser?.empresa_id ||
            sessionStorage.getItem('empresa_id') ||
            '';
        const localUserId = localUser?.id || sessionStorage.getItem('userId') || '';

        if (localEmpresaId && localUserId) return { empresaId: localEmpresaId, userId: localUserId };

        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || localUserId;
        if (!userId) return { empresaId: '', userId: '' };

        const { data } = await supabase
            .from('users')
            .select('id, empresa_id')
            .eq('id', userId)
            .single();

        const empresaId = data?.empresa_id || localEmpresaId;

        if (empresaId) sessionStorage.setItem('empresa_id', empresaId);
        if (userId) sessionStorage.setItem('userId', userId);
        if (empresaId || userId) {
            try {
                sessionStorage.setItem('user', JSON.stringify({ ...localUser, id: userId, empresa_id: empresaId }));
            } catch { }
        }

        return { empresaId, userId };
    }, [empresaIdEfetivo, dataRevisionEmpresa]);

    const loadAtendimentos = useCallback(async (filters?: any) => {
        setLoading(true);
        setError(null);
        try {
            const { empresaId } = await getSessionContext();
            if (!empresaId) throw new Error('Empresa não identificada para carregar atendimentos.');
            let query = supabase
                .from('ser_atendimentos')
                .select(`
                    *,
                    clientes:cliente_id ( nome ),
                    falecidos:falecido_id ( nome ),
                    usuarios:usuario_id ( nome )
                `)
                .eq('empresa_id', empresaId)
                .order('data_servico', { ascending: false });

            if (filters?.status) query = query.eq('status', filters.status);
            if (filters?.cliente_id) query = query.eq('cliente_id', filters.cliente_id);

            const { data, error: queryError } = await query;
            if (queryError) throw queryError;

            const detalhados: AtendimentoDetalhado[] = (data || []).map((atd: any) => ({
                ...atd,
                cliente_nome: atd.clientes?.nome || 'Cliente não encontrado',
                falecido_nome: atd.falecidos?.nome,
                usuario_nome: atd.usuarios?.nome,
                itens_servicos: [], // Carregar sob demanda ou via join complexo se necessário
                itens_produtos: [],
                viagens: [],
            }));

            // Carrega viagens vinculadas em uma única query (resilente: se a coluna
            // ainda não existir, ignora silenciosamente).
            const ids = detalhados.map((a) => a.id).filter(Boolean);
            if (ids.length > 0) {
                try {
                    const { data: viagensData, error: viagensErr } = await supabase
                        .from('frota_viagens')
                        .select(
                            'id, atendimento_id, status, origem, destino, data_saida, hora_saida, veiculo_id, motorista_id'
                        )
                        .in('atendimento_id', ids);

                    if (!viagensErr && Array.isArray(viagensData)) {
                        const veiculoIds = [
                            ...new Set(
                                viagensData
                                    .map((v: any) => v.veiculo_id)
                                    .filter((x: string | null) => Boolean(x))
                            ),
                        ];
                        const motoristaIds = [
                            ...new Set(
                                viagensData
                                    .map((v: any) => v.motorista_id)
                                    .filter((x: string | null) => Boolean(x))
                            ),
                        ];
                        const veicMap: Record<string, string> = {};
                        const motMap: Record<string, string> = {};
                        if (veiculoIds.length) {
                            const { data: vs } = await supabase
                                .from('frota_veiculos')
                                .select('id, placa')
                                .in('id', veiculoIds);
                            (vs || []).forEach((v: any) => {
                                veicMap[v.id] = v.placa || '';
                            });
                        }
                        if (motoristaIds.length) {
                            const { data: ms } = await supabase
                                .from('frota_motoristas')
                                .select('id, nome')
                                .in('id', motoristaIds);
                            (ms || []).forEach((m: any) => {
                                motMap[m.id] = m.nome || '';
                            });
                        }

                        const viagensPorAtd = new Map<string, ViagemAtendimentoResumo[]>();
                        viagensData.forEach((v: any) => {
                            if (!v.atendimento_id) return;
                            const arr = viagensPorAtd.get(v.atendimento_id) || [];
                            arr.push({
                                id: v.id,
                                status: v.status,
                                origem: v.origem,
                                destino: v.destino,
                                data_saida: v.data_saida,
                                hora_saida: v.hora_saida,
                                placa: v.veiculo_id ? veicMap[v.veiculo_id] : null,
                                motorista_nome: v.motorista_id ? motMap[v.motorista_id] : null,
                            });
                            viagensPorAtd.set(v.atendimento_id, arr);
                        });

                        detalhados.forEach((a) => {
                            a.viagens = viagensPorAtd.get(a.id) || [];
                        });
                    }
                } catch (err) {
                    console.warn('[ServicoStore] Falha ao carregar viagens vinculadas:', err);
                }
            }

            setAtendimentos(detalhados);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [getSessionContext]);

    const loadCatalogos = useCallback(async (empresaIdOrIds?: string | string[]) => {
        setLoading(true);
        try {
            const { empresaId: sessionEmpresaId } = await getSessionContext();
            
            let ids: string[] = [];
            if (empresaIdOrIds) {
                ids = Array.isArray(empresaIdOrIds)
                    ? [...new Set(empresaIdOrIds.map(id => id.trim()).filter(Boolean))]
                    : [empresaIdOrIds.trim()];
            } else if (sessionEmpresaId) {
                ids = [sessionEmpresaId.trim()];
            }

            if (ids.length === 0) throw new Error('Empresa não identificada para carregar catálogos.');

            let queryServicos = supabase.from('ser_servicos').select('*').eq('ativo', true);
            let queryProdutos = supabase.from('ser_produtos').select('*').eq('ativo', true);

            if (ids.length === 1) {
                queryServicos = queryServicos.eq('empresa_id', ids[0]);
                queryProdutos = queryProdutos.eq('empresa_id', ids[0]);
            } else {
                queryServicos = queryServicos.in('empresa_id', ids);
                queryProdutos = queryProdutos.in('empresa_id', ids);
            }

            const [resServicos, resProdutos] = await Promise.all([
                queryServicos,
                queryProdutos
            ]);

            if (resServicos.error) throw resServicos.error;
            if (resProdutos.error) throw resProdutos.error;

            setServicos(resServicos.data || []);
            setProdutos(resProdutos.data || []);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [getSessionContext]);

    const loadFalecidos = useCallback(async (clienteId?: string) => {
        setLoading(true);
        try {
            const { empresaId } = await getSessionContext();
            if (!empresaId) throw new Error('Empresa não identificada para carregar falecidos.');
            let query = supabase.from('ser_falecidos').select('*').eq('empresa_id', empresaId);
            if (clienteId) query = query.eq('cliente_id', clienteId);
            
            const { data, error } = await query;
            if (error) throw error;
            setFalecidos(data || []);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [getSessionContext]);

    const upsertFalecido = useCallback(async (data: any) => {
        setLoading(true);
        try {
            const { empresaId } = await getSessionContext();
            if (!empresaId) throw new Error('Empresa não identificada para salvar falecido.');
            const { data: created, error } = await supabase
                .from('ser_falecidos')
                .upsert({ ...data, empresa_id: empresaId })
                .select()
                .single();
            if (error) throw error;
            return created.id;
        } catch (err) {
            handleError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [getSessionContext]);

    const salvarAtendimento = useCallback(async (form: any) => {
        setLoading(true);
        try {
            const { empresaId, userId } = await getSessionContext();
            if (!empresaId) throw new Error('Empresa não identificada para salvar atendimento.');

            let codigoAtendimento = form.codigo || null;
            if (!form.id && !codigoAtendimento) {
                const { data: codigoData } = await supabase.rpc('fn_gerar_codigo_atendimento', {
                    p_empresa_id: empresaId,
                });
                codigoAtendimento = (typeof codigoData === 'string' && codigoData.trim())
                    ? codigoData
                    : `ATD-${Date.now().toString().slice(-6)}`;
            }

            let falecidoId = form.falecido_id || null;
            if (!falecidoId && form.falecido_inline?.nome) {
                const inline = form.falecido_inline;
                const { data: fRow, error: fErr } = await supabase
                    .from('ser_falecidos')
                    .insert({
                        empresa_id: empresaId,
                        cliente_id: form.cliente_id,
                        nome: String(inline.nome || '').trim(),
                        cpf: inline.cpf || null,
                        data_nascimento: inline.data_nascimento || null,
                        data_falecimento: inline.data_falecimento || form.data_falecido || new Date().toISOString().slice(0, 10),
                        local_falecimento: inline.local_falecimento || null,
                        parentesco: inline.parentesco || null,
                    })
                    .select('id')
                    .single();
                if (fErr) throw fErr;
                falecidoId = fRow?.id || null;
            }

            // 1. Inserir ou Atualizar Atendimento Base
            const atendimentoData = {
                id: form.id || undefined,
                empresa_id: empresaId,
                cliente_id: form.cliente_id,
                falecido_id: falecidoId,
                usuario_id: userId || null,
                data_servico: form.data_servico,
                status: form.status || 'aguardando',
                valor_total_centavos: form.valor_total_centavos,
                valor_pago_centavos: form.valor_pago_centavos || 0,
                valor_desconto_centavos: Math.max(0, Number(form.valor_desconto_centavos || 0)),
                desconto_autorizado_por: form.desconto_autorizado_por?.trim() || null,
                observacoes: form.observacoes,
                codigo: codigoAtendimento || form.codigo || `ATD-${Date.now().toString().slice(-6)}`,
                
                // Aspecto do Corpo
                inspecao_interna: form.inspecao_interna,
                inspecao_externa: form.inspecao_externa,
                coleta_material: form.coleta_material,
                orientacoes_tecnicas: form.orientacoes_tecnicas || null,
                observacoes_corpo: form.observacoes_corpo || null,
                comentarios_falecido: form.comentarios_falecido || null,
                formulario_preparacao: form.formulario_preparacao || null,
                autoriza_remocao: form.autoriza_remocao ?? false,
                tipo_atendimento: form.tipo_atendimento || 'particular',
                local_velorio: form.local_velorio || null,
                local_sepultamento: form.local_sepultamento || null,
                religiao_falecido: form.religiao_falecido || null,
                data_falecido: form.data_falecido || null,
                data_nascimento_falecido: form.data_nascimento_falecido || null,
                onde_corpo_se_encontra: form.onde_corpo_se_encontra || null,
                motivo_morte: form.motivo_morte || null,
                medico_nome_crm: form.medico_nome_crm || null,
                declaracao_obito_certidao: form.declaracao_obito_certidao || null,
                representante_nome: form.representante_nome || null,
                representante_contato: form.representante_contato || null,
                pagamentos_divididos: Array.isArray(form.pagamentos_divididos) ? form.pagamentos_divididos : [],
                atendente_id: form.atendente_id || null,
                agente_funerario_id: form.agente_funerario_id || null,
            };

            const { data: atd, error: atdError } = await supabase
                .from('ser_atendimentos')
                .upsert(atendimentoData)
                .select()
                .single();

            if (atdError) throw atdError;

            // 2. Limpar itens antigos se for edição
            if (form.id) {
                await Promise.all([
                    supabase.from('ser_atendimento_servicos').delete().eq('atendimento_id', atd.id),
                    supabase.from('ser_atendimento_produtos').delete().eq('atendimento_id', atd.id)
                ]);
            }

            // 3. Inserir Novos Itens
            if (form.itens_servicos?.length > 0) {
                const { error: sError } = await supabase.from('ser_atendimento_servicos').insert(
                    form.itens_servicos.map((s: any) => ({
                        atendimento_id: atd.id,
                        servico_id: s.servico_id,
                        quantidade: s.quantidade,
                        preco_unitario_centavos: s.preco_unitario_centavos,
                        subtotal_centavos: s.subtotal_centavos
                    }))
                );
                if (sError) throw sError;
            }

            if (form.itens_produtos?.length > 0) {
                const { error: pError } = await supabase.from('ser_atendimento_produtos').insert(
                    form.itens_produtos.map((p: any) => ({
                        atendimento_id: atd.id,
                        produto_id: p.produto_id,
                        quantidade: p.quantidade,
                        preco_unitario_centavos: p.preco_unitario_centavos,
                        subtotal_centavos: p.subtotal_centavos
                    }))
                );
                if (pError) throw pError;
            }

            return atd.id;
        } catch (err) {
            handleError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [getSessionContext]);

    const atualizarAtendimento = useCallback(async (id: string, data: any) => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('ser_atendimentos')
                .update(data)
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    const getAtendimento = useCallback(async (id: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('ser_atendimentos')
                .select(`
                    *,
                    clientes:cliente_id ( nome ),
                    falecidos:falecido_id ( nome ),
                    itens_servicos:ser_atendimento_servicos ( * ),
                    itens_produtos:ser_atendimento_produtos ( * )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            
            return {
                ...data,
                cliente_nome: data.clientes?.nome,
                falecido_nome: data.falecidos?.nome,
                itens_servicos: data.itens_servicos || [],
                itens_produtos: data.itens_produtos || []
            } as AtendimentoDetalhado;
        } catch (err) {
            handleError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <ServicoContext.Provider value={{
            loading, error, atendimentos, servicos, produtos, falecidos,
            loadAtendimentos, loadCatalogos, loadFalecidos,
            salvarAtendimento, atualizarAtendimento, getAtendimento, upsertFalecido
        }}>
            {children}
        </ServicoContext.Provider>
    );
};

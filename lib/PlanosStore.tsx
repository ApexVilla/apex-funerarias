import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';
import { mergePermissoesUsuarioComMatrizJson } from './permissoesPlanosMerge';
import { empresasVisiveisDoPlano, filtrarPlanosPorUnidades } from './planosUnidades';

// ==================== TIPOS ====================

export interface PermissoesUsuario {
    role_nome: string;
    nivel_acesso: number;
    pode_criar_plano: boolean;
    pode_editar_plano: boolean;
    pode_desativar_plano: boolean;
    pode_visualizar_plano: boolean;
    pode_vender_plano: boolean;
    pode_baixar_conta_receber: boolean;
    pode_visualizar_financeiro: boolean;
    pode_criar_cliente: boolean;
    pode_editar_cliente: boolean;
    pode_visualizar_cliente: boolean;
    pode_visualizar_relatorios: boolean;
    pode_exportar_relatorios: boolean;
}

export interface CategoriaPlano {
    id: string;
    nome: string;
    descricao?: string;
    ordem: number;
    cor?: string;
    icone?: string;
    ativo: boolean;
}

export interface Beneficio {
    id: string;
    nome: string;
    descricao?: string;
    icone?: string;
    tipo?: string; // funerario, odontologico, optica, saude
    ativo: boolean;
}

export interface PlanoBeneficioRow {
    id: string;
    plano_id: string;
    beneficio_id: string;
    quantidade: number;
    observacao?: string;
}

export interface PlanoCompleto {
    id: string;
    codigo: string;
    nome: string;
    descricao?: string;
    descricao_completa?: string;
    categoria: string;
    categoria_id?: string;
    categoria_nome?: string;
    categoria_cor?: string;
    tipo?: string; // funerario, odontologico, optica, saude
    status: string;
    valor_mensal_centavos: number;
    valor_anual_centavos?: number;
    taxa_adesao_centavos?: number;
    numero_max_beneficiarios: number;
    carencia_dias: number;
    carencia_beneficiario_adicional_dias?: number | null;
    beneficios: { nome: string; incluido: boolean }[];
    servicos_inclusos?: any[];
    comissao_venda_inicial?: number;
    comissao_venda_fixa_centavos?: number;
    comissao_recorrente?: number;
    comissao_gerente_inicial?: number;
    comissao_gerente_recorrente?: number;
    comissao_agente_percentual?: number;
    comissao_agente_fixo_centavos?: number;
    comissao_atendente_percentual?: number;
    comissao_atendente_fixo_centavos?: number;
    permite_cancelamento?: boolean;
    renovacao_automatica?: boolean;
    criado_por_user_id?: string;
    created_at: string;
    updated_at: string;
    empresa_id: string;
    /** Unidades do grupo em que o plano pode ser vendido/exibido. */
    empresas_visiveis?: string[];
    // Joined
    beneficios_normalizados?: { id: string; nome: string; quantidade: number }[];
    clientes_ativos_qtd?: number;
}

export interface PlanoHistorico {
    id: string;
    plano_id: string;
    tipo_alteracao: string;
    campo_alterado?: string;
    valor_anterior?: string;
    valor_novo?: string;
    descricao?: string;
    alterado_por?: string;
    alterado_por_nome?: string;
    alterado_em: string;
}

export interface CreatePlanoParams {
    nome: string;
    descricao: string;
    descricao_completa?: string;
    categoria: string;
    categoria_id?: string;
    tipo: string;
    valor_mensal_centavos: number;
    valor_anual_centavos?: number;
    taxa_adesao_centavos?: number;
    numero_max_beneficiarios: number;
    carencia_dias: number;
    carencia_beneficiario_adicional_dias?: number;
    beneficios: { nome: string; incluido: boolean }[];
    comissao_venda_inicial?: number;
    comissao_venda_fixa_centavos?: number;
    comissao_recorrente?: number;
    comissao_gerente_inicial?: number;
    comissao_gerente_recorrente?: number;
    comissao_agente_percentual?: number;
    comissao_agente_fixo_centavos?: number;
    comissao_atendente_percentual?: number;
    comissao_atendente_fixo_centavos?: number;
    beneficio_ids?: string[];
    /** Unidades em que o plano ficará disponível (vazio = unidade ativa no topo). */
    empresa_ids_visiveis?: string[];
}

export const normalizeTipoBeneficio = (tipo?: string | null): 'funerario' | 'odontologico' | 'optica' | 'saude' => {
    const raw = (tipo || '').toString().trim().toLowerCase();
    if (!raw) return 'funerario';

    const normalized = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');

    if (normalized.includes('odonto')) return 'odontologico';
    if (normalized.includes('odotologia')) return 'odontologico';
    if (normalized.includes('odontologia')) return 'odontologico';
    if (normalized.includes('optic') || normalized.includes('otic') || normalized.includes('oftal')) return 'optica';
    if (normalized.includes('saud') || normalized.includes('medic')) return 'saude';
    if (normalized.includes('funer')) return 'funerario';

    return 'funerario';
};

// ==================== CONTEXT ====================

interface PlanosContextValue {
    // State
    planos: PlanoCompleto[];
    categorias: CategoriaPlano[];
    beneficiosDisponiveis: Beneficio[];
    permissoes: PermissoesUsuario | null;
    historico: PlanoHistorico[];
    loading: boolean;
    error: string | null;

    // Actions
    loadPlanos: (empresaId?: string) => Promise<void>;
    loadCategorias: () => Promise<void>;
    loadBeneficios: () => Promise<void>;
    loadPermissoes: (userId: string) => Promise<void>;
    loadHistorico: (planoId: string) => Promise<void>;
    createPlano: (params: CreatePlanoParams, userId: string) => Promise<string | null>;
    updatePlano: (id: string, params: Partial<CreatePlanoParams>, userId: string) => Promise<string | null>;
    togglePlanoStatus: (id: string, novoStatus: string, userId: string) => Promise<string | null>;
    deletePlano: (id: string) => Promise<boolean>;
}

const PlanosContext = createContext<PlanosContextValue | null>(null);

export const usePlanosStore = () => {
    const ctx = useContext(PlanosContext);
    if (!ctx) throw new Error('usePlanosStore must be used within PlanosProvider');
    return ctx;
};

// ==================== PROVIDER ====================

export const PlanosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [planos, setPlanos] = useState<PlanoCompleto[]>([]);
    const [categorias, setCategorias] = useState<CategoriaPlano[]>([]);
    const [beneficiosDisponiveis, setBeneficiosDisponiveis] = useState<Beneficio[]>([]);
    const [permissoes, setPermissoes] = useState<PermissoesUsuario | null>(null);
    const [historico, setHistorico] = useState<PlanoHistorico[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { user } = useAuth();
    const { empresaIdEfetivo, empresaIdsParaFiltro, dataRevisionEmpresa } = useEmpresaContextoAtivo();

    const syncPlanosEmpresas = async (planoId: string, empresaIds: string[]): Promise<void> => {
        const ids = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
        if (ids.length === 0) return;
        await supabase.from('planos_empresas').delete().eq('plano_id', planoId);
        const { error: linkErr } = await supabase.from('planos_empresas').insert(
            ids.map((empresa_id) => ({ plano_id: planoId, empresa_id })),
        );
        if (linkErr) throw linkErr;
    };

    const mapPlanoRow = (p: Record<string, unknown>) => {
        const links = (p.planos_empresas as { empresa_id?: string }[] | null) || [];
        const fromJoin = links.map((l) => (l.empresa_id || '').trim()).filter(Boolean);
        const empresas_visiveis =
            fromJoin.length > 0
                ? [...new Set(fromJoin)]
                : (p.empresa_id as string)
                  ? [(p.empresa_id as string).trim()]
                  : [];
        const { planos_empresas: _pe, categorias_planos, ...rest } = p;
        const cat = categorias_planos as { nome?: string; cor?: string } | null;
        return {
            ...rest,
            categoria_nome: cat?.nome || (rest.categoria as string),
            categoria_cor: cat?.cor || '#6b7280',
            empresas_visiveis,
        } as PlanoCompleto;
    };

    const handleError = (err: unknown): string => {
        const message =
            err && typeof err === 'object' && 'message' in err
                ? String((err as { message: string }).message)
                : err instanceof Error
                  ? err.message
                  : String(err);
        setError(message);
        console.error('[PlanosStore]', message);
        return message;
    };

    // ---------- LOAD PLANOS ----------
    /** `empresaIdOverride`: for telas que fixam outra empresa (ex. proposta). Sem override: usa `empresaIdsParaFiltro` (uma unidade ou visão consolidada do grupo). */
    const loadPlanos = useCallback(async (empresaIdOverride?: string | null) => {
        setLoading(true);
        setError(null);
        try {
            const override = (empresaIdOverride ?? '').trim();
            const ids = override
                ? [override]
                : (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);

            if (ids.length === 0) {
                setPlanos([]);
                return;
            }

            let planoIdsPorVisibilidade: string[] = [];
            let selectComVisibilidade = true;
            const { data: linkRows, error: linkErr } = await supabase
                .from('planos_empresas')
                .select('plano_id')
                .in('empresa_id', ids);
            if (linkErr) {
                const msg = String(linkErr.message || '');
                if (!/planos_empresas|does not exist|schema cache/i.test(msg)) throw linkErr;
                selectComVisibilidade = false;
            } else {
                planoIdsPorVisibilidade = [
                    ...new Set(
                        (linkRows || [])
                            .map((r: { plano_id?: string }) => (r.plano_id || '').trim())
                            .filter(Boolean),
                    ),
                ];
            }

            const selectCols = selectComVisibilidade
                ? `*, categorias_planos ( id, nome, cor, ordem ), planos_empresas ( empresa_id )`
                : `*, categorias_planos ( id, nome, cor, ordem )`;

            let query = supabase.from('planos').select(selectCols).is('deleted_at', null);

            if (planoIdsPorVisibilidade.length > 0) {
                const inList = planoIdsPorVisibilidade.join(',');
                const empList = ids.join(',');
                query = query.or(`empresa_id.in.(${empList}),id.in.(${inList})`);
            } else if (ids.length === 1) {
                query = query.eq('empresa_id', ids[0]);
            } else {
                query = query.in('empresa_id', ids);
            }

            const { data, error: err } = await query.order('created_at', { ascending: false });

            if (err) throw err;

            // Buscar contagem de clientes ativos por plano de forma segura
            const countsMap: Record<string, number> = {};
            try {
                const { data: sigsData, error: sigsErr } = await supabase
                    .from('assinaturas')
                    .select('plano_id')
                    .eq('status', 'ativo')
                    .is('deleted_at', null);

                if (!sigsErr && sigsData) {
                    sigsData.forEach((s: any) => {
                        if (s.plano_id) {
                            countsMap[s.plano_id] = (countsMap[s.plano_id] || 0) + 1;
                        }
                    });
                }
            } catch (sigsFetchErr) {
                console.warn('[PlanosStore] Erro ao buscar contagem de assinaturas:', sigsFetchErr);
            }

            const mapped = filtrarPlanosPorUnidades(
                ((data || []) as unknown as Record<string, unknown>[]).map((p) => {
                    const mappedPlano = mapPlanoRow(p);
                    mappedPlano.clientes_ativos_qtd = countsMap[mappedPlano.id] || 0;
                    return mappedPlano;
                }),
                ids,
            );
            setPlanos(mapped);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaIdsParaFiltro]);

    // ---------- LOAD CATEGORIAS ----------
    const loadCategorias = useCallback(async () => {
        try {
            const { data, error: err } = await supabase
                .from('categorias_planos')
                .select('*')
                .eq('ativo', true)
                .order('ordem');
            if (err) throw err;
            setCategorias(data || []);
        } catch (err) {
            handleError(err);
        }
    }, []);

    // ---------- LOAD BENEFÍCIOS ----------
    const loadBeneficios = useCallback(async () => {
        try {
            const { data, error: err } = await supabase
                .from('beneficios')
                .select('*')
                .eq('ativo', true)
                .order('tipo')
                .order('nome');
            if (err) throw err;
            const normalized = (data || []).map((beneficio) => ({
                ...beneficio,
                tipo: normalizeTipoBeneficio(beneficio.tipo),
            }));
            setBeneficiosDisponiveis(normalized);
        } catch (err) {
            handleError(err);
        }
    }, []);

    // ---------- LOAD PERMISSÕES ----------
    const loadPermissoes = useCallback(async (userId: string) => {
        try {
            const [{ data: rpcData, error: err }, { data: userRow }] = await Promise.all([
                supabase.rpc('obter_permissoes_usuario', {
                    p_usuario_id: userId,
                }),
                supabase.from('users').select('permissoes').eq('id', userId).maybeSingle(),
            ]);
            if (err) throw err;
            const merged = mergePermissoesUsuarioComMatrizJson(
                rpcData as PermissoesUsuario,
                (userRow?.permissoes as Record<string, unknown>) || undefined,
            );
            setPermissoes(merged);
        } catch (err) {
            handleError(err);
        }
    }, []);

    // ---------- LOAD HISTÓRICO ----------
    const loadHistorico = useCallback(async (planoId: string) => {
        try {
            const { data, error: err } = await supabase
                .from('planos_historico')
                .select(`
          *,
          users:alterado_por ( nome )
        `)
                .eq('plano_id', planoId)
                .order('alterado_em', { ascending: false });
            if (err) throw err;
            const mapped = (data || []).map((h: any) => ({
                ...h,
                alterado_por_nome: h.users?.nome || 'Sistema',
            }));
            setHistorico(mapped);
        } catch (err) {
            handleError(err);
        }
    }, []);

    // ---------- CREATE PLANO ----------
    const createPlano = useCallback(async (params: CreatePlanoParams, userId: string): Promise<string | null> => {
        setLoading(true);
        setError(null);
        try {
            const empresaIdBase =
                empresaIdEfetivo || '00000000-0000-0000-0000-000000000001';
            const empresaIdsVisiveis = [
                ...new Set(
                    (params.empresa_ids_visiveis?.length
                        ? params.empresa_ids_visiveis
                        : [empresaIdBase]
                    )
                        .map((id) => id.trim())
                        .filter(Boolean),
                ),
            ];
            const empresaId = empresaIdsVisiveis[0] || empresaIdBase;
            const { data: codigoData } = await supabase.rpc('fn_gerar_codigo_plano', {
                p_empresa_id: empresaId,
            });
            const newCodigo = (typeof codigoData === 'string' && codigoData.trim())
                ? codigoData
                : `PLN-${Date.now().toString().slice(-5)}`;

            const tipoPlano = normalizeTipoBeneficio(params.tipo);
            const payload = {
                codigo: newCodigo,
                nome: params.nome.trim(),
                descricao: params.descricao.trim(),
                descricao_completa: params.descricao_completa?.trim() || null,
                categoria: params.categoria,
                categoria_id: params.categoria_id || null,
                tipo: tipoPlano,
                status: 'ativo',
                valor_mensal_centavos: params.valor_mensal_centavos,
                valor_anual_centavos: params.valor_anual_centavos ?? null,
                taxa_adesao_centavos: params.taxa_adesao_centavos ?? 0,
                numero_max_beneficiarios: params.numero_max_beneficiarios,
                carencia_dias: params.carencia_dias,
                beneficios: params.beneficios?.length ? params.beneficios : [],
                servicos_inclusos: [],
                comissao_venda_inicial: params.comissao_venda_inicial ?? 0,
                comissao_venda_fixa_centavos: params.comissao_venda_fixa_centavos ?? 0,
                comissao_recorrente: params.comissao_recorrente ?? 0,
                comissao_gerente_inicial: params.comissao_gerente_inicial ?? 0,
                comissao_gerente_recorrente: params.comissao_gerente_recorrente ?? 0,
                comissao_agente_percentual: params.comissao_agente_percentual ?? 0,
                comissao_agente_fixo_centavos: params.comissao_agente_fixo_centavos ?? 0,
                comissao_atendente_percentual: params.comissao_atendente_percentual ?? 0,
                comissao_atendente_fixo_centavos: params.comissao_atendente_fixo_centavos ?? 0,
                criado_por_user_id: userId,
                updated_by: userId,
                empresa_id: empresaId,
            };

            let { data, error: err } = await supabase
                .from('planos')
                .insert(payload)
                .select()
                .single();

            // Compatibilidade: banco sem coluna tipo (migração pendente)
            if (err && /column ["']?tipo["']?/.test(String(err.message || ''))) {
                const { tipo: _t, ...semTipo } = payload;
                const retry = await supabase.from('planos').insert(semTipo).select().single();
                data = retry.data;
                err = retry.error;
            }

            if (err) throw err;
            if (!data?.id) throw new Error('Plano criado sem retorno de ID.');

            try {
                await syncPlanosEmpresas(data.id, empresaIdsVisiveis);
            } catch (syncErr) {
                console.warn('[PlanosStore] planos_empresas:', syncErr);
            }

            if (params.beneficio_ids && params.beneficio_ids.length > 0) {
                const rows = params.beneficio_ids.map((bid) => ({
                    empresa_id: empresaId,
                    plano_id: data.id,
                    beneficio_id: bid,
                    quantidade: 1,
                }));
                const { error: benErr } = await supabase.from('planos_beneficios').insert(rows);
                if (benErr) throw benErr;
            }

            await loadPlanos();
            return data.id;
        } catch (err) {
            return handleError(err) || null;
        } finally {
            setLoading(false);
        }
    }, [loadPlanos, empresaIdEfetivo]);

    // ---------- UPDATE PLANO ----------
    const updatePlano = useCallback(async (id: string, params: Partial<CreatePlanoParams>, userId: string): Promise<string | null> => {
        setLoading(true);
        setError(null);
        try {
            const updateData: any = { updated_by: userId, updated_at: new Date().toISOString() };
            if (params.nome !== undefined) updateData.nome = params.nome;
            if (params.descricao !== undefined) updateData.descricao = params.descricao;
            if (params.descricao_completa !== undefined) updateData.descricao_completa = params.descricao_completa;
            if (params.categoria !== undefined) updateData.categoria = params.categoria;
            if (params.categoria !== undefined) updateData.categoria = params.categoria;
            if (params.categoria_id !== undefined) updateData.categoria_id = params.categoria_id;
            if (params.tipo !== undefined) updateData.tipo = normalizeTipoBeneficio(params.tipo);
            if (params.valor_mensal_centavos !== undefined) updateData.valor_mensal_centavos = params.valor_mensal_centavos;
            if (params.valor_anual_centavos !== undefined) updateData.valor_anual_centavos = params.valor_anual_centavos;
            if (params.taxa_adesao_centavos !== undefined) updateData.taxa_adesao_centavos = params.taxa_adesao_centavos;
            if (params.numero_max_beneficiarios !== undefined) updateData.numero_max_beneficiarios = params.numero_max_beneficiarios;
            if (params.carencia_dias !== undefined) updateData.carencia_dias = params.carencia_dias;
            if (params.beneficios !== undefined) updateData.beneficios = params.beneficios;
            if (params.comissao_venda_inicial !== undefined) updateData.comissao_venda_inicial = params.comissao_venda_inicial;
            if (params.comissao_venda_fixa_centavos !== undefined) {
                updateData.comissao_venda_fixa_centavos = params.comissao_venda_fixa_centavos;
            }
            if (params.comissao_recorrente !== undefined) updateData.comissao_recorrente = params.comissao_recorrente;
            if (params.comissao_gerente_inicial !== undefined) updateData.comissao_gerente_inicial = params.comissao_gerente_inicial;
            if (params.comissao_gerente_recorrente !== undefined) updateData.comissao_gerente_recorrente = params.comissao_gerente_recorrente;
            if (params.comissao_agente_percentual !== undefined) updateData.comissao_agente_percentual = params.comissao_agente_percentual;
            if (params.comissao_agente_fixo_centavos !== undefined) {
                updateData.comissao_agente_fixo_centavos = params.comissao_agente_fixo_centavos;
            }
            if (params.comissao_atendente_percentual !== undefined) {
                updateData.comissao_atendente_percentual = params.comissao_atendente_percentual;
            }
            if (params.comissao_atendente_fixo_centavos !== undefined) {
                updateData.comissao_atendente_fixo_centavos = params.comissao_atendente_fixo_centavos;
            }

            let { error: err } = await supabase.from('planos').update(updateData).eq('id', id);
            if (err && /column ["']?tipo["']?/.test(String(err.message || ''))) {
                const { tipo: _t, ...semTipo } = updateData;
                const retry = await supabase.from('planos').update(semTipo).eq('id', id);
                err = retry.error;
            }
            if (err) throw err;

            if (params.empresa_ids_visiveis !== undefined) {
                const planoAtual = planos.find((p) => p.id === id);
                const idsSync = [
                    ...new Set(
                        (params.empresa_ids_visiveis.length > 0
                            ? params.empresa_ids_visiveis
                            : planoAtual
                              ? empresasVisiveisDoPlano(planoAtual)
                              : []
                        )
                            .map((eid) => eid.trim())
                            .filter(Boolean),
                    ),
                ];
                if (idsSync.length > 0) {
                    try {
                        await syncPlanosEmpresas(id, idsSync);
                    } catch (syncErr) {
                        console.warn('[PlanosStore] planos_empresas indisponível:', syncErr);
                    }
                }
            }

            // Update beneficio links if provided
            if (params.beneficio_ids) {
                await supabase.from('planos_beneficios').delete().eq('plano_id', id);
                if (params.beneficio_ids.length > 0) {
                    const plano = planos.find(p => p.id === id);
                    const rows = params.beneficio_ids.map((bid) => ({
                        empresa_id: plano?.empresa_id || '00000000-0000-0000-0000-000000000001',
                        plano_id: id,
                        beneficio_id: bid,
                        quantidade: 1,
                    }));
                    const { error: benErr } = await supabase.from('planos_beneficios').insert(rows);
                    if (benErr) throw benErr;
                }
            }

            await loadPlanos();
            return null;
        } catch (err) {
            return handleError(err);
        } finally {
            setLoading(false);
        }
    }, [loadPlanos, planos]);

    // ---------- TOGGLE STATUS ----------
    const togglePlanoStatus = useCallback(async (id: string, novoStatus: string, userId: string): Promise<string | null> => {
        setLoading(true);
        setError(null);
        try {
            const { error: err } = await supabase
                .from('planos')
                .update({ status: novoStatus, updated_by: userId, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (err) throw err;
            await loadPlanos();
            return null;
        } catch (err) {
            return handleError(err);
        } finally {
            setLoading(false);
        }
    }, [loadPlanos, empresaIdEfetivo]);

    // ---------- DELETE (soft) ----------
    const deletePlano = useCallback(async (id: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const { error: err } = await supabase
                .from('planos')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id);
            if (err) throw err;
            await loadPlanos();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [loadPlanos, empresaIdEfetivo]);

    // Auto-load planos on mount
    useEffect(() => {
        if (!user?.id) return;
        const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
        if (ids.length === 0) return;
        loadPlanos();
        loadCategorias();
        loadBeneficios();
        loadPermissoes(user.id);
    }, [user?.id, empresaIdsParaFiltro, dataRevisionEmpresa, loadPlanos, loadCategorias, loadBeneficios, loadPermissoes]);

    const value: PlanosContextValue = {
        planos,
        categorias,
        beneficiosDisponiveis,
        permissoes,
        historico,
        loading,
        error,
        loadPlanos,
        loadCategorias,
        loadBeneficios,
        loadPermissoes,
        loadHistorico,
        createPlano,
        updatePlano,
        togglePlanoStatus,
        deletePlano,
    };

    return <PlanosContext.Provider value={value}>{children}</PlanosContext.Provider>;
};

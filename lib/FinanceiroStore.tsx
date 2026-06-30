import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { normalizeSearchText, extractDigits, maskCpf, SEARCH_STOPWORDS } from './textUtils';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { FILIAL_TODAS_ID } from './filialConstants';
import { useFilial } from './FilialContext';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';
import { registrarAuditoriaParcela } from './registrarAuditoriaCliente';
import { mensagemErroPlanoConta, payloadPlanoContaSalvar } from './finPlanoContaSalvar';
import {
  filtrarContasVisiveis,
  usuarioPodeGerenciarVinculosCaixa,
  usuarioPodeVerTodosCaixas,
} from './finCaixaPermissoes';
import { buscarClienteIdsPorCodigoContrato } from './buscaContrato';
import { contaPagarStatusEfetivo, normalizarContasPagarStatus } from './finContaPagarStatus';
import { contaPagarCodigoMatch, formatarCodigoContaPagar } from './proximoCodigoContaPagar';
import { dataHojeIsoLocal } from './contratoDatas';

// ==================== TYPES ====================
export interface ContaBancaria {
    id: string;
    empresa_id: string;
    codigo: string;
    nome: string;
    tipo: string;
    banco_nome?: string;
    agencia?: string;
    conta?: string;
    pix_chave?: string;
    pix_tipo?: string;
    saldo_atual_centavos: number;
    saldo_inicial_centavos: number;
    cor?: string;
    principal: boolean;
    ativo: boolean;
    autorizados_visualizacao?: string[];
    autorizados_operacao?: string[];
    autorizados_transferencia?: string[];
    permite_abertura_com_outro_caixa_aberto?: boolean;
    exclusivo_empresa?: boolean;
    compoe_dfc_dre?: boolean;
    permite_saldo_negativo?: boolean;
    permite_fechar_com_saldo_em_caixa?: boolean;
}

export interface ContaReceber {
    id: string;
    empresa_id: string;
    filial_id?: string | null;
    assinatura_id?: string | null;
    codigo: string;
    cliente_id?: string;
    plano_conta_id?: string | null;
    tipo_documento: string;
    descricao?: string;
    valor_original_centavos: number;
    valor_juros_centavos: number;
    valor_multa_centavos: number;
    valor_desconto_centavos: number;
    valor_total_centavos: number;
    valor_pago_centavos: number;
    valor_aberto_centavos: number;
    data_emissao: string;
    data_vencimento: string;
    data_competencia: string;
    data_pagamento?: string;
    status: string;
    parcela_numero: number;
    total_parcelas: number;
    created_at: string;
}

export interface ContaReceberDetalhada extends ContaReceber {
    cliente_nome: string;
    cliente_cpf?: string;
    /** Código comercial do cliente (ex.: CLI-…), “carteirinha”. */
    cliente_codigo?: string;
    /** Quando o título de receita não for de cliente (ex.: repasse de fornecedor). */
    fornecedor_nome?: string;
    /** Número do contrato vinculado (ex.: CTR-000055). */
    contrato_codigo?: string;
    /** Natureza = nome do plano de contas (sem código contábil na exibição). */
    natureza_financeira?: string;
    plano_nome?: string;
    dias_atraso: number;
    url_boleto?: string | null;
}

export interface BaixarContaReceberParams {
    conta_receber_id: string;
    valor_pago_centavos: number;
    forma_pagamento_id?: string;
    conta_bancaria_id?: string;
    valor_desconto_centavos?: number;
    observacoes?: string;
    data_pagamento?: string;
    /** PIX: true = titular pagou; false = terceiro (informar pix_nome_pagador). */
    pix_mesmo_pagador?: boolean;
    pix_nome_pagador?: string;
}

export interface BaixarContaPagarParams {
    conta_pagar_id: string;
    valor_pago_centavos: number;
    forma_pagamento_id?: string;
    conta_bancaria_id?: string;
    valor_desconto_centavos?: number;
    valor_juros_centavos?: number;
    valor_multa_centavos?: number;
    observacoes?: string;
    data_pagamento?: string;
}

export interface ContaPagar {
    id: string;
    empresa_id: string;
    filial_id?: string | null;
    /** Nome da filial/unidade (join em listagens consolidadas). */
    filial_nome?: string;
    codigo: string;
    fornecedor_id?: string;
    tipo_documento: string;
    descricao: string;
    fornecedor_nome?: string;
    plano_conta_id?: string;
    /** Código e nome do plano de contas (natureza financeira). */
    natureza_financeira?: string;
    numero_nota_fiscal?: string;
    valor_original_centavos: number;
    valor_juros_centavos: number;
    valor_multa_centavos: number;
    valor_desconto_centavos: number;
    valor_total_centavos: number;
    valor_pago_centavos: number;
    valor_aberto_centavos: number;
    data_emissao: string;
    data_vencimento: string;
    data_competencia: string;
    data_pagamento?: string;
    status: string;
    requer_aprovacao: boolean;
    parcela_numero: number;
    total_parcelas: number;
    created_at: string;
}

export interface Movimentacao {
    id: string;
    empresa_id: string;
    filial_id?: string | null;
    codigo: string;
    conta_bancaria_id: string;
    tipo: string;
    descricao: string;
    valor_centavos: number;
    data_movimentacao: string;
    data_competencia: string;
    conciliada: boolean;
    created_at: string;
}

export interface PlanoContaItem {
    id: string;
    empresa_id: string;
    codigo: string;
    nome: string;
    tipo: string;
    natureza: string;
    nivel: number;
    pai_id?: string;
    aceita_lancamento: boolean;
    conta_sistema: boolean;
    ativo: boolean;
}

export interface CentroCusto {
    id: string;
    empresa_id: string;
    codigo: string;
    nome: string;
    tipo: string;
    pai_id?: string | null;
    responsavel_id?: string | null;
    orcamento_mensal_centavos: number;
    ativo: boolean;
}

export interface FormaPagamento {
    id: string;
    empresa_id: string;
    codigo: string;
    nome: string;
    tipo: string;
    taxa_percentual: number;
    dias_recebimento: number;
    ativo: boolean;
}

export interface DashboardData {
    saldo_total_centavos: number;
    contas_bancarias: number;
    receitas_mes_centavos: number;
    receitas_previstas_mes_centavos: number;
    despesas_mes_centavos: number;
    despesas_previstas_mes_centavos: number;
    total_vencido_receber_centavos: number;
    total_vencido_pagar_centavos: number;
    titulos_receber_abertos: number;
    titulos_pagar_abertos: number;
    aprovacoes_pendentes: number;
    conciliacoes_pendentes: number;
}

// ==================== HELPERS ====================
/** Instância cacheada do formatador numérico — evita recriar a cada chamada. */
const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
});

export function formatCentavos(centavos: number): string {
    return BRL_FORMATTER.format(centavos / 100);
}

export function formatCentavosShort(centavos: number): string {
    const value = centavos / 100;
    if (Math.abs(value) >= 1000000) {
        return `R$ ${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
        return `R$ ${(value / 1000).toFixed(1)}K`;
    }
    return formatCentavos(centavos);
}

import { nomeExibicaoContaReceber } from './finContaReceberDisplay';

/** Isola dados da filial ativa — sem incluir registros com filial_id nulo (evita vazamento entre unidades). */
function applyFilialScopeStrict(q: any, filialId: string): any {
    return q.eq('filial_id', filialId);
}

const TIPOS_MOVIMENTO_ENTRADA = ['receita', 'transferencia_entrada', 'ajuste_credito', 'resgate'];
const TIPOS_MOVIMENTO_SAIDA = ['despesa', 'transferencia_saida', 'ajuste_debito', 'aplicacao'];

/** Tipos de movimento que aumentam o saldo (entrada). */
export function isMovimentoEntrada(tipo: string): boolean {
    return TIPOS_MOVIMENTO_ENTRADA.includes(tipo);
}

export function isMovimentoSaida(tipo: string): boolean {
    return TIPOS_MOVIMENTO_SAIDA.includes(tipo);
}

/** Delta com sinal para saldo acumulado (centavos). */
export function signedMovimentoCentavos(tipo: string, valorCentavos: number): number {
    const abs = Math.abs(valorCentavos);
    if (['despesa', 'transferencia_saida', 'ajuste_debito', 'aplicacao'].includes(tipo)) {
        return -abs;
    }
    if (tipo === 'estorno') {
        return valorCentavos;
    }
    if (['receita', 'transferencia_entrada', 'ajuste_credito', 'resgate'].includes(tipo)) {
        return abs;
    }
    return abs;
}

/** Filtro de empresa: uma (eq) ou várias (visão grupo). */
function applyEmpresaScopeReceber(q: any, ids: string[]): any | null {
    if (!ids.length) return null;
    if (ids.length === 1) return q.eq('empresa_id', ids[0]);
    return q.in('empresa_id', ids);
}

const CP_SELECT = '*, fin_plano_contas ( codigo, nome ), filiais ( nome, empresa_id )';

function mapContaPagarComNatureza(row: Record<string, unknown>): ContaPagar {
    const rawPc = row.fin_plano_contas;
    const pc = Array.isArray(rawPc) ? rawPc[0] : rawPc;
    const natureza =
        pc && typeof pc === 'object'
            ? String((pc as { nome?: string }).nome || '').trim()
            : '';
    const rawFil = row.filiais;
    const fil = Array.isArray(rawFil) ? rawFil[0] : rawFil;
    const filialNomeJoin =
        fil && typeof fil === 'object' && (fil as { nome?: string }).nome
            ? String((fil as { nome?: string }).nome).trim()
            : '';
    const { fin_plano_contas: _pc, filiais: _fil, ...rest } = row;
    return {
        ...(rest as unknown as ContaPagar),
        natureza_financeira: natureza || '—',
        ...(filialNomeJoin ? { filial_nome: filialNomeJoin } : {}),
    };
}

/** Totais podem ser GENERATED no Postgres — nunca enviar no payload do cliente. */
function omitTituloTotaisGerados<T extends Record<string, unknown>>(row: T): T {
    const out = { ...row } as Record<string, unknown>;
    delete out.valor_total_centavos;
    delete out.valor_aberto_centavos;
    return out as T;
}

/** Sentinel vazio — usado para detectar empresa não carregada sem lançar exceção antes do contexto estar pronto. */
const DEFAULT_EMPRESA_ID = '';
const ROLES_COM_GESTAO_CONTAS_BANCARIAS = [
    'admin',
    'admin_empresa',
    'admin_sistema',
    'administrador_geral',
    'super_admin',
    'gerente',
    'gestor',
    'diretoria',
    'supervisao',
    'financeiro',
];

// ==================== CONTEXT ====================
interface FinanceiroContextValue {
    loading: boolean;
    error: string | null;
    empresaId: string;

    // Dashboard
    dashboard: DashboardData | null;
    loadDashboard: () => Promise<void>;

    // Contas a Receber
    contasReceber: ContaReceber[];
    contasReceberDetalhadas: ContaReceberDetalhada[];
    loadContasReceber: (filters?: Record<string, string>) => Promise<void>;
    loadContasReceberDetalhado: (filters?: Record<string, string>) => Promise<void>;
    criarContaReceber: (data: Partial<ContaReceber>) => Promise<string | null>;
    baixarContaReceber: (params: BaixarContaReceberParams) => Promise<string | null>;
    estornarContaReceber: (contaReceberId: string, motivo: string) => Promise<boolean>;
    prorrogarContaReceber: (contaReceberId: string, novaDataVencimento: string, motivo?: string) => Promise<boolean>;
    excluirContaReceber: (contaReceberId: string) => Promise<boolean>;
    gerarMensalidadesMes: (assinaturaId: string, meses?: number) => Promise<number>;
    /** Contrato migrado: gera parcelas pagas até `ateVencimento` e futuras em aberto. */
    gerarMensalidadesComHistorico: (
            assinaturaId: string,
            ateVencimento: string,
            dataPagamento?: string,
            mesesFuturos?: number,
        ) => Promise<{ pagas: number; futuras: number; total: number; error?: string } | null>;

    // Contas a Pagar
    contasPagar: ContaPagar[];
    loadContasPagar: (filters?: Record<string, string>) => Promise<void>;
    criarContaPagar: (data: Partial<ContaPagar>) => Promise<string | null>;
    updateContaPagar: (id: string, data: Partial<ContaPagar>) => Promise<boolean>;
    baixarContaPagar: (params: BaixarContaPagarParams) => Promise<string | null>;
    estornarContaPagar: (contaPagarId: string, motivo: string) => Promise<boolean>;
    excluirContaPagar: (contaPagarId: string) => Promise<boolean>;

    // Movimentações
    movimentacoes: Movimentacao[];
    loadMovimentacoes: (filters?: Record<string, string>) => Promise<void>;

    // Contas Bancárias
    contasBancarias: ContaBancaria[];
    loadContasBancarias: () => Promise<void>;
    criarContaBancaria: (data: Partial<ContaBancaria>) => Promise<void>;
    updateContaBancaria: (id: string, data: Partial<ContaBancaria>) => Promise<void>;
    deleteContaBancaria: (id: string) => Promise<void>;

    // Plano de Contas
    planoContas: PlanoContaItem[];
    loadPlanoContas: () => Promise<void>;
    createPlanoConta: (data: Partial<PlanoContaItem>) => Promise<void>;
    updatePlanoConta: (id: string, data: Partial<PlanoContaItem>) => Promise<void>;
    deletePlanoConta: (id: string) => Promise<void>;

    // Centros de Custo
    centrosCusto: CentroCusto[];
    loadCentrosCusto: () => Promise<void>;
    criarCentroCusto: (data: Partial<CentroCusto>) => Promise<void>;
    atualizarCentroCusto: (id: string, data: Partial<CentroCusto>) => Promise<void>;
    excluirCentroCusto: (id: string) => Promise<void>;

    // Formas de Pagamento
    formasPagamento: FormaPagamento[];
    loadFormasPagamento: () => Promise<void>;
}

const FinanceiroContext = createContext<FinanceiroContextValue | null>(null);

export function useFinanceiro() {
    const ctx = useContext(FinanceiroContext);
    if (!ctx) throw new Error('useFinanceiro deve ser usado dentro de FinanceiroProvider');
    return ctx;
}

// ==================== PROVIDER ====================
export const FinanceiroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();
    const { filialId, isTodasFiliais, dataRevision } = useFilial();
    const { empresaIdEfetivo, dataRevisionEmpresa, empresaIdsParaFiltro } = useEmpresaContextoAtivo();
    const empresaId = empresaIdEfetivo || '';
    const empresaScopeIds = useMemo(
        () => (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean),
        [empresaIdsParaFiltro],
    );
    const shouldFilterByFilial =
        Boolean(filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais);
    const normalizedUserRole = (user?.role || '').toLowerCase();
    const userPermissoes = user?.permissoes as Record<string, unknown> | undefined;
    const canManageContasBancarias =
      ROLES_COM_GESTAO_CONTAS_BANCARIAS.includes(normalizedUserRole)
      || usuarioPodeGerenciarVinculosCaixa(normalizedUserRole, userPermissoes);

    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [contasReceber, setContasReceber] = useState<ContaReceber[]>([]);
    const [contasReceberDetalhadas, setContasReceberDetalhadas] = useState<ContaReceberDetalhada[]>([]);
    const [contasPagar, setContasPagar] = useState<ContaPagar[]>([]);
    const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
    const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
    const [planoContas, setPlanoContas] = useState<PlanoContaItem[]>([]);
    const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([]);
    const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);

    const handleError = (err: unknown) => {
        let message = 'Erro desconhecido';
        if (err instanceof Error) {
            message = err.message;
        } else if (typeof err === 'object' && err !== null && 'message' in err) {
            message = (err as any).message;
            if ((err as any).details) message += ` (${(err as any).details})`;
        }
        setError(message);
        console.error('[Financeiro]', message, err);
    };

    // Dashboard
    const loadDashboard = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            const rpcParams: Record<string, unknown> = { p_empresa_id: empresaId };
            // Passa filial_id quando o usuário está filtrado por uma filial específica
            if (shouldFilterByFilial && filialId) {
                rpcParams.p_filial_id = filialId;
            }
            const { data, error: rpcError } = await supabase.rpc('fin_dashboard_executivo', rpcParams);
            if (rpcError) throw rpcError;
            setDashboard(data as DashboardData);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, shouldFilterByFilial, filialId, dataRevisionEmpresa]);

    // Contas a Receber
    const loadContasReceber = useCallback(async (filters?: Record<string, string>) => {
        setLoading(true);
        setError(null);
        try {
            const ids = empresaScopeIds;
            if (ids.length > 0) {
                for (const eid of ids) {
                    try {
                        await supabase.rpc('fin_atualizar_vencidos_receber', { p_empresa_id: eid });
                    } catch (rpcErr) {
                        console.warn('[Financeiro] Não foi possível atualizar status de vencidos:', eid, rpcErr);
                    }
                }
            }

            let query = supabase
                .from('fin_contas_receber')
                .select('*')
                .is('deleted_at', null)
                .order('data_vencimento', { ascending: true });
            query = applyEmpresaScopeReceber(query, ids);
            if (!query) {
                setContasReceber([]);
                setLoading(false);
                return;
            }

            if (shouldFilterByFilial && filialId) {
                query = applyFilialScopeStrict(query, filialId);
            }

            if (filters?.status) {
                const hojeIsoCr = new Date().toISOString().slice(0, 10);
                if (filters.status === 'vencido') {
                    query = query.or(
                        `status.eq.vencido,and(status.in.(aberto,pago_parcial,pendente),data_vencimento.lt.${hojeIsoCr})`,
                    );
                } else {
                    query = query.eq('status', filters.status);
                }
            }
            if (filters?.tipo_documento) query = query.eq('tipo_documento', filters.tipo_documento);

            // Teto de segurança: nenhuma tela consome `contasReceber` diretamente
            // (as listagens usam `contasReceberDetalhadas`, já paginado). Sem este
            // limite a query varria a tabela inteira a cada refresh/baixa.
            query = query.limit(1000);

            const { data, error: queryError } = await query;
            if (queryError) throw queryError;
            setContasReceber(data ?? []);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaScopeIds, dataRevisionEmpresa, shouldFilterByFilial, filialId, dataRevision]);

    // Load Contas a Receber with client details
    const loadContasReceberDetalhado = useCallback(async (filters?: Record<string, string>) => {
        setLoading(true);
        setError(null);
        try {
            const ids = empresaScopeIds;
            if (ids.length > 0) {
                for (const eid of ids) {
                    try {
                        await supabase.rpc('fin_atualizar_vencidos_receber', { p_empresa_id: eid });
                    } catch (rpcErr) {
                        console.warn('[Financeiro] Não foi possível atualizar status de vencidos:', eid, rpcErr);
                    }
                }
            }

            if (ids.length === 0) {
                setContasReceberDetalhadas([]);
                setLoading(false);
                return;
            }

            const CR_SELECT = `
                    *,
                    clientes:cliente_id ( nome, cpf, codigo ),
                    assinaturas:assinatura_id ( codigo ),
                    fin_plano_contas ( codigo, nome )
                `;

            const hojeIso = new Date().toISOString().slice(0, 10);
            const searchTermEarly = filters?.search_term?.trim();
            const buscaAtiva = !!searchTermEarly && searchTermEarly.length >= 2;
            const filtroDataCampo = filters?.filtro_data_campo === 'recebimento' ? 'recebimento' : 'vencimento';
            const filtrarPorRecebimento =
                !buscaAtiva &&
                !filters?.conta_ids &&
                filtroDataCampo === 'recebimento' &&
                Boolean(filters?.data_inicio || filters?.data_fim);

            let contaIdsRecebimentoPeriodo: string[] = [];
            if (filtrarPorRecebimento) {
                let bq = supabase
                    .from('fin_contas_receber_baixas')
                    .select('conta_receber_id')
                    .eq('estornada', false);
                if (ids.length === 1) bq = bq.eq('empresa_id', ids[0]);
                else bq = bq.in('empresa_id', ids);
                if (filters?.data_inicio) bq = bq.gte('data_baixa', filters.data_inicio);
                if (filters?.data_fim) bq = bq.lte('data_baixa', filters.data_fim);
                const { data: baixasPeriodo, error: baixasErr } = await bq.limit(8000);
                if (baixasErr) throw baixasErr;
                contaIdsRecebimentoPeriodo = [
                    ...new Set((baixasPeriodo || []).map((b) => b.conta_receber_id).filter(Boolean)),
                ];
                if (contaIdsRecebimentoPeriodo.length === 0) {
                    setContasReceberDetalhadas([]);
                    setLoading(false);
                    return;
                }
            }

            const applyBaseFilters = (query: any) => {
                if (shouldFilterByFilial && filialId) {
                    query = applyFilialScopeStrict(query, filialId);
                }
                const byContaIds = Boolean(filters?.conta_ids) || contaIdsRecebimentoPeriodo.length > 0;
                if (filters?.status && !byContaIds) {
                    if (filters.status === 'vencido') {
                        query = query.or(
                            `status.eq.vencido,and(status.in.(aberto,pago_parcial,pendente),data_vencimento.lt.${hojeIso})`,
                        );
                    } else {
                        query = query.eq('status', filters.status);
                    }
                }
                if (filters?.tipo_documento) query = query.eq('tipo_documento', filters.tipo_documento);
                if (filters?.cliente_id) query = query.eq('cliente_id', filters.cliente_id);
                if (!byContaIds && !filtrarPorRecebimento && !buscaAtiva) {
                    if (filters?.data_inicio) query = query.gte('data_vencimento', filters.data_inicio);
                    if (filters?.data_fim) query = query.lte('data_vencimento', filters.data_fim);
                }
                return query;
            };
            const statusEmAberto = new Set(['aberto', 'vencido', 'pago_parcial']);
            const mapRowsToDetalhadas = (mergedData: any[]): ContaReceberDetalhada[] =>
                mergedData.map((cr: any) => {
                    const elegivelAtraso = statusEmAberto.has(cr.status) && cr.data_vencimento < hojeIso;
                    const diasAtraso = elegivelAtraso
                        ? Math.floor((Date.now() - new Date(cr.data_vencimento + 'T00:00').getTime()) / 86400000)
                        : 0;
                    const statusEfetivo = cr.status === 'aberto' && cr.data_vencimento < hojeIso
                        ? 'vencido'
                        : cr.status;
                    const rawPc = cr.fin_plano_contas;
                    const pc = Array.isArray(rawPc) ? rawPc[0] : rawPc;
                    const natureza =
                        pc && typeof pc === 'object'
                            ? String((pc as { nome?: string }).nome || '').trim()
                            : '';
                    const rawAss = cr.assinaturas;
                    const ass = Array.isArray(rawAss) ? rawAss[0] : rawAss;
                    const nomeExibicao = nomeExibicaoContaReceber(
                        cr.descricao,
                        cr.clientes?.nome,
                    );
                    return {
                        ...cr,
                        status: statusEfetivo,
                        cliente_nome: nomeExibicao,
                        cliente_cpf: cr.clientes?.cpf || '',
                        cliente_codigo: cr.clientes?.codigo || '',
                        fornecedor_nome: '',
                        contrato_codigo: ass?.codigo || '',
                        natureza_financeira: natureza || '—',
                        plano_nome: pc?.nome,
                        dias_atraso: diasAtraso,
                    };
                });

            let contaIdsFilter = (filters?.conta_ids || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (!contaIdsFilter.length && contaIdsRecebimentoPeriodo.length > 0) {
                contaIdsFilter = contaIdsRecebimentoPeriodo;
            }
            if (contaIdsFilter.length > 0) {
                const mergedById = new Map<string, any>();
                for (let i = 0; i < contaIdsFilter.length; i += 100) {
                    const chunk = contaIdsFilter.slice(i, i + 100);
                    const { data, error: idsError } = await applyBaseFilters(
                        applyEmpresaScopeReceber(
                            supabase
                                .from('fin_contas_receber')
                                .select(CR_SELECT)
                                .is('deleted_at', null)
                                .in('id', chunk),
                            ids,
                        )!,
                    );
                    if (idsError) throw idsError;
                    (data ?? []).forEach((row: any) => {
                        if (row?.id) mergedById.set(row.id, row);
                    });
                }
                setContasReceberDetalhadas(mapRowsToDetalhadas(Array.from(mergedById.values())));
                return;
            }

            const isVencidoFilter = filters?.status === 'vencido';
            const hasPeriodoVencimento =
                !buscaAtiva && !filtrarPorRecebimento && Boolean(filters?.data_inicio || filters?.data_fim);
            const orderCol = filtrarPorRecebimento ? 'data_pagamento' : 'data_vencimento';
            let query = applyBaseFilters(
                applyEmpresaScopeReceber(
                    supabase
                        .from('fin_contas_receber')
                        .select(CR_SELECT)
                        .is('deleted_at', null)
                        .order(orderCol, { ascending: filtrarPorRecebimento ? false : true, nullsFirst: false }),
                    ids,
                )!,
            );

            const limite = filters?.cliente_id
                ? 600
                : isVencidoFilter
                  ? 0
                  : filtrarPorRecebimento || hasPeriodoVencimento
                    ? 3000
                    : 200;
            if (limite > 0) query = query.limit(limite);

            let mergedData: any[] = [];
            const searchTerm = filters?.search_term?.trim();

            const fetchVencidosPaginado = async () => {
                const pageSize = 1000;
                const maxRows = 15000;
                const rows: any[] = [];
                for (let offset = 0; offset < maxRows; offset += pageSize) {
                    const { data, error: pageError } = await query.range(offset, offset + pageSize - 1);
                    if (pageError) throw pageError;
                    if (!data?.length) break;
                    rows.push(...data);
                    if (data.length < pageSize) break;
                }
                return rows;
            };

            if (filters?.cliente_id) {
                const { data, error: queryError } = await query;
                if (queryError) throw queryError;
                mergedData = data ?? [];
            } else if (!searchTerm) {
                if (isVencidoFilter) {
                    mergedData = await fetchVencidosPaginado();
                } else {
                    const { data, error: queryError } = await query;
                    if (queryError) throw queryError;
                    mergedData = data ?? [];
                }
            } else {
                const normalizedDigits = extractDigits(searchTerm);
                const maskedCpfStr = maskCpf(normalizedDigits);

                // ── Query 1: busca direta por código e descrição (server-side) ──
                const orFieldsParts = [
                    `codigo.ilike.%${searchTerm}%`,
                    `descricao.ilike.%${searchTerm}%`,
                ];
                const { data: byDirect, error: directError } = await applyBaseFilters(
                    applyEmpresaScopeReceber(
                        supabase
                            .from('fin_contas_receber')
                            .select(CR_SELECT)
                            .is('deleted_at', null)
                            .or(orFieldsParts.join(','))
                            .order('data_vencimento', { ascending: true })
                            .limit(300),
                        ids,
                    )!,
                );
                if (directError) throw directError;

                // ── Query 2: busca por clientes (nome, CPF) ──
                let clientesQ = supabase.from('clientes').select('id').limit(100);
                if (ids.length === 1) clientesQ = clientesQ.eq('empresa_id', ids[0]);
                else clientesQ = clientesQ.in('empresa_id', ids);
                const clienteOrParts = [`nome.ilike.%${searchTerm}%`];
                if (normalizedDigits) {
                    clienteOrParts.push(`cpf.ilike.%${normalizedDigits}%`);
                    if (maskedCpfStr) clienteOrParts.push(`cpf.ilike.%${maskedCpfStr}%`);
                }
                const { data: matchedClientes, error: clientesError } = await clientesQ.or(
                    clienteOrParts.join(','),
                );
                if (clientesError) throw clientesError;

                // ── Query 3: busca por fornecedores ──
                let fornecedoresQ = supabase
                    .from('fornecedores')
                    .select('nome, codigo, cnpj_cpf, contato')
                    .limit(80);
                if (ids.length === 1) fornecedoresQ = fornecedoresQ.eq('empresa_id', ids[0]);
                else fornecedoresQ = fornecedoresQ.in('empresa_id', ids);
                const fornOrParts = [
                    `nome.ilike.%${searchTerm}%`,
                    `codigo.ilike.%${searchTerm}%`,
                ];
                if (normalizedDigits) fornOrParts.push(`cnpj_cpf.ilike.%${searchTerm}%`);
                const { data: fornecedoresMatch, error: fornecedoresError } = await fornecedoresQ.or(
                    fornOrParts.join(','),
                );

                // ── Query 4: contas dos clientes encontrados ──
                let byCliente: any[] = [];
                const clienteIds = (matchedClientes ?? []).map((c: any) => c.id);
                if (clienteIds.length > 0) {
                    const { data: contasCliente, error: contasClienteError } = await applyBaseFilters(
                        applyEmpresaScopeReceber(
                            supabase
                                .from('fin_contas_receber')
                                .select(CR_SELECT)
                                .is('deleted_at', null)
                                .in('cliente_id', clienteIds)
                                .order('data_vencimento', { ascending: true })
                                .limit(300),
                            ids,
                        )!,
                    );
                    if (contasClienteError) throw contasClienteError;
                    byCliente = contasCliente ?? [];
                }

                // ── Query 5: busca por código de contrato ──
                let byContrato: any[] = [];
                const { clienteIds: contratoClienteIds } = await buscarClienteIdsPorCodigoContrato(ids, searchTerm);
                if (contratoClienteIds.length > 0) {
                    const idsContrato = contratoClienteIds.filter((id) => !clienteIds.includes(id));
                    if (idsContrato.length > 0) {
                        const { data: contasContrato, error: contasContratoError } = await applyBaseFilters(
                            applyEmpresaScopeReceber(
                                supabase
                                    .from('fin_contas_receber')
                                    .select(CR_SELECT)
                                    .is('deleted_at', null)
                                    .in('cliente_id', idsContrato)
                                    .order('data_vencimento', { ascending: true })
                                    .limit(200),
                                ids,
                            )!,
                        );
                        if (contasContratoError) throw contasContratoError;
                        byContrato = contasContrato ?? [];
                    }
                }

                // ── Query 6 (condicional): contas vinculadas a fornecedores encontrados ──
                let byFornecedor: any[] = [];
                if (!fornecedoresError && (fornecedoresMatch ?? []).length > 0) {
                    const fornNomes = (fornecedoresMatch ?? [])
                        .map((f: any) => String(f?.nome || '').trim())
                        .filter((n) => n.length >= 2);
                    if (fornNomes.length > 0) {
                        const fornOrSearch = fornNomes.slice(0, 5).map((n) => `descricao.ilike.%${n}%`);
                        const { data: contasForn, error: contasFornError } = await applyBaseFilters(
                            applyEmpresaScopeReceber(
                                supabase
                                    .from('fin_contas_receber')
                                    .select(CR_SELECT)
                                    .is('deleted_at', null)
                                    .or(fornOrSearch.join(','))
                                    .order('data_vencimento', { ascending: true })
                                    .limit(100),
                                ids,
                            )!,
                        );
                        if (!contasFornError) byFornecedor = contasForn ?? [];
                    }
                }

                // ── Deduplicação dos resultados ──
                const dedupe = new Map<string, any>();
                [...(byDirect ?? []), ...byCliente, ...byContrato, ...byFornecedor].forEach((item) => {
                    if (item?.id) dedupe.set(item.id, item);
                });
                mergedData = Array.from(dedupe.values());
            }

            setContasReceberDetalhadas(mapRowsToDetalhadas(mergedData));
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaScopeIds, dataRevisionEmpresa, shouldFilterByFilial, filialId, dataRevision]);

    const criarContaReceber = useCallback(async (data: Partial<ContaReceber>): Promise<string | null> => {
        setError(null);
        try {
            const targetEmpresaId = ((data as { empresa_id?: string }).empresa_id || '').trim() || empresaId;
            if (!targetEmpresaId) throw new Error('Empresa não identificada. Faça login novamente.');
            // Código único via timestamp + random — evita race condition do COUNT
            const ts = Date.now().toString(36).toUpperCase();
            const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
            const codigo = `CR-${ts}${rnd}`;

            const {
                valor_total_centavos,
                valor_aberto_centavos,
                filial_id: filialIncoming,
                empresa_id: _empresaPayload,
                ...safeData
            } = data as any;

            const filialResolved =
                typeof filialIncoming === 'string' && filialIncoming.length > 0
                    ? filialIncoming
                    : shouldFilterByFilial
                        ? filialId
                        : undefined;

            let filialFinal = filialResolved;
            const assinaturaId = (safeData as { assinatura_id?: string }).assinatura_id;
            if (assinaturaId) {
                const { data: assFilial } = await supabase
                    .from('assinaturas')
                    .select('filial_id')
                    .eq('id', assinaturaId)
                    .is('deleted_at', null)
                    .maybeSingle();
                if (assFilial?.filial_id) {
                    filialFinal = assFilial.filial_id;
                }
            }

            const insertRow = omitTituloTotaisGerados({
                ...safeData,
                empresa_id: targetEmpresaId,
                codigo,
                ...(filialFinal ? { filial_id: filialFinal } : {}),
            } as Record<string, unknown>);

            const { data: inserted, error: insertError } = await supabase
                .from('fin_contas_receber')
                .insert(insertRow)
                .select('id')
                .single();
            if (insertError) throw insertError;
            if (!inserted) throw new Error('Erro ao criar conta a receber: nenhum dado retornado.');
            await Promise.all([loadContasReceber(), loadContasReceberDetalhado()]);
            return inserted?.id ?? null;
        } catch (err) {
            handleError(err);
            throw err;
        }
    }, [empresaId, dataRevisionEmpresa, loadContasReceber, loadContasReceberDetalhado, shouldFilterByFilial, filialId]);

    // Baixar Conta a Receber (receive payment)
    const baixarContaReceber = useCallback(async (params: BaixarContaReceberParams): Promise<string | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc('fin_baixar_conta_receber', {
                p_conta_receber_id: params.conta_receber_id,
                p_valor_pago_centavos: params.valor_pago_centavos,
                p_forma_pagamento_id: params.forma_pagamento_id || null,
                p_conta_bancaria_id: params.conta_bancaria_id || null,
                p_valor_desconto_centavos: params.valor_desconto_centavos || 0,
                p_observacoes: params.observacoes || null,
                p_usuario_id: user?.id || null,
                p_data_pagamento: params.data_pagamento || null,
                p_pix_mesmo_pagador: params.pix_mesmo_pagador ?? null,
                p_pix_nome_pagador: params.pix_nome_pagador || null,
            });
            if (rpcError) throw rpcError;
            await registrarAuditoriaParcela(
                params.conta_receber_id,
                'Pagamento de parcela registrado',
                params.observacoes?.trim() || 'Recebimento registrado no financeiro.',
                {
                    dados_novos: {
                        valor_pago_centavos: params.valor_pago_centavos,
                        data_pagamento: params.data_pagamento || new Date().toISOString().slice(0, 10),
                        pix_mesmo_pagador: params.pix_mesmo_pagador,
                        pix_nome_pagador: params.pix_nome_pagador,
                    },
                },
            );
            await loadContasReceberDetalhado();
            window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
            window.dispatchEvent(new CustomEvent('fin-contas-receber-updated'));
            return data as string;
        } catch (err) {
            handleError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [loadContasReceberDetalhado]);

    const estornarContaReceber = useCallback(async (contaReceberId: string, motivo: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const { error: rpcError } = await supabase.rpc('fin_estornar_conta_receber', {
                p_conta_receber_id: contaReceberId,
                p_motivo: motivo,
                p_usuario_id: user?.id || null,
            });
            if (rpcError) throw rpcError;
            await registrarAuditoriaParcela(
                contaReceberId,
                'Estorno de pagamento de parcela',
                motivo.trim() || 'Estorno registrado no financeiro.',
            );
            await loadContasReceberDetalhado();
            window.dispatchEvent(new CustomEvent('fin-contas-receber-updated'));
            window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [loadContasReceberDetalhado, user?.id]);

    const excluirContaReceber = useCallback(async (contaReceberId: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const { data: titulo, error: fetchErr } = await supabase
                .from('fin_contas_receber')
                .select('id, status, filial_id, valor_pago_centavos')
                .eq('id', contaReceberId)
                .eq('empresa_id', empresaId)
                .is('deleted_at', null)
                .maybeSingle();
            if (fetchErr) throw fetchErr;
            if (!titulo) throw new Error('Título não encontrado.');
            if (['pago', 'pago_parcial'].includes(titulo.status) || (titulo.valor_pago_centavos ?? 0) > 0) {
                throw new Error('Não é possível excluir título com pagamento registrado. Estorne o recebimento antes.');
            }
            if (shouldFilterByFilial && filialId && titulo.filial_id && titulo.filial_id !== filialId) {
                throw new Error('Este título pertence a outra unidade.');
            }

            let deleteQuery = supabase
                .from('fin_contas_receber')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', contaReceberId)
                .eq('empresa_id', empresaId)
                .is('deleted_at', null);
            if (shouldFilterByFilial && filialId) {
                deleteQuery = deleteQuery.eq('filial_id', filialId);
            }
            const { error: updateError } = await deleteQuery;
            if (updateError) throw updateError;
            const { cancelarPendenciasCobrancaPorTitulo } = await import('./cobrancaPendentesSupabase');
            await cancelarPendenciasCobrancaPorTitulo(empresaId, contaReceberId);
            await loadContasReceberDetalhado();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadContasReceberDetalhado, shouldFilterByFilial, filialId]);

    const prorrogarContaReceber = useCallback(async (
        contaReceberId: string,
        novaDataVencimento: string,
        motivo?: string,
    ): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const { data: atual, error: fetchErr } = await supabase
                .from('fin_contas_receber')
                .select('observacoes, data_vencimento, status')
                .eq('id', contaReceberId)
                .single();
            if (fetchErr) throw fetchErr;

            const hoje = new Date().toISOString().slice(0, 10);
            const novoStatus = novaDataVencimento < hoje ? 'vencido' : 'aberto';
            const dataAntiga = String(atual.data_vencimento || '').slice(0, 10);
            const linhaProrrog = `[${new Date().toLocaleString('pt-BR')}] Prorrogado de ${dataAntiga} para ${novaDataVencimento}${motivo?.trim() ? `: ${motivo.trim()}` : ''}`;
            const observacoes = [atual.observacoes, linhaProrrog].filter(Boolean).join('\n');

            const { error: updateError } = await supabase
                .from('fin_contas_receber')
                .update({
                    data_vencimento: novaDataVencimento,
                    status: novoStatus,
                    observacoes,
                    updated_by: user?.id || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', contaReceberId)
                .eq('empresa_id', empresaId);

            if (updateError) throw updateError;
            await registrarAuditoriaParcela(
                contaReceberId,
                'Vencimento de parcela prorrogado',
                `De ${dataAntiga} para ${novaDataVencimento}${motivo?.trim() ? ` — ${motivo.trim()}` : ''}`,
                {
                    dados_anteriores: { data_vencimento: dataAntiga, status: atual.status },
                    dados_novos: { data_vencimento: novaDataVencimento, status: novoStatus },
                },
            );
            await loadContasReceberDetalhado();
            window.dispatchEvent(new CustomEvent('fin-contas-receber-updated'));
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [empresaId, loadContasReceberDetalhado, user?.id]);

    // Gerar mensalidades para uma assinatura
    const gerarMensalidadesMes = useCallback(async (assinaturaId: string, meses: number = 12): Promise<number> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc('fn_gerar_mensalidades', {
                p_assinatura_id: assinaturaId,
                p_meses: meses,
            });
            if (rpcError) throw rpcError;
            return data as number;
        } catch (err) {
            handleError(err);
            return 0;
        } finally {
            setLoading(false);
        }
    }, []);

    const gerarMensalidadesComHistorico = useCallback(
        async (
            assinaturaId: string,
            ateVencimento: string,
            dataPagamento?: string,
            mesesFuturos: number = 12,
        ): Promise<{ pagas: number; futuras: number; total: number; error?: string } | null> => {
            setLoading(true);
            setError(null);
            try {
                const { data, error: rpcError } = await supabase.rpc('fn_gerar_mensalidades_com_historico', {
                    p_assinatura_id: assinaturaId,
                    p_ate_vencimento: ateVencimento.slice(0, 10),
                    p_data_pagamento: (dataPagamento || new Date().toISOString().slice(0, 10)).slice(0, 10),
                    p_meses_futuros: mesesFuturos,
                });
                if (rpcError) throw rpcError;
                const row = data as { pagas?: number; futuras?: number; total?: number } | null;
                if (!row || typeof row !== 'object') return { pagas: 0, futuras: 0, total: 0 };
                return {
                    pagas: Number(row.pagas) || 0,
                    futuras: Number(row.futuras) || 0,
                    total: Number(row.total) || 0,
                };
            } catch (err) {
                const msg =
                    err instanceof Error
                        ? err.message
                        : typeof err === 'object' && err !== null && 'message' in err
                          ? String((err as { message: unknown }).message)
                          : 'Falha ao gerar histórico de mensalidades.';
                handleError(err);
                return { pagas: 0, futuras: 0, total: 0, error: msg };
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    // Contas a Pagar
    const loadContasPagar = useCallback(async (filters?: Record<string, string>) => {
        setLoading(true);
        setError(null);
        try {
            const ids = empresaScopeIds;
            if (ids.length === 0) {
                setContasPagar([]);
                return;
            }

            for (const eid of ids) {
                try {
                    await supabase.rpc('fin_atualizar_vencidos_pagar', { p_empresa_id: eid });
                } catch (rpcErr) {
                    console.warn('[Financeiro] Não foi possível atualizar vencidos (pagar):', eid, rpcErr);
                }
            }

            const hojeIso = dataHojeIsoLocal();
            const searchTerm = filters?.search_term?.trim();
            const buscaAtiva = !!searchTerm && searchTerm.length >= 2;

            const escopoMultiEmpresa = ids.length > 1;

            const applyEscopoBase = (q: any, empresaIdUnica?: string) => {
                let query = empresaIdUnica
                    ? q.eq('empresa_id', empresaIdUnica)
                    : applyEmpresaScopeReceber(q, ids);
                if (!query) return null;
                query = query.is('deleted_at', null);

                // Visão consolidada (várias empresas): não restringe por filial da unidade ativa.
                if (shouldFilterByFilial && filialId && !escopoMultiEmpresa) {
                    query = applyFilialScopeStrict(query, filialId);
                }

                return query;
            };

            const filtroDataCampo = filters?.filtro_data_campo === 'pagamento' ? 'pagamento' : 'vencimento';
            const filtrarPorPagamento =
                !buscaAtiva &&
                filtroDataCampo === 'pagamento' &&
                Boolean(filters?.data_inicio || filters?.data_fim);

            let idsPagamentoNoPeriodo: string[] | null = null;
            if (filtrarPorPagamento) {
                const pageSizeBaixas = 1000;
                const maxBaixas = 20000;
                const idsBaixa: string[] = [];
                for (let offset = 0; offset < maxBaixas; offset += pageSizeBaixas) {
                    let bq = supabase
                        .from('fin_contas_pagar_baixas')
                        .select('conta_pagar_id')
                        .eq('estornada', false);
                    if (ids.length === 1) bq = bq.eq('empresa_id', ids[0]);
                    else bq = bq.in('empresa_id', ids);
                    if (filters?.data_inicio) bq = bq.gte('data_baixa', filters.data_inicio);
                    if (filters?.data_fim) bq = bq.lte('data_baixa', filters.data_fim);
                    const { data: baixasPeriodo, error: baixasErr } = await bq.range(
                        offset,
                        offset + pageSizeBaixas - 1,
                    );
                    if (baixasErr) throw baixasErr;
                    if (!baixasPeriodo?.length) break;
                    idsBaixa.push(
                        ...baixasPeriodo.map((b) => b.conta_pagar_id).filter(Boolean) as string[],
                    );
                    if (baixasPeriodo.length < pageSizeBaixas) break;
                }
                idsPagamentoNoPeriodo = [...new Set(idsBaixa)];
            }

            type CPQueryOpts = {
                idsOnly?: string[];
                filialId?: string;
                semFilial?: boolean;
                empresaId?: string;
            };

            const applyFiltrosComuns = (q: any, opts?: CPQueryOpts) => {
                let query = applyEscopoBase(q, opts?.empresaId);
                if (!query) return null;

                if (buscaAtiva) {
                    return query;
                }

                if (opts?.idsOnly?.length) {
                    query = query.in('id', opts.idsOnly);
                } else if (opts?.filialId) {
                    query = query.eq('filial_id', opts.filialId);
                } else if (opts?.semFilial) {
                    query = query.is('filial_id', null);
                } else if (!filtrarPorPagamento) {
                    if (filters?.data_inicio) query = query.gte('data_vencimento', filters.data_inicio);
                    if (filters?.data_fim) query = query.lte('data_vencimento', filters.data_fim);
                }

                if (filters?.status) {
                    if (filters.status === 'vencido') {
                        query = query.or(
                            `status.eq.vencido,and(status.in.(aberto,aprovado,pago_parcial),data_vencimento.lt.${hojeIso})`,
                        );
                    } else if (filters.status === 'aberto') {
                        // Paridade com totais da tela: aberto + aprovado a vencer (não vencido)
                        query = query.or(
                            `and(status.in.(aberto,aprovado),data_vencimento.gte.${hojeIso}),and(status.in.(aberto,aprovado),data_vencimento.is.null)`,
                        );
                    } else {
                        query = query.eq('status', filters.status);
                    }
                }
                if (filters?.tipo_documento) query = query.eq('tipo_documento', filters.tipo_documento);
                if (filters?.plano_conta_id) query = query.eq('plano_conta_id', filters.plano_conta_id);

                return query;
            };

            const executarQueryContasPagar = async (
                opts?: CPQueryOpts,
                orderCol: 'data_pagamento' | 'data_vencimento' = 'data_vencimento',
            ): Promise<ContaPagar[]> => {
                const pageSize = 1000;
                const maxRows = 20000;
                const merged: ContaPagar[] = [];

                for (let offset = 0; offset < maxRows; offset += pageSize) {
                    const scopedQuery = applyFiltrosComuns(
                        supabase.from('fin_contas_pagar').select(CP_SELECT),
                        opts,
                    );
                    if (!scopedQuery) break;
                    const { data, error: queryError } = await scopedQuery
                        .order(orderCol, { ascending: false, nullsFirst: false })
                        .range(offset, offset + pageSize - 1);
                    if (queryError) throw queryError;
                    if (!data?.length) break;
                    merged.push(
                        ...data.map((row) => mapContaPagarComNatureza(row as Record<string, unknown>)),
                    );
                    if (data.length < pageSize) break;
                }

                return merged;
            };

            const filialIdsConsolidado = (filters?.filial_ids || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const empresaIdsConsolidado = (filters?.empresa_ids || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const usarCargaPorEmpresa =
                !shouldFilterByFilial && !buscaAtiva && empresaIdsConsolidado.length > 1;
            const usarCargaPorFilial =
                !usarCargaPorEmpresa &&
                !shouldFilterByFilial &&
                !buscaAtiva &&
                filialIdsConsolidado.length > 1;

            const carregarConsolidadoFiliais = async (
                orderCol: 'data_pagamento' | 'data_vencimento',
            ): Promise<ContaPagar[]> => {
                const byId = new Map<string, ContaPagar>();
                const lotes = await Promise.all([
                    ...filialIdsConsolidado.map((fid) =>
                        executarQueryContasPagar({ filialId: fid }, orderCol),
                    ),
                    executarQueryContasPagar({ semFilial: true }, orderCol),
                ]);
                lotes.forEach((rows) => {
                    rows.forEach((cp) => {
                        if (cp.id) byId.set(cp.id, cp);
                    });
                });
                return Array.from(byId.values());
            };

            const carregarConsolidadoEmpresas = async (
                orderCol: 'data_pagamento' | 'data_vencimento',
            ): Promise<ContaPagar[]> => {
                const byId = new Map<string, ContaPagar>();
                const lotes = await Promise.all(
                    empresaIdsConsolidado.map((eid) =>
                        executarQueryContasPagar({ empresaId: eid }, orderCol),
                    ),
                );
                lotes.forEach((rows) => {
                    rows.forEach((cp) => {
                        if (cp.id) byId.set(cp.id, cp);
                    });
                });
                return Array.from(byId.values());
            };

            let mergedData: ContaPagar[] = [];

            if (!buscaAtiva) {
                const orderCol = filtrarPorPagamento ? 'data_pagamento' : 'data_vencimento';

                if (filtrarPorPagamento) {
                    const byId = new Map<string, ContaPagar>();
                    const idsPagamento = idsPagamentoNoPeriodo ?? [];
                    for (let i = 0; i < idsPagamento.length; i += 200) {
                        const chunk = idsPagamento.slice(i, i + 200);
                        const rows = await executarQueryContasPagar({ idsOnly: chunk }, orderCol);
                        rows.forEach((cp) => {
                            if (cp.id) byId.set(cp.id, cp);
                        });
                    }
                    mergedData = Array.from(byId.values());
                } else if (usarCargaPorEmpresa) {
                    mergedData = await carregarConsolidadoEmpresas(orderCol);
                } else if (usarCargaPorFilial) {
                    mergedData = await carregarConsolidadoFiliais(orderCol);
                } else {
                    mergedData = await executarQueryContasPagar(undefined, orderCol);
                }
            } else {
                const orDirect = [
                    `codigo.ilike.%${searchTerm}%`,
                    `descricao.ilike.%${searchTerm}%`,
                    `fornecedor_nome.ilike.%${searchTerm}%`,
                    `numero_nota_fiscal.ilike.%${searchTerm}%`,
                ].join(',');

                const directScoped = applyFiltrosComuns(
                    supabase.from('fin_contas_pagar').select(CP_SELECT),
                );
                if (!directScoped) {
                    setContasPagar([]);
                    return;
                }
                const { data: byDirect, error: directError } = await directScoped
                    .or(orDirect)
                    .order('data_vencimento', { ascending: true })
                    .limit(300);
                if (directError) throw directError;

                let byCodigoExato: ContaPagar[] = [];
                const digitosCodigo = searchTerm.replace(/\D/g, '');
                if (digitosCodigo) {
                    const numero = parseInt(digitosCodigo, 10);
                    if (Number.isFinite(numero) && numero > 0) {
                        const codigoFmt = formatarCodigoContaPagar(numero);
                        const codigoScoped = applyFiltrosComuns(
                            supabase.from('fin_contas_pagar').select(CP_SELECT),
                        );
                        if (codigoScoped) {
                            const { data: byFmt, error: codigoError } = await codigoScoped
                                .eq('codigo', codigoFmt)
                                .limit(5);
                            if (!codigoError) byCodigoExato = byFmt ?? [];
                        }
                    }
                }

                let byFornecedor: ContaPagar[] = [];
                let fornecedoresQ = supabase
                    .from('fornecedores')
                    .select('id')
                    .or(`nome.ilike.%${searchTerm}%,codigo.ilike.%${searchTerm}%,cnpj_cpf.ilike.%${searchTerm}%`)
                    .limit(80);
                if (ids.length === 1) fornecedoresQ = fornecedoresQ.eq('empresa_id', ids[0]);
                else fornecedoresQ = fornecedoresQ.in('empresa_id', ids);
                const { data: fornecedoresMatch, error: fornecedoresError } = await fornecedoresQ;

                if (!fornecedoresError && (fornecedoresMatch ?? []).length > 0) {
                    const fornIds = fornecedoresMatch!.map((f) => f.id);
                    const fornScoped = applyFiltrosComuns(
                        supabase.from('fin_contas_pagar').select(CP_SELECT),
                    );
                    if (fornScoped) {
                        const { data: contasForn, error: contasFornError } = await fornScoped
                            .in('fornecedor_id', fornIds)
                            .order('data_vencimento', { ascending: true })
                            .limit(100);
                        if (!contasFornError) byFornecedor = contasForn ?? [];
                    }
                }

                let byNatureza: ContaPagar[] = [];
                let planosQ = supabase
                    .from('fin_plano_contas')
                    .select('id')
                    .or(`codigo.ilike.%${searchTerm}%,nome.ilike.%${searchTerm}%`)
                    .limit(40);
                if (ids.length === 1) planosQ = planosQ.eq('empresa_id', ids[0]);
                else planosQ = planosQ.in('empresa_id', ids);
                const { data: planosMatch, error: planosError } = await planosQ;

                if (!planosError && (planosMatch ?? []).length > 0) {
                    const planoIds = planosMatch!.map((p) => p.id);
                    const planoScoped = applyFiltrosComuns(
                        supabase.from('fin_contas_pagar').select(CP_SELECT),
                    );
                    if (planoScoped) {
                        const { data: contasPlano, error: contasPlanoError } = await planoScoped
                            .in('plano_conta_id', planoIds)
                            .order('data_vencimento', { ascending: true })
                            .limit(100);
                        if (!contasPlanoError) byNatureza = (contasPlano ?? []).map((row) => mapContaPagarComNatureza(row as Record<string, unknown>));
                    }
                }

                const dedupe = new Map<string, ContaPagar>();
                [...(byDirect ?? []), ...byCodigoExato, ...byFornecedor, ...byNatureza].forEach((item) => {
                    if (item?.id) dedupe.set(item.id, mapContaPagarComNatureza(item as unknown as Record<string, unknown>));
                });
                const idsFornecedor = new Set(byFornecedor.map((cp) => cp.id));
                const idsNatureza = new Set(byNatureza.map((cp) => cp.id));
                const termoBusca = searchTerm.toLowerCase();
                mergedData = Array.from(dedupe.values()).filter((cp) =>
                    idsFornecedor.has(cp.id) ||
                    idsNatureza.has(cp.id) ||
                    contaPagarCodigoMatch(searchTerm, cp.codigo) ||
                    (cp.descricao || '').toLowerCase().includes(termoBusca) ||
                    (cp.fornecedor_nome || '').toLowerCase().includes(termoBusca) ||
                    (cp.numero_nota_fiscal || '').toLowerCase().includes(termoBusca) ||
                    (cp.natureza_financeira || '').toLowerCase().includes(termoBusca),
                );
            }

            let contasNormalizadas = normalizarContasPagarStatus(mergedData, hojeIso);
            if (!buscaAtiva && filters?.status === 'aberto') {
                contasNormalizadas = contasNormalizadas.filter((cp) =>
                    ['aberto', 'aprovado'].includes(contaPagarStatusEfetivo(cp, hojeIso)),
                );
            }
            setContasPagar(contasNormalizadas);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaScopeIds, dataRevisionEmpresa, shouldFilterByFilial, filialId, dataRevision]);

    const criarContaPagar = useCallback(async (data: Partial<ContaPagar>): Promise<string | null> => {
        setError(null);
        try {
            if (!empresaId) throw new Error('Empresa não identificada. Faça login novamente.');
            const { gerarProximoCodigoContaPagar } = await import('./proximoCodigoContaPagar');

            const { valor_total_centavos, valor_aberto_centavos, filial_id: filialIncoming, ...safeData } = data as any;

            const filialResolved =
                typeof filialIncoming === 'string' && filialIncoming.length > 0
                    ? filialIncoming
                    : shouldFilterByFilial
                        ? filialId
                        : undefined;

            let targetEmpresaId = empresaId;
            if (filialResolved) {
                const { data: filRow, error: filErr } = await supabase
                    .from('filiais')
                    .select('empresa_id')
                    .eq('id', filialResolved)
                    .maybeSingle();
                if (filErr) throw filErr;
                if (filRow?.empresa_id) {
                    targetEmpresaId = String(filRow.empresa_id);
                }
            }

            const codigoFinal = await gerarProximoCodigoContaPagar(targetEmpresaId);

            const insertRow = omitTituloTotaisGerados({
                empresa_id: targetEmpresaId,
                codigo: codigoFinal,
                ...safeData,
                ...(filialResolved ? { filial_id: filialResolved } : {}),
            } as Record<string, unknown>);

            const { data: inserted, error: insertError } = await supabase
                .from('fin_contas_pagar')
                .insert(insertRow)
                .select('id')
                .single();
            if (insertError) throw insertError;
            if (!inserted) throw new Error('Erro ao criar conta a pagar: nenhum dado retornado.');
            await loadContasPagar();
            return inserted?.id ?? null;
        } catch (err) {
            handleError(err);
            throw err;
        }
    }, [empresaId, dataRevisionEmpresa, loadContasPagar, shouldFilterByFilial, filialId]);

    const updateContaPagar = useCallback(async (id: string, data: Partial<ContaPagar>): Promise<boolean> => {
        setError(null);
        try {
            const { valor_total_centavos, valor_aberto_centavos, ...safeData } = data as any;
            const updateRow = omitTituloTotaisGerados(safeData as Record<string, unknown>);
            const { error: updateError } = await supabase
                .from('fin_contas_pagar')
                .update(updateRow)
                .eq('id', id)
                .eq('empresa_id', empresaId);
            if (updateError) throw updateError;
            await loadContasPagar();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        }
    }, [empresaId, dataRevisionEmpresa, loadContasPagar, shouldFilterByFilial, filialId, dataRevision]);

    interface BaixarContaPagarParamsInterno {
        conta_pagar_id: string;
        valor_pago_centavos: number;
        forma_pagamento_id?: string;
        conta_bancaria_id?: string;
        valor_desconto_centavos?: number;
        valor_juros_centavos?: number;
        valor_multa_centavos?: number;
        observacoes?: string;
        data_pagamento?: string;
    }

    const baixarContaPagar = useCallback(async (params: BaixarContaPagarParamsInterno): Promise<string | null> => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc('fin_baixar_conta_pagar', {
                p_conta_pagar_id: params.conta_pagar_id,
                p_valor_pago_centavos: params.valor_pago_centavos,
                p_forma_pagamento_id: params.forma_pagamento_id || null,
                p_conta_bancaria_id: params.conta_bancaria_id || null,
                p_valor_desconto_centavos: params.valor_desconto_centavos || 0,
                p_valor_juros_centavos: params.valor_juros_centavos || 0,
                p_valor_multa_centavos: params.valor_multa_centavos || 0,
                p_observacoes: params.observacoes || null,
                p_data_pagamento: params.data_pagamento || null,
                p_usuario_id: user?.id || null,
            });
            if (rpcError) throw rpcError;
            await loadContasPagar();
            // Upadte dashboard and stats
            await loadDashboard();
            return data as string;
        } catch (err) {
            handleError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadContasPagar, loadDashboard, user?.id]);

    // Estornar Conta a Pagar
    const estornarContaPagar = useCallback(async (contaPagarId: string, motivo: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const { error: rpcError } = await supabase.rpc('fin_estornar_conta_pagar', {
                p_conta_pagar_id: contaPagarId,
                p_motivo: motivo,
                p_usuario_id: user?.id || null,
            });
            if (rpcError) throw rpcError;
            await loadContasPagar();
            await loadDashboard();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [loadContasPagar, loadDashboard, user?.id]);

    const excluirContaPagar = useCallback(async (contaPagarId: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const { data: titulo, error: fetchErr } = await supabase
                .from('fin_contas_pagar')
                .select('id, status, filial_id, valor_pago_centavos')
                .eq('id', contaPagarId)
                .eq('empresa_id', empresaId)
                .is('deleted_at', null)
                .maybeSingle();
            if (fetchErr) throw fetchErr;
            if (!titulo) throw new Error('Título não encontrado.');
            if (['pago', 'pago_parcial'].includes(titulo.status) || (titulo.valor_pago_centavos ?? 0) > 0) {
                throw new Error('Não é possível excluir título com pagamento registrado. Estorne o pagamento antes.');
            }
            if (shouldFilterByFilial && filialId && titulo.filial_id && titulo.filial_id !== filialId) {
                throw new Error('Este título pertence a outra unidade.');
            }

            let deleteQuery = supabase
                .from('fin_contas_pagar')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', contaPagarId)
                .eq('empresa_id', empresaId)
                .is('deleted_at', null);
            if (shouldFilterByFilial && filialId) {
                deleteQuery = deleteQuery.eq('filial_id', filialId);
            }
            const { error: updateError } = await deleteQuery;

            if (updateError) throw updateError;

            await loadContasPagar();
            await loadDashboard();
            return true;
        } catch (err) {
            handleError(err);
            return false;
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadContasPagar, loadDashboard, shouldFilterByFilial, filialId]);

    // Movimentações
    const loadMovimentacoes = useCallback(async (filters?: Record<string, string>) => {
        if (!empresaId) return;
        setLoading(true);
        setError(null);
        try {
            let query = supabase
                .from('fin_movimentacoes')
                .select('*')
                .eq('empresa_id', empresaId)
                .order('data_movimentacao', { ascending: true })
                .order('created_at', { ascending: true })
                .limit(500);

            // Isola por filial quando o usuário está filtrado por uma filial específica
            if (shouldFilterByFilial && filialId) {
                query = applyFilialScopeStrict(query, filialId);
            }

            // Filtros adicionais vindos da UI
            if (filters?.conta_bancaria_id) query = query.eq('conta_bancaria_id', filters.conta_bancaria_id);
            if (filters?.tipo) query = query.eq('tipo', filters.tipo);
            if (filters?.data_inicio) query = query.gte('data_movimentacao', filters.data_inicio);
            if (filters?.data_fim) query = query.lte('data_movimentacao', filters.data_fim);

            const { data, error: queryError } = await query;
            if (queryError) throw queryError;
            setMovimentacoes(data ?? []);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, shouldFilterByFilial, filialId, dataRevision, dataRevisionEmpresa]);

    // Contas Bancárias
    const loadContasBancarias = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const ids = empresaScopeIds.length > 0 ? empresaScopeIds : [empresaId];
            let query = supabase
                .from('fin_contas_bancarias')
                .select('*')
                .order('principal', { ascending: false });

            const scopedQuery = applyEmpresaScopeReceber(query, ids);
            const { data, error: queryError } = await (scopedQuery || query.eq('empresa_id', empresaId));

            if (queryError) throw queryError;
            const rows = (data ?? []) as ContaBancaria[];
            const verTodosCaixas = usuarioPodeVerTodosCaixas(normalizedUserRole, userPermissoes);
            setContasBancarias(filtrarContasVisiveis(rows, user?.id, verTodosCaixas));
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, empresaScopeIds, dataRevisionEmpresa, normalizedUserRole, user?.id]);


    const criarContaBancaria = useCallback(async (data: Partial<ContaBancaria>) => {
        setError(null);
        try {
            if (!user?.empresa_id || !empresaId) {
                throw new Error('Empresa não identificada. Faça login novamente.');
            }
            if (!canManageContasBancarias) {
                throw new Error('Apenas admin/gerente pode criar conta bancária.');
            }

            const { proximoCodigoContaBancaria } = await import('./finContaBancariaCodigo');
            const codigo = await proximoCodigoContaBancaria(empresaId);

            const saldo_inicial_centavos = data.saldo_inicial_centavos || 0;

            const { data: inserted, error: insertError } = await supabase
                .from('fin_contas_bancarias')
                .insert({
                    empresa_id: empresaId,
                    codigo,
                    ...data,
                    saldo_atual_centavos: saldo_inicial_centavos,
                })
                .select()
                .single();

            if (insertError) throw insertError;
            if (!inserted) throw new Error('Erro ao criar conta: nenhum dado retornado.');

            await loadContasBancarias();
            await loadDashboard();
        } catch (err) {
            handleError(err);
            throw err;
        }
    }, [canManageContasBancarias, empresaId, dataRevisionEmpresa, loadContasBancarias, loadDashboard, user?.empresa_id]);

    const updateContaBancaria = useCallback(async (id: string, data: Partial<ContaBancaria>) => {
        setLoading(true);
        setError(null);
        try {
            if (!user?.empresa_id || !empresaId) {
                throw new Error('Empresa não identificada. Faça login novamente.');
            }
            if (!canManageContasBancarias) {
                throw new Error('Apenas admin/gerente pode editar conta bancária.');
            }
            const { error: updateError } = await supabase
                .from('fin_contas_bancarias')
                .update(data)
                .eq('id', id)
                .eq('empresa_id', empresaId);

            if (updateError) throw updateError;
            await loadContasBancarias();
            await loadDashboard();
        } catch (err) {
            handleError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [canManageContasBancarias, empresaId, dataRevisionEmpresa, loadContasBancarias, loadDashboard, user?.empresa_id]);

    const deleteContaBancaria = useCallback(async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            if (!user?.empresa_id || !empresaId) {
                throw new Error('Empresa não identificada. Faça login novamente.');
            }
            if (!canManageContasBancarias) {
                throw new Error('Apenas admin/gerente pode excluir conta bancária.');
            }

            // Verifica se existem movimentações vinculadas antes de excluir
            const { count: movCount } = await supabase
                .from('fin_movimentacoes')
                .select('id', { count: 'exact', head: true })
                .eq('conta_bancaria_id', id)
                .eq('empresa_id', empresaId);

            if ((movCount ?? 0) > 0) {
                // Conta tem histórico — desativa em vez de excluir (preserva integridade)
                const { error: deactivateError } = await supabase
                    .from('fin_contas_bancarias')
                    .update({ ativo: false })
                    .eq('id', id)
                    .eq('empresa_id', empresaId);
                if (deactivateError) throw deactivateError;
            } else {
                // Conta sem movimentações — pode excluir com segurança
                const { error: deleteError } = await supabase
                    .from('fin_contas_bancarias')
                    .delete()
                    .eq('id', id)
                    .eq('empresa_id', empresaId);
                if (deleteError) {
                    if (deleteError.code === '23503') {
                        throw new Error('Conta possui referências em outros registros. A conta foi inativada em vez de excluída.');
                    }
                    throw deleteError;
                }
            }

            await loadContasBancarias();
            await loadDashboard();
        } catch (err) {
            handleError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [canManageContasBancarias, empresaId, dataRevisionEmpresa, loadContasBancarias, loadDashboard, user?.empresa_id]);

    // Plano de Contas
    const loadPlanoContas = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (empresaId) {
                try {
                    await supabase.rpc('fin_garantir_natureza_carteirinha_cliente', {
                        p_empresa_id: empresaId,
                    });
                } catch (seedErr) {
                    console.warn('[Financeiro] fin_garantir_natureza_carteirinha_cliente:', seedErr);
                }
            }

            const { data, error: queryError } = await supabase
                .from('fin_plano_contas')
                .select('*')
                .eq('empresa_id', empresaId)
                .order('codigo', { ascending: true });

            if (queryError) throw queryError;

            // Auto-seeding: If no accounts found, try to clone from standard
            if ((!data || data.length === 0) && empresaId) {
                console.log('[Financeiro] Auto-seeding Standard Chart of Accounts...');
                const { error: rpcError } = await supabase.rpc('fin_clonar_plano_padrao', {
                    p_empresa_id: empresaId
                });

                if (!rpcError) {
                    try {
                        await supabase.rpc('fin_garantir_natureza_carteirinha_cliente', {
                            p_empresa_id: empresaId,
                        });
                    } catch (e2) {
                        console.warn('[Financeiro] fin_garantir_natureza_carteirinha_cliente (pós-clone):', e2);
                    }
                    // Retry load
                    const { data: retryData, error: retryError } = await supabase
                        .from('fin_plano_contas')
                        .select('*')
                        .eq('empresa_id', empresaId)
                        .order('codigo', { ascending: true });

                    if (!retryError) {
                        setPlanoContas(retryData ?? []);
                        return;
                    }
                } else {
                    console.error('[Financeiro] Failed to auto-seed:', rpcError);
                }
            }

            setPlanoContas(data ?? []);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa]);

    const createPlanoConta = useCallback(async (data: Partial<PlanoContaItem>) => {
        if (!empresaId) {
            const msg = 'Selecione a unidade (empresa) no topo da tela antes de cadastrar.';
            setError(msg);
            throw new Error(msg);
        }
        setLoading(true);
        setError(null);
        try {
            const row = payloadPlanoContaSalvar(data);
            const { error: insertError } = await supabase.from('fin_plano_contas').insert({
                empresa_id: empresaId,
                ...row,
            });
            if (insertError) throw insertError;
            await loadPlanoContas();
        } catch (err) {
            const msg = mensagemErroPlanoConta(err);
            setError(msg);
            console.error('[Financeiro] createPlanoConta:', msg, err);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadPlanoContas]);

    const updatePlanoConta = useCallback(async (id: string, data: Partial<PlanoContaItem>) => {
        if (!empresaId) {
            const msg = 'Selecione a unidade (empresa) no topo da tela antes de alterar.';
            setError(msg);
            throw new Error(msg);
        }
        setLoading(true);
        setError(null);
        try {
            const row = payloadPlanoContaSalvar(data);
            const { error: updateError } = await supabase
                .from('fin_plano_contas')
                .update(row)
                .eq('id', id)
                .eq('empresa_id', empresaId);

            if (updateError) throw updateError;
            await loadPlanoContas();
        } catch (err) {
            const msg = mensagemErroPlanoConta(err);
            setError(msg);
            console.error('[Financeiro] updatePlanoConta:', msg, err);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadPlanoContas]);

    const deletePlanoConta = useCallback(async (id: string) => {
        if (!empresaId) {
            const msg = 'Selecione a unidade (empresa) no topo da tela.';
            setError(msg);
            throw new Error(msg);
        }
        setLoading(true);
        setError(null);
        try {
            const { error: deleteError } = await supabase
                .from('fin_plano_contas')
                .delete()
                .eq('id', id)
                .eq('empresa_id', empresaId);

            if (deleteError) throw deleteError;
            await loadPlanoContas();
        } catch (err) {
            const msg = mensagemErroPlanoConta(err);
            setError(msg);
            console.error('[Financeiro] deletePlanoConta:', msg, err);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadPlanoContas]);

    // Centros de Custo
    const loadCentrosCusto = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (empresaId) {
                try {
                    await supabase.rpc('fin_garantir_centros_custo_padrao', {
                        p_empresa_id: empresaId,
                    });
                } catch (seedErr) {
                    console.warn('[Financeiro] fin_garantir_centros_custo_padrao:', seedErr);
                }
            }

            const { data, error: queryError } = await supabase
                .from('fin_centros_custo')
                .select('*')
                .eq('empresa_id', empresaId)
                .order('codigo', { ascending: true });

            if (queryError) throw queryError;
            setCentrosCusto(data ?? []);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa]);

    const criarCentroCusto = useCallback(async (data: Partial<CentroCusto>) => {
        setLoading(true);
        setError(null);
        try {
            const payload: any = {
                empresa_id: empresaId,
                codigo: data.codigo,
                nome: data.nome,
                tipo: data.tipo || 'outros',
                orcamento_mensal_centavos: data.orcamento_mensal_centavos ?? 0,
                ativo: data.ativo ?? true,
            };
            if (data.pai_id) payload.pai_id = data.pai_id;
            if (data.responsavel_id) payload.responsavel_id = data.responsavel_id;

            const { error: insertError } = await supabase
                .from('fin_centros_custo')
                .insert(payload);
            if (insertError) throw insertError;
            await loadCentrosCusto();
        } catch (err) {
            handleError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadCentrosCusto]);

    const atualizarCentroCusto = useCallback(async (id: string, data: Partial<CentroCusto>) => {
        setLoading(true);
        setError(null);
        try {
            const payload: any = {};
            if (data.codigo !== undefined) payload.codigo = data.codigo;
            if (data.nome !== undefined) payload.nome = data.nome;
            if (data.tipo !== undefined) payload.tipo = data.tipo;
            if (data.orcamento_mensal_centavos !== undefined) payload.orcamento_mensal_centavos = data.orcamento_mensal_centavos;
            if (data.ativo !== undefined) payload.ativo = data.ativo;
            if (data.pai_id !== undefined) payload.pai_id = data.pai_id || null;
            if (data.responsavel_id !== undefined) payload.responsavel_id = data.responsavel_id || null;
            payload.updated_at = new Date().toISOString();

            const { error: updateError } = await supabase
                .from('fin_centros_custo')
                .update(payload)
                .eq('id', id)
                .eq('empresa_id', empresaId);
            if (updateError) throw updateError;
            await loadCentrosCusto();
        } catch (err) {
            handleError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadCentrosCusto]);

    const excluirCentroCusto = useCallback(async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            const { error: deleteError } = await supabase
                .from('fin_centros_custo')
                .delete()
                .eq('id', id)
                .eq('empresa_id', empresaId);
            if (deleteError) throw deleteError;
            await loadCentrosCusto();
        } catch (err) {
            handleError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa, loadCentrosCusto]);

    // Formas de Pagamento
    const loadFormasPagamento = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: queryError } = await supabase
                .from('fin_formas_pagamento')
                .select('*')
                .eq('empresa_id', empresaId)
                .order('codigo', { ascending: true });

            if (queryError) throw queryError;
            setFormasPagamento(data ?? []);

            // Auto-seeding: If no payment methods found, try to clone from standard
            if ((!data || data.length === 0) && empresaId) {
                console.log('[Financeiro] Auto-seeding Standard Payment Methods...');
                const { error: rpcError } = await supabase.rpc('fin_clonar_formas_pagamento_padrao', {
                    p_empresa_id: empresaId
                });

                if (!rpcError) {
                    // Retry load
                    const { data: retryData, error: retryError } = await supabase
                        .from('fin_formas_pagamento')
                        .select('*')
                        .eq('empresa_id', empresaId)
                        .order('codigo', { ascending: true });

                    if (!retryError) {
                        setFormasPagamento(retryData ?? []);
                        return;
                    }
                } else {
                    console.error('[Financeiro] Failed to auto-seed payment methods:', rpcError);
                }
            }
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    }, [empresaId, dataRevisionEmpresa]);

    const value: FinanceiroContextValue = {
        loading, error, empresaId,
        dashboard, loadDashboard,
        contasReceber, contasReceberDetalhadas, loadContasReceber, loadContasReceberDetalhado, criarContaReceber, baixarContaReceber, estornarContaReceber, prorrogarContaReceber, excluirContaReceber, gerarMensalidadesMes, gerarMensalidadesComHistorico,
        contasPagar, loadContasPagar, criarContaPagar, updateContaPagar, baixarContaPagar, estornarContaPagar, excluirContaPagar,
        movimentacoes, loadMovimentacoes,
        contasBancarias, loadContasBancarias, criarContaBancaria, updateContaBancaria, deleteContaBancaria,
        planoContas, loadPlanoContas, createPlanoConta, updatePlanoConta, deletePlanoConta,
        centrosCusto, loadCentrosCusto, criarCentroCusto, atualizarCentroCusto, excluirCentroCusto,
        formasPagamento, loadFormasPagamento,
    };

    return (
        <FinanceiroContext.Provider value={value}>
            {children}
        </FinanceiroContext.Provider>
    );
};

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import {
    assinaturaEstaCancelada,
    normalizarFormaPagamentoAssinatura,
    normalizarStatusAssinatura,
} from './assinaturaNorm';
import { aplicarSexoNoPayloadCliente } from './normalizarSexoCliente';
import { mensagemErroSupabase } from './supabaseErrorMessage';
import { gerarCodigoClienteInterno } from './gerarCodigoClienteInterno';
import { gerarProximoCodigoContrato } from './proximoCodigoContrato';
import {
    ajustarEnderecoClientePayload,
    validarLimitesClientePayload,
} from './clienteDbLimites';
import {
    buscarClienteDuplicado,
    mensagemClienteDuplicado,
    normalizarTelefoneCliente,
    validarCpfObrigatorioNovoCliente,
    validarCpfSeInformado,
    clientePermiteCadastroSemCpfPorFlags,
} from './clienteDuplicidade';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';
import { aplicarCarenciaBeneficiarioPayload, CARENCIA_DEPENDENTE_PADRAO_DIAS } from './beneficiarioCarencia';
import { FILIAL_TODAS_ID } from './filialConstants';
import { CLIENTES_LIST_TABLE } from './clientesListQuery';
import { useFilial } from './FilialContext';
import { clienteMatchBusca, montarFiltroOrBuscaCliente } from './buscaCliente';
import { buscarClienteIdsPorCodigoContrato } from './buscaContrato';
import { nomePlanoParaExibicao } from './planoNomeExibicao';
import { dataHojeIsoLocal, normalizarDataIso } from './contratoDatas';

// ==================== TYPES ====================
export interface ClienteSB {
    id: string;
    empresa_id: string;
    codigo: string;
    // Dados Pessoais
    nome: string;
    nome_social?: string;
    cpf: string;
    rg?: string;
    rg_orgao_emissor?: string;
    rg_uf?: string;
    rg_data_emissao?: string;
    data_nascimento: string;
    sexo?: string;
    estado_civil?: string;
    nacionalidade?: string;
    nome_mae?: string;
    nome_pai?: string;
    naturalidade_cidade?: string;
    naturalidade_uf?: string;
    profissao?: string;
    escolaridade?: string;
    empresa_trabalho?: string;
    cargo_funcao?: string;
    renda_mensal_faixa?: string;
    foto_url?: string;
    // Documentos extras
    cnh_numero?: string;
    cnh_categoria?: string;
    cnh_validade?: string;
    titulo_eleitor?: string;
    ctps_numero?: string;
    pis_pasep?: string;
    certificado_militar?: string;
    certidao_numero?: string;
    certidao_tipo?: string;
    passaporte?: string;
    // Contatos
    email: string;
    email_secundario?: string;
    telefone_principal: string;
    celular: string;
    telefone_secundario?: string;
    telefone_celular2?: string;
    telefone_comercial?: string;
    ramal?: string;
    whatsapp?: string;
    whatsapp_preferencial?: boolean;
    facebook?: string;
    instagram?: string;
    preferencia_contato?: string;
    melhor_horario_contato?: string;
    aceita_comunicacao?: boolean;
    // Endereço Residencial
    endereco_cep: string;
    endereco_logradouro: string;
    endereco_numero: string;
    endereco_complemento?: string;
    endereco_bairro: string;
    endereco_cidade: string;
    endereco_estado: string;
    endereco_pais?: string;
    endereco_referencia?: string;
    tipo_residencia?: string;
    tempo_residencia_anos?: number;
    // Endereço Comercial
    endereco_com_cep?: string;
    endereco_com_logradouro?: string;
    endereco_com_numero?: string;
    endereco_com_complemento?: string;
    endereco_com_bairro?: string;
    endereco_com_cidade?: string;
    endereco_com_uf?: string;
    // Endereço Cobrança
    usa_endereco_residencial_cobranca?: boolean;
    endereco_cob_cep?: string;
    endereco_cob_logradouro?: string;
    endereco_cob_numero?: string;
    endereco_cob_complemento?: string;
    endereco_cob_bairro?: string;
    endereco_cob_cidade?: string;
    endereco_cob_uf?: string;
    // CRM
    status?: string;
    tipo_cliente?: string;
    segmento?: string;
    nivel_relacionamento?: string;
    cliente_vip?: boolean;
    tags?: string[];
    bloqueado?: boolean;
    motivo_bloqueio?: string;
    origem_canal?: string;
    /** interno | externo — CRM comercial */
    tipo_vendedor?: string;
    score_credito?: number;
    indicado_por_cliente_id?: string;
    data_primeiro_contato?: string;
    vendedor_id?: string;
    cobrador_id?: string;
    contrato_migracao?: boolean;
    data_ultima_mensalidade_paga?: string;
    data_registro_ultimo_pagamento?: string;
    criado_por_user_id?: string;
    // Financeiro
    forma_pagamento_preferencial?: string;
    dia_vencimento_preferido?: number;
    limite_credito_centavos?: number;
    desconto_padrao?: number;
    // Dados Bancários
    banco_principal?: string;
    agencia?: string;
    conta_corrente?: string;
    tipo_conta?: string;
    pix_chaves?: string[];
    // LGPD
    aceite_termo_uso?: boolean;
    aceite_termo_uso_data?: string;
    aceite_termo_uso_ip?: string;
    aceite_politica_privacidade?: boolean;
    aceite_politica_data?: string;
    consentimento_marketing?: boolean;
    consentimento_marketing_data?: string;
    consentimento_compartilhamento?: boolean;
    opt_out_comunicacao?: boolean;
    opt_out_motivo?: string;
    // Campos extras
    campos_personalizados?: Record<string, any>;
    ativo?: boolean;
    cliente_desde?: string;
    valor_total_gasto_centavos?: number;
    quantidade_contratos_ativos?: number;
    quantidade_sinistros?: number;
    // Datas
    created_at?: string;
    updated_at?: string;
    deleted_at?: string;
    // Identificadores Auxiliares
    numero_sequencial?: number;
    // Computed (from views)
    idade?: number;
    total_beneficiarios?: number;
    total_contratos_ativos?: number;
    cpf_formatado?: string;
    /** Preenchido em buscas — códigos de contrato (ex. CTR-000055). */
    contratos_codigos?: string[];
}

export interface BeneficiarioSB {
    id: string;
    empresa_id: string;
    cliente_id: string;
    assinatura_id: string | null;
    nome: string;
    cpf?: string;
    data_nascimento: string;
    sexo?: string;
    parentesco: string;
    tipo: string;
    telefone?: string;
    email?: string;
    status: string;
    ativo: boolean;
    data_inclusao: string;
    data_exclusao?: string;
    data_falecimento?: string | null;
    motivo_exclusao?: string;
    porcentagem_cobertura?: number;
    carencia_ativa?: boolean;
    data_fim_carencia?: string;
    rg_numero?: string;
    created_at: string;
}

export interface TimelineEvent {
    id: string;
    empresa_id: string;
    cliente_id: string;
    tipo_evento: string;
    categoria?: string;
    referencia_tipo?: string;
    referencia_id?: string;
    titulo: string;
    descricao?: string;
    dados_anteriores?: Record<string, unknown>;
    dados_novos?: Record<string, unknown>;
    canal?: string;
    sentido?: string;
    tem_anexos: boolean;
    importante: boolean;
    data_evento: string;
    created_at?: string;
    criado_por?: string;
    autor?: { nome?: string; email?: string } | null;
}

const BENEFICIARIO_UPDATE_FIELDS = ['nome', 'cpf', 'parentesco', 'ativo'] as const;

async function resolveCurrentUserId(): Promise<string | null> {
    try {
        const fromUserId = sessionStorage.getItem('userId');
        if (fromUserId) return fromUserId;
        const u = JSON.parse(sessionStorage.getItem('user') || '{}');
        if (u?.id) return u.id;
    } catch {
        /* ignore */
    }
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
}

/** Não envia `data_nascimento` vazia — evita NOT NULL no banco antes da migration. */
export function normalizarPayloadBeneficiario(
    payload: Partial<BeneficiarioSB>,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...payload };
    const dn = (payload.data_nascimento || '').trim();
    if (dn) out.data_nascimento = dn;
    else delete out.data_nascimento;

    const di = String(payload.data_inclusao || '').trim();
    if (di) out.data_inclusao = di.slice(0, 10);

    if (!out.tipo) out.tipo = 'dependente';
    if (!out.status) out.status = 'ativo';

    return out;
}

const pickBeneficiarioUpdatePayload = (payload: Partial<BeneficiarioSB>) => {
    const out: Partial<BeneficiarioSB> = {};
    if (payload.nome !== undefined) out.nome = payload.nome;
    if (payload.cpf !== undefined) out.cpf = payload.cpf || undefined;
    if (payload.parentesco !== undefined) out.parentesco = payload.parentesco;
    if (payload.ativo !== undefined) out.ativo = payload.ativo;
    if (payload.assinatura_id !== undefined) out.assinatura_id = payload.assinatura_id;
    const dn = (payload.data_nascimento || '').trim();
    if (dn) out.data_nascimento = dn;
    const di = (payload.data_inclusao || '').trim();
    if (di) out.data_inclusao = di.slice(0, 10);
    if (payload.data_fim_carencia !== undefined) {
        out.data_fim_carencia = payload.data_fim_carencia;
    }
    if (payload.carencia_ativa !== undefined) {
        out.carencia_ativa = payload.carencia_ativa;
    }
    return out;
};

const buildBeneficiarioAuditDescricao = (
    antigo: Record<string, unknown> | null | undefined,
    novo: Record<string, unknown>,
) => {
    const labels: Record<string, string> = {
        nome: 'Nome',
        cpf: 'CPF',
        parentesco: 'Parentesco',
        ativo: 'Ativo',
    };
    const mudancas: string[] = [];
    for (const key of BENEFICIARIO_UPDATE_FIELDS) {
        const antes = antigo?.[key];
        const depois = novo[key];
        if (String(antes ?? '') !== String(depois ?? '')) {
            const fmt = (v: unknown) => (typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : String(v ?? '—'));
            mudancas.push(`${labels[key]}: ${fmt(antes)} → ${fmt(depois)}`);
        }
    }
    return mudancas.length
        ? mudancas.join('; ')
        : `Dados do dependente ${String(novo.nome ?? '')} foram alterados.`;
};

export interface ContatoEmergencia {
    id: string;
    empresa_id: string;
    cliente_id: string;
    nome_completo: string;
    parentesco?: string;
    telefone_principal: string;
    telefone_secundario?: string;
    email?: string;
    ordem_prioridade: number;
    observacoes?: string;
}

export interface DadosMedicos {
    id: string;
    empresa_id: string;
    cliente_id?: string;
    beneficiario_id?: string;
    tipo_sanguineo?: string;
    alergias?: string;
    doencas_preexistentes?: string;
    medicamentos_uso_continuo?: string;
    possui_plano_saude: boolean;
    plano_saude_nome?: string;
    plano_saude_numero?: string;
    medico_nome?: string;
    medico_telefone?: string;
    doador_orgaos: boolean;
    observacoes?: string;
}

export interface Oportunidade {
    id: string;
    empresa_id: string;
    cliente_id?: string;
    titulo: string;
    descricao?: string;
    valor_estimado_centavos: number;
    probabilidade?: number;
    estagio: string;
    origem?: string;
    status: string;
    responsavel_id?: string;
    data_abertura: string;
    data_previsao_fechamento?: string;
    data_fechamento?: string;
    motivo_perda?: string;
    created_at: string;
}

export interface TarefaCRM {
    id: string;
    empresa_id: string;
    cliente_id?: string;
    oportunidade_id?: string;
    titulo: string;
    descricao?: string;
    tipo?: string;
    prioridade: string;
    data_vencimento?: string;
    data_conclusao?: string;
    concluida: boolean;
    responsavel_id?: string;
    created_at: string;
}

export interface NpsPesquisa {
    id: string;
    empresa_id: string;
    cliente_id: string;
    nota: number;
    comentario?: string;
    classificacao: string;
    contexto?: string;
    data_resposta: string;
}

export interface Comunicacao {
    id: string;
    empresa_id: string;
    cliente_id?: string;
    tipo: string;
    assunto?: string;
    mensagem: string;
    status: string;
    data_envio?: string;
    data_abertura?: string;
    created_at: string;
}

export interface DocumentoSB {
    id: string;
    empresa_id: string;
    entidade_tipo: string;
    entidade_id: string;
    tipo_documento: string;
    nome_arquivo: string;
    arquivo_url: string;
    categoria?: string;
    data_validade?: string;
    verificado: boolean;
    status: string;
    created_at: string;
}

export interface AssinaturaSB {
    id: string;
    empresa_id: string;
    codigo: string;
    cliente_id: string;
    plano_id: string;
    vendedor_id?: string;
    valor_mensal_centavos: number;
    valor_anual_centavos?: number;
    taxa_adesao_centavos?: number;
    periodicidade: string;
    dia_vencimento: number;
    forma_pagamento: string;
    dados_pagamento?: Record<string, unknown>;
    status: string;
    data_contratacao: string;
    data_primeiro_vencimento: string;
    data_ultimo_vencimento?: string;
    data_cancelamento?: string;
    motivo_cancelamento?: string;
    data_suspensao?: string;
    motivo_suspensao?: string;
    data_fim_carencia?: string;
    total_pago_centavos?: number;
    mensalidades_pagas?: number;
    mensalidades_atrasadas?: number;
    /** Unidade (quando cadastrada); nulo = legado / não informado. */
    filial_id?: string | null;
    entrega_para?: string | null;
    entrega_recebedor?: string | null;
    entrega_data?: string | null;
    entrega_entregador?: string | null;
    entrega_data_saida?: string | null;
    entrega_data_retorno?: string | null;
    entrega_obs?: string | null;
    /** Sem óbito/uso do plano por 20a10m — não gera mensalidades até reativação. */
    em_inercia?: boolean;
    inercia_desde?: string | null;
    inercia_ultimo_evento_em?: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    plano_nome?: string;
    plano_codigo?: string;
    cliente_nome?: string;
    cliente_cpf?: string;
    /** Dependentes vinculados (busca na lista de contratos). */
    dependentes?: { nome: string; cpf?: string }[];
    /** Dias de carência do titular/contrato (tabela planos). */
    plano_carencia_dias?: number;
    /** Dias de carência para dependente adicional (tabela planos). */
    plano_carencia_dependente_dias?: number;
}

export interface ClienteRelatorio {
    total_clientes: number;
    ativos: number;
    inativos: number;
    prospects: number;
    leads: number;
    cancelados: number;
    bloqueados: number;
    vips: number;
    por_segmento: Record<string, number>;
    por_nivel: Record<string, number>;
    por_origem: Record<string, number>;
    aniversariantes_mes: number;
    cadastrados_mes: number;
}

// ==================== CONTEXT ====================
interface ClienteStoreValue {
    // Data
    clientes: ClienteSB[];
    beneficiarios: BeneficiarioSB[];
    timeline: TimelineEvent[];
    contatosEmergencia: ContatoEmergencia[];
    dadosMedicos: DadosMedicos[];
    oportunidades: Oportunidade[];
    tarefasCrm: TarefaCRM[];
    npsPesquisas: NpsPesquisa[];
    comunicacoes: Comunicacao[];
    documentos: DocumentoSB[];
    assinaturas: AssinaturaSB[];
    relatorio: ClienteRelatorio | null;
    clienteAtivo: ClienteSB | null;
    loading: boolean;
    loadingAssinaturas: boolean;
    error: string | null;

    // Loaders
    loadClientes: () => Promise<void>;
    /** Busca no banco por nome, CPF, e-mail ou código (mín. 2 caracteres). */
    buscarClientes: (termo: string) => Promise<ClienteSB[]>;
    loadClienteById: (id: string) => Promise<ClienteSB | null>;
    loadBeneficiarios: (clienteId: string) => Promise<void>;
    loadTimeline: (clienteId: string) => Promise<void>;
    loadContatosEmergencia: (clienteId: string) => Promise<void>;
    loadDadosMedicos: (clienteId: string) => Promise<void>;
    loadOportunidades: () => Promise<void>;
    loadTarefasCrm: () => Promise<void>;
    loadNpsPesquisas: (clienteId?: string) => Promise<void>;
    loadComunicacoes: (clienteId?: string) => Promise<void>;
    loadDocumentos: (clienteId: string) => Promise<void>;
    loadAssinaturas: (clienteId: string) => Promise<void>;
    loadAllAssinaturas: () => Promise<void>;
    loadRelatorio: () => Promise<void>;

    // CRUD
    createCliente: (
        data: Partial<ClienteSB>,
        options?: { cadastroMigracao?: boolean; contratoMigracao?: boolean },
    ) => Promise<{ data: ClienteSB | null; error: string | null; existingId?: string }>;
    updateCliente: (id: string, data: Partial<ClienteSB>) => Promise<void>;
    deleteCliente: (id: string) => Promise<void>;
    createBeneficiario: (data: Partial<BeneficiarioSB> & { carencia_dependente_dias?: number }) => Promise<{ error: string | null }>;
    updateBeneficiario: (id: string, payload: Partial<BeneficiarioSB>) => Promise<{ error: string | null }>;
    deleteBeneficiario: (id: string) => Promise<{ error: string | null }>;
    createContatoEmergencia: (data: Partial<ContatoEmergencia>) => Promise<void>;
    createDadosMedicos: (data: Partial<DadosMedicos>) => Promise<void>;
    createOportunidade: (data: Partial<Oportunidade>) => Promise<void>;
    updateOportunidade: (id: string, payload: Partial<Oportunidade>) => Promise<void>;
    createTarefaCrm: (payload: Partial<TarefaCRM>) => Promise<void>;
    updateTarefaCrm: (id: string, payload: Partial<TarefaCRM>) => Promise<void>;
    createTimelineEvent: (payload: Partial<TimelineEvent>) => Promise<void>;
    createComunicacao: (payload: Partial<Comunicacao>) => Promise<void>;
    createAssinatura: (data: Partial<AssinaturaSB>) => Promise<{ assinatura: AssinaturaSB | null; error: string | null }>;
    cancelAssinatura: (id: string, motivo?: string) => Promise<{ ok: boolean; error: string | null }>;

    // Helpers
    formatCentavos: (v: number) => string;
    getEmpresaId: () => string | null;
}

const ClienteStoreContext = createContext<ClienteStoreValue | null>(null);

export function useClienteStore() {
    const ctx = useContext(ClienteStoreContext);
    if (!ctx) throw new Error('useClienteStore must be used within ClienteStoreProvider');
    return ctx;
}

export const ClienteStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { empresaIdEfetivo, empresaIdsParaFiltro, dataRevisionEmpresa } = useEmpresaContextoAtivo();
    const { filialId, isTodasFiliais, dataRevision: dataRevisionFilial } = useFilial();
    const [clientes, setClientes] = useState<ClienteSB[]>([]);
    const [beneficiarios, setBeneficiarios] = useState<BeneficiarioSB[]>([]);
    const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
    const [contatosEmergencia, setContatosEmergencia] = useState<ContatoEmergencia[]>([]);
    const [dadosMedicos, setDadosMedicos] = useState<DadosMedicos[]>([]);
    const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
    const [tarefasCrm, setTarefasCrm] = useState<TarefaCRM[]>([]);
    const [npsPesquisas, setNpsPesquisas] = useState<NpsPesquisa[]>([]);
    const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
    const [documentos, setDocumentos] = useState<DocumentoSB[]>([]);
    const [assinaturas, setAssinaturas] = useState<AssinaturaSB[]>([]);
    const [relatorio, setRelatorio] = useState<ClienteRelatorio | null>(null);
    const [clienteAtivo, setClienteAtivo] = useState<ClienteSB | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingAssinaturas, setLoadingAssinaturas] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadAllAssinaturasGenRef = useRef(0);

    const getEmpresaId = useCallback(() => {
        const idCtx = (empresaIdEfetivo || '').trim();
        if (idCtx) return idCtx;
        try {
            const u = JSON.parse(sessionStorage.getItem('user') || '{}');
            if (u?.empresa_id) return u.empresa_id;
            const cachedEmpresaId = sessionStorage.getItem('empresa_id');
            if (cachedEmpresaId) return cachedEmpresaId;
            return '';
        } catch {
            return '';
        }
    }, [empresaIdEfetivo]);

    const resolveEmpresaId = useCallback(async () => {
        const localEmpresaId = getEmpresaId();
        if (localEmpresaId) return localEmpresaId;

        const { data: { session } } = await supabase.auth.getSession();
        const sessionUserId = session?.user?.id || sessionStorage.getItem('userId');
        if (!sessionUserId) return '';

        const { data, error: userErr } = await supabase
            .from('users')
            .select('empresa_id')
            .eq('id', sessionUserId)
            .single();

        if (userErr || !data?.empresa_id) return '';

        try {
            const parsedUser = JSON.parse(sessionStorage.getItem('user') || '{}');
            sessionStorage.setItem('user', JSON.stringify({ ...parsedUser, empresa_id: data.empresa_id }));
            sessionStorage.setItem('empresa_id', data.empresa_id);
        } catch {
            sessionStorage.setItem('empresa_id', data.empresa_id);
        }

        return data.empresa_id;
    }, [getEmpresaId]);

    /** Empresas para consultas quando o contexto do grupo ainda não carregou. */
    const empresaIdsConsulta = useCallback(() => {
        const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
        if (ids.length > 0) return ids;
        const fallback = (empresaIdEfetivo || getEmpresaId() || '').trim();
        return fallback ? [fallback] : [];
    }, [empresaIdsParaFiltro, empresaIdEfetivo, getEmpresaId]);

    const filialIdOperacional = useCallback(() => {
        const id = (filialId || '').trim();
        if (!id || id === FILIAL_TODAS_ID || isTodasFiliais) return null;
        return id;
    }, [filialId, isTodasFiliais]);

    const formatCentavos = useCallback((v: number) => {
        return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }, []);

    // ── Loaders ──
    const loadClientes = useCallback(async () => {
        setLoading(true);
        setError(null);
        const ids = empresaIdsConsulta();
        if (ids.length === 0) {
            setClientes([]);
            setLoading(false);
            return;
        }

        try {
            let q = supabase.from(CLIENTES_LIST_TABLE).select('*').is('deleted_at', null).order('nome');
            if (ids.length === 1) q = q.eq('empresa_id', ids[0]);
            else q = q.in('empresa_id', ids);
            const { data, error: err } = await q;
            if (err) {
                setError(err.message);
                console.error(err);
                setClientes([]);
            } else {
                setClientes((data as ClienteSB[]) || []);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar clientes');
            setClientes([]);
        }
        setLoading(false);
    }, [empresaIdsConsulta, dataRevisionEmpresa]);

    const buscarClientes = useCallback(
        async (termo: string): Promise<ClienteSB[]> => {
            const ids = empresaIdsConsulta();
            const t = termo.trim();
            if (!t || t.length < 2 || ids.length === 0) return [];

            const runQuery = async (incluirNomeBusca: boolean) => {
                const orFilter = montarFiltroOrBuscaCliente(t, { incluirNomeBusca });
                if (!orFilter) return { data: [] as ClienteSB[], error: null as { message?: string } | null };
                let q = supabase
                    .from(CLIENTES_LIST_TABLE)
                    .select('*')
                    .is('deleted_at', null)
                    .or(orFilter)
                    .order('nome')
                    .limit(100);
                if (ids.length === 1) q = q.eq('empresa_id', ids[0]);
                else q = q.in('empresa_id', ids);
                return q;
            };

            try {
                const [byContrato, byFieldsRes] = await Promise.all([
                    buscarClienteIdsPorCodigoContrato(ids, t),
                    runQuery(true),
                ]);

                const clienteMap = new Map<string, ClienteSB>();

                if (byFieldsRes) {
                    let { data, error: err } = await byFieldsRes;
                    if (err && /nome_busca/i.test(err.message || '')) {
                        const retry = await runQuery(false);
                        ({ data, error: err } = await retry);
                    }
                    if (err) console.error('[buscarClientes]', err);
                    else (data as ClienteSB[] || []).forEach((c) => clienteMap.set(c.id, c));
                }

                const missingIds = byContrato.clienteIds.filter((id) => !clienteMap.has(id));
                if (missingIds.length > 0) {
                    let cq = supabase
                        .from(CLIENTES_LIST_TABLE)
                        .select('*')
                        .is('deleted_at', null)
                        .in('id', missingIds);
                    if (ids.length === 1) cq = cq.eq('empresa_id', ids[0]);
                    else cq = cq.in('empresa_id', ids);
                    const { data: extra, error: extraErr } = await cq;
                    if (extraErr) console.error('[buscarClientes/contrato]', extraErr);
                    else (extra as ClienteSB[] || []).forEach((c) => clienteMap.set(c.id, c));
                }

                return Array.from(clienteMap.values())
                    .map((c) => ({
                        ...c,
                        contratos_codigos: byContrato.codigosPorCliente.get(c.id),
                    }))
                    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));
            } catch (e) {
                console.error('[buscarClientes]', e);
                return [];
            }
        },
        [empresaIdsConsulta, dataRevisionEmpresa],
    );

    const loadClienteById = useCallback(async (id: string) => {
        const { data, error: err } = await supabase
            .from('view_clientes_completo')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (err) {
            // Evita ruído quando o contrato aponta para cliente removido.
            if (err.code === 'PGRST116') return null;
            console.error(err);
            return null;
        }
        const client = data as ClienteSB;
        setClienteAtivo(client);
        return client;
    }, []);

    const loadBeneficiarios = useCallback(async (clienteId: string) => {
        const { data, error: err } = await supabase
            .from('beneficiarios')
            .select('*')
            .eq('cliente_id', clienteId)
            .is('deleted_at', null)
            .order('ordem_prioridade');
        if (err) console.error(err);
        else setBeneficiarios((data as BeneficiarioSB[]) || []);
    }, []);

    const loadTimeline = useCallback(async (clienteId: string) => {
        const { data, error: err } = await supabase
            .from('timeline_clientes')
            .select('*, autor:users!timeline_clientes_criado_por_fkey(nome, email)')
            .eq('cliente_id', clienteId)
            .order('data_evento', { ascending: false })
            .limit(100);
        if (err) {
            console.error(err);
            const { data: fallback } = await supabase
                .from('timeline_clientes')
                .select('*')
                .eq('cliente_id', clienteId)
                .order('data_evento', { ascending: false })
                .limit(100);
            setTimeline((fallback as TimelineEvent[]) || []);
            return;
        }
        setTimeline((data as TimelineEvent[]) || []);
    }, []);

    const loadContatosEmergencia = useCallback(async (clienteId: string) => {
        const { data, error: err } = await supabase
            .from('contatos_emergencia')
            .select('*')
            .eq('cliente_id', clienteId)
            .order('ordem_prioridade');
        if (err) console.error(err);
        else setContatosEmergencia((data as ContatoEmergencia[]) || []);
    }, []);

    const loadDadosMedicos = useCallback(async (clienteId: string) => {
        const { data, error: err } = await supabase
            .from('dados_medicos')
            .select('*')
            .eq('cliente_id', clienteId);
        if (err) console.error(err);
        else setDadosMedicos((data as DadosMedicos[]) || []);
    }, []);

    const loadOportunidades = useCallback(async () => {
        const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
        if (!ids.length) {
            setOportunidades([]);
            return;
        }
        let q = supabase.from('oportunidades').select('*').order('created_at', { ascending: false });
        if (ids.length === 1) q = q.eq('empresa_id', ids[0]);
        else q = q.in('empresa_id', ids);
        const { data, error: err } = await q;
        if (err) console.error(err);
        else setOportunidades((data as Oportunidade[]) || []);
    }, [empresaIdsParaFiltro, dataRevisionEmpresa]);

    const loadTarefasCrm = useCallback(async () => {
        const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
        if (!ids.length) {
            setTarefasCrm([]);
            return;
        }
        let q = supabase.from('tarefas_crm').select('*').order('data_vencimento');
        if (ids.length === 1) q = q.eq('empresa_id', ids[0]);
        else q = q.in('empresa_id', ids);
        const { data, error: err } = await q;
        if (err) console.error(err);
        else setTarefasCrm((data as TarefaCRM[]) || []);
    }, [empresaIdsParaFiltro, dataRevisionEmpresa]);

    const loadNpsPesquisas = useCallback(
        async (clienteId?: string) => {
            const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
            let query = supabase.from('nps_pesquisas').select('*').order('data_resposta', { ascending: false });
            if (clienteId) query = query.eq('cliente_id', clienteId);
            else if (ids.length === 1) query = query.eq('empresa_id', ids[0]);
            else if (ids.length > 1) query = query.in('empresa_id', ids);
            else {
                setNpsPesquisas([]);
                return;
            }
            const { data, error: err } = await query;
            if (err) console.error(err);
            else setNpsPesquisas((data as NpsPesquisa[]) || []);
        },
        [empresaIdsParaFiltro, dataRevisionEmpresa],
    );

    const loadComunicacoes = useCallback(
        async (clienteId?: string) => {
            const ids = (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean);
            let query = supabase
                .from('comunicacoes')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            if (clienteId) query = query.eq('cliente_id', clienteId);
            else if (ids.length === 1) query = query.eq('empresa_id', ids[0]);
            else if (ids.length > 1) query = query.in('empresa_id', ids);
            else {
                setComunicacoes([]);
                return;
            }
            const { data, error: err } = await query;
            if (err) console.error(err);
            else setComunicacoes((data as Comunicacao[]) || []);
        },
        [empresaIdsParaFiltro, dataRevisionEmpresa],
    );

    const loadDocumentos = useCallback(async (clienteId: string) => {
        const { data, error: err } = await supabase
            .from('documentos')
            .select('*')
            .eq('entidade_tipo', 'cliente')
            .eq('entidade_id', clienteId)
            .eq('status', 'ativo')
            .order('created_at', { ascending: false });
        if (err) console.error(err);
        else setDocumentos((data as DocumentoSB[]) || []);
    }, []);

    const loadAssinaturas = useCallback(async (clienteId: string) => {
        const { data, error: err } = await supabase
            .from('assinaturas')
            .select('*')
            .eq('cliente_id', clienteId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
        if (err) { console.error(err); return; }

        const rows = data || [];
        // Collect unique plano_ids that need name lookup
        const planoIds = [...new Set((rows || []).map((a: any) => a.plano_id).filter(Boolean))];
        let planosMap: Record<string, { nome: string; codigo: string; carencia_dep?: number; carencia_ctr?: number }> = {};
        if (planoIds.length > 0) {
            const { data: planosData } = await supabase
                .from('planos')
                .select('id, nome, codigo, valor_mensal_centavos, carencia_dias, carencia_beneficiario_adicional_dias')
                .in('id', planoIds);

            (planosData || []).forEach((p: any) => {
                planosMap[p.id] = {
                    nome: nomePlanoParaExibicao(p.nome, p.valor_mensal_centavos, p.codigo),
                    codigo: p.codigo || '',
                    carencia_dep: p.carencia_beneficiario_adicional_dias,
                    carencia_ctr: p.carencia_dias,
                };
            });
        }

        const mapped = (rows || []).map((a: any) => ({
            ...a,
            plano_nome: planosMap[a.plano_id]?.nome || a.plano_nome || `Plano ${a.plano_id?.slice(0, 8) || '—'}`,
            plano_codigo: planosMap[a.plano_id]?.codigo || '',
            plano_carencia_dias: planosMap[a.plano_id]?.carencia_ctr ?? 0,
            plano_carencia_dependente_dias:
                planosMap[a.plano_id]?.carencia_dep ?? CARENCIA_DEPENDENTE_PADRAO_DIAS,
        }));
        setAssinaturas(mapped as AssinaturaSB[]);
    }, []);

    const loadRelatorio = useCallback(async () => {
        const empresaId = getEmpresaId();
        if (!empresaId) return;
        const { data, error: err } = await supabase.rpc('fn_relatorio_clientes', { p_empresa_id: empresaId });
        if (err) console.error(err);
        else setRelatorio(data as ClienteRelatorio);
    }, [getEmpresaId, dataRevisionEmpresa]);

    // ── CRUD ──
    const createCliente = useCallback(async (
        payload: Partial<ClienteSB>,
        options?: { cadastroMigracao?: boolean; contratoMigracao?: boolean },
    ) => {
        const empresaId = await resolveEmpresaId();
        if (!empresaId) {
            const msg = "Empresa não identificada. Por favor, faça login novamente.";
            setError(msg);
            console.error(msg);
            return { data: null, error: msg, existingId: undefined };
        }

        const codigo = await gerarCodigoClienteInterno(empresaId);

        const bodyRaw = aplicarSexoNoPayloadCliente({ ...payload, empresa_id: empresaId, codigo });
        const body = { ...bodyRaw } as Record<string, unknown>;
        if (body.telefone_principal) {
            body.telefone_principal = normalizarTelefoneCliente(String(body.telefone_principal));
        }
        if (body.celular) {
            body.celular = normalizarTelefoneCliente(String(body.celular));
        }
        ajustarEnderecoClientePayload(body);
        const erroLimite = validarLimitesClientePayload(body);
        if (erroLimite) {
            setError(erroLimite);
            return { data: null, error: erroLimite, existingId: undefined };
        }

        const permiteSemCpf = clientePermiteCadastroSemCpfPorFlags({
            origemCanal: body.origem_canal as string | undefined,
            cadastroMigracao: options?.cadastroMigracao,
            contratoMigracao: options?.contratoMigracao,
        });
        const cpfMsg = permiteSemCpf
            ? validarCpfSeInformado(body.cpf as string | undefined)
            : validarCpfObrigatorioNovoCliente(body.cpf as string | undefined);
        if (cpfMsg) {
            setError(cpfMsg);
            return { data: null, error: cpfMsg, existingId: undefined };
        }

        const duplicado = await buscarClienteDuplicado({
            cpf: body.cpf as string | undefined,
            nome: body.nome as string | undefined,
            telefone:
                (body.telefone_principal as string | undefined) ||
                (body.celular as string | undefined),
            empresaIds: [empresaId],
        });
        if (duplicado) {
            const msg = mensagemClienteDuplicado(duplicado);
            setError(msg);
            return { data: null, error: msg, existingId: duplicado.id };
        }

        const { data, error: err } = await supabase
            .from('clientes')
            .insert(body as Partial<ClienteSB>)
            .select()
            .single();

        if (!err) {
            await loadClientes();
            return { data: data as ClienteSB, error: null, existingId: undefined };
        }

        if (err.code === '23505' && (err.message || '').includes('clientes_cpf_key')) {
            const cpf = (payload.cpf || '').replace(/\D/g, '');
            if (cpf) {
                const { data: existing } = await supabase
                    .from('clientes')
                    .select('id')
                    .eq('empresa_id', empresaId)
                    .eq('cpf', cpf)
                    .maybeSingle();
                if (existing?.id) {
                    return {
                        data: null,
                        error: 'Já existe um cliente com esse CPF. Abrindo cadastro existente.',
                        existingId: existing.id,
                    };
                }
            }
            return { data: null, error: 'Já existe um cliente com esse CPF.', existingId: undefined };
        }

        if (err.code === '23505' && (err.message || '').toLowerCase().includes('codigo')) {
            const codigoRetry = await gerarCodigoClienteInterno(empresaId);
            const bodyRetryRaw = aplicarSexoNoPayloadCliente({
                ...payload,
                empresa_id: empresaId,
                codigo: codigoRetry,
            });
            const bodyRetry = { ...bodyRetryRaw } as Record<string, unknown>;
            if (bodyRetry.telefone_principal) {
                bodyRetry.telefone_principal = normalizarTelefoneCliente(String(bodyRetry.telefone_principal));
            }
            if (bodyRetry.celular) {
                bodyRetry.celular = normalizarTelefoneCliente(String(bodyRetry.celular));
            }
            ajustarEnderecoClientePayload(bodyRetry);
            const { data: data2, error: err2 } = await supabase
                .from('clientes')
                .insert(bodyRetry as Partial<ClienteSB>)
                .select()
                .single();
            if (!err2) {
                await loadClientes();
                return { data: data2 as ClienteSB, error: null, existingId: undefined };
            }
        }

        const msgAmigavel = mensagemErroSupabase(err, 'Não foi possível salvar o cliente. Tente novamente.');
        console.error('SUPABASE ERROR createCliente:', err);
        setError(msgAmigavel);
        return { data: null, error: msgAmigavel, existingId: undefined };
    }, [resolveEmpresaId, loadClientes]);

    const updateCliente = useCallback(async (id: string, payload: Partial<ClienteSB>) => {
        const body = aplicarSexoNoPayloadCliente(payload);
        const empresaId = getEmpresaId();
        if (body.cpf) {
            const duplicado = await buscarClienteDuplicado({
                cpf: body.cpf as string,
                nome: (body.nome as string | undefined) ?? undefined,
                telefone:
                    (body.telefone_principal as string | undefined) ||
                    (body.celular as string | undefined),
                empresaIds: empresaId ? [empresaId] : undefined,
                excluirClienteId: id,
            });
            if (duplicado) {
                const msg = mensagemClienteDuplicado(duplicado);
                setError(msg);
                throw new Error(msg);
            }
        }
        const { error: err } = await supabase.from('clientes').update(body).eq('id', id);
        if (err) {
            setError(mensagemErroSupabase(err, 'Não foi possível atualizar o cliente.'));
            throw new Error(mensagemErroSupabase(err, 'Não foi possível atualizar o cliente.'));
        }
        await loadClientes();
    }, [loadClientes]);

    const deleteCliente = useCallback(async (id: string) => {
        const { error: err } = await supabase.from('clientes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        if (err) setError(err.message);
        else await loadClientes();
    }, [loadClientes]);

    const createBeneficiario = useCallback(async (payload: Partial<BeneficiarioSB> & { carencia_dependente_dias?: number }) => {
        const empresaId = await resolveEmpresaId();
        const userId = await resolveCurrentUserId();
        const { carencia_dependente_dias, ...benefPayload } = payload;
        const diasCarencia = carencia_dependente_dias ?? CARENCIA_DEPENDENTE_PADRAO_DIAS;
        const base = normalizarPayloadBeneficiario({
            ...benefPayload,
            empresa_id: empresaId,
            data_inclusao: (benefPayload.data_inclusao || new Date().toISOString()).slice(0, 10),
        });
        const createPayload = aplicarCarenciaBeneficiarioPayload(base, diasCarencia);
    const { data, error: err } = await supabase.from('beneficiarios').insert(createPayload).select().single();
        if (err) {
            setError(err.message);
            console.error('SUPABASE ERROR createBeneficiario:', err);
            return { error: err.message };
        }

        if (data) {
            await supabase.from('timeline_clientes').insert({
                empresa_id: empresaId,
                cliente_id: data.cliente_id,
                tipo_evento: 'AUDITORIA',
                categoria: 'beneficiario',
                titulo: 'Dependente adicionado',
                descricao: data.assinatura_id
                    ? `O dependente ${data.nome} (${data.parentesco}) foi adicionado ao contrato. Inclusão: ${String(data.data_inclusao || '').slice(0, 10)}. Carência até ${String(data.data_fim_carencia || '').slice(0, 10)}.`
                    : `O dependente ${data.nome} (${data.parentesco}) foi cadastrado. Inclusão: ${String(data.data_inclusao || '').slice(0, 10)}.`,
                referencia_tipo: 'beneficiario',
                referencia_id: data.id,
                dados_novos: data,
                criado_por: userId || null,
            });
        }

        return { error: null };
    }, [resolveEmpresaId]);

    const updateBeneficiario = useCallback(async (id: string, payload: Partial<BeneficiarioSB>) => {
        const empresaId = getEmpresaId();
        const userId = await resolveCurrentUserId();
        const updatePayload = pickBeneficiarioUpdatePayload(payload);
        if (!Object.keys(updatePayload).length) {
            return { error: 'Nenhum campo válido para atualizar.' };
        }

        const { data: antigo } = await supabase.from('beneficiarios').select('*').eq('id', id).single();

        const { data: novo, error: err } = await supabase
            .from('beneficiarios')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (err) {
            setError(err.message);
            return { error: err.message };
        }

        if (novo && empresaId) {
            const descricao = buildBeneficiarioAuditDescricao(
                antigo as Record<string, unknown> | null,
                novo as Record<string, unknown>,
            );
            await supabase.from('timeline_clientes').insert({
                empresa_id: empresaId,
                cliente_id: novo.cliente_id,
                tipo_evento: 'AUDITORIA',
                categoria: 'beneficiario',
                titulo: 'Dependente atualizado',
                descricao,
                referencia_tipo: 'beneficiario',
                referencia_id: id,
                dados_anteriores: antigo,
                dados_novos: novo,
                criado_por: userId || null,
            });
        }

        return { error: null };
    }, [getEmpresaId]);

    const deleteBeneficiario = useCallback(async (id: string) => {
        const empresaId = getEmpresaId();
        const userId = await resolveCurrentUserId();

        // Buscar dados para auditoria
        const { data: b } = await supabase.from('beneficiarios').select('*').eq('id', id).single();
        if (!b) return { error: 'Beneficiário não encontrado' };

        const { error: err } = await supabase.from('beneficiarios').delete().eq('id', id);
        if (err) {
            setError(err.message);
            return { error: err.message };
        }

        if (empresaId) {
            await supabase.from('timeline_clientes').insert({
                empresa_id: empresaId,
                cliente_id: b.cliente_id,
                tipo_evento: 'AUDITORIA',
                categoria: 'beneficiario',
                titulo: 'Dependente removido',
                descricao: `O dependente ${b.nome} (${b.parentesco}) foi removido do contrato.`,
                referencia_tipo: 'beneficiario',
                referencia_id: id,
                dados_anteriores: b,
                criado_por: userId || null,
            });
        }

        return { error: null };
    }, [getEmpresaId]);

    const createContatoEmergencia = useCallback(async (payload: Partial<ContatoEmergencia>) => {
        const { error: err } = await supabase.from('contatos_emergencia').insert({ ...payload, empresa_id: getEmpresaId() });
        if (err) setError(err.message);
    }, [getEmpresaId]);

    const createDadosMedicos = useCallback(async (payload: Partial<DadosMedicos>) => {
        const { error: err } = await supabase.from('dados_medicos').insert({ ...payload, empresa_id: getEmpresaId() });
        if (err) setError(err.message);
    }, [getEmpresaId]);

    const createOportunidade = useCallback(async (payload: Partial<Oportunidade>) => {
        const { error: err } = await supabase.from('oportunidades').insert({ ...payload, empresa_id: getEmpresaId() });
        if (err) setError(err.message);
        else await loadOportunidades();
    }, [getEmpresaId, loadOportunidades]);

    const updateOportunidade = useCallback(async (id: string, payload: Partial<Oportunidade>) => {
        const { error: err } = await supabase.from('oportunidades').update(payload).eq('id', id);
        if (err) setError(err.message);
        else await loadOportunidades();
    }, [loadOportunidades]);

    const createTarefaCrm = useCallback(async (payload: Partial<TarefaCRM>) => {
        const { error: err } = await supabase.from('tarefas_crm').insert({ ...payload, empresa_id: getEmpresaId() });
        if (err) setError(err.message);
        else await loadTarefasCrm();
    }, [getEmpresaId, loadTarefasCrm]);

    const updateTarefaCrm = useCallback(async (id: string, payload: Partial<TarefaCRM>) => {
        const { error: err } = await supabase.from('tarefas_crm').update(payload).eq('id', id);
        if (err) setError(err.message);
        else await loadTarefasCrm();
    }, [loadTarefasCrm]);

    const createTimelineEvent = useCallback(async (payload: Partial<TimelineEvent>) => {
        const userId = await resolveCurrentUserId();
        const { error: err } = await supabase.from('timeline_clientes').insert({
            ...payload,
            empresa_id: getEmpresaId(),
            criado_por: payload.criado_por || userId || null,
        });
        if (err) setError(err.message);
    }, [getEmpresaId]);

    const createComunicacao = useCallback(async (payload: Partial<Comunicacao>) => {
        const { error: err } = await supabase.from('comunicacoes').insert({ ...payload, empresa_id: getEmpresaId() });
        if (err) setError(err.message);
        else await loadComunicacoes();
    }, [getEmpresaId, loadComunicacoes]);

    const loadAllAssinaturas = useCallback(async () => {
        const gen = ++loadAllAssinaturasGenRef.current;
        setLoadingAssinaturas(true);
        setAssinaturas([]);

        const ids = empresaIdsConsulta();
        if (!ids.length) {
            if (gen === loadAllAssinaturasGenRef.current) {
                setAssinaturas([]);
                setLoadingAssinaturas(false);
            }
            return;
        }

        try {
        let q = supabase
            .from('assinaturas')
            .select('*, clientes(nome, cpf)')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
        if (ids.length === 1) q = q.eq('empresa_id', ids[0]);
        else q = q.in('empresa_id', ids);
        const filialFiltro = filialIdOperacional();
        if (filialFiltro) {
            q = q.or(`filial_id.eq.${filialFiltro},filial_id.is.null`);
        }

        const { data, error: err } = await q;
        if (gen !== loadAllAssinaturasGenRef.current) return;
        if (err) {
            console.error('[loadAllAssinaturas]', err);
            setError(err.message);
            return;
        }
        setError(null);

        const rows = data || [];
        const planoIds = [...new Set(rows.map((a: any) => a.plano_id).filter(Boolean))];
        let planosMap: Record<string, { nome: string; codigo: string }> = {};
        if (planoIds.length > 0) {
            const { data: planosData } = await supabase
                .from('planos')
                .select('id, nome, codigo, valor_mensal_centavos')
                .in('id', planoIds);
            if (gen !== loadAllAssinaturasGenRef.current) return;

            (planosData || []).forEach((p: any) => {
                planosMap[p.id] = {
                    nome: nomePlanoParaExibicao(p.nome, p.valor_mensal_centavos, p.codigo),
                    codigo: p.codigo || '',
                };
            });
        }

        const assinaturaIds = rows.map((a: { id: string }) => a.id).filter(Boolean);
        const assinaturasPorCliente = new Map<string, string[]>();
        for (const a of rows as { id: string; cliente_id?: string }[]) {
            if (!a.cliente_id) continue;
            const list = assinaturasPorCliente.get(a.cliente_id) || [];
            list.push(a.id);
            assinaturasPorCliente.set(a.cliente_id, list);
        }

        const depPorAssinatura = new Map<string, { nome: string; cpf?: string }[]>();
        const addDependente = (assinaturaId: string, nome: string, cpf?: string | null) => {
            if (!assinaturaId || !nome?.trim()) return;
            const lista = depPorAssinatura.get(assinaturaId) || [];
            const cpfNorm = cpf?.replace(/\D/g, '') || undefined;
            if (lista.some((d) => d.nome === nome.trim() && d.cpf === cpfNorm)) return;
            lista.push({ nome: nome.trim(), cpf: cpfNorm || undefined });
            depPorAssinatura.set(assinaturaId, lista);
        };

        if (assinaturaIds.length > 0 || assinaturasPorCliente.size > 0) {
            let bq = supabase
                .from('beneficiarios')
                .select('assinatura_id, cliente_id, nome, cpf')
                .is('deleted_at', null);
            if (ids.length === 1) bq = bq.eq('empresa_id', ids[0]);
            else bq = bq.in('empresa_id', ids);

            const { data: bensData } = await bq;
            if (gen !== loadAllAssinaturasGenRef.current) return;
            for (const b of bensData || []) {
                const row = b as {
                    assinatura_id?: string | null;
                    cliente_id?: string | null;
                    nome?: string;
                    cpf?: string | null;
                };
                if (row.assinatura_id) {
                    addDependente(row.assinatura_id, row.nome || '', row.cpf);
                    continue;
                }
                if (row.cliente_id) {
                    for (const aid of assinaturasPorCliente.get(row.cliente_id) || []) {
                        addDependente(aid, row.nome || '', row.cpf);
                    }
                }
            }
        }

        const mapped = rows.map((a: any) => {
            const pCodigo = planosMap[a.plano_id]?.codigo || '';
            const valor = a.valor_mensal_centavos || a.valor_mensalidade_centavos || 0;
            const pNome = nomePlanoParaExibicao(
                planosMap[a.plano_id]?.nome || a.plano_nome,
                valor,
                pCodigo,
            );

            return {
                ...a,
                plano_nome: pNome,
                plano_codigo: pCodigo,
                cliente_nome: a.clientes?.nome || 'Cliente desconhecido',
                cliente_cpf: a.clientes?.cpf || undefined,
                dependentes: depPorAssinatura.get(a.id) || [],
            };
        });
        if (gen !== loadAllAssinaturasGenRef.current) return;
        setAssinaturas(mapped as AssinaturaSB[]);
        } finally {
            if (gen === loadAllAssinaturasGenRef.current) {
                setLoadingAssinaturas(false);
            }
        }
    }, [empresaIdsConsulta, dataRevisionEmpresa, dataRevisionFilial, filialIdOperacional]);

    const createAssinatura = useCallback(async (payload: Partial<AssinaturaSB>) => {
        const empresaId = await resolveEmpresaId();
        if (!empresaId) {
            const msg = "Empresa não identificada. Por favor, faça login novamente.";
            setError(msg);
            console.error(msg);
            return { assinatura: null, error: msg };
        }
        const newCodigo = await gerarProximoCodigoContrato(empresaId);

        const filialContrato = (payload.filial_id || filialIdOperacional() || null) as string | null;

        let vendedorIdContrato = payload.vendedor_id;
        if (!vendedorIdContrato && payload.cliente_id) {
            const { data: cliVend } = await supabase
                .from('clientes')
                .select('vendedor_id, criado_por_user_id')
                .eq('id', payload.cliente_id)
                .maybeSingle();
            vendedorIdContrato =
                cliVend?.vendedor_id || cliVend?.criado_por_user_id || undefined;
        }

        const { data, error: err } = await supabase
            .from('assinaturas')
            .insert({
                ...payload,
                vendedor_id: vendedorIdContrato || payload.vendedor_id,
                empresa_id: empresaId,
                filial_id: filialContrato,
                codigo: newCodigo,
                forma_pagamento: normalizarFormaPagamentoAssinatura(payload.forma_pagamento),
                status: normalizarStatusAssinatura('ativo'),
                data_contratacao: normalizarDataIso(payload.data_contratacao) || dataHojeIsoLocal(),
                data_primeiro_vencimento: payload.data_primeiro_vencimento
                    ? normalizarDataIso(payload.data_primeiro_vencimento) || payload.data_primeiro_vencimento
                    : payload.data_primeiro_vencimento,
            })
            .select()
            .single();
        if (err) {
            const msg = mensagemErroSupabase(
                err,
                'Não foi possível criar o contrato. Verifique permissões, plano e unidade selecionada.',
            );
            setError(msg);
            console.error(err);
            return { assinatura: null, error: msg };
        }

        const contrato = data as AssinaturaSB;
        const userId = await resolveCurrentUserId();
        await supabase.from('timeline_clientes').insert({
            empresa_id: empresaId,
            cliente_id: contrato.cliente_id,
            tipo_evento: 'AUDITORIA',
            categoria: 'contrato',
            titulo: `Contrato criado: ${contrato.codigo || contrato.id.slice(0, 8)}`,
            descricao: `Plano vinculado ao cliente. Status: ${contrato.status}.`,
            referencia_tipo: 'assinatura',
            referencia_id: contrato.id,
            dados_novos: {
                status: contrato.status,
                plano_id: contrato.plano_id,
                valor_mensal_centavos: contrato.valor_mensal_centavos,
                dia_vencimento: contrato.dia_vencimento,
                forma_pagamento: contrato.forma_pagamento,
            },
            criado_por: userId || null,
        });

        await loadAllAssinaturas();
        if (contrato.cliente_id) {
            await loadTimeline(contrato.cliente_id);
        }
        return { assinatura: contrato, error: null };
    }, [resolveEmpresaId, filialIdOperacional, loadAllAssinaturas, loadTimeline]);

    const cancelAssinatura = useCallback(
        async (id: string, motivo?: string) => {
            const motivoTrim = motivo?.trim();
            const { data: atual, error: errLoad } = await supabase
                .from('assinaturas')
                .select('id, status, cliente_id, empresa_id, codigo')
                .eq('id', id)
                .maybeSingle();
            if (errLoad) {
                setError(errLoad.message);
                return { ok: false, error: errLoad.message };
            }
            if (!atual) {
                const msg = 'Contrato não encontrado.';
                setError(msg);
                return { ok: false, error: msg };
            }
            if (assinaturaEstaCancelada(atual.status)) {
                return { ok: false, error: 'Este contrato já está cancelado.' };
            }

            const { error: err } = await supabase
                .from('assinaturas')
                .update({
                    status: normalizarStatusAssinatura('cancelado'),
                    data_cancelamento: new Date().toISOString().split('T')[0],
                    motivo_cancelamento: motivoTrim || null,
                })
                .eq('id', id);
            if (err) {
                setError(err.message);
                return { ok: false, error: err.message };
            }
            setError(null);

            if (atual.cliente_id && atual.empresa_id) {
                const userId = await resolveCurrentUserId();
                await supabase.from('timeline_clientes').insert({
                    empresa_id: atual.empresa_id,
                    cliente_id: atual.cliente_id,
                    tipo_evento: 'AUDITORIA',
                    categoria: 'contrato',
                    titulo: `Contrato cancelado: ${atual.codigo || id.slice(0, 8)}`,
                    descricao: motivoTrim || 'Contrato cancelado pelo usuário.',
                    referencia_tipo: 'assinatura',
                    referencia_id: id,
                    dados_anteriores: { status: atual.status },
                    dados_novos: {
                        status: normalizarStatusAssinatura('cancelado'),
                        motivo_cancelamento: motivoTrim || null,
                    },
                    criado_por: userId || null,
                });
                await loadTimeline(atual.cliente_id);
            }

            await loadAllAssinaturas();
            return { ok: true, error: null };
        },
        [loadAllAssinaturas, loadTimeline],
    );

    const value: ClienteStoreValue = {
        clientes, beneficiarios, timeline, contatosEmergencia, dadosMedicos,
        oportunidades, tarefasCrm, npsPesquisas, comunicacoes, documentos,
        assinaturas, relatorio, clienteAtivo, loading, loadingAssinaturas, error,
        loadClientes, buscarClientes, loadClienteById, loadBeneficiarios, loadTimeline,
        loadContatosEmergencia, loadDadosMedicos, loadOportunidades, loadTarefasCrm,
        loadNpsPesquisas, loadComunicacoes, loadDocumentos, loadAssinaturas, loadAllAssinaturas, loadRelatorio,
        createCliente, updateCliente, deleteCliente, createBeneficiario,
        createContatoEmergencia, createDadosMedicos, createOportunidade,
        updateOportunidade, createTarefaCrm, updateTarefaCrm, createTimelineEvent,
        createComunicacao, createAssinatura, cancelAssinatura, 
        updateBeneficiario, deleteBeneficiario,
        formatCentavos, getEmpresaId,
    };

    return (
        <ClienteStoreContext.Provider value={value}>
            {children}
        </ClienteStoreContext.Provider>
    );
};

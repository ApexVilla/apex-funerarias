import React, { createContext, useContext, useMemo } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useEmpresaContextoAtivo } from './EmpresaContextoAtivo';
import { montarFiltroOrBuscaCliente } from './buscaCliente';

type RoleType = 'admin' | 'vendedor';

export interface WhatsAppCliente {
  id: string;
  nome: string;
  whatsapp: string | null;
  status: string | null;
  vendedor_id: string | null;
  vendedor_nome?: string | null;
}

export interface WhatsAppContato {
  id: string;
  cliente_id: string;
  vendedor_id: string;
  resumo: string;
  status_contato: 'Mensagem enviada' | 'Respondeu' | 'Não atendeu' | 'Prometeu pagar';
  created_at: string;
  cliente_nome?: string | null;
  vendedor_nome?: string | null;
}

export interface WhatsAppConexao {
  id: string;
  empresa_id: string;
  provider: string;
  numero_whatsapp: string;
  instance_key: string | null;
  access_token: string | null;
  webhook_url: string | null;
  status_conexao: 'desconectado' | 'conectado';
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

interface DashboardResumo {
  totalClientes: number;
  inadimplentes: number;
  bloqueados: number;
  contatosHoje: number;
}

interface DashboardRanking {
  vendedor: string;
  total: number;
}

interface DashboardStatus {
  status: string;
  total: number;
}

interface DashboardPayload {
  resumo: DashboardResumo;
  ranking: DashboardRanking[];
  statusChart: DashboardStatus[];
  semContato30Dias: WhatsAppCliente[];
}

interface StoreType {
  role: RoleType;
  isAdmin: boolean;
  isVendedor: boolean;
  canManageConexao: boolean;
  getClientes: (params?: { search?: string; status?: string; vendedorId?: string }) => Promise<WhatsAppCliente[]>;
  getContatos: (clienteId?: string) => Promise<WhatsAppContato[]>;
  createContato: (payload: {
    cliente_id: string;
    resumo: string;
    status_contato: WhatsAppContato['status_contato'];
  }) => Promise<void>;
  sendMensagemWhatsApp: (payload: {
    cliente_id: string;
    mensagem: string;
  }) => Promise<{ ok: boolean; provider: string }>;
  getConexao: () => Promise<WhatsAppConexao | null>;
  saveConexao: (payload: {
    provider: string;
    numero_whatsapp: string;
    instance_key?: string;
    access_token?: string;
    webhook_url?: string;
  }) => Promise<void>;
  desconectarNumero: () => Promise<void>;
  getDashboard: () => Promise<DashboardPayload>;
  logAcessoCliente: (clienteId: string) => Promise<void>;
}

const Context = createContext<StoreType | null>(null);

const ADMIN_ROLES = new Set(['admin', 'admin_sistema', 'admin_empresa', 'gestor', 'gestor_executivo', 'super_admin', 'gerente', 'diretoria', 'supervisao']);

function maskPhone(phone: string | null) {
  if (!phone) return '-';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '*****';
  const ddd = digits.slice(0, 2);
  const sufixo = digits.slice(-4);
  return `(${ddd}) *****-${sufixo}`;
}

export const WhatsappCRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { empresaIdEfetivo, empresaIdsParaFiltro } = useEmpresaContextoAtivo();
  const role = (ADMIN_ROLES.has(user?.role || '') ? 'admin' : 'vendedor') as RoleType;
  const isAdmin = role === 'admin';
  const canManageConexao = isAdmin;
  const userId = user?.id || null;

  const empresaIdParaCrm = (empresaIdEfetivo || user?.empresa_id || '').trim();

  async function getClientes(params?: { search?: string; status?: string; vendedorId?: string }) {
    const ids = (empresaIdsParaFiltro || []).map((id) => String(id).trim()).filter(Boolean);
    if (!ids.length) return [];

    let query = supabase
      .from('view_clientes_completo')
      .select('id, nome, whatsapp, status, vendedor_id')
      .is('deleted_at', null)
      .order('nome');

    if (ids.length === 1) query = query.eq('empresa_id', ids[0]);
    else query = query.in('empresa_id', ids);

    if (!isAdmin) {
      if (!userId) return [];
      query = query.eq('vendedor_id', userId);
    }
    if (params?.search) {
      const or = montarFiltroOrBuscaCliente(params.search);
      if (or) query = query.or(or);
    }
    if (params?.status) query = query.eq('status', params.status);
    if (isAdmin && params?.vendedorId) query = query.eq('vendedor_id', params.vendedorId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data || []) as WhatsAppCliente[];
    return rows.map((r) => ({
      ...r,
      vendedor_nome: null,
      whatsapp: isAdmin ? r.whatsapp : maskPhone(r.whatsapp)
    }));
  }

  async function getContatos(clienteId?: string) {
    let query = supabase
      .from('crm_whatsapp_contatos_view')
      .select('id, cliente_id, vendedor_id, resumo, status_contato, created_at, cliente_nome, vendedor_nome')
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      if (!userId) return [];
      query = query.eq('vendedor_id', userId);
    }
    if (clienteId) query = query.eq('cliente_id', clienteId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as WhatsAppContato[];
  }

  async function getConexao() {
    if (!empresaIdParaCrm) throw new Error('Usuário sem contexto de empresa.');
    const { data, error } = await supabase
      .from('crm_whatsapp_conexoes')
      .select('*')
      .eq('empresa_id', empresaIdParaCrm)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as WhatsAppConexao | null) || null;
  }

  async function saveConexao(payload: {
    provider: string;
    numero_whatsapp: string;
    instance_key?: string;
    access_token?: string;
    webhook_url?: string;
  }) {
    if (!userId || !empresaIdParaCrm) throw new Error('Usuário sem contexto de empresa.');
    if (!payload.provider?.trim()) throw new Error('Informe o provedor de integração.');
    if (!payload.numero_whatsapp?.trim()) throw new Error('Informe o número do WhatsApp da empresa.');

    const sanitizedPhone = payload.numero_whatsapp.replace(/\D/g, '');
    if (sanitizedPhone.length < 10) throw new Error('Número de WhatsApp inválido.');

    const row = {
      empresa_id: empresaIdParaCrm,
      provider: payload.provider.trim(),
      numero_whatsapp: sanitizedPhone,
      instance_key: payload.instance_key?.trim() || null,
      access_token: payload.access_token?.trim() || null,
      webhook_url: payload.webhook_url?.trim() || null,
      status_conexao: 'conectado' as const,
      updated_by: userId
    };

    const { error } = await supabase
      .from('crm_whatsapp_conexoes')
      .upsert(row, { onConflict: 'empresa_id' });

    if (error) throw new Error(error.message);
  }

  async function desconectarNumero() {
    if (!userId || !empresaIdParaCrm) throw new Error('Usuário sem contexto de empresa.');

    const { error } = await supabase
      .from('crm_whatsapp_conexoes')
      .update({
        status_conexao: 'desconectado',
        access_token: null,
        instance_key: null,
        webhook_url: null,
        updated_by: userId
      })
      .eq('empresa_id', empresaIdParaCrm);

    if (error) throw new Error(error.message);
  }

  async function createContato(payload: {
    cliente_id: string;
    resumo: string;
    status_contato: WhatsAppContato['status_contato'];
  }) {
    if (!userId || !empresaIdParaCrm) throw new Error('Usuário sem contexto de empresa.');
    const { error } = await supabase.from('crm_whatsapp_contatos').insert({
      ...payload,
      empresa_id: empresaIdParaCrm,
      vendedor_id: userId
    });
    if (error) throw new Error(error.message);
  }

  async function sendMensagemWhatsApp(payload: {
    cliente_id: string;
    mensagem: string;
  }) {
    if (!payload.cliente_id) throw new Error('Cliente não informado.');
    if (!payload.mensagem?.trim()) throw new Error('Mensagem não informada.');

    const { data, error } = await supabase.functions.invoke('crm-send-whatsapp', {
      body: {
        cliente_id: payload.cliente_id,
        mensagem: payload.mensagem.trim()
      }
    });

    if (error) throw new Error(error.message || 'Erro ao enviar mensagem pelo WhatsApp.');
    if (!data?.ok) throw new Error(data?.error || 'Falha no envio da mensagem.');

    return {
      ok: true,
      provider: data.provider || 'desconhecido'
    };
  }

  async function logAcessoCliente(clienteId: string) {
    if (!userId || !empresaIdParaCrm) throw new Error('Usuário sem contexto de empresa.');
    const { error } = await supabase.from('crm_audit_logs').insert({
      empresa_id: empresaIdParaCrm,
      cliente_id: clienteId,
      user_id: userId,
      acao: 'CLIENT_VIEW',
      detalhes: 'Visualização de dados CRM'
    });
    if (error) throw new Error(error.message);
  }

  async function getDashboard() {
    const clientes = await getClientes();
    const contatos = await getContatos();

    const hoje = new Date().toISOString().slice(0, 10);
    const contatosHoje = contatos.filter((c) => (c.created_at || '').slice(0, 10) === hoje).length;
    const inadimplentes = clientes.filter((c) => c.status === 'Inadimplente').length;
    const bloqueados = clientes.filter((c) => c.status === 'Bloqueado' || c.status === 'bloqueado').length;

    const rankingMap = new Map<string, number>();
    contatos.forEach((c) => {
      const nome = c.vendedor_nome || 'Vendedor';
      rankingMap.set(nome, (rankingMap.get(nome) || 0) + 1);
    });

    const statusMap = new Map<string, number>();
    clientes.forEach((c) => {
      const key = c.status || 'Sem status';
      statusMap.set(key, (statusMap.get(key) || 0) + 1);
    });

    const contatoByCliente = new Map<string, string>();
    contatos.forEach((c) => {
      const prev = contatoByCliente.get(c.cliente_id);
      if (!prev || prev < c.created_at) contatoByCliente.set(c.cliente_id, c.created_at);
    });

    const now = Date.now();
    const limiarDias = 30 * 24 * 60 * 60 * 1000;
    const semContato30Dias = clientes.filter((c) => {
      const last = contatoByCliente.get(c.id);
      if (!last) return true;
      return now - new Date(last).getTime() > limiarDias;
    });

    return {
      resumo: {
        totalClientes: clientes.length,
        inadimplentes,
        bloqueados,
        contatosHoje
      },
      ranking: Array.from(rankingMap.entries()).map(([vendedor, total]) => ({ vendedor, total })),
      statusChart: Array.from(statusMap.entries()).map(([status, total]) => ({ status, total })),
      semContato30Dias
    };
  }

  const value = useMemo<StoreType>(() => ({
    role,
    isAdmin,
    isVendedor: !isAdmin,
    canManageConexao,
    getClientes,
    getContatos,
    createContato,
    sendMensagemWhatsApp,
    getConexao,
    saveConexao,
    desconectarNumero,
    getDashboard,
    logAcessoCliente
  }), [role, isAdmin, canManageConexao, userId, user?.empresa_id, empresaIdEfetivo, empresaIdsParaFiltro]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useWhatsappCRM() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useWhatsappCRM deve ser usado com WhatsappCRMProvider');
  return ctx;
}

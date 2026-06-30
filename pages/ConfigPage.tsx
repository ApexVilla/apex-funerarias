import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Building2, Shield, Save, Palette, Users, Mail, Calendar, Lock, X, UserPlus, Eye, EyeOff, Loader2, Check, KeyRound, CheckCircle2, Clock, Copy, MessageCircle, Pencil, Search, Printer, Bluetooth, Phone, Briefcase } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, Button, Input, Select, Textarea, Label, DropdownMenuContent, DropdownMenuItem } from '../components/ui/Components';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastStore';
import { supabase } from '../lib/supabase';
import { atualizarMeuPerfil } from '../lib/userProfileService';
import { MODULES } from '../lib/permissoesCatalog';
import { resolverPermissoesUsuarioParaSessao } from '../lib/permissoesResolucao';
import { normalizarRolesExtra, labelRolesExtras, ordenarCargosPorHierarquia, ROLES_VISAO_GRUPO_ECONOMICO } from '../lib/userRoles';
import {
  extrairEmpresasContexto,
  garantirEmpresaNoContextoPermissoes,
} from '../lib/empresasContextoUsuario';
import { unidadeNomeCurto } from '../lib/contextoUnidadeLabels';
import {
  buscarUsuarioDuplicadoPorEmail,
  buscarUsuarioDuplicadoPorNome,
  mensagemUsuarioDuplicadoEmail,
  mensagemUsuarioDuplicadoNome,
} from '../lib/colaboradorDuplicidade';
import {
  loadReciboTermicoConfig,
  saveReciboTermicoConfig,
  textoAvisoReajusteJaneiroProximo,
  type ReciboTermicoConfig,
  RECIBO_TERMICO_DEFAULTS,
} from '../lib/reciboTermicoConfig';
import { imprimirReciboTermicoInteligente } from '../lib/ReciboTermicoService';
import { ImpressoraBluetoothSetup } from '../components/cobradores/ImpressoraBluetoothSetup';
import { avisoUrlLogoInvalida, enderecoPareceUrlInvalida } from '../lib/logoUrl';
import { FENIX_LOGO_PATH, resolveLogoUrl } from '../lib/fenixLogo';
import { mensagemErroSupabase } from '../lib/supabaseErrorMessage';
import { atualizarUsuarioGestor } from '../lib/usuarioGestorService';
import {
  MOTIVOS_INATIVACAO,
  labelMotivoInativacao,
  type MotivoInativacao,
} from '../lib/usuarioInativacao';
import { enderecoEmpresaParaTexto } from '../lib/reciboEmpresaContexto';
import { ConfiguracaoCargos } from './config/ConfiguracaoCargos';
import { ConfiguracaoPermissoesGlobal } from './config/ConfiguracaoPermissoesGlobal';

import { buildConfigPath, parseConfigTabFromSearch, type ConfigTab } from '../lib/configNav';

interface SistemaUsuario {
  id: string;
  nome: string;
  email: string;
  role?: string;
  cargo?: string;
  roles_extra?: string[];
  telefone?: string;
  ativo?: boolean;
  motivo_inativacao?: MotivoInativacao | null;
  created_at?: string;
  empresa_id?: string;
  empresa_nome?: string;
  permissoes?: Record<string, Record<string, boolean>>;
}

interface PerfilFormData {
  nome: string;
  email: string;
  role: string;
  telefone: string;
}


const ROLES_SEM_FUNCAO_ADICIONAL = new Set(['admin_sistema', 'admin_empresa', 'admin', 'super_admin']);

function opcoesFuncoesAdicionais(primaryRole: string) {
  const primary = (primaryRole || '').toLowerCase();
  return ROLE_OPTIONS.filter(
    (r) => r.value !== primary && !ROLES_SEM_FUNCAO_ADICIONAL.has(r.value),
  );
}

function toggleFuncaoAdicional(primaryRole: string, atual: string[], roleId: string): string[] {
  const next = atual.includes(roleId) ? atual.filter((r) => r !== roleId) : [...atual, roleId];
  return normalizarRolesExtra(primaryRole, next);
}

function labelPerfilUsuario(role?: string, rolesExtra?: string[] | null): string {
  const primary = ROLE_OPTIONS.find((r) => r.value === role)?.label || role || '—';
  const extras = labelRolesExtras(rolesExtra, ROLE_OPTIONS);
  return extras ? `${primary} + ${extras}` : primary;
}

function FuncoesAdicionaisField({
  primaryRole,
  value,
  onChange,
}: {
  primaryRole: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const primary = (primaryRole || '').toLowerCase();
  if (!primary || ROLES_SEM_FUNCAO_ADICIONAL.has(primary)) return null;

  const opcoes = opcoesFuncoesAdicionais(primaryRole);
  if (opcoes.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label>Funções adicionais (opcional)</Label>
      <p className="text-xs text-gray-500 dark:text-slate-400">
        O usuário terá a união das permissões do cargo principal e das funções marcadas.
      </p>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((r) => {
          const marcado = value.includes(r.value);
          return (
            <label
              key={r.value}
              className={`inline-flex items-center gap-2 text-sm border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                marcado
                  ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
              }`}
            >
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={marcado}
                onChange={() => onChange(toggleFuncaoAdicional(primaryRole, value, r.value))}
              />
              {r.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: 'admin_sistema', label: 'Administrador de Sistema' },
  { value: 'admin_empresa', label: 'Administrador da Empresa' },
  { value: 'admin', label: 'Administrador (legado)' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'diretoria', label: 'Diretoria' },
  { value: 'gestor_executivo', label: 'Gestor Executivo' },
  { value: 'supervisao', label: 'Supervisão' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'cobrador', label: 'Cobrador' },
  { value: 'estoquista', label: 'Estoquista' },
  { value: 'agentes_funerarios', label: 'Agentes Funerários' },
  { value: 'agente_funerario', label: 'Agentes Funerários (legado)' },
  { value: 'motorista', label: 'Motorista' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'auxiliar_servicos_gerais', label: 'Auxiliar de Serviços Gerais' },
];

/** Mesmos perfis que `current_user_pode_ver_grupo_economico()` no banco — podem filtrar usuários por estabelecimento do grupo. */
const GRUPO_ECONOMICO_VISAO_COMPLETA = new Set<string>(ROLES_VISAO_GRUPO_ECONOMICO);

function usuarioVeVisaoCompletaGrupo(role: string | undefined): boolean {
  return GRUPO_ECONOMICO_VISAO_COMPLETA.has((role || '').toLowerCase());
}

function usuarioPodeGerenciarUsuarios(role: string | undefined): boolean {
  return usuarioVeVisaoCompletaGrupo(role);
}

interface EmpresaFormData {
  id: string;
  razao_social: string;
  cnpj: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  telefone_comercial: string;
  endereco_completo: string;
  logo_url?: string;
}

const emptyEmpresaForm: EmpresaFormData = {
  id: '',
  razao_social: '',
  cnpj: '',
  nome_fantasia: '',
  inscricao_estadual: '',
  telefone_comercial: '',
  endereco_completo: '',
  logo_url: '',
};
const formatarCnpj = (value?: string | null): string => {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length !== 14) return value || '';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};


export const ConfigPage: React.FC = () => {
  const { user, empresa, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = parseConfigTabFromSearch(
    searchParams.toString() ? `?${searchParams.toString()}` : '',
  );
  const [activeTab, setActiveTab] = useState<ConfigTab>(tabFromUrl);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const irParaAba = (tab: ConfigTab) => {
    setActiveTab(tab);
    if (tab === 'perfil') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };
  const [usuarios, setUsuarios] = useState<SistemaUsuario[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);
  const [savingRoleUserId, setSavingRoleUserId] = useState<string | null>(null);
  const [empresaForm, setEmpresaForm] = useState<EmpresaFormData>(emptyEmpresaForm);
  const [loadingEmpresa, setLoadingEmpresa] = useState(false);
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [perfilForm, setPerfilForm] = useState<PerfilFormData>({
    nome: '',
    email: '',
    role: '',
    telefone: ''
  });

  const [permissoesInitialUserId, setPermissoesInitialUserId] = useState<string | null>(null);

  // Estados para criação de usuário
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    nome: '',
    email: '',
    password: '',
    role: 'vendedor',
    cargo: '',
    empresa_id: '' as string,
    roles_extra: [] as string[],
  });
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  // Estados para alteração de senha (aba segurança)
  const [senhaForm, setSenhaForm] = useState({ atual: '', nova: '', confirmar: '' });
  const [savingSenha, setSavingSenha] = useState(false);
  const [showSenhaAtual, setShowSenhaAtual] = useState(false);
  const [showSenhaNova, setShowSenhaNova] = useState(false);

  // Estado para reset de senha pelo admin
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetModalUser, setResetModalUser] = useState<SistemaUsuario | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [resetLink, setResetLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // Estado para edição de usuário
  const [editingUser, setEditingUser] = useState<SistemaUsuario | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    nome: '',
    email: '',
    cargo: '',
    telefone: '',
    role: '',
    roles_extra: [] as string[],
    ativo: true,
    empresa_id: '' as string,
    motivo_inativacao: 'normal' as MotivoInativacao,
  });
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [editUserModalTab, setEditUserModalTab] = useState<'cadastro' | 'permissoes'>('cadastro');
  const [permSearchQuery, setPermSearchQuery] = useState('');

  // Mini menu de ações do usuário
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const [grupoEmpresasList, setGrupoEmpresasList] = useState<{ id: string; nome: string }[]>([]);
  const [roleOptions, setRoleOptions] = useState<Array<{ value: string; label: string }>>(ROLE_OPTIONS);

  const carregarCargosNoDropdown = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('codigo, nome, ativo')
        .eq('ativo', true);

      if (error) throw error;
      if (data && data.length > 0) {
        const formatted = data.map(d => ({ value: d.codigo, label: d.nome }));
        setRoleOptions(ordenarCargosPorHierarquia(formatted));
      }
    } catch (e) {
      console.error('Erro ao carregar cargos dinâmicos:', e);
    }
  };
  /** Filtro aplicado na listagem de usuários (grupo). */
  const [usuarioEmpresaFiltro, setUsuarioEmpresaFiltro] = useState('');
  /** Escolha no select antes de clicar em Aplicar. */
  const [usuarioEmpresaFiltroPendente, setUsuarioEmpresaFiltroPendente] = useState('');

  // ── Aparência ──────────────────────────────────────────────────────────────
  const ACCENT_COLORS = [
    { hex: '#2563eb', label: 'Azul (padrão)' },
    { hex: '#7c3aed', label: 'Violeta' },
    { hex: '#db2777', label: 'Rosa' },
    { hex: '#059669', label: 'Verde' },
    { hex: '#ea580c', label: 'Laranja' },
    { hex: '#0891b2', label: 'Ciano' },
  ];
  const savedTheme = () => (localStorage.getItem('fenix_theme') as 'light' | 'dark') || 'light';
  const savedAccent = () => localStorage.getItem('fenix_accent') || '#2563eb';
  const [tema, setTema] = useState<'light' | 'dark'>(savedTheme);
  const [reciboTermicoCfg, setReciboTermicoCfg] = useState<ReciboTermicoConfig>(RECIBO_TERMICO_DEFAULTS);
  const [savingReciboTermico, setSavingReciboTermico] = useState(false);
  const [accentColor, setAccentColor] = useState<string>(savedAccent);
  const [pendingTema, setPendingTema] = useState<'light' | 'dark'>(savedTheme);
  const [pendingAccent, setPendingAccent] = useState<string>(savedAccent);

  // Aplica tema e cor ao montar
  useEffect(() => {
    const t = savedTheme();
    const a = savedAccent();
    applyTheme(t);
    applyAccent(a);
    setTema(t);
    setPendingTema(t);
    setAccentColor(a);
    setPendingAccent(a);
    void carregarCargosNoDropdown();
  }, []);

  useEffect(() => {
    setReciboTermicoCfg(loadReciboTermicoConfig());
  }, []);

  function applyTheme(t: 'light' | 'dark') {
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  function applyAccent(hex: string) {
    const root = document.documentElement;
    // Cor principal dos botões e elementos de destaque
    root.style.setProperty('--accent-color', hex);
    root.style.setProperty('--accent-color-hover', hex);
    // Cor da sidebar: versão escurecida da cor de acento
    const sidebarBg = darkenHex(hex, 60);
    root.style.setProperty('--sidebar-bg', sidebarBg);
  }

  /** Escurece uma cor hex subtraindo `amount` de cada canal RGB */
  function darkenHex(hex: string, amount: number): string {
    const clean = hex.replace('#', '');
    const r = Math.max(0, parseInt(clean.slice(0, 2), 16) - amount);
    const g = Math.max(0, parseInt(clean.slice(2, 4), 16) - amount);
    const b = Math.max(0, parseInt(clean.slice(4, 6), 16) - amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function handleAplicarAparencia() {
    applyTheme(pendingTema);
    applyAccent(pendingAccent);
    localStorage.setItem('fenix_theme', pendingTema);
    localStorage.setItem('fenix_accent', pendingAccent);
    setTema(pendingTema);
    setAccentColor(pendingAccent);
    showToast('Aparência aplicada com sucesso!', 'success');
  }

  function handleRestaurarPadrao() {
    const defaultTheme: 'light' = 'light';
    const defaultAccent = '#2563eb';
    setPendingTema(defaultTheme);
    setPendingAccent(defaultAccent);
    applyTheme(defaultTheme);
    applyAccent(defaultAccent);
    localStorage.setItem('fenix_theme', defaultTheme);
    localStorage.setItem('fenix_accent', defaultAccent);
    setTema(defaultTheme);
    setAccentColor(defaultAccent);
    showToast('Aparência restaurada para o padrão.', 'success');
  }

  const podeGerenciarUsuarios = usuarioPodeGerenciarUsuarios(user?.role);

  const tabs = useMemo(
    () =>
      [
        { id: 'perfil', label: 'Meu Perfil', icon: User },
        { id: 'empresa', label: 'Empresa', icon: Building2 },
        ...(podeGerenciarUsuarios ? [
          { id: 'usuarios', label: 'Usuários', icon: Users },
          { id: 'cargos', label: 'Cargos de Usuário', icon: Briefcase },
          { id: 'permissoes', label: 'Permissões de Acesso', icon: Shield },
        ] : []),
        { id: 'seguranca', label: 'Segurança', icon: Shield },
        { id: 'aparencia', label: 'Aparência', icon: Palette },
      ] as const,
    [podeGerenciarUsuarios],
  );

  const totalAdmins = useMemo(
    () => usuarios.filter((u) => (u.role || '').toLowerCase().includes('admin')).length,
    [usuarios]
  );

  const filteredUsuarios = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return usuarios;
    return usuarios.filter(u =>
      (u.nome || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.role || '').toLowerCase().includes(term) ||
      (u.cargo || '').toLowerCase().includes(term) ||
      (u.empresa_nome || '').toLowerCase().includes(term) ||
      labelRolesExtras(u.roles_extra, ROLE_OPTIONS).toLowerCase().includes(term)
    );
  }, [usuarios, userSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredUsuarios.length / userPageSize));
  const paginatedUsuarios = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsuarios.slice(start, start + userPageSize);
  }, [filteredUsuarios, userPage, userPageSize]);

  const loadEmpresasGrupo = async (): Promise<{ id: string; nome: string }[]> => {
    const { data, error } = await supabase.rpc('fn_empresas_do_meu_grupo');
    const list =
      !error && Array.isArray(data) ? (data as { id: string; nome: string }[]) : [];
    setGrupoEmpresasList(list);
    return list;
  };

  const loadUsuarios = async (filtroEmpresaGrupo?: string) => {
    const empresaIdCtx = user?.empresa_id || (() => {
      try {
        const localUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        return localUser?.empresa_id || sessionStorage.getItem('empresa_id') || '';
      } catch {
        return sessionStorage.getItem('empresa_id') || '';
      }
    })();

    const veGrupo = usuarioVeVisaoCompletaGrupo(user?.role);

    if (!empresaIdCtx && !veGrupo) {
      showToast('Empresa não identificada para carregar usuários.', 'warning');
      return;
    }

    const filtroGrupoRaw =
      filtroEmpresaGrupo !== undefined ? filtroEmpresaGrupo : usuarioEmpresaFiltro;
    const filtroGrupo = (filtroGrupoRaw || '').trim();

    setLoadingUsuarios(true);
    try {
      const empresasGrupo = await loadEmpresasGrupo();
      const nomePorEmpresa = new Map(empresasGrupo.map((e) => [e.id, e.nome]));
      const empresaIdFiltroResolvido =
        filtroGrupo &&
        empresasGrupo.find((e) => (e.id || '').trim().toLowerCase() === filtroGrupo.toLowerCase());

      let q = supabase
        .from('users')
        .select('*')
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (!veGrupo) {
        q = q.eq('empresa_id', empresaIdCtx);
      } else {
        const filtroSan = empresaIdFiltroResolvido?.id?.trim() || '';
        if (filtroSan) {
          q = q.eq('empresa_id', filtroSan);
        }
      }

      const { data, error: loadErr } = await q;

      if (loadErr) throw loadErr;
      setUsuarios((data || []).map((u: any) => ({
        id: u.id,
        nome: u.nome || '',
        email: u.email || '',
        role: u.role || '',
        cargo: u.cargo || '',
        roles_extra: Array.isArray(u.roles_extra) ? u.roles_extra : [],
        telefone: u.telefone || '',
        ativo: u.ativo !== false,
        motivo_inativacao: u.motivo_inativacao || null,
        created_at: u.created_at,
        empresa_id: u.empresa_id,
        empresa_nome: (u.empresa_id && nomePorEmpresa.get(u.empresa_id)) || '',
        permissoes: u.permissoes || {},
      })));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao carregar usuários.';
      showToast(message, 'error');
    } finally {
      setLoadingUsuarios(false);
    }
  };

  /** Aplica o estabelecimento escolhido no select e recarrega a lista (também usado por «Atualizar Lista»). */
  const sincronizarFiltroEstabelecimentoECarregarUsuarios = () => {
    const id = (usuarioEmpresaFiltroPendente || '').trim();
    setUsuarioEmpresaFiltro(id);
    setUserPage(1);
    void loadUsuarios(id);
  };

  const getEmpresaId = () => {
    try {
      const localUser = JSON.parse(sessionStorage.getItem('user') || '{}');
      return user?.empresa_id || localUser?.empresa_id || sessionStorage.getItem('empresa_id') || '';
    } catch {
      return user?.empresa_id || sessionStorage.getItem('empresa_id') || '';
    }
  };

  const loadEmpresa = async () => {
    const empresaId = getEmpresaId();
    if (!empresaId) {
      showToast('Empresa não identificada para carregar dados.', 'warning');
      return;
    }

    setLoadingEmpresa(true);
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome, razao_social, cnpj, inscricao_estadual, telefone, endereco, logo_url')
        .eq('id', empresaId)
        .single();

      if (error) throw error;

      const enderecoTexto = enderecoEmpresaParaTexto(data?.endereco) || '';

      setEmpresaForm({
        id: data.id,
        razao_social: data.razao_social || '',
        cnpj: data.cnpj || '',
        nome_fantasia: data.nome || '',
        logo_url: data.logo_url || '',
        inscricao_estadual: data.inscricao_estadual || '',
        telefone_comercial: data.telefone || '',
        endereco_completo: enderecoTexto,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao carregar dados da empresa.';
      showToast(message, 'error');
    } finally {
      setLoadingEmpresa(false);
    }
  };

  const saveEmpresa = async () => {
    if (!empresaForm.id) {
      showToast('Empresa não identificada para atualização.', 'warning');
      return;
    }

    const avisoLogo = avisoUrlLogoInvalida(empresaForm.logo_url || '');
    if (avisoLogo) {
      showToast(avisoLogo, 'warning');
      return;
    }

    if (enderecoPareceUrlInvalida(empresaForm.endereco_completo)) {
      showToast(
        'O endereço não pode ser um link da internet (ex.: Google ou URL de imagem). Informe rua, número, bairro e cidade.',
        'warning',
      );
      return;
    }

    setSavingEmpresa(true);
    try {
      const { error } = await supabase
        .from('empresas')
        .update({
          nome: empresaForm.nome_fantasia || null,
          razao_social: empresaForm.razao_social || null,
          cnpj: empresaForm.cnpj || null,
          inscricao_estadual: empresaForm.inscricao_estadual || null,
          telefone: empresaForm.telefone_comercial || null,
          endereco: empresaForm.endereco_completo ? { texto: empresaForm.endereco_completo } : null,
          logo_url: empresaForm.logo_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', empresaForm.id);

      if (error) throw error;
      showToast('Dados da empresa atualizados com sucesso.', 'success');
      await loadEmpresa();
      await refreshUser();
    } catch (e) {
      showToast(mensagemErroSupabase(e, 'Erro ao salvar dados da empresa.'), 'error');
    } finally {
      setSavingEmpresa(false);
    }
  };

  const saveReciboTermico = () => {
    setSavingReciboTermico(true);
    try {
      saveReciboTermicoConfig(reciboTermicoCfg);
      showToast('Configuração do recibo térmico salva neste computador.', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao salvar configuração do recibo.';
      showToast(message, 'error');
    } finally {
      setSavingReciboTermico(false);
    }
  };

  const testarReciboTermico = async () => {
    const unidade = unidadeNomeCurto(empresaForm.nome_fantasia || empresa?.nome || 'CATALAO').toUpperCase();
    try {
      const modo = await imprimirReciboTermicoInteligente(
        {
          empresaNome: `FUNERARIA FENIX ${unidade}`,
          empresaCnpj: '03617822000104',
          telefone: reciboTermicoCfg.telefone || empresaForm.telefone_comercial || '(64)3441-4747',
          dataHora: new Date().toLocaleString('pt-BR'),
          atendente: (user as { nome?: string })?.nome?.toUpperCase() || 'ATENDENTE',
          parcelas: [
            { label: '9 - 03/2026', valorCentavos: 6800 },
            { label: '10 - 04/2026', valorCentavos: 6800 },
            { label: '11 - 05/2026', valorCentavos: 6800 },
          ],
          totalCentavos: 20400,
          clienteCodigo: '00095069',
          contratoCodigo: '0049',
          clienteNome: 'CLIENTE EXEMPLO DA SILVA',
          endereco: 'RUA EXEMPLO S/N CENTRO CIDADE GO',
          formaPagamento: 'DINHEIRO',
        },
        reciboTermicoCfg,
        { fallback: reciboTermicoCfg.fallbackNavegador ? 'termico' : 'pdf' },
      );
      showToast(
        modo === 'bluetooth'
          ? 'Teste enviado para a maquininha Bluetooth.'
          : modo === 'pdf'
            ? 'Recibo de teste em PDF aberto.'
            : 'Recibo de teste aberto no navegador.',
        'success',
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Falha ao imprimir teste.', 'error');
    }
  };

  const savePerfil = async () => {
    if (!user?.id) {
      showToast('Usuário não identificado para atualização de perfil.', 'warning');
      return;
    }

    const nome = perfilForm.nome.trim();
    if (!nome) {
      showToast('Informe o nome completo.', 'warning');
      return;
    }

    setSavingPerfil(true);
    try {
      const { error } = await atualizarMeuPerfil({
        nome,
        telefone: perfilForm.telefone.trim() || null,
      });

      if (error) throw new Error(error);
      await refreshUser();
      showToast('Perfil atualizado com sucesso.', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao salvar perfil.';
      showToast(message, 'error');
    } finally {
      setSavingPerfil(false);
    }
  };

  const updateUserRole = async (targetUserId: string, newRole: string, currentRole?: string, currentExtras?: string[]) => {
    if (!podeGerenciarUsuarios) {
      return;
    }
    if (newRole === (currentRole || '')) {
      return;
    }
    const usuario = usuarios.find((u) => u.id === targetUserId);
    if (!usuario) {
      showToast('Usuário não encontrado na lista.', 'error');
      return;
    }
    const rolesExtra = normalizarRolesExtra(newRole, currentExtras || []);
    setSavingRoleUserId(targetUserId);
    try {
      const { error } = await atualizarUsuarioGestor({
        usuarioId: targetUserId,
        nome: usuario.nome,
        telefone: usuario.telefone || null,
        role: newRole,
        ativo: usuario.ativo !== false,
        empresaId: usuario.empresa_id || null,
        motivoInativacao: usuario.ativo === false ? (usuario.motivo_inativacao || 'normal') : null,
        rolesExtra,
      });

      if (error) throw new Error(error);
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === targetUserId ? { ...u, role: newRole, roles_extra: rolesExtra } : u,
        ),
      );
      showToast('Perfil de acesso atualizado com sucesso.', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao atualizar perfil do usuário.';
      showToast(message, 'error');
    } finally {
      setSavingRoleUserId(null);
    }
  };

  const handleAlterarSenha = async () => {
    if (!senhaForm.atual) {
      showToast('Informe a senha atual.', 'warning');
      return;
    }
    if (!senhaForm.nova || senhaForm.nova.length < 6) {
      showToast('A nova senha deve ter pelo menos 6 caracteres.', 'warning');
      return;
    }
    if (senhaForm.nova !== senhaForm.confirmar) {
      showToast('As senhas não coincidem.', 'warning');
      return;
    }

    setSavingSenha(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: senhaForm.atual,
      });
      if (signInError) {
        showToast('Senha atual incorreta.', 'error');
        setSavingSenha(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: senhaForm.nova });
      if (error) throw error;

      showToast('Senha alterada com sucesso!', 'success');
      setSenhaForm({ atual: '', nova: '', confirmar: '' });
    } catch (err: any) {
      showToast(err?.message || 'Erro ao alterar senha.', 'error');
    } finally {
      setSavingSenha(false);
    }
  };

  const openResetModal = (u: SistemaUsuario) => {
    setResetModalUser(u);
    setResetDone(false);
    setOpenMenuId(null);
  };

  const handleResetSenhaUsuario = async () => {
    if (!resetModalUser) return;

    setResettingUserId(resetModalUser.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-reset-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: resetModalUser.email,
          app_url: window.location.origin,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erro ao gerar link');

      setResetLink(result.link);
      setResetDone(true);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao gerar link de reset.', 'error');
    } finally {
      setResettingUserId(null);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(resetLink);
      setLinkCopied(true);
      showToast('Link copiado!', 'success');
      setTimeout(() => setLinkCopied(false), 3000);
    } catch {
      const input = document.querySelector<HTMLInputElement>('#reset-link-input');
      if (input) { input.select(); document.execCommand('copy'); }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    }
  };

  const openRowMenu = (id: string, event: React.MouseEvent) => {
    setSelectedUserId(id);
    setOpenMenuId(id);
    setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
  };

  const handleOpenEditUser = (u: SistemaUsuario) => {
    setEditingUser(u);
    setEditUserModalTab('cadastro');
    setPermSearchQuery('');
    setEditUserForm({
      nome: u.nome || '',
      email: u.email || '',
      cargo: u.cargo || '',
      telefone: u.telefone || '',
      role: u.role || 'vendedor',
      roles_extra: normalizarRolesExtra(u.role, u.roles_extra || []),
      ativo: u.ativo !== false,
      empresa_id: u.empresa_id || '',
      motivo_inativacao: (u.motivo_inativacao || 'normal') as MotivoInativacao,
    });
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    if (!podeGerenciarUsuarios) {
      showToast('Sem permissão para editar usuários.', 'warning');
      return;
    }
    if (!editUserForm.nome.trim()) {
      showToast('Informe o nome do usuário.', 'warning');
      return;
    }
    setSavingEditUser(true);
    try {
      const empresaId =
        usuarioVeVisaoCompletaGrupo(user?.role) && editUserForm.empresa_id
          ? editUserForm.empresa_id
          : editingUser.empresa_id;
      const empresaNome =
        grupoEmpresasList.find((g) => g.id === empresaId)?.nome || editingUser.empresa_nome;

      const dupNome = await buscarUsuarioDuplicadoPorNome(
        editUserForm.nome,
        empresaId,
        editingUser.id,
      );
      if (dupNome) {
        showToast(mensagemUsuarioDuplicadoNome(dupNome, empresaNome), 'warning');
        setSavingEditUser(false);
        return;
      }

      const empresaIdRpc =
        usuarioVeVisaoCompletaGrupo(user?.role) && editUserForm.empresa_id
          ? editUserForm.empresa_id
          : undefined;

      const { error } = await atualizarUsuarioGestor({
        usuarioId: editingUser.id,
        nome: editUserForm.nome.trim(),
        telefone: editUserForm.telefone.trim() || null,
        role: editUserForm.role,
        ativo: editUserForm.ativo,
        empresaId: empresaIdRpc,
        motivoInativacao: editUserForm.ativo ? null : editUserForm.motivo_inativacao,
        rolesExtra: editUserForm.roles_extra,
      });

      if (error) throw new Error(error);

      const empresaNova =
        usuarioVeVisaoCompletaGrupo(user?.role) && editUserForm.empresa_id
          ? editUserForm.empresa_id
          : null;
      if (empresaNova && empresaNova !== editingUser.empresa_id) {
        const ctxAntes = extrairEmpresasContexto(
          editingUser.permissoes as Record<string, unknown> | undefined,
        );
        if (Object.keys(ctxAntes).length > 0 && !ctxAntes[empresaNova]) {
          const permissoesAtualizadas = garantirEmpresaNoContextoPermissoes(
            editingUser.permissoes as Record<string, unknown> | undefined,
            empresaNova,
          );
          const { error: permErr } = await supabase
            .from('users')
            .update({ permissoes: permissoesAtualizadas, updated_at: new Date().toISOString() })
            .eq('id', editingUser.id);
          if (permErr) throw permErr;
        }
      }

      if (editingUser.id === user?.id) {
        await refreshUser();
      }

      setUsuarios(prev => prev.map(u =>
        u.id === editingUser.id
          ? {
              ...u,
              nome: editUserForm.nome.trim(),
              telefone: editUserForm.telefone.trim(),
              role: editUserForm.role,
              cargo: editUserForm.role,
              roles_extra: editUserForm.roles_extra,
              ativo: editUserForm.ativo,
              motivo_inativacao: editUserForm.ativo ? null : editUserForm.motivo_inativacao,
              empresa_id: empresaNova ?? u.empresa_id,
              empresa_nome: empresaNova
                ? (grupoEmpresasList.find((g) => g.id === empresaNova)?.nome || u.empresa_nome)
                : u.empresa_nome,
              permissoes:
                empresaNova && empresaNova !== editingUser.empresa_id
                  ? (garantirEmpresaNoContextoPermissoes(
                      u.permissoes as Record<string, unknown> | undefined,
                      empresaNova,
                    ) as Record<string, Record<string, boolean>>)
                  : u.permissoes,
            }
          : u
      ));
      showToast('Usuário atualizado com sucesso.', 'success');
      setEditingUser(null);
    } catch (e) {
      showToast(mensagemErroSupabase(e, 'Erro ao atualizar usuário.'), 'error');
    } finally {
      setSavingEditUser(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.password || !newUserForm.nome || !newUserForm.cargo) {
      showToast('Por favor, preencha todos os campos obrigatórios.', 'warning');
      return;
    }

    setCreatingUser(true);
    try {
      const empresaCriacao = newUserForm.empresa_id || getEmpresaId();
      if (!empresaCriacao) {
        throw new Error('Empresa não identificada para criar usuário.');
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        showToast('Sessão expirada. Faça login novamente.', 'error');
        setCreatingUser(false);
        return;
      }

      const dupEmail = await buscarUsuarioDuplicadoPorEmail(newUserForm.email, empresaCriacao);
      if (dupEmail) {
        const empresaNome = grupoEmpresasList.find((g) => g.id === empresaCriacao)?.nome;
        showToast(mensagemUsuarioDuplicadoEmail(dupEmail, empresaNome), 'warning');
        setCreatingUser(false);
        return;
      }

      const dupNome = await buscarUsuarioDuplicadoPorNome(newUserForm.nome, empresaCriacao);
      if (dupNome) {
        const empresaNome = grupoEmpresasList.find((g) => g.id === empresaCriacao)?.nome;
        showToast(mensagemUsuarioDuplicadoNome(dupNome, empresaNome), 'warning');
        setCreatingUser(false);
        return;
      }

      const { data, error } = await supabase.rpc('admin_create_user', {
        p_email: newUserForm.email,
        p_password: newUserForm.password,
        p_nome: newUserForm.nome,
        p_role: newUserForm.cargo,
        p_empresa_id: empresaCriacao,
        p_roles_extra: newUserForm.roles_extra.length > 0 ? newUserForm.roles_extra : null,
      });

      if (error) throw error;
      if (!data) throw new Error('Não foi possível criar o usuário.');

      const emailLogin = (newUserForm.email || '').trim().toLowerCase();
      showToast(
        emailLogin
          ? `Usuário criado. Para entrar use o e-mail: ${emailLogin}`
          : 'Usuário criado com sucesso!',
        'success',
      );
      setShowNewUserModal(false);
      setNewUserForm({ nome: '', email: '', password: '', role: 'vendedor', cargo: '', empresa_id: getEmpresaId() || '', roles_extra: [] });
      loadUsuarios();
    } catch (e) {
      const raw =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: string }).message)
          : '';
      const details =
        e && typeof e === 'object' && 'details' in e && (e as { details?: string }).details
          ? String((e as { details?: string }).details)
          : '';

      const isFetchError = raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('networkerror');

      let message: string;
      if (isFetchError) {
        message = 'Erro de conexão com o servidor. Verifique sua internet e tente novamente. Se o problema persistir, faça logout e login novamente.';
      } else {
        message = raw || (e instanceof Error ? e.message : '') || 'Erro ao criar usuário.';
      }

      showToast(details ? `${message} (${details})` : message, 'error');
      console.error('[createUser]', e);
    } finally {
      setCreatingUser(false);
    }
  };

  useEffect(() => {
    if ((activeTab === 'usuarios' || activeTab === 'permissoes' || activeTab === 'cargos') && !podeGerenciarUsuarios) {
      setActiveTab('perfil');
    }
  }, [activeTab, podeGerenciarUsuarios]);

  useEffect(() => {
    if (activeTab === 'empresa') {
      loadEmpresa();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'usuarios' || !podeGerenciarUsuarios) return;
    void loadUsuarios();
  }, [activeTab, podeGerenciarUsuarios]);

  useEffect(() => {
    if (activeTab === 'usuarios') {
      setUsuarioEmpresaFiltroPendente(usuarioEmpresaFiltro);
    }
  }, [activeTab, usuarioEmpresaFiltro]);

  useEffect(() => {
    setUserPage(1);
  }, [usuarioEmpresaFiltro]);

  useEffect(() => {
    setPerfilForm({
      nome: (user as any)?.nome || '',
      email: user?.email || '',
      role: (user as any)?.role || '',
      telefone: (user as any)?.telefone || ''
    });
  }, [user]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Configurações" 
        subtitle="Gerencie as preferências da sua conta e da empresa"
      />

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => irParaAba(tab.id as ConfigTab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.id 
                ? 'bg-accent text-white shadow-lg shadow-accent/20' 
                : 'text-gray-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          <Card
            className={
              activeTab === 'permissoes'
                ? '!overflow-visible border-0 bg-transparent p-0 shadow-none'
                : 'p-8'
            }
          >
            {activeTab === 'perfil' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-6 pb-6 border-b dark:border-slate-800">
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl shadow-blue-100 dark:shadow-none uppercase">
                    {((perfilForm.nome || (user as any)?.nome || 'U')[0] || 'U').toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Configurações de Perfil</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Atualize sua foto e informações pessoais</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Nome Completo"
                    value={perfilForm.nome}
                    onChange={(e) => setPerfilForm((prev) => ({ ...prev, nome: e.target.value }))}
                  />
                  <Input label="E-mail" value={perfilForm.email} type="email" readOnly />
                  <Input
                    label="Perfil de acesso"
                    value={ROLE_OPTIONS.find((r) => r.value === perfilForm.role)?.label || perfilForm.role || '-'}
                    readOnly
                    helperText="Alteração de perfil é feita pelo administrador em Usuários."
                  />
                  <Input
                    label="Telefone"
                    value={perfilForm.telefone}
                    onChange={(e) => setPerfilForm((prev) => ({ ...prev, telefone: e.target.value }))}
                  />
                </div>
                
                <div className="pt-4 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPerfilForm({
                        nome: (user as any)?.nome || '',
                        email: user?.email || '',
                        role: (user as any)?.role || '',
                        telefone: (user as any)?.telefone || ''
                      })
                    }
                  >
                    Descartar
                  </Button>
                  <Button onClick={savePerfil} loading={savingPerfil}>
                    <Save className="h-4 w-4 mr-2" /> Salvar Perfil
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'empresa' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="pb-6 border-b dark:border-slate-800">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Informações da Organização</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Dados institucionais utilizados em contratos e recibos</p>
                </div>

                {loadingEmpresa ? (
                  <div className="text-sm text-gray-500 dark:text-slate-400">Carregando dados da empresa...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <Input
                          label="Razão Social"
                          value={empresaForm.razao_social}
                          onChange={(e) => setEmpresaForm((prev) => ({ ...prev, razao_social: e.target.value }))}
                        />
                      </div>
                      <Input
                        label="CNPJ"
                        value={formatarCnpj(empresaForm.cnpj)}
                        readOnly
                        className="bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 font-mono"
                        helperText="CNPJ da organização"
                      />
                      <Input
                        label="Nome Fantasia"
                        value={empresaForm.nome_fantasia}
                        onChange={(e) => setEmpresaForm((prev) => ({ ...prev, nome_fantasia: e.target.value }))}
                      />
                      <Input
                        label="Inscrição Estadual"
                        value={empresaForm.inscricao_estadual}
                        onChange={(e) => setEmpresaForm((prev) => ({ ...prev, inscricao_estadual: e.target.value }))}
                      />
                      <Input
                        label="Telefone Comercial"
                        value={empresaForm.telefone_comercial}
                        onChange={(e) => setEmpresaForm((prev) => ({ ...prev, telefone_comercial: e.target.value }))}
                      />
                      <div className="md:col-span-2 space-y-2">
                        <Input
                          label="URL da Logo (PNG/JPG)"
                          placeholder={FENIX_LOGO_PATH}
                          value={empresaForm.logo_url}
                          onChange={(e) => setEmpresaForm((prev) => ({ ...prev, logo_url: e.target.value }))}
                          helperText={`Deixe em branco para usar a logo padrão (${FENIX_LOGO_PATH}). Ou informe link direto PNG/JPG — evite links da busca do Google.`}
                        />
                        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <img
                            src={resolveLogoUrl(empresaForm.logo_url)}
                            alt="Prévia da logo"
                            className="h-10 w-auto max-w-[140px] object-contain"
                          />
                          <p className="text-xs text-gray-500">Prévia no menu e nos PDFs do sistema.</p>
                        </div>
                      </div>
                    </div>
                    
                    <Textarea
                      label="Endereço Completo"
                      value={empresaForm.endereco_completo}
                      onChange={(e) => setEmpresaForm((prev) => ({ ...prev, endereco_completo: e.target.value }))}
                    />
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 ml-1">
                      Rua, número, bairro, cidade e UF. Não cole link de site ou imagem aqui.
                    </p>
                  </>
                )}

                <div className="pt-4 flex justify-end gap-3">
                  <Button variant="outline" onClick={loadEmpresa} disabled={loadingEmpresa || savingEmpresa}>Recarregar</Button>
                  <Button onClick={saveEmpresa} loading={savingEmpresa} disabled={loadingEmpresa}>
                    <Save className="h-4 w-4 mr-2" /> Atualizar Dados
                  </Button>
                </div>

                <div className="pt-8 border-t dark:border-slate-800 space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Printer className="h-5 w-5" />
                      Recibo Térmico
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                      Baixa de parcelas (financeiro): <strong className="font-semibold text-gray-900 dark:text-white">80 mm</strong> — Bematech MP-4200 TH / MP-2800,
                      impressão pelo navegador. Cobradores em campo: <strong className="font-semibold text-gray-900 dark:text-white">58 mm</strong> — botão Conectar na cobrança.
                    </p>
                  </div>

                  <ImpressoraBluetoothSetup />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                      label="Modo de impressão"
                      value={reciboTermicoCfg.modoImpressao}
                      onChange={(e) =>
                        setReciboTermicoCfg((prev) => ({
                          ...prev,
                          modoImpressao: e.target.value as ReciboTermicoConfig['modoImpressao'],
                        }))
                      }
                    >
                      <option value="automatico">Automático (BT se pareada, senão navegador)</option>
                      <option value="bluetooth">Sempre maquininha Bluetooth</option>
                      <option value="navegador">Sempre navegador / impressora do PC</option>
                    </Select>
                    <Select
                      label="Largura do papel"
                      value={String(reciboTermicoCfg.larguraMm)}
                      onChange={(e) =>
                        setReciboTermicoCfg((prev) => ({
                          ...prev,
                          larguraMm: Number(e.target.value) === 58 ? 58 : 80,
                        }))
                      }
                    >
                      <option value="80">80 mm — Bematech MP-4200 TH / MP-2800</option>
                      <option value="58">58 mm</option>
                    </Select>
                    <Input
                      label="Telefone no recibo"
                      placeholder="(64)3441-4747"
                      value={reciboTermicoCfg.telefone || ''}
                      onChange={(e) =>
                        setReciboTermicoCfg((prev) => ({ ...prev, telefone: e.target.value }))
                      }
                      helperText="Se vazio, usa o telefone comercial da empresa"
                    />
                    <div className="md:col-span-2 space-y-3">
                      <label className="flex items-center justify-between gap-4 cursor-pointer select-none border border-slate-100 dark:border-slate-800/60 p-3.5 rounded-2xl bg-white dark:bg-slate-900/40 shadow-sm w-full">
                        <span className="text-sm text-gray-700 dark:text-slate-300">
                          Aviso de reajuste automático (1º de janeiro do{' '}
                          <strong>próximo ano</strong>) — em {new Date().getFullYear()} imprime janeiro de{' '}
                          {new Date().getFullYear() + 1}; em {new Date().getFullYear() + 1}, janeiro de{' '}
                          {new Date().getFullYear() + 2}, e assim por diante.
                        </span>
                        <div className="switch">
                          <input
                            type="checkbox"
                            checked={reciboTermicoCfg.avisoRodapeAutomatico !== false}
                            onChange={(e) =>
                              setReciboTermicoCfg((prev) => ({
                                ...prev,
                                avisoRodapeAutomatico: e.target.checked,
                              }))
                            }
                          />
                          <span className="slider"></span>
                        </div>
                      </label>
                      {reciboTermicoCfg.avisoRodapeAutomatico !== false ? (
                        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          Texto atual no recibo:{' '}
                          <em>{textoAvisoReajusteJaneiroProximo()}</em>
                        </p>
                      ) : (
                        <Textarea
                          label="Aviso personalizado no rodapé"
                          value={reciboTermicoCfg.avisoRodape || ''}
                          onChange={(e) =>
                            setReciboTermicoCfg((prev) => ({ ...prev, avisoRodape: e.target.value }))
                          }
                          rows={2}
                          placeholder="Mensagem fixa no rodapé do comprovante"
                        />
                      )}
                    </div>
                    <Input
                      label="Linha plano Fênix"
                      value={reciboTermicoCfg.valorPlanoFenix || ''}
                      onChange={(e) =>
                        setReciboTermicoCfg((prev) => ({ ...prev, valorPlanoFenix: e.target.value }))
                      }
                    />
                    <Input
                      label="Linha plano Onix"
                      value={reciboTermicoCfg.valorPlanoOnix || ''}
                      onChange={(e) =>
                        setReciboTermicoCfg((prev) => ({ ...prev, valorPlanoOnix: e.target.value }))
                      }
                    />
                  </div>

                  <p className="text-sm text-gray-600 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    Na <strong>Baixa de parcelas</strong> (atendente/financeiro), o recibo só imprime quando você
                    clicar em térmica ou PDF. Cobradores em campo escolhem o modo na hora da baixa na tela de
                    cobranças.
                  </p>

                  <label className="flex items-center justify-between gap-4 cursor-pointer select-none border border-slate-100 dark:border-slate-800/60 p-3.5 rounded-2xl bg-white dark:bg-slate-900/40 shadow-sm w-full">
                    <span className="text-sm text-gray-700 dark:text-slate-300 flex items-center gap-2">
                      <Bluetooth className="h-4 w-4 text-blue-500" />
                      Se Bluetooth falhar, usar impressão pelo navegador (financeiro). Cobradores usam PDF.
                    </span>
                    <div className="switch">
                      <input
                        type="checkbox"
                        checked={reciboTermicoCfg.fallbackNavegador}
                        onChange={(e) =>
                          setReciboTermicoCfg((prev) => ({
                            ...prev,
                            fallbackNavegador: e.target.checked,
                          }))
                        }
                      />
                      <span className="slider"></span>
                    </div>
                  </label>

                  <div className="flex flex-wrap justify-end gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setReciboTermicoCfg({ ...RECIBO_TERMICO_DEFAULTS })}
                    >
                      Restaurar padrão
                    </Button>
                    <Button variant="outline" onClick={testarReciboTermico}>
                      <Printer className="h-4 w-4 mr-2" />
                      Imprimir teste
                    </Button>
                    <Button onClick={saveReciboTermico} loading={savingReciboTermico}>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar recibo térmico
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'usuarios' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Gestão de Usuários</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Controle acessos e perfis da empresa</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={sincronizarFiltroEstabelecimentoECarregarUsuarios}
                      loading={loadingUsuarios}
                    >
                      Atualizar Lista
                    </Button>
                    <Button onClick={() => {
                      setNewUserForm({
                        nome: '',
                        email: '',
                        password: '',
                        role: 'vendedor',
                        cargo: '',
                        empresa_id: getEmpresaId() || '',
                        roles_extra: [],
                      });
                      setShowNewUserModal(true);
                    }}>
                      <UserPlus className="h-4 w-4 mr-2" /> Novo Usuário
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-4 border border-gray-200 dark:border-slate-800">
                    <p className="text-xs text-gray-500 dark:text-slate-400">Usuários cadastrados</p>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">{usuarios.length}</p>
                  </Card>
                  <Card className="p-4 border border-gray-200 dark:border-slate-800">
                    <p className="text-xs text-gray-500 dark:text-slate-400">Administradores</p>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">{totalAdmins}</p>
                  </Card>
                  <Card className="p-4 border border-gray-200 dark:border-slate-800">
                    <p className="text-xs text-gray-500 dark:text-slate-400">Empresa</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{empresa?.nome || user?.empresa_id || 'Não identificada'}</p>
                  </Card>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-3">
                  {grupoEmpresasList.length > 1 && (
                    <div className="flex flex-col sm:flex-row sm:items-end gap-2 w-full sm:flex-1 sm:max-w-xl">
                      <div className="w-full sm:flex-1 sm:min-w-[200px]">
                        <Select
                          label="Estabelecimento"
                          value={usuarioEmpresaFiltroPendente}
                          onChange={(e) => setUsuarioEmpresaFiltroPendente(e.target.value)}
                        >
                          <option value="">Todas (visíveis)</option>
                          {grupoEmpresasList.map((e) => (
                            <option key={e.id} value={e.id}>{e.nome}</option>
                          ))}
                        </Select>
                      </div>
                      <Button
                        type="button"
                        className="shrink-0"
                        onClick={sincronizarFiltroEstabelecimentoECarregarUsuarios}
                        disabled={
                          loadingUsuarios ||
                          (usuarioEmpresaFiltroPendente || '').trim() ===
                            (usuarioEmpresaFiltro || '').trim()
                        }
                        title="Carrega a lista de usuários do estabelecimento selecionado (ou todas)"
                      >
                        Aplicar
                      </Button>
                    </div>
                  )}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, email, perfil ou cargo..."
                      value={userSearch}
                      onChange={e => { setUserSearch(e.target.value); setUserPage(1); }}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Exibir:</span>
                    <select
                      value={userPageSize}
                      onChange={e => { setUserPageSize(Number(e.target.value)); setUserPage(1); }}
                      className="border border-gray-200 rounded-lg text-sm px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {[10, 20, 50, 100, 500, 1000, 5000].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <Card className="p-0 overflow-hidden border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Usuário</th>
                          {grupoEmpresasList.length > 1 && (
                            <th className="text-left px-4 py-3 font-semibold text-gray-600">Empresa</th>
                          )}
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Perfil</th>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Cadastro</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {loadingUsuarios ? (
                          <tr>
                            <td colSpan={grupoEmpresasList.length > 1 ? 4 : 3} className="px-4 py-8 text-center text-gray-500">Carregando usuários...</td>
                          </tr>
                        ) : paginatedUsuarios.length === 0 ? (
                          <tr>
                            <td colSpan={grupoEmpresasList.length > 1 ? 4 : 3} className="px-4 py-8 text-center text-gray-500">
                              {userSearch ? 'Nenhum usuário encontrado para a busca.' : 'Nenhum usuário encontrado para esta empresa.'}
                            </td>
                          </tr>
                        ) : (
                          paginatedUsuarios.map((u) => (
                            <tr
                              key={u.id}
                              onClick={() => setSelectedUserId(u.id)}
                              onContextMenu={(e) => { e.preventDefault(); openRowMenu(u.id, e); }}
                              className={`transition-all cursor-pointer ${selectedUserId === u.id ? 'bg-blue-50 dark:bg-blue-950/20 ring-1 ring-inset ring-blue-100 dark:ring-blue-900/50' : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}
                            >
                              <td className="px-4 py-3 relative">
                                <div className="font-medium text-gray-900 dark:text-white">{u.nome || 'Sem nome'}</div>
                                <div className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Mail className="h-3 w-3" /> {u.email}
                                </div>
                                {openMenuId === u.id && (
                                  <DropdownMenuContent
                                    isOpen={true}
                                    onClose={() => setOpenMenuId(null)}
                                    position={menuPosition}
                                  >
                                    <DropdownMenuItem onClick={() => { setOpenMenuId(null); handleOpenEditUser(u); }}>
                                      <Pencil className="h-4 w-4 mr-2" /> Editar Usuário
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setOpenMenuId(null); openResetModal(u); }}>
                                      <KeyRound className="h-4 w-4 mr-2" /> Resetar Senha
                                    </DropdownMenuItem>
                                    {(() => {
                                      const r = (u.role || '').toLowerCase();
                                      /** Só estes perfis não usam matriz granular — não exibimos "Permissões". */
                                      const ocultarPermissoes =
                                        r === 'admin' || r === 'admin_sistema' || r === 'admin_empresa';
                                      return !ocultarPermissoes;
                                    })() && (
                                      <DropdownMenuItem onClick={() => { setOpenMenuId(null); setPermissoesInitialUserId(u.id); irParaAba('permissoes'); }}>
                                        <Lock className="h-4 w-4 mr-2" /> Permissões
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                )}
                              </td>
                              {grupoEmpresasList.length > 1 && (
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300 max-w-[160px] truncate" title={u.empresa_nome}>
                                  {u.empresa_nome || '—'}
                                </td>
                              )}
                              <td className="px-4 py-3">
                                {podeGerenciarUsuarios ? (
                                  <div className="space-y-1">
                                    <Select
                                      value={u.role || 'vendedor'}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        void updateUserRole(u.id, e.target.value, u.role, u.roles_extra);
                                      }}
                                      disabled={savingRoleUserId === u.id}
                                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                    >
                                      {roleOptions.map((role) => (
                                        <option key={role.value} value={role.value}>
                                          {role.label}
                                        </option>
                                      ))}
                                    </Select>
                                    {u.roles_extra && u.roles_extra.length > 0 && (
                                      <p className="text-xs text-gray-500 dark:text-slate-400" title={labelRolesExtras(u.roles_extra, ROLE_OPTIONS)}>
                                        + {labelRolesExtras(u.roles_extra, ROLE_OPTIONS)}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-700">
                                    {labelPerfilUsuario(u.role, u.roles_extra)}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '-'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50/50">
                    <span className="text-xs text-gray-500">
                      {filteredUsuarios.length} resultado{filteredUsuarios.length !== 1 ? 's' : ''}
                      {userSearch ? ' para a busca' : ''}
                      {' — Página {0} de {1}'.replace('{0}', String(userPage)).replace('{1}', String(totalPages))}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={userPage <= 1}
                        onClick={() => setUserPage(1)}
                        className="px-2 py-1 text-xs rounded border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-100 transition"
                      >
                        {'<<'}
                      </button>
                      <button
                        disabled={userPage <= 1}
                        onClick={() => setUserPage(p => Math.max(1, p - 1))}
                        className="px-2 py-1 text-xs rounded border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-100 transition"
                      >
                        {'<'}
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let page: number;
                        if (totalPages <= 5) {
                          page = i + 1;
                        } else if (userPage <= 3) {
                          page = i + 1;
                        } else if (userPage >= totalPages - 2) {
                          page = totalPages - 4 + i;
                        } else {
                          page = userPage - 2 + i;
                        }
                        return (
                          <button
                            key={page}
                            onClick={() => setUserPage(page)}
                            className={`px-2.5 py-1 text-xs rounded border transition ${
                              userPage === page
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'border-gray-200 bg-white hover:bg-gray-100'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                      <button
                        disabled={userPage >= totalPages}
                        onClick={() => setUserPage(p => Math.min(totalPages, p + 1))}
                        className="px-2 py-1 text-xs rounded border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-100 transition"
                      >
                        {'>'}
                      </button>
                      <button
                        disabled={userPage >= totalPages}
                        onClick={() => setUserPage(totalPages)}
                        className="px-2 py-1 text-xs rounded border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-100 transition"
                      >
                        {'>>'}
                      </button>
                    </div>
                  </div>
                </Card>

                {/* Modal de Novo Usuário */}
                {showNewUserModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md shadow-2xl overflow-hidden p-0 border dark:border-slate-800">
                      <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/50">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <UserPlus className="h-5 w-5 text-blue-600" />
                          Novo Usuário
                        </h3>
                        <button onClick={() => setShowNewUserModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors">
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                        <Input
                          label="Nome Completo *"
                          required
                          value={newUserForm.nome}
                          onChange={(e) => setNewUserForm({ ...newUserForm, nome: e.target.value })}
                          placeholder="Ex: João Silva"
                        />
                        <Input
                          label="E-mail Corporativo *"
                          type="email"
                          required
                          value={newUserForm.email}
                          onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                          placeholder="joao@empresa.com"
                        />
                        <div className="relative">
                          <Input
                            label="Senha Temporária *"
                            type={showNewUserPassword ? "text" : "password"}
                            required
                            value={newUserForm.password}
                            onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                            placeholder="Mínimo 6 caracteres"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                            className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                          >
                            {showNewUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <Select
                          label="Cargo da Pessoa *"
                          value={newUserForm.cargo}
                          onChange={(e) => {
                            const cargo = e.target.value;
                            setNewUserForm({
                              ...newUserForm,
                              cargo,
                              role: cargo,
                              roles_extra: normalizarRolesExtra(cargo, newUserForm.roles_extra),
                            });
                          }}
                        >
                          <option value="">Selecione o cargo</option>
                          {roleOptions.filter((role) => role.value !== 'admin_sistema').map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </Select>

                        <FuncoesAdicionaisField
                          primaryRole={newUserForm.cargo}
                          value={newUserForm.roles_extra}
                          onChange={(roles_extra) => setNewUserForm({ ...newUserForm, roles_extra })}
                        />

                        {grupoEmpresasList.length > 1 && (
                          <Select
                            label="Empresa do usuário *"
                            value={newUserForm.empresa_id}
                            onChange={(e) => setNewUserForm({ ...newUserForm, empresa_id: e.target.value })}
                          >
                            {grupoEmpresasList.map((e) => (
                              <option key={e.id} value={e.id}>{e.nome}</option>
                            ))}
                          </Select>
                        )}

                        <div className="pt-4 flex gap-3">
                          <Button 
                            type="button" 
                            variant="outline" 
                            className="flex-1" 
                            onClick={() => setShowNewUserModal(false)}
                            disabled={creatingUser}
                          >
                            Cancelar
                          </Button>
                          <Button 
                            type="submit" 
                            className="flex-1" 
                            loading={creatingUser}
                          >
                            Criar Usuário
                          </Button>
                        </div>
                      </form>
                    </Card>
                  </div>
                )}
                {/* Modal de Editar Usuário */}
                {editingUser && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                    <Card className="w-full max-w-3xl shadow-2xl overflow-hidden p-0 border dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                      
                      {/* Header */}
                      <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/50 dark:from-slate-900/50 dark:via-slate-950 dark:to-indigo-950/20">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Pencil className="h-5 w-5 text-blue-600" />
                            Editar Usuário
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                            Ajuste os dados cadastrais, cargo principal e status de acesso deste usuário.
                          </p>
                        </div>
                        <button 
                          onClick={() => setEditingUser(null)} 
                          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      {/* Tabs Navigation */}
                      <div className="px-6 py-2 bg-gray-50/80 dark:bg-slate-900/80 border-b dark:border-slate-800 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditUserModalTab('cadastro')}
                          className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                            editUserModalTab === 'cadastro'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          Dados do Usuário
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditUserModalTab('permissoes')}
                          className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${
                            editUserModalTab === 'permissoes'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Shield className="h-3.5 w-3.5" />
                          Permissões do Cargo
                        </button>
                      </div>

                      {/* Content */}
                      <div className="p-6 space-y-6">
                        
                        {editUserModalTab === 'cadastro' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-200">
                            {/* Coluna 1: Informações Pessoais */}
                            <div className="space-y-4">
                              <div className="border-b dark:border-slate-800 pb-2">
                                <h4 className="text-sm font-bold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                                  <User className="h-4 w-4 text-blue-600" />
                                  Informações Pessoais
                                </h4>
                              </div>

                              <Input
                                label="Nome Completo *"
                                value={editUserForm.nome}
                                onChange={(e) => setEditUserForm({ ...editUserForm, nome: e.target.value })}
                                placeholder="Nome completo do usuário"
                              />

                              <div className="relative">
                                <Input
                                  label="E-mail (Login)"
                                  value={editUserForm.email}
                                  disabled
                                  className="pr-10 bg-gray-100/50 dark:bg-slate-900/50 border-dashed cursor-not-allowed"
                                  helperText="O e-mail de login é único e não pode ser alterado."
                                />
                                <div className="absolute right-3 top-[34px] text-gray-400 dark:text-slate-600">
                                  <Lock className="h-4 w-4" />
                                </div>
                              </div>

                              <Input
                                label="Telefone"
                                value={editUserForm.telefone}
                                onChange={(e) => setEditUserForm({ ...editUserForm, telefone: e.target.value })}
                                placeholder="(00) 00000-0000"
                              />

                              {usuarioVeVisaoCompletaGrupo(user?.role) && grupoEmpresasList.length > 1 && (
                                <Select
                                  label="Empresa Associada *"
                                  value={editUserForm.empresa_id}
                                  onChange={(e) => setEditUserForm({ ...editUserForm, empresa_id: e.target.value })}
                                >
                                  {grupoEmpresasList.map((e) => (
                                    <option key={e.id} value={e.id}>{e.nome}</option>
                                  ))}
                                </Select>
                              )}
                            </div>

                            {/* Coluna 2: Cargo e Acesso */}
                            <div className="space-y-4">
                              <div className="border-b dark:border-slate-800 pb-2">
                                <h4 className="text-sm font-bold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                                  <Shield className="h-4 w-4 text-indigo-600" />
                                  Cargo & Permissões
                                </h4>
                              </div>

                              <Select
                                label="Cargo da Pessoa / Perfil *"
                                value={editUserForm.role}
                                onChange={(e) => {
                                  const role = e.target.value;
                                  setEditUserForm({
                                    ...editUserForm,
                                    role,
                                    cargo: role,
                                    roles_extra: normalizarRolesExtra(role, editUserForm.roles_extra),
                                  });
                                }}
                              >
                                {roleOptions.map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </Select>

                              <FuncoesAdicionaisField
                                primaryRole={editUserForm.role}
                                value={editUserForm.roles_extra}
                                onChange={(roles_extra) => setEditUserForm({ ...editUserForm, roles_extra })}
                              />

                              <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border dark:border-slate-800 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="space-y-0.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider">Status do Usuário</label>
                                    <p className="text-[11px] text-gray-400 dark:text-slate-500">
                                      Usuários inativos são bloqueados no login.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setEditUserForm({
                                        ...editUserForm,
                                        ativo: !editUserForm.ativo,
                                        motivo_inativacao: editUserForm.ativo ? 'normal' : editUserForm.motivo_inativacao,
                                      })}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent/20 ${editUserForm.ativo ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-700'}`}
                                    >
                                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editUserForm.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                    <span className={`text-xs font-bold uppercase tracking-wider ${editUserForm.ativo ? 'text-emerald-600' : 'text-gray-500'}`}>
                                      {editUserForm.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                  </div>
                                </div>

                                {!editUserForm.ativo && (
                                  <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-slate-800">
                                    <Select
                                      label="Motivo da desativação"
                                      value={editUserForm.motivo_inativacao}
                                      onChange={(e) => setEditUserForm({
                                        ...editUserForm,
                                        motivo_inativacao: e.target.value as MotivoInativacao,
                                      })}
                                    >
                                      {MOTIVOS_INATIVACAO.map((m) => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                      ))}
                                    </Select>
                                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                                      Aviso no login: &quot;{labelMotivoInativacao(editUserForm.motivo_inativacao)}&quot;
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {editUserModalTab === 'permissoes' && (
                          <div className="space-y-4 animate-in fade-in duration-200">
                            
                            {/* Search and context banner */}
                            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-blue-50/50 dark:bg-slate-900/50 p-4 rounded-xl border border-blue-100/50 dark:border-slate-800">
                              <div className="space-y-0.5">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                  <Shield className="h-4 w-4 text-blue-600" />
                                  Permissões Efetivas no Sistema
                                </h4>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                  Rotinas efetivas conforme a matriz salva do usuário (cargo não sobrescreve o que foi desativado aqui).
                                </p>
                              </div>
                              <div className="w-full sm:w-64">
                                <Input
                                  placeholder="Buscar rotina ou módulo..."
                                  value={permSearchQuery}
                                  onChange={(e) => setPermSearchQuery(e.target.value)}
                                  className="h-9 px-3"
                                />
                              </div>
                            </div>

                            {/* Scrollable list of modules and sub-routines */}
                            <div className="max-h-[360px] overflow-y-auto space-y-3 pr-1">
                              {(() => {
                                const permsEfetivas = resolverPermissoesUsuarioParaSessao(
                                  editUserForm.role,
                                  editingUser.permissoes as Record<string, unknown> | undefined,
                                  editUserForm.roles_extra
                                ) as Record<string, Record<string, boolean>>;

                                const term = permSearchQuery.trim().toLowerCase();

                                const filteredModules = MODULES.map(mod => {
                                  const filteredRotinas = mod.rotinas.filter(rot => {
                                    const matchSearch = rot.nome.toLowerCase().includes(term) || mod.label.toLowerCase().includes(term);
                                    return matchSearch;
                                  });

                                  return { ...mod, rotinas: filteredRotinas };
                                }).filter(mod => mod.rotinas.length > 0);

                                if (filteredModules.length === 0) {
                                  return (
                                    <div className="text-center py-12 text-gray-400 dark:text-slate-500 italic text-sm">
                                      Nenhuma permissão ou rotina correspondente encontrada.
                                    </div>
                                  );
                                }

                                return filteredModules.map(mod => (
                                  <div key={mod.id} className="border border-gray-150 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950">
                                    {/* Module Header */}
                                    <div className="bg-gray-50 dark:bg-slate-900/50 px-4 py-2.5 border-b dark:border-slate-800 flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">
                                          {mod.codigo}
                                        </span>
                                        <span className="text-xs font-bold text-gray-800 dark:text-slate-200">{mod.label}</span>
                                      </div>
                                    </div>
                                    
                                    {/* Rotinas */}
                                    <div className="divide-y divide-gray-100 dark:divide-slate-900">
                                      {mod.rotinas.map(rot => {
                                        const rotPerms = permsEfetivas[rot.id] || {};
                                        
                                        // A rotina está liberada de alguma forma?
                                        const temMasterLiberado = rot.acoes.some(a => a.id === 'liberado');
                                        const isLiberado = temMasterLiberado ? !!rotPerms.liberado : Object.values(rotPerms).some(Boolean);
                                        
                                        const allowedActions = rot.acoes.filter(a => a.id !== 'liberado' && !!rotPerms[a.id]);

                                        return (
                                          <div key={rot.id} className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${
                                            isLiberado 
                                              ? 'bg-emerald-50/10 dark:bg-emerald-950/5' 
                                              : 'bg-gray-50/20 opacity-55'
                                          }`}>
                                            <div className="space-y-0.5">
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-mono text-gray-400 dark:text-slate-600">{rot.numero}</span>
                                                <span className={`text-xs font-semibold ${
                                                  isLiberado 
                                                    ? 'text-gray-900 dark:text-white' 
                                                    : 'text-gray-400 dark:text-slate-500 line-through'
                                                }`}>
                                                  {rot.nome}
                                                </span>
                                              </div>
                                            </div>

                                            <div className="flex flex-wrap gap-1">
                                              {!isLiberado ? (
                                                <span className="text-[10px] text-gray-400 dark:text-slate-500 italic">Sem acesso</span>
                                              ) : allowedActions.length === 0 ? (
                                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-0.5 rounded-full">
                                                  Acesso Completo
                                                </span>
                                              ) : (
                                                allowedActions.map(act => (
                                                  <span 
                                                    key={act.id} 
                                                    className="text-[9px] font-bold uppercase tracking-tight bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-900/30"
                                                  >
                                                    {act.label}
                                                  </span>
                                                ))
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Footer (Ações) - Sempre visível */}
                        <div className="pt-4 border-t dark:border-slate-800 flex gap-3 justify-end">
                          <Button variant="outline" className="px-6" onClick={() => setEditingUser(null)} disabled={savingEditUser}>
                            Cancelar
                          </Button>
                          <Button className="px-6" onClick={handleSaveEditUser} loading={savingEditUser}>
                            <Save className="h-4 w-4 mr-1.5" /> Salvar Alterações
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {/* Modal de Resetar Senha */}
                {resetModalUser && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md shadow-2xl overflow-hidden p-0">
                      <div className="p-6 border-b flex justify-between items-center bg-gradient-to-r from-amber-50 to-orange-50">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                            <KeyRound className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">Redefinir Senha</h3>
                            <p className="text-xs text-gray-500">{resetModalUser.nome || resetModalUser.email}</p>
                          </div>
                        </div>
                        <button onClick={() => setResetModalUser(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="p-6 space-y-4">
                        {resetDone ? (
                          <>
                            <div className="text-center py-2">
                              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                              </div>
                              <p className="font-semibold text-gray-900">Link gerado com sucesso!</p>
                            </div>

                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Link de redefinição de senha:</label>
                                <div className="flex gap-2">
                                  <input
                                    id="reset-link-input"
                                    type="text"
                                    readOnly
                                    value={resetLink}
                                    className="flex-1 text-xs px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-700 select-all"
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                  />
                                  <button
                                    onClick={handleCopyLink}
                                    className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                                      linkCopied
                                        ? 'bg-green-100 text-green-700 border border-green-200'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                  >
                                    {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    {linkCopied ? 'Copiado!' : 'Copiar'}
                                  </button>
                                </div>
                              </div>

                              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 space-y-1.5">
                                <p className="font-semibold flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" /> Atenção:
                                </p>
                                <p>• O link é válido por <strong>1 hora</strong> e funciona apenas <strong>uma vez</strong>.</p>
                                <p>• Envie este link para <strong>{resetModalUser.nome || resetModalUser.email}</strong> por WhatsApp ou outra forma.</p>
                                <p>• Ao abrir o link, o usuário poderá criar uma nova senha.</p>
                              </div>
                            </div>

                            <Button className="w-full" onClick={() => { setResetModalUser(null); setResetDone(false); setResetLink(''); setLinkCopied(false); }}>
                              Fechar
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
                              Será gerado um link de redefinição de senha para <strong>{resetModalUser.nome || resetModalUser.email}</strong>. Copie o link e envie por WhatsApp ou outra forma de contato.
                            </div>

                            <div className="flex gap-3 pt-2">
                              <Button variant="outline" className="flex-1" onClick={() => { setResetModalUser(null); setResetDone(false); setResetLink(''); }}>
                                Cancelar
                              </Button>
                              <Button
                                className="flex-1"
                                onClick={handleResetSenhaUsuario}
                                loading={resettingUserId === resetModalUser.id}
                              >
                                <KeyRound className="h-4 w-4 mr-2" />
                                Gerar Link de Reset
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'permissoes' && podeGerenciarUsuarios && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ConfiguracaoPermissoesGlobal initialUserId={permissoesInitialUserId ?? undefined} />
              </div>
            )}

            {activeTab === 'cargos' && podeGerenciarUsuarios && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ConfiguracaoCargos />
              </div>
            )}

            {activeTab === 'seguranca' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="pb-6 border-b">
                  <h3 className="text-xl font-bold text-gray-900">Segurança da Conta</h3>
                  <p className="text-sm text-gray-500">Mantenha sua conta protegida alterando sua senha periodicamente</p>
                </div>

                <Card className="p-6 space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <KeyRound className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Alterar Senha</p>
                      <p className="text-xs text-gray-500">Para sua segurança, insira a senha atual antes de definir uma nova</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="relative">
                      <Input
                        label="Senha Atual"
                        type={showSenhaAtual ? 'text' : 'password'}
                        placeholder="Digite sua senha atual"
                        value={senhaForm.atual}
                        onChange={(e) => setSenhaForm(prev => ({ ...prev, atual: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSenhaAtual(!showSenhaAtual)}
                        className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                      >
                        {showSenhaAtual ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        label="Nova Senha"
                        type={showSenhaNova ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres"
                        value={senhaForm.nova}
                        onChange={(e) => setSenhaForm(prev => ({ ...prev, nova: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSenhaNova(!showSenhaNova)}
                        className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                      >
                        {showSenhaNova ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Input
                      label="Confirmar Nova Senha"
                      type="password"
                      placeholder="Repita a nova senha"
                      value={senhaForm.confirmar}
                      onChange={(e) => setSenhaForm(prev => ({ ...prev, confirmar: e.target.value }))}
                    />
                    {senhaForm.nova && senhaForm.confirmar && senhaForm.nova !== senhaForm.confirmar && (
                      <p className="text-sm text-red-600">As senhas não coincidem.</p>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      onClick={handleAlterarSenha}
                      loading={savingSenha}
                      disabled={!senhaForm.atual || !senhaForm.nova || !senhaForm.confirmar || senhaForm.nova !== senhaForm.confirmar}
                    >
                      <KeyRound className="h-4 w-4 mr-2" />
                      Alterar Senha
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {activeTab === 'aparencia' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="pb-6 border-b">
                  <h3 className="text-xl font-bold text-gray-900">Personalização Visual</h3>
                  <p className="text-sm text-gray-500">Ajuste o tema e as cores do sistema conforme sua preferência</p>
                </div>

                {/* Tema */}
                <div className="space-y-4">
                  <div>
                    <Label>Tema do Sistema</Label>
                    <p className="text-xs text-gray-400 mt-0.5">Escolha entre modo claro ou escuro</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 max-w-sm">
                    <button
                      onClick={() => setPendingTema('light')}
                      className={`group p-4 rounded-xl border-2 text-left transition-all ${
                        pendingTema === 'light'
                          ? 'border-accent bg-accent/5 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="h-14 w-full rounded-lg mb-3 overflow-hidden border border-gray-100">
                        <div className="h-4 bg-white border-b border-gray-100 flex items-center px-2 gap-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                          <div className="h-1 flex-1 bg-gray-100 rounded" />
                        </div>
                        <div className="bg-gray-50 h-full p-1.5 flex gap-1">
                          <div className="w-5 bg-gray-200 rounded" />
                          <div className="flex-1 bg-white rounded border border-gray-100" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pendingTema === 'light' && (
                          <div className="h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                        <span className={`text-sm font-semibold ${pendingTema === 'light' ? 'text-accent' : 'text-gray-700'}`}>Claro</span>
                      </div>
                    </button>

                    <button
                      onClick={() => setPendingTema('dark')}
                      className={`group p-4 rounded-xl border-2 text-left transition-all ${
                        pendingTema === 'dark'
                          ? 'border-accent bg-gray-900 shadow-sm'
                          : 'border-gray-200 bg-gray-900 hover:border-gray-600'
                      }`}
                    >
                      <div className="h-14 w-full rounded-lg mb-3 overflow-hidden border border-gray-700">
                        <div className="h-4 bg-gray-800 border-b border-gray-700 flex items-center px-2 gap-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-gray-600" />
                          <div className="h-1 flex-1 bg-gray-700 rounded" />
                        </div>
                        <div className="bg-gray-900 h-full p-1.5 flex gap-1">
                          <div className="w-5 bg-gray-700 rounded" />
                          <div className="flex-1 bg-gray-800 rounded border border-gray-700" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pendingTema === 'dark' && (
                          <div className="h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                        <span className={`text-sm font-semibold ${pendingTema === 'dark' ? 'text-accent' : 'text-gray-400'}`}>Escuro</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Cor de destaque */}
                <div className="space-y-4">
                  <div>
                    <Label>Cor de Destaque</Label>
                    <p className="text-xs text-gray-400 mt-0.5">Aplicada em botões, links e elementos interativos</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {ACCENT_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        title={c.label}
                        onClick={() => setPendingAccent(c.hex)}
                        className={`relative h-10 w-10 rounded-full transition-all hover:scale-110 ${
                          pendingAccent === c.hex ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {pendingAccent === c.hex && (
                          <Check className="h-4 w-4 text-white absolute inset-0 m-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                  {/* Visualização da cor selecionada */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: pendingAccent }} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {ACCENT_COLORS.find(c => c.hex === pendingAccent)?.label || 'Personalizada'}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">{pendingAccent.toUpperCase()}</p>
                    </div>
                    {pendingAccent !== accentColor && (
                      <span className="ml-auto text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">Não aplicado</span>
                    )}
                    {pendingAccent === accentColor && tema === pendingTema && (
                      <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100">Aplicado ✓</span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="pt-2 flex justify-between items-center border-t">
                  <button
                    onClick={handleRestaurarPadrao}
                    className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
                  >
                    Restaurar padrão
                  </button>
                  <Button
                    onClick={handleAplicarAparencia}
                    disabled={pendingTema === tema && pendingAccent === accentColor}
                  >
                    <Palette className="h-4 w-4 mr-2" />
                    Aplicar Aparência
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

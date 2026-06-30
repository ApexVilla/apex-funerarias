import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Badge, Textarea, Label } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao, filtrarQueryPorEmpresaIds } from '../../lib/useEmpresaIdsOperacao';
import { 
  Users, Search, Plus, Edit2, Shield, Calendar, Phone, Mail, Award, X, DollarSign, MapPin, Briefcase, Network, ZoomIn, ZoomOut, RotateCcw, GripVertical, Move, Eye, EyeOff, SlidersHorizontal, RefreshCw
} from 'lucide-react';
import { ordenarCargosPorHierarquia } from '../../lib/userRoles';
import {
  buscarPessoaDuplicadaPorCpf,
  buscarUsuarioDuplicadoPorEmail,
  buscarUsuarioDuplicadoPorNome,
  mensagemPessoaDuplicadaCpf,
  mensagemUsuarioDuplicadoEmail,
  mensagemUsuarioDuplicadoNome,
  validarCpfColaboradorSeInformado,
} from '../../lib/colaboradorDuplicidade';
interface Colaborador {
  id: string;
  nome: string;
  email: string;
  role: string;
  telefone?: string;
  ativo: boolean;
  empresa_id: string;
  empresa_nome?: string;
  motivo_inativacao?: string;
  inativado_em?: string;
  
  // Detalhes RH (do join/merge)
  data_admissao?: string;
  salario_base?: number;
  cpf?: string;
  rg?: string;
  pis?: string;
  contato_emergencia?: string;
  endereco?: string;
  escolaridade?: string;
  observacoes?: string;
}

const DEFAULT_ROLE_OPTIONS = [
  { value: 'atendente', label: 'Atendente' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'cobrador', label: 'Cobrador' },
  { value: 'motorista', label: 'Motorista' },
  { value: 'agente_funerario', label: 'Agente Funerário' },
  { value: 'estoquista', label: 'Estoquista' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'auxiliar_servicos_gerais', label: 'Auxiliar de Serviços Gerais' },
  { value: 'rh', label: 'Recursos Humanos (RH)' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'supervisao', label: 'Supervisor' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'diretoria', label: 'Diretoria' },
  { value: 'gestao_executiva', label: 'Gestão Executiva' },
  { value: 'admin', label: 'Administrador' },
];

const escolaridadeOptions = [
  { value: 'fundamental_incompleto', label: 'Ensino Fundamental Incompleto' },
  { value: 'fundamental_completo', label: 'Ensino Fundamental Completo' },
  { value: 'medio_incompleto', label: 'Ensino Médio Incompleto' },
  { value: 'medio_completo', label: 'Ensino Médio Completo' },
  { value: 'superior_incompleto', label: 'Ensino Superior Incompleto' },
  { value: 'superior_completo', label: 'Ensino Superior Completo' },
  { value: 'pos_graduacao', label: 'Pós-graduação / Especialização' },
];

export const ColaboradoresList: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { empresaIdsFiltro, empresasDoGrupo, empresaNomePorId, aguardandoContexto } = useEmpresaIdsOperacao();

  const [roleOptions, setRoleOptions] = useState(DEFAULT_ROLE_OPTIONS);

  const carregarCargos = async () => {
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

  useEffect(() => {
    void carregarCargos();
  }, []);

  // Estados da Listagem
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [roleFilter, setRoleFilter] = useState<string>('todos');

  // Estados de Abas & Organograma
  const [activeTab, setActiveTab] = useState<'lista' | 'organograma'>('lista');
  const [organogramSearch, setOrganogramSearch] = useState('');
  const [organogramZoom, setOrganogramZoom] = useState(1);

  // Estados para movimentação no Organograma
  const [draggedColabId, setDraggedColabId] = useState<string | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingColab, setMovingColab] = useState<Colaborador | null>(null);
  const [selectedMoveLevel, setSelectedMoveLevel] = useState<string>('diretoria');
  const [organogramPositions, setOrganogramPositions] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('organogram_custom_positions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const organogramLevels = [
    { value: 'diretoria', label: 'Diretoria' },
    { value: 'gestao_executiva', label: 'Gestão Executiva' },
    { value: 'gerente', label: 'Gerentes' },
    { value: 'supervisor', label: 'Supervisores' },
    { value: 'comercial', label: 'Comercial / Vendas' },
    { value: 'operacional', label: 'Operacional / Frota' },
    { value: 'administrativo', label: 'Administrativo / RH' },
    { value: 'outros', label: 'Outros Cargos' }
  ];

  // Estados de Modais
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Colaborador | null>(null);
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [visibilitySearch, setVisibilitySearch] = useState('');

  // Formulário
  const [form, setForm] = useState({
    nome: '',
    email: '',
    password: '', // Apenas na criação
    telefone: '',
    role: 'vendedor',
    ativo: true,
    motivo_inativacao: 'normal',
    empresa_id: '',

    // RH Detalhes
    data_admissao: '',
    salario_base: '0.00',
    cpf: '',
    rg: '',
    pis: '',
    contato_emergencia: '',
    endereco: '',
    escolaridade: 'medio_completo',
    observacoes: ''
  });

  const loadData = async () => {
    if (aguardandoContexto) {
      setLoading(true);
      return;
    }
    setLoading(true);
    try {
      // 1. Carrega usuários base do banco filtrados por empresa
      let userQuery = supabase
        .from('users')
        .select('*')
        .order('nome', { ascending: true });
        
      userQuery = filtrarQueryPorEmpresaIds(userQuery, empresaIdsFiltro);
      const { data: usersData, error: usersError } = await userQuery;
      if (usersError) throw usersError;

      // 2. Carrega detalhes de RH correspondentes
      let rhQuery = supabase.from('rh_colaborador_detalhes').select('*');
      rhQuery = filtrarQueryPorEmpresaIds(rhQuery, empresaIdsFiltro);
      const { data: rhData, error: rhError } = await rhQuery;
      if (rhError) throw rhError;

      // 3. Mescla os dados em memória
      const rhMap = new Map(rhData?.map(r => [r.usuario_id, r]) || []);
      const mergedList: Colaborador[] = (usersData || []).map(u => {
        const rhDet = rhMap.get(u.id);
        return {
          ...u,
          empresa_nome: empresaNomePorId[u.empresa_id] || 'Unidade Desconhecida',
          data_admissao: rhDet?.data_admissao || '',
          salario_base: rhDet?.salario_base || 0,
          cpf: rhDet?.cpf || '',
          rg: rhDet?.rg || '',
          pis: rhDet?.pis || '',
          contato_emergencia: rhDet?.contato_emergencia || '',
          endereco: rhDet?.endereco || '',
          escolaridade: rhDet?.escolaridade || 'medio_completo',
          observacoes: rhDet?.observacoes || ''
        };
      });

      setColaboradores(mergedList);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao carregar colaboradores.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [empresaIdsFiltro.join(','), aguardandoContexto]);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedUser(null);
    setForm({
      nome: '',
      email: '',
      password: '',
      telefone: '',
      role: 'vendedor',
      ativo: true,
      motivo_inativacao: 'normal',
      empresa_id: empresaIdsFiltro[0] || empresasDoGrupo[0]?.id || '',
      data_admissao: new Date().toISOString().substring(0, 10),
      salario_base: '0.00',
      cpf: '',
      rg: '',
      pis: '',
      contato_emergencia: '',
      endereco: '',
      escolaridade: 'medio_completo',
      observacoes: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (colab: Colaborador) => {
    setIsEditing(true);
    setSelectedUser(colab);
    setForm({
      nome: colab.nome || '',
      email: colab.email || '',
      password: '', // não editada por aqui
      telefone: colab.telefone || '',
      role: colab.role || 'vendedor',
      ativo: colab.ativo !== false,
      motivo_inativacao: colab.motivo_inativacao || 'normal',
      empresa_id: colab.empresa_id || '',
      data_admissao: colab.data_admissao || '',
      salario_base: String(colab.salario_base || '0.00'),
      cpf: colab.cpf || '',
      rg: colab.rg || '',
      pis: colab.pis || '',
      contato_emergencia: colab.contato_emergencia || '',
      endereco: colab.endereco || '',
      escolaridade: colab.escolaridade || 'medio_completo',
      observacoes: colab.observacoes || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const cpfMsg = validarCpfColaboradorSeInformado(form.cpf);
    if (cpfMsg) {
      showToast(cpfMsg, 'warning');
      return;
    }

    setSaving(true);

    try {
      let userId = selectedUser?.id;
      const excluirUsuarioId = isEditing ? userId : null;

      const dupCpf = await buscarPessoaDuplicadaPorCpf({
        cpf: form.cpf,
        excluirUsuarioId,
      });
      if (dupCpf) {
        throw new Error(mensagemPessoaDuplicadaCpf(dupCpf));
      }

      const empresaSalvar = form.empresa_id?.trim();
      if (!empresaSalvar) {
        throw new Error('Selecione a unidade do colaborador.');
      }
      const empresaNome = empresaNomePorId[empresaSalvar];

      const dupNome = await buscarUsuarioDuplicadoPorNome(form.nome, empresaSalvar, excluirUsuarioId);
      if (dupNome) {
        throw new Error(mensagemUsuarioDuplicadoNome(dupNome, empresaNome));
      }

      if (!isEditing) {
        // Criação de Novo Usuário (usa RPC admin_create_user)
        if (!form.email || !form.password || !form.nome) {
          throw new Error('Nome, E-mail e Senha são obrigatórios para novos colaboradores.');
        }

        const dupEmail = await buscarUsuarioDuplicadoPorEmail(form.email, empresaSalvar);
        if (dupEmail) {
          throw new Error(mensagemUsuarioDuplicadoEmail(dupEmail, empresaNome));
        }

        const { data: newUserId, error: createError } = await supabase.rpc('admin_create_user', {
          p_email: form.email,
          p_password: form.password,
          p_nome: form.nome,
          p_role: form.role,
          p_empresa_id: form.empresa_id,
        });

        if (createError) throw createError;
        if (!newUserId) throw new Error('Não foi possível gerar ID para o novo usuário.');
        userId = newUserId;

        // Caso o telefone tenha sido preenchido, salvamos no perfil
        if (form.telefone) {
          await supabase.from('users').update({ telefone: form.telefone }).eq('id', userId);
        }
      } else {
        // Edição de Usuário Existente (usa RPC fn_atualizar_usuario_gestor)
        if (!userId) throw new Error('Colaborador não identificado.');

        const { error: updateError } = await supabase.rpc('fn_atualizar_usuario_gestor', {
          p_usuario_id: userId,
          p_nome: form.nome,
          p_telefone: form.telefone || null,
          p_role: form.role,
          p_ativo: form.ativo,
          p_empresa_id: form.empresa_id,
          p_motivo_inativacao: form.ativo ? null : form.motivo_inativacao
        });

        if (updateError) throw updateError;
      }

      // Salvar Detalhes Complementares de RH (rh_colaborador_detalhes)
      const { error: detailsError } = await supabase
        .from('rh_colaborador_detalhes')
        .upsert({
          usuario_id: userId,
          data_admissao: form.data_admissao || null,
          salario_base: parseFloat(form.salario_base) || 0,
          cpf: form.cpf || null,
          rg: form.rg || null,
          pis: form.pis || null,
          contato_emergencia: form.contato_emergencia || null,
          endereco: form.endereco || null,
          escolaridade: form.escolaridade || null,
          observacoes: form.observacoes || null,
          empresa_id: form.empresa_id,
          updated_at: new Date().toISOString()
        });

      if (detailsError) throw detailsError;

      showToast(isEditing ? 'Colaborador atualizado com sucesso.' : 'Colaborador cadastrado com sucesso.', 'success');
      setShowModal(false);
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao salvar colaborador.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filtros aplicados em memória para resposta instantânea
  const filteredColaboradores = colaboradores.filter(c => {
    const matchesSearch = 
      (c.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.cpf || '').includes(searchTerm);
    
    const matchesStatus = 
      statusFilter === 'todos' ||
      (statusFilter === 'ativos' && c.ativo !== false) ||
      (statusFilter === 'inativos' && c.ativo === false);

    const matchesRole = roleFilter === 'todos' || c.role === roleFilter;

    return matchesSearch && matchesStatus && matchesRole;
  });

  const handleDropOnLevel = (e: React.DragEvent, targetLevel: string) => {
    e.preventDefault();
    const colabId = e.dataTransfer.getData('text/plain') || draggedColabId;
    setDraggedColabId(null);
    setActiveDropZone(null);
    if (!colabId) return;

    const colab = colaboradores.find(c => c.id === colabId);
    if (!colab) return;

    const newPositions = { ...organogramPositions, [colab.id]: targetLevel };
    setOrganogramPositions(newPositions);
    localStorage.setItem('organogram_custom_positions', JSON.stringify(newPositions));

    const levelLabel = organogramLevels.find(l => l.value === targetLevel)?.label || targetLevel;
    showToast(`${colab.nome} movido para ${levelLabel} no organograma.`, 'success');
  };

  const confirmMoveCollaborator = () => {
    if (!movingColab || !selectedMoveLevel) return;

    const newPositions = { ...organogramPositions, [movingColab.id]: selectedMoveLevel };
    setOrganogramPositions(newPositions);
    localStorage.setItem('organogram_custom_positions', JSON.stringify(newPositions));

    const levelLabel = organogramLevels.find(l => l.value === selectedMoveLevel)?.label || selectedMoveLevel;
    showToast(`${movingColab.nome} movido para ${levelLabel} no organograma.`, 'success');

    setShowMoveModal(false);
    setMovingColab(null);
  };

  const toggleColabVisibility = (colab: Colaborador, isVisible: boolean) => {
    let targetLevel: string;
    if (isVisible) {
      const role = colab.role;
      if (['diretoria', 'admin', 'admin_empresa'].includes(role)) targetLevel = 'diretoria';
      else if (['gestao_executiva', 'gestao', 'gestor_executivo'].includes(role)) targetLevel = 'gestao_executiva';
      else if (['gerente', 'gestor'].includes(role)) targetLevel = 'gerente';
      else if (['supervisao'].includes(role)) targetLevel = 'supervisor';
      else if (['vendedor', 'cobrador'].includes(role)) targetLevel = 'comercial';
      else if (['atendente', 'motorista', 'agente_funerario', 'agentes_funerarios', 'estoquista'].includes(role)) targetLevel = 'operacional';
      else if (['rh', 'financeiro', 'recepcao', 'auxiliar_servicos_gerais'].includes(role)) targetLevel = 'administrativo';
      else targetLevel = 'outros';
    } else {
      targetLevel = 'oculto';
    }

    const newPositions = { ...organogramPositions, [colab.id]: targetLevel };
    setOrganogramPositions(newPositions);
    localStorage.setItem('organogram_custom_positions', JSON.stringify(newPositions));
    showToast(
      isVisible 
        ? `${colab.nome} inserido no organograma.` 
        : `${colab.nome} removido do organograma.`, 
      'info'
    );
  };

  const getLevelOfColab = (c: Colaborador) => {
    if (organogramPositions[c.id]) {
      return organogramPositions[c.id];
    }
    const role = c.role;
    // Administradores de sistema e super admins ficam ocultos por padrão
    if (['admin_sistema', 'super_admin'].includes(role)) {
      return 'oculto';
    }
    if (['diretoria', 'admin', 'admin_empresa'].includes(role)) return 'diretoria';
    if (['gestao_executiva', 'gestao', 'gestor_executivo'].includes(role)) return 'gestao_executiva';
    if (['gerente', 'gestor'].includes(role)) return 'gerente';
    if (['supervisao'].includes(role)) return 'supervisor';
    if (['vendedor', 'cobrador'].includes(role)) return 'comercial';
    if (['atendente', 'motorista', 'agente_funerario', 'agentes_funerarios', 'estoquista'].includes(role)) return 'operacional';
    if (['rh', 'financeiro', 'recepcao', 'auxiliar_servicos_gerais'].includes(role)) return 'administrativo';
    return 'outros';
  };

  const renderOrganograma = () => {
    const ativos = colaboradores.filter(c => c.ativo !== false);

    const diretoria = ativos.filter(c => getLevelOfColab(c) === 'diretoria');
    const gestaoExecutiva = ativos.filter(c => getLevelOfColab(c) === 'gestao_executiva');
    const gerentes = ativos.filter(c => getLevelOfColab(c) === 'gerente');
    const supervisores = ativos.filter(c => getLevelOfColab(c) === 'supervisor');
    const comercial = ativos.filter(c => getLevelOfColab(c) === 'comercial');
    const operacional = ativos.filter(c => getLevelOfColab(c) === 'operacional');
    const administrativo = ativos.filter(c => getLevelOfColab(c) === 'administrativo');
    const outros = ativos.filter(c => getLevelOfColab(c) === 'outros');
    const hiddenColabs = ativos.filter(c => getLevelOfColab(c) === 'oculto');

    const matchSearch = (c: Colaborador) => {
      if (!organogramSearch.trim()) return true;
      const roleLabel = roleOptions.find(o => o.value === c.role)?.label || c.role;
      return (c.nome || '').toLowerCase().includes(organogramSearch.toLowerCase()) ||
             roleLabel.toLowerCase().includes(organogramSearch.toLowerCase());
    };

    const hasActiveSearch = organogramSearch.trim().length > 0;

    const CollaboratorNode = ({ colab, compact = false }: { colab: Colaborador; compact?: boolean }) => {
      const isMatch = matchSearch(colab);
      const isHighlighted = hasActiveSearch && isMatch;
      const isDimmed = hasActiveSearch && !isMatch;

      const initials = (colab.nome || 'U')
        .split(' ')
        .slice(0, 2)
        .map(n => n.charAt(0))
        .join('')
        .toUpperCase();

      const colors = [
        'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 
        'bg-pink-500', 'bg-emerald-500', 'bg-orange-500', 'bg-sky-500'
      ];
      const colorIndex = (colab.nome || '').charCodeAt(0) % colors.length;
      const avatarColor = colors[colorIndex];

      let badgeStyle = 'bg-slate-100 text-slate-800 border-slate-200';
      const role = colab.role;
      if (['diretoria', 'admin', 'super_admin', 'admin_empresa', 'admin_sistema'].includes(role)) {
        badgeStyle = 'bg-amber-100 text-amber-800 border-amber-200';
      } else if (['gestao_executiva', 'gestao'].includes(role)) {
        badgeStyle = 'bg-rose-100 text-rose-800 border-rose-200';
      } else if (['gerente', 'gestor'].includes(role)) {
        badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
      } else if (['supervisao'].includes(role)) {
        badgeStyle = 'bg-purple-100 text-purple-800 border-purple-200';
      } else if (['vendedor', 'cobrador'].includes(role)) {
        badgeStyle = 'bg-teal-100 text-teal-800 border-teal-200';
      } else if (['atendente', 'motorista', 'agente_funerario', 'agentes_funerarios', 'estoquista'].includes(role)) {
        badgeStyle = 'bg-indigo-100 text-indigo-800 border-indigo-200';
      }

      return (
        <Card 
          draggable={true}
          onDragStart={(e) => {
            setDraggedColabId(colab.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData('text/plain', colab.id);
          }}
          onDragEnd={() => {
            setDraggedColabId(null);
            setActiveDropZone(null);
          }}
          className={`w-64 border-l-4 transition-all duration-300 cursor-grab active:cursor-grabbing hover:border-teal-400 hover:shadow-lg ${
            isHighlighted 
              ? 'ring-4 ring-teal-500 ring-offset-2 scale-105 shadow-xl border-teal-500 z-10' 
              : 'hover:shadow-md'
          } ${
            isDimmed ? 'opacity-40 scale-95' : 'opacity-100'
          }`} 
          style={{ borderLeftColor: colab.ativo ? '#0d9488' : '#94a3b8' }}
        >
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 overflow-hidden flex-1">
                <div className={`h-10 w-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-inner`}>
                  {initials}
                </div>
                <div className="overflow-hidden flex-1">
                  <h4 className="text-sm font-bold text-gray-900 truncate leading-snug">{colab.nome}</h4>
                  <div className="flex mt-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeStyle} truncate`}>
                      {roleOptions.find(o => o.value === colab.role)?.label || colab.role}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-start shrink-0 mt-1">
                <GripVertical className="h-4 w-4 text-gray-300 cursor-grab hover:text-gray-500" />
                <button 
                  onClick={() => {
                    const newPositions = { ...organogramPositions, [colab.id]: 'oculto' };
                    setOrganogramPositions(newPositions);
                    localStorage.setItem('organogram_custom_positions', JSON.stringify(newPositions));
                    showToast(`${colab.nome} removido do organograma.`, 'info');
                  }} 
                  className="text-gray-300 hover:text-red-500 rounded p-0.5 hover:bg-red-50 transition-colors cursor-pointer"
                  title="Remover do Organograma"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {!compact && (
              <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-50">
                <div className="flex items-center gap-1.5 truncate">
                  <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{colab.email}</span>
                </div>
                {colab.telefone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <span>{colab.telefone}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 truncate">
                  <Briefcase className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{colab.empresa_nome}</span>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-gray-50 flex justify-end gap-1.5">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => {
                  setMovingColab(colab);
                  setSelectedMoveLevel(getLevelOfColab(colab));
                  setShowMoveModal(true);
                }} 
                className="text-[11px] font-bold h-8 px-2 flex items-center gap-1 rounded-lg border-gray-200 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50/50 transition-all duration-200 shadow-sm"
                title="Movimentar funcionário na hierarquia"
              >
                <Move className="h-3 w-3 text-blue-600" />
                Mover
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleOpenEdit(colab)} 
                className="text-[11px] font-bold h-8 px-2.5 flex items-center gap-1 rounded-lg border-gray-200 hover:border-teal-200 hover:text-teal-600 hover:bg-teal-50/50 transition-all duration-200 shadow-sm"
              >
                <Edit2 className="h-3 w-3 text-teal-600" />
                Editar Perfil
              </Button>
            </div>
          </div>
        </Card>
      );
    };

    return (
      <div className="space-y-6">
        {/* Filtros e Zoom do Organograma */}
        <Card className="p-4 bg-gray-50/50 border border-gray-100">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou cargo no organograma..."
                className="pl-10"
                value={organogramSearch}
                onChange={(e) => setOrganogramSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {Object.keys(organogramPositions).length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setOrganogramPositions({});
                    localStorage.removeItem('organogram_custom_positions');
                    showToast("Estrutura do organograma restaurada para o padrão de cargos.", "info");
                  }} 
                  className="h-9 px-3 rounded-lg border border-gray-200 bg-white hover:border-red-200 hover:text-red-600 hover:bg-red-50/50 text-gray-500 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer text-xs font-bold mr-2"
                  title="Restaurar posições originais baseadas em cargos"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar Padrão
                </Button>
              )}
              <span className="text-xs text-gray-500 font-semibold mr-2">Zoom: {Math.round(organogramZoom * 100)}%</span>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setOrganogramZoom(prev => Math.max(0.5, prev - 0.1))} 
                className="h-9 w-9 rounded-lg border border-gray-200 bg-white hover:border-teal-200 hover:text-teal-600 hover:bg-teal-50/50 text-gray-600 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                title="Afastar"
              >
                <ZoomOut className="h-4.5 w-4.5" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setOrganogramZoom(1)} 
                className="h-9 w-9 rounded-lg border border-gray-200 bg-white hover:border-teal-200 hover:text-teal-600 hover:bg-teal-50/50 text-gray-600 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                title="Resetar Zoom"
              >
                <RotateCcw className="h-4.5 w-4.5" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setOrganogramZoom(prev => Math.min(1.5, prev + 0.1))} 
                className="h-9 w-9 rounded-lg border border-gray-200 bg-white hover:border-teal-200 hover:text-teal-600 hover:bg-teal-50/50 text-gray-600 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                title="Aproximar"
              >
                <ZoomIn className="h-4.5 w-4.5" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowVisibilityModal(true)} 
                className="h-9 px-3 rounded-lg border border-gray-200 bg-white hover:border-teal-200 hover:text-teal-600 hover:bg-teal-50/50 text-gray-600 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer text-xs font-bold"
                title="Gerenciar visibilidade dos colaboradores no organograma"
              >
                <SlidersHorizontal className="h-4 w-4 text-teal-600" />
                Painel de Exibição
              </Button>
            </div>
          </div>
        </Card>

        {/* Painel Organograma e Barra Lateral */}
        <div className="flex flex-col xl:flex-row gap-6 items-start w-full">
          
          {/* Painel Lateral: Colaboradores Fora do Organograma */}
          <Card className="w-full xl:w-80 shrink-0 p-4 border border-gray-100 bg-white space-y-4 shadow-sm self-stretch flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 shrink-0">
              <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-4 w-4 text-teal-600" />
                Fora do Organograma
              </h4>
              <Badge variant="secondary" className="text-[10px] font-bold px-2 py-0.5">
                {hiddenColabs.length}
              </Badge>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 flex-1">
              {hiddenColabs.length === 0 ? (
                <div className="text-center py-10 text-xs text-gray-400 italic">
                  Nenhum colaborador oculto.
                </div>
              ) : (
                hiddenColabs.map(c => {
                  const initials = (c.nome || 'U')
                    .split(' ')
                    .slice(0, 2)
                    .map(n => n.charAt(0))
                    .join('')
                    .toUpperCase();
                  const colors = [
                    'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 
                    'bg-pink-500', 'bg-emerald-500', 'bg-orange-500', 'bg-sky-500'
                  ];
                  const colorIndex = (c.nome || '').charCodeAt(0) % colors.length;
                  const avatarColor = colors[colorIndex];

                  return (
                    <div 
                      key={c.id}
                      draggable={true}
                      onDragStart={(e) => {
                        setDraggedColabId(c.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData('text/plain', c.id);
                      }}
                      onDragEnd={() => {
                        setDraggedColabId(null);
                        setActiveDropZone(null);
                      }}
                      className="p-3 border border-gray-100 bg-gray-50/50 hover:bg-teal-50/15 rounded-xl flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing hover:border-teal-200 transition-all duration-200 shadow-sm"
                    >
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <div className={`h-7 w-7 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-[10px] shrink-0 shadow-inner`}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-800 truncate leading-tight">{c.nome}</p>
                          <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mt-0.5 truncate">
                            {roleOptions.find(o => o.value === c.role)?.label || c.role}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setMovingColab(c);
                            setSelectedMoveLevel('diretoria');
                            setShowMoveModal(true);
                          }}
                          className="h-7 w-7 p-0 rounded-lg text-teal-600 hover:bg-teal-50 hover:border-teal-200 border-gray-200 bg-white flex items-center justify-center cursor-pointer"
                          title="Inserir no organograma"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Área do Organograma */}
          <div className="flex-1 w-full overflow-auto border border-gray-100 rounded-xl bg-slate-900/5 p-8 min-h-[500px] relative">
            <div 
              className="flex flex-col items-center origin-top transition-transform duration-200" 
              style={{ transform: `scale(${organogramZoom})` }}
            >
            {/* Nível 1: Diretoria */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setActiveDropZone('diretoria')}
              onDragLeave={() => setActiveDropZone(null)}
              onDrop={(e) => handleDropOnLevel(e, 'diretoria')}
              className={`transition-all duration-300 rounded-2xl p-4 flex flex-col items-center min-w-[300px] ${
                draggedColabId ? 'border-2 border-dashed' : 'border border-transparent'
              } ${
                activeDropZone === 'diretoria' 
                  ? 'border-teal-500 bg-teal-500/10 shadow-lg scale-[1.02]' 
                  : draggedColabId 
                    ? 'border-teal-200 bg-teal-50/5' 
                    : ''
              }`}
            >
              <span className="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100 uppercase tracking-wider mb-3">Diretoria</span>
              {diretoria.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-6">
                  {diretoria.map(c => <CollaboratorNode key={c.id} colab={c} />)}
                </div>
              ) : (
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg text-teal-800 text-xs font-bold w-64 text-center">
                  Nenhum colaborador na Diretoria
                </div>
              )}
            </div>

            <div className="w-0.5 h-6 bg-teal-500/30 my-1"></div>

            {/* Nível 2: Gestão Executiva */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setActiveDropZone('gestao_executiva')}
              onDragLeave={() => setActiveDropZone(null)}
              onDrop={(e) => handleDropOnLevel(e, 'gestao_executiva')}
              className={`transition-all duration-300 rounded-2xl p-4 flex flex-col items-center min-w-[300px] ${
                draggedColabId ? 'border-2 border-dashed' : 'border border-transparent'
              } ${
                activeDropZone === 'gestao_executiva' 
                  ? 'border-teal-500 bg-teal-500/10 shadow-lg scale-[1.02]' 
                  : draggedColabId 
                    ? 'border-teal-200 bg-teal-50/5' 
                    : ''
              }`}
            >
              <span className="text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 uppercase tracking-wider mb-3">Gestão Executiva</span>
              {gestaoExecutiva.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-6">
                  {gestaoExecutiva.map(c => <CollaboratorNode key={c.id} colab={c} />)}
                </div>
              ) : (
                <div className="p-3 border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs italic text-center w-64 bg-gray-50/20">
                  Solte aqui para mover para Gestão Executiva
                </div>
              )}
            </div>

            <div className="w-0.5 h-6 bg-teal-500/30 my-1"></div>

            {/* Nível 3: Gerentes */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setActiveDropZone('gerente')}
              onDragLeave={() => setActiveDropZone(null)}
              onDrop={(e) => handleDropOnLevel(e, 'gerente')}
              className={`transition-all duration-300 rounded-2xl p-4 flex flex-col items-center min-w-[300px] ${
                draggedColabId ? 'border-2 border-dashed' : 'border border-transparent'
              } ${
                activeDropZone === 'gerente' 
                  ? 'border-teal-500 bg-teal-500/10 shadow-lg scale-[1.02]' 
                  : draggedColabId 
                    ? 'border-teal-200 bg-teal-50/5' 
                    : ''
              }`}
            >
              <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 uppercase tracking-wider mb-3">Gerentes</span>
              {gerentes.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-6">
                  {gerentes.map(c => <CollaboratorNode key={c.id} colab={c} />)}
                </div>
              ) : (
                <div className="p-3 border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs italic text-center w-64 bg-gray-50/20">
                  Solte aqui para mover para Gerente
                </div>
              )}
            </div>

            <div className="w-0.5 h-6 bg-teal-500/30 my-1"></div>

            {/* Nível 4: Supervisores */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setActiveDropZone('supervisor')}
              onDragLeave={() => setActiveDropZone(null)}
              onDrop={(e) => handleDropOnLevel(e, 'supervisor')}
              className={`transition-all duration-300 rounded-2xl p-4 flex flex-col items-center min-w-[300px] ${
                draggedColabId ? 'border-2 border-dashed' : 'border border-transparent'
              } ${
                activeDropZone === 'supervisor' 
                  ? 'border-teal-500 bg-teal-500/10 shadow-lg scale-[1.02]' 
                  : draggedColabId 
                    ? 'border-teal-200 bg-teal-50/5' 
                    : ''
              }`}
            >
              <span className="text-[10px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 uppercase tracking-wider mb-3">Supervisores</span>
              {supervisores.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-6">
                  {supervisores.map(c => <CollaboratorNode key={c.id} colab={c} />)}
                </div>
              ) : (
                <div className="p-3 border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs italic text-center w-64 bg-gray-50/20">
                  Solte aqui para mover para Supervisor
                </div>
              )}
            </div>

            {/* Linhas Conectoras do Staff */}
            <div className="flex flex-col items-center w-full max-w-7xl mt-4">
              <div className="h-0.5 bg-teal-500/30 w-3/4"></div>
              <div className="flex w-full justify-between gap-6 px-8 mt-1">
                <div className="w-0.5 h-4 bg-teal-500/30 mx-auto"></div>
                <div className="w-0.5 h-4 bg-teal-500/30 mx-auto"></div>
                <div className="w-0.5 h-4 bg-teal-500/30 mx-auto"></div>
                {(outros.length > 0 || draggedColabId) && <div className="w-0.5 h-4 bg-teal-500/30 mx-auto"></div>}
              </div>
            </div>

            {/* Colunas de Staff */}
            <div className="flex flex-col lg:flex-row w-full max-w-7xl justify-center items-start gap-8 mt-2">
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setActiveDropZone('comercial')}
                onDragLeave={() => setActiveDropZone(null)}
                onDrop={(e) => handleDropOnLevel(e, 'comercial')}
                className={`flex-1 min-w-[280px] flex flex-col items-center border rounded-2xl p-6 transition-all duration-300 ${
                  activeDropZone === 'comercial'
                    ? 'border-teal-500 bg-teal-50/20 shadow-md scale-[1.01]'
                    : draggedColabId
                      ? 'border-dashed border-teal-200 bg-teal-50/5'
                      : 'border-teal-100 bg-teal-50/15 shadow-sm'
                }`}
              >
                <h4 className="text-xs font-extrabold text-teal-800 uppercase tracking-widest mb-6 px-4 py-1.5 bg-teal-50 rounded-full border border-teal-200/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
                  Comercial / Vendas
                </h4>
                <div className="flex flex-col gap-4 w-full items-center">
                  {comercial.length > 0 ? (
                    comercial.map(c => <CollaboratorNode key={c.id} colab={c} compact />)
                  ) : (
                    <span className="text-xs text-gray-400 italic py-4">Solte aqui para Comercial / Vendas</span>
                  )}
                </div>
              </div>

              <div 
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setActiveDropZone('operacional')}
                onDragLeave={() => setActiveDropZone(null)}
                onDrop={(e) => handleDropOnLevel(e, 'operacional')}
                className={`flex-1 min-w-[280px] flex flex-col items-center border rounded-2xl p-6 transition-all duration-300 ${
                  activeDropZone === 'operacional'
                    ? 'border-indigo-500 bg-indigo-50/20 shadow-md scale-[1.01]'
                    : draggedColabId
                      ? 'border-dashed border-indigo-200 bg-indigo-50/5'
                      : 'border-indigo-100 bg-indigo-50/15 shadow-sm'
                }`}
              >
                <h4 className="text-xs font-extrabold text-indigo-800 uppercase tracking-widest mb-6 px-4 py-1.5 bg-indigo-50 rounded-full border border-indigo-200/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
                  Operacional / Frota
                </h4>
                <div className="flex flex-col gap-4 w-full items-center">
                  {operacional.length > 0 ? (
                    operacional.map(c => <CollaboratorNode key={c.id} colab={c} compact />)
                  ) : (
                    <span className="text-xs text-gray-400 italic py-4">Solte aqui para Operacional / Frota</span>
                  )}
                </div>
              </div>

              <div 
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setActiveDropZone('administrativo')}
                onDragLeave={() => setActiveDropZone(null)}
                onDrop={(e) => handleDropOnLevel(e, 'administrativo')}
                className={`flex-1 min-w-[280px] flex flex-col items-center border rounded-2xl p-6 transition-all duration-300 ${
                  activeDropZone === 'administrativo'
                    ? 'border-slate-500 bg-slate-50/20 shadow-md scale-[1.01]'
                    : draggedColabId
                      ? 'border-dashed border-slate-200 bg-slate-50/5'
                      : 'border-slate-200 bg-slate-100/30 shadow-sm'
                }`}
              >
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest mb-6 px-4 py-1.5 bg-slate-100 rounded-full border border-slate-300/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
                  Administrativo / RH
                </h4>
                <div className="flex flex-col gap-4 w-full items-center">
                  {administrativo.length > 0 ? (
                    administrativo.map(c => <CollaboratorNode key={c.id} colab={c} compact />)
                  ) : (
                    <span className="text-xs text-gray-400 italic py-4">Solte aqui para Administrativo</span>
                  )}
                </div>
              </div>

              {(outros.length > 0 || draggedColabId) && (
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() => setActiveDropZone('outros')}
                  onDragLeave={() => setActiveDropZone(null)}
                  onDrop={(e) => handleDropOnLevel(e, 'outros')}
                  className={`flex-1 min-w-[280px] flex flex-col items-center border rounded-2xl p-6 transition-all duration-300 ${
                    activeDropZone === 'outros'
                      ? 'border-gray-500 bg-gray-50/20 shadow-md scale-[1.01]'
                      : draggedColabId
                        ? 'border-dashed border-gray-200 bg-gray-50/5'
                        : 'border-gray-200 bg-gray-50/20 shadow-sm'
                  }`}
                >
                  <h4 className="text-xs font-extrabold text-gray-800 uppercase tracking-widest mb-6 px-4 py-1.5 bg-gray-50 rounded-full border border-gray-300/60">
                    Outros Cargos
                  </h4>
                  <div className="flex flex-col gap-4 w-full items-center">
                    {outros.length > 0 ? (
                      outros.map(c => <CollaboratorNode key={c.id} colab={c} compact />)
                    ) : (
                      <span className="text-xs text-gray-400 italic py-4">Solte aqui para Outros Cargos</span>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div> {/* closes organogram area */}
      </div> {/* closes our new flex container */}
    </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <PageHeader 
          title="Colaboradores" 
          subtitle="Gerenciamento completo dos funcionários da funerária, detalhes de admissão e cargos"
        />
        <Button onClick={handleOpenCreate} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Novo Colaborador
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 bg-white p-1.5 gap-1.5 shadow-sm rounded-xl">
        <button
          onClick={() => setActiveTab('lista')}
          type="button"
          className={`flex-1 py-2.5 text-center text-xs font-bold transition duration-150 flex items-center justify-center gap-2 rounded-lg outline-none cursor-pointer border ${
            activeTab === 'lista'
              ? 'bg-teal-50 border-teal-200 text-teal-800 font-extrabold shadow-sm'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/70'
          }`}
        >
          <Users className="h-4.5 w-4.5" />
          Lista de Colaboradores
        </button>
        <button
          onClick={() => setActiveTab('organograma')}
          type="button"
          className={`flex-1 py-2.5 text-center text-xs font-bold transition duration-150 flex items-center justify-center gap-2 rounded-lg outline-none cursor-pointer border ${
            activeTab === 'organograma'
              ? 'bg-teal-50 border-teal-200 text-teal-800 font-extrabold shadow-sm'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/70'
          }`}
        >
          <Network className="h-4.5 w-4.5" />
          Organograma da Empresa
        </button>
      </div>

      {activeTab === 'lista' ? (
        <>
          {/* Barra de Filtros */}
          <Card className="p-4 bg-gray-50/50 border border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por nome, e-mail ou CPF..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <Select
                  value={statusFilter}
                  onChange={(e: any) => setStatusFilter(e.target.value)}
                >
                  <option value="todos">Todos os Status</option>
                  <option value="ativos">Apenas Ativos</option>
                  <option value="inativos">Apenas Inativos</option>
                </Select>
              </div>
              <div>
                <Select
                  value={roleFilter}
                  onChange={(e: any) => setRoleFilter(e.target.value)}
                >
                  <option value="todos">Todos os Cargos</option>
                  {roleOptions.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          {/* Grid de Colaboradores */}
          {loading || aguardandoContexto ? (
            <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 text-teal-600 animate-spin" />
              <span>Carregando colaboradores...</span>
            </div>
          ) : filteredColaboradores.length === 0 ? (
            <Card className="p-12 text-center text-gray-500">
              <Users className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p className="text-base font-semibold text-gray-700">Nenhum colaborador encontrado</p>
              <p className="text-sm text-gray-400 mt-1">Experimente ajustar os filtros ou cadastrar um novo funcionário.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredColaboradores.map(c => (
                <Card key={c.id} className="hover:shadow-md transition-shadow duration-200 border-l-4" style={{ borderLeftColor: c.ativo ? '#0d9488' : '#94a3b8' }}>
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                          {c.nome}
                          {!c.ativo && <Badge variant="danger">Inativo</Badge>}
                          {c.ativo && <Badge variant="success">Ativo</Badge>}
                        </h3>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                          <Award className="h-3 w-3 text-teal-600" />
                          {roleOptions.find(o => o.value === c.role)?.label || c.role}
                        </p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleOpenEdit(c)} 
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 h-8 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 hover:text-teal-600 hover:border-teal-200 shadow-sm shrink-0"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-teal-600" />
                        Editar
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span>{c.telefone || 'Sem telefone'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{c.empresa_nome}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span>Admissão: {c.data_admissao ? new Date(c.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não cadastrada'}</span>
                      </div>
                    </div>

                    {/* Detalhes Complementares */}
                    <div className="pt-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-gray-500">
                      {c.cpf && <span><strong>CPF:</strong> {c.cpf}</span>}
                      {c.rg && <span><strong>RG:</strong> {c.rg}</span>}
                      {c.salario_base !== undefined && (
                        <span><strong>Salário:</strong> {c.salario_base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        renderOrganograma()
      )}

      {/* Modal de Cadastro/Edição */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-teal-600" />
                {isEditing ? 'Editar Colaborador' : 'Novo Colaborador'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Seção 1: Dados de Acesso */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider border-b border-teal-50 pb-1 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Dados do Usuário & Acesso
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Nome Completo"
                    required
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                  <Input
                    label="E-mail de Login"
                    type="email"
                    required
                    disabled={isEditing}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  {!isEditing && (
                    <Input
                      label="Senha Inicial"
                      type="password"
                      required
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  )}
                  <Input
                    label="Telefone"
                    placeholder="(99) 99999-9999"
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                  <Select
                    label="Cargo / Nível de Acesso"
                    value={form.role}
                    onChange={(e: any) => setForm({ ...form, role: e.target.value })}
                  >
                    {roleOptions.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </Select>
                  <Select
                    label="Unidade / Empresa"
                    value={form.empresa_id}
                    onChange={(e: any) => setForm({ ...form, empresa_id: e.target.value })}
                  >
                    {empresasDoGrupo.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nome}</option>
                    ))}
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 pt-6">
                    <input
                      type="checkbox"
                      id="ativo-chk"
                      className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4 border-gray-300"
                      checked={form.ativo}
                      onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                    />
                    <label htmlFor="ativo-chk" className="text-sm font-semibold text-gray-700 select-none">
                      Colaborador Ativo no Sistema
                    </label>
                  </div>
                  {!form.ativo && (
                    <Select
                      label="Motivo de Inativação"
                      value={form.motivo_inativacao}
                      onChange={(e: any) => setForm({ ...form, motivo_inativacao: e.target.value })}
                    >
                      <option value="ferias">Férias</option>
                      <option value="desligamento">Desligamento / Demissão</option>
                      <option value="acidente">Acidente de Trabalho</option>
                      <option value="doenca">Licença Médica / Doença</option>
                      <option value="normal">Inativo Outros</option>
                    </Select>
                  )}
                </div>
              </div>

              {/* Seção 2: Detalhes do Colaborador (RH) */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold text-teal-700 uppercase tracking-wider border-b border-teal-50 pb-1 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  Informações de Contrato & RH
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Data de Admissão"
                    type="date"
                    value={form.data_admissao}
                    onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
                  />
                  <Input
                    label="Salário Base (R$)"
                    type="number"
                    step="0.01"
                    value={form.salario_base}
                    onChange={(e) => setForm({ ...form, salario_base: e.target.value })}
                  />
                  <Select
                    label="Escolaridade"
                    value={form.escolaridade}
                    onChange={(e: any) => setForm({ ...form, escolaridade: e.target.value })}
                  >
                    {escolaridadeOptions.map(esc => (
                      <option key={esc.value} value={esc.value}>{esc.label}</option>
                    ))}
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="CPF"
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  />
                  <Input
                    label="RG"
                    placeholder="SSP/UF"
                    value={form.rg}
                    onChange={(e) => setForm({ ...form, rg: e.target.value })}
                  />
                  <Input
                    label="PIS / PASEP"
                    placeholder="000.00000.00-0"
                    value={form.pis}
                    onChange={(e) => setForm({ ...form, pis: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Contato de Emergência"
                    placeholder="Nome e telefone do contato"
                    value={form.contato_emergencia}
                    onChange={(e) => setForm({ ...form, contato_emergencia: e.target.value })}
                  />
                  <Input
                    label="Endereço Completo"
                    placeholder="Rua, número, bairro, cidade, CEP"
                    value={form.endereco}
                    onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  />
                </div>

                <Textarea
                  label="Observações Adicionais"
                  placeholder="Informações relevantes sobre o histórico, perfil ou detalhes de admissão..."
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                />
              </div>

              {/* Botões do Modal */}
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 shrink-0">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {isEditing ? 'Salvar Alterações' : 'Cadastrar Colaborador'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal de Movimentação no Organograma */}
      {showMoveModal && movingColab && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-white shadow-2xl border border-gray-100 rounded-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Network className="h-5 w-5 text-teal-600 animate-pulse" />
                Movimentar no Organograma
              </h3>
              <button 
                onClick={() => {
                  setShowMoveModal(false);
                  setMovingColab(null);
                }} 
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-teal-50/40 border border-teal-100 rounded-xl space-y-2">
                <p className="text-xs text-teal-800 font-semibold uppercase tracking-wider">Colaborador</p>
                <p className="text-sm font-bold text-gray-800">{movingColab.nome}</p>
                <p className="text-xs text-gray-500">
                  Cargo (Sistema): <span className="font-semibold text-gray-700">{roleOptions.find(o => o.value === movingColab.role)?.label || movingColab.role}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Posição atual: <span className="font-semibold text-teal-700 uppercase">{
                    organogramLevels.find(l => l.value === getLevelOfColab(movingColab))?.label || getLevelOfColab(movingColab)
                  }</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <Select
                  label="Selecione a Nova Posição/Nível"
                  value={selectedMoveLevel}
                  onChange={(e) => setSelectedMoveLevel(e.target.value)}
                  className="w-full text-sm rounded-xl border-gray-200"
                >
                  {organogramLevels.map(l => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowMoveModal(false);
                  setMovingColab(null);
                }}
                className="h-9 px-4 text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button 
                type="button" 
                onClick={confirmMoveCollaborator} 
                className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-teal-100"
              >
                <Move className="h-3.5 w-3.5" />
                Confirmar Movimentação
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Gerenciamento de Exibição no Organograma */}
      {showVisibilityModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-xl bg-white shadow-2xl border border-gray-100 rounded-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-teal-600" />
                Painel de Exibição do Organograma
              </h3>
              <button 
                onClick={() => {
                  setShowVisibilityModal(false);
                  setVisibilitySearch('');
                }} 
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Campo de Pesquisa */}
            <div className="p-4 border-b border-gray-50 shrink-0 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar colaborador por nome ou cargo..."
                  className="pl-9 h-10 text-xs rounded-xl border-gray-200"
                  value={visibilitySearch}
                  onChange={(e) => setVisibilitySearch(e.target.value)}
                />
              </div>
            </div>

            {/* Lista de Colaboradores */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[250px]">
              {colaboradores.filter(c => c.ativo !== false).filter(c => {
                if (!visibilitySearch.trim()) return true;
                const roleLabel = roleOptions.find(o => o.value === c.role)?.label || c.role;
                return (c.nome || '').toLowerCase().includes(visibilitySearch.toLowerCase()) ||
                       roleLabel.toLowerCase().includes(visibilitySearch.toLowerCase());
              }).length === 0 ? (
                <div className="text-center py-10 text-xs text-gray-400 italic">
                  Nenhum colaborador ativo encontrado.
                </div>
              ) : (
                colaboradores.filter(c => c.ativo !== false).filter(c => {
                  if (!visibilitySearch.trim()) return true;
                  const roleLabel = roleOptions.find(o => o.value === c.role)?.label || c.role;
                  return (c.nome || '').toLowerCase().includes(visibilitySearch.toLowerCase()) ||
                         roleLabel.toLowerCase().includes(visibilitySearch.toLowerCase());
                }).map(colab => {
                  const isVisible = getLevelOfColab(colab) !== 'oculto';
                  
                  const initials = (colab.nome || 'U')
                    .split(' ')
                    .slice(0, 2)
                    .map(n => n.charAt(0))
                    .join('')
                    .toUpperCase();
                  const colors = [
                    'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 
                    'bg-pink-500', 'bg-emerald-500', 'bg-orange-500', 'bg-sky-500'
                  ];
                  const colorIndex = (colab.nome || '').charCodeAt(0) % colors.length;
                  const avatarColor = colors[colorIndex];

                  return (
                    <div 
                      key={colab.id} 
                      className="p-3 border border-gray-100 rounded-xl flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`h-8 w-8 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-[11px] shrink-0 shadow-inner`}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-800 truncate">{colab.nome}</p>
                          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mt-0.5 truncate">
                            {roleOptions.find(o => o.value === colab.role)?.label || colab.role}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isVisible ? (
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5 uppercase tracking-wider flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            No Organograma
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 uppercase tracking-wider flex items-center gap-1">
                            <EyeOff className="h-3 w-3" />
                            Fora
                          </span>
                        )}
                        
                        <button
                          onClick={() => toggleColabVisibility(colab, !isVisible)}
                          className={`h-8 px-3 rounded-lg border text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center ${
                            isVisible
                              ? 'border-red-200 text-red-600 hover:bg-red-50 bg-white'
                              : 'border-teal-200 text-teal-600 hover:bg-teal-50 bg-white'
                          }`}
                        >
                          {isVisible ? 'Ocultar' : 'Exibir'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100 shrink-0">
              <Button 
                type="button" 
                onClick={() => {
                  setShowVisibilityModal(false);
                  setVisibilitySearch('');
                }}
                className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-5 text-xs font-bold rounded-xl shadow-md"
              >
                Concluir
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

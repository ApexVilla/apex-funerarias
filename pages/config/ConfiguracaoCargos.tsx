import React, { useState, useEffect, useMemo } from 'react';
import { Briefcase, Search, Plus, Edit2, Trash2, RefreshCw, X, Check, AlertTriangle, Shield, ChevronDown, ChevronRight, User, Mail, ShieldAlert, Link2, Unlink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';
import { Button, Input, Card } from '../../components/ui/Components';
import { atualizarUsuarioGestor } from '../../lib/usuarioGestorService';
import { normalizarRolesExtra, ordenarCargosPorHierarquia, codigosCargoIguais, usuarioPossuiCargo, removerCargoAdicionalUsuario } from '../../lib/userRoles';

interface UserRole {
  codigo: string;
  nome: string;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

interface UserForGrouping {
  id: string;
  nome: string;
  email: string;
  role?: string;
  roles_extra?: string[] | null;
  ativo?: boolean;
  telefone?: string | null;
  empresa_id?: string | null;
  motivo_inativacao?: string | null;
}

export const ConfiguracaoCargos: React.FC = () => {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [users, setUsers] = useState<UserForGrouping[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  // Cargo Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const [formData, setFormData] = useState<{ codigo: string; nome: string; ativo: boolean }>({
    codigo: '',
    nome: '',
    ativo: true,
  });

  // Vincular Collaborator Modal State
  const [showVincularModal, setShowVincularModal] = useState<boolean>(false);
  const [vincularCargoCodigo, setVincularCargoCodigo] = useState<string>('');
  const [vincularForm, setVincularForm] = useState({
    usuarioId: '',
    tipo: 'principal' as 'principal' | 'adicional',
  });
  const [desvinculandoUsuarioId, setDesvinculandoUsuarioId] = useState<string | null>(null);
  const [showDesvincularPrincipalModal, setShowDesvincularPrincipalModal] = useState(false);
  const [desvincularPrincipalTarget, setDesvincularPrincipalTarget] = useState<{
    user: UserForGrouping;
    cargoCodigo: string;
  } | null>(null);
  const [novoCargoPrincipal, setNovoCargoPrincipal] = useState('');

  // Load User Roles and Users from Database
  const carregarDados = async () => {
    setLoading(true);
    try {
      // 1. Fetch Roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // 2. Fetch Users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, nome, email, role, roles_extra, ativo, telefone, empresa_id, motivo_inativacao')
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('nome', { ascending: true });

      if (usersError) throw usersError;

      const sortedRoles = ordenarCargosPorHierarquia(rolesData || []);
      setRoles(sortedRoles);
      setUsers(usersData || []);
    } catch (err: any) {
      console.error('Erro ao carregar dados do sub-módulo de cargos:', err);
      showToast(err.message || 'Erro ao carregar os dados do sistema.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Filter roles based on search
  const filteredRoles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return roles;
    return roles.filter(
      (r) =>
        r.nome.toLowerCase().includes(term) ||
        r.codigo.toLowerCase().includes(term)
    );
  }, [roles, search]);

  // Toggle expand/collapse state
  const toggleExpand = (codigo: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) {
        next.delete(codigo);
      } else {
        next.add(codigo);
      }
      return next;
    });
  };

  // Get users for a specific role code
  const obterUsuariosPorCargo = (codigo: string) => {
    return users.filter((u) => usuarioPossuiCargo(u.role, u.roles_extra, codigo));
  };

  // Get users available to be linked to a specific role code
  const obterUsuariosDisponiveisParaCargo = (codigo: string) => {
    return users.filter((u) => !usuarioPossuiCargo(u.role, u.roles_extra, codigo));
  };

  // Handle name change to auto-suggest slug/code on creation
  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nome = e.target.value;
    if (isEdit) {
      setFormData((prev) => ({ ...prev, nome }));
    } else {
      const suggestedCodigo = nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^a-z0-9\s-_]/g, '') // remove invalid chars
        .trim()
        .replace(/[\s-]+/g, '_');
      
      setFormData((prev) => ({ ...prev, nome, codigo: suggestedCodigo }));
    }
  };

  // Open creation modal
  const handleNewCargo = () => {
    setIsEdit(false);
    setFormData({
      codigo: '',
      nome: '',
      ativo: true,
    });
    setShowModal(true);
  };

  // Open edit modal
  const handleEditCargo = (role: UserRole) => {
    setIsEdit(true);
    setFormData({
      codigo: role.codigo,
      nome: role.nome,
      ativo: role.ativo,
    });
    setShowModal(true);
  };

  // Save/Update role
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim()) {
      showToast('O nome do cargo é obrigatório.', 'error');
      return;
    }
    if (!formData.codigo.trim()) {
      showToast('O código do cargo é obrigatório.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        // Update
        const { error } = await supabase
          .from('user_roles')
          .update({
            nome: formData.nome,
            ativo: formData.ativo,
            updated_at: new Date().toISOString(),
          })
          .eq('codigo', formData.codigo);

        if (error) throw error;
        showToast('Cargo atualizado com sucesso!', 'success');
      } else {
        // Create
        const exists = roles.some((r) => r.codigo === formData.codigo);
        if (exists) {
          throw new Error(`Um cargo com o código "${formData.codigo}" já existe.`);
        }

        const { error } = await supabase.from('user_roles').insert({
          codigo: formData.codigo,
          nome: formData.nome,
          ativo: formData.ativo,
        });

        if (error) throw error;
        showToast('Cargo cadastrado com sucesso!', 'success');
      }
      setShowModal(false);
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao salvar cargo:', err);
      showToast(err.message || 'Erro ao salvar cargo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle active status directly
  const handleToggleAtivo = async (e: React.MouseEvent, role: UserRole) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ ativo: !role.ativo, updated_at: new Date().toISOString() })
        .eq('codigo', role.codigo);

      if (error) throw error;
      showToast(`Cargo ${role.ativo ? 'inativado' : 'ativado'} com sucesso!`, 'success');
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao alterar status:', err);
      showToast(err.message || 'Erro ao alterar status do cargo.', 'error');
    }
  };

  // Remove role
  const handleRemoveCargo = async (e: React.MouseEvent, codigo: string) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este cargo? Usuários vinculados a este cargo podem impedir a exclusão ou ficar com inconsistências.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('codigo', codigo);

      if (error) throw error;
      showToast('Cargo excluído com sucesso!', 'success');
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao excluir cargo:', err);
      showToast(
        err.code === '23503'
          ? 'Não é possível excluir este cargo porque há usuários vinculados a ele. Recomenda-se apenas desativá-lo.'
          : err.message || 'Erro ao excluir o cargo.',
        'error'
      );
    }
  };

  // Open vinculação modal
  const handleAddUserClick = (codigo: string) => {
    setVincularCargoCodigo(codigo);
    setVincularForm({
      usuarioId: '',
      tipo: 'principal',
    });
    setShowVincularModal(true);
  };

  // Save vinculação
  const handleVincularColaborador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vincularForm.usuarioId) {
      showToast('Selecione um colaborador.', 'error');
      return;
    }

    const targetUser = users.find((u) => u.id === vincularForm.usuarioId);
    if (!targetUser) return;

    setSaving(true);
    try {
      let novaRole = targetUser.role || '';
      let novosExtras = targetUser.roles_extra ? [...targetUser.roles_extra] : [];

      if (vincularForm.tipo === 'principal') {
        novaRole = vincularCargoCodigo;
        novosExtras = novosExtras.filter((r) => r !== vincularCargoCodigo);
      } else {
        if (!novosExtras.includes(vincularCargoCodigo)) {
          novosExtras.push(vincularCargoCodigo);
        }
      }

      const rolesExtraNormalised = normalizarRolesExtra(novaRole, novosExtras);

      const { error } = await atualizarUsuarioGestor({
        usuarioId: targetUser.id,
        nome: targetUser.nome,
        telefone: targetUser.telefone || null,
        role: novaRole,
        ativo: targetUser.ativo !== false,
        empresaId: targetUser.empresa_id || null,
        motivoInativacao: targetUser.ativo === false ? (targetUser.motivo_inativacao as any) : null,
        rolesExtra: rolesExtraNormalised,
      });

      if (error) throw new Error(error);

      showToast('Colaborador vinculado ao cargo com sucesso!', 'success');
      setShowVincularModal(false);
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao vincular colaborador:', err);
      showToast(err.message || 'Erro ao vincular colaborador.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const persistirCargosUsuario = async (
    targetUser: UserForGrouping,
    novaRole: string,
    novosExtras: string[],
  ) => {
    const rolesExtraNormalised = normalizarRolesExtra(novaRole, novosExtras);
    const { error } = await atualizarUsuarioGestor({
      usuarioId: targetUser.id,
      nome: targetUser.nome,
      telefone: targetUser.telefone || null,
      role: novaRole,
      ativo: targetUser.ativo !== false,
      empresaId: targetUser.empresa_id || null,
      motivoInativacao: targetUser.ativo === false ? (targetUser.motivo_inativacao as any) : null,
      rolesExtra: rolesExtraNormalised,
    });
    if (error) throw new Error(error);
  };

  const handleDesvincularColaboradorAdicional = async (user: UserForGrouping, cargoCodigo: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o cargo adicional "${cargoCodigo}" do colaborador "${user.nome}"?`)) {
      return;
    }

    setDesvinculandoUsuarioId(user.id);
    try {
      const novosExtras = removerCargoAdicionalUsuario(user.role, user.roles_extra, cargoCodigo);
      await persistirCargosUsuario(user, user.role || 'vendedor', novosExtras);
      showToast('Cargo adicional removido com sucesso!', 'success');
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao desvincular cargo:', err);
      showToast(err.message || 'Erro ao desvincular cargo.', 'error');
    } finally {
      setDesvinculandoUsuarioId(null);
    }
  };

  const handleDesvincularColaboradorClick = (user: UserForGrouping, cargoCodigo: string) => {
    if (codigosCargoIguais(user.role, cargoCodigo)) {
      setDesvincularPrincipalTarget({ user, cargoCodigo });
      setNovoCargoPrincipal('');
      setShowDesvincularPrincipalModal(true);
      return;
    }
    void handleDesvincularColaboradorAdicional(user, cargoCodigo);
  };

  const handleConfirmarDesvincularPrincipal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desvincularPrincipalTarget) return;
    if (!novoCargoPrincipal.trim()) {
      showToast('Selecione o novo cargo principal do colaborador.', 'error');
      return;
    }
    if (codigosCargoIguais(novoCargoPrincipal, desvincularPrincipalTarget.cargoCodigo)) {
      showToast('Escolha um cargo diferente do atual.', 'error');
      return;
    }

    const { user, cargoCodigo } = desvincularPrincipalTarget;
    setSaving(true);
    try {
      const extrasAtuais = Array.isArray(user.roles_extra) ? [...user.roles_extra] : [];
      const novosExtras = extrasAtuais.filter((r) => !codigosCargoIguais(r, cargoCodigo));
      await persistirCargosUsuario(user, novoCargoPrincipal, novosExtras);
      showToast('Cargo principal alterado com sucesso!', 'success');
      setShowDesvincularPrincipalModal(false);
      setDesvincularPrincipalTarget(null);
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao alterar cargo principal:', err);
      showToast(err.message || 'Erro ao alterar cargo principal.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const currentRoleName = roles.find((r) => r.codigo === vincularCargoCodigo)?.nome || vincularCargoCodigo;
  const availableUsers = useMemo(() => {
    return obterUsuariosDisponiveisParaCargo(vincularCargoCodigo);
  }, [users, vincularCargoCodigo]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b dark:border-slate-800">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-accent" />
            Cargos de Usuário
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Visualize os cargos do sistema e veja quais colaboradores estão associados a cada um deles
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="flex items-center gap-2 h-10"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleNewCargo}
            className="flex items-center gap-2 h-10 bg-accent text-white"
          >
            <Plus className="h-4 w-4" />
            Novo Cargo
          </Button>
        </div>
      </div>

      {/* Filter and stats */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400 font-bold" />
          <Input
            placeholder="Buscar por nome ou código do cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-xs font-semibold text-gray-500 dark:text-slate-400">
          Mostrando {filteredRoles.length} de {roles.length} cargos cadastrados
        </div>
      </div>

      {/* Loading state */}
      {loading && roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <RefreshCw className="h-10 w-10 animate-spin text-accent mb-4" />
          <p>Carregando catálogo de cargos e usuários...</p>
        </div>
      ) : filteredRoles.length === 0 ? (
        <Card className="p-12 text-center text-gray-500 flex flex-col items-center justify-center border border-dashed dark:border-slate-800">
          <Briefcase className="h-12 w-12 text-gray-300 dark:text-slate-700 mb-3" />
          <h4 className="text-base font-bold text-gray-700 dark:text-slate-300">Nenhum cargo encontrado</h4>
          <p className="text-sm mt-1">Ajuste os filtros de busca ou crie um novo cargo para iniciar.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRoles.map((role) => {
            const roleUsers = obterUsuariosPorCargo(role.codigo);
            const isExpanded = expandedRoles.has(role.codigo);

            return (
              <div
                key={role.codigo}
                className="border dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm transition-all duration-200"
              >
                {/* Accordion Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 gap-4 border-b dark:border-slate-800 hover:bg-gray-50/50 dark:hover:bg-slate-850/50 transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleExpand(role.codigo)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer select-none"
                  >
                    <span className="text-gray-400 dark:text-slate-500 shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-accent" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <h4 className="text-base font-bold text-gray-900 dark:text-white truncate">
                        {role.nome}
                      </h4>
                      <span className="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 px-2 py-0.5 rounded font-mono uppercase shrink-0">
                        {role.codigo}
                      </span>
                      <span className="text-xs bg-accent/10 text-accent dark:bg-accent/20 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        {roleUsers.length} {roleUsers.length === 1 ? 'colaborador' : 'colaboradores'}
                      </span>
                    </div>
                  </button>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    {/* Status Badge */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleAtivo(e, role)}
                      className={`text-xs px-2.5 py-1 rounded-full font-bold select-none cursor-pointer border transition-colors ${
                        role.ativo
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50 hover:bg-emerald-100'
                          : 'bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      {role.ativo ? 'Ativo' : 'Inativo'}
                    </button>

                    {/* Action buttons */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditCargo(role)}
                      className="h-9 flex items-center gap-1.5 px-3 rounded-lg border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-gray-600 dark:text-slate-400 shrink-0" />
                      <span className="text-xs">Editar</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(e) => handleRemoveCargo(e, role.codigo)}
                      className="h-9 flex items-center gap-1.5 px-3 rounded-lg border-red-100 hover:border-red-200 hover:bg-red-50 dark:border-red-950/30 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <span className="text-xs">Excluir</span>
                    </Button>
                  </div>
                </div>

                {/* Accordion Content */}
                {isExpanded && (
                  <div className="bg-gray-50/30 dark:bg-slate-900/20 p-5 divide-y dark:divide-slate-800 animate-in slide-in-from-top-1 duration-200">
                    <div className="flex justify-between items-center pb-3">
                      <h5 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                        Colaboradores neste Cargo
                      </h5>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddUserClick(role.codigo)}
                        className="h-8 flex items-center gap-1.5 px-3 rounded-lg border-gray-200 dark:border-slate-800 text-accent font-semibold hover:bg-accent/5 dark:hover:bg-slate-800/40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span className="text-xs">Vincular Colaborador</span>
                      </Button>
                    </div>

                    {roleUsers.length === 0 ? (
                      <div className="py-6 text-center text-sm text-gray-400 dark:text-slate-550 flex items-center justify-center gap-2">
                        <User className="h-4 w-4" />
                        Nenhum colaborador atualmente atrelado a este cargo.
                      </div>
                    ) : (
                      <div className="overflow-x-auto pt-2">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b dark:border-slate-800 text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                              <th className="py-2.5 px-4 font-semibold">Colaborador</th>
                              <th className="py-2.5 px-4 font-semibold">E-mail</th>
                              <th className="py-2.5 px-4 font-semibold">Tipo de Cargo</th>
                              <th className="py-2.5 px-4 font-semibold text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y dark:divide-slate-800">
                            {roleUsers.map((u) => {
                              const isPrimary = codigosCargoIguais(u.role, role.codigo);
                              const desvinculando = desvinculandoUsuarioId === u.id;

                              return (
                                <tr key={u.id} className="hover:bg-gray-50/20 dark:hover:bg-slate-850/10 text-sm">
                                  <td className="py-3 px-4 flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-slate-700 dark:to-slate-800 text-gray-600 dark:text-slate-300 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                      {((u.nome || 'U')[0] || 'U')}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-gray-800 dark:text-slate-200 block">{u.nome}</span>
                                      {u.ativo === false && (
                                        <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400 px-1.5 py-0.2 rounded font-medium">Inativo no sistema</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-gray-500 dark:text-slate-400">
                                    <div className="flex items-center gap-1.5">
                                      <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                      {u.email}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    {isPrimary ? (
                                      <span className="inline-flex items-center text-xs bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900/50 font-medium">
                                        Principal
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center text-xs bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded border border-purple-100 dark:border-purple-900/50 font-medium">
                                        Adicional
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDesvincularColaboradorClick(u, role.codigo)}
                                      loading={desvinculando}
                                      title={
                                        isPrimary
                                          ? 'Alterar o cargo principal deste colaborador para removê-lo deste cargo'
                                          : 'Desvincular este cargo adicional do colaborador'
                                      }
                                      className={`h-8 flex items-center gap-1 px-2.5 ml-auto rounded-lg text-xs font-semibold border-red-100 text-red-650 hover:bg-red-50 dark:border-red-950/30 dark:hover:bg-red-950/20 hover:text-red-700`}
                                    >
                                      <Unlink className="h-3.5 w-3.5 shrink-0" />
                                      <span>{isPrimary ? 'Alterar principal' : 'Desvincular'}</span>
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal - New/Edit Cargo */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-md bg-white dark:bg-slate-900 border dark:border-slate-800">
            <div className="flex justify-between items-center px-6 py-4 border-b dark:border-slate-800 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                {isEdit ? 'Editar Cargo' : 'Novo Cargo'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Nome do Cargo
                </label>
                <Input
                  required
                  placeholder="Ex: Supervisor Operacional"
                  value={formData.nome}
                  onChange={handleNomeChange}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Código (Identificador no Banco)
                </label>
                <Input
                  required
                  disabled={isEdit}
                  placeholder="Ex: supervisor_operacional"
                  value={formData.codigo}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      codigo: e.target.value.toLowerCase().replace(/[\s-]+/g, '_'),
                    }))
                  }
                  className="w-full font-mono"
                />
                {!isEdit && (
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    O código identifica este cargo no banco e nas permissões. Ele é gerado automaticamente, mas você pode personalizá-lo (letras minúsculas e sublinhados).
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="cargo-ativo"
                  className="rounded text-accent focus:ring-accent h-4 w-4 border-gray-300 dark:border-slate-700 dark:bg-slate-800"
                  checked={formData.ativo}
                  onChange={(e) => setFormData((prev) => ({ ...prev, ativo: e.target.checked }))}
                />
                <label
                  htmlFor="cargo-ativo"
                  className="text-sm font-semibold text-gray-700 dark:text-slate-300 select-none cursor-pointer"
                >
                  Cargo Ativo
                </label>
              </div>

              {isEdit && (
                <div className="p-3.5 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-100 dark:border-yellow-900/30 rounded-xl flex gap-3 text-xs text-yellow-800 dark:text-yellow-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                  <p>
                    <strong>Atenção:</strong> Alterar as informações de um cargo existente afeta todos os usuários atualmente vinculados a ele.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  className="h-10"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  loading={saving}
                  className="bg-accent text-white h-10"
                >
                  {isEdit ? 'Salvar Alterações' : 'Cadastrar Cargo'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal - Vincular Colaborador */}
      {showVincularModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-md bg-white dark:bg-slate-900 border dark:border-slate-800">
            <div className="flex justify-between items-center px-6 py-4 border-b dark:border-slate-800 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Link2 className="h-5 w-5 text-accent" />
                Vincular ao Cargo
              </h2>
              <button
                onClick={() => setShowVincularModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleVincularColaborador} className="p-6 space-y-5">
              <div className="p-3 bg-accent/5 dark:bg-slate-800/60 border border-accent/10 dark:border-slate-700 rounded-xl">
                <span className="text-xs text-gray-500 dark:text-slate-450 uppercase block font-semibold">Cargo de Destino</span>
                <span className="font-bold text-gray-800 dark:text-slate-200 text-sm">{currentRoleName}</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 block">
                  Selecionar Colaborador
                </label>
                {availableUsers.length === 0 ? (
                  <div className="p-4 bg-gray-50 dark:bg-slate-850 text-center text-xs text-gray-500 dark:text-slate-400 rounded-xl border dark:border-slate-850">
                    Todos os colaboradores ativos já possuem este cargo associado.
                  </div>
                ) : (
                  <select
                    required
                    value={vincularForm.usuarioId}
                    onChange={(e) => setVincularForm((prev) => ({ ...prev, usuarioId: e.target.value }))}
                    className="w-full rounded-xl border border-gray-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 h-11 px-3.5 focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                  >
                    <option value="">Selecione o colaborador...</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome} ({u.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {availableUsers.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 block">
                    Modo de Associação
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex flex-col p-3 border rounded-xl cursor-pointer select-none transition-all ${
                      vincularForm.tipo === 'principal'
                        ? 'border-accent bg-accent/5 dark:bg-slate-800/40 text-accent'
                        : 'border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-55/20'
                    }`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <input
                          type="radio"
                          name="vincular_tipo"
                          checked={vincularForm.tipo === 'principal'}
                          onChange={() => setVincularForm((prev) => ({ ...prev, tipo: 'principal' }))}
                          className="text-accent focus:ring-accent"
                        />
                        <span className="text-xs font-bold uppercase tracking-wider">Principal</span>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 leading-tight">Substitui o cargo atual do usuário como primário.</span>
                    </label>

                    <label className={`flex flex-col p-3 border rounded-xl cursor-pointer select-none transition-all ${
                      vincularForm.tipo === 'adicional'
                        ? 'border-accent bg-accent/5 dark:bg-slate-800/40 text-accent'
                        : 'border-gray-200 dark:border-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-55/20'
                    }`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <input
                          type="radio"
                          name="vincular_tipo"
                          checked={vincularForm.tipo === 'adicional'}
                          onChange={() => setVincularForm((prev) => ({ ...prev, tipo: 'adicional' }))}
                          className="text-accent focus:ring-accent"
                        />
                        <span className="text-xs font-bold uppercase tracking-wider">Adicional</span>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500 leading-tight">Acrescenta como função extra, mantendo o cargo atual.</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowVincularModal(false)}
                  className="h-10"
                >
                  Cancelar
                </Button>
                {availableUsers.length > 0 && (
                  <Button
                    type="submit"
                    loading={saving}
                    className="bg-accent text-white h-10"
                  >
                    Vincular
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal - Alterar cargo principal (desvincular de cargo principal) */}
      {showDesvincularPrincipalModal && desvincularPrincipalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-md bg-white dark:bg-slate-900 border dark:border-slate-800">
            <div className="flex justify-between items-center px-6 py-4 border-b dark:border-slate-800 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Unlink className="h-5 w-5 text-accent" />
                Alterar cargo principal
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowDesvincularPrincipalModal(false);
                  setDesvincularPrincipalTarget(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmarDesvincularPrincipal} className="p-6 space-y-5">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl text-sm text-amber-900 dark:text-amber-200">
                <strong>{desvincularPrincipalTarget.user.nome}</strong> tem{' '}
                <strong>
                  {roles.find((r) => r.codigo === desvincularPrincipalTarget.cargoCodigo)?.nome
                    || desvincularPrincipalTarget.cargoCodigo}
                </strong>{' '}
                como cargo principal. Para removê-lo deste cargo, escolha um novo cargo principal.
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-slate-300 block">
                  Novo cargo principal
                </label>
                <select
                  required
                  value={novoCargoPrincipal}
                  onChange={(e) => setNovoCargoPrincipal(e.target.value)}
                  className="w-full rounded-xl border border-gray-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 h-11 px-3.5 focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                >
                  <option value="">Selecione o novo cargo...</option>
                  {roles
                    .filter((r) => r.ativo && !codigosCargoIguais(r.codigo, desvincularPrincipalTarget.cargoCodigo))
                    .map((r) => (
                      <option key={r.codigo} value={r.codigo}>
                        {r.nome}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowDesvincularPrincipalModal(false);
                    setDesvincularPrincipalTarget(null);
                  }}
                  className="h-10"
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} className="bg-accent text-white h-10">
                  Confirmar alteração
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

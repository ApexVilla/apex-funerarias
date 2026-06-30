import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Shield, ShieldAlert, ShieldCheck, Users, Search, RefreshCw,
    Save, Sparkles, Unlock, Lock,
    Info, AlertCircle,
    History, Check, Building,
    ChevronDown, ChevronRight,
    Eye, Plus, Pencil, Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';
import { Button, Input, Card } from '../../components/ui/Components';
import { MODULES, montarSnapshotCompletoPermissoes, type ModuloCatalogo, type RotinaCatalogo } from '../../lib/permissoesCatalog';
import {
  permissoesParaFormularioUsuario,
  usuarioTemPermissoesExplicitasSalvas,
} from '../../lib/permissoesResolucao';
import {
  NIVEIS_PERMISSAO_PADRAO,
  montarPermissoesNivel,
  labelNivelPermissao,
  extrairNivelPadrao,
  CHAVE_NIVEL_PADRAO,
  type NivelPermissaoId,
} from '../../lib/permissoesNiveis';
import { CHAVE_EMPRESAS_CONTEXTO, empresasContextoDefaultsParaFormulario, extrairEmpresasContexto } from '../../lib/empresasContextoUsuario';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';

// Helper function to align permission checks
function sincronizarLiberadoComSubAcoes(
  perms: Record<string, Record<string, boolean>>,
): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const k of Object.keys(perms)) {
    const row = perms[k];
    out[k] = row ? { ...row } : {};
  }
  for (const mod of MODULES) {
    for (const rot of mod.rotinas) {
      if (!rot.acoes.some((a) => a.id === 'liberado')) continue;
      const subIds = rot.acoes.filter((a) => a.id !== 'liberado').map((a) => a.id);
      if (subIds.length === 0) continue;
      const row = { ...(out[rot.id] || {}) };
      if (subIds.some((id) => row[id])) row.liberado = true;
      out[rot.id] = row;
    }
  }
  return out;
}

interface SistemaUsuario {
  id: string;
  nome: string;
  email: string;
  role: string;
  cargo: string;
  telefone?: string;
  ativo: boolean;
  empresa_id: string;
  empresa_nome?: string;
  permissoes?: any;
}

const renderAcaoIcon = (acaoId: string, isChecked: boolean) => {
    const sizeClass = "h-3.5 w-3.5 mr-1 shrink-0";
    switch (acaoId) {
        case 'liberado':
            return isChecked ? <ShieldCheck className={sizeClass} /> : <Shield className={sizeClass} />;
        case 'view':
            return <Eye className={sizeClass} />;
        case 'create':
            return <Plus className={sizeClass} />;
        case 'edit':
            return <Pencil className={sizeClass} />;
        case 'delete':
            return <Trash2 className={sizeClass} />;
        default:
            return <Check className={sizeClass} />;
    }
};

const getAcaoStyle = (acaoId: string, isChecked: boolean) => {
    if (!isChecked) {
        return 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600 hover:border-slate-300';
    }
    switch (acaoId) {
        case 'liberado':
            return 'bg-emerald-600 border-emerald-600 text-white shadow-xs font-bold';
        case 'view':
            return 'bg-blue-600 border-blue-600 text-white shadow-xs font-bold';
        case 'create':
            return 'bg-cyan-600 border-cyan-600 text-white shadow-xs font-bold';
        case 'edit':
            return 'bg-amber-600 border-amber-600 text-white shadow-xs font-bold';
        case 'delete':
            return 'bg-rose-600 border-rose-600 text-white shadow-xs font-bold';
        default:
            return 'bg-indigo-600 border-indigo-600 text-white shadow-xs font-bold';
    }
};

interface Props {
    initialUserId?: string;
}

export const ConfiguracaoPermissoesGlobal: React.FC<Props> = ({ initialUserId }) => {
    const { showToast } = useToast();
    const [usuarios, setUsuarios] = useState<SistemaUsuario[]>([]);
    const [loadingUsuarios, setLoadingUsuarios] = useState<boolean>(false);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [searchUser, setSearchUser] = useState<string>('');
    const [showDropdown, setShowDropdown] = useState<boolean>(false);
    const [searchPermission, setSearchPermission] = useState<string>('');
    const [activeSubTab, setActiveSubTab] = useState<'rotinas' | 'empresas'>('rotinas');
    const [viewRotinas, setViewRotinas] = useState<'cards' | 'tabela'>('cards');
    const [saving, setSaving] = useState<boolean>(false);
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const modulosScrollRef = useRef<HTMLDivElement>(null);
    const initialUserAppliedRef = useRef(false);
    const pendingScrollModIdRef = useRef<string | null>(null);

    // Contexto de Empresas / Estabelecimentos
    const [grupoEmpresasList, setGrupoEmpresasList] = useState<{ id: string; nome: string }[]>([]);
    const [tempEmpresasContexto, setTempEmpresasContexto] = useState<Record<string, boolean>>({});

    // Permissões temporárias em edição
    const [tempPerms, setTempPerms] = useState<Record<string, Record<string, boolean>>>({});
    const [nivelPadraoEdicao, setNivelPadraoEdicao] = useState<NivelPermissaoId | ''>('');

    // Histórico local de auditoria de alterações da sessão
    const [auditLogs, setAuditLogs] = useState<Array<{ time: string; text: string; type: 'info' | 'success' | 'warning' }>>([
        { time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), text: 'Painel global de controle de permissões inicializado.', type: 'info' }
    ]);

    const pushAuditLog = useCallback((
        text: string,
        type: 'info' | 'success' | 'warning' = 'info',
    ) => {
        const logTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setAuditLogs((logs) => [
            { time: logTime, text, type },
            ...logs.slice(0, 15),
        ]);
    }, []);

    const scrollModuloParaVisao = useCallback((modId: string) => {
        requestAnimationFrame(() => {
            modulosScrollRef.current
                ?.querySelector(`[data-mod-id="${modId}"]`)
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }, []);

    // Carregar estabelecimentos do grupo
    const loadEmpresasGrupo = async () => {
        try {
            const { data, error } = await supabase.rpc('fn_empresas_do_meu_grupo');
            if (error) throw error;
            setGrupoEmpresasList(data || []);
            return data || [];
        } catch (err) {
            console.error('Erro ao carregar unidades:', err);
            return [];
        }
    };

    // Carregar usuários
    const carregarUsuarios = async () => {
        setLoadingUsuarios(true);
        try {
            const empresas = await loadEmpresasGrupo();
            const nomePorEmpresa = new Map(empresas.map((e: any) => [e.id, e.nome]));

            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('ativo', true)
                .is('deleted_at', null)
                .order('nome', { ascending: true });

            if (error) throw error;

            const list: SistemaUsuario[] = (data || []).map((u: any) => ({
                id: u.id,
                nome: u.nome || '',
                email: u.email || '',
                role: u.role || '',
                cargo: u.cargo || '',
                telefone: u.telefone || '',
                ativo: u.ativo !== false,
                empresa_id: u.empresa_id || '',
                empresa_nome: ((u.empresa_id && nomePorEmpresa.get(u.empresa_id)) as string) || 'Sem Unidade',
                permissoes: u.permissoes || {},
            }));

            setUsuarios(list);
        } catch (err: any) {
            showToast(err.message || 'Erro ao carregar usuários do sistema.', 'error');
        } finally {
            setLoadingUsuarios(false);
        }
    };

    // Inicializa estados locais com as permissões do usuário selecionado
    const initUserPermissions = (user: SistemaUsuario, empresasList = grupoEmpresasList) => {
        const raw = (user.permissoes || {}) as Record<string, unknown>;
        const resolved = permissoesParaFormularioUsuario(raw);
        setTempPerms(sincronizarLiberadoComSubAcoes(resolved));
        setTempEmpresasContexto(
            empresasContextoDefaultsParaFormulario(
                empresasList,
                user.empresa_id || '',
                extrairEmpresasContexto(raw),
            )
        );
        const nivelSalvo = extrairNivelPadrao(raw);
        setNivelPadraoEdicao(nivelSalvo && nivelSalvo !== 'master' ? nivelSalvo : nivelSalvo === 'master' ? 'platina' : '');

        const logTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const modo = usuarioTemPermissoesExplicitasSalvas(raw) ? 'matriz salva' : 'sem matriz salva (aplique um nível)';
        setAuditLogs(prev => [
            { time: logTime.substring(0, 5), text: `Carregadas permissões de ${user.nome} (${modo})`, type: 'info' },
            ...prev.slice(0, 15)
        ]);
    };

    useEffect(() => {
        carregarUsuarios();
    }, []);

    // Auto-seleciona usuário quando recebido via prop (ex.: clicando em "Permissões" na lista de usuários)
    useEffect(() => {
        if (!initialUserId || !usuarios.length || initialUserAppliedRef.current) return;
        const target = usuarios.find(u => u.id === initialUserId);
        if (target) {
            handleSelectUser(target);
            initialUserAppliedRef.current = true;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialUserId, usuarios]);

    useEffect(() => {
        const modId = pendingScrollModIdRef.current;
        if (!modId || !expandedModules.has(modId)) return;
        scrollModuloParaVisao(modId);
        pendingScrollModIdRef.current = null;
    }, [expandedModules, scrollModuloParaVisao]);

    // Monitora a seleção do usuário para carregar suas permissões
    const selectedUser = useMemo(() => {
        return usuarios.find(u => u.id === selectedUserId);
    }, [usuarios, selectedUserId]);

    // Reaplica unidades quando a lista do grupo terminar de carregar (corrige corrida no 1º carregamento)
    useEffect(() => {
        if (!selectedUser || grupoEmpresasList.length === 0) return;
        setTempEmpresasContexto(
            empresasContextoDefaultsParaFormulario(
                grupoEmpresasList,
                selectedUser.empresa_id || '',
                extrairEmpresasContexto((selectedUser.permissoes || {}) as Record<string, unknown>),
            ),
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grupoEmpresasList.length, selectedUser?.id]);

    useEffect(() => {
        if (selectedUser) {
            setSearchUser(selectedUser.nome);
        } else {
            setSearchUser('');
        }
    }, [selectedUser]);

    const handleSelectUser = (user: SistemaUsuario) => {
        setSelectedUserId(user.id);
        initUserPermissions(user);
    };

    const toggleModuleExpansion = (modId: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(modId)) {
                next.delete(modId);
            } else {
                next.add(modId);
                pendingScrollModIdRef.current = modId;
            }
            return next;
        });
    };

    const isModuleEnabled = (mod: ModuloCatalogo): boolean =>
        mod.rotinas.some(r => tempPerms[r.id]?.liberado === true);

    const isModulePartial = (mod: ModuloCatalogo): boolean => {
        const n = mod.rotinas.filter(r => tempPerms[r.id]?.liberado === true).length;
        return n > 0 && n < mod.rotinas.length;
    };

    const countEnabledRotinas = (mod: ModuloCatalogo): number =>
        mod.rotinas.filter(r => r.acoes.some(a => tempPerms[r.id]?.[a.id] === true)).length;

    const handleToggleModuleAccess = (mod: ModuloCatalogo) => {
        if (!selectedUser) return;
        const turningOff = isModuleEnabled(mod);
        setTempPerms(prev => {
            const next = { ...prev };
            mod.rotinas.forEach(r => {
                if (turningOff) {
                    const cleared: Record<string, boolean> = {};
                    r.acoes.forEach(a => { cleared[a.id] = false; });
                    next[r.id] = cleared;
                } else {
                    const enabled: Record<string, boolean> = { ...(prev[r.id] || {}) };
                    r.acoes.forEach(a => {
                        if (a.id === 'liberado' || a.id === 'view') enabled[a.id] = true;
                    });
                    next[r.id] = enabled;
                }
            });
            return next;
        });
        if (!turningOff) {
            setExpandedModules((prev) => {
                const next = new Set(prev);
                next.add(mod.id);
                return next;
            });
            pendingScrollModIdRef.current = mod.id;
        }
        pushAuditLog(
            `${selectedUser.nome}: ${turningOff ? 'BLOQUEOU' : 'LIBEROU'} módulo "${mod.label}"`,
            turningOff ? 'warning' : 'success',
        );
    };

    // Filtrar usuários por nome, email ou cargo
    const filteredUsuarios = useMemo(() => {
        const term = searchUser.toLowerCase().trim();
        const nomeAtual = (selectedUser?.nome || '').toLowerCase().trim();
        const emailAtual = (selectedUser?.email || '').toLowerCase().trim();

        if (!term || term === nomeAtual || term === emailAtual) {
            return usuarios;
        }

        return usuarios.filter(u => 
            u.nome.toLowerCase().includes(term) ||
            u.email.toLowerCase().includes(term) ||
            (u.cargo || '').toLowerCase().includes(term) ||
            (u.role || '').toLowerCase().includes(term)
        );
    }, [usuarios, searchUser, selectedUser]);

    // Filtrar catálogo de módulos por busca
    const filteredModules = useMemo(() => {
        if (!searchPermission) return MODULES;
        
        return MODULES.map(mod => {
            const matchesMod = mod.label.toLowerCase().includes(searchPermission.toLowerCase());
            const matchedRotinas = mod.rotinas.filter(rot => 
                rot.nome.toLowerCase().includes(searchPermission.toLowerCase()) ||
                rot.numero.includes(searchPermission)
            );

            if (matchesMod) return mod;
            if (matchedRotinas.length > 0) {
                return {
                    ...mod,
                    rotinas: matchedRotinas
                };
            }
            return null;
        }).filter((mod): mod is ModuloCatalogo => mod !== null);
    }, [searchPermission]);

    // Alternar uma ação específica de uma rotina
    const togglePermission = (rotinaId: string, acaoId: string) => {
        if (!selectedUser) return;

        const rotinaObj = tempPerms[rotinaId] || {};
        const newVal = !rotinaObj[acaoId];

        setTempPerms(prev => {
            const currentRotina = prev[rotinaId] || {};
            const updatedRotina = { ...currentRotina, [acaoId]: newVal };

            if (newVal && acaoId !== 'liberado') {
                updatedRotina.liberado = true;
            }

            if (!newVal && acaoId === 'liberado') {
                Object.keys(updatedRotina).forEach(k => {
                    updatedRotina[k] = false;
                });
            }

            return {
                ...prev,
                [rotinaId]: updatedRotina
            };
        });

        const rotLabel = MODULES.flatMap(m => m.rotinas).find(r => r.id === rotinaId)?.nome || rotinaId;
        pushAuditLog(
            `${selectedUser.nome}: ${newVal ? 'HABILITOU' : 'DESABILITOU'} "${acaoId.toUpperCase()}" na rotina "${rotLabel}"`,
            newVal ? 'success' : 'warning',
        );
    };

    // Alternar todas as ações de uma rotina inteira
    const toggleRotinaAll = (rotina: RotinaCatalogo) => {
        if (!selectedUser) return;

        const isAllSelected = rotina.acoes.every(a => tempPerms[rotina.id]?.[a.id]);
        
        setTempPerms(prev => {
            const updatedRotina: Record<string, boolean> = {};
            rotina.acoes.forEach(a => {
                updatedRotina[a.id] = !isAllSelected;
            });

            return {
                ...prev,
                [rotina.id]: updatedRotina
            };
        });
        pushAuditLog(
            `${selectedUser.nome}: ${isAllSelected ? 'DESMARCOU' : 'MARCOU'} todas as ações na rotina "${rotina.nome}"`,
            isAllSelected ? 'warning' : 'success',
        );
    };

    // Alternar todas as rotinas de um módulo inteiro
    const toggleModuleAll = (mod: ModuloCatalogo) => {
        if (!selectedUser) return;

        const isAllSelected = mod.rotinas.every(r => r.acoes.every(a => tempPerms[r.id]?.[a.id]));

        setTempPerms(prev => {
            const next = { ...prev };
            mod.rotinas.forEach(r => {
                const updatedRotina: Record<string, boolean> = {};
                r.acoes.forEach(a => {
                    updatedRotina[a.id] = !isAllSelected;
                });
                next[r.id] = updatedRotina;
            });

            return next;
        });
        pushAuditLog(
            `${selectedUser.nome}: ${isAllSelected ? 'DESMARCOU' : 'MARCOU'} o módulo inteiro "${mod.label}"`,
            isAllSelected ? 'warning' : 'success',
        );
    };

    // Alternar empresa no contexto de unidades
    const toggleEmpresaContexto = (empresaId: string) => {
        setTempEmpresasContexto(prev => {
            const newVal = !prev[empresaId];
            
            // Auditoria
            const empNome = grupoEmpresasList.find(e => e.id === empresaId)?.nome || empresaId;
            pushAuditLog(
                `${selectedUser?.nome}: ${newVal ? 'LIBEROU' : 'BLOQUEOU'} acesso à unidade "${empNome}"`,
                newVal ? 'success' : 'warning',
            );

            return {
                ...prev,
                [empresaId]: newVal
            };
        });
    };

    const handleApplyNivel = (nivel: NivelPermissaoId) => {
        if (!selectedUser) return;
        const presetPerms = montarPermissoesNivel(nivel);
        setTempPerms(sincronizarLiberadoComSubAcoes(presetPerms));
        setNivelPadraoEdicao(nivel);
        pushAuditLog(
            `Nível "${labelNivelPermissao(nivel)}" aplicado para ${selectedUser.nome}`,
            'success',
        );
        showToast(
            `Nível ${labelNivelPermissao(nivel)} aplicado. Revise e clique em Salvar — o cargo do usuário não altera estas permissões.`,
            'success',
        );
    };

    // Salvar no Banco de Dados Real (Supabase)
    const handleSaveChanges = async () => {
        if (!selectedUser) return;

        // Validar estabelecimento
        const marcadas = Object.entries(tempEmpresasContexto).filter(([, v]) => v);
        if (marcadas.length === 0) {
            showToast('Selecione pelo menos um estabelecimento para o usuário!', 'error');
            return;
        }

        setSaving(true);
        try {
            const alinhado = sincronizarLiberadoComSubAcoes(tempPerms);
            const empresasSnapshot: Record<string, boolean> = {};
            for (const [id, v] of Object.entries(tempEmpresasContexto)) {
                if (v) empresasSnapshot[id] = true;
            }

            // Monta snapshot de permissões final
            const snapshot = montarSnapshotCompletoPermissoes({
                ...alinhado,
                [CHAVE_EMPRESAS_CONTEXTO]: empresasSnapshot,
                ...(nivelPadraoEdicao ? { [CHAVE_NIVEL_PADRAO]: nivelPadraoEdicao } : {}),
            } as Record<string, unknown>);

            const { error } = await supabase
                .from('users')
                .update({ 
                    permissoes: snapshot, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', selectedUser.id);

            if (error) throw error;

            // Atualiza lista local
            setUsuarios(prev => prev.map(u => u.id === selectedUser.id ? { ...u, permissoes: snapshot } : u));
            
            showToast(`✓ Permissões de ${selectedUser.nome} persistidas no banco de dados com sucesso!`, 'success');

            const logTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setAuditLogs(logs => [
                {
                    time: logTime.substring(0, 5),
                    text: `✓ TODAS as alterações de ${selectedUser.nome} salvas em produção!`,
                    type: 'success'
                },
                ...logs.slice(0, 15)
            ]);
        } catch (err: any) {
            showToast(err.message || 'Erro ao gravar as permissões no Supabase.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const usuarioTemMatrizSalva = useMemo(() => {
        if (!selectedUser) return false;
        return usuarioTemPermissoesExplicitasSalvas((selectedUser.permissoes || {}) as Record<string, unknown>);
    }, [selectedUser]);

    const linhasTabelaPermissoes = useMemo(() => {
        const term = searchPermission.trim().toLowerCase();
        const linhas: Array<{
            mod: ModuloCatalogo;
            rotina: RotinaCatalogo;
        }> = [];
        for (const mod of filteredModules) {
            for (const rotina of mod.rotinas) {
                if (
                    term
                    && !rotina.nome.toLowerCase().includes(term)
                    && !mod.label.toLowerCase().includes(term)
                    && !rotina.numero.includes(term)
                ) {
                    continue;
                }
                linhas.push({ mod, rotina });
            }
        }
        return linhas;
    }, [filteredModules, searchPermission]);

    const acoesTabelaCols = useMemo(() => {
        const ids = new Set<string>();
        for (const mod of MODULES) {
            for (const rot of mod.rotinas) {
                for (const acao of rot.acoes) ids.add(acao.id);
            }
        }
        const ordem = ['liberado', 'view', 'create', 'edit', 'delete', 'baixar', 'estornar', 'export', 'import', 'confirm', 'view_todos', 'abrir_caixa', 'fechar_caixa', 'ver_todos_caixas', 'gerenciar_operadores'];
        return [...ordem.filter((id) => ids.has(id)), ...[...ids].filter((id) => !ordem.includes(id))];
    }, []);

    const labelAcaoColuna = (id: string) => {
        for (const mod of MODULES) {
            for (const rot of mod.rotinas) {
                const acao = rot.acoes.find((a) => a.id === id);
                if (acao) return acao.label;
            }
        }
        return id;
    };

    const riscoNivelClass = (risco: string) => {
        if (risco === 'critico') return 'bg-rose-50 text-rose-700 border-rose-100';
        if (risco === 'alto') return 'bg-amber-50 text-amber-700 border-amber-100';
        if (risco === 'moderado') return 'bg-sky-50 text-sky-700 border-sky-100';
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    };

    return (
        <div className="space-y-6">
            {/* Cabeçalho Glassmorphic */}
            <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 p-6 text-white shadow-xl">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl"></div>
                <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl"></div>

                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-inner">
                            <Shield className="h-7 w-7 text-indigo-300" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-200 bg-clip-text text-transparent">
                                Controle de Permissões de Acesso
                            </h2>
                            <p className="text-sm text-indigo-200/80">
                                Permissões por usuário — independentes do cargo. O que estiver marcado aqui é o que vale no sistema.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur-md border border-white/10">
                            <Users className="h-3.5 w-3.5 text-blue-300" />
                            {usuarios.length} operadores cadastrados
                        </span>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={carregarUsuarios}
                            loading={loadingUsuarios}
                            className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                        >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Sincronizar
                        </Button>
                    </div>
                </div>
            </div>

            {/* Seletor de Usuário Autocomplete/Dropdown */}
            <Card className="p-4 border-gray-200/80 shadow-md bg-white/70 backdrop-blur-md relative z-30 shrink-0 !overflow-visible">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="shrink-0 flex items-center gap-2">
                        <Users className="h-5 w-5 text-indigo-600 animate-pulse" />
                        <span className="text-sm font-bold text-gray-800">Operador:</span>
                    </div>
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3.5 top-3 h-4.5 w-4.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Digite o nome ou e-mail para pesquisar o operador..."
                            value={searchUser}
                            onChange={(e) => {
                                setSearchUser(e.target.value);
                                setShowDropdown(true);
                            }}
                            onFocus={(e) => {
                                e.target.select();
                                setShowDropdown(true);
                            }}
                            onBlur={() => setTimeout(() => {
                                setShowDropdown(false);
                                if (selectedUser) {
                                    setSearchUser(selectedUser.nome);
                                } else {
                                    setSearchUser('');
                                }
                            }, 200)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm text-gray-900 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none shadow-inner"
                        />
                        
                        {/* Dropdown de Resultados */}
                        {showDropdown && (
                            <div className="absolute left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50 divide-y divide-gray-50 custom-scrollbar">
                                {loadingUsuarios ? (
                                    <div className="p-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                                        <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
                                        <span>Buscando operadores...</span>
                                    </div>
                                ) : filteredUsuarios.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-gray-400 italic">
                                        Nenhum operador encontrado.
                                    </div>
                                ) : (
                                    filteredUsuarios.map((u) => {
                                        const isSelected = selectedUser?.id === u.id;
                                        const roleLower = (u.role || '').toLowerCase();
                                        let roleBadge = 'bg-gray-100 text-gray-800 border-gray-200';
                                        if (roleLower.includes('admin')) roleBadge = 'bg-rose-50 text-rose-700 border-rose-100';
                                        else if (roleLower.includes('gestor') || roleLower.includes('gerente')) roleBadge = 'bg-amber-50 text-amber-700 border-amber-100';
                                        else if (roleLower.includes('cobrador')) roleBadge = 'bg-blue-50 text-blue-700 border-blue-100';
                                        else if (roleLower.includes('vendedor')) roleBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';

                                        return (
                                            <button
                                                key={u.id}
                                                type="button"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    handleSelectUser(u);
                                                    setShowDropdown(false);
                                                }}
                                                className={`w-full text-left p-3 flex items-center justify-between transition-colors cursor-pointer ${
                                                    isSelected ? 'bg-indigo-50/70 hover:bg-indigo-50' : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                                        isSelected ? 'bg-indigo-600 text-white shadow-inner' : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {u.nome.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs font-bold text-gray-800">{u.nome}</h4>
                                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                                            {u.email} • <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${roleBadge}`}>{u.cargo || u.role}</span> • {u.empresa_nome}
                                                        </p>
                                                    </div>
                                                </div>
                                                {isSelected && <Check className="h-4 w-4 text-indigo-600" />}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* Matriz de Permissões Full Width */}
            <div className="w-full flex flex-col gap-4">
                {selectedUser ? (
                        <Card className="flex-1 p-5 border-gray-200/80 shadow-md bg-white/70 backdrop-blur-md flex flex-col !overflow-visible">
                            {/* Cabeçalho do Usuário Ativo */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 mb-4 gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-gray-900 text-lg">{selectedUser.nome}</h3>
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                                            {selectedUser.role.toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Cargo (referência): <span className="font-semibold text-gray-700">{selectedUser.cargo || selectedUser.role || '—'}</span>
                                        {' '}| Unidade: <span className="font-semibold text-gray-700">{selectedUser.empresa_nome}</span>
                                        {usuarioTemMatrizSalva ? (
                                            <span className="ml-2 text-emerald-600 font-semibold">• Matriz personalizada ativa</span>
                                        ) : (
                                            <span className="ml-2 text-amber-600 font-semibold">• Matriz padrão do cargo ativa</span>
                                        )}
                                        {nivelPadraoEdicao ? (
                                            <span className="ml-2 text-indigo-600 font-semibold">
                                                • Nível: {labelNivelPermissao(nivelPadraoEdicao)}
                                            </span>
                                        ) : null}
                                    </p>
                                </div>
                            </div>

                            {/* Sub-Aba Interna */}
                            <div className="flex gap-2 border-b pb-3 mb-4">
                                <button
                                    onClick={() => setActiveSubTab('rotinas')}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        activeSubTab === 'rotinas'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Módulos e Rotinas
                                </button>
                                <button
                                    onClick={() => setActiveSubTab('empresas')}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        activeSubTab === 'empresas'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <Building className="h-3.5 w-3.5" />
                                    Unidades de Acesso ({Object.values(tempEmpresasContexto).filter(Boolean).length})
                                </button>
                            </div>

                            {activeSubTab === 'rotinas' && (
                                <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-start gap-2">
                                            <Sparkles className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-xs font-bold text-gray-800">Aplicar nível de acesso (modelo)</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                    Atalho para preencher a matriz. Depois ajuste módulos individuais e clique em Salvar.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {NIVEIS_PERMISSAO_PADRAO.map((nivel) => (
                                                <button
                                                    key={nivel.id}
                                                    type="button"
                                                    onClick={() => handleApplyNivel(nivel.id)}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                                        nivelPadraoEdicao === nivel.id
                                                            ? 'bg-indigo-600 border-indigo-600 text-white'
                                                            : `${riscoNivelClass(nivel.risco)} hover:opacity-90`
                                                    }`}
                                                    title={nivel.descricao}
                                                >
                                                    {nivel.nome}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Conteúdo: ROTINAS */}
                            {activeSubTab === 'rotinas' && (
                                <div className="flex flex-col">
                                    {/* Busca e Filtro de Permissões */}
                                    <div className="flex gap-2 mb-3 items-center">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                            <Input
                                                placeholder="Buscar rotina no catálogo..."
                                                value={searchPermission}
                                                onChange={(e) => setSearchPermission(e.target.value)}
                                                className="pl-9 bg-gray-50/50"
                                            />
                                        </div>
                                        <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setViewRotinas('tabela')}
                                                className={`px-3 py-2 text-[10px] font-bold ${viewRotinas === 'tabela' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}
                                            >
                                                Tabela
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewRotinas('cards')}
                                                className={`px-3 py-2 text-[10px] font-bold ${viewRotinas === 'cards' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}
                                            >
                                                Cards
                                            </button>
                                        </div>
                                    </div>

                                    {viewRotinas === 'tabela' ? (
                                        <div className="max-h-[min(52vh,480px)] overflow-auto border border-gray-200 rounded-xl">
                                            <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                                                <thead className="sticky top-0 z-10 bg-gray-50 border-b">
                                                    <tr className="text-[10px] uppercase text-gray-500">
                                                        <th className="py-2 px-3 font-bold">Mód.</th>
                                                        <th className="py-2 px-3 font-bold">Nº</th>
                                                        <th className="py-2 px-3 font-bold min-w-[180px]">Rotina</th>
                                                        <th className="py-2 px-3 font-bold text-center">Tudo</th>
                                                        {acoesTabelaCols.map((acaoId) => (
                                                            <th key={acaoId} className="py-2 px-2 font-bold text-center whitespace-nowrap">
                                                                {labelAcaoColuna(acaoId)}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {linhasTabelaPermissoes.map(({ mod, rotina }) => {
                                                        const isAllSelected = rotina.acoes.every(a => tempPerms[rotina.id]?.[a.id]);
                                                        return (
                                                            <tr key={rotina.id} className="hover:bg-gray-50/80">
                                                                <td className="py-2 px-3 text-[10px] font-bold text-gray-500 whitespace-nowrap">{mod.codigo}</td>
                                                                <td className="py-2 px-3 font-mono text-[10px] text-gray-400">{rotina.numero}</td>
                                                                <td className="py-2 px-3 font-semibold text-gray-800">{rotina.nome}</td>
                                                                <td className="py-2 px-3 text-center align-middle">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleRotinaAll(rotina)}
                                                                        className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg border transition-all cursor-pointer shadow-xs ${
                                                                            isAllSelected
                                                                                ? 'bg-indigo-100 border-indigo-200 text-indigo-700 hover:bg-indigo-200'
                                                                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:border-gray-300'
                                                                        }`}
                                                                        title={isAllSelected ? 'Limpar todas as permissões desta rotina' : 'Marcar todas as permissões desta rotina'}
                                                                    >
                                                                        {isAllSelected ? 'Limpar' : 'Marcar'}
                                                                    </button>
                                                                </td>
                                                                {acoesTabelaCols.map((acaoId) => {
                                                                    const acao = rotina.acoes.find((a) => a.id === acaoId);
                                                                    if (!acao) {
                                                                        return <td key={acaoId} className="py-2 px-2 text-center text-gray-200">—</td>;
                                                                    }
                                                                    const checked = !!tempPerms[rotina.id]?.[acaoId];
                                                                    const isMaster = acaoId === 'liberado';
                                                                    return (
                                                                        <td key={acaoId} className="py-2 px-2 text-center align-middle">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => togglePermission(rotina.id, acaoId)}
                                                                                className={`mx-auto h-7 w-7 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                                                                                    checked 
                                                                                        ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 scale-105 shadow-md shadow-indigo-100' 
                                                                                        : 'bg-white border-gray-200 text-gray-300 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/10'
                                                                                }`}
                                                                                title={`${rotina.nome} — ${acao.label}`}
                                                                            >
                                                                                {checked ? (
                                                                                    <Check className="h-4 w-4 stroke-[3.5] animate-in zoom-in duration-100" />
                                                                                ) : isMaster ? (
                                                                                    <Lock className="h-3.5 w-3.5 opacity-30" />
                                                                                ) : (
                                                                                    <Unlock className="h-3.5 w-3.5 opacity-25" />
                                                                                )}
                                                                            </button>
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                    <>
                                    {/* Botões de Ação Rápida dos Cards */}
                                    <div className="flex justify-between items-center gap-2 mb-3 px-1">
                                        <p className="text-[10px] text-gray-500 font-medium">
                                            Mostrando {filteredModules.length} módulo{filteredModules.length !== 1 ? 's' : ''}
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedModules(new Set(MODULES.map(m => m.id)))}
                                                className="px-2.5 py-1.5 text-[10px] font-bold bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50/50 transition-colors cursor-pointer"
                                                title="Expandir todos os módulos"
                                            >
                                                Expandir Todos
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedModules(new Set())}
                                                className="px-2.5 py-1.5 text-[10px] font-bold bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                                                title="Recolher todos os módulos"
                                            >
                                                Recolher Todos
                                            </button>
                                        </div>
                                    </div>

                                    <div
                                        ref={modulosScrollRef}
                                        className="max-h-[min(52vh,480px)] overflow-y-auto space-y-2 pr-1 custom-scrollbar"
                                    >
                                        {filteredModules.map(mod => {
                                            const enabled = isModuleEnabled(mod);
                                            const partial = isModulePartial(mod);
                                            const expanded = expandedModules.has(mod.id) || !!searchPermission;
                                            const activeCount = countEnabledRotinas(mod);
                                            const isFullyEnabled = mod.rotinas.every(r => tempPerms[r.id]?.liberado === true);

                                            let cardBorderClass = 'border-slate-200 bg-slate-50/30 opacity-80';
                                            let headerBgClass = 'bg-slate-100/50 hover:bg-slate-100/80';
                                            let badgeColor = 'bg-slate-200 text-slate-600 border-slate-300';

                                            if (isFullyEnabled) {
                                                cardBorderClass = 'border-emerald-200 bg-white shadow-xs';
                                                headerBgClass = 'bg-emerald-50/30 hover:bg-emerald-50/60';
                                                badgeColor = 'bg-emerald-600 text-white border-emerald-700';
                                            } else if (enabled) {
                                                cardBorderClass = 'border-indigo-200 bg-white shadow-xs';
                                                headerBgClass = 'bg-indigo-50/30 hover:bg-indigo-50/60';
                                                badgeColor = 'bg-indigo-600 text-white border-indigo-700';
                                            }

                                            return (
                                                <div
                                                    key={mod.id}
                                                    data-mod-id={mod.id}
                                                    className={`rounded-xl border overflow-hidden shadow-sm transition-all duration-200 ${cardBorderClass}`}
                                                >
                                                    {/* Cabeçalho do Card */}
                                                    <div 
                                                        className={`px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors ${headerBgClass}`}
                                                        onClick={() => toggleModuleExpansion(mod.id)}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${badgeColor}`}>
                                                                {mod.codigo}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <h4 className="font-bold text-sm leading-tight text-gray-800">
                                                                    {mod.label}
                                                                </h4>
                                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                                    {activeCount}/{mod.rotinas.length} rotina{mod.rotinas.length !== 1 ? 's' : ''} com acesso
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                            {/* Toggle ON/OFF do módulo */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleModuleAccess(mod)}
                                                                title={enabled ? 'Bloquear módulo' : 'Liberar módulo'}
                                                                className={`relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
                                                                    enabled ? 'bg-indigo-600' : partial ? 'bg-amber-400' : 'bg-gray-300'
                                                                }`}
                                                            >
                                                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
                                                                    enabled ? 'left-[22px]' : 'left-0.5'
                                                                }`} />
                                                            </button>

                                                            {/* Botão Detalhar */}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleModuleExpansion(mod.id);
                                                                }}
                                                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                                                                    expanded
                                                                        ? 'bg-indigo-100/80 text-indigo-700'
                                                                        : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                {expanded ? <ChevronDown className="h-3.5 w-3.5 text-indigo-600" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                                                                {expanded ? 'Ocultar' : 'Detalhar'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Rotinas expandidas */}
                                                    {expanded && (
                                                        <div className="border-t divide-y divide-gray-100 bg-slate-50/20">
                                                            {mod.rotinas.map(rotina => {
                                                                const isLiberada = !!tempPerms[rotina.id]?.liberado;
                                                                const allRotinaSelected = rotina.acoes.every(a => tempPerms[rotina.id]?.[a.id]);

                                                                return (
                                                                    <div
                                                                        key={rotina.id}
                                                                        className={`px-4 py-3 transition-colors ${isLiberada ? 'bg-white' : 'bg-slate-50/30'}`}
                                                                    >
                                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                                                                            <div className="flex items-center gap-2 min-w-0">
                                                                                <span className="text-[9px] font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200/80 shrink-0">
                                                                                    {rotina.numero}
                                                                                </span>
                                                                                <span className={`text-xs font-bold ${isLiberada ? 'text-gray-800' : 'text-gray-400'}`}>
                                                                                    {rotina.nome}
                                                                                </span>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleRotinaAll(rotina)}
                                                                                className={`text-[9px] font-bold uppercase px-2.5 py-1 rounded-lg border transition-all shrink-0 cursor-pointer ${
                                                                                    allRotinaSelected
                                                                                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                                                                                        : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100/80'
                                                                                }`}
                                                                            >
                                                                                {allRotinaSelected ? 'Desmarcar tudo' : 'Marcar tudo'}
                                                                            </button>
                                                                        </div>

                                                                        <div className="flex flex-wrap gap-2">
                                                                            {rotina.acoes.map(acao => {
                                                                                const isChecked = !!tempPerms[rotina.id]?.[acao.id];
                                                                                
                                                                                return (
                                                                                    <label
                                                                                        key={acao.id}
                                                                                        className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold border transition-all duration-200 select-none ${getAcaoStyle(acao.id, isChecked)}`}
                                                                                    >
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={isChecked}
                                                                                            onChange={() => togglePermission(rotina.id, acao.id)}
                                                                                            className="sr-only"
                                                                                        />
                                                                                        {renderAcaoIcon(acao.id, isChecked)}
                                                                                        {acao.label}
                                                                                    </label>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    </>
                                    )}
                                </div>
                            )}

                            {/* Conteúdo: UNIDADES/EMPRESAS */}
                            {activeSubTab === 'empresas' && (
                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-800 text-xs mb-4 flex items-start gap-2.5">
                                        <Info className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-semibold">Contexto de Unidades Administrativas</p>
                                            <p className="mt-1 leading-relaxed">
                                                Selecione quais unidades operacionais do grupo este usuário está autorizado a consultar ou fazer lançamentos. Se marcar apenas uma unidade, o sistema travará a visualização nela sem permitir troca no cabeçalho.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                                        {grupoEmpresasList.map(emp => {
                                            const isChecked = !!tempEmpresasContexto[emp.id];
                                            const isCadastroBase = emp.id === selectedUser.empresa_id;

                                            return (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    onClick={() => toggleEmpresaContexto(emp.id)}
                                                    className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all duration-200 ${
                                                        isChecked
                                                            ? 'border-indigo-300 bg-indigo-50/80 shadow-xs'
                                                            : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center border transition-all ${
                                                            isChecked ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 border-gray-200 text-gray-500'
                                                        }`}>
                                                            <Building className="h-4 w-4" />
                                                        </div>
                                                        <div>
                                                            <h4 className="text-xs font-bold text-gray-800">
                                                                {unidadeNomeCurto(emp.nome)}
                                                            </h4>
                                                            <p className="text-[10px] text-gray-500 truncate max-w-[160px] mt-0.5">
                                                                {emp.nome}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {isCadastroBase && (
                                                            <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full border border-indigo-200">
                                                                Base
                                                            </span>
                                                        )}
                                                        <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${
                                                            isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'
                                                        }`}>
                                                            {isChecked && <Check className="h-3.5 w-3.5" />}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {selectedUser && (
                                <div className="mt-6 pt-4 border-t flex justify-end">
                                    <Button 
                                        onClick={handleSaveChanges} 
                                        loading={saving}
                                        className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 shadow-md hover:from-indigo-700 hover:to-indigo-800 transition-all border-none cursor-pointer text-xs"
                                    >
                                        <Save className="h-4 w-4" />
                                        Salvar Alterações
                                    </Button>
                                </div>
                            )}

                        </Card>
                    ) : (
                        <Card className="flex-1 p-8 text-center border-gray-200/80 shadow-md bg-white/70 backdrop-blur-md flex flex-col items-center justify-center gap-3">
                            <ShieldAlert className="h-12 w-12 text-gray-400 animate-bounce" />
                            <h3 className="font-bold text-gray-800 text-lg">Nenhum Usuário Selecionado</h3>
                            <p className="text-sm text-gray-500 max-w-sm">
                                Selecione um operador de sistema na barra esquerda para ler e ajustar as permissões.
                            </p>
                        </Card>
                    )}
            </div>
        </div>
    );
};

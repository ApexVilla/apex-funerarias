import React, { useState, useMemo, useEffect } from 'react';
import {
    Shield, ShieldAlert, ShieldCheck, Users, Search, RefreshCw,
    CheckCircle2, XCircle, Save, Sparkles, Filter, Unlock, Lock,
    Info, Landmark, HelpCircle, AlertCircle, FileText, Database,
    UserCheck, Settings, History, Eye, Check, Trash2, Building,
    ShieldX, DollarSign, MapPin, ClipboardList, Wallet, Bell, ChevronRight, ToggleLeft, ToggleRight
} from 'lucide-react';
import { useToast } from '../../lib/ToastStore';
import { Button, Input, Card } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { empresaIdsConsultaCobradores } from '../../lib/cobradorEmpresaScope';
import { empresaIdsGrupoEconomicoParaCobradores } from '../../lib/cobradorDisponiveis';
import { resolveEmpresaIdsConsulta } from '../../lib/useEmpresaIdsOperacao';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';

interface CobradorPermissoes {
    id: string;
    nome: string;
    avatar: string;
    unidade: string;
    cargo: string;
    clientesNaCarteira: number;
    metaMensal: number;
    percentualComissao: number;
    status: 'Ativo' | 'Inativo';
    alcadaDesconto: number; // Percentual maximo de desconto
    exigirGps: boolean;
    estornoMesmoDia: boolean;
    prorrogarVencimento: boolean;
    recebimentoOffline: boolean;
    receberPixManual: boolean;
    moduloCarteira: boolean;
    moduloRotas: boolean;
    moduloRecebimentos: boolean;
    moduloComissoes: boolean;
    moduloPonto: boolean;
}

export const ConfiguracaoPermissoesCobradores: React.FC = () => {
    const { showToast } = useToast();
    const { user } = useAuth();
    const {
        empresaIdEfetivo,
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        empresaIdsParaFiltro,
        podeAlternarEmpresa,
    } = useEmpresaContextoAtivo();

    const empresaId = (empresaIdEfetivo || user?.empresa_id || '').trim();
    const empresaIdsConsulta = useMemo(
        () => resolveEmpresaIdsConsulta(empresaId, empresaIdsParaFiltro),
        [empresaId, empresaIdsParaFiltro],
    );
    const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;
    const empresaNomeAtual = useMemo(
        () => empresasDoGrupo.find((e) => e.id === empresaId)?.nome || '',
        [empresasDoGrupo, empresaId],
    );
    const tokenUnidadeGrupo = useMemo(() => {
        if (visaoTodasEmpresasGrupo) return '';
        return unidadeNomeCurto(empresaNomeAtual);
    }, [visaoTodasEmpresasGrupo, empresaNomeAtual]);

    const empresaIdsQueryCobradores = useMemo(
        () =>
            empresaIdsConsultaCobradores({
                empresaIdsParaFiltro: empresaIdsConsulta,
                empresasDoGrupo,
                visaoTodasEmpresasGrupo,
                multiEmpresa,
                tokenUnidadeGrupo,
            }),
        [empresaIdsConsulta, empresasDoGrupo, visaoTodasEmpresasGrupo, multiEmpresa, tokenUnidadeGrupo],
    );

    const [cobradores, setCobradores] = useState<CobradorPermissoes[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [saving, setSaving] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    
    // Audit logs for session settings changes
    const [auditLogs, setAuditLogs] = useState<Array<{ time: string; text: string; type: 'info' | 'success' | 'warning' }>>([
        { time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), text: 'Módulo de permissões de cobradores carregado com sucesso.', type: 'info' }
    ]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const idsQuery = await empresaIdsGrupoEconomicoParaCobradores(empresaIdsQueryCobradores);
                if (idsQuery.length === 0) {
                    setCobradores([]);
                    setLoading(false);
                    return;
                }

                // Load unit names
                const { data: filiaisRows } = await supabase
                    .from('filiais')
                    .select('id, nome')
                    .in('empresa_id', idsQuery);
                const filiaisMap = new Map<string, string>(
                    (filiaisRows || []).map((f: any) => [f.id, f.nome])
                );

                // Load collectors
                const { data: cobradoresRows, error } = await supabase
                    .from('cobradores')
                    .select('*')
                    .in('empresa_id', idsQuery)
                    .order('nome');

                if (error) throw error;

                // Load client counts per collector
                const { data: countsRows } = await supabase
                    .from('cob_cobrancas_pendentes')
                    .select('cobrador_id, cliente_id')
                    .in('cobrador_id', (cobradoresRows || []).map((c: any) => c.id));
                
                const clientCountMap = new Map<string, Set<string>>();
                (countsRows || []).forEach((row: any) => {
                    const cid = String(row.cobrador_id);
                    const clid = String(row.cliente_id);
                    if (!clientCountMap.has(cid)) {
                        clientCountMap.set(cid, new Set());
                    }
                    clientCountMap.get(cid)?.add(clid);
                });

                const mapped: CobradorPermissoes[] = (cobradoresRows || []).map((c: any) => {
                    const unitName = c.filial_id ? filiaisMap.get(c.filial_id) : '';
                    const mappedStatus = c.status === 'ativo' ? 'Ativo' : 'Inativo';
                    const clientsCount = clientCountMap.get(String(c.id))?.size || 0;
                    
                    return {
                        id: c.id,
                        nome: c.nome,
                        avatar: c.foto_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.nome)}&background=d97706&color=fff&bold=true`,
                        unidade: unitName || c.area_atuacao || 'Apex Unidade',
                        cargo: c.modulo_rotas === false ? 'Cobradora Interna / Escritório' : 'Cobrador Externo',
                        clientesNaCarteira: clientsCount,
                        metaMensal: 15000,
                        percentualComissao: Number(c.comissao_percentual) || 5.0,
                        status: mappedStatus,
                        alcadaDesconto: Number(c.alcada_desconto) || 10.0,
                        exigirGps: c.exigir_gps !== false,
                        estornoMesmoDia: Boolean(c.estorno_mesmo_dia),
                        prorrogarVencimento: Boolean(c.prorrogar_vencimento),
                        recebimentoOffline: Boolean(c.recebimento_offline),
                        receberPixManual: c.receber_pix_manual !== false,
                        moduloCarteira: c.modulo_carteira !== false,
                        moduloRotas: c.modulo_rotas !== false,
                        moduloRecebimentos: c.modulo_recebimentos !== false,
                        moduloComissoes: c.modulo_comissoes !== false,
                        moduloPonto: c.modulo_ponto !== false
                    };
                });

                setCobradores(mapped);
                if (mapped.length > 0 && !selectedId) {
                    setSelectedId(mapped[0].id);
                }
            } catch (err: any) {
                console.error('Erro ao carregar permissões:', err);
                showToast('Erro ao carregar os dados dos cobradores.', 'error');
            } finally {
                setLoading(false);
            }
        };

        void loadData();
    }, [empresaIdsQueryCobradores]);

    const activeCobrador = useMemo(() => {
        return cobradores.find(c => c.id === selectedId) || cobradores[0];
    }, [selectedId, cobradores]);

    const filteredCobradores = useMemo(() => {
        if (!searchQuery.trim()) return cobradores;
        const q = searchQuery.toLowerCase();
        return cobradores.filter(c => 
            c.nome.toLowerCase().includes(q) || 
            c.unidade.toLowerCase().includes(q) ||
            c.cargo.toLowerCase().includes(q)
        );
    }, [searchQuery, cobradores]);

    const handleToggle = (field: keyof CobradorPermissoes) => {
        if (!activeCobrador) return;
        setCobradores(prev => prev.map(c => {
            if (c.id === activeCobrador.id) {
                const val = c[field];
                return { ...c, [field]: !val };
            }
            return c;
        }));
    };

    const handleNumberChange = (field: 'alcadaDesconto' | 'metaMensal' | 'percentualComissao', value: number) => {
        if (!activeCobrador) return;
        setCobradores(prev => prev.map(c => {
            if (c.id === activeCobrador.id) {
                return { ...c, [field]: value };
            }
            return c;
        }));
    };

    const handleSave = async () => {
        if (!activeCobrador) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('cobradores')
                .update({
                    alcada_desconto: activeCobrador.alcadaDesconto,
                    exigir_gps: activeCobrador.exigirGps,
                    estorno_mesmo_dia: activeCobrador.estornoMesmoDia,
                    prorrogar_vencimento: activeCobrador.prorrogarVencimento,
                    recebimento_offline: activeCobrador.recebimentoOffline,
                    receber_pix_manual: activeCobrador.receberPixManual,
                    modulo_carteira: activeCobrador.moduloCarteira,
                    modulo_rotas: activeCobrador.moduloRotas,
                    modulo_recebimentos: activeCobrador.moduloRecebimentos,
                    modulo_comissoes: activeCobrador.moduloComissoes,
                    modulo_ponto: activeCobrador.moduloPonto,
                    comissao_percentual: activeCobrador.percentualComissao
                })
                .eq('id', activeCobrador.id);

            if (error) throw error;

            showToast(`Permissões de ${activeCobrador.nome} salvas com sucesso!`, 'success');
            
            const logText = `Permissões de ${activeCobrador.nome} atualizadas: Alçada ${activeCobrador.alcadaDesconto}%, GPS ${activeCobrador.exigirGps ? 'Ativo' : 'Inativo'}, Recebimentos ${activeCobrador.moduloRecebimentos ? 'Sim' : 'Não'}.`;
            setAuditLogs(prev => [
                { time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), text: logText, type: 'success' },
                ...prev
            ]);
        } catch (err: any) {
            console.error('Erro ao salvar permissões:', err);
            showToast('Erro ao salvar as configurações.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
                <span className="text-slate-500 text-sm font-medium">Carregando permissões dos cobradores...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
            {/* Header Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 p-6 md:p-8 text-white shadow-xl">
                <div className="absolute top-0 right-0 -mt-6 -mr-6 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-72 h-72 rounded-full bg-orange-600/10 blur-3xl pointer-events-none" />
                
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold uppercase tracking-wider">
                            <Shield className="h-3.5 w-3.5" /> Security &amp; Operations
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Permissões de Cobradores</h1>
                        <p className="text-slate-300 max-w-2xl text-sm md:text-base">
                            Defina o limite de alçada de descontos, exigências de geolocalização, possibilidade de recebimento offline, permissões de caixa e módulos visíveis para cada cobrador.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 self-start md:self-auto">
                        <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/15">
                            <ShieldCheck className="h-7 w-7 text-amber-400" />
                        </div>
                        <div>
                            <p className="font-bold text-sm">Controle Profissional</p>
                            <p className="text-xs text-slate-400">Restrição de Acesso em Campo</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Sidebar: Collectors List */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar cobrador ou unidade..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors"
                            />
                        </div>

                        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                            {filteredCobradores.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 text-sm">
                                    Nenhum cobrador correspondente encontrado.
                                </div>
                            ) : (
                                filteredCobradores.map((cob) => {
                                    const isSelected = cob.id === selectedId;
                                    return (
                                        <button
                                            key={cob.id}
                                            onClick={() => setSelectedId(cob.id)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 relative ${
                                                isSelected 
                                                ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-300' 
                                                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="relative">
                                                <img 
                                                    src={cob.avatar} 
                                                    alt={cob.nome} 
                                                    className="w-10 h-10 rounded-full object-cover border border-slate-200"
                                                />
                                                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                                                    cob.status === 'Ativo' ? 'bg-emerald-500' : 'bg-rose-500'
                                                }`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-900 text-sm truncate">{cob.nome}</p>
                                                <p className="text-xs text-slate-500 truncate">{cob.cargo}</p>
                                                <p className="text-[10px] text-amber-700/80 font-medium truncate mt-0.5">{cob.unidade}</p>
                                            </div>
                                            <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isSelected ? 'transform translate-x-1 text-amber-500' : ''}`} />
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Audit Logs Session Panel */}
                    <div className="bg-slate-900 rounded-2xl text-slate-300 p-4 border border-slate-800 shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <History className="h-4 w-4 text-amber-400" />
                                <span className="font-bold text-xs uppercase tracking-wider text-slate-200">Histórico de Alterações</span>
                            </div>
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">SESSÃO</span>
                        </div>
                        <div className="space-y-3 max-h-[220px] overflow-y-auto text-xs font-mono pr-1 scrollbar-thin">
                            {auditLogs.map((log, idx) => (
                                <div key={idx} className="flex gap-2 items-start leading-relaxed border-b border-slate-800/40 pb-2 last:border-0 last:pb-0">
                                    <span className="text-amber-500/80 shrink-0 font-medium">[{log.time}]</span>
                                    <span className={log.type === 'success' ? 'text-emerald-400' : log.type === 'warning' ? 'text-amber-300' : 'text-slate-400'}>
                                        {log.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Permissions Details */}
                <div className="lg:col-span-8">
                    {activeCobrador ? (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                            {/* Profile Info Header bar */}
                            <div className="p-6 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <img 
                                        src={activeCobrador.avatar} 
                                        alt={activeCobrador.nome} 
                                        className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-sm"
                                    />
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-slate-900">{activeCobrador.nome}</h2>
                                            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ativo
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-600 font-medium">{activeCobrador.cargo}</p>
                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                            <Building className="h-3.5 w-3.5 text-slate-400" /> {activeCobrador.unidade}
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center text-xs">
                                    <div className="bg-slate-100/80 rounded-xl px-3 py-2 border border-slate-200/60 min-w-[100px]">
                                        <p className="text-slate-500 font-medium">Clientes Carteira</p>
                                        <p className="text-sm font-bold text-slate-800">{activeCobrador.clientesNaCarteira} un</p>
                                    </div>
                                    <div className="bg-slate-100/80 rounded-xl px-3 py-2 border border-slate-200/60 min-w-[100px]">
                                        <p className="text-slate-500 font-medium">Meta Mensal</p>
                                        <p className="text-sm font-bold text-slate-800">{formatCurrency(activeCobrador.metaMensal)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Options Tabs or Sections */}
                            <div className="p-6 space-y-8">
                                {/* Section 1: Alçadas e Parâmetros Financeiros */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-150 pb-2">
                                        <DollarSign className="h-5 w-5 text-amber-600" />
                                        <h3 className="font-bold text-slate-950 text-base">Alçadas &amp; Limites Financeiros</h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Desconto Máximo */}
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 flex flex-col justify-between space-y-4">
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-sm text-slate-900">Desconto Máximo Autorizado</span>
                                                    <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 font-semibold px-2 py-0.5 rounded-full font-mono">
                                                        {activeCobrador.alcadaDesconto}% Máx.
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    Limite percentual máximo de desconto que o cobrador pode aplicar nas mensalidades em campo sem autorização da supervisão.
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                <input 
                                                    type="range" 
                                                    min="0" 
                                                    max="50" 
                                                    step="5"
                                                    value={activeCobrador.alcadaDesconto}
                                                    onChange={(e) => handleNumberChange('alcadaDesconto', parseInt(e.target.value))}
                                                    className="w-full accent-amber-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                                />
                                                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                                                    <span>0% (Sem Permissão)</span>
                                                    <span>25% (Padrão)</span>
                                                    <span>50% (Crítico)</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Comissão Customizada */}
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 flex flex-col justify-between space-y-4">
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-sm text-slate-900">Comissão de Recebimento</span>
                                                    <span className="text-xs bg-blue-100 text-blue-800 border border-blue-200 font-semibold px-2 py-0.5 rounded-full font-mono">
                                                        {activeCobrador.percentualComissao}%
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    Alíquota de comissionamento individual calculada automaticamente sobre todos os valores devidamente baixados e liquidados.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="20"
                                                    step="0.1"
                                                    value={activeCobrador.percentualComissao}
                                                    onChange={(e) => handleNumberChange('percentualComissao', parseFloat(e.target.value) || 0)}
                                                    className="w-24 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-center font-mono"
                                                />
                                                <span className="text-xs text-slate-500">Apenas valores baixados com recibo em campo</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Regras Operacionais e Segurança */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-150 pb-2">
                                        <Settings className="h-5 w-5 text-amber-600" />
                                        <h3 className="font-bold text-slate-950 text-base">Parâmetros Operacionais &amp; Regras de Segurança</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Toggles */}
                                        {[
                                            {
                                                field: 'exigirGps' as const,
                                                label: 'Exigir Geolocalização (GPS)',
                                                desc: 'Obrigatório capturar as coordenadas de GPS do cobrador no momento exato em que a baixa de parcela for realizada.'
                                            },
                                            {
                                                field: 'estornoMesmoDia' as const,
                                                label: 'Permitir Estorno de Recebimentos',
                                                desc: 'Autoriza o cobrador a desfazer ou estornar baixas efetuadas incorretamente, limitado exclusivamente ao próprio dia.'
                                            },
                                            {
                                                field: 'prorrogarVencimento' as const,
                                                label: 'Prorrogar Vencimentos de Carnê',
                                                desc: 'Permite alterar a data de vencimento de parcelas pendentes para até 15 dias subsequentes diretamente pelo tablet ou celular.'
                                            },
                                            {
                                                field: 'recebimentoOffline' as const,
                                                label: 'Permitir Modo Offline',
                                                desc: 'Permite realizar cobranças e gerar recibos temporários locais sem conexão de internet. Os dados sincronizam ao reconectar.'
                                            },
                                            {
                                                field: 'receberPixManual' as const,
                                                label: 'Permitir Recebimento PIX Manual',
                                                desc: 'Autoriza o cobrador a receber valores via PIX manual e declarar o pagamento inserindo comprovante em anexo.'
                                            }
                                        ].map((item) => {
                                            const isActive = activeCobrador[item.field];
                                            return (
                                                <div 
                                                    key={item.field}
                                                    onClick={() => handleToggle(item.field)}
                                                    className={`p-4 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                                                        isActive 
                                                        ? 'bg-slate-50 border-slate-200' 
                                                        : 'bg-white border-slate-100 hover:border-slate-200'
                                                    }`}
                                                >
                                                    <div className="mt-0.5">
                                                        {isActive ? (
                                                            <ToggleRight className="h-10 w-10 text-amber-600 transition-all" />
                                                        ) : (
                                                            <ToggleLeft className="h-10 w-10 text-slate-300 transition-all" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="font-semibold text-slate-900 text-sm">{item.label}</p>
                                                        <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{item.desc}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Section 3: Acesso aos Módulos do Sistema */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-150 pb-2">
                                        <Unlock className="h-5 w-5 text-amber-600" />
                                        <h3 className="font-bold text-slate-950 text-base">Acesso aos Módulos e Rotinas</h3>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {[
                                            {
                                                field: 'moduloCarteira' as const,
                                                icon: Users,
                                                label: 'Minha Carteira',
                                                desc: 'Acesso à lista e detalhes de clientes.'
                                            },
                                            {
                                                field: 'moduloRotas' as const,
                                                icon: MapPin,
                                                label: 'Rotas de Visita',
                                                desc: 'Visualizar roteiros e mapa de percurso.'
                                            },
                                            {
                                                field: 'moduloRecebimentos' as const,
                                                icon: DollarSign,
                                                label: 'Recebimentos e Baixas',
                                                desc: 'Fazer recebimento de valores em campo.'
                                            },
                                            {
                                                field: 'moduloComissoes' as const,
                                                icon: Wallet,
                                                label: 'Extrato de Comissões',
                                                desc: 'Acompanhar ganhos e comissões.'
                                            },
                                            {
                                                field: 'moduloPonto' as const,
                                                icon: ClipboardList,
                                                label: 'Gestão de Jornada',
                                                desc: 'Bater ponto e espelho de jornada.'
                                            }
                                        ].map((mod) => {
                                            const ModIcon = mod.icon;
                                            const isModActive = activeCobrador[mod.field];
                                            return (
                                                <button
                                                    key={mod.field}
                                                    type="button"
                                                    onClick={() => handleToggle(mod.field)}
                                                    className={`p-4 rounded-xl border text-left flex flex-col justify-between h-36 transition-all ${
                                                        isModActive 
                                                        ? 'bg-amber-50/20 border-amber-300 ring-1 ring-amber-300' 
                                                        : 'bg-white border-slate-200 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className={`p-2 rounded-lg ${isModActive ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                                                            <ModIcon className="h-5 w-5" />
                                                        </div>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                            isModActive ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'
                                                        }`}>
                                                            {isModActive ? 'LIBERADO' : 'BLOQUEADO'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900 text-sm leading-tight">{mod.label}</p>
                                                        <p className="text-[10px] text-slate-500 leading-normal mt-1">{mod.desc}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Footer Action Bar */}
                            <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-2 text-slate-500 text-xs">
                                    <Info className="h-4 w-4 text-amber-500" />
                                    <span>Configurações temporárias no estado da aplicação. Salve para registrar.</span>
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md shadow-amber-600/10 transition-colors disabled:opacity-50"
                                    >
                                        {saving ? (
                                            <>
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                Salvando...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="h-4 w-4" />
                                                Salvar Configurações
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full rounded-2xl border border-dashed border-slate-350 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                            <ShieldAlert className="h-12 w-12 text-slate-400 mb-3" />
                            <p className="font-bold text-slate-800">Nenhum Cobrador Selecionado</p>
                            <p className="text-sm text-slate-500 mt-1">Selecione um cobrador na lista à esquerda para carregar suas permissões operacionais.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

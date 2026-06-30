import React, { useMemo, useState } from 'react';
import {
    Plus, Edit3, Trash2, Check, X,
    Package, Shield, RefreshCw
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Card } from '../../components/ui/Components';
import { normalizeTipoBeneficio, usePlanosStore } from '../../lib/PlanosStore';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';

const BENEFICIO_TIPOS = [
    { value: 'funerario', label: 'Funerário' },
    { value: 'odontologico', label: 'Odontológico' },
    { value: 'optica', label: 'Óptica' },
    { value: 'saude', label: 'Saúde' },
] as const;

const getTipoBadgeClass = (tipo: string) => {
    if (tipo === 'odontologico') return 'bg-cyan-100 text-cyan-700';
    if (tipo === 'optica') return 'bg-indigo-100 text-indigo-700';
    if (tipo === 'saude') return 'bg-rose-100 text-rose-700';
    return 'bg-gray-100 text-gray-600';
};

export const CategoriasPage: React.FC = () => {
    const { beneficiosDisponiveis, loadBeneficios, permissoes } = usePlanosStore();
    const { showToast } = useToast();

    // Default benefits list for seeding
    const defaultBenefits = {
        funerario: [
            'Urna Funerária Padrão', 'Urna Funerária Luxo', 'Urna Funerária Premium',
            'Preparação do Corpo', 'Tanatopraxia', 'Higienização',
            'Velório 12h', 'Velório 24h', 'Velório 48h', 'Sala de Velório Climatizada',
            'Coroa de Flores P', 'Coroa de Flores M', 'Coroa de Flores G',
            'Kit Lanche Básico', 'Kit Lanche Premium',
            'Translado Municipal', 'Translado Estadual', 'Translado Nacional', 'Translado Ilimitado',
            'Certidões e Documentação', 'Taxas de Sepultamento', 'Cremação',
            'Carro Funerário (Cortejo)', 'Assistência 24h', 'Acolhimento Familiar'
        ],
        odontologico: [
            'Limpeza (Profilaxia)', 'Aplicação de Flúor',
            'Consulta de Avaliação', 'Urgência 24h',
            'Restauração (Obturação)', 'Extração Simples', 'Extração de Siso',
            'Tratamento de Canal', 'Tratamento de Gengiva',
            'Raio-X Panorâmico', 'Raio-X Periapical',
            'Instalação de Aparelho', 'Manutenção de Aparelho',
            'Clareamento Caseiro', 'Clareamento a Laser',
            'Prótese Parcial', 'Prótese Total'
        ],
        optica: [
            'Consulta Oftalmológica', 'Exame de Vista Computadorizado',
            'Armação Grátis (Seleção)', 'Desconto em Armações de Grife',
            'Lentes Monofocais', 'Lentes Bifocais', 'Lentes Multifocais',
            'Lentes Antirreflexo', 'Lentes Blue Light', 'Lentes Fotossensíveis',
            'Lentes de Contato (Desconto)', 'Manutenção de Óculos'
        ],
        saude: [
            'Consulta Clínico Geral', 'Consulta Pediatria', 'Consulta Ginecologia',
            'Telemedicina 24h', 'Exames Laboratoriais Básicos', 'Hemograma Completo',
            'Raio-X Simples', 'Ultrassonografia', 'Check-up Anual',
            'Desconto em Farmácias', 'Transporte Ambulatorial'
        ]
    };

    // Beneficios state
    const [newBenNome, setNewBenNome] = useState('');
    const [newBenType, setNewBenType] = useState<(typeof BENEFICIO_TIPOS)[number]['value']>('funerario');
    const [newBenDesc, setNewBenDesc] = useState('');
    const [filterType, setFilterType] = useState('todos'); // New filter state
    const [editingBen, setEditingBen] = useState<string | null>(null);
    const [editBenNome, setEditBenNome] = useState('');

    const [saving, setSaving] = useState(false);
    const getEmpresaId = () => {
        try {
            const u = JSON.parse(sessionStorage.getItem('user') || '{}');
            return u?.empresa_id || sessionStorage.getItem('empresa_id') || '';
        } catch {
            return sessionStorage.getItem('empresa_id') || '';
        }
    };

    const canEdit = permissoes?.pode_editar_plano ?? true;
    const filteredBeneficios = useMemo(
        () => beneficiosDisponiveis.filter((ben) => filterType === 'todos' || normalizeTipoBeneficio(ben.tipo) === filterType),
        [beneficiosDisponiveis, filterType]
    );
    const tipoStats = useMemo(() => ({
        funerario: beneficiosDisponiveis.filter((b) => normalizeTipoBeneficio(b.tipo) === 'funerario').length,
        odontologico: beneficiosDisponiveis.filter((b) => normalizeTipoBeneficio(b.tipo) === 'odontologico').length,
        optica: beneficiosDisponiveis.filter((b) => normalizeTipoBeneficio(b.tipo) === 'optica').length,
        saude: beneficiosDisponiveis.filter((b) => normalizeTipoBeneficio(b.tipo) === 'saude').length,
    }), [beneficiosDisponiveis]);

    // ---------- BENEFICIOS CRUD ----------
    const handleAddBeneficio = async () => {
        if (!newBenNome.trim()) {
            showToast('Informe o nome do benefício.', 'warning');
            return;
        }
        setSaving(true);
        try {
            const empresaId = getEmpresaId();
            if (!empresaId) throw new Error('Empresa não identificada.');
            const { error } = await supabase.from('beneficios').insert({
                empresa_id: empresaId,
                nome: newBenNome.trim(),
                tipo: newBenType,
                descricao: newBenDesc || null,
                ativo: true,
            });
            if (error) throw error;
            setNewBenNome('');
            setNewBenDesc('');
            await loadBeneficios();
            showToast('Benefício adicionado com sucesso.', 'success');
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro ao adicionar benefício.';
            showToast(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateBeneficio = async (id: string) => {
        if (!editBenNome.trim()) {
            showToast('Informe o nome do benefício.', 'warning');
            return;
        }
        setSaving(true);
        try {
            const { error } = await supabase.from('beneficios').update({ nome: editBenNome.trim() }).eq('id', id);
            if (error) throw error;
            setEditingBen(null);
            await loadBeneficios();
            showToast('Benefício atualizado com sucesso.', 'success');
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro ao atualizar benefício.';
            showToast(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteBeneficio = async (id: string) => {
        if (!confirm('Desativar este benefício?')) return;
        setSaving(true);
        try {
            const { error } = await supabase.from('beneficios').update({ ativo: false }).eq('id', id);
            if (error) throw error;
            await loadBeneficios();
            showToast('Benefício desativado com sucesso.', 'success');
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro ao desativar benefício.';
            showToast(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSeedBeneficios = async () => {
        if (!confirm('Isso irá adicionar os benefícios padrão ao sistema. Confirmar?')) return;
        setSaving(true);
        try {
            const empresaId = getEmpresaId();
            if (!empresaId) throw new Error('Empresa não identificada.');
            const inserts = [];
            for (const [tipo, lista] of Object.entries(defaultBenefits)) {
                for (const nome of lista) {
                    // Check if exists to avoid duplicates (simple check)
                    const exists = beneficiosDisponiveis.some(
                        b => b.nome === nome && normalizeTipoBeneficio(b.tipo) === normalizeTipoBeneficio(tipo)
                    );
                    if (!exists) {
                        inserts.push({
                            empresa_id: empresaId,
                            nome,
                            tipo,
                            ativo: true
                        });
                    }
                }
            }
            if (inserts.length > 0) {
                const { error } = await supabase.from('beneficios').insert(inserts);
                if (error) {
                    throw error;
                } else {
                    showToast(`${inserts.length} benefícios padrão adicionados.`, 'success');
                }
            } else {
                showToast('Todos os benefícios padrão já existem.', 'info');
            }
            await loadBeneficios();
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Erro ao restaurar benefícios padrão.';
            showToast(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-8">
            <PageHeader
                title="Benefícios"
                subtitle="Gerencie os serviços inclusos nos planos"
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => { loadBeneficios(); }}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                    </Button>
                }
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Benefícios Ativos', value: beneficiosDisponiveis.length, color: 'from-blue-500 to-indigo-600', textColor: 'text-indigo-600' },
                    { label: 'Setor Funerário', value: tipoStats.funerario, color: 'from-emerald-500 to-teal-600', textColor: 'text-teal-600' },
                    { label: 'Setor Odonto', value: tipoStats.odontologico, color: 'from-cyan-500 to-blue-600', textColor: 'text-cyan-600' },
                    { label: 'Óptica & Saúde', value: tipoStats.optica + tipoStats.saude, color: 'from-rose-500 to-pink-600', textColor: 'text-rose-600' }
                ].map((stat, i) => (
                    <Card key={i} className="p-5 overflow-hidden relative group hover:shadow-xl hover:border-slate-300 transition-all duration-300 transform hover:-translate-y-0.5">
                        <div className={`absolute -right-6 -bottom-6 w-20 h-20 rounded-full filter blur-xl opacity-10 group-hover:opacity-20 transition-all duration-500 bg-gradient-to-br ${stat.color}`} />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                        <p className="text-2xl font-black text-slate-800 tracking-tight mt-1">{stat.value}</p>
                    </Card>
                ))}
            </div>

            <div className="space-y-4">
                {/* Add new */}
                {canEdit && (
                    <Card className="p-6 border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600" />
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                            Novo Benefício do Sistema
                        </h4>
                        <div className="flex flex-col xl:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <Input
                                    label="Nome do Benefício"
                                    placeholder="Ex: Urna Funerária Luxo ou Limpeza..."
                                    value={newBenNome}
                                    onChange={(e) => setNewBenNome(e.target.value)}
                                />
                            </div>
                            <div className="w-full xl:w-44 flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Setor / Tipo</label>
                                <select
                                    value={newBenType}
                                    onChange={(e) => setNewBenType(e.target.value as (typeof BENEFICIO_TIPOS)[number]['value'])}
                                    className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                                >
                                    {BENEFICIO_TIPOS.map((tipo) => (
                                        <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1 w-full">
                                <Input
                                    label="Descrição Curta (Opcional)"
                                    placeholder="Detalhes sobre o benefício..."
                                    value={newBenDesc}
                                    onChange={(e) => setNewBenDesc(e.target.value)}
                                />
                            </div>
                            <Button onClick={handleAddBeneficio} loading={saving} disabled={!newBenNome.trim()} className="w-full xl:w-auto h-10">
                                <Plus className="h-4 w-4 mr-2" /> Adicionar Benefício
                            </Button>
                        </div>
                    </Card>
                )}

                {/* Actions Row */}
                <Card className="p-4 border border-slate-200 shadow-sm bg-slate-50/50">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={handleSeedBeneficios} loading={saving} className="text-slate-600 hover:text-slate-900 border border-slate-200 bg-white">
                            <Shield className="h-4 w-4 mr-2 text-indigo-600" /> Restaurar Benefícios Padrões
                        </Button>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap hidden md:block">
                                Mostrando {filteredBeneficios.length} de {beneficiosDisponiveis.length}
                            </div>
                            <div className="w-full sm:w-56 flex flex-col gap-1">
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="w-full h-9 px-3 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none"
                                >
                                    <option value="todos">Filtrar por Categoria (Todas)</option>
                                    {BENEFICIO_TIPOS.map((tipo) => (
                                        <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredBeneficios.map((ben) => {
                        const benType = normalizeTipoBeneficio(ben.tipo);
                        const sideColor = benType === 'funerario' ? '#6366f1' : benType === 'odontologico' ? '#06b6d4' : benType === 'saude' ? '#f43f5e' : '#8b5cf6';
                        return (
                            <Card key={ben.id} className="p-4 border border-slate-200 hover:shadow-xl hover:border-slate-300 transition-all duration-200 flex flex-col justify-between relative group overflow-hidden pl-5">
                                <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: sideColor }} />
                                
                                {editingBen === ben.id ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={editBenNome}
                                            onChange={(e) => setEditBenNome(e.target.value)}
                                            className="flex-1 px-3 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                                        />
                                        <button onClick={() => handleUpdateBeneficio(ben.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="h-4 w-4" /></button>
                                        <button onClick={() => setEditingBen(null)} className="p-1 text-gray-400 hover:bg-gray-50 rounded"><X className="h-4 w-4" /></button>
                                    </div>
                                ) : (
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-slate-800 text-sm tracking-tight">{ben.nome}</p>
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${getTipoBadgeClass(benType)}`}>
                                                    {benType}
                                                </span>
                                            </div>
                                            {ben.descricao && <p className="text-xs text-slate-500">{ben.descricao}</p>}
                                        </div>
                                        {canEdit && (
                                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                                                <button
                                                    onClick={() => { setEditingBen(ben.id); setEditBenNome(ben.nome); }}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                                                >
                                                    <Edit3 className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => handleDeleteBeneficio(ben.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-colors">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
                {beneficiosDisponiveis.length === 0 && (
                    <p className="text-center text-slate-400 py-12 italic text-sm">Nenhum benefício cadastrado</p>
                )}
                {beneficiosDisponiveis.length > 0 && filteredBeneficios.length === 0 && (
                    <p className="text-center text-slate-400 py-12 italic text-sm">Nenhum benefício encontrado para o filtro selecionado</p>
                )}
            </div>
        </div>
    );
};

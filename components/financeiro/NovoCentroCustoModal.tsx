import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertCircle, Trash2, Building, Save, Power } from 'lucide-react';
import { Button, Input, Select, Label } from '../../components/ui/Components';
import { useFinanceiro, type CentroCusto } from '../../lib/FinanceiroStore';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

interface NovoCentroCustoModalProps {
    centro?: CentroCusto | null;
    onClose: () => void;
    onSuccess: () => void;
}

const tiposCentroCusto = [
    { value: 'administrativo', label: 'Administrativo', icon: '🏢' },
    { value: 'comercial', label: 'Comercial', icon: '💼' },
    { value: 'operacional', label: 'Operacional', icon: '⚙️' },
    { value: 'marketing', label: 'Marketing', icon: '📣' },
    { value: 'ti', label: 'Tecnologia', icon: '💻' },
    { value: 'financeiro', label: 'Financeiro', icon: '💰' },
    { value: 'rh', label: 'Recursos Humanos', icon: '👥' },
    { value: 'diretoria', label: 'Diretoria', icon: '🏛️' },
    { value: 'outros', label: 'Outros', icon: '📌' },
];

const formatCentavosBR = (centavos: number) =>
    (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const NovoCentroCustoModal: React.FC<NovoCentroCustoModalProps> = ({ centro, onClose, onSuccess }) => {
    const { centrosCusto, criarCentroCusto, atualizarCentroCusto, excluirCentroCusto } = useFinanceiro();
    const { user } = useAuth();
    const empresaId = user?.empresa_id;

    const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        codigo: '',
        nome: '',
        tipo: 'operacional',
        pai_id: '',
        responsavel_id: '',
        orcamento_mensal_centavos: 0,
        ativo: true,
    });

    // Sugere código próximo automaticamente quando cadastrando novo
    const proximoCodigoSugerido = useMemo(() => {
        if (centro) return centro.codigo;
        const codigosNumeros = centrosCusto
            .map(c => parseInt((c.codigo || '').replace(/\D/g, ''), 10))
            .filter(n => !isNaN(n));
        const maior = codigosNumeros.length > 0 ? Math.max(...codigosNumeros) : 0;
        const proximo = maior + 1;
        return `CC-${String(proximo).padStart(3, '0')}`;
    }, [centrosCusto, centro]);

    useEffect(() => {
        const loadUsuarios = async () => {
            if (!empresaId) return;
            const { data } = await supabase
                .from('users')
                .select('id, nome')
                .eq('empresa_id', empresaId)
                .order('nome', { ascending: true });
            setUsuarios((data ?? []) as Array<{ id: string; nome: string }>);
        };
        loadUsuarios();
    }, [empresaId]);

    useEffect(() => {
        if (centro) {
            setFormData({
                codigo: centro.codigo,
                nome: centro.nome,
                tipo: centro.tipo || 'operacional',
                pai_id: centro.pai_id || '',
                responsavel_id: centro.responsavel_id || '',
                orcamento_mensal_centavos: centro.orcamento_mensal_centavos || 0,
                ativo: centro.ativo !== false,
            });
        } else {
            setFormData(prev => ({ ...prev, codigo: proximoCodigoSugerido }));
        }
    }, [centro, proximoCodigoSugerido]);

    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleOrcamentoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const centavos = parseInt(raw || '0', 10);
        handleChange('orcamento_mensal_centavos', centavos);
    };

    const tipoSelecionado = useMemo(
        () => tiposCentroCusto.find(t => t.value === formData.tipo),
        [formData.tipo],
    );

    const possiveisPais = useMemo(
        () => centrosCusto.filter(c => c.id !== centro?.id),
        [centrosCusto, centro],
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formData.nome.trim()) {
            setError('Informe o nome do centro de custo.');
            return;
        }
        if (!formData.codigo.trim()) {
            setError('Informe um código identificador.');
            return;
        }

        setLoading(true);
        try {
            const payload: Partial<CentroCusto> = {
                codigo: formData.codigo.trim(),
                nome: formData.nome.trim(),
                tipo: formData.tipo,
                orcamento_mensal_centavos: formData.orcamento_mensal_centavos,
                ativo: formData.ativo,
                pai_id: formData.pai_id || null,
                responsavel_id: formData.responsavel_id || null,
            };

            if (centro) {
                await atualizarCentroCusto(centro.id, payload);
            } else {
                await criarCentroCusto(payload);
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            const msg = err?.message || 'Erro ao salvar centro de custo';
            if (msg.includes('duplicate') || msg.includes('unique')) {
                setError('Já existe um centro de custo com este código.');
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!centro) return;
        if (!window.confirm(`Excluir o centro de custo "${centro.nome}"? Esta ação não pode ser desfeita.`)) return;
        setLoading(true);
        setError(null);
        try {
            await excluirCentroCusto(centro.id);
            onSuccess();
            onClose();
        } catch (err: any) {
            const msg = err?.message || 'Erro ao excluir centro de custo';
            if (msg.includes('foreign key') || msg.includes('violates')) {
                setError('Este centro de custo está vinculado a lançamentos ou outros centros e não pode ser excluído. Considere desativá-lo.');
            } else {
                setError(msg);
            }
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-sky-50 to-blue-50">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center text-2xl">
                            {tipoSelecionado?.icon || '🏢'}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">
                                {centro ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
                            </h2>
                            <p className="text-xs text-gray-500">
                                Defina código, tipo, orçamento e responsável
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-white/60 rounded-full transition-colors"
                        aria-label="Fechar"
                    >
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm border border-red-100">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Identificação */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                            <Building className="h-3.5 w-3.5" />
                            Identificação
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-1">
                                <Label>Código *</Label>
                                <Input
                                    value={formData.codigo}
                                    onChange={e => handleChange('codigo', e.target.value)}
                                    placeholder="CC-001"
                                    required
                                />
                                <p className="text-[11px] text-gray-400 mt-1">Identificador único interno</p>
                            </div>
                            <div className="md:col-span-2">
                                <Label>Nome *</Label>
                                <Input
                                    value={formData.nome}
                                    onChange={e => handleChange('nome', e.target.value)}
                                    placeholder="Ex: Operações de Funerária, Marketing Digital..."
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Tipo</Label>
                            <Select value={formData.tipo} onChange={e => handleChange('tipo', e.target.value)}>
                                {tiposCentroCusto.map(t => (
                                    <option key={t.value} value={t.value}>
                                        {t.icon} {t.label}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    </section>

                    {/* Estrutura */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Estrutura
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label>Centro Pai (opcional)</Label>
                                <Select value={formData.pai_id} onChange={e => handleChange('pai_id', e.target.value)}>
                                    <option value="">— Sem hierarquia —</option>
                                    {possiveisPais.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.codigo} • {c.nome}
                                        </option>
                                    ))}
                                </Select>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Para criar uma hierarquia (ex: Marketing &gt; Mídia paga)
                                </p>
                            </div>
                            <div>
                                <Label>Responsável (opcional)</Label>
                                <Select
                                    value={formData.responsavel_id}
                                    onChange={e => handleChange('responsavel_id', e.target.value)}
                                >
                                    <option value="">— Não atribuído —</option>
                                    {usuarios.map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.nome}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>
                    </section>

                    {/* Orçamento */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Orçamento mensal
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label>Limite mensal (R$)</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                                        R$
                                    </span>
                                    <Input
                                        className="pl-9 text-right tabular-nums"
                                        value={formatCentavosBR(formData.orcamento_mensal_centavos)}
                                        onChange={handleOrcamentoChange}
                                        inputMode="numeric"
                                    />
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Use 0 para "sem limite definido"
                                </p>
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-sky-300 cursor-pointer w-full transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={formData.ativo}
                                        onChange={e => handleChange('ativo', e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                                            <Power className="h-3.5 w-3.5" />
                                            Centro ativo
                                        </p>
                                        <p className="text-[11px] text-gray-500">
                                            Inativos não aparecem em novos lançamentos
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </section>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t">
                        <div>
                            {centro && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleDelete}
                                    disabled={loading}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Excluir
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={loading}>
                                <Save className="h-4 w-4 mr-2" />
                                {loading ? 'Salvando...' : centro ? 'Salvar alterações' : 'Cadastrar centro'}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

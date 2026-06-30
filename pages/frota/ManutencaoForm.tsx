import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    Wrench, Save, ArrowLeft, Calendar,
    Car, DollarSign, AlertTriangle, FileText
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Textarea, Card } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { frotaGetManutencao, frotaInsertManutencao, frotaListVeiculos, frotaUpdateManutencao } from '../../lib/frotaSupabase';

interface ManutencaoFormData {
    veiculo_id: string;
    tipo: 'preventiva' | 'corretiva';
    data_inicio: string;
    data_fim: string;
    km_veiculo: string;
    descricao: string;
    valor_total: string;
    oficina: string;
    status: 'pendente' | 'em_andamento' | 'concluido' | 'cancelado';
}

const initialData: ManutencaoFormData = {
    veiculo_id: '',
    tipo: 'preventiva',
    data_inicio: new Date().toISOString().slice(0, 10),
    data_fim: '',
    km_veiculo: '',
    descricao: '',
    valor_total: '0',
    oficina: '',
    status: 'concluido',
};

export const ManutencaoForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [formData, setFormData] = useState<ManutencaoFormData>(initialData);
    const [registroEmpresaId, setRegistroEmpresaId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [veiculos, setVeiculos] = useState<{ id: string; placa: string; modelo: string }[]>([]);

    const isEditing = !!id;

    useEffect(() => {
        const loadData = async () => {
            if (!empresaIdEfetivo) return;
            if (skipUntilGrupoCarrega) return;
            setRegistroEmpresaId(null);
            setLoading(true);
            try {
                const veicRows = await frotaListVeiculos(empresaIdEfetivo, {}, frotaOpts);
                setVeiculos(veicRows.map((v: any) => ({ id: v.id, placa: v.placa, modelo: v.modelo })));

                if (isEditing && id) {
                    const m = await frotaGetManutencao(empresaIdEfetivo, id, frotaOpts);
                    if (m) {
                        setRegistroEmpresaId((m as { empresa_id?: string }).empresa_id || null);
                        setFormData({
                            veiculo_id: m.veiculo_id || '',
                            tipo: m.tipo || 'preventiva',
                            data_inicio: m.data_inicio || '',
                            data_fim: m.data_fim || '',
                            km_veiculo: String(m.km_veiculo || ''),
                            descricao: m.descricao || '',
                            valor_total: String(m.valor_total || '0'),
                            oficina: m.oficina || '',
                            status: m.status || 'concluido',
                        });
                    }
                }
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Erro ao carregar dados', 'error');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id, isEditing, empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!empresaIdEfetivo) return;

        setSaving(true);
        try {
            const payload = {
                ...formData,
                km_veiculo: parseFloat(formData.km_veiculo),
                valor_total: parseFloat(formData.valor_total),
                data_fim: formData.data_fim || null,
            };

            const empSalvar = registroEmpresaId || empresaIdEfetivo;
            if (isEditing && id) {
                await frotaUpdateManutencao(empSalvar, id, payload as unknown as Record<string, unknown>);
                showToast('Manutenção atualizada com sucesso!', 'success');
            } else {
                await frotaInsertManutencao(empresaIdEfetivo, payload as unknown as Record<string, unknown>);
                showToast('Manutenção registrada com sucesso!', 'success');
            }
            navigate('/frota/manutencao');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar manutenção', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <PageHeader
                title={isEditing ? 'Editar Manutenção' : 'Registrar Manutenção'}
                subtitle="Histórico de revisões e consertos da frota"
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => navigate('/frota/manutencao')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Veículo e Tipo */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Wrench className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Dados Gerais</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select label="Veículo *" name="veiculo_id" value={formData.veiculo_id} onChange={handleChange} required>
                                <option value="">Selecione um veículo</option>
                                {veiculos.map(v => (
                                    <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>
                                ))}
                            </Select>
                            <Select label="Tipo de Manutenção *" name="tipo" value={formData.tipo} onChange={handleChange} required>
                                <option value="preventiva">Preventiva (Revisão)</option>
                                <option value="corretiva">Corretiva (Conserto)</option>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <Input
                                label="Data Início *"
                                name="data_inicio"
                                type="date"
                                value={formData.data_inicio}
                                onChange={handleChange}
                                required
                            />
                            <Input
                                label="Data Fim"
                                name="data_fim"
                                type="date"
                                value={formData.data_fim}
                                onChange={handleChange}
                            />
                            <Input
                                label="KM do Veículo *"
                                name="km_veiculo"
                                type="number"
                                value={formData.km_veiculo}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </Card>

                    {/* Status e Valor */}
                    <Card className="p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <DollarSign className="h-5 w-5 text-emerald-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Custos e Status</h3>
                        </div>

                        <Select label="Status *" name="status" value={formData.status} onChange={handleChange} required>
                            <option value="pendente">Pendente</option>
                            <option value="em_andamento">Em Andamento</option>
                            <option value="concluido">Concluído</option>
                            <option value="cancelado">Cancelado</option>
                        </Select>

                        <Input
                            label="Custo Total (R$)"
                            name="valor_total"
                            type="number"
                            step="0.01"
                            value={formData.valor_total}
                            onChange={handleChange}
                            placeholder="0.00"
                        />
                    </Card>

                    {/* Detalhes */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <FileText className="h-5 w-5 text-amber-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Descrição dos Serviços</h3>
                        </div>

                        <Input
                            label="Oficina / Prestador"
                            name="oficina"
                            value={formData.oficina}
                            onChange={handleChange}
                            placeholder="Nome da oficina ou mecânico"
                        />

                        <Textarea
                            label="Descrição Detalhada *"
                            name="descricao"
                            value={formData.descricao}
                            onChange={handleChange}
                            placeholder="Descreva as peças trocadas e serviços realizados..."
                            className="min-h-[150px]"
                            required
                        />
                    </Card>

                    <Card className="p-6 bg-blue-50 border-blue-100">
                        <div className="flex gap-3">
                            <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <div className="text-sm text-blue-800">
                                <p className="font-semibold">Lembrete:</p>
                                <p className="mt-1">Ao concluir uma manutenção, verifique se é necessário atualizar a próxima revisão no cadastro do veículo.</p>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => navigate('/frota/manutencao')}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditing ? 'Salvar Alterações' : 'Registrar Manutenção'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    AlertTriangle, Save, ArrowLeft, Calendar, 
    Car, Users, FileText
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Textarea, Card } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import {
    frotaGetOcorrencia,
    frotaInsertOcorrencia,
    frotaListMotoristas,
    frotaListVeiculos,
    frotaUpdateOcorrencia,
} from '../../lib/frotaSupabase';

interface OcorrenciaFormData {
    veiculo_id: string;
    motorista_id: string;
    tipo: 'acidente' | 'multa' | 'avaria' | 'outro';
    data_ocorrencia: string;
    gravidade: 'leve' | 'media' | 'grave';
    descricao: string;
    status: 'pendente' | 'em_analise' | 'resolvido';
}

const initialData: OcorrenciaFormData = {
    veiculo_id: '',
    motorista_id: '',
    tipo: 'avaria',
    data_ocorrencia: new Date().toISOString().slice(0, 10),
    gravidade: 'leve',
    descricao: '',
    status: 'pendente',
};

export const OcorrenciaForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [formData, setFormData] = useState<OcorrenciaFormData>(initialData);
    const [registroEmpresaId, setRegistroEmpresaId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [veiculos, setVeiculos] = useState<{ id: string; placa: string; modelo: string }[]>([]);
    const [motoristas, setMotoristas] = useState<{ id: string; nome: string }[]>([]);

    const isEditing = !!id;

    useEffect(() => {
        const loadData = async () => {
            if (!empresaIdEfetivo) return;
            if (skipUntilGrupoCarrega) return;
            setRegistroEmpresaId(null);
            setLoading(true);
            try {
                const [veicRows, motRows] = await Promise.all([
                    frotaListVeiculos(empresaIdEfetivo, {}, frotaOpts),
                    frotaListMotoristas(empresaIdEfetivo, {}, frotaOpts),
                ]);
                setVeiculos(veicRows.map((v: any) => ({ id: v.id, placa: v.placa, modelo: v.modelo })));
                setMotoristas(motRows.map((m: any) => ({ id: m.id, nome: m.nome })));

                if (isEditing && id) {
                    const o = await frotaGetOcorrencia(empresaIdEfetivo, id, frotaOpts);
                    if (o) {
                        setRegistroEmpresaId((o as { empresa_id?: string }).empresa_id || null);
                        setFormData({
                            veiculo_id: o.veiculo_id || '',
                            motorista_id: o.motorista_id || '',
                            tipo: o.tipo || 'avaria',
                            data_ocorrencia: o.data_ocorrencia || '',
                            gravidade: o.gravidade || 'leve',
                            descricao: o.descricao || '',
                            status: o.status || 'pendente',
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
            const empSalvar = registroEmpresaId || empresaIdEfetivo;
            if (isEditing && id) {
                await frotaUpdateOcorrencia(empSalvar, id, formData as unknown as Record<string, unknown>);
                showToast('Ocorrência atualizada com sucesso!', 'success');
            } else {
                await frotaInsertOcorrencia(empresaIdEfetivo, formData as unknown as Record<string, unknown>);
                showToast('Ocorrência registrada com sucesso!', 'success');
            }
            navigate('/frota/ocorrencias');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar ocorrência', 'error');
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
                title={isEditing ? 'Editar Ocorrência' : 'Nova Ocorrência'}
                subtitle="Registro detalhado de incidentes da frota"
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => navigate('/frota/ocorrencias')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-2 border-b pb-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <h3 className="text-lg font-semibold text-gray-900">Detalhes do Incidente</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select label="Veículo *" name="veiculo_id" value={formData.veiculo_id} onChange={handleChange} required>
                            <option value="">Selecione um veículo</option>
                            {veiculos.map(v => (
                                <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>
                            ))}
                        </Select>
                        <Select label="Motorista *" name="motorista_id" value={formData.motorista_id} onChange={handleChange} required>
                            <option value="">Selecione o motorista</option>
                            {motoristas.map(m => (
                                <option key={m.id} value={m.id}>{m.nome}</option>
                            ))}
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                            label="Data da Ocorrência *"
                            name="data_ocorrencia"
                            type="date"
                            value={formData.data_ocorrencia}
                            onChange={handleChange}
                            required
                        />
                        <Select label="Tipo *" name="tipo" value={formData.tipo} onChange={handleChange} required>
                            <option value="avaria">Avaria / Dano</option>
                            <option value="acidente">Acidente</option>
                            <option value="multa">Multa</option>
                            <option value="outro">Outro</option>
                        </Select>
                        <Select label="Gravidade *" name="gravidade" value={formData.gravidade} onChange={handleChange} required>
                            <option value="leve">Leve</option>
                            <option value="media">Média</option>
                            <option value="grave">Grave</option>
                        </Select>
                    </div>

                    <Textarea
                        label="Descrição da Ocorrência *"
                        name="descricao"
                        value={formData.descricao}
                        onChange={handleChange}
                        placeholder="Descreva detalhadamente o ocorrido..."
                        className="min-h-[150px]"
                        required
                    />

                    <Select label="Status da Resolução *" name="status" value={formData.status} onChange={handleChange} required>
                        <option value="pendente">Pendente</option>
                        <option value="em_analise">Em Análise</option>
                        <option value="resolvido">Resolvido</option>
                    </Select>
                </Card>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => navigate('/frota/ocorrencias')}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditing ? 'Salvar Alterações' : 'Registrar Ocorrência'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

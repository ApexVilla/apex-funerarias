import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    Users, Save, ArrowLeft, Check, AlertCircle, 
    Calendar, CreditCard, Phone, Mail, MapPin
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Textarea, Card } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import { frotaGetMotorista, frotaInsertMotorista, frotaUpdateMotorista } from '../../lib/frotaSupabase';

interface MotoristaFormData {
    nome: string;
    cpf: string;
    cnh_numero: string;
    cnh_categoria: string;
    cnh_vencimento: string;
    email: string;
    telefone: string;
    status: string;
    observacao: string;
}

const initialData: MotoristaFormData = {
    nome: '',
    cpf: '',
    cnh_numero: '',
    cnh_categoria: 'B',
    cnh_vencimento: '',
    email: '',
    telefone: '',
    status: 'ativo',
    observacao: '',
};

export const MotoristaForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [formData, setFormData] = useState<MotoristaFormData>(initialData);
    const [registroEmpresaId, setRegistroEmpresaId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const isEditing = !!id;

    useEffect(() => {
        const loadData = async () => {
            if (!isEditing || !id) return;
            if (!empresaIdEfetivo || skipUntilGrupoCarrega) return;
            setRegistroEmpresaId(null);
            setLoading(true);
            try {
                const m = await frotaGetMotorista(empresaIdEfetivo, id, frotaOpts);
                if (m) {
                    setRegistroEmpresaId((m as { empresa_id?: string }).empresa_id || null);
                    setFormData({
                        nome: m.nome || '',
                        cpf: m.cpf || '',
                        cnh_numero: m.cnh_numero || '',
                        cnh_categoria: m.cnh_categoria || 'B',
                        cnh_vencimento: m.cnh_vencimento || '',
                        email: m.email || '',
                        telefone: m.telefone || '',
                        status: m.status || 'ativo',
                        observacao: m.observacao || '',
                    });
                }
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Erro ao carregar motorista', 'error');
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
                await frotaUpdateMotorista(empSalvar, id, formData as unknown as Record<string, unknown>);
                showToast('Motorista atualizado com sucesso!', 'success');
            } else {
                await frotaInsertMotorista(empresaIdEfetivo, formData as unknown as Record<string, unknown>);
                showToast('Motorista cadastrado com sucesso!', 'success');
            }
            navigate('/frota/motoristas');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar motorista', 'error');
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
                title={isEditing ? 'Editar Motorista' : 'Novo Motorista'}
                subtitle={isEditing ? `Editando motorista ${formData.nome}` : 'Cadastre um novo motorista no sistema'}
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => navigate('/frota/motoristas')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Informações Pessoais */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Users className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Dados Pessoais</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Nome Completo *"
                                name="nome"
                                value={formData.nome}
                                onChange={handleChange}
                                placeholder="Nome do motorista"
                                required
                            />
                            <Input
                                label="CPF"
                                name="cpf"
                                value={formData.cpf}
                                onChange={handleChange}
                                placeholder="000.000.000-00"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="E-mail"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="motorista@exemplo.com"
                            />
                            <Input
                                label="Telefone"
                                name="telefone"
                                value={formData.telefone}
                                onChange={handleChange}
                                placeholder="(00) 00000-0000"
                            />
                        </div>
                    </Card>

                    {/* Status */}
                    <Card className="p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Check className="h-5 w-5 text-emerald-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Status</h3>
                        </div>

                        <Select label="Situação *" name="status" value={formData.status} onChange={handleChange} required>
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                            <option value="ferias">Em Férias</option>
                            <option value="afastado">Afastado</option>
                        </Select>
                    </Card>

                    {/* Habilitação */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <CreditCard className="h-5 w-5 text-purple-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Habilitação (CNH)</h3>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <Input
                                label="Número CNH *"
                                name="cnh_numero"
                                value={formData.cnh_numero}
                                onChange={handleChange}
                                required
                            />
                            <Select label="Categoria *" name="cnh_categoria" value={formData.cnh_categoria} onChange={handleChange} required>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="E">E</option>
                                <option value="AB">AB</option>
                                <option value="AC">AC</option>
                                <option value="AD">AD</option>
                                <option value="AE">AE</option>
                            </Select>
                            <Input
                                label="Vencimento *"
                                name="cnh_vencimento"
                                type="date"
                                value={formData.cnh_vencimento}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </Card>

                    {/* Observações */}
                    <Card className="p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <AlertCircle className="h-5 w-5 text-gray-500" />
                            <h3 className="text-lg font-semibold text-gray-900">Observações</h3>
                        </div>
                        <Textarea
                            label="Notas Adicionais"
                            name="observacao"
                            value={formData.observacao}
                            onChange={handleChange}
                            placeholder="Informações relevantes sobre o motorista..."
                            className="min-h-[120px]"
                        />
                    </Card>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => navigate('/frota/motoristas')}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditing ? 'Salvar Alterações' : 'Cadastrar Motorista'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

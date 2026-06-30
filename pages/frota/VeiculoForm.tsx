import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    Car, Save, ArrowLeft, Check, AlertCircle, 
    Calendar, Hash, Fuel, Palette, Gauge
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Textarea, Card, Badge } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import {
    frotaGetVeiculo,
    frotaInsertVeiculo,
    frotaListMotoristas,
    frotaUpdateVeiculo,
} from '../../lib/frotaSupabase';

interface VeiculoFormData {
    placa: string;
    modelo: string;
    marca: string;
    ano: string;
    tipo: string;
    status: string;
    cor: string;
    km_atual: string;
    km_proxima_revisao: string;
    combustivel: string;
    vencimento_crlv: string;
    vencimento_seguro: string;
    observacao: string;
    motorista_padrao_id: string;
}

const initialData: VeiculoFormData = {
    placa: '',
    modelo: '',
    marca: '',
    ano: new Date().getFullYear().toString(),
    tipo: 'carro',
    status: 'ativo',
    cor: '',
    km_atual: '0',
    km_proxima_revisao: '10000',
    combustivel: 'flex',
    vencimento_crlv: '',
    vencimento_seguro: '',
    observacao: '',
    motorista_padrao_id: '',
};

export const VeiculoForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { user } = useAuth();
    const { showToast } = useToast();
    const isCargoAlto = ['super_admin', 'admin_empresa', 'admin_sistema', 'admin', 'diretoria', 'gerente', 'gestor'].includes(user?.role?.toLowerCase() || '');
    const [formData, setFormData] = useState<VeiculoFormData>(initialData);
    const [registroEmpresaId, setRegistroEmpresaId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [motoristas, setMotoristas] = useState<{ id: string; nome: string }[]>([]);

    const isEditing = !!id;

    useEffect(() => {
        const loadData = async () => {
            if (!empresaIdEfetivo) return;
            if (skipUntilGrupoCarrega) return;
            setRegistroEmpresaId(null);
            setLoading(true);
            try {
                // Load motoristas for selection
                const motList = await frotaListMotoristas(empresaIdEfetivo, {}, frotaOpts);
                setMotoristas(motList.map((m: any) => ({ id: m.id, nome: m.nome })));

                if (isEditing && id) {
                    const v = await frotaGetVeiculo(empresaIdEfetivo, id, frotaOpts);
                    if (v) {
                        setRegistroEmpresaId((v as { empresa_id?: string }).empresa_id || null);
                        setFormData({
                            placa: v.placa || '',
                            modelo: v.modelo || '',
                            marca: v.marca || '',
                            ano: String(v.ano || ''),
                            tipo: v.tipo || 'carro',
                            status: v.status || 'ativo',
                            cor: v.cor || '',
                            km_atual: String(v.km_atual || '0'),
                            km_proxima_revisao: String(v.km_proxima_revisao || ''),
                            combustivel: v.combustivel || 'flex',
                            vencimento_crlv: v.vencimento_crlv || '',
                            vencimento_seguro: v.vencimento_seguro || '',
                            observacao: v.observacao || '',
                            motorista_padrao_id: v.motorista_padrao_id || '',
                        });
                    }
                }
            } catch (error) {
                const msg =
                    error instanceof Error ? error.message : 'Erro ao carregar dados do formulário';
                showToast(msg, 'error');
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
            const payload: Record<string, unknown> = {
                placa: formData.placa,
                modelo: formData.modelo,
                marca: formData.marca,
                ano: parseInt(formData.ano, 10),
                tipo: formData.tipo,
                status: formData.status,
                cor: formData.cor,
                combustivel: formData.combustivel,
                km_atual: parseFloat(formData.km_atual),
                km_proxima_revisao: formData.km_proxima_revisao ? parseFloat(formData.km_proxima_revisao) : null,
                vencimento_crlv: formData.vencimento_crlv || null,
                vencimento_seguro: formData.vencimento_seguro || null,
                observacao: formData.observacao || null,
                motorista_padrao_id: formData.motorista_padrao_id || null,
            };

            const empSalvar = registroEmpresaId || empresaIdEfetivo;
            if (isEditing && id) {
                await frotaUpdateVeiculo(empSalvar, id, payload);
                showToast('Veículo atualizado com sucesso!', 'success');
            } else {
                await frotaInsertVeiculo(empresaIdEfetivo, payload);
                showToast('Veículo cadastrado com sucesso!', 'success');
            }
            navigate('/frota/veiculos');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar veículo', 'error');
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
                title={isEditing ? 'Editar Veículo' : 'Novo Veículo'}
                subtitle={isEditing ? `Editando veículo placa ${formData.placa}` : 'Cadastre um novo veículo na frota'}
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => navigate('/frota/veiculos')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Informações Principais */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Car className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Dados do Veículo</h3>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <Input
                                label="Placa *"
                                name="placa"
                                value={formData.placa}
                                onChange={handleChange}
                                placeholder="AAA-0000"
                                required
                                className="uppercase"
                            />
                            <Input
                                label="Marca *"
                                name="marca"
                                value={formData.marca}
                                onChange={handleChange}
                                placeholder="Ex: Toyota"
                                required
                            />
                            <Input
                                label="Modelo *"
                                name="modelo"
                                value={formData.modelo}
                                onChange={handleChange}
                                placeholder="Ex: Corolla"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <Input
                                label="Ano *"
                                name="ano"
                                type="number"
                                value={formData.ano}
                                onChange={handleChange}
                                required
                            />
                            <Input
                                label="Cor"
                                name="cor"
                                value={formData.cor}
                                onChange={handleChange}
                                placeholder="Ex: Branco"
                            />
                            <Select label="Tipo *" name="tipo" value={formData.tipo} onChange={handleChange} required>
                                <option value="carro">Carro</option>
                                <option value="van">Van/Furgão</option>
                                <option value="caminhao">Caminhão</option>
                                <option value="moto">Moto</option>
                                <option value="ambulancia">Ambulância</option>
                                <option value="kombi">Kombi</option>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Select label="Combustível *" name="combustivel" value={formData.combustivel} onChange={handleChange} required>
                                <option value="flex">Flex</option>
                                <option value="gasolina">Gasolina</option>
                                <option value="diesel">Diesel</option>
                                <option value="eletrico">Elétrico</option>
                                <option value="gnv">GNV</option>
                            </Select>
                            <Select label="Motorista Padrão" name="motorista_padrao_id" value={formData.motorista_padrao_id} onChange={handleChange}>
                                <option value="">Nenhum</option>
                                {motoristas.map(m => (
                                    <option key={m.id} value={m.id}>{m.nome}</option>
                                ))}
                            </Select>
                        </div>
                    </Card>

                    {/* Status e KM */}
                    <Card className="p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Gauge className="h-5 w-5 text-amber-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Status Operacional</h3>
                        </div>

                        <Select 
                            label="Status *" 
                            name="status" 
                            value={formData.status} 
                            onChange={handleChange} 
                            required
                            disabled={!isCargoAlto && isEditing}
                        >
                            <option value="ativo">Ativo</option>
                            {(isCargoAlto || formData.status === 'inativo') && <option value="inativo">Inativo</option>}
                            {(isCargoAlto || formData.status === 'manutencao') && <option value="manutencao">Em Manutenção</option>}
                        </Select>

                        <Input
                            label="Quilometragem Atual *"
                            name="km_atual"
                            type="number"
                            value={formData.km_atual}
                            onChange={handleChange}
                            required
                        />

                        <Input
                            label="Próxima Revisão (KM)"
                            name="km_proxima_revisao"
                            type="number"
                            value={formData.km_proxima_revisao}
                            onChange={handleChange}
                            helperText="Avisar quando atingir este KM"
                        />
                    </Card>

                    {/* Documentação */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Calendar className="h-5 w-5 text-emerald-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Documentação e Datas</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Vencimento CRLV"
                                name="vencimento_crlv"
                                type="date"
                                value={formData.vencimento_crlv}
                                onChange={handleChange}
                            />
                            <Input
                                label="Vencimento Seguro"
                                name="vencimento_seguro"
                                type="date"
                                value={formData.vencimento_seguro}
                                onChange={handleChange}
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
                            placeholder="Informações relevantes sobre o veículo..."
                            className="min-h-[120px]"
                        />
                    </Card>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => navigate('/frota/veiculos')}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditing ? 'Salvar Alterações' : 'Cadastrar Veículo'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

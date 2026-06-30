import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    Fuel, Save, ArrowLeft, Calendar, 
    Car, Users, DollarSign, Droplets, MapPin
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Textarea, Card } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import {
    frotaGetAbastecimento,
    frotaInsertAbastecimento,
    frotaListMotoristas,
    frotaListVeiculos,
    frotaUpdateAbastecimento,
} from '../../lib/frotaSupabase';

interface AbastecimentoFormData {
    veiculo_id: string;
    motorista_id: string;
    data_abastecimento: string;
    km_atual: string;
    litros: string;
    valor_litro: string;
    valor_total: string;
    combustivel: string;
    posto: string;
    nota_fiscal: string;
    observacao: string;
}

const initialData: AbastecimentoFormData = {
    veiculo_id: '',
    motorista_id: '',
    data_abastecimento: new Date().toISOString().slice(0, 10),
    km_atual: '',
    litros: '',
    valor_litro: '',
    valor_total: '',
    combustivel: 'diesel',
    posto: '',
    nota_fiscal: '',
    observacao: '',
};

export const AbastecimentoForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [formData, setFormData] = useState<AbastecimentoFormData>(initialData);
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
                    const a = await frotaGetAbastecimento(empresaIdEfetivo, id, frotaOpts);
                    if (a) {
                        setRegistroEmpresaId((a as { empresa_id?: string }).empresa_id || null);
                        setFormData({
                            veiculo_id: a.veiculo_id || '',
                            motorista_id: a.motorista_id || '',
                            data_abastecimento: a.data_abastecimento || '',
                            km_atual: String(a.km_atual || ''),
                            litros: String(a.litros || ''),
                            valor_litro: String(a.valor_litro || ''),
                            valor_total: String(a.valor_total || ''),
                            combustivel: a.combustivel || 'diesel',
                            posto: a.posto || '',
                            nota_fiscal: a.nota_fiscal || '',
                            observacao: a.observacao || '',
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
        
        setFormData(prev => {
            const newData = { ...prev, [name]: value };
            
            // Auto-calculate total if liters or value per liter changes
            if (name === 'litros' || name === 'valor_litro') {
                const l = parseFloat(name === 'litros' ? value : prev.litros) || 0;
                const v = parseFloat(name === 'valor_litro' ? value : prev.valor_litro) || 0;
                if (l && v) {
                    newData.valor_total = (l * v).toFixed(2);
                }
            }
            // Auto-calculate value per liter if total or liters changes
            else if (name === 'valor_total' && parseFloat(prev.litros) > 0) {
                const t = parseFloat(value) || 0;
                const l = parseFloat(prev.litros) || 0;
                newData.valor_litro = (t / l).toFixed(3);
            }

            return newData;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!empresaIdEfetivo) return;

        setSaving(true);
        try {
            const litros = parseFloat(formData.litros) || 0;
            let valorLitro = parseFloat(formData.valor_litro) || 0;
            const valorTotal = parseFloat(formData.valor_total) || 0;
            if (litros > 0 && valorLitro <= 0 && valorTotal > 0) {
                valorLitro = valorTotal / litros;
            }
            const payload = {
                ...formData,
                km_atual: parseFloat(formData.km_atual),
                litros,
                valor_litro: valorLitro,
            };

            const empSalvar = registroEmpresaId || empresaIdEfetivo;
            if (isEditing && id) {
                await frotaUpdateAbastecimento(empSalvar, id, payload as unknown as Record<string, unknown>);
                showToast('Abastecimento atualizado com sucesso!', 'success');
            } else {
                await frotaInsertAbastecimento(empresaIdEfetivo, payload as unknown as Record<string, unknown>);
                showToast('Abastecimento registrado com sucesso!', 'success');
            }
            navigate('/frota/abastecimentos');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar abastecimento', 'error');
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
                title={isEditing ? 'Editar Abastecimento' : 'Registrar Abastecimento'}
                subtitle="Controle de gastos com combustível e quilometragem"
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => navigate('/frota/abastecimentos')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Veículo e Motorista */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Fuel className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Informações Básicas</h3>
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

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <Input
                                label="Data *"
                                name="data_abastecimento"
                                type="date"
                                value={formData.data_abastecimento}
                                onChange={handleChange}
                                required
                            />
                            <Input
                                label="KM Atual *"
                                name="km_atual"
                                type="number"
                                value={formData.km_atual}
                                onChange={handleChange}
                                required
                            />
                            <Select label="Combustível *" name="combustivel" value={formData.combustivel} onChange={handleChange} required>
                                <option value="diesel">Diesel</option>
                                <option value="gasolina">Gasolina</option>
                                <option value="flex">Flex</option>
                                <option value="gnv">GNV</option>
                            </Select>
                        </div>
                    </Card>

                    {/* Valores */}
                    <Card className="p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <DollarSign className="h-5 w-5 text-emerald-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Valores</h3>
                        </div>

                        <Input
                            label="Litros *"
                            name="litros"
                            type="number"
                            step="0.001"
                            value={formData.litros}
                            onChange={handleChange}
                            required
                        />

                        <Input
                            label="Valor por Litro (R$)"
                            name="valor_litro"
                            type="number"
                            step="0.001"
                            value={formData.valor_litro}
                            onChange={handleChange}
                        />

                        <Input
                            label="Valor Total (R$) *"
                            name="valor_total"
                            type="number"
                            step="0.01"
                            value={formData.valor_total}
                            onChange={handleChange}
                            required
                        />
                    </Card>

                    {/* Local e Documento */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <MapPin className="h-5 w-5 text-amber-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Local e Comprovante</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Posto de Combustível"
                                name="posto"
                                value={formData.posto}
                                onChange={handleChange}
                                placeholder="Nome do posto"
                            />
                            <Input
                                label="Número da Nota Fiscal"
                                name="nota_fiscal"
                                value={formData.nota_fiscal}
                                onChange={handleChange}
                                placeholder="Nº NF-e"
                            />
                        </div>
                    </Card>

                    {/* Observações */}
                    <Card className="p-6 space-y-5">
                        <Textarea
                            label="Observações"
                            name="observacao"
                            value={formData.observacao}
                            onChange={handleChange}
                            placeholder="Notas adicionais..."
                            className="min-h-[100px]"
                        />
                    </Card>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => navigate('/frota/abastecimentos')}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditing ? 'Salvar Alterações' : 'Registrar Abastecimento'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

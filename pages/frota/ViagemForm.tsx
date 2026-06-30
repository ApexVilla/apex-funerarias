import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { 
    MapPin, Save, ArrowLeft, Navigation, Clock, Hash, Edit3,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Textarea, Card } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useFrotaEmpresaContext } from '../../lib/useFrotaEmpresaContext';
import {
    frotaGetViagem,
    frotaInsertViagem,
    frotaListMotoristas,
    frotaListVeiculos,
    frotaUpdateViagem,
    calcKmPercorridoViagem,
    validarKmViagem,
} from '../../lib/frotaSupabase';

type TipoViagem = 'servico' | 'transporte' | 'administrativa' | 'emergencia';

interface ViagemFormData {
    veiculo_id: string;
    motorista_id: string;
    tipo: TipoViagem;
    data_saida: string;
    hora_saida: string;
    data_chegada: string;
    hora_chegada: string;
    km_saida: string;
    km_chegada: string;
    origem: string;
    destino: string;
    objetivo: string;
    status: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
    paradas?: Array<{ local: string; horario: string; motivo: string }>;
}

const STATUS_LABEL: Record<ViagemFormData['status'], string> = {
    agendada: 'Agendada',
    em_andamento: 'Em rota',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
};

const TIPO_LABEL: Record<string, string> = {
    servico: 'Serviço',
    transporte: 'Transporte',
    administrativa: 'Administrativa',
    emergencia: 'Emergência',
};

function CampoLeitura({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
            <p className="text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 min-h-[2.75rem] flex items-center">
                {value || '—'}
            </p>
        </div>
    );
}

const initialData: ViagemFormData = {
    veiculo_id: '',
    motorista_id: '',
    tipo: 'servico',
    data_saida: new Date().toISOString().slice(0, 10),
    hora_saida: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    data_chegada: '',
    hora_chegada: '',
    km_saida: '',
    km_chegada: '',
    origem: '',
    destino: '',
    objetivo: '',
    status: 'em_andamento',
    paradas: [],
};

export const ViagemForm: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const { empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega } = useFrotaEmpresaContext();
    const { showToast } = useToast();
    const [formData, setFormData] = useState<ViagemFormData>(initialData);
    const [registroEmpresaId, setRegistroEmpresaId] = useState<string | null>(null);
    const [detalhe, setDetalhe] = useState<{
        codigo?: string;
        tipo?: string;
        placa?: string;
        modelo?: string;
        motorista_nome?: string;
        atendimento_id?: string | null;
        atendimento_codigo?: string | null;
    }>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [veiculos, setVeiculos] = useState<{ id: string; placa: string; modelo: string }[]>([]);
    const [motoristas, setMotoristas] = useState<{ id: string; nome: string }[]>([]);

    const somenteLeitura = !!id && !location.pathname.endsWith('/editar');
    const isEdicao = !!id && location.pathname.endsWith('/editar');

    useEffect(() => {
        const loadData = async () => {
            if (!empresaIdEfetivo) return;
            setRegistroEmpresaId(null);
            setLoading(true);
            try {
                const [veicRows, motRows] = await Promise.all([
                    frotaListVeiculos(empresaIdEfetivo, {}, frotaOpts),
                    frotaListMotoristas(empresaIdEfetivo, {}, frotaOpts),
                ]);
                setVeiculos(veicRows.map((v: any) => ({ id: v.id, placa: v.placa, modelo: v.modelo })));
                setMotoristas(motRows.map((m: any) => ({ id: m.id, nome: m.nome })));

                if (id) {
                    const v = await frotaGetViagem(empresaIdEfetivo, id, frotaOpts);
                    if (v) {
                        setRegistroEmpresaId((v as { empresa_id?: string }).empresa_id || null);
                        setDetalhe({
                            codigo: v.codigo,
                            tipo: v.tipo,
                            placa: v.placa,
                            modelo: v.modelo,
                            motorista_nome: v.motorista_nome,
                            atendimento_id: v.atendimento_id || null,
                            atendimento_codigo: v.atendimento_codigo || null,
                        });
                        setFormData({
                            veiculo_id: v.veiculo_id || '',
                            motorista_id: v.motorista_id || '',
                            tipo: (['servico', 'transporte', 'administrativa', 'emergencia'].includes(v.tipo)
                                ? v.tipo
                                : 'servico') as TipoViagem,
                            data_saida: v.data_saida || '',
                            hora_saida: v.hora_saida || '',
                            data_chegada: v.data_chegada || '',
                            hora_chegada: v.hora_chegada || '',
                            km_saida: String(v.km_saida || ''),
                            km_chegada: String(v.km_chegada || ''),
                            origem: v.origem || '',
                            destino: v.destino || '',
                            objetivo: v.objetivo || v.descricao || v.observacao || '',
                            status: v.status || 'concluida',
                            paradas: v.paradas || [],
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
    }, [id, empresaIdEfetivo, dataRevisionEmpresa, frotaOpts, skipUntilGrupoCarrega]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        if (somenteLeitura) return;
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const veiculoLabel =
        detalhe.placa
            ? `${detalhe.placa}${detalhe.modelo ? ` • ${detalhe.modelo}` : ''}`
            : veiculos.find((x) => x.id === formData.veiculo_id)
                ? `${veiculos.find((x) => x.id === formData.veiculo_id)!.placa} - ${veiculos.find((x) => x.id === formData.veiculo_id)!.modelo}`
                : '—';

    const motoristaLabel =
        detalhe.motorista_nome
        || motoristas.find((m) => m.id === formData.motorista_id)?.nome
        || '—';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (somenteLeitura) return;
        if (!empresaIdEfetivo) return;

        setSaving(true);
        try {
            const kmSaida = parseFloat(formData.km_saida);
            const kmChegada = formData.km_chegada ? parseFloat(formData.km_chegada) : null;
            validarKmViagem(kmSaida, kmChegada);

            const payload: Record<string, unknown> = {
                veiculo_id: formData.veiculo_id,
                motorista_id: formData.motorista_id || null,
                tipo: formData.tipo,
                data_saida: formData.data_saida,
                hora_saida: formData.hora_saida,
                data_chegada: formData.data_chegada || null,
                hora_chegada: formData.hora_chegada || null,
                km_saida: kmSaida,
                km_chegada: kmChegada,
                origem: formData.origem,
                destino: formData.destino,
                observacao: formData.objetivo || null,
                status: formData.status,
                paradas: formData.paradas || [],
            };

            const empSalvar = registroEmpresaId || empresaIdEfetivo;
            if (isEdicao && id) {
                await frotaUpdateViagem(empSalvar, id, payload);
                showToast('Viagem atualizada com sucesso!', 'success');
            } else {
                await frotaInsertViagem(empresaIdEfetivo, payload);
                showToast('Viagem registrada com sucesso!', 'success');
            }
            navigate('/frota/viagens');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar viagem', 'error');
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
        <div className="max-w-4xl mx-auto pb-28 md:pb-12 px-1 sm:px-0 min-w-0">
            <PageHeader
                title={
                    somenteLeitura
                        ? `Viagem ${detalhe.codigo || ''}`.trim()
                        : isEdicao
                            ? 'Editar viagem'
                            : 'Registrar viagem'
                }
                subtitle={
                    somenteLeitura
                        ? 'Visualização somente leitura — use Editar para alterar os dados'
                        : 'Controle de rotas, quilometragem e uso dos veículos'
                }
                actionButton={
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        {somenteLeitura && id && (
                            <Button
                                className="w-full sm:w-auto min-h-[44px]"
                                onClick={() => navigate(`/frota/viagens/${id}/editar`)}
                            >
                                <Edit3 className="h-4 w-4 mr-1" /> Editar
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            className="w-full sm:w-auto min-h-[44px]"
                            onClick={() => navigate('/frota/viagens')}
                        >
                            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                        </Button>
                    </div>
                }
            />

            {somenteLeitura && detalhe.codigo && (
                <Card className="p-4 flex flex-wrap items-center gap-3 bg-slate-50 border-slate-200">
                    <span className="font-mono font-bold text-gray-900">{detalhe.codigo}</span>
                    <span className="text-sm px-2.5 py-1 rounded-full bg-white border font-medium text-gray-700">
                        {STATUS_LABEL[formData.status]}
                    </span>
                    <span className="text-sm text-gray-600">
                        {TIPO_LABEL[formData.tipo] || formData.tipo}
                    </span>
                    {detalhe.atendimento_codigo && detalhe.atendimento_id && (
                        <button
                            type="button"
                            onClick={() => navigate(`/atendimentos/${detalhe.atendimento_id}`)}
                            className="text-xs font-semibold uppercase tracking-wide text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded hover:bg-purple-100"
                        >
                            Atendimento {detalhe.atendimento_codigo}
                        </button>
                    )}
                </Card>
            )}

            <form id="viagem-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Veículo e Motorista */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Navigation className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Veículo e Condutor</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {somenteLeitura ? (
                                <>
                                    <CampoLeitura label="Veículo" value={veiculoLabel} />
                                    <CampoLeitura label="Motorista" value={motoristaLabel} />
                                </>
                            ) : (
                                <>
                                    <Select label="Veículo *" name="veiculo_id" className="min-h-[44px] text-base sm:text-sm" value={formData.veiculo_id} onChange={handleChange} required>
                                        <option value="">Selecione um veículo</option>
                                        {veiculos.map(v => (
                                            <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>
                                        ))}
                                    </Select>
                                    <Select label="Motorista *" name="motorista_id" className="min-h-[44px] text-base sm:text-sm" value={formData.motorista_id} onChange={handleChange} required>
                                        <option value="">Selecione o motorista</option>
                                        {motoristas.map(m => (
                                            <option key={m.id} value={m.id}>{m.nome}</option>
                                        ))}
                                    </Select>
                                </>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {somenteLeitura ? (
                                <>
                                    <CampoLeitura label="Origem" value={formData.origem} />
                                    <CampoLeitura label="Destino" value={formData.destino} />
                                </>
                            ) : (
                                <>
                                    <Input
                                        label="Origem *"
                                        name="origem"
                                        value={formData.origem}
                                        onChange={handleChange}
                                        placeholder="Local de saída"
                                        required
                                    />
                                    <Input
                                        label="Destino *"
                                        name="destino"
                                        value={formData.destino}
                                        onChange={handleChange}
                                        placeholder="Local de destino"
                                        required
                                    />
                                </>
                            )}
                        </div>
                    </Card>

                    {/* Status */}
                    <Card className="p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Hash className="h-5 w-5 text-amber-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Status</h3>
                        </div>

                        {somenteLeitura ? (
                            <>
                                <CampoLeitura label="Tipo" value={TIPO_LABEL[formData.tipo] || formData.tipo} />
                                <CampoLeitura label="Situação" value={STATUS_LABEL[formData.status]} />
                                <CampoLeitura label="KM saída" value={formData.km_saida} />
                                <CampoLeitura
                                    label="KM chegada"
                                    value={
                                        formData.km_chegada
                                            ? formData.km_chegada
                                            : formData.status !== 'concluida'
                                                ? '—'
                                                : ''
                                    }
                                />
                                {formData.km_saida && formData.km_chegada && (
                                    <CampoLeitura
                                        label="KM percorridos"
                                        value={String(
                                            calcKmPercorridoViagem(
                                                Number(formData.km_saida),
                                                Number(formData.km_chegada),
                                            ) ?? 0,
                                        )}
                                    />
                                )}
                            </>
                        ) : (
                            <>
                                <Select label="Tipo *" name="tipo" className="min-h-[44px] text-base sm:text-sm" value={formData.tipo} onChange={handleChange} required>
                                    <option value="servico">Serviço (remoção, translado funerário)</option>
                                    <option value="transporte">Transporte (passageiros, deslocamento)</option>
                                    <option value="administrativa">Administrativa (banco, oficina, compras)</option>
                                    <option value="emergencia">Emergência (urgência imediata)</option>
                                </Select>
                                <Select label="Situação *" name="status" className="min-h-[44px] text-base sm:text-sm" value={formData.status} onChange={handleChange} required>
                                    <option value="agendada">Agendada</option>
                                    <option value="em_andamento">Em Rota</option>
                                    <option value="concluida">Concluída</option>
                                    <option value="cancelada">Cancelada</option>
                                </Select>

                                <Input
                                    label="KM Saída *"
                                    name="km_saida"
                                    type="number"
                                    value={formData.km_saida}
                                    onChange={handleChange}
                                    required
                                />

                                <Input
                                    label="KM Chegada"
                                    name="km_chegada"
                                    type="number"
                                    min={formData.km_saida ? Number(formData.km_saida) : 0}
                                    value={formData.km_chegada}
                                    onChange={handleChange}
                                    disabled={formData.status !== 'concluida'}
                                />
                                {formData.km_saida && formData.km_chegada && Number(formData.km_chegada) < Number(formData.km_saida) && (
                                    <p className="text-xs text-red-600">
                                        KM de chegada não pode ser menor que o KM de saída ({formData.km_saida}).
                                    </p>
                                )}
                            </>
                        )}
                    </Card>

                    {/* Datas e Horas */}
                    <Card className="md:col-span-2 p-6 space-y-5">
                        <div className="flex items-center gap-2 mb-2 border-b pb-2">
                            <Clock className="h-5 w-5 text-emerald-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Horários</h3>
                        </div>

                        {somenteLeitura ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <CampoLeitura
                                    label="Saída"
                                    value={
                                        formData.data_saida
                                            ? `${new Date(formData.data_saida + 'T12:00:00').toLocaleDateString('pt-BR')} ${formData.hora_saida || ''}`.trim()
                                            : '—'
                                    }
                                />
                                <CampoLeitura
                                    label="Chegada"
                                    value={
                                        formData.data_chegada
                                            ? `${new Date(formData.data_chegada + 'T12:00:00').toLocaleDateString('pt-BR')} ${formData.hora_chegada || ''}`.trim()
                                            : '—'
                                    }
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Saída</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <Input
                                            name="data_saida"
                                            type="date"
                                            className="text-base sm:text-sm min-h-[44px]"
                                            value={formData.data_saida}
                                            onChange={handleChange}
                                            required
                                        />
                                        <Input
                                            name="hora_saida"
                                            type="time"
                                            className="text-base sm:text-sm min-h-[44px]"
                                            value={formData.hora_saida}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Chegada</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <Input
                                            name="data_chegada"
                                            type="date"
                                            className="text-base sm:text-sm min-h-[44px]"
                                            value={formData.data_chegada}
                                            onChange={handleChange}
                                            disabled={formData.status !== 'concluida'}
                                        />
                                        <Input
                                            name="hora_chegada"
                                            type="time"
                                            className="text-base sm:text-sm min-h-[44px]"
                                            value={formData.hora_chegada}
                                            onChange={handleChange}
                                            disabled={formData.status !== 'concluida'}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Objetivo e Paradas */}
                    <div className="space-y-6">
                        <Card className="p-6 space-y-5">
                            {somenteLeitura ? (
                                <CampoLeitura label="Objetivo / observações" value={formData.objetivo} />
                            ) : (
                                <Textarea
                                    label="Objetivo da Viagem"
                                    name="objetivo"
                                    value={formData.objetivo}
                                    onChange={handleChange}
                                    placeholder="Descreva o motivo da viagem..."
                                    className="min-h-[100px]"
                                />
                            )}
                        </Card>

                        {formData.paradas && formData.paradas.length > 0 && (
                            <Card className="p-6">
                                <div className="flex items-center gap-2 mb-4 border-b pb-2">
                                    <MapPin className="h-5 w-5 text-blue-600" />
                                    <h3 className="text-lg font-semibold text-gray-900">Paradas Registradas</h3>
                                </div>
                                <div className="space-y-3">
                                    {formData.paradas.map((p, idx) => (
                                        <div key={idx} className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex justify-between items-start">
                                            <div>
                                                <p className="font-medium text-gray-900">{p.local}</p>
                                                <p className="text-xs text-gray-500">{p.motivo}</p>
                                            </div>
                                            <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                                {p.horario}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}
                    </div>
                </div>

                <div className="hidden md:flex items-center justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => navigate('/frota/viagens')}>
                        {somenteLeitura ? 'Voltar à lista' : 'Cancelar'}
                    </Button>
                    {!somenteLeitura && (
                        <Button type="submit" loading={saving}>
                            <Save className="h-4 w-4 mr-2" />
                            {isEdicao ? 'Salvar alterações' : 'Registrar viagem'}
                        </Button>
                    )}
                </div>
            </form>

            {/* Barra fixa no celular */}
            {!somenteLeitura && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
                    <div className="flex gap-2 max-w-4xl mx-auto">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 min-h-[48px]"
                            onClick={() => navigate('/frota/viagens')}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="viagem-form"
                            loading={saving}
                            className="flex-[1.4] min-h-[48px]"
                        >
                            <Save className="h-4 w-4 mr-2 shrink-0" />
                            {isEdicao ? 'Salvar' : 'Registrar'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

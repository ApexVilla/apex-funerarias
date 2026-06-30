import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    MapPin, Save, ArrowLeft, Calendar, 
    Search, Plus, Trash2
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';
import { loadCobradoresAtivosParaUnidade } from '../../lib/cobradorDisponiveis';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { carregarRotaCobranca, salvarRotaCobranca } from '../../lib/cobRotasSupabase';
import { resolverCobradorIdDoUsuario, usuarioEhPerfilCobrador } from '../../lib/cobradorUsuarioLink';

interface RotaFormData {
    cobrador_id: string;
    data: string;
    regiao: string;
    status: 'planejada' | 'em_andamento' | 'concluida';
    paradas: {
        cliente_id: string;
        cobranca_pendente_id?: string;
        nome: string;
        bairro: string;
        endereco: string;
        valor: number;
        dias_atraso: number;
    }[];
}

interface PendenciaRota {
    id: string;
    cliente_id: string;
    cliente_nome: string;
    cliente_bairro: string;
    cobrador_id?: string;
    valor_centavos: number;
    dias_atraso: number;
}

function bairroClienteParaRota(cli: {
    endereco_bairro?: string | null;
    endereco_cob_bairro?: string | null;
}): string {
    const cob = (cli.endereco_cob_bairro || '').trim();
    const res = (cli.endereco_bairro || '').trim();
    return cob || res || 'Sem bairro';
}

const initialData: RotaFormData = {
    cobrador_id: '',
    data: new Date().toISOString().slice(0, 10),
    regiao: '',
    status: 'planejada',
    paradas: [],
};

export const RotaForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();
    const {
        empresaIdEfetivo,
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        empresaIdsParaFiltro,
        podeAlternarEmpresa,
        dataRevisionEmpresa,
    } = useEmpresaContextoAtivo();
    const empresaId = (empresaIdEfetivo || user?.empresa_id || '').trim();
    const empresaIdsConsulta =
        empresaIdsParaFiltro.length > 0 ? empresaIdsParaFiltro : empresaId ? [empresaId] : [];
    const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;
    const empresaNomeAtual = useMemo(
        () => empresasDoGrupo.find((e) => e.id === empresaId)?.nome || '',
        [empresasDoGrupo, empresaId],
    );
    const tokenUnidadeGrupo = useMemo(() => {
        if (visaoTodasEmpresasGrupo) return '';
        return unidadeNomeCurto(empresaNomeAtual);
    }, [visaoTodasEmpresasGrupo, empresaNomeAtual]);
    const { showToast } = useToast();
    const [formData, setFormData] = useState<RotaFormData>(initialData);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [cobradores, setCobradores] = useState<{ id: string; nome: string }[]>([]);
    const [pendencias, setPendencias] = useState<PendenciaRota[]>([]);
    const [bairrosSelecionados, setBairrosSelecionados] = useState<string[]>([]);
    const [filtroCliente, setFiltroCliente] = useState('');
    const [maxParadas, setMaxParadas] = useState(20);

    const isEditing = !!id;

    useEffect(() => {
        const loadData = async () => {
            if (!empresaId) return;
            setLoading(true);
            try {
                const listaCobradores = await loadCobradoresAtivosParaUnidade({
                    empresaIdsParaFiltro: empresaIdsConsulta,
                    empresasDoGrupo,
                    visaoTodasEmpresasGrupo,
                    multiEmpresa,
                    tokenUnidadeGrupo,
                });
                setCobradores(listaCobradores);

                const pendRes = await supabase
                    .from('cob_cobrancas_pendentes')
                    .select(`
                            id, cliente_id, cobrador_id, valor_centavos, dias_atraso,
                            clientes(nome, endereco_bairro, endereco_cob_bairro)
                        `)
                    .eq('empresa_id', empresaId)
                    .eq('canal_cobranca', 'cobrador')
                    .in('status', ['pendente', 'em_andamento', 'promessa'])
                    .limit(500);
                if (pendRes.error) throw pendRes.error;

                const mappedPendencias: PendenciaRota[] = (pendRes.data || []).map((p: any) => ({
                    id: String(p.id),
                    cliente_id: String(p.cliente_id || p.id),
                    cliente_nome: p.clientes?.nome || 'Cliente',
                    cliente_bairro: p.clientes ? bairroClienteParaRota(p.clientes) : 'Sem bairro',
                    cobrador_id: p.cobrador_id ? String(p.cobrador_id) : undefined,
                    valor_centavos: Number(p.valor_centavos || 0),
                    dias_atraso: Number(p.dias_atraso || 0),
                }));
                setPendencias(mappedPendencias);
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Erro ao carregar dados', 'error');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [
        id,
        empresaId,
        dataRevisionEmpresa,
        empresaIdsConsulta.join(','),
        tokenUnidadeGrupo,
        visaoTodasEmpresasGrupo,
        showToast,
    ]);

    useEffect(() => {
        if (!isEditing || !id) return;
        void (async () => {
            setLoading(true);
            try {
                const rota = await carregarRotaCobranca(id);
                if (!rota) {
                    showToast('Rota não encontrada.', 'warning');
                    navigate('/cobradores/rotas');
                    return;
                }
                setFormData({
                    cobrador_id: rota.cobrador_id,
                    data: rota.data,
                    regiao: rota.regiao,
                    status: rota.status,
                    paradas: rota.paradas.map((p) => ({
                        cliente_id: p.cliente_id,
                        cobranca_pendente_id: p.cobranca_pendente_id,
                        nome: p.cliente_nome,
                        bairro: p.cliente_bairro,
                        endereco: p.cliente_endereco,
                        valor: Math.round(p.valor_centavos / 100),
                        dias_atraso: p.dias_atraso,
                    })),
                });
                setBairrosSelecionados(rota.bairros);
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Erro ao carregar rota', 'error');
            } finally {
                setLoading(false);
            }
        })();
    }, [id, isEditing, navigate, showToast]);

    useEffect(() => {
        if (isEditing || !user || !usuarioEhPerfilCobrador(user.role)) return;
        void (async () => {
            const cid = await resolverCobradorIdDoUsuario({
                empresaIds: empresaIdsConsulta,
                usuarioId: user.id,
                email: user.email,
                nome: user.nome,
            });
            if (cid) setFormData((prev) => (prev.cobrador_id ? prev : { ...prev, cobrador_id: cid }));
        })();
    }, [isEditing, user, empresaIdsConsulta.join(',')]);

    const pendenciasDaCarteira = useMemo(() => {
        if (!formData.cobrador_id) return [] as PendenciaRota[];
        return pendencias.filter((p) => p.cobrador_id === formData.cobrador_id);
    }, [pendencias, formData.cobrador_id]);

    const bairrosDisponiveis = useMemo(() => {
        const mapa = new Map<string, number>();
        pendenciasDaCarteira.forEach((p) => {
            const key = p.cliente_bairro || 'Sem bairro';
            mapa.set(key, (mapa.get(key) || 0) + 1);
        });
        return Array.from(mapa.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([bairro, total]) => ({ bairro, total }));
    }, [pendenciasDaCarteira]);

    const sugestoesParadas = useMemo(() => {
        const filtro = filtroCliente.trim().toLowerCase();
        return pendenciasDaCarteira
            .filter((p) => bairrosSelecionados.length === 0 || bairrosSelecionados.includes(p.cliente_bairro || 'Sem bairro'))
            .filter((p) => !filtro || p.cliente_nome.toLowerCase().includes(filtro))
            .sort((a, b) => {
                if (b.dias_atraso !== a.dias_atraso) return b.dias_atraso - a.dias_atraso;
                return b.valor_centavos - a.valor_centavos;
            });
    }, [pendenciasDaCarteira, bairrosSelecionados, filtroCliente]);

    useEffect(() => {
        if (bairrosSelecionados.length > 0) {
            setFormData((prev) => ({ ...prev, regiao: bairrosSelecionados.join(' / ') }));
        }
    }, [bairrosSelecionados]);

    const toggleBairro = (bairro: string) => {
        setBairrosSelecionados((prev) =>
            prev.includes(bairro) ? prev.filter((b) => b !== bairro) : [...prev, bairro]
        );
    };

    const gerarParadasAutomaticas = () => {
        const selecionadas = sugestoesParadas.slice(0, maxParadas).map((p) => ({
            cliente_id: p.cliente_id,
            cobranca_pendente_id: p.id,
            nome: p.cliente_nome,
            bairro: p.cliente_bairro || 'Sem bairro',
            endereco: '-',
            valor: Math.round((p.valor_centavos || 0) / 100),
            dias_atraso: p.dias_atraso,
        }));

        setFormData((prev) => ({ ...prev, paradas: selecionadas }));
        showToast(`Rota gerada com ${selecionadas.length} parada(s).`, 'success');
    };

    const removerParada = (idx: number) => {
        setFormData((prev) => ({
            ...prev,
            paradas: prev.paradas.filter((_, i) => i !== idx),
        }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'cobrador_id') {
            setBairrosSelecionados([]);
            setFiltroCliente('');
            setFormData((prev) => ({ ...prev, cobrador_id: value, regiao: '', paradas: [] }));
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!empresaId) return;
        if (!formData.cobrador_id) {
            showToast('Selecione o cobrador.', 'warning');
            return;
        }
        if (formData.paradas.length === 0) {
            showToast('Gere ou adicione paradas na rota (selecione bairros e clique em Gerar).', 'warning');
            return;
        }

        setSaving(true);
        try {
            await salvarRotaCobranca({
                empresa_id: empresaId,
                cobrador_id: formData.cobrador_id,
                data: formData.data,
                regiao: formData.regiao.trim() || bairrosSelecionados.join(' / '),
                bairros: bairrosSelecionados,
                status: formData.status,
                rota_id: isEditing ? id : undefined,
                paradas: formData.paradas.map((p, idx) => ({
                    ordem: idx + 1,
                    cliente_id: p.cliente_id,
                    cobranca_pendente_id: p.cobranca_pendente_id,
                    cliente_nome: p.nome,
                    cliente_bairro: p.bairro,
                    cliente_endereco: p.endereco || '-',
                    valor_centavos: Math.round((p.valor || 0) * 100),
                    dias_atraso: p.dias_atraso || 0,
                })),
            });
            showToast(isEditing ? 'Rota atualizada.' : 'Rota criada com sucesso.', 'success');
            navigate('/cobradores/rotas');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar rota', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <PageHeader
                title={isEditing ? 'Editar Rota' : 'Nova Rota de Cobrança'}
                subtitle="Planejamento de visitas e roteiro de cobrança"
                actionButton={
                    <Button variant="outline" size="sm" onClick={() => navigate('/cobradores/rotas')}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                    </Button>
                }
            />

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-2 border-b pb-2">
                        <MapPin className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">Configuração da Rota</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select label="Cobrador *" name="cobrador_id" value={formData.cobrador_id} onChange={handleChange} required>
                            <option value="">
                                {loading ? 'Carregando cobradores...' : 'Selecione um cobrador'}
                            </option>
                            {cobradores.map(c => (
                                <option key={c.id} value={c.id}>{c.nome}</option>
                            ))}
                        </Select>
                        {!loading && cobradores.length === 0 ? (
                            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 md:col-span-2">
                                Nenhum cobrador ativo nesta unidade. Cadastre em <strong>Cobradores</strong> ou confira a
                                unidade selecionada no topo (ex.: Catalão).
                            </p>
                        ) : null}
                        <Input label="Data da Rota *" name="data" type="date" value={formData.data} onChange={handleChange} required />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Região / Bairros *" name="regiao" value={formData.regiao} onChange={handleChange} required placeholder="Ex: Centro e arredores" />
                        <Select label="Status *" name="status" value={formData.status} onChange={handleChange} required>
                            <option value="planejada">Planejada</option>
                            <option value="em_andamento">Em Andamento</option>
                            <option value="concluida">Concluída</option>
                        </Select>
                    </div>
                </Card>

                <Card className="p-6 space-y-5">
                    <div className="flex items-center justify-between mb-2 border-b pb-2">
                        <div className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-green-600" />
                            <h3 className="text-lg font-semibold text-gray-900">Paradas da Rota</h3>
                        </div>
                        <span className="text-xs font-medium text-gray-500 uppercase">{formData.paradas.length} paradas</span>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 mb-4">
                        <p className="text-sm text-amber-800">
                            <strong>Dica:</strong> a rota usa a carteira do cobrador selecionado. Escolha bairros e gere automaticamente.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <Input
                            label="Filtrar cliente"
                            value={filtroCliente}
                            onChange={(e) => setFiltroCliente(e.target.value)}
                            placeholder="Nome do cliente"
                        />
                        <Input
                            label="Máx. paradas"
                            type="number"
                            min={1}
                            max={100}
                            value={String(maxParadas)}
                            onChange={(e) => setMaxParadas(Math.max(1, Number(e.target.value || 1)))}
                        />
                        <div className="flex items-end">
                            <Button type="button" onClick={gerarParadasAutomaticas} className="w-full">
                                Gerar rota automática
                            </Button>
                        </div>
                    </div>

                    <div className="border rounded-lg p-3 bg-gray-50">
                        <p className="text-sm font-medium text-gray-700 mb-2">Bairros (do cadastro dos clientes)</p>
                        <div className="flex flex-wrap gap-2">
                            {bairrosDisponiveis.map(({ bairro, total }) => {
                                const ativo = bairrosSelecionados.includes(bairro);
                                return (
                                    <button
                                        key={bairro}
                                        type="button"
                                        onClick={() => toggleBairro(bairro)}
                                        className={`px-3 py-1.5 rounded-full text-xs border transition ${
                                            ativo
                                                ? 'bg-blue-100 text-blue-700 border-blue-300'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                                        }`}
                                    >
                                        {bairro} ({total})
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {formData.paradas.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed rounded-xl bg-gray-50">
                            <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-500">
                                {!formData.cobrador_id
                                    ? 'Selecione o cobrador para carregar a carteira dele.'
                                    : 'Nenhuma parada adicionada ainda. Gere automaticamente pelos bairros da carteira.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {formData.paradas.map((p, idx) => (
                                <div key={`${p.cliente_id}-${idx}`} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">{p.nome}</p>
                                        <p className="text-xs text-gray-500">
                                            #{idx + 1} • {p.bairro} • R$ {p.valor.toFixed(2)}
                                            {p.dias_atraso > 0 ? ` • ${p.dias_atraso}d atraso` : ''}
                                        </p>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={() => removerParada(idx)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => navigate('/cobradores/rotas')}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isEditing ? 'Salvar Alterações' : 'Criar Rota'}
                    </Button>
                </div>
            </form>
        </div>
    );
};

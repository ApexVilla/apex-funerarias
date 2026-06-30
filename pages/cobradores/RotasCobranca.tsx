import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    MapPin, Plus, Calendar, User, Clock, CheckCircle2,
    Navigation, ChevronRight, Eye, DollarSign, Users, RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Select, Card } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';
import { listarRotasCobranca, type RotaCobrancaDto } from '../../lib/cobRotasSupabase';
import { loadCobradoresAtivosParaUnidade } from '../../lib/cobradorDisponiveis';
import { resolverCobradorIdDoUsuario, usuarioEhPerfilCobrador } from '../../lib/cobradorUsuarioLink';

const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const StatusRotaBadge: React.FC<{ status: RotaCobrancaDto['status'] }> = ({ status }) => {
    const map = {
        planejada: { label: 'Planejada', cls: 'bg-blue-100 text-blue-700', icon: Calendar },
        em_andamento: { label: 'Em Rota', cls: 'bg-amber-100 text-amber-700', icon: Navigation },
        concluida: { label: 'Concluída', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 },
    };
    const { label, cls, icon: Icon } = map[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
            <Icon className="h-3 w-3" />{label}
        </span>
    );
};

const ParadaStatusIcon: React.FC<{ status: string }> = ({ status }) => {
    const map: Record<string, { cls: string; icon: React.ElementType }> = {
        pendente: { cls: 'bg-gray-200 text-gray-500', icon: Clock },
        visitado: { cls: 'bg-amber-100 text-amber-600', icon: Eye },
        ausente: { cls: 'bg-red-100 text-red-600', icon: Users },
        pago: { cls: 'bg-green-100 text-green-600', icon: DollarSign },
    };
    const { cls, icon: Icon } = map[status] || map.pendente;
    return (
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${cls}`}>
            <Icon className="h-4 w-4" />
        </div>
    );
};

export const RotasCobranca: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const { showToast } = useToast();
    const [dataFilter, setDataFilter] = useState(new Date().toISOString().slice(0, 10));
    const [cobradorFilter, setCobradorFilter] = useState('');
    const [expandedRota, setExpandedRota] = useState<string | null>(null);
    const [rotas, setRotas] = useState<RotaCobrancaDto[]>([]);
    const [cobradores, setCobradores] = useState<{ id: string; nome: string }[]>([]);
    const [loading, setLoading] = useState(false);

    const modoCobrador = usuarioEhPerfilCobrador(user?.role);

    const loadRotas = async () => {
        if (empresaIdsFiltro.length === 0) return;
        setLoading(true);
        try {
            const rows = await listarRotasCobranca(empresaIdsFiltro, {
                data: dataFilter || undefined,
                cobrador_id: cobradorFilter || undefined,
            });
            setRotas(rows);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao carregar rotas', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadRotas();
    }, [empresaIdsFiltro.join(','), dataRevisionEmpresa, dataFilter, cobradorFilter]);

    useEffect(() => {
        if (empresaIdsFiltro.length === 0) return;
        void (async () => {
            const lista = await loadCobradoresAtivosParaUnidade({
                empresaIdsParaFiltro: empresaIdsFiltro,
                empresasDoGrupo: [],
                visaoTodasEmpresasGrupo: false,
                multiEmpresa: false,
                tokenUnidadeGrupo: '',
            });
            setCobradores(lista);
        })();
    }, [empresaIdsFiltro.join(',')]);

    useEffect(() => {
        if (!modoCobrador || !user) return;
        void (async () => {
            const id = await resolverCobradorIdDoUsuario({
                empresaIds: empresaIdsFiltro,
                usuarioId: user.id,
                email: user.email,
                nome: user.nome,
            });
            if (id) setCobradorFilter(id);
        })();
    }, [modoCobrador, user, empresaIdsFiltro.join(',')]);

    const totais = useMemo(() => {
        const todas = rotas.flatMap((r) => r.paradas);
        return {
            totalParadas: todas.length,
            visitados: todas.filter((p) => p.status !== 'pendente').length,
            pagos: todas.filter((p) => p.status === 'pago').length,
            valorPago: todas.filter((p) => p.status === 'pago').reduce((a, p) => a + p.valor_centavos, 0),
        };
    }, [rotas]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Rotas de Cobrança"
                subtitle="Monte rotas por bairros — o sistema ordena os clientes da carteira para cobrança em campo"
                actionButton={
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => void loadRotas()} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Atualizar
                        </Button>
                        <Button onClick={() => navigate('/cobradores/rotas/nova')}>
                            <Plus className="h-4 w-4 mr-2" /> Nova Rota
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 bg-blue-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Paradas</p>
                    <p className="text-3xl font-bold text-blue-700 mt-1">{totais.totalParadas}</p>
                </Card>
                <Card className="p-4 bg-amber-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Visitados</p>
                    <p className="text-3xl font-bold text-amber-700 mt-1">{totais.visitados}</p>
                </Card>
                <Card className="p-4 bg-green-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pagos</p>
                    <p className="text-3xl font-bold text-green-700 mt-1">{totais.pagos}</p>
                </Card>
                <Card className="p-4 bg-emerald-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Arrecadado</p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totais.valorPago)}</p>
                </Card>
            </div>

            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border">
                <div className="w-full md:w-48">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider ml-1 mb-1.5">Data</label>
                    <input
                        type="date"
                        value={dataFilter}
                        onChange={(e) => setDataFilter(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2 text-sm"
                    />
                </div>
                {!modoCobrador && (
                    <div className="w-full md:w-48">
                        <Select label="Cobrador" value={cobradorFilter} onChange={(e) => setCobradorFilter(e.target.value)}>
                            <option value="">Todos</option>
                            {cobradores.map((c) => (
                                <option key={c.id} value={c.id}>{c.nome}</option>
                            ))}
                        </Select>
                    </div>
                )}
            </div>

            {loading && rotas.length === 0 && (
                <Card className="p-12 text-center text-gray-500">Carregando rotas...</Card>
            )}

            {!loading && rotas.length === 0 && (
                <Card className="p-12 text-center">
                    <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Nenhuma rota para esta data</p>
                    <p className="text-sm text-gray-400 mt-1">
                        Crie uma rota, selecione bairros da carteira e clique em &quot;Gerar rota automática&quot;.
                    </p>
                    <Button className="mt-4" onClick={() => navigate('/cobradores/rotas/nova')}>
                        <Plus className="h-4 w-4 mr-2" /> Nova Rota
                    </Button>
                </Card>
            )}

            <div className="space-y-5">
                {rotas.map((rota) => {
                    const isExpanded = expandedRota === rota.id;
                    const paradasPagas = rota.paradas.filter((p) => p.status === 'pago').length;
                    const paradasVisitadas = rota.paradas.filter((p) => p.status !== 'pendente').length;
                    const progresso = rota.paradas.length > 0 ? (paradasVisitadas / rota.paradas.length) * 100 : 0;
                    const bairrosResumo = Object.entries(
                        rota.paradas.reduce((acc, parada) => {
                            const key = parada.cliente_bairro || 'Sem bairro';
                            acc[key] = (acc[key] || 0) + 1;
                            return acc;
                        }, {} as Record<string, number>),
                    ).sort((a, b) => b[1] - a[1]);

                    return (
                        <Card key={rota.id} className="overflow-hidden">
                            <div
                                className="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/50"
                                onClick={() => setExpandedRota(isExpanded ? null : rota.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                                        <MapPin className="h-6 w-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <h3 className="font-semibold text-gray-900 text-lg">{rota.regiao}</h3>
                                            <StatusRotaBadge status={rota.status} />
                                            {bairrosResumo.length > 0 && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                                                    <MapPin className="h-3 w-3" />
                                                    {bairrosResumo.length} bairro(s)
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                                            <span className="flex items-center gap-1">
                                                <User className="h-3.5 w-3.5" /> {rota.cobrador_nome}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3.5 w-3.5" />{' '}
                                                {new Date(rota.data + 'T00:00').toLocaleDateString('pt-BR')}
                                            </span>
                                            <span>{rota.paradas.length} paradas • {paradasPagas} pagos</span>
                                        </div>
                                        <div className="mt-2 w-64 max-w-full">
                                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                <div
                                                    className="h-1.5 rounded-full bg-blue-500"
                                                    style={{ width: `${progresso}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight className={`h-5 w-5 text-gray-400 ${isExpanded ? 'rotate-90' : ''}`} />
                            </div>

                            {isExpanded && (
                                <div className="border-t divide-y bg-gray-50/30">
                                    {rota.paradas.map((parada, idx) => (
                                        <div key={parada.id} className="px-5 py-3 flex items-center gap-4">
                                            <span className="text-xs font-bold text-gray-400 w-6">{idx + 1}º</span>
                                            <ParadaStatusIcon status={parada.status} />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900">{parada.cliente_nome}</p>
                                                <p className="text-xs text-gray-500">
                                                    {parada.cliente_bairro} • {parada.cliente_endereco}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-gray-900">{formatCurrency(parada.valor_centavos)}</p>
                                                {parada.dias_atraso > 0 && (
                                                    <p className="text-xs text-red-600">{parada.dias_atraso}d atraso</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="px-5 py-3 flex gap-2 border-t bg-white">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => navigate(`/cobradores/rotas/${rota.id}/editar`)}
                                        >
                                            Editar rota
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => navigate(`/cobradores/pendentes?rota=${rota.id}`)}
                                        >
                                            Cobrar esta rota
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

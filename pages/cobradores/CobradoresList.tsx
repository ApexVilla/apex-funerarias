import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users, Plus, Search, RefreshCw, Phone, MapPin, Calendar,
    CheckCircle2, XCircle, Star, DollarSign, Edit3, Eye, ClipboardList, Building2,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useFilial } from '../../lib/FilialContext';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';
import {
    cobradorPertenceUnidade,
    idsFiliaisDaUnidadeOperacional,
} from '../../lib/cobradorUnidadeFiltro';
import { empresaIdsConsultaCobradores } from '../../lib/cobradorEmpresaScope';
import { empresaIdsGrupoEconomicoParaCobradores } from '../../lib/cobradorDisponiveis';
import { mapaPerformanceCobradores } from '../../lib/cobradorPerformance';
import { resolveEmpresaIdsConsulta } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { parseBairrosAtuacaoJsonb } from '../../lib/cobradorBairrosAtuacao';
import { inferirNomeFilialPorAreaAtuacao } from '../../lib/cobradorFilialInferencia';
import {
    cobradorFilialEhTodasUnidades,
    rotuloAreaAtuacaoCobrador,
    rotuloUnidadeOrigemCobrador,
} from '../../lib/cobradorUnidadeDisplay';
import { rotuloContasCobrador } from '../../lib/cobradorContasBancarias';

type StatusCobrador = 'ativo' | 'inativo' | 'ferias' | 'afastado';

interface Cobrador {
    id: string;
    empresa_id: string;
    codigo: string;
    nome: string;
    cpf: string;
    telefone: string;
    whatsapp?: string;
    email?: string;
    status: StatusCobrador;
    /** Nome da filial/unidade de origem (Aparecida, Catalão…). */
    filial_nome: string;
    filial_id?: string;
    /** True quando o nome veio só do cruzamento com região de atuação (filial_id ainda não gravado no banco). */
    filial_nome_inferido: boolean;
    /** Cobrador sem filial fixa — atua em qualquer filial/unidade. */
    filial_todas_unidades: boolean;
    area_atuacao: string;
    /** Texto da linha “Atua em” (vazio quando redundante). */
    area_atuacao_exibicao: string;
    caixas_rotulo: string;
    bairros: string[];
    data_admissao: string;
    comissao_percentual: number;
    total_clientes_ativos: number;
    total_cobrado_mes_centavos: number;
    total_recebido_mes_centavos: number;
    foto_url?: string;
}

const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const StatusBadge: React.FC<{ status: StatusCobrador }> = ({ status }) => {
    const map: Record<StatusCobrador, { label: string; cls: string }> = {
        ativo: { label: 'Ativo', cls: 'bg-green-100 text-green-700' },
        inativo: { label: 'Inativo', cls: 'bg-red-100 text-red-700' },
        ferias: { label: 'Férias', cls: 'bg-blue-100 text-blue-700' },
        afastado: { label: 'Afastado', cls: 'bg-amber-100 text-amber-700' },
    };
    const { label, cls } = map[status];
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
};

export const CobradoresList: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const {
        empresaIdEfetivo,
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        empresaIdsParaFiltro,
        podeAlternarEmpresa,
        dataRevisionEmpresa,
    } = useEmpresaContextoAtivo();
    const { filialId, isTodasFiliais, dataRevision } = useFilial();
    const empresaId = (empresaIdEfetivo || user?.empresa_id || '').trim();
    const empresaIdsConsulta = useMemo(
        () => resolveEmpresaIdsConsulta(empresaId, empresaIdsParaFiltro),
        [empresaId, empresaIdsParaFiltro],
    );
    const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;
    const empresaNomeAtual = useMemo(
        () => empresasDoGrupo.find((e) => e.id === empresaId)?.nome || '',
        [empresasDoGrupo, empresaId],
    );
    const tokenUnidadeGrupo = useMemo(() => {
        if (visaoTodasEmpresasGrupo) return '';
        return unidadeNomeCurto(empresaNomeAtual);
    }, [visaoTodasEmpresasGrupo, empresaNomeAtual]);

    const empresaIdsQueryCobradores = useMemo(
        () =>
            empresaIdsConsultaCobradores({
                empresaIdsParaFiltro: empresaIdsConsulta,
                empresasDoGrupo,
                visaoTodasEmpresasGrupo,
                multiEmpresa,
                tokenUnidadeGrupo,
            }),
        [empresaIdsConsulta, empresasDoGrupo, visaoTodasEmpresasGrupo, multiEmpresa, tokenUnidadeGrupo],
    );

    const shouldFilterByFilialContext = useMemo(
        () =>
            !multiEmpresa &&
            Boolean(filialId && filialId !== FILIAL_TODAS_ID && !isTodasFiliais),
        [multiEmpresa, filialId, isTodasFiliais],
    );
    const shouldFilterByUnidadeGrupo = useMemo(
        () => !visaoTodasEmpresasGrupo && Boolean(tokenUnidadeGrupo),
        [visaoTodasEmpresasGrupo, tokenUnidadeGrupo],
    );
    const { showToast } = useToast();
    const [items, setItems] = useState<Cobrador[]>([]);
    const [filiaisCatalogo, setFiliaisCatalogo] = useState<{ id: string; nome: string }[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const load = async () => {
            const idsQuery = await empresaIdsGrupoEconomicoParaCobradores(empresaIdsQueryCobradores);
            if (idsQuery.length === 0) return;
            try {
                const { data: filiaisRows } = await supabase
                    .from('filiais')
                    .select('id, nome')
                    .in('empresa_id', idsQuery);

                const listaFiliaisPre = (filiaisRows || []).map((f: { id: string; nome: string }) => ({
                    id: f.id,
                    nome: f.nome,
                }));

                let q = supabase
                    .from('cobradores')
                    .select('*')
                    .in('empresa_id', idsQuery)
                    .order('nome');

                if (statusFilter) {
                    q = q.eq('status', statusFilter);
                }
                if (shouldFilterByFilialContext && filialId) {
                    q = q.eq('filial_id', filialId);
                }

                const { data, error } = await q;

                const cobradorIds = (data || []).map((c: { id: string }) => String(c.id)).filter(Boolean);
                const caixasPorCobrador = new Map<string, { nome?: string; principal?: boolean }[]>();
                if (cobradorIds.length > 0) {
                    const { data: vinculosRows } = await supabase
                        .from('cobrador_contas_bancarias')
                        .select('cobrador_id, principal, fin_contas_bancarias ( nome )')
                        .in('cobrador_id', cobradorIds);
                    for (const row of vinculosRows || []) {
                        const cid = String((row as { cobrador_id: string }).cobrador_id);
                        const conta = (row as { fin_contas_bancarias?: { nome?: string } | null })
                            .fin_contas_bancarias;
                        const list = caixasPorCobrador.get(cid) || [];
                        list.push({
                            nome: conta?.nome,
                            principal: Boolean((row as { principal?: boolean }).principal),
                        });
                        caixasPorCobrador.set(cid, list);
                    }
                }

                setFiliaisCatalogo(listaFiliaisPre);
                const listaFiliais = listaFiliaisPre;

                const filialNomePorId = new Map<string, string>(
                    listaFiliais.map((f) => [f.id, f.nome]),
                );

                if (error) throw error;

                const performance = await mapaPerformanceCobradores(idsQuery);

                const mapped: Cobrador[] = (data || []).map((c: any, index: number) => {
                    const perf = performance.get(String(c.id)) || {
                        total_clientes_ativos: 0,
                        total_cobrado_mes_centavos: 0,
                        total_recebido_mes_centavos: 0,
                    };
                    const filialPorId =
                        (c.filial_id && filialNomePorId.get(String(c.filial_id))) || '';
                    const filialInferida =
                        filialPorId || cobradorFilialEhTodasUnidades(c.filial_id)
                            ? ''
                            : inferirNomeFilialPorAreaAtuacao(c.area_atuacao || '', listaFiliais);
                    const unidade = rotuloUnidadeOrigemCobrador({
                        filialId: c.filial_id,
                        filialNomePorId: filialPorId,
                        filialInferida,
                    });
                    const areaExib = rotuloAreaAtuacaoCobrador(
                        c.area_atuacao,
                        unidade.todasUnidades,
                    );
                    const caixasRaw = caixasPorCobrador.get(String(c.id)) || [];
                    const caixasVinculos = caixasRaw.map((x, i) => ({
                        conta_bancaria_id: String(i),
                        principal: Boolean(x.principal),
                        nome: x.nome,
                    }));

                    return {
                        id: c.id,
                        empresa_id: String(c.empresa_id || ''),
                        codigo: `COB-${String(index + 1).padStart(3, '0')}`,
                        nome: c.nome || '-',
                        cpf: c.cpf || '-',
                        telefone: c.telefone || '-',
                        whatsapp: c.telefone || undefined,
                        email: c.email || undefined,
                        status: c.status || 'ativo',
                        filial_id: c.filial_id ? String(c.filial_id) : undefined,
                        filial_nome: unidade.rotulo,
                        filial_nome_inferido: unidade.inferido,
                        filial_todas_unidades: unidade.todasUnidades,
                        area_atuacao: c.area_atuacao || 'Sem área',
                        area_atuacao_exibicao: areaExib,
                        caixas_rotulo: rotuloContasCobrador(caixasVinculos),
                        bairros: parseBairrosAtuacaoJsonb(c.bairros_atuacao),
                        data_admissao: c.data_admissao || '',
                        comissao_percentual: Number(c.comissao_percentual || 5),
                        total_clientes_ativos: perf.total_clientes_ativos,
                        total_cobrado_mes_centavos: perf.total_cobrado_mes_centavos,
                        total_recebido_mes_centavos: perf.total_recebido_mes_centavos,
                    };
                });
                setItems(mapped);
            } catch (error) {
                showToast(error instanceof Error ? error.message : 'Erro ao carregar cobradores', 'error');
            }
        };
        load();
    }, [
        empresaIdsQueryCobradores,
        dataRevisionEmpresa,
        dataRevision,
        statusFilter,
        shouldFilterByFilialContext,
        shouldFilterByUnidadeGrupo,
        filialId,
        tokenUnidadeGrupo,
        showToast,
    ]);

    const filialIdsUnidadeGrupo = useMemo(
        () => idsFiliaisDaUnidadeOperacional(filiaisCatalogo, tokenUnidadeGrupo),
        [filiaisCatalogo, tokenUnidadeGrupo],
    );

    const itemsDaUnidade = useMemo(() => {
        if (!shouldFilterByUnidadeGrupo && !shouldFilterByFilialContext) return items;
        return items.filter((c) =>
            cobradorPertenceUnidade(
                {
                    empresa_id: c.empresa_id,
                    filial_id: c.filial_id,
                    area_atuacao: c.area_atuacao,
                },
                filiaisCatalogo,
                {
                    filialIdFixo: shouldFilterByFilialContext ? filialId : undefined,
                    filialIdsUnidade: shouldFilterByUnidadeGrupo ? filialIdsUnidadeGrupo : undefined,
                    tokenUnidade: shouldFilterByUnidadeGrupo ? tokenUnidadeGrupo : undefined,
                    empresaIdAtual: empresaId || undefined,
                },
            ),
        );
    }, [
        items,
        filiaisCatalogo,
        shouldFilterByUnidadeGrupo,
        shouldFilterByFilialContext,
        filialIdsUnidadeGrupo,
        tokenUnidadeGrupo,
        filialId,
        empresaId,
    ]);

    const filtered = useMemo(() => itemsDaUnidade.filter(c => {
        const term = searchTerm.toLowerCase();
        const matchSearch = !searchTerm ||
            c.nome.toLowerCase().includes(term) ||
            c.codigo.toLowerCase().includes(term) ||
            c.cpf.includes(term) ||
            (c.filial_nome || '').toLowerCase().includes(term) ||
            c.area_atuacao.toLowerCase().includes(term) ||
            c.bairros.some((b) => b.toLowerCase().includes(term));
        const matchStatus = !statusFilter || c.status === statusFilter;
        return matchSearch && matchStatus;
    }), [itemsDaUnidade, searchTerm, statusFilter]);

    const stats = useMemo(() => {
        const ativos = itemsDaUnidade.filter(c => c.status === 'ativo');
        return {
            total: itemsDaUnidade.length,
            ativos: ativos.length,
            totalClientes: ativos.reduce((acc, c) => acc + c.total_clientes_ativos, 0),
            totalRecebido: ativos.reduce((acc, c) => acc + c.total_recebido_mes_centavos, 0),
            totalCobrado: ativos.reduce((acc, c) => acc + c.total_cobrado_mes_centavos, 0),
        };
    }, [itemsDaUnidade]);

    const eficiencia = stats.totalCobrado > 0
        ? ((stats.totalRecebido / stats.totalCobrado) * 100).toFixed(1)
        : '0';

    return (
        <div className="space-y-6">
            <PageHeader
                title="Cobradores"
                subtitle="Cadastro, cidade/região de atuação da rota e performance"
                actionButton={
                    <Button onClick={() => navigate('/cobradores/novo')}>
                        <Plus className="h-4 w-4 mr-2" /> Novo Cobrador
                    </Button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="p-4 bg-blue-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total</p>
                    <p className="text-3xl font-bold text-blue-700 mt-1">{stats.total}</p>
                    <p className="text-xs text-gray-400">{stats.ativos} ativos</p>
                </Card>
                <Card className="p-4 bg-purple-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Clientes Atendidos</p>
                    <p className="text-3xl font-bold text-purple-700 mt-1">{stats.totalClientes}</p>
                </Card>
                <Card className="p-4 bg-amber-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">A Cobrar (Mês)</p>
                    <p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(stats.totalCobrado)}</p>
                </Card>
                <Card className="p-4 bg-green-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Recebido (Mês)</p>
                    <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(stats.totalRecebido)}</p>
                </Card>
                <Card className="p-4 bg-emerald-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Eficiência</p>
                    <p className={`text-3xl font-bold mt-1 ${Number(eficiencia) >= 80 ? 'text-emerald-700' : Number(eficiencia) >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
                        {eficiencia}%
                    </p>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl shadow-sm border">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input placeholder="Buscar por nome, unidade (Aparecida, Catalão…), CPF ou região de atuação..." className="pl-9"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="w-full md:w-44">
                    <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="">Status: Todos</option>
                        <option value="ativo">Ativo</option>
                        <option value="ferias">Férias</option>
                        <option value="afastado">Afastado</option>
                        <option value="inativo">Inativo</option>
                    </Select>
                </div>
                <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter(''); }}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Limpar
                </Button>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map(c => {
                    const ef = c.total_cobrado_mes_centavos > 0
                        ? ((c.total_recebido_mes_centavos / c.total_cobrado_mes_centavos) * 100)
                        : 0;
                    return (
                        <Card
                            key={c.id}
                            className={`overflow-hidden transition-all hover:shadow-lg cursor-pointer ${
                                selectedId === c.id ? 'ring-2 ring-blue-300' : ''
                            }`}
                            onClick={() => setSelectedId(c.id)}
                            onContextMenu={e => {
                                e.preventDefault();
                                setSelectedId(c.id);
                                setOpenMenuId(c.id);
                                setMenuPosition({ x: e.clientX, y: e.clientY });
                            }}
                        >
                            {/* Header colored bar */}
                            <div className={`h-1.5 ${c.status === 'ativo' ? 'bg-gradient-to-r from-blue-500 to-blue-600' : c.status === 'ferias' ? 'bg-gradient-to-r from-blue-300 to-blue-400' : 'bg-gray-300'}`} />

                            <div className="p-5">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-lg flex-shrink-0">
                                            {c.nome.charAt(0)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-gray-900">{c.nome}</p>
                                            {c.filial_nome ? (
                                                <div className="mt-1.5 space-y-1">
                                                    <p
                                                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${
                                                            c.filial_todas_unidades
                                                                ? 'bg-slate-100 text-slate-800 ring-slate-200'
                                                                : c.filial_nome_inferido
                                                                  ? 'bg-amber-50 text-amber-950 ring-amber-200'
                                                                  : 'bg-indigo-50 text-indigo-900 ring-indigo-100'
                                                        }`}
                                                    >
                                                        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                                        <span className="truncate">
                                                            {c.filial_todas_unidades
                                                                ? 'Unidade'
                                                                : c.filial_nome_inferido
                                                                  ? 'Unidade (referência)'
                                                                  : 'Unidade'}
                                                            : {c.filial_nome}
                                                        </span>
                                                    </p>
                                                    {c.filial_nome_inferido ? (
                                                        <p className="text-[10px] text-amber-900/90 leading-snug max-w-[260px]">
                                                            Cruzamos com a região de atuação porque o banco ainda não guardou a filial.
                                                            Rode a migration <strong>filial_id</strong> no Supabase e salve de novo em editar para fixar.
                                                        </p>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <p className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 ring-1 ring-amber-100">
                                                    Unidade não informada — defina em editar (Aparecida, Catalão, Ipameri…)
                                                </p>
                                            )}
                                            {c.caixas_rotulo ? (
                                                <p className="mt-1.5 text-[11px] text-emerald-800 font-medium">
                                                    Caixa: {c.caixas_rotulo}
                                                </p>
                                            ) : (
                                                <p className="mt-1.5 text-[11px] text-amber-800">
                                                    Caixa de destino não vinculado — edite o cobrador
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-2">
                                                {c.codigo}
                                                {c.area_atuacao_exibicao ? (
                                                    <>
                                                        <span className="text-gray-400"> · </span>
                                                        Atua em:{' '}
                                                        <span className="text-gray-600">{c.area_atuacao_exibicao}</span>
                                                    </>
                                                ) : null}
                                            </p>
                                        </div>
                                    </div>
                                    <StatusBadge status={c.status} />
                                </div>

                                {/* Contact */}
                                <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-600">
                                    <span className="flex items-center gap-1">
                                        <Phone className="h-3.5 w-3.5 text-gray-400" /> {c.telefone}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <MapPin className="h-3.5 w-3.5 text-gray-400" /> {c.bairros.length} bairros
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Star className="h-3.5 w-3.5 text-amber-400" /> {c.comissao_percentual}%
                                    </span>
                                </div>

                                {/* Bairros */}
                                {c.bairros.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mb-4">
                                        {c.bairros.map((b) => (
                                            <span key={b} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs">{b}</span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-gray-400 mb-4">Nenhum bairro na rota — edite o cobrador para anexar.</p>
                                )}

                                {/* Metrics */}
                                <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-lg p-3">
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-gray-900">{c.total_clientes_ativos}</p>
                                        <p className="text-xs text-gray-500">Clientes</p>
                                    </div>
                                    <div className="text-center border-x border-gray-200">
                                        <p className="text-lg font-bold text-green-700">{formatCurrency(c.total_recebido_mes_centavos)}</p>
                                        <p className="text-xs text-gray-500">Recebido</p>
                                    </div>
                                    <div className="text-center">
                                        <p className={`text-lg font-bold ${ef >= 80 ? 'text-emerald-700' : ef >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
                                            {ef.toFixed(0)}%
                                        </p>
                                        <p className="text-xs text-gray-500">Eficiência</p>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                {c.status === 'ativo' && (
                                    <div className="mt-3">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-gray-500">Progresso do Mês</span>
                                            <span className="font-medium text-gray-700">{ef.toFixed(0)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div
                                                className={`h-2 rounded-full transition-all duration-500 ${ef >= 80 ? 'bg-emerald-500' : ef >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                style={{ width: `${Math.min(ef, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {openMenuId === c.id && (
                                <DropdownMenuContent isOpen={true} onClose={() => setOpenMenuId(null)} position={menuPosition}>
                                    <DropdownMenuItem onClick={() => { navigate(`/cobradores/${c.id}`); setOpenMenuId(null); }}>
                                        <Eye className="h-4 w-4 mr-2" /> Ver Perfil
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { navigate(`/cobradores/${c.id}/editar`); setOpenMenuId(null); }}>
                                        <Edit3 className="h-4 w-4 mr-2" /> Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { navigate(`/cobradores/pendentes?cobrador=${c.id}`); setOpenMenuId(null); }}>
                                        <ClipboardList className="h-4 w-4 mr-2" /> Ver Cobranças
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            )}
                        </Card>
                    );
                })}
            </div>

            <div className="bg-white rounded-xl px-4 py-3 border shadow-sm text-sm text-gray-500">
                {filtered.length} cobrador(es) encontrado(s)
            </div>
        </div>
    );
};

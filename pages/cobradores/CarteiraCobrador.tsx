import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronLeft, ChevronRight, Pencil, RefreshCw, Check, X, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select } from '../../components/ui/Components';
import { Modal } from '../../components/ui/Modal';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { empresaIdsConsultaCobradores } from '../../lib/cobradorEmpresaScope';
import { cobradorPertenceUnidade, idsFiliaisDaUnidadeOperacional } from '../../lib/cobradorUnidadeFiltro';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';
import { useCobradorEscopo } from '../../lib/useCobradorEscopo';
import { supabase } from '../../lib/supabase';
import { useClienteStore, type ClienteSB } from '../../lib/ClienteStore';
import { clienteMatchBusca } from '../../lib/buscaCliente';
import {
    atribuirCobradorCarteiraCliente,
    atribuirCobradorCarteiraLote,
    mapaCobradorInfoPorCliente,
} from '../../lib/cobradorDisponiveis';
import { atribuirClienteCarteiraEscritorio } from '../../lib/carteiraEscritorio';
import { cobradorOpcoesComEscritorio, isCobradorEscritorio } from '../../lib/cobradorEscritorio';

const PAGE_SIZE_OPTIONS = [20, 50, 100, 500, 1000, 5000] as const;

interface ClienteCarteira {
    cliente_id: string;
    cliente_codigo: string;
    cliente_nome: string;
    cliente_bairro: string;
    contrato_codigo: string;
    parcelas_pendentes: number;
    valor_total_centavos: number;
}

const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

function bairroClienteParaRota(cli: {
    endereco_bairro?: string | null;
    endereco_cob_bairro?: string | null;
}): string {
    const cob = (cli.endereco_cob_bairro || '').trim();
    const res = (cli.endereco_bairro || '').trim();
    return cob || res || 'Sem bairro';
}

export const CarteiraCobrador: React.FC = () => {
    const {
        empresaIdOperacao,
        empresaIdsFiltro,
        visaoConsolidada,
        labelContexto,
        dataRevisionEmpresa,
    } = useEmpresaIdsOperacao();
    const {
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        podeAlternarEmpresa,
        empresaIdEfetivo,
    } = useEmpresaContextoAtivo();
    const { showToast } = useToast();
    const { cobradorRestrito, meuCobradorId } = useCobradorEscopo(empresaIdsFiltro);

    const [cobradores, setCobradores] = useState<{ id: string; nome: string; filial_id?: string | null; area_atuacao?: string | null }[]>([]);
    const [filiaisGrupo, setFiliaisGrupo] = useState<{ id: string; nome: string }[]>([]);
    const [cobradorSelecionadoId, setCobradorSelecionadoId] = useState('');
    const { buscarClientes } = useClienteStore();
    const [clientes, setClientes] = useState<ClienteCarteira[]>([]);
    const [filtroLista, setFiltroLista] = useState('');
    const [bairroFilter, setBairroFilter] = useState('');
    const [buscaIncluir, setBuscaIncluir] = useState('');
    const [resultadosIncluir, setResultadosIncluir] = useState<ClienteSB[]>([]);
    const [buscandoIncluir, setBuscandoIncluir] = useState(false);
    const [incluindoClienteId, setIncluindoClienteId] = useState<string | null>(null);
    const [cobradorInfoPorCliente, setCobradorInfoPorCliente] = useState<
        Map<string, { id: string; nome: string }>
    >(() => new Map());
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [clienteIdsModalTransfer, setClienteIdsModalTransfer] = useState<string[]>([]);
    const [modalTransferirAberto, setModalTransferirAberto] = useState(false);
    const [transferDestinoModal, setTransferDestinoModal] = useState('');
    const [transferindo, setTransferindo] = useState(false);
    const [loadingCobradores, setLoadingCobradores] = useState(false);
    const [loadingClientes, setLoadingClientes] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(20);
    const [editandoBairroClienteId, setEditandoBairroClienteId] = useState<string | null>(null);
    const [bairroEditValor, setBairroEditValor] = useState('');
    const [salvandoBairro, setSalvandoBairro] = useState(false);

    const empresaIdsSync = empresaIdsFiltro.length > 0 ? empresaIdsFiltro : empresaIdOperacao ? [empresaIdOperacao] : [];
    const empresaIdPrincipal = empresaIdsSync[0] || empresaIdOperacao || '';
    const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;
    const empresaNomeAtual = useMemo(
        () => empresasDoGrupo.find((e) => e.id === empresaIdEfetivo)?.nome || '',
        [empresasDoGrupo, empresaIdEfetivo],
    );
    const tokenUnidadeGrupo = useMemo(() => {
        if (!multiEmpresa || visaoTodasEmpresasGrupo) return '';
        return unidadeNomeCurto(empresaNomeAtual);
    }, [multiEmpresa, visaoTodasEmpresasGrupo, empresaNomeAtual]);
    const empresaIdsQueryCobradores = useMemo(
        () =>
            empresaIdsConsultaCobradores({
                empresaIdsParaFiltro: empresaIdsSync,
                empresasDoGrupo,
                visaoTodasEmpresasGrupo: visaoConsolidada,
                multiEmpresa,
                tokenUnidadeGrupo,
            }),
        [empresaIdsSync, empresasDoGrupo, visaoConsolidada, multiEmpresa, tokenUnidadeGrupo],
    );
    const filialIdsUnidade = useMemo(
        () => idsFiliaisDaUnidadeOperacional(filiaisGrupo, tokenUnidadeGrupo),
        [filiaisGrupo, tokenUnidadeGrupo],
    );
    const cobradoresDaUnidade = useMemo(() => {
        let lista = cobradores;
        if (tokenUnidadeGrupo && !visaoConsolidada) {
            lista = cobradores.filter((c) =>
                isCobradorEscritorio(c.id) ||
                cobradorPertenceUnidade(c, filiaisGrupo, {
                    filialIdsUnidade: filialIdsUnidade,
                    tokenUnidade: tokenUnidadeGrupo,
                    empresaIdAtual: empresaIdOperacao || empresaIdEfetivo || undefined,
                }),
            );
        }
        return cobradorOpcoesComEscritorio(lista);
    }, [
        cobradores,
        filiaisGrupo,
        filialIdsUnidade,
        tokenUnidadeGrupo,
        visaoConsolidada,
        empresaIdOperacao,
        empresaIdEfetivo,
    ]);

    const cobradorSelecionado = useMemo(
        () => cobradoresDaUnidade.find((c) => c.id === cobradorSelecionadoId) || null,
        [cobradoresDaUnidade, cobradorSelecionadoId],
    );

    const loadCobradores = async () => {
        if (empresaIdsQueryCobradores.length === 0) return;
        setLoadingCobradores(true);
        try {
            const { data: filiaisRows } = await supabase
                .from('filiais')
                .select('id, nome')
                .in('empresa_id', empresaIdsQueryCobradores);
            setFiliaisGrupo(
                (filiaisRows || []).map((f: { id: string; nome: string }) => ({ id: f.id, nome: f.nome })),
            );

            const idsCob = empresaIdsQueryCobradores;
            const { data, error } =
                idsCob.length === 1
                    ? await supabase
                          .from('cobradores')
                          .select('id, nome, empresa_id, filial_id, area_atuacao')
                          .eq('empresa_id', idsCob[0])
                          .eq('status', 'ativo')
                          .order('nome')
                    : await supabase
                          .from('cobradores')
                          .select('id, nome, empresa_id, filial_id, area_atuacao')
                          .in('empresa_id', idsCob)
                          .eq('status', 'ativo')
                          .order('nome');

            if (error) throw error;
            const mapped = (data || []).map(
                (c: { id: string; nome: string; filial_id?: string | null; area_atuacao?: string | null }) => ({
                    id: c.id,
                    nome: c.nome,
                    filial_id: c.filial_id,
                    area_atuacao: c.area_atuacao,
                }),
            );
            setCobradores(mapped);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao carregar cobradores', 'error');
        } finally {
            setLoadingCobradores(false);
        }
    };

    const loadClientesDoCobrador = async (cobradorId: string) => {
        if (!cobradorId || empresaIdsSync.length === 0) {
            setClientes([]);
            return;
        }
        setLoadingClientes(true);
        try {
            const empresaFiltro = empresaIdsSync.length === 1 ? empresaIdsSync[0] : empresaIdsSync;
            let q = supabase
                .from('cob_cobrancas_pendentes')
                .select(`
                    id, cliente_id, cobrador_id, valor_centavos, observacao, conta_receber_id,
                    fin_contas_receber ( assinatura_id, deleted_at, assinaturas ( codigo ) ),
                    clientes ( nome, codigo, endereco_bairro, endereco_cob_bairro )
                `)
                .in('status', ['pendente', 'em_andamento', 'promessa']);

            if (isCobradorEscritorio(cobradorId)) {
                q = q.eq('canal_cobranca', 'escritorio');
            } else {
                q = q.eq('cobrador_id', cobradorId).eq('canal_cobranca', 'cobrador');
            }

            q = Array.isArray(empresaFiltro)
                ? q.in('empresa_id', empresaFiltro)
                : q.eq('empresa_id', empresaFiltro);

            const { data, error } = await q;
            if (error) throw error;

            const grouped = new Map<string, ClienteCarteira>();
            (data || []).forEach((item: Record<string, unknown>) => {
                const clienteId = String(item.cliente_id || '');
                if (!clienteId) return;

                const fr = item.fin_contas_receber as {
                    deleted_at?: string | null;
                    assinaturas?: { codigo?: string } | null;
                } | null;
                const contaReceberId = item.conta_receber_id ? String(item.conta_receber_id) : '';
                if (contaReceberId && (!fr || fr.deleted_at)) return;

                const cli = item.clientes as {
                    nome?: string;
                    codigo?: string;
                    endereco_bairro?: string;
                    endereco_cob_bairro?: string;
                } | null;
                const obs = String(item.observacao || '');
                const contratoFromObs = obs.match(/Contrato\s+(CTR-[\dA-Z-]+|\S+)/i)?.[1] || '';
                const contratoCodigo =
                    fr?.assinaturas?.codigo ||
                    contratoFromObs ||
                    (obs.includes('Contrato') ? obs.replace(/^Contrato\s+/i, '') : '—');

                const valorCentavos = Number(item.valor_centavos || 0);
                const current = grouped.get(clienteId);
                if (!current) {
                    grouped.set(clienteId, {
                        cliente_id: clienteId,
                        cliente_codigo: cli?.codigo || '—',
                        cliente_nome: cli?.nome || 'Cliente sem nome',
                        cliente_bairro: cli ? bairroClienteParaRota(cli) : 'Sem bairro',
                        contrato_codigo: contratoCodigo,
                        parcelas_pendentes: 1,
                        valor_total_centavos: valorCentavos,
                    });
                    return;
                }
                current.parcelas_pendentes += 1;
                current.valor_total_centavos += valorCentavos;
                if (current.contrato_codigo === '—' && contratoCodigo !== '—') {
                    current.contrato_codigo = contratoCodigo;
                }
            });

            setClientes(
                Array.from(grouped.values()).sort((a, b) =>
                    a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR'),
                ),
            );
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao carregar carteira', 'error');
            setClientes([]);
        } finally {
            setLoadingClientes(false);
        }
    };

    useEffect(() => {
        void loadCobradores();
        if (!cobradorRestrito) {
            setCobradorSelecionadoId('');
            setClientes([]);
        }
    }, [empresaIdOperacao, empresaIdsFiltro.join(','), empresaIdsQueryCobradores.join(','), dataRevisionEmpresa]);

    useEffect(() => {
        if (cobradorRestrito && meuCobradorId) setCobradorSelecionadoId(meuCobradorId);
    }, [cobradorRestrito, meuCobradorId]);

    const recarregarBloqueiosInclusao = async () => {
        if (empresaIdsSync.length === 0) {
            setCobradorInfoPorCliente(new Map());
            return;
        }
        const mapaInfo = await mapaCobradorInfoPorCliente(empresaIdsSync);
        setCobradorInfoPorCliente(mapaInfo);
    };

    useEffect(() => {
        void recarregarBloqueiosInclusao();
    }, [empresaIdsSync.join(','), dataRevisionEmpresa]);

    useEffect(() => {
        setPage(1);
        setFiltroLista('');
        setBairroFilter('');
        setBuscaIncluir('');
        setResultadosIncluir([]);
        setSelectedIds([]);
        setModalTransferirAberto(false);
        setTransferDestinoModal('');
        if (!cobradorSelecionadoId) {
            setClientes([]);
            return;
        }
        void loadClientesDoCobrador(cobradorSelecionadoId);
    }, [cobradorSelecionadoId]);

    useEffect(() => {
        setPage(1);
    }, [filtroLista, bairroFilter, pageSize]);

    const idsNaCarteiraDoCobrador = useMemo(
        () => new Set(clientes.map((c) => c.cliente_id)),
        [clientes],
    );

    useEffect(() => {
        const termo = buscaIncluir.trim();
        if (!cobradorSelecionadoId || termo.length < 2) {
            setResultadosIncluir([]);
            return;
        }
        setBuscandoIncluir(true);
        const t = window.setTimeout(() => {
            buscarClientes(termo)
                .then((lista) =>
                    setResultadosIncluir(
                        lista
                            .filter((c) => clienteMatchBusca(c, termo))
                            .filter((c) => !idsNaCarteiraDoCobrador.has(c.id))
                            .slice(0, 25),
                    ),
                )
                .finally(() => setBuscandoIncluir(false));
        }, 320);
        return () => window.clearTimeout(t);
    }, [buscaIncluir, buscarClientes, cobradorSelecionadoId, idsNaCarteiraDoCobrador]);

    const bairros = useMemo(() => {
        return Array.from(new Set(clientes.map((c) => c.cliente_bairro))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [clientes]);

    const filtrados = useMemo(() => {
        const term = filtroLista.trim().toLowerCase();
        return clientes.filter((c) => {
            const matchSearch =
                !term ||
                c.cliente_nome.toLowerCase().includes(term) ||
                c.cliente_codigo.toLowerCase().includes(term) ||
                c.contrato_codigo.toLowerCase().includes(term);
            const matchBairro = !bairroFilter || c.cliente_bairro === bairroFilter;
            return matchSearch && matchBairro;
        });
    }, [clientes, filtroLista, bairroFilter]);

    const clientesMapPorId = useMemo(() => new Map(clientes.map((c) => [c.cliente_id, c])), [clientes]);

    const nomeCobradorOrigem = (clienteId: string) => {
        if (idsNaCarteiraDoCobrador.has(clienteId)) {
            return cobradorSelecionado?.nome || '—';
        }
        return cobradorInfoPorCliente.get(clienteId)?.nome || 'Sem cobrador';
    };

    const clienteTemOutroCobrador = (clienteId: string) => {
        const info = cobradorInfoPorCliente.get(clienteId);
        return Boolean(info?.id && info.id !== cobradorSelecionadoId);
    };

    const linhasTransferenciaModal = useMemo(
        () =>
            clienteIdsModalTransfer.map((id) => {
                const cart = clientesMapPorId.get(id);
                const busca = resultadosIncluir.find((c) => c.id === id);
                return {
                    cliente_id: id,
                    cliente_codigo: cart?.cliente_codigo || busca?.codigo || '—',
                    cliente_nome: cart?.cliente_nome || busca?.nome || 'Cliente',
                    contrato_codigo: cart?.contrato_codigo || '—',
                    cobrador_origem: nomeCobradorOrigem(id),
                };
            }),
        [
            clienteIdsModalTransfer,
            clientesMapPorId,
            resultadosIncluir,
            cobradorInfoPorCliente,
            idsNaCarteiraDoCobrador,
            cobradorSelecionado,
        ],
    );

    const abrirModalTransferir = (ids?: string[]) => {
        const alvo = ids ?? selectedIds;
        if (alvo.length === 0) {
            showToast('Selecione ao menos um cliente.', 'warning');
            return;
        }
        const primeiroOutro = alvo.find((id) => clienteTemOutroCobrador(id));
        setClienteIdsModalTransfer(alvo);
        setTransferDestinoModal(
            primeiroOutro && cobradorSelecionadoId ? cobradorSelecionadoId : '',
        );
        setModalTransferirAberto(true);
    };

    const fecharModalTransferir = () => {
        setModalTransferirAberto(false);
        setTransferDestinoModal('');
        setClienteIdsModalTransfer([]);
    };

    const resumo = useMemo(() => {
        return {
            clientes: filtrados.length,
            parcelas: filtrados.reduce((acc, c) => acc + c.parcelas_pendentes, 0),
            total: filtrados.reduce((acc, c) => acc + c.valor_total_centavos, 0),
        };
    }, [filtrados]);

    const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
    const paginated = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filtrados.slice(start, start + pageSize);
    }, [filtrados, page, pageSize]);

    const iniciarEdicaoBairro = (cliente: ClienteCarteira) => {
        setEditandoBairroClienteId(cliente.cliente_id);
        setBairroEditValor(cliente.cliente_bairro === 'Sem bairro' ? '' : cliente.cliente_bairro);
    };

    const cancelarEdicaoBairro = () => {
        setEditandoBairroClienteId(null);
        setBairroEditValor('');
    };

    const incluirClienteNaCarteira = async (clienteId: string) => {
        if (!empresaIdPrincipal || !cobradorSelecionadoId) {
            showToast('Selecione o cobrador e a unidade.', 'warning');
            return;
        }
        setIncluindoClienteId(clienteId);
        try {
            const res = isCobradorEscritorio(cobradorSelecionadoId)
                ? await atribuirClienteCarteiraEscritorio(empresaIdPrincipal, clienteId)
                : await atribuirCobradorCarteiraCliente(
                      empresaIdPrincipal,
                      clienteId,
                      cobradorSelecionadoId,
                  );
            if (!res.ok) {
                showToast(res.erro || 'Não foi possível incluir na carteira.', 'error');
                return;
            }
            showToast(`Cliente incluído na carteira de ${cobradorSelecionado?.nome}.`, 'success');
            setBuscaIncluir('');
            setResultadosIncluir([]);
            await loadClientesDoCobrador(cobradorSelecionadoId);
            await recarregarBloqueiosInclusao();
        } finally {
            setIncluindoClienteId(null);
        }
    };

    const toggleClienteSelecionado = (clienteId: string) => {
        setSelectedIds((prev) =>
            prev.includes(clienteId) ? prev.filter((id) => id !== clienteId) : [...prev, clienteId],
        );
    };

    const toggleSelecionarPagina = () => {
        const idsPagina = paginated.map((c) => c.cliente_id);
        const todos = idsPagina.every((id) => selectedIds.includes(id));
        if (todos) {
            setSelectedIds((prev) => prev.filter((id) => !idsPagina.includes(id)));
            return;
        }
        setSelectedIds((prev) => Array.from(new Set([...prev, ...idsPagina])));
    };

    const transferirSelecionados = async () => {
        if (!empresaIdPrincipal || empresaIdsSync.length === 0) {
            showToast('Unidade não identificada.', 'error');
            return;
        }
        if (!transferDestinoModal) {
            showToast('Selecione para onde enviar os clientes.', 'warning');
            return;
        }
        if (clienteIdsModalTransfer.length === 0) {
            showToast('Nenhum cliente selecionado.', 'warning');
            return;
        }

        setTransferindo(true);
        try {
            if (isCobradorEscritorio(transferDestinoModal)) {
                let ok = 0;
                for (const clienteId of clienteIdsModalTransfer) {
                    const res = await atribuirClienteCarteiraEscritorio(empresaIdPrincipal, clienteId);
                    if (res.ok) ok += 1;
                }
                if (ok === 0) {
                    showToast('Não foi possível transferir para o Escritório.', 'error');
                    return;
                }
                showToast(`${ok} cliente(s) transferido(s) para Escritório.`, 'success');
            } else {
                const res = await atribuirCobradorCarteiraLote(
                    empresaIdsSync,
                    clienteIdsModalTransfer,
                    transferDestinoModal,
                );
                if (!res.ok) {
                    showToast(res.erro || 'Não foi possível transferir.', 'error');
                    return;
                }
                const nomeDest =
                    cobradoresDaUnidade.find((c) => c.id === transferDestinoModal)?.nome || 'cobrador';
                showToast(
                    `${clienteIdsModalTransfer.length} cliente(s) transferido(s) para ${nomeDest}.`,
                    'success',
                );
            }
            setSelectedIds([]);
            setBuscaIncluir('');
            setResultadosIncluir([]);
            fecharModalTransferir();
            if (cobradorSelecionadoId) await loadClientesDoCobrador(cobradorSelecionadoId);
            await recarregarBloqueiosInclusao();
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro na transferência', 'error');
        } finally {
            setTransferindo(false);
        }
    };

    const salvarBairroCliente = async (clienteId: string) => {
        const novo = bairroEditValor.trim();
        if (!novo) {
            showToast('Informe o nome do bairro.', 'warning');
            return;
        }
        setSalvandoBairro(true);
        try {
            const { error } = await supabase
                .from('clientes')
                .update({
                    endereco_cob_bairro: novo,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', clienteId);
            if (error) throw error;
            showToast('Bairro de cobrança atualizado.', 'success');
            cancelarEdicaoBairro();
            if (cobradorSelecionadoId) await loadClientesDoCobrador(cobradorSelecionadoId);
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao salvar bairro', 'error');
        } finally {
            setSalvandoBairro(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={cobradorRestrito ? 'Minha carteira' : 'Carteira'}
                subtitle={
                    cobradorRestrito
                        ? 'Clientes atribuídos ao seu cadastro de cobrador.'
                        : visaoConsolidada
                          ? 'Selecione o cobrador (incluindo Escritório), consulte a carteira e transfira clientes entre cobradores.'
                          : `Unidade ${labelContexto}: selecione o cobrador ou Escritório na lista.`
                }
            />

            <Card className="p-4 md:p-5 border-blue-100 bg-blue-50/30">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                    <div className="flex-1 max-w-md">
                        <Select
                            label={cobradorRestrito ? 'Cobrador' : '1. Selecione o cobrador'}
                            value={cobradorSelecionadoId}
                            onChange={(e) => setCobradorSelecionadoId(e.target.value)}
                            disabled={loadingCobradores || cobradorRestrito}
                        >
                            <option value="">
                                {loadingCobradores ? 'Carregando cobradores...' : 'Escolha um cobrador...'}
                            </option>
                            {cobradoresDaUnidade.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}
                                </option>
                            ))}
                        </Select>
                    </div>
                    {cobradorSelecionado ? (
                        <div className="flex flex-wrap gap-3 pb-1">
                            <div className="rounded-xl bg-white border border-blue-100 px-4 py-2 text-center min-w-[88px]">
                                <p className="text-[10px] font-bold uppercase text-gray-500">Clientes</p>
                                <p className="text-xl font-bold text-blue-800">{resumo.clientes}</p>
                            </div>
                            <div className="rounded-xl bg-white border border-blue-100 px-4 py-2 text-center min-w-[88px]">
                                <p className="text-[10px] font-bold uppercase text-gray-500">Parcelas</p>
                                <p className="text-xl font-bold text-blue-800">{resumo.parcelas}</p>
                            </div>
                            <div className="rounded-xl bg-white border border-emerald-100 px-4 py-2 text-center min-w-[120px]">
                                <p className="text-[10px] font-bold uppercase text-gray-500">Em aberto</p>
                                <p className="text-lg font-bold text-emerald-800">{formatCurrency(resumo.total)}</p>
                            </div>
                        </div>
                    ) : null}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={loadingClientes}
                        disabled={!cobradorSelecionadoId}
                        onClick={() => cobradorSelecionadoId && void loadClientesDoCobrador(cobradorSelecionadoId)}
                    >
                        <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                    </Button>
                </div>
                {!loadingCobradores && cobradoresDaUnidade.length === 0 ? (
                    <p className="text-xs text-amber-800 mt-3">
                        Nenhum cobrador ativo nesta unidade. Cadastre em Cobradores → Novo.
                    </p>
                ) : null}
            </Card>

            {!cobradorSelecionadoId ? (
                <Card className="p-10 text-center text-gray-500">
                    <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="font-medium text-gray-700">Selecione um cobrador acima</p>
                    <p className="text-sm mt-1">A lista de clientes da carteira aparecerá aqui.</p>
                </Card>
            ) : (
                <>
                    <Card className="p-4 space-y-3 border-violet-100 bg-violet-50/40">
                        <h3 className="text-sm font-bold text-violet-900 flex items-center gap-2">
                            <UserPlus className="h-4 w-4" /> Incluir cliente nesta carteira
                        </h3>
                        <p className="text-xs text-violet-800">
                            {cobradorRestrito
                                ? 'Busque e inclua clientes na sua carteira.'
                                : (
                                    <>
                                        Sem cobrador: use <strong>Incluir</strong>. Já com outro cobrador: use{' '}
                                        <strong>Transferir</strong> (abre o modal com origem e destino).
                                    </>
                                )}
                        </p>
                        <Input
                            className="normal-case"
                            autoComplete="off"
                            placeholder="Buscar por nome, CPF ou código (mín. 2 letras)..."
                            value={buscaIncluir}
                            onChange={(e) => setBuscaIncluir(e.target.value)}
                        />
                        {buscandoIncluir ? <p className="text-xs text-gray-500">Buscando...</p> : null}
                        {buscaIncluir.trim().length >= 2 &&
                        !buscandoIncluir &&
                        resultadosIncluir.length === 0 ? (
                            <p className="text-xs text-amber-700">
                                Nenhum cliente encontrado (já está na carteira de {cobradorSelecionado?.nome} ou termo
                                sem resultado).
                            </p>
                        ) : null}
                        {resultadosIncluir.length > 0 ? (
                            <ul className="max-h-48 overflow-y-auto border rounded-xl bg-white divide-y text-sm">
                                {resultadosIncluir.map((c) => (
                                    <li
                                        key={c.id}
                                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-violet-50/80"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <span className="font-mono text-xs text-gray-500">{c.codigo || '—'}</span>
                                            <span className="ml-2 font-medium text-gray-900">{c.nome}</span>
                                            {clienteTemOutroCobrador(c.id) ? (
                                                <span className="block text-[10px] text-amber-800 mt-0.5">
                                                    Cobrador atual:{' '}
                                                    <strong>{cobradorInfoPorCliente.get(c.id)?.nome}</strong>
                                                </span>
                                            ) : null}
                                        </div>
                                        {clienteTemOutroCobrador(c.id) ? (
                                            cobradorRestrito ? (
                                                <span className="text-[10px] text-amber-800">Outro cobrador</span>
                                            ) : (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="border-amber-300 text-amber-900 hover:bg-amber-50"
                                                onClick={() => abrirModalTransferir([c.id])}
                                            >
                                                <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                                                Transferir
                                            </Button>
                                            )
                                        ) : (
                                            <Button
                                                type="button"
                                                size="sm"
                                                loading={incluindoClienteId === c.id}
                                                onClick={() => void incluirClienteNaCarteira(c.id)}
                                            >
                                                <UserPlus className="h-3.5 w-3.5 mr-1" />
                                                Incluir
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </Card>

                    <Card className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Input
                                className="normal-case"
                                autoComplete="off"
                                placeholder="Filtrar clientes já na carteira..."
                                value={filtroLista}
                                onChange={(e) => setFiltroLista(e.target.value)}
                            />
                            <Select value={bairroFilter} onChange={(e) => setBairroFilter(e.target.value)}>
                                <option value="">Bairro: todos</option>
                                {bairros.map((bairro) => (
                                    <option key={bairro} value={bairro}>
                                        {bairro}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    </Card>

                    <Card className="overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-700">
                                Carteira de <strong className="text-blue-800">{cobradorSelecionado?.nome}</strong>
                                {' — '}
                                {filtrados.length} cliente(s)
                                {selectedIds.length > 0 ? (
                                    <span className="text-amber-700"> · {selectedIds.length} marcado(s)</span>
                                ) : null}
                            </span>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" type="button" onClick={toggleSelecionarPagina}>
                                    {paginated.every((c) => selectedIds.includes(c.cliente_id))
                                        ? 'Desmarcar página'
                                        : 'Selecionar página'}
                                </Button>
                                {!cobradorRestrito ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={selectedIds.length === 0}
                                        onClick={() => abrirModalTransferir()}
                                    >
                                        <ArrowRightLeft className="h-4 w-4 mr-1" />
                                        Transferir{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b">
                                        <th className="py-3 px-4 text-left w-10">Sel.</th>
                                        <th className="py-3 px-4 text-left w-12">#</th>
                                        <th className="py-3 px-4 text-left">Cód.</th>
                                        <th className="py-3 px-4 text-left">Cliente</th>
                                        <th className="py-3 px-4 text-left">Contrato</th>
                                        <th className="py-3 px-4 text-left">Bairro</th>
                                        <th className="py-3 px-4 text-center">Parcelas</th>
                                        <th className="py-3 px-4 text-right">Total em aberto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {loadingClientes ? (
                                        <tr>
                                            <td colSpan={8} className="py-12 text-center text-gray-500">
                                                Carregando clientes...
                                            </td>
                                        </tr>
                                    ) : (
                                        paginated.map((cliente, idx) => {
                                            const numero = (page - 1) * pageSize + idx + 1;
                                            const destaque = idx % 2 === 0;
                                            return (
                                                <tr
                                                    key={cliente.cliente_id}
                                                    className={
                                                        destaque
                                                            ? 'bg-blue-50/50 hover:bg-blue-100/40'
                                                            : 'bg-white hover:bg-gray-50'
                                                    }
                                                >
                                                    <td className="py-3 px-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.includes(cliente.cliente_id)}
                                                            onChange={() => toggleClienteSelecionado(cliente.cliente_id)}
                                                            className="h-4 w-4 rounded border-gray-300"
                                                        />
                                                    </td>
                                                    <td className="py-3 px-4 text-gray-400 font-mono text-xs">
                                                        {numero}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-xs text-gray-600">
                                                        {cliente.cliente_codigo}
                                                    </td>
                                                    <td className="py-3 px-4 font-semibold text-gray-900">
                                                        {cliente.cliente_nome}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-xs text-indigo-700">
                                                        {cliente.contrato_codigo}
                                                    </td>
                                                    <td className="py-3 px-4 text-gray-600">
                                                        {editandoBairroClienteId === cliente.cliente_id ? (
                                                            <div className="flex items-center gap-1 min-w-[200px]">
                                                                <Input
                                                                    className="normal-case h-9 text-sm"
                                                                    value={bairroEditValor}
                                                                    onChange={(e) => setBairroEditValor(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            void salvarBairroCliente(cliente.cliente_id);
                                                                        }
                                                                        if (e.key === 'Escape') cancelarEdicaoBairro();
                                                                    }}
                                                                    autoFocus
                                                                />
                                                                <button
                                                                    type="button"
                                                                    className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50"
                                                                    title="Salvar bairro"
                                                                    disabled={salvandoBairro}
                                                                    onClick={() => void salvarBairroCliente(cliente.cliente_id)}
                                                                >
                                                                    <Check className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                                                                    title="Cancelar"
                                                                    onClick={cancelarEdicaoBairro}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <span>{cliente.cliente_bairro}</span>
                                                                <button
                                                                    type="button"
                                                                    className="p-1 rounded-lg text-indigo-600 hover:bg-indigo-50"
                                                                    title="Editar bairro de cobrança"
                                                                    onClick={() => iniciarEdicaoBairro(cliente)}
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-center font-medium">
                                                        {cliente.parcelas_pendentes}
                                                    </td>
                                                    <td className="py-3 px-4 text-right font-bold text-gray-900">
                                                        {formatCurrency(cliente.valor_total_centavos)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {!loadingClientes && filtrados.length === 0 && (
                            <p className="px-4 py-8 text-sm text-gray-500 text-center">
                                Este cobrador não tem clientes na carteira nesta unidade (ou nenhum pendente em aberto).
                            </p>
                        )}

                        {filtrados.length > 0 && (
                            <div className="px-4 py-3 border-t bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <p className="text-xs text-gray-600">
                                    Mostrando {(page - 1) * pageSize + 1} a{' '}
                                    {Math.min(page * pageSize, filtrados.length)} de {filtrados.length}
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select
                                        value={String(pageSize)}
                                        onChange={(e) => setPageSize(Number(e.target.value))}
                                        className="w-28"
                                    >
                                        {PAGE_SIZE_OPTIONS.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {opt} / página
                                            </option>
                                        ))}
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <span className="text-xs font-medium text-gray-700 min-w-[80px] text-center">
                                        Pág. {page} / {totalPages}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>

                    <Modal
                        isOpen={modalTransferirAberto}
                        onClose={fecharModalTransferir}
                        title="Transferir clientes"
                        size="lg"
                    >
                        <div className="space-y-5">
                            <p className="text-sm text-gray-600">
                                Confira de qual cobrador os clientes saem e escolha o destino.
                            </p>

                            <div className="rounded-xl border border-gray-200 overflow-hidden max-h-64 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="py-2 px-3 text-left font-semibold text-gray-600">Cliente</th>
                                            <th className="py-2 px-3 text-left font-semibold text-gray-600">De</th>
                                            <th className="py-2 px-3 text-left font-semibold text-gray-600">Contrato</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {linhasTransferenciaModal.map((c) => (
                                            <tr key={c.cliente_id} className="hover:bg-gray-50">
                                                <td className="py-2 px-3">
                                                    <span className="font-mono text-xs text-gray-500 block">
                                                        {c.cliente_codigo}
                                                    </span>
                                                    <span className="font-medium text-gray-900">{c.cliente_nome}</span>
                                                </td>
                                                <td className="py-2 px-3 text-emerald-800 font-semibold whitespace-nowrap">
                                                    {c.cobrador_origem}
                                                </td>
                                                <td className="py-2 px-3 font-mono text-xs text-indigo-700">
                                                    {c.contrato_codigo}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-3">
                                <Select
                                    label="Para onde enviar"
                                    value={transferDestinoModal}
                                    onChange={(e) => setTransferDestinoModal(e.target.value)}
                                >
                                    <option value="">Selecione o destino...</option>
                                    {cobradoresDaUnidade
                                        .filter((c) => c.id !== cobradorSelecionadoId)
                                        .map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome}
                                            </option>
                                        ))}
                                </Select>
                                {transferDestinoModal ? (
                                    <p className="text-xs text-amber-900">
                                        <strong>{linhasTransferenciaModal.length}</strong> cliente(s) →{' '}
                                        <strong>
                                            {cobradoresDaUnidade.find((c) => c.id === transferDestinoModal)?.nome}
                                        </strong>
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
                                <Button type="button" variant="outline" onClick={fecharModalTransferir}>
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    loading={transferindo}
                                    disabled={!transferDestinoModal}
                                    onClick={() => void transferirSelecionados()}
                                >
                                    Confirmar transferência
                                </Button>
                            </div>
                        </div>
                    </Modal>
                </>
            )}
        </div>
    );
};

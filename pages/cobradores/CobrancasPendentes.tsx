import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
    Search, MapPin, Phone,
    DollarSign, Clock, CheckCircle2,
    X, Printer, Navigation, Plus, Check,
    FileText, Bluetooth, RefreshCw, History, ClipboardCheck,
    SlidersHorizontal, QrCode, CreditCard, ChevronDown, ChevronUp,
    MessageSquare, LayoutGrid, List,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import { ApexLoader } from '../../components/ui/ApexLoader';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import {
    imprimirReciboBaixaCobrador,
    labelFormaPagamentoRecibo,
    type ModoReciboBaixaCobrador,
} from '../../lib/ReciboTermicoService';
import { IMPRESSORA_BLUETOOTH_CELULAR_ID, loadReciboTermicoConfigCobrador } from '../../lib/reciboTermicoConfig';
import { isNavegadorMobile, reservarJanelaImpressaoPdf } from '../../lib/printPdfBlob';
import { ensureContasDestinoBaixa } from '../../lib/finCaixaAutoAbertura';
import { mesReferenciaCurto, parcelaPendenteCobranca, rotuloParcelaCobranca } from '../../lib/cobrancaParcelaUi';
import { resolverContaReceberIdBaixaCampo } from '../../lib/cobrancaBaixaCampo';
import { dataHojeIsoLocal, formatarDataIsoPtBr } from '../../lib/contratoDatas';
import { ImpressoraBluetoothSetup } from '../../components/cobradores/ImpressoraBluetoothSetup';
import { useFinanceiro, type ContaBancaria } from '../../lib/FinanceiroStore';
import {
    carregarContasCobrador,
    filtrarContasDestinoCobrador,
    resolverContasDestinoBaixaCobrador,
    resolverContaPadraoDestinoCobrador,
    resolverCobradorIdBaixaCampo,
    type CobradorContaVinculo,
} from '../../lib/cobradorContasBancarias';
import { type FormaPagamentoCobradorCampo } from '../../lib/cobradorFormaPagamento';
import { usuarioPodeOperarConta, usuarioPodeVerTodosCaixas } from '../../lib/finCaixaPermissoes';
import { PixPagadorConfirmacao } from '../../components/financeiro/PixPagadorConfirmacao';
import { pixPagadorParaBaixa, validarPixPagador } from '../../lib/pixPagadorBaixa';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import {
    carregarCobrancasPendentes,
    sincronizarCarteiraComFinanceiro,
    marcarPendenciaCobradaPorTituloPago,
    registrarRecebimentoCampo,
    registrarVisitaCobranca,
    resolverFormaPagamentoId,
    type CobrancaPendenteDto,
    type StatusCobrancaPendente,
} from '../../lib/cobrancaPendentesSupabase';
import {
    resolverCobradorIdDoUsuario,
    usuarioEhGestorCobranca,
    usuarioEhPerfilCobrador,
} from '../../lib/cobradorUsuarioLink';
import {
    listarRotasCobranca,
    atualizarParadaRotaCobranca,
    atualizarStatusRota,
    type RotaCobrancaDto,
    type StatusParadaRota,
} from '../../lib/cobRotasSupabase';
import {
    montarObservacaoVisita,
    resumirClienteCobranca,
    resumirRotaDia,
    type ClienteCobrancaResumo,
    type MotivoVisitaCodigo,
} from '../../lib/cobrancaPendenteCobrancaResumo';
import { buscarClienteIdsPorCodigoContrato, contratoCodigoMatch } from '../../lib/buscaContrato';
import { CobrancasReimprimirReciboTab } from '../../components/cobradores/CobrancasReimprimirReciboTab';

type CobMainTab = 'carteira' | 'reimprimir';

type StatusCobranca = StatusCobrancaPendente;
type PrioridadeCobranca = CobrancaPendenteDto['prioridade'];
type CobrancaPendente = CobrancaPendenteDto;

interface ClienteCobranca {
    cliente_id: string;
    cliente_nome: string;
    cliente_cpf: string;
    cliente_bairro: string;
    cliente_endereco: string;
    cliente_telefone: string;
    cobrador_id: string;
    cobrador_nome: string;
    parcelas: CobrancaPendente[];
    plano_nome: string;
    valor_mensal_plano_centavos: number;
    valor_pendente_centavos: number;
    qtd_pendentes: number;
    valor_total_centavos: number;
    maior_dias_atraso: number;
    ultima_data_vencimento: string;
    resumo: ClienteCobrancaResumo;
}

type FiltroSituacaoRota = 'todos' | 'nao_cobrados' | 'sem_visita' | 'visitados_sem_pagamento';

type MotivoVisita =
    | 'nao_estava'
    | 'nao_pagou'
    | 'recusou'
    | 'sem_dinheiro'
    | 'endereco_fechado'
    | 'promessa'
    | 'outro';

interface AtendimentoModalState {
    cliente: ClienteCobranca;
    aba: 'receber' | 'visita';
    forma_pagamento: FormaPagamentoCobradorCampo;
    conta_bancaria_id: string;
    contas_destino: ContaBancaria[];
    data_pagamento: string;
    observacao: string;
    modo_recibo: ModoReciboBaixaCobrador;
    pix_mesmo_pagador: boolean;
    pix_nome_pagador: string;
    saving: boolean;
    cliente_estava: 'sim' | 'nao';
    visita_motivo: MotivoVisita;
    visita_justificativa: string;
    visita_saving: boolean;
}

const MOTIVO_VISITA_LABELS: Record<MotivoVisita, string> = {
    nao_estava: 'Cliente não estava em casa',
    nao_pagou: 'Cliente não pagou',
    recusou: 'Recusou pagar',
    sem_dinheiro: 'Sem dinheiro no momento',
    endereco_fechado: 'Endereço fechado / não localizado',
    promessa: 'Promessa de pagamento',
    outro: 'Outro motivo',
};

const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export const CobrancasPendentes: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const {
        empresaIdOperacao,
        empresaIdsFiltro,
        dataRevisionEmpresa,
        visaoConsolidada,
        labelContexto,
        loadingEmpresasGrupo,
    } = useEmpresaIdsOperacao();
    const empresaId = empresaIdOperacao;
    const { showToast } = useToast();
    const { contasBancarias, loadContasBancarias, baixarContaReceber, error: finError } = useFinanceiro();
    const [items, setItems] = useState<CobrancaPendente[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [clienteIdsBuscaContrato, setClienteIdsBuscaContrato] = useState<Set<string>>(() => new Set());
    const [statusFilter, setStatusFilter] = useState('');
    const [cobradorFilter, setCobradorFilter] = useState('');
    const [prioridadeFilter, setPrioridadeFilter] = useState('');
    const [rotaFilter, setRotaFilter] = useState('');
    const [bairroSituacaoFilter, setBairroSituacaoFilter] = useState<'todos' | 'pendentes' | 'baixadas'>('todos');
    const [atendimentoModal, setAtendimentoModal] = useState<AtendimentoModalState | null>(null);
    const [parcelasClienteModal, setParcelasClienteModal] = useState<ClienteCobranca | null>(null);
    const [parcelasSelecionadas, setParcelasSelecionadas] = useState<Record<string, string[]>>({});
    const [opcoesAvancadasAbertas, setOpcoesAvancadasAbertas] = useState(false);
    const [filtrosAvancadosAbertos, setFiltrosAvancadosAbertos] = useState(false);
    const [meuCobradorId, setMeuCobradorId] = useState<string | null>(null);
    const [vinculosContasPorCobrador, setVinculosContasPorCobrador] = useState<
        Map<string, CobradorContaVinculo[]>
    >(() => new Map());
    const [vinculoCobradorLoading, setVinculoCobradorLoading] = useState(false);
    const [rotasDisponiveis, setRotasDisponiveis] = useState<RotaCobrancaDto[]>([]);
    const [rotaAtivaId, setRotaAtivaId] = useState(searchParams.get('rota') || '');
    const [filtroSituacaoRota, setFiltroSituacaoRota] = useState<FiltroSituacaoRota>('nao_cobrados');
    const [sincronizando, setSincronizando] = useState(false);
    const abaUrl = searchParams.get('aba') || searchParams.get('tab');
    const mainTabInicial: CobMainTab =
        abaUrl === 'reimprimir' || abaUrl === 'recibo' ? 'reimprimir' : 'carteira';
    const [mainTab, setMainTab] = useState<CobMainTab>(mainTabInicial);

    const [bairrosExpandidos, setBairrosExpandidos] = useState<Record<string, boolean>>({});
    const [modoVista, setModoVista] = useState<'cards' | 'lista'>('cards');
    const alternarBairroExpandido = (bairro: string) => {
        setBairrosExpandidos((prev) => ({
            ...prev,
            [bairro]: !prev[bairro],
        }));
    };

    const modoGestor = usuarioEhGestorCobranca(user?.role);
    /** Cobrador em campo: carteira própria. Gestor/admin nunca ficam presos à carteira de um único cobrador. */
    const modoCobrador = usuarioEhPerfilCobrador(user?.role) && !modoGestor;

    useEffect(() => {
        if (modoCobrador) setBairroSituacaoFilter('pendentes');
        else setBairroSituacaoFilter('todos');
    }, [modoCobrador]);

    const irParaAba = useCallback(
        (aba: CobMainTab) => {
            setMainTab(aba);
            const next = new URLSearchParams(searchParams);
            if (aba === 'reimprimir') next.set('aba', 'reimprimir');
            else next.delete('aba');
            setSearchParams(next, { replace: true });
        },
        [searchParams, setSearchParams],
    );

    useEffect(() => {
        if (abaUrl === 'reimprimir' || abaUrl === 'recibo') {
            setMainTab('reimprimir');
        }
    }, [abaUrl]);

    useEffect(() => {
        const rotaUrl = searchParams.get('rota');
        if (rotaUrl) setRotaAtivaId(rotaUrl);
    }, [searchParams]);

    useEffect(() => {
        if (modoCobrador) return;
        const cobradorUrl = searchParams.get('cobrador');
        if (cobradorUrl) setCobradorFilter(cobradorUrl);
    }, [modoCobrador, searchParams]);

    const recarregarRotasDia = useCallback(async () => {
        if (empresaIdsFiltro.length === 0) return;
        const hoje = new Date().toISOString().slice(0, 10);
        try {
            const rows = await listarRotasCobranca(empresaIdsFiltro, {
                cobrador_id: modoCobrador ? (meuCobradorId || undefined) : (cobradorFilter || undefined),
                data: hoje,
                status: ['planejada', 'em_andamento'],
            });
            setRotasDisponiveis(rows);
        } catch {
            setRotasDisponiveis([]);
        }
    }, [empresaIdsFiltro, meuCobradorId, cobradorFilter, modoCobrador]);

    useEffect(() => {
        void recarregarRotasDia();
    }, [recarregarRotasDia, dataRevisionEmpresa]);

    const rotaAtiva = useMemo(
        () => rotasDisponiveis.find((r) => r.id === rotaAtivaId) || null,
        [rotasDisponiveis, rotaAtivaId],
    );

    const ordemClientesRota = useMemo(() => {
        if (!rotaAtiva) return new Map<string, number>();
        const map = new Map<string, number>();
        rotaAtiva.paradas.forEach((p, idx) => {
            if (p.cliente_id) map.set(p.cliente_id, p.ordem || idx + 1);
        });
        return map;
    }, [rotaAtiva]);

    const cobradores = useMemo(() =>
        [...new Map(items.map(p => [p.cobrador_id, { id: p.cobrador_id, nome: p.cobrador_nome }])).values()],
        [items]);

    const bairrosFiltroLista = useMemo((): string[] => {
        const bairros = items.map((p) => String(p.cliente_bairro || 'Sem bairro'));
        return [...new Set(bairros)].sort((a, b) => a.localeCompare(b));
    }, [items]);

    const paradaRotaPorCliente = useMemo(() => {
        if (!rotaAtiva) return new Map<string, { id: string; status: StatusParadaRota; observacao?: string }>();
        const map = new Map<string, { id: string; status: StatusParadaRota; observacao?: string }>();
        rotaAtiva.paradas.forEach((p) => {
            if (p.cliente_id) {
                map.set(p.cliente_id, { id: p.id, status: p.status, observacao: p.observacao });
            }
        });
        return map;
    }, [rotaAtiva]);

    const sincronizarParadaRotaAtiva = async (
        clienteId: string,
        cobrancaPendenteId: string,
        statusParada: StatusParadaRota,
        observacao?: string,
    ) => {
        if (!rotaAtiva) return;
        const parada =
            rotaAtiva.paradas.find((p) => p.cobranca_pendente_id === cobrancaPendenteId) ||
            rotaAtiva.paradas.find((p) => p.cliente_id === clienteId);
        if (!parada?.id) return;
        try {
            await atualizarParadaRotaCobranca(parada.id, {
                status: statusParada,
                observacao,
                hora_visita: new Date().toISOString(),
            });
            if (rotaAtiva.status === 'planejada') {
                await atualizarStatusRota(rotaAtiva.id, 'em_andamento');
            }
        } catch {
            /* não bloquear baixa/visita se parada falhar */
        }
    };

    const resolverCobradorQuery = (cobradorIdOverride?: string | null) =>
        modoCobrador
            ? (cobradorIdOverride || meuCobradorId || undefined)
            : (cobradorFilter || undefined);

    const atualizarSincronizarCarteira = async () => {
        if (empresaIdsFiltro.length === 0) {
            showToast('Selecione a unidade no topo da tela.', 'warning');
            return;
        }
        if (modoCobrador && !meuCobradorId) {
            showToast('Aguarde o vínculo do seu cadastro de cobrador.', 'warning');
            return;
        }
        setSincronizando(true);
        try {
            const rows = await sincronizarCarteiraComFinanceiro(empresaIdsFiltro, {
                status: statusFilter || undefined,
                cobrador_id: resolverCobradorQuery(),
            });
            setItems(rows);
            await recarregarRotasDia();
            showToast(
                `Lista atualizada — ${rows.length} cobrança(s) em aberto após sincronizar com o financeiro.`,
                'success',
            );
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : 'Erro ao sincronizar carteira',
                'error',
            );
        } finally {
            setSincronizando(false);
        }
    };

    const loadPendencias = async (cobradorIdOverride?: string | null) => {
        if (empresaIdsFiltro.length === 0) return;
        if (modoCobrador && !cobradorIdOverride && !meuCobradorId) return;

        setLoading(true);
        try {
            const cobradorQuery = resolverCobradorQuery(cobradorIdOverride);

            const rows = await carregarCobrancasPendentes(empresaIdsFiltro, {
                status: statusFilter || undefined,
                cobrador_id: cobradorQuery,
            });
            setItems(rows);
            await recarregarRotasDia();
        } catch (error) {
            const msg =
                error instanceof Error
                    ? error.message
                    : typeof error === 'object' && error !== null && 'message' in error
                      ? String((error as { message: unknown }).message)
                      : 'Erro ao carregar pendências';
            showToast(msg || 'Erro ao carregar pendências', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!modoCobrador) return;
        if (empresaIdsFiltro.length === 0 || !user) return;

        let cancelled = false;
        setVinculoCobradorLoading(true);
        void (async () => {
            try {
                const id = await resolverCobradorIdDoUsuario({
                    empresaIds: empresaIdsFiltro,
                    usuarioId: user.id,
                    email: user.email,
                    nome: user.nome,
                });
                if (cancelled) return;
                setMeuCobradorId(id);
                setCobradorFilter(id || '');
                if (id) {
                    const vinculos = await carregarContasCobrador(id);
                    setVinculosContasPorCobrador((prev) => {
                        const next = new Map(prev);
                        next.set(id, vinculos);
                        return next;
                    });
                    await loadPendencias(id);
                }
            } catch (error) {
                if (!cancelled) {
                    showToast(
                        error instanceof Error ? error.message : 'Erro ao vincular cobrador',
                        'error',
                    );
                }
            } finally {
                if (!cancelled) setVinculoCobradorLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [modoCobrador, user?.id, user?.email, user?.nome, empresaIdsFiltro.join(',')]);

    useEffect(() => {
        if (modoCobrador) return;
        void loadPendencias();
    }, [empresaIdsFiltro.join(','), dataRevisionEmpresa, statusFilter, cobradorFilter, modoCobrador]);

    useEffect(() => {
        if (!modoCobrador || !meuCobradorId) return;
        void loadPendencias(meuCobradorId);
    }, [meuCobradorId, dataRevisionEmpresa, statusFilter, modoCobrador]);

    useEffect(() => {
        void loadContasBancarias();
    }, [loadContasBancarias]);

    useEffect(() => {
        const term = searchTerm.trim();
        if (term.length < 2 || empresaIdsFiltro.length === 0) {
            setClienteIdsBuscaContrato(new Set());
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            void buscarClienteIdsPorCodigoContrato(empresaIdsFiltro, term).then(({ clienteIds }) => {
                if (!cancelled) setClienteIdsBuscaContrato(new Set(clienteIds));
            });
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [searchTerm, empresaIdsFiltro.join(',')]);

    const parcelaMatchBusca = useCallback(
        (p: CobrancaPendente, term: string) => {
            if (!term) return true;
            const t = term.toLowerCase();
            if (p.cliente_nome.toLowerCase().includes(t)) return true;
            if (p.cliente_cpf.includes(term)) return true;
            if (p.cliente_bairro.toLowerCase().includes(t)) return true;
            if (contratoCodigoMatch(p.contrato_codigo, term)) return true;
            if (p.cliente_id && clienteIdsBuscaContrato.has(p.cliente_id)) return true;
            return false;
        },
        [clienteIdsBuscaContrato],
    );

    const clientesAgrupados = useMemo(() => {
        let baseItems = items;
        if (rotaAtiva) {
            const idsRota = new Set(rotaAtiva.paradas.map((p) => p.cliente_id).filter(Boolean));
            baseItems = items.filter((p) => p.cliente_id && idsRota.has(p.cliente_id));
        }

        const filtradas = baseItems.filter(p => {
            const matchSearch = parcelaMatchBusca(p, searchTerm);
            const matchStatus = !statusFilter || p.status === statusFilter;
            const matchCobrador = !cobradorFilter || p.cobrador_id === cobradorFilter;
            const matchPrioridade = !prioridadeFilter || p.prioridade === prioridadeFilter;
            const matchRota = !rotaFilter || p.cliente_bairro === rotaFilter;
            return matchSearch && matchStatus && matchCobrador && matchPrioridade && matchRota;
        });

        type ClienteAgrupadoBase = Omit<ClienteCobranca, 'resumo'>;
        const mapa = new Map<string, ClienteAgrupadoBase>();
        filtradas.forEach((parcela) => {
            const key = parcela.cliente_id || parcela.id;
            const atual = mapa.get(key);
            if (!atual) {
                mapa.set(key, {
                    cliente_id: key,
                    cliente_nome: parcela.cliente_nome,
                    cliente_cpf: parcela.cliente_cpf,
                    cliente_bairro: parcela.cliente_bairro,
                    cliente_endereco: parcela.cliente_endereco,
                    cliente_telefone: parcela.cliente_telefone,
                    cobrador_id: parcela.cobrador_id,
                    cobrador_nome: parcela.cobrador_nome,
                    parcelas: [parcela],
                    plano_nome: parcela.plano_nome,
                    valor_mensal_plano_centavos: parcela.valor_plano_centavos,
                    valor_pendente_centavos: 0,
                    qtd_pendentes: 0,
                    valor_total_centavos: parcela.valor_centavos,
                    maior_dias_atraso: parcela.dias_atraso,
                    ultima_data_vencimento: parcela.data_vencimento,
                });
                return;
            }
            atual.parcelas.push(parcela);
            if (parcela.valor_plano_centavos > 0 && !atual.valor_mensal_plano_centavos) {
                atual.valor_mensal_plano_centavos = parcela.valor_plano_centavos;
            }
            if (parcela.plano_nome && parcela.plano_nome !== '-' && atual.plano_nome === '-') {
                atual.plano_nome = parcela.plano_nome;
            }
            atual.valor_total_centavos += parcela.valor_centavos;
            atual.maior_dias_atraso = Math.max(atual.maior_dias_atraso, parcela.dias_atraso);
            if (parcela.data_vencimento < atual.ultima_data_vencimento) {
                atual.ultima_data_vencimento = parcela.data_vencimento;
            }
        });

        let lista = Array.from(mapa.values()).map((c) => {
            const parcelasOrdenadas = [...c.parcelas].sort((a, b) => {
                const na = a.parcela_numero || 0;
                const nb = b.parcela_numero || 0;
                if (na !== nb) return na - nb;
                return a.data_vencimento.localeCompare(b.data_vencimento);
            });
            const pendentes = parcelasOrdenadas.filter((p) => parcelaPendenteCobranca(p.status));
            const valorMensal = c.valor_mensal_plano_centavos || pendentes[0]?.valor_plano_centavos || 0;
            const valorPendente = valorMensal > 0
                ? pendentes.length * valorMensal
                : pendentes.reduce((acc, p) => acc + p.valor_centavos, 0);
            return {
                ...c,
                parcelas: parcelasOrdenadas,
                valor_mensal_plano_centavos: valorMensal,
                qtd_pendentes: pendentes.length,
                valor_pendente_centavos: valorPendente,
                resumo: resumirClienteCobranca(
                    parcelasOrdenadas.map((p) => ({
                        id: p.id,
                        status: p.status,
                        ultima_visita: p.ultima_visita,
                        observacao: p.observacao,
                        tentativas: p.tentativas,
                        dias_atraso: p.dias_atraso,
                    })),
                    ordemClientesRota.get(c.cliente_id),
                ),
            };
        });

        if (rotaAtiva) {
            if (filtroSituacaoRota === 'nao_cobrados') {
                lista = lista.filter((c) => c.resumo.situacao !== 'quitado');
            } else if (filtroSituacaoRota === 'sem_visita') {
                lista = lista.filter((c) => c.resumo.situacao === 'nunca_visitado');
            } else if (filtroSituacaoRota === 'visitados_sem_pagamento') {
                lista = lista.filter((c) => c.resumo.situacao === 'visitado_sem_pagamento');
            }
        }

        if (rotaAtiva && ordemClientesRota.size > 0) {
            lista.sort((a, b) => {
                const oa = ordemClientesRota.get(a.cliente_id) ?? 9999;
                const ob = ordemClientesRota.get(b.cliente_id) ?? 9999;
                if (oa !== ob) return oa - ob;
                return b.maior_dias_atraso - a.maior_dias_atraso;
            });
            return lista;
        }
        return lista.sort((a, b) => b.maior_dias_atraso - a.maior_dias_atraso);
    }, [
        items,
        searchTerm,
        statusFilter,
        cobradorFilter,
        prioridadeFilter,
        rotaFilter,
        rotaAtiva,
        ordemClientesRota,
        filtroSituacaoRota,
        parcelaMatchBusca,
    ]);

    const resumoRotaAtiva = useMemo(() => {
        if (!rotaAtiva) return null;
        const idsRota = new Set(rotaAtiva.paradas.map((p) => p.cliente_id).filter(Boolean));
        const naRota = items.filter((p) => p.cliente_id && idsRota.has(p.cliente_id));
        const mapa = new Map<string, CobrancaPendente[]>();
        naRota.forEach((p) => {
            const key = p.cliente_id!;
            const atual = mapa.get(key) || [];
            atual.push(p);
            mapa.set(key, atual);
        });
        const clientes = Array.from(mapa.entries()).map(([cliente_id, parcelas]) => ({
            cliente_id,
            resumo: resumirClienteCobranca(
                parcelas.map((par) => ({
                    id: par.id,
                    status: par.status,
                    ultima_visita: par.ultima_visita,
                    observacao: par.observacao,
                    tentativas: par.tentativas,
                    dias_atraso: par.dias_atraso,
                })),
                ordemClientesRota.get(cliente_id),
            ),
        }));
        return resumirRotaDia(clientes);
    }, [rotaAtiva, items, ordemClientesRota]);

    const stats = useMemo(() => {
        const pendentes = items.filter(p => !['cobrado'].includes(p.status));
        return {
            totalPendentes: pendentes.length,
            valorTotal: pendentes.reduce((acc, p) => acc + p.valor_centavos, 0),
            altaPrioridade: pendentes.filter(p => p.prioridade === 'alta').length,
            cobrados: items.filter(p => p.status === 'cobrado').length,
        };
    }, [items]);

    const clientesPorBairro = useMemo(() => {
        const mapa = new Map<string, ClienteCobranca[]>();
        clientesAgrupados.forEach((cliente) => {
            const bairro = cliente.cliente_bairro || 'Sem bairro';
            const atual = mapa.get(bairro) || [];
            atual.push(cliente);
            mapa.set(bairro, atual);
        });

        return Array.from(mapa.entries())
            .map(([bairro, clientes]) => {
                const totalParcelas = clientes.reduce((acc, c) => acc + c.parcelas.length, 0);
                const baixadas = clientes.reduce((acc, c) => acc + c.parcelas.filter((p) => p.status === 'cobrado').length, 0);
                const pendentes = totalParcelas - baixadas;
                return { bairro, clientes, totalParcelas, baixadas, pendentes };
            })
            .sort((a, b) => b.pendentes - a.pendentes || a.bairro.localeCompare(b.bairro));
    }, [clientesAgrupados]);

    const bairrosRotaRapida = useMemo(() => {
        let baseItems = items;
        if (rotaAtiva) {
            const idsRota = new Set(rotaAtiva.paradas.map((p) => p.cliente_id).filter(Boolean));
            baseItems = items.filter((p) => p.cliente_id && idsRota.has(p.cliente_id));
        }

        const filtradasSemBairro = baseItems.filter(p => {
            const matchSearch = parcelaMatchBusca(p, searchTerm);
            const matchStatus = !statusFilter || p.status === statusFilter;
            const matchCobrador = !cobradorFilter || p.cobrador_id === cobradorFilter;
            const matchPrioridade = !prioridadeFilter || p.prioridade === prioridadeFilter;
            return matchSearch && matchStatus && matchCobrador && matchPrioridade;
        });

        const mapa = new Map<string, number>();
        filtradasSemBairro.forEach((p) => {
            const b = p.cliente_bairro || 'Sem bairro';
            if (p.status !== 'cobrado') {
                mapa.set(b, (mapa.get(b) || 0) + 1);
            }
        });

        return Array.from(mapa.entries())
            .map(([bairro, count]) => ({ bairro, count }))
            .sort((a, b) => b.count - a.count || a.bairro.localeCompare(b.bairro));
    }, [items, searchTerm, statusFilter, cobradorFilter, prioridadeFilter, rotaAtiva, parcelaMatchBusca]);

    const clientesPorBairroFiltrados = useMemo(() => {
        if (bairroSituacaoFilter === 'pendentes') {
            return clientesPorBairro.filter((grupo) => grupo.pendentes > 0);
        }
        if (bairroSituacaoFilter === 'baixadas') {
            return clientesPorBairro.filter((grupo) => grupo.totalParcelas > 0 && grupo.pendentes === 0);
        }
        return clientesPorBairro;
    }, [clientesPorBairro, bairroSituacaoFilter]);

    const filtrosOcultamClientes = useMemo(() => {
        if (items.length === 0 || clientesAgrupados.length > 0) return null;
        if (rotaAtiva) {
            return 'rota' as const;
        }
        if (statusFilter || cobradorFilter || prioridadeFilter || rotaFilter || searchTerm) {
            return 'filtros' as const;
        }
        if (filtroSituacaoRota !== 'todos' && rotaAtiva) {
            return 'situacao_rota' as const;
        }
        return 'desconhecido' as const;
    }, [
        items.length,
        clientesAgrupados.length,
        rotaAtiva,
        statusFilter,
        cobradorFilter,
        prioridadeFilter,
        rotaFilter,
        searchTerm,
        filtroSituacaoRota,
    ]);

    const limparFiltrosGestor = () => {
        setSearchTerm('');
        setStatusFilter('');
        setCobradorFilter('');
        setPrioridadeFilter('');
        setRotaFilter('');
        setBairroSituacaoFilter('todos');
        setFiltroSituacaoRota('todos');
        setRotaAtivaId('');
        setSearchParams({});
    };

    const valorUnitarioParcela = (cliente: ClienteCobranca, parcela?: CobrancaPendente) =>
        cliente.valor_mensal_plano_centavos || parcela?.valor_plano_centavos || parcela?.valor_centavos || 0;

    const idsSelecionadosCliente = (clienteId: string) => parcelasSelecionadas[clienteId] || [];

    const parcelasPendentesCliente = (cliente: ClienteCobranca) =>
        cliente.parcelas.filter((p) => parcelaPendenteCobranca(p.status));

    const parcelasMarcadasCliente = (cliente: ClienteCobranca) => {
        const ids = new Set(idsSelecionadosCliente(cliente.cliente_id));
        return parcelasPendentesCliente(cliente).filter((p) => ids.has(p.id));
    };

    const totalSelecionadoCentavos = (cliente: ClienteCobranca) => {
        const marcadas = parcelasMarcadasCliente(cliente);
        const unit = valorUnitarioParcela(cliente, marcadas[0]);
        return marcadas.length * (unit > 0 ? unit : 0);
    };

    /** Mesma regra da baixa de parcelas no financeiro: sem pular vencimentos anteriores. */
    const validarSelecaoSequencialParcelas = (
        cliente: ClienteCobranca,
        ids: string[],
    ): string | null => {
        if (ids.length === 0) return 'Selecione ao menos uma parcela para receber.';
        const pendentes = parcelasPendentesCliente(cliente);
        const indices = pendentes
            .map((p, i) => (ids.includes(p.id) ? i : -1))
            .filter((i) => i >= 0);
        if (indices.length === 0) return null;
        const min = Math.min(...indices);
        const max = Math.max(...indices);
        if (min !== 0) {
            const ref = pendentes[0].mes_referencia || mesReferenciaCurto(pendentes[0].data_vencimento);
            return `Comece pela parcela mais antiga (${ref}).`;
        }
        if (max - min + 1 !== indices.length) {
            return 'Não é permitido pular parcelas em aberto. Selecione em ordem de vencimento.';
        }
        return null;
    };

    const alternarParcelaSelecionada = (cliente: ClienteCobranca, parcelaId: string) => {
        const pendentes = parcelasPendentesCliente(cliente);
        const targetIndex = pendentes.findIndex((p) => p.id === parcelaId);
        if (targetIndex === -1) return;

        const clienteId = cliente.cliente_id;
        const atual = new Set(idsSelecionadosCliente(clienteId));
        const isSelecting = !atual.has(parcelaId);

        if (isSelecting) {
            for (let i = 0; i < targetIndex; i++) {
                if (!atual.has(pendentes[i].id)) {
                    const ref =
                        pendentes[i].mes_referencia ||
                        mesReferenciaCurto(pendentes[i].data_vencimento);
                    const venc = new Date(pendentes[i].data_vencimento + 'T12:00:00').toLocaleDateString(
                        'pt-BR',
                    );
                    showToast(
                        `Não é permitido pular parcelas. Pague primeiro ${ref} (venc. ${venc}).`,
                        'warning',
                    );
                    return;
                }
            }
            atual.add(parcelaId);
        } else {
            atual.delete(parcelaId);
            for (let i = targetIndex + 1; i < pendentes.length; i++) {
                atual.delete(pendentes[i].id);
            }
        }

        setParcelasSelecionadas((prev) => ({
            ...prev,
            [clienteId]: [...atual],
        }));
    };

    const abrirModalParcelasCliente = (cliente: ClienteCobranca) => {
        setParcelasClienteModal(cliente);
    };

    const abrirBaixaModal = (cliente: ClienteCobranca) => {
        abrirAtendimentoModal(cliente, 'receber');
    };

    const abrirVisitaModal = (parcela: CobrancaPendente) => {
        const cliente = clientesAgrupados.find((c) => c.cliente_id === parcela.cliente_id);
        if (cliente) {
            abrirAtendimentoModal(cliente, 'visita');
        } else {
            showToast('Cliente não encontrado para registrar visita.', 'error');
        }
    };

    const selecionarTodasPendentes = (cliente: ClienteCobranca) => {
        setParcelasSelecionadas((prev) => ({
            ...prev,
            [cliente.cliente_id]: parcelasPendentesCliente(cliente).map((p) => p.id),
        }));
    };

    const limparSelecaoCliente = (clienteId: string) => {
        setParcelasSelecionadas((prev) => {
            const next = { ...prev };
            delete next[clienteId];
            return next;
        });
    };

    const abrirAtendimentoModal = async (cliente: ClienteCobranca, abaInicial: 'receber' | 'visita' = 'receber') => {
        const marcadas = parcelasMarcadasCliente(cliente);
        if (marcadas.length === 0) {
            const pendentes = parcelasPendentesCliente(cliente);
            if (pendentes.length > 0) {
                setParcelasSelecionadas((prev) => ({
                    ...prev,
                    [cliente.cliente_id]: [pendentes[0].id],
                }));
            }
        }

        let cobradorIdBaixa = resolverCobradorIdBaixaCampo(
            modoCobrador,
            meuCobradorId,
            cliente.cobrador_id,
        );
        if (modoCobrador && !cobradorIdBaixa && user) {
            cobradorIdBaixa =
                (await resolverCobradorIdDoUsuario({
                    empresaIds: empresaIdsFiltro,
                    usuarioId: user.id,
                    email: user.email,
                    nome: user.nome,
                })) || '';
            if (cobradorIdBaixa) {
                setMeuCobradorId(cobradorIdBaixa);
            }
        }
        let vinculos: CobradorContaVinculo[] = [];
        if (cobradorIdBaixa) {
            vinculos =
                vinculosContasPorCobrador.get(cobradorIdBaixa) ||
                (await carregarContasCobrador(cobradorIdBaixa));
            setVinculosContasPorCobrador((prev) => {
                const next = new Map(prev);
                next.set(cobradorIdBaixa, vinculos);
                return next;
            });
        }
        const contasFiltradas = await resolverContasDestinoBaixaCobrador(
            contasBancarias,
            vinculos,
            { apenasVinculo: modoCobrador },
        );
        const contaPadrao = resolverContaPadraoDestinoCobrador(contasFiltradas, vinculos);

        const modoReciboPadrao: ModoReciboBaixaCobrador = isNavegadorMobile() ? 'pdf' : 'termica';

        setAtendimentoModal({
            cliente,
            aba: abaInicial,
            forma_pagamento: 'dinheiro',
            conta_bancaria_id: contaPadrao?.id || contasFiltradas[0]?.id || '',
            contas_destino: contasFiltradas,
            data_pagamento: dataHojeIsoLocal(),
            observacao: '',
            modo_recibo: modoReciboPadrao,
            pix_mesmo_pagador: true,
            pix_nome_pagador: '',
            saving: false,
            cliente_estava: 'nao',
            visita_motivo: 'nao_estava',
            visita_justificativa: '',
            visita_saving: false,
        });
    };

    const processarBaixa = async () => {
        if (!empresaId || !atendimentoModal) return;
        if (atendimentoModal.forma_pagamento === 'pix') {
            const erroPix = validarPixPagador(true, {
                pixMesmoPagador: atendimentoModal.pix_mesmo_pagador,
                pixNomePagador: atendimentoModal.pix_nome_pagador,
            });
            if (erroPix) {
                showToast(erroPix, 'warning');
                return;
            }
        }
        const { cliente } = atendimentoModal;
        const parcelasBaixa = parcelasMarcadasCliente(cliente);
        if (!cliente.cliente_id) {
            showToast('Cliente inválido.', 'error');
            return;
        }
        if (parcelasBaixa.length === 0) {
            showToast('Nenhuma parcela selecionada.', 'error');
            return;
        }

        const erroSelecao = validarSelecaoSequencialParcelas(
            cliente,
            parcelasBaixa.map((p) => p.id),
        );
        if (erroSelecao) {
            showToast(erroSelecao, 'error');
            return;
        }

        const querPdf =
            atendimentoModal.modo_recibo === 'pdf' || isNavegadorMobile();
        const janelaPdf = querPdf
            ? reservarJanelaImpressaoPdf('Gerando recibo PDF…')
            : null;
        if (querPdf && !janelaPdf) {
            showToast('Permita pop-ups para abrir o recibo em PDF.', 'warning');
            return;
        }
        const fecharJanelaPdf = () => {
            if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
        };

        const valorUnit = valorUnitarioParcela(cliente, parcelasBaixa[0]);
        if (valorUnit <= 0) {
            fecharJanelaPdf();
            showToast('Valor do plano não encontrado. Verifique o contrato do cliente.', 'error');
            return;
        }

        setAtendimentoModal((prev) => (prev ? { ...prev, saving: true } : prev));
        try {
            const formaNorm = atendimentoModal.forma_pagamento;
            const valorCentavosParcela = valorUnit;
            const totalCentavos = valorCentavosParcela * parcelasBaixa.length;

            if (parcelasBaixa[0].cobrador_id === 'sem-cobrador') {
                throw new Error('Atribua um cobrador na Carteira antes de baixar esta parcela.');
            }

            const contaSelecionada =
                atendimentoModal.contas_destino.find(
                    (c) => c.id === atendimentoModal.conta_bancaria_id,
                ) || contasBancarias.find((c) => c.id === atendimentoModal.conta_bancaria_id);
            const contaAutorizadaVinculo =
                modoCobrador &&
                atendimentoModal.contas_destino.some(
                    (c) => c.id === atendimentoModal.conta_bancaria_id,
                );
            const verTodosCaixas = usuarioPodeVerTodosCaixas(user?.role, user?.permissoes as Record<string, unknown>);
            if (
                contaSelecionada &&
                !contaAutorizadaVinculo &&
                !usuarioPodeOperarConta(contaSelecionada, user?.id, verTodosCaixas)
            ) {
                fecharJanelaPdf();
                showToast(
                    `Você não pode receber no caixa "${contaSelecionada.nome}". Vincule o caixa do cobrador em Cobradores → editar.`,
                    'warning',
                );
                setAtendimentoModal((prev) => (prev ? { ...prev, saving: false } : prev));
                return;
            }
            if (!atendimentoModal.conta_bancaria_id) {
                fecharJanelaPdf();
                showToast('Selecione o caixa de destino do cobrador.', 'warning');
                setAtendimentoModal((prev) => (prev ? { ...prev, saving: false } : prev));
                return;
            }
            const dataPagamento = modoCobrador
                ? dataHojeIsoLocal()
                : (atendimentoModal.data_pagamento || '').slice(0, 10);
            if (!dataPagamento) {
                fecharJanelaPdf();
                showToast('Informe a data da baixa.', 'warning');
                setAtendimentoModal((prev) => (prev ? { ...prev, saving: false } : prev));
                return;
            }
            const formaPagamentoIdCache = new Map<string, string | undefined>();

            if (contaSelecionada) {
                const exigeCaixa = ['caixa', 'corrente'].includes(
                    (contaSelecionada.tipo || '').toLowerCase(),
                );
                if (exigeCaixa) {
                    const caixaPrep = await ensureContasDestinoBaixa({
                        contas: [
                            {
                                id: contaSelecionada.id,
                                nome: contaSelecionada.nome,
                                tipo: contaSelecionada.tipo,
                            },
                        ],
                        dataPagamento,
                        usuarioId: user?.id,
                        observacaoPrefixo: `Sessão retroativa — cobrança em campo (${cliente.cliente_nome})`,
                    });
                    if (caixaPrep.ok === false) {
                        throw new Error(caixaPrep.errorMsg);
                    }
                }
            }

            for (const parcela of parcelasBaixa) {
                const empresaParcela = parcela.empresa_id || empresaId;

                if (!parcela.cliente_id) {
                    throw new Error('Parcela sem cliente vinculado.');
                }

                const tituloRes = await resolverContaReceberIdBaixaCampo({
                    empresa_id: empresaParcela,
                    cliente_id: parcela.cliente_id,
                    conta_receber_id: parcela.conta_receber_id,
                    data_vencimento: parcela.data_vencimento,
                    valor_centavos: valorCentavosParcela,
                });
                if (tituloRes.ok === false) {
                    if (tituloRes.motivo === 'ja_pago') {
                        await marcarPendenciaCobradaPorTituloPago(
                            empresaParcela,
                            parcela.id,
                            parcela.conta_receber_id,
                        );
                        await loadPendencias();
                        throw new Error(
                            `A parcela ${tituloRes.parcela_codigo || parcela.parcela_codigo} já está paga no financeiro. A lista foi atualizada — não baixe de novo.`,
                        );
                    }
                    throw new Error(
                        `Não há parcela em aberto para ${parcela.mes_referencia || parcela.parcela_codigo || 'este cliente'}. Verifique se as mensalidades do contrato foram geradas.`,
                    );
                }
                const tituloId = tituloRes.conta_receber_id;

                let formaPagamentoId = formaPagamentoIdCache.get(empresaParcela);
                if (formaPagamentoId === undefined) {
                    formaPagamentoId = await resolverFormaPagamentoId(empresaParcela, formaNorm);
                    formaPagamentoIdCache.set(empresaParcela, formaPagamentoId);
                }
                const pixBaixa =
                    formaNorm === 'pix'
                        ? pixPagadorParaBaixa(true, {
                              pixMesmoPagador: atendimentoModal.pix_mesmo_pagador,
                              pixNomePagador: atendimentoModal.pix_nome_pagador,
                          })
                        : {};
                const baixaId = await baixarContaReceber({
                    conta_receber_id: tituloId,
                    valor_pago_centavos: valorCentavosParcela,
                    forma_pagamento_id: formaPagamentoId,
                    conta_bancaria_id: atendimentoModal.conta_bancaria_id || undefined,
                    observacoes:
                        atendimentoModal.observacao?.trim() ||
                        `Recebimento em rota — ${parcela.mes_referencia || mesReferenciaCurto(parcela.data_vencimento)}`,
                    data_pagamento: dataPagamento,
                    ...pixBaixa,
                });
                if (!baixaId) {
                    throw new Error(
                        finError ||
                            `Não foi possível baixar ${parcela.parcela_codigo || tituloId}.`,
                    );
                }

                await registrarRecebimentoCampo({
                    empresa_id: empresaParcela,
                    cobranca_pendente_id: parcela.id,
                    conta_receber_id: tituloId,
                    data_vencimento: parcela.data_vencimento,
                    cliente_id: parcela.cliente_id,
                    cobrador_id: parcela.cobrador_id,
                    valor_centavos: valorCentavosParcela,
                    forma_pagamento: formaNorm,
                    data_pagamento: dataPagamento,
                    observacao: atendimentoModal.observacao,
                    created_by: user?.id || null,
                    titulo_ja_baixado_no_financeiro: true,
                    pix_mesmo_pagador: formaNorm === 'pix' ? atendimentoModal.pix_mesmo_pagador : undefined,
                    pix_nome_pagador:
                        formaNorm === 'pix' && !atendimentoModal.pix_mesmo_pagador
                            ? atendimentoModal.pix_nome_pagador.trim()
                            : undefined,
                });

                if (contaSelecionada && formaNorm === 'pix' && valorCentavosParcela > 0) {
                    const fitid = `PIX-COB-${parcela.id}-${Date.now()}`;
                    await supabase.from('fin_extratos_bancarios').insert({
                        empresa_id: contaSelecionada.empresa_id,
                        conta_bancaria_id: contaSelecionada.id,
                        data_lancamento: dataPagamento,
                        data_balancete: dataPagamento,
                        tipo: 'credito',
                        valor_centavos: valorCentavosParcela,
                        descricao: `PIX cobrança em rota - ${parcela.cliente_nome}${
                            !atendimentoModal.pix_mesmo_pagador && atendimentoModal.pix_nome_pagador.trim()
                                ? ` — Pagador: ${atendimentoModal.pix_nome_pagador.trim()}`
                                : ''
                        }`,
                        memo: parcela.mes_referencia || '',
                        numero_referencia: parcela.parcela_codigo || parcela.id,
                        fitid,
                        conciliado: false,
                    });
                }
            }

            window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
            window.dispatchEvent(new CustomEvent('fin-contas-receber-updated'));

            try {
                const modoImpressao: ModoReciboBaixaCobrador =
                    atendimentoModal.modo_recibo === 'termica' && isNavegadorMobile()
                        ? 'pdf'
                        : atendimentoModal.modo_recibo;
                const modo = await imprimirReciboBaixaCobrador({
                    janelaPdf: janelaPdf ?? undefined,
                    modo: modoImpressao,
                    clienteId: cliente.cliente_id,
                    clienteNome: cliente.cliente_nome,
                    parcelas: parcelasBaixa.map((p) => ({
                        parcela_numero: p.parcela_numero || 1,
                        data_vencimento: p.data_vencimento,
                        valorCentavos: valorCentavosParcela,
                        descricao: p.plano_nome || 'MENSALIDADE',
                        total_parcelas: p.total_parcelas,
                        codigo: p.parcela_codigo,
                    })),
                    totalCentavos,
                    formaPagamento: labelFormaPagamentoRecibo(formaNorm),
                    nomeCobrador: cliente.cobrador_nome || user?.nome || undefined,
                    atendente: cliente.cobrador_nome || user?.nome,
                    planoNome: cliente.plano_nome,
                    parcelaCodigo: parcelasBaixa.map((p) => p.parcela_codigo).join(', '),
                    dataVencimento: parcelasBaixa[0]?.data_vencimento,
                });
                const qtd = parcelasBaixa.length;
                const msgRecibo =
                    modo === 'bluetooth'
                        ? `${qtd} parcela(s) baixada(s). Recibo enviado à maquininha.`
                        : modo === 'pdf'
                          ? `${qtd} parcela(s) baixada(s). Recibo PDF aberto.`
                          : `${qtd} parcela(s) baixada(s). Recibo aberto para impressão.`;
                showToast(msgRecibo, 'success');
            } catch (printErr) {
                fecharJanelaPdf();
                showToast(
                    printErr instanceof Error
                        ? printErr.message
                        : 'Baixa ok, mas falhou a impressão do recibo.',
                    'warning',
                );
            }

            await sincronizarParadaRotaAtiva(
                cliente.cliente_id,
                parcelasBaixa[parcelasBaixa.length - 1].id,
                'pago',
                atendimentoModal.observacao?.trim() || `${parcelasBaixa.length} parcela(s) baixada(s) em campo`,
            );

            limparSelecaoCliente(cliente.cliente_id);
            setAtendimentoModal(null);
            await loadPendencias();
        } catch (error) {
            fecharJanelaPdf();
            showToast(error instanceof Error ? error.message : 'Erro ao baixar parcela', 'error');
            setAtendimentoModal((prev) => (prev ? { ...prev, saving: false } : prev));
        }
    };

    const processarVisita = async () => {
        if (!empresaId || !atendimentoModal) return;
        const { cliente } = atendimentoModal;
        const pendentes = parcelasPendentesCliente(cliente);
        if (pendentes.length === 0) {
            showToast('Nenhuma parcela pendente neste cliente.', 'error');
            return;
        }
        const referenceParcela = pendentes[0];
        const justificativa = atendimentoModal.visita_justificativa.trim();
        if (!justificativa && atendimentoModal.visita_motivo === 'outro') {
            showToast('Descreva o motivo em "Detalhes da visita".', 'error');
            return;
        }

        setAtendimentoModal((prev) => (prev ? { ...prev, visita_saving: true } : prev));
        try {
            const motivo = atendimentoModal.visita_motivo as MotivoVisitaCodigo;
            const observacao = montarObservacaoVisita(
                motivo,
                justificativa,
                atendimentoModal.cliente_estava,
            );

            const novoStatus: StatusCobranca =
                atendimentoModal.visita_motivo === 'nao_estava' || atendimentoModal.visita_motivo === 'endereco_fechado'
                    ? 'nao_localizado'
                    : atendimentoModal.visita_motivo === 'recusou' || atendimentoModal.visita_motivo === 'nao_pagou'
                    ? 'recusou'
                    : atendimentoModal.visita_motivo === 'promessa' || atendimentoModal.visita_motivo === 'sem_dinheiro'
                    ? 'promessa'
                    : atendimentoModal.cliente_estava === 'nao'
                    ? 'nao_localizado'
                    : 'em_andamento';

            const empresaParcela = referenceParcela.empresa_id || empresaId;
            await registrarVisitaCobranca({
                empresa_id: empresaParcela,
                cobranca_pendente_id: referenceParcela.id,
                novo_status: novoStatus,
                observacao,
                tentativas_atual: referenceParcela.tentativas || 0,
                motivo_codigo: motivo,
            });

            const statusParada: StatusParadaRota =
                novoStatus === 'nao_localizado' ? 'ausente' : 'visitado';
            await sincronizarParadaRotaAtiva(
                cliente.cliente_id,
                referenceParcela.id,
                statusParada,
                observacao,
            );

            setItems((prev) =>
                prev.map((item) =>
                    item.id === referenceParcela.id
                        ? {
                              ...item,
                              status: novoStatus,
                              tentativas: (item.tentativas || 0) + 1,
                              ultima_visita: new Date().toISOString(),
                              observacao,
                          }
                        : item
                )
            );

            showToast('Visita registrada com sucesso.', 'success');
            setAtendimentoModal(null);
            await loadPendencias();
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Erro ao registrar visita', 'error');
            setAtendimentoModal((prev) => (prev ? { ...prev, visita_saving: false } : prev));
        }
    };

    const aplicarRotaAtiva = (rotaId: string) => {
        setRotaAtivaId(rotaId);
        if (rotaId) {
            setSearchParams({ rota: rotaId });
        } else {
            setSearchParams({});
        }
    };

    const renderParcelasClienteModal = () => {
        if (!parcelasClienteModal) return null;
        const cliente = parcelasClienteModal;
        const pendentes = parcelasPendentesCliente(cliente);
        const marcadas = parcelasMarcadasCliente(cliente);
        const unit = valorUnitarioParcela(cliente);
        return (
            <div
                className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
                onClick={() => setParcelasClienteModal(null)}
            >
                <div
                    className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3 p-4 border-b shrink-0">
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 text-lg leading-tight">
                                {cliente.cliente_nome}
                            </h3>
                            {cliente.plano_nome && (
                                <p className="text-xs text-indigo-800 mt-0.5">{cliente.plano_nome}</p>
                            )}
                            {cliente.cliente_telefone && (
                                <a
                                    href={`tel:${cliente.cliente_telefone.replace(/\D/g, '')}`}
                                    className="inline-flex items-center gap-1 text-sm text-indigo-700 font-medium mt-1"
                                >
                                    <Phone className="h-3.5 w-3.5" />
                                    {cliente.cliente_telefone}
                                </a>
                            )}
                            {cliente.cliente_endereco && (
                                <p className="text-xs text-gray-600 mt-1 flex gap-1">
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                    {cliente.cliente_endereco}
                                </p>
                            )}
                        </div>
                        <button type="button" onClick={() => setParcelasClienteModal(null)} className="p-1">
                            <X className="h-5 w-5 text-gray-500" />
                        </button>
                    </div>

                    <div className="px-4 py-3 bg-indigo-50 border-b shrink-0 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-indigo-600">Total pendente</p>
                            <p className="text-xl font-black text-indigo-950">
                                {formatCurrency(cliente.valor_pendente_centavos)}
                            </p>
                            <p className="text-[11px] text-indigo-700">
                                {pendentes.length} parcela(s) em aberto
                            </p>
                        </div>
                        {pendentes.length > 0 && (
                            <div className="flex flex-col gap-1 text-right">
                                <button
                                    type="button"
                                    className="text-xs text-indigo-800 font-semibold underline"
                                    onClick={() => selecionarTodasPendentes(cliente)}
                                >
                                    Todas
                                </button>
                                {idsSelecionadosCliente(cliente.cliente_id).length > 0 && (
                                    <button
                                        type="button"
                                        className="text-xs text-gray-500 underline"
                                        onClick={() => limparSelecaoCliente(cliente.cliente_id)}
                                    >
                                        Limpar
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="p-4 overflow-y-auto flex-1 space-y-2">
                        {pendentes.length === 0 ? (
                            <p className="text-sm text-green-700 font-medium flex items-center gap-2 py-4">
                                <CheckCircle2 className="h-5 w-5" />
                                Nenhuma parcela pendente neste cliente.
                            </p>
                        ) : (
                            <>
                                <p className="text-[11px] text-gray-500 mb-2">
                                    Selecione em ordem de vencimento (não pule parcelas).
                                </p>
                                {pendentes.map((parcela) => {
                                    const marcada = idsSelecionadosCliente(cliente.cliente_id).includes(parcela.id);
                                    const valorParc = valorUnitarioParcela(cliente, parcela);
                                    const numLabel = rotuloParcelaCobranca(parcela, pendentes);
                                    const vencFmt = formatarDataIsoPtBr(parcela.data_vencimento);
                                    const refMes =
                                        parcela.mes_referencia || mesReferenciaCurto(parcela.data_vencimento);
                                    return (
                                        <label
                                            key={parcela.id}
                                            className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                                                marcada
                                                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                                                    : 'border-gray-200 bg-white hover:border-indigo-200'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-1 h-5 w-5 rounded border-gray-300 text-indigo-600 shrink-0"
                                                checked={marcada}
                                                onChange={() => alternarParcelaSelecionada(cliente, parcela.id)}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <span className="font-bold text-gray-900">
                                                        Parc. {numLabel}
                                                    </span>
                                                    <span className="font-bold text-gray-900 shrink-0">
                                                        {formatCurrency(valorParc)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600 mt-0.5">
                                                    Venc. {vencFmt} · Ref. {refMes}
                                                    {parcela.dias_atraso > 0 ? (
                                                        <span className="text-red-600 font-semibold">
                                                            {' '}
                                                            · {parcela.dias_atraso}d atraso
                                                        </span>
                                                    ) : null}
                                                </p>
                                                <button
                                                    type="button"
                                                    className="text-[11px] text-gray-550 underline mt-1.5"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        abrirVisitaModal(parcela);
                                                    }}
                                                >
                                                    Registrar visita sem pagamento
                                                </button>
                                            </div>
                                        </label>
                                    );
                                })}
                            </>
                        )}
                    </div>

                    <div className="p-4 border-t bg-gray-50 shrink-0 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-500">Total selecionado</p>
                                <p className="text-2xl font-black text-indigo-900">
                                    {formatCurrency(totalSelecionadoCentavos(cliente))}
                                </p>
                            </div>
                            {marcadas.length > 0 && unit > 0 && (
                                <p className="text-xs text-gray-500 text-right">
                                    {marcadas.length} × {formatCurrency(unit)}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="flex-1 min-h-12"
                                onClick={() => setParcelasClienteModal(null)}
                            >
                                Fechar
                            </Button>
                            <Button
                                className="flex-1 min-h-12"
                                disabled={marcadas.length === 0}
                                onClick={() => void abrirBaixaModal(cliente)}
                            >
                                <DollarSign className="h-4 w-4 mr-1 shrink-0" />
                                Receber ({marcadas.length || 0})
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderAtendimentoModal = () => {
        if (!atendimentoModal) return null;
        const { cliente, aba, contas_destino: contasDestinoBaixa } = atendimentoModal;
        const parcelasBaixa = parcelasMarcadasCliente(cliente);
        const unit = valorUnitarioParcela(cliente, parcelasBaixa[0] || parcelasPendentesCliente(cliente)[0]);
        const totalModal = unit * parcelasBaixa.length;
        return (
            <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[95vh] flex flex-col overflow-hidden transition-all transform scale-100">
                    {/* Header */}
                    <div className="p-4 border-b dark:border-slate-800 shrink-0 bg-gray-50/50 dark:bg-slate-900/50">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-slate-100">Atendimento ao Cliente</h3>
                            <button 
                                type="button" 
                                onClick={() => setAtendimentoModal(null)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-150 dark:hover:bg-slate-800 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="mt-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{cliente.cliente_nome}</p>
                            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                                Contrato: {cliente.parcelas[0]?.contrato_codigo || '-'} · Plano: {cliente.plano_nome}
                            </p>
                        </div>

                        {/* Tabs Switcher */}
                        <div className="mt-3 flex rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5">
                            <button
                                type="button"
                                onClick={() => setAtendimentoModal(prev => prev ? { ...prev, aba: 'receber' } : null)}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                                    aba === 'receber'
                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
                                }`}
                            >
                                Receber Pagamento
                            </button>
                            <button
                                type="button"
                                onClick={() => setAtendimentoModal(prev => prev ? { ...prev, aba: 'visita' } : null)}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                                    aba === 'visita'
                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-700'
                                }`}
                            >
                                Registrar Visita
                            </button>
                        </div>
                    </div>

                    {aba === 'receber' ? (
                        <>
                            <div className="p-4 space-y-3 overflow-y-auto flex-1">
                                {parcelasBaixa.length === 0 ? (
                                    <p className="text-sm text-amber-600 dark:text-amber-400 text-center py-4">
                                        Nenhuma parcela selecionada. Por favor, marque as parcelas na lista antes de receber.
                                    </p>
                                ) : (
                                    <>
                                        <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 p-3 space-y-2 max-h-40 overflow-y-auto">
                                            <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Parcelas selecionadas</p>
                                            {parcelasBaixa.map((p) => (
                                                <div key={p.id} className="text-sm text-gray-800 dark:text-slate-300 flex justify-between gap-2">
                                                    <span>
                                                        Parc. {rotuloParcelaCobranca(p, parcelasBaixa)} —{' '}
                                                        <strong>{p.mes_referencia}</strong>
                                                    </span>
                                                    <span className="font-semibold shrink-0">{formatCurrency(unit)}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100/50 dark:border-indigo-900/40 p-3">
                                            <p className="text-xs text-indigo-700 dark:text-indigo-300">Total a receber</p>
                                            <p className="text-2xl font-black text-indigo-900 dark:text-indigo-100">{formatCurrency(totalModal)}</p>
                                            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                                                {parcelasBaixa.length} parcela(s) × {formatCurrency(unit)}
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Data do recebimento</label>
                                            {modoCobrador ? (
                                                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 py-2 px-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                                                    Hoje — {formatarDataIsoPtBr(dataHojeIsoLocal())}
                                                </p>
                                            ) : (
                                                <Input
                                                    type="date"
                                                    value={atendimentoModal.data_pagamento}
                                                    max={dataHojeIsoLocal()}
                                                    onChange={(e) =>
                                                        setAtendimentoModal((prev) =>
                                                            prev ? { ...prev, data_pagamento: e.target.value } : prev,
                                                        )
                                                    }
                                                />
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Caixa de destino</label>
                                            {modoCobrador && contasDestinoBaixa.length === 0 ? (
                                                <p className="text-sm text-amber-600 dark:text-amber-400 py-2">
                                                    Nenhum caixa vinculado ao seu cadastro. Peça ao administrador para configurar.
                                                </p>
                                            ) : contasDestinoBaixa.length === 1 ? (
                                                <p className="text-sm font-medium text-gray-900 dark:text-slate-100 py-2 px-3 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                                                    {contasDestinoBaixa[0].codigo} — {contasDestinoBaixa[0].nome} ({contasDestinoBaixa[0].tipo})
                                                </p>
                                            ) : (
                                                <Select
                                                    value={atendimentoModal.conta_bancaria_id}
                                                    onChange={(e) =>
                                                        setAtendimentoModal((prev) =>
                                                            prev ? { ...prev, conta_bancaria_id: e.target.value } : prev
                                                        )
                                                    }
                                                >
                                                    <option value="">Selecione o caixa</option>
                                                    {contasDestinoBaixa.map((conta) => (
                                                        <option key={conta.id} value={conta.id}>
                                                            {conta.codigo} — {conta.nome} ({conta.tipo})
                                                        </option>
                                                    ))}
                                                </Select>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Método de pagamento</label>
                                            <Select
                                                value={atendimentoModal.forma_pagamento}
                                                onChange={(e) =>
                                                    setAtendimentoModal((prev) =>
                                                        prev
                                                            ? {
                                                                  ...prev,
                                                                  forma_pagamento: e.target
                                                                      .value as FormaPagamentoCobradorCampo,
                                                              }
                                                            : prev
                                                    )
                                                }
                                            >
                                                <option value="dinheiro">Dinheiro</option>
                                                <option value="pix">PIX</option>
                                                <optgroup label="Cartão (maquininha)">
                                                    <option value="cartao_credito">Cartão de crédito</option>
                                                    <option value="cartao_debito">Cartão de débito</option>
                                                </optgroup>
                                            </Select>
                                        </div>

                                        {atendimentoModal.forma_pagamento === 'pix' && (
                                            <PixPagadorConfirmacao
                                                visivel
                                                titularNome={cliente.cliente_nome}
                                                state={{
                                                    pixMesmoPagador: atendimentoModal.pix_mesmo_pagador,
                                                    pixNomePagador: atendimentoModal.pix_nome_pagador,
                                                }}
                                                onChange={(next) =>
                                                    setAtendimentoModal((prev) =>
                                                        prev
                                                            ? {
                                                                  ...prev,
                                                                  pix_mesmo_pagador: next.pixMesmoPagador,
                                                                  pix_nome_pagador: next.pixNomePagador,
                                                              }
                                                            : prev,
                                                    )
                                                }
                                                idPrefix="cob-baixa-pix"
                                            />
                                        )}

                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 dark:text-slate-550 uppercase tracking-wider mb-1">Observação</label>
                                            <textarea
                                                value={atendimentoModal.observacao}
                                                onChange={(e) =>
                                                    setAtendimentoModal((prev) =>
                                                        prev ? { ...prev, observacao: e.target.value } : prev
                                                    )
                                                }
                                                className="w-full rounded-xl border border-gray-200 dark:border-slate-800 dark:bg-slate-800 p-3 text-sm dark:text-slate-100"
                                                rows={2}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 dark:text-slate-550 uppercase tracking-wider mb-2">
                                                Recibo após a baixa
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setAtendimentoModal((prev) =>
                                                            prev ? { ...prev, modo_recibo: 'termica' } : prev,
                                                        )
                                                    }
                                                    className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                                                        atendimentoModal.modo_recibo === 'termica'
                                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 ring-1 ring-indigo-200 dark:ring-indigo-900/55'
                                                            : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                                                    }`}
                                                >
                                                    <Bluetooth
                                                        className={`h-5 w-5 mb-1 ${
                                                            atendimentoModal.modo_recibo === 'termica'
                                                                ? 'text-indigo-600 dark:text-indigo-400'
                                                                : 'text-gray-550'
                                                        }`}
                                                    />
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Maquininha</p>
                                                    <p className="text-[11px] text-gray-550 mt-0.5">
                                                        Térmica 58 mm (celular)
                                                    </p>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setAtendimentoModal((prev) =>
                                                            prev ? { ...prev, modo_recibo: 'pdf' } : prev,
                                                        )
                                                    }
                                                    className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                                                        atendimentoModal.modo_recibo === 'pdf'
                                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 ring-1 ring-indigo-200 dark:ring-indigo-900/55'
                                                            : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                                                    }`}
                                                >
                                                    <FileText
                                                        className={`h-5 w-5 mb-1 ${
                                                            atendimentoModal.modo_recibo === 'pdf'
                                                                ? 'text-indigo-600 dark:text-indigo-400'
                                                                : 'text-gray-550'
                                                        }`}
                                                    />
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Recibo PDF</p>
                                                    <p className="text-[11px] text-gray-550 mt-0.5">
                                                        Abre em nova aba
                                                    </p>
                                                </button>
                                            </div>
                                            {atendimentoModal.modo_recibo === 'termica' &&
                                                !loadReciboTermicoConfigCobrador().impressoraBluetooth?.id && (
                                                <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-2 font-medium">
                                                    Toque em <strong>Conectar</strong> no bloco da maquininha acima antes de receber.
                                                </p>
                                            )}
                                            {atendimentoModal.modo_recibo === 'termica' &&
                                                loadReciboTermicoConfigCobrador().impressoraBluetooth?.id ===
                                                    IMPRESSORA_BLUETOOTH_CELULAR_ID && (
                                                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2 font-medium">
                                                    Ao receber, escolha a impressora na tela do celular.
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="p-4 border-t dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 bg-gray-50 dark:bg-slate-900/50 rounded-b-2xl">
                                <Button variant="outline" className="flex-1 min-h-11" onClick={() => setAtendimentoModal(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1 min-h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={processarBaixa}
                                    loading={atendimentoModal.saving}
                                    disabled={parcelasBaixa.length === 0 || !atendimentoModal.conta_bancaria_id}
                                >
                                    {atendimentoModal.modo_recibo === 'pdf' ? (
                                        <FileText className="h-4 w-4 mr-1 shrink-0" />
                                    ) : (
                                        <Bluetooth className="h-4 w-4 mr-1 shrink-0" />
                                    )}
                                    {atendimentoModal.modo_recibo === 'pdf'
                                        ? 'Receber e gerar PDF'
                                        : 'Receber e imprimir'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="p-4 space-y-4 overflow-y-auto flex-1">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 dark:text-slate-550 uppercase tracking-wider mb-1">Cliente estava no local?</label>
                                    <Select
                                        value={atendimentoModal.cliente_estava}
                                        onChange={(e) =>
                                            setAtendimentoModal((prev) =>
                                                prev ? { ...prev, cliente_estava: e.target.value as 'sim' | 'nao' } : prev
                                            )
                                        }
                                    >
                                        <option value="nao">Não estava</option>
                                        <option value="sim">Estava</option>
                                    </Select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-400 dark:text-slate-550 uppercase tracking-wider mb-1">O que aconteceu?</label>
                                    <Select
                                        value={atendimentoModal.visita_motivo}
                                        onChange={(e) =>
                                            setAtendimentoModal((prev) =>
                                                prev
                                                    ? {
                                                          ...prev,
                                                          visita_motivo: e.target.value as MotivoVisita,
                                                      }
                                                    : prev
                                            )
                                        }
                                    >
                                        {(Object.keys(MOTIVO_VISITA_LABELS) as MotivoVisita[]).map((k) => (
                                            <option key={k} value={k}>{MOTIVO_VISITA_LABELS[k]}</option>
                                        ))}
                                    </Select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-400 dark:text-slate-550 uppercase tracking-wider mb-1">
                                        Detalhes da visita {atendimentoModal.visita_motivo === 'outro' ? '*' : '(opcional)'}
                                    </label>
                                    <textarea
                                        value={atendimentoModal.visita_justificativa}
                                        onChange={(e) =>
                                            setAtendimentoModal((prev) =>
                                                prev ? { ...prev, visita_justificativa: e.target.value } : prev
                                            )
                                        }
                                        className="w-full rounded-xl border border-gray-200 dark:border-slate-800 dark:bg-slate-800 p-3 text-sm dark:text-slate-100"
                                        rows={4}
                                        placeholder="Ex.: bateu na porta, vizinho disse que viajou, combinou pagar sexta..."
                                    />
                                </div>
                            </div>

                            <div className="p-4 border-t dark:border-slate-800 flex items-center gap-2 bg-gray-50 dark:bg-slate-900/50 rounded-b-2xl">
                                <Button variant="outline" className="flex-1 min-h-11" onClick={() => setAtendimentoModal(null)}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1 min-h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={processarVisita}
                                    loading={atendimentoModal.visita_saving}
                                >
                                    Salvar Visita
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title={modoCobrador ? 'Minha carteira' : 'Cobranças Pendentes'}
                subtitle={
                    modoCobrador
                        ? 'Clientes da sua carteira por bairro — busque, abra o cliente e baixe as parcelas em campo'
                        : 'Fila por cobrador e bairro — gestão e baixa de parcelas em rota'
                }
                actionButton={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void atualizarSincronizarCarteira()}
                        disabled={sincronizando || loading || vinculoCobradorLoading}
                        title="Alinha a lista com contas a receber (remove parcelas já pagas)"
                    >
                        <RefreshCw
                            className={`h-4 w-4 mr-1.5 ${sincronizando ? 'animate-spin' : ''}`}
                        />
                        {sincronizando ? 'Sincronizando…' : 'Atualizar / Sincronizar'}
                    </Button>
                }
            />

            <ImpressoraBluetoothSetup compacto={modoCobrador} />

            <div className="w-full max-w-2xl grid grid-cols-2 gap-2 p-1.5 bg-gray-100 rounded-xl border border-gray-200 shadow-sm">
                <button
                    type="button"
                    onClick={() => irParaAba('carteira')}
                    className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-bold transition-all ${
                        mainTab === 'carteira'
                            ? 'bg-white text-indigo-700 shadow-md ring-1 ring-indigo-100'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                    }`}
                >
                    <ClipboardCheck className="h-5 w-5 shrink-0" />
                    {modoCobrador ? 'Minha carteira' : 'Cobranças pendentes'}
                </button>
                <button
                    type="button"
                    onClick={() => irParaAba('reimprimir')}
                    className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-bold transition-all ${
                        mainTab === 'reimprimir'
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                >
                    <History className="h-5 w-5 shrink-0" />
                    Reimprimir recibo
                </button>
            </div>

            {mainTab === 'carteira' && modoCobrador && (
                <Card className="p-3 border-emerald-200 bg-emerald-50/90 text-sm text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                    <p>
                        Precisa <strong>buscar um cliente</strong> e <strong>reimprimir o comprovante</strong> de parcela
                        já paga? Use a aba ao lado.
                    </p>
                    <Button
                        type="button"
                        size="sm"
                        className="bg-emerald-700 hover:bg-emerald-800 text-white shrink-0"
                        onClick={() => irParaAba('reimprimir')}
                    >
                        <History className="h-4 w-4 mr-1" />
                        Ir para reimprimir
                    </Button>
                </Card>
            )}

            {mainTab === 'reimprimir' && (
                <CobrancasReimprimirReciboTab
                    empresaIdsFiltro={empresaIdsFiltro}
                    cobradorIdFiltro={modoCobrador ? meuCobradorId : cobradorFilter || null}
                />
            )}

            {mainTab === 'carteira' && (
            <>
            {modoGestor && !loadingEmpresasGrupo && !visaoConsolidada && (
                <Card className="p-4 border-indigo-200 bg-indigo-50 text-indigo-950 text-sm">
                    <p className="font-semibold mb-1">Você está vendo só uma unidade ({labelContexto})</p>
                    <p className="text-indigo-800/90 leading-snug">
                        Para cobrar e consultar pendências de <strong>Aparecida, Catalão, Ipameri</strong> ao mesmo
                        tempo, clique no seletor no topo da tela (ao lado do sino) e escolha{' '}
                        <strong>Todas as unidades</strong>. Depois confirme em &quot;Carregar dados&quot;.
                    </p>
                </Card>
            )}

            {modoGestor && visaoConsolidada && (
                <Card className="p-3 border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-medium">
                    Visão ativa: <strong>todas as unidades do grupo</strong> — cobranças de Aparecida, Catalão e
                    Ipameri nesta lista.
                </Card>
            )}

            {modoCobrador && !vinculoCobradorLoading && !meuCobradorId && (
                <Card className="p-4 border-amber-200 bg-amber-50 text-amber-900 text-sm">
                    Seu usuário ainda não está vinculado a um cadastro de cobrador. Peça ao gestor para
                    informar o mesmo e-mail do login no cadastro em Cobradores, ou vincular seu usuário no
                    formulário do cobrador.
                </Card>
            )}

            {/* Stats */}
            <div className={`grid gap-4 ${modoCobrador ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
                <Card className="p-4 bg-amber-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pendentes</p>
                    <p className="text-3xl font-bold text-amber-700 mt-1">{stats.totalPendentes}</p>
                </Card>
                <Card className="p-4 bg-blue-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Total</p>
                    <p className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(stats.valorTotal)}</p>
                </Card>
                {modoGestor && (
                    <>
                        <Card className="p-4 bg-red-50">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Alta Prioridade</p>
                            <p className="text-3xl font-bold text-red-700 mt-1">{stats.altaPrioridade}</p>
                        </Card>
                        <Card className="p-4 bg-green-50">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Cobrados (Mês)</p>
                            <p className="text-3xl font-bold text-green-700 mt-1">{stats.cobrados}</p>
                        </Card>
                    </>
                )}
            </div>

            {/* Rota do dia */}
            <Card className="p-4 border-indigo-100 bg-indigo-50/40">
                <div className="flex flex-col md:flex-row md:items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-semibold text-indigo-900 mb-1.5 flex items-center gap-1">
                            <Navigation className="h-3.5 w-3.5" />
                            Rota de cobrança (hoje)
                        </label>
                        <Select
                            value={rotaAtivaId}
                            onChange={(e) => aplicarRotaAtiva(e.target.value)}
                        >
                            <option value="">Toda a carteira (sem rota)</option>
                            {rotasDisponiveis.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.regiao} — {r.paradas.length} parada(s) ({r.status})
                                </option>
                            ))}
                        </Select>
                    </div>
                    <Link to="/cobradores/rotas/nova">
                        <Button type="button" variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-1" />
                            Nova rota
                        </Button>
                    </Link>
                </div>
                {rotaAtiva && resumoRotaAtiva && (
                    <div className="mt-3 space-y-3">
                        <p className="text-xs text-indigo-800">
                            Ordem da rota: {rotaAtiva.paradas.length} cliente(s) em{' '}
                            {rotaAtiva.bairros.join(', ') || rotaAtiva.regiao}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                            <div className="rounded-lg bg-white/80 px-2 py-2 border border-indigo-100">
                                <p className="text-lg font-bold text-green-700">{resumoRotaAtiva.clientesCobrados}</p>
                                <p className="text-[10px] text-gray-600 uppercase">Cobrados</p>
                            </div>
                            <div className="rounded-lg bg-white/80 px-2 py-2 border border-indigo-100">
                                <p className="text-lg font-bold text-amber-700">{resumoRotaAtiva.clientesNaoCobrados}</p>
                                <p className="text-[10px] text-gray-600 uppercase">Não cobrados</p>
                            </div>
                            <div className="rounded-lg bg-white/80 px-2 py-2 border border-indigo-100">
                                <p className="text-lg font-bold text-gray-700">{resumoRotaAtiva.clientesNuncaVisitados}</p>
                                <p className="text-[10px] text-gray-600 uppercase">Sem visita</p>
                            </div>
                            <div className="rounded-lg bg-white/80 px-2 py-2 border border-indigo-100">
                                <p className="text-lg font-bold text-purple-700">{resumoRotaAtiva.clientesComVisitaSemPagamento}</p>
                                <p className="text-[10px] text-gray-600 uppercase">Visitou, não pagou</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(
                                [
                                    ['nao_cobrados', 'Não cobrados na rota'],
                                    ['sem_visita', 'Sem visita'],
                                    ['visitados_sem_pagamento', 'Visitou, não pagou'],
                                    ['todos', 'Todos da rota'],
                                ] as const
                            ).map(([valor, label]) => (
                                <button
                                    key={valor}
                                    type="button"
                                    onClick={() => setFiltroSituacaoRota(valor)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                                        filtroSituacaoRota === valor
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-white text-gray-600 border-gray-200'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* Filters */}
            <Card className="p-4 space-y-4 dark:bg-slate-900 dark:border-slate-800">
                <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-snug">
                    Se aparecer erro de parcela já paga, toque em{' '}
                    <strong>Atualizar / Sincronizar</strong> para alinhar com o financeiro.
                </p>
                <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                        <Search className="h-4 w-4 text-gray-400 absolute top-3 left-3" />
                        <Input
                            className={`pl-9 w-full ${modoCobrador ? 'text-base py-3' : ''}`}
                            placeholder="Nº contrato, cliente, CPF ou bairro..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button
                        type="button"
                        variant={filtrosAvancadosAbertos ? 'primary' : 'outline'}
                        onClick={() => setFiltrosAvancadosAbertos(!filtrosAvancadosAbertos)}
                        className="flex items-center gap-2 px-3 h-10 select-none shrink-0"
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        <span className="hidden md:inline text-xs font-semibold">Filtros</span>
                    </Button>
                </div>

                {/* Advanced Collapsible Filters Container */}
                {filtrosAvancadosAbertos && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-gray-100 dark:border-slate-800 animate-fadeIn">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                Status da Parcela
                            </label>
                            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                <option value="">Todos os status</option>
                                <option value="pendente">Pendente</option>
                                <option value="em_andamento">Em Andamento</option>
                                <option value="promessa">Promessa</option>
                                <option value="nao_localizado">Não Localizado</option>
                                <option value="recusou">Recusou</option>
                                {!modoCobrador && <option value="cobrado">Cobrado</option>}
                            </Select>
                        </div>

                        {modoGestor && (
                            <>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                        Cobrador
                                    </label>
                                    <Select value={cobradorFilter} onChange={(e) => setCobradorFilter(e.target.value)}>
                                        <option value="">Todos os cobradores</option>
                                        {cobradores.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome}
                                            </option>
                                        ))}
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                        Prioridade
                                    </label>
                                    <Select
                                        value={prioridadeFilter}
                                        onChange={(e) => setPrioridadeFilter(e.target.value)}
                                    >
                                        <option value="">Todas as prioridades</option>
                                        <option value="alta">Alta</option>
                                        <option value="media">Média</option>
                                        <option value="baixa">Baixa</option>
                                    </Select>
                                </div>
                            </>
                        )}

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                Bairro (Filtro Manual)
                            </label>
                            <Select value={rotaFilter} onChange={(e) => setRotaFilter(e.target.value)}>
                                <option value="">Todos os bairros</option>
                                {bairrosFiltroLista.map((rota) => (
                                    <option key={rota} value={rota}>
                                        {rota}
                                    </option>
                                ))}
                            </Select>
                        </div>

                        {modoGestor && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                    Situação do Bairro
                                </label>
                                <Select
                                    value={bairroSituacaoFilter}
                                    onChange={(e) =>
                                        setBairroSituacaoFilter(e.target.value as 'todos' | 'pendentes' | 'baixadas')
                                    }
                                >
                                    <option value="todos">Mostrar todos</option>
                                    <option value="pendentes">Somente pendentes</option>
                                    <option value="baixadas">Somente baixadas</option>
                                </Select>
                            </div>
                        )}
                    </div>
                )}

                {/* Bairros Rota Rápida (Pills Scrollable) */}
                {bairrosRotaRapida.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-slate-800 pt-3">
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                            Filtrar por Bairro
                        </p>
                        <div className="flex overflow-x-auto gap-1.5 pb-2 scrollbar-none touch-pan-x -mx-4 px-4 sm:mx-0 sm:px-0">
                            <button
                                type="button"
                                onClick={() => setRotaFilter('')}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all cursor-pointer select-none ${
                                    !rotaFilter
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                        : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700'
                                }`}
                            >
                                Todos
                            </button>
                            {bairrosRotaRapida.map(({ bairro, count }) => (
                                <button
                                    key={bairro}
                                    type="button"
                                    onClick={() => setRotaFilter(rotaFilter === bairro ? '' : bairro)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                                        rotaFilter === bairro
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    <span>{bairro}</span>
                                    <span
                                        className={`px-1.5 py-0.5 text-[9px] rounded-md font-bold leading-none ${
                                            rotaFilter === bairro
                                                ? 'bg-indigo-700 text-white'
                                                : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {modoGestor && items.length > 0 && clientesPorBairroFiltrados.length === 0 && clientesAgrupados.length > 0 && (
                <Card className="p-4 border-amber-200 bg-amber-50 text-amber-900 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p>
                        Há <strong>{clientesAgrupados.length}</strong> cliente(s) com cobrança, mas o filtro
                        &quot;Situação: {bairroSituacaoFilter === 'pendentes' ? 'Somente pendentes' : 'Somente baixadas'}&quot;
                        ocultou todos. Use <strong>Todos</strong> para ver a fila completa.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setBairroSituacaoFilter('todos')}>
                        Mostrar todos
                    </Button>
                </Card>
            )}

            {modoGestor && filtrosOcultamClientes && items.length > 0 && (
                <Card className="p-4 border-amber-200 bg-amber-50 text-amber-900 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p>
                        {filtrosOcultamClientes === 'rota'
                            ? 'A rota selecionada não tem clientes com pendências na carteira. Limpe a rota para ver todos os clientes a cobrar.'
                            : 'Os filtros atuais não retornaram clientes. Limpe os filtros para ver a carteira completa.'}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={limparFiltrosGestor}>
                        Limpar filtros
                    </Button>
                </Card>
            )}

            {/* Toggle de visualização e legenda de cores */}
            {clientesAgrupados.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <p className="text-sm font-medium text-gray-500">
                            {clientesAgrupados.length} cliente(s)
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-gray-600">
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
                                Cobrado
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                                Não visitado
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-purple-400 shrink-0" />
                                Visitou, não pagou
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                                Em andamento
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200 gap-0.5 self-end sm:self-auto shrink-0">
                        <button
                            type="button"
                            onClick={() => setModoVista('cards')}
                            title="Visualização em cards"
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all active:scale-95 ${
                                modoVista === 'cards'
                                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <LayoutGrid className="h-4 w-4" />
                            Cards
                        </button>
                        <button
                            type="button"
                            onClick={() => setModoVista('lista')}
                            title="Lista simples de clientes"
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all active:scale-95 ${
                                modoVista === 'lista'
                                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <List className="h-4 w-4" />
                            Lista
                        </button>
                    </div>
                </div>
            )}

            {/* Vista Lista — nomes dos clientes com indicador de cor */}
            {modoVista === 'lista' && clientesAgrupados.length > 0 && (
                <Card className="p-0 overflow-hidden divide-y divide-gray-100 dark:divide-slate-800 shadow-sm">
                    {clientesPorBairroFiltrados.map((grupo) => (
                        <div key={grupo.bairro}>
                            <div className="px-4 py-2.5 bg-indigo-50/60 dark:bg-slate-900/40 flex items-center justify-between gap-2">
                                <p className="text-xs font-bold text-indigo-800 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                                    {grupo.bairro}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400">
                                        {grupo.baixadas} cobrados
                                    </span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${grupo.pendentes > 0 ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500'}`}>
                                        {grupo.pendentes} pend.
                                    </span>
                                </div>
                            </div>
                            {grupo.clientes.map((cliente) => {
                                const { resumo } = cliente;
                                const isCobrado = resumo.situacao === 'quitado';
                                const isNaoVisitado = resumo.situacao === 'nunca_visitado';
                                const isVisitadoSemPag = resumo.situacao === 'visitado_sem_pagamento';
                                const corFundo = isCobrado
                                    ? 'bg-green-50/70 dark:bg-green-950/10'
                                    : isNaoVisitado
                                      ? 'bg-red-50/70 dark:bg-red-950/10'
                                      : isVisitadoSemPag
                                        ? 'bg-purple-50/70 dark:bg-purple-950/10'
                                        : 'bg-white dark:bg-transparent';
                                const corBordaEsq = isCobrado
                                    ? 'border-l-4 border-l-green-500'
                                    : isNaoVisitado
                                      ? 'border-l-4 border-l-red-500'
                                      : isVisitadoSemPag
                                        ? 'border-l-4 border-l-purple-400'
                                        : 'border-l-4 border-l-amber-400';
                                const telListaDigits = cliente.cliente_telefone?.replace(/\D/g, '') || '';
                                return (
                                    <div
                                        key={cliente.cliente_id}
                                        className={`flex items-center gap-0 border-b border-gray-100 dark:border-slate-800 last:border-0 ${corFundo} ${corBordaEsq} transition-colors`}
                                    >
                                        {/* Área clicável principal — nome + valor */}
                                        <button
                                            type="button"
                                            onClick={() => abrirModalParcelasCliente(cliente)}
                                            className="flex-1 flex items-center gap-3 px-4 py-4 text-left active:bg-black/5 min-w-0"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-900 dark:text-slate-100 text-base leading-snug truncate">
                                                    {cliente.cliente_nome}
                                                </p>
                                                {!isCobrado && (
                                                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                                                        {resumo.tempo_sem_visita_label}
                                                        {cliente.qtd_pendentes > 0 && ` · ${cliente.qtd_pendentes} parcela(s)`}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                {isCobrado ? (
                                                    <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/30 px-2 py-1 rounded-full whitespace-nowrap">
                                                        Cobrado
                                                    </span>
                                                ) : (
                                                    <p className="text-sm font-black text-indigo-700 dark:text-indigo-300 font-mono whitespace-nowrap">
                                                        {formatCurrency(cliente.valor_pendente_centavos)}
                                                    </p>
                                                )}
                                            </div>
                                        </button>

                                        {/* Botões de ação rápida */}
                                        <div className="flex items-center gap-0 pr-3 shrink-0">
                                            {telListaDigits && (
                                                <>
                                                    <a
                                                        href={`tel:${telListaDigits}`}
                                                        title="Ligar"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center justify-center h-10 w-10 rounded-full text-indigo-600 dark:text-indigo-400 active:bg-indigo-100 transition-colors"
                                                    >
                                                        <Phone className="h-4 w-4" />
                                                    </a>
                                                    <a
                                                        href={`https://wa.me/55${telListaDigits}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title="WhatsApp"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center justify-center h-10 w-10 rounded-full text-emerald-600 dark:text-emerald-400 active:bg-emerald-100 transition-colors"
                                                    >
                                                        <MessageSquare className="h-4 w-4" />
                                                    </a>
                                                </>
                                            )}
                                            {!isCobrado && (
                                                <button
                                                    type="button"
                                                    title="Registrar visita / marcar lembrete"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void abrirAtendimentoModal(cliente, 'visita');
                                                    }}
                                                    className="inline-flex items-center justify-center h-10 w-10 rounded-full text-amber-600 dark:text-amber-400 active:bg-amber-100 transition-colors"
                                                >
                                                    <ClipboardCheck className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </Card>
            )}

            {/* Vista Cards — detalhes completos por bairro */}
            {modoVista === 'cards' && (
            <div className="space-y-4">
                {clientesPorBairroFiltrados.map((grupo) => {
                    const colapsado = !bairrosExpandidos[grupo.bairro];
                    return (
                        <Card key={grupo.bairro} className="p-0 overflow-hidden shadow-sm border border-gray-150/70 dark:border-slate-800 transition-all duration-200">
                            <button
                                type="button"
                                onClick={() => alternarBairroExpandido(grupo.bairro)}
                                className="w-full text-left px-4 sm:px-5 py-3.5 bg-indigo-50/60 dark:bg-slate-900/40 flex items-center justify-between gap-3 hover:bg-indigo-50 dark:hover:bg-slate-800/60 transition-colors focus:outline-none"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="font-extrabold text-indigo-950 dark:text-slate-100 flex items-center gap-1.5 text-sm sm:text-base">
                                        <MapPin className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                        Bairro: {grupo.bairro}
                                    </p>
                                    <p className="text-xs text-indigo-700 dark:text-slate-400 mt-0.5 font-medium">
                                        {grupo.clientes.length} cliente(s) nesta área
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400">
                                        Cobrados: {grupo.baixadas}
                                    </span>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${grupo.pendentes > 0 ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}>
                                        Pendentes: {grupo.pendentes}
                                    </span>
                                    {colapsado ? (
                                        <ChevronDown className="h-5 w-5 text-indigo-700 dark:text-indigo-400 transition-transform duration-200 shrink-0" />
                                    ) : (
                                        <ChevronUp className="h-5 w-5 text-indigo-700 dark:text-indigo-400 transition-transform duration-200 shrink-0" />
                                    )}
                                </div>
                            </button>
                            {!colapsado && (
                                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                                    {grupo.clientes.map((cliente) => {
                                        const maiorAtraso = Math.max(0, ...cliente.parcelas.map((p) => p.dias_atraso));
                                        const vencimentoMaisAntigo = cliente.ultima_data_vencimento;
                                        const { resumo } = cliente;
                                        const tempoCls =
                                            resumo.situacao === 'nunca_visitado'
                                                ? 'bg-red-50 text-red-700 border-red-200/60 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/40'
                                                : resumo.situacao === 'visitado_sem_pagamento'
                                                  ? 'bg-purple-50 text-purple-700 border-purple-200/60 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/40'
                                                  : resumo.situacao === 'quitado'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40'
                                                    : 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40';
                                        const clienteCorEsquerda =
                                            resumo.situacao === 'quitado'
                                                ? 'border-l-4 border-l-green-500'
                                                : resumo.situacao === 'nunca_visitado'
                                                  ? 'border-l-4 border-l-red-500'
                                                  : resumo.situacao === 'visitado_sem_pagamento'
                                                    ? 'border-l-4 border-l-purple-400'
                                                    : 'border-l-4 border-l-amber-400';
                                        const telDigits = cliente.cliente_telefone?.replace(/\D/g, '') || '';

                                        return (
                                            <div
                                                key={cliente.cliente_id}
                                                className={`w-full text-left px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors border-b border-gray-100 dark:border-slate-800 last:border-0 relative group ${clienteCorEsquerda}`}
                                            >
                                                {/* Left Column: Client Info */}
                                                <div 
                                                    className="flex-1 min-w-0 space-y-1 cursor-pointer"
                                                    onClick={() => abrirModalParcelasCliente(cliente)}
                                                >
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {rotaAtiva && resumo.ordem_rota != null && (
                                                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-none">
                                                                #{resumo.ordem_rota}
                                                            </span>
                                                        )}
                                                        <h4 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg tracking-tight leading-snug hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                                            {cliente.cliente_nome}
                                                        </h4>
                                                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${tempoCls}`}>
                                                            {resumo.situacao === 'quitado' ? (
                                                                <CheckCircle2 className="h-3 w-3" />
                                                            ) : (
                                                                <Clock className="h-3 w-3" />
                                                            )}
                                                            {resumo.situacao === 'quitado' ? 'Cobrado' : resumo.tempo_sem_visita_label}
                                                        </span>
                                                    </div>

                                                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 mt-1">
                                                        {cliente.cliente_endereco ? (
                                                            <p className="flex items-start gap-1 font-medium leading-relaxed">
                                                                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400 dark:text-slate-550" />
                                                                <span>{cliente.cliente_endereco}</span>
                                                            </p>
                                                        ) : null}

                                                        <p className="text-gray-500 dark:text-slate-500 font-medium">
                                                            {cliente.plano_nome ? `Plano: ${cliente.plano_nome}` : ''}
                                                            {cliente.valor_mensal_plano_centavos > 0
                                                                ? ` · Mensalidade: ${formatCurrency(cliente.valor_mensal_plano_centavos)}`
                                                                : ''}
                                                            {vencimentoMaisAntigo
                                                                ? ` · Venc. mais antigo: ${formatarDataIsoPtBr(vencimentoMaisAntigo)}`
                                                                : ''}
                                                        </p>
                                                        
                                                        {modoGestor && (
                                                            <p className="text-[10px] text-gray-400 dark:text-slate-500">
                                                                Cobrador: {cliente.cobrador_nome}
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Quick Contact & Navigation Buttons */}
                                                    <div className="flex items-center gap-2 mt-2 pt-1" onClick={(e) => e.stopPropagation()}>
                                                        {cliente.cliente_telefone ? (
                                                            <>
                                                                <a
                                                                    href={`tel:${telDigits}`}
                                                                    title="Ligar para o cliente"
                                                                    className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 transition-colors border border-indigo-100/50 dark:border-indigo-900/30"
                                                                >
                                                                    <Phone className="h-4 w-4" />
                                                                </a>
                                                                <a
                                                                    href={`https://wa.me/55${telDigits}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    title="Mensagem no WhatsApp"
                                                                    className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 transition-colors border border-emerald-100/50 dark:border-emerald-900/30"
                                                                >
                                                                    <MessageSquare className="h-4 w-4" />
                                                                </a>
                                                            </>
                                                        ) : null}
                                                        {cliente.cliente_endereco ? (
                                                            <a
                                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.cliente_nome + ', ' + cliente.cliente_endereco)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title="Como chegar (Google Maps)"
                                                                className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 dark:text-blue-300 transition-colors border border-blue-100/50 dark:border-blue-900/30"
                                                            >
                                                                <Navigation className="h-4 w-4" />
                                                            </a>
                                                        ) : null}
                                                        {resumo.situacao !== 'quitado' && (
                                                            <button
                                                                type="button"
                                                                title="Registrar visita / marcar lembrete"
                                                                onClick={() => void abrirAtendimentoModal(cliente, 'visita')}
                                                                className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 dark:text-amber-300 transition-colors border border-amber-100/50 dark:border-amber-900/30"
                                                            >
                                                                <ClipboardCheck className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right Column: Financial Block */}
                                                <div 
                                                    onClick={() => abrirModalParcelasCliente(cliente)}
                                                    className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 bg-gray-50/70 hover:bg-indigo-50/50 border border-gray-150/70 hover:border-indigo-200 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 dark:border-slate-800 p-3 rounded-2xl min-w-full md:min-w-[9.5rem] transition-all cursor-pointer shadow-sm shrink-0"
                                                >
                                                    <div className="text-left md:text-right">
                                                        <p className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-slate-400 font-bold">
                                                            A receber
                                                        </p>
                                                        <p className="text-lg font-black text-indigo-950 dark:text-white leading-none mt-0.5 font-mono">
                                                            {formatCurrency(cliente.valor_pendente_centavos)}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${maiorAtraso > 0 ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'}`}>
                                                            {maiorAtraso > 0 ? `${maiorAtraso}d atraso` : 'Em dia'}
                                                        </p>
                                                        {cliente.qtd_pendentes > 0 && (
                                                            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-1">
                                                                {cliente.qtd_pendentes} parcelas
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>
            )}

            {clientesAgrupados.length === 0 && (
                <Card className="p-10 text-center text-gray-500">
                    {vinculoCobradorLoading || loading ? (
                        <ApexLoader
                            className="py-8"
                            words={['Cobranças', 'Carteira', 'Parcelas', 'Clientes', 'Cobranças']}
                            subtitle="Carregando cobranças..."
                        />
                    ) : modoCobrador && !meuCobradorId
                      ? 'Vincule seu usuário ao cadastro de cobrador para ver a carteira.'
                      : rotaAtiva && filtroSituacaoRota !== 'todos'
                        ? `Nenhum cliente nesta rota com o filtro "${filtroSituacaoRota === 'nao_cobrados' ? 'Não cobrados' : filtroSituacaoRota === 'sem_visita' ? 'Sem visita' : 'Visitou, não pagou'}". Tente "Todos da rota".`
                        : rotaAtiva
                          ? 'Nenhum cliente desta rota com pendências na carteira. Confira se a rota foi gerada com clientes em aberto.'
                          : 'Nenhum cliente pendente para os filtros informados.'}
                </Card>
            )}

            {clientesAgrupados.length > 0 && clientesPorBairroFiltrados.length === 0 && (
                <Card className="p-10 text-center text-gray-500">
                    Nenhum bairro encontrado para o filtro de situação selecionado.
                </Card>
            )}

            </>
            )}

            {renderParcelasClienteModal()}
            {renderAtendimentoModal()}
        </div>
    );
};

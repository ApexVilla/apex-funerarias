import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
    Search, DollarSign, AlertTriangle, Calendar, CheckCircle2,
    Clock, CreditCard, Banknote, QrCode, Wallet, Users, Receipt,
    ChevronRight, X, Printer, ArrowLeft, Minus, Plus, Hash, Percent, History,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { generateReciboPDF, obterMesReferencia } from '../../lib/ReciboService';
import { reservarJanelaImpressaoPdf } from '../../lib/printPdfBlob';
import { useToast } from '../../lib/ToastStore';
import {
  imprimirReciboTermico,
  imprimirReciboTermicoBaixaInteligente,
  montarReciboTermicoBaixa,
  type ReciboTermicoData,
} from '../../lib/ReciboTermicoService';
import { loadReciboTermicoConfigFinanceiro } from '../../lib/reciboTermicoConfig';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import {
    useFinanceiro, formatCentavos,
    type ContaReceberDetalhada, type BaixarContaReceberParams
} from '../../lib/FinanceiroStore';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { StatusFinanceiroBadge, FinanceiroLoading, StatCard } from '../../components/financeiro/FinanceiroComponents';
import { PixPagadorConfirmacao } from '../../components/financeiro/PixPagadorConfirmacao';
import {
    pixPagadorParaBaixa,
    pixPagadorStateInicial,
    sufixoDescricaoPixExtrato,
    validarPixPagador,
    type PixPagadorState,
} from '../../lib/pixPagadorBaixa';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { sincronizarParcelasAssinatura } from '../../lib/mensalidadesAssinatura';
import { buscarClientesPorTermo, type ClienteBuscaRow } from '../../lib/buscarClientesEmpresa';
import { dataHojeIsoLocal } from '../../lib/contratoDatas';
import { rotuloParcelaCobranca } from '../../lib/cobrancaParcelaUi';
import {
    filtrarContasOperaveis,
    resolverContaCaixaPadrao,
    resolverContaDestinoBaixa,
    resolverContaPrincipal,
    usuarioPodeOperarConta,
    usuarioPodeVerTodosCaixas,
} from '../../lib/finCaixaPermissoes';
import { ensureContasDestinoBaixa } from '../../lib/finCaixaAutoAbertura';

// ==================== ICONS FOR PAYMENT METHODS ====================
const formaIcons: Record<string, React.ReactNode> = {
    dinheiro: <Banknote className="h-5 w-5" />,
    pix: <QrCode className="h-5 w-5" />,
    cartao_credito: <CreditCard className="h-5 w-5" />,
    cartao_debito: <Wallet className="h-5 w-5" />,
    boleto: <DollarSign className="h-5 w-5" />,
    transferencia: <DollarSign className="h-5 w-5" />,
    cheque: <DollarSign className="h-5 w-5" />,
    debito_automatico: <DollarSign className="h-5 w-5" />,
};

type MainTab = 'baixa' | 'reimprimir';
type ViewMode = 'search' | 'parcelas' | 'reimprimir_parcelas' | 'receipt';

type MetadadosBaixaRecibo = {
    formaNome: string;
    contaNome: string;
    dataPagamento?: string;
};

const carregarMetadadosBaixaRecibo = async (contaReceberId: string): Promise<MetadadosBaixaRecibo> => {
    const { data } = await supabase
        .from('fin_contas_receber_baixas')
        .select('data_pagamento, data_baixa, forma_pagamento_id, conta_bancaria_id')
        .eq('conta_receber_id', contaReceberId)
        .eq('estornada', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    let formaNome = '—';
    let contaNome = '—';
    if (data?.forma_pagamento_id) {
        const { data: forma } = await supabase
            .from('fin_formas_pagamento')
            .select('nome')
            .eq('id', data.forma_pagamento_id)
            .maybeSingle();
        if (forma?.nome) formaNome = forma.nome;
    }
    if (data?.conta_bancaria_id) {
        const { data: conta } = await supabase
            .from('fin_contas_bancarias')
            .select('nome')
            .eq('id', data.conta_bancaria_id)
            .maybeSingle();
        if (conta?.nome) contaNome = conta.nome;
    }

    const dataPagamento =
        (data?.data_pagamento as string | undefined)?.slice(0, 10)
        || (data?.data_baixa as string | undefined)?.slice(0, 10);

    return { formaNome, contaNome, dataPagamento };
};

const getCreditoCliente = async (empresaId: string, clienteId: string): Promise<number> => {
    const { data, error } = await supabase
        .from('fin_creditos_clientes')
        .select('saldo_centavos')
        .eq('empresa_id', empresaId)
        .eq('cliente_id', clienteId)
        .maybeSingle();
    if (error) throw error;
    const value = Number(data?.saldo_centavos || 0);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
};

const addCreditoCliente = async (empresaId: string, clienteId: string, valorCentavos: number) => {
    if (valorCentavos <= 0) return;
    const atual = await getCreditoCliente(empresaId, clienteId);
    const { error } = await supabase
        .from('fin_creditos_clientes')
        .upsert(
            {
                empresa_id: empresaId,
                cliente_id: clienteId,
                saldo_centavos: atual + valorCentavos,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'empresa_id,cliente_id' }
        );
    if (error) throw error;
};

const consumeCreditoCliente = async (empresaId: string, clienteId: string, valorConsumidoCentavos: number) => {
    if (valorConsumidoCentavos <= 0) return;
    const atual = await getCreditoCliente(empresaId, clienteId);
    const proximo = Math.max(0, Math.round(atual - valorConsumidoCentavos));
    const { error } = await supabase
        .from('fin_creditos_clientes')
        .upsert(
            {
                empresa_id: empresaId,
                cliente_id: clienteId,
                saldo_centavos: proximo,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'empresa_id,cliente_id' }
        );
    if (error) throw error;
};

export const BaixaParcelas: React.FC = () => {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const contaIdUrl = searchParams.get('contaId') || '';
    const {
        empresaId,
        contasReceberDetalhadas, loadContasReceberDetalhado,
        baixarContaReceber, criarContaReceber, formasPagamento, loadFormasPagamento,
        contasBancarias, loadContasBancarias, loading,
        gerarMensalidadesMes
    } = useFinanceiro();
    const { user } = useAuth();
    const { showToast } = useToast();
    const verTodosCaixas = usuarioPodeVerTodosCaixas(
        user?.role,
        user?.permissoes as Record<string, unknown> | undefined,
    );
    const { empresaIdsParaFiltro } = useEmpresaContextoAtivo();
    const empresaScopeIds = useMemo(
        () => (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean),
        [empresaIdsParaFiltro],
    );
    const contasOperaveis = useMemo(
        () => filtrarContasOperaveis(contasBancarias, user?.id, verTodosCaixas),
        [contasBancarias, user?.id, verTodosCaixas],
    );

    // View state
    const [mainTab, setMainTab] = useState<MainTab>('baixa');
    const [view, setView] = useState<ViewMode>('search');
    const [reimprimirSelectedIds, setReimprimirSelectedIds] = useState<Set<string>>(new Set());
    const [reimprimindo, setReimprimindo] = useState(false);

    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const [clientesBusca, setClientesBusca] = useState<ClienteBuscaRow[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [searchError, setSearchError] = useState('');

    // Selected client
    const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
    const [selectedClienteNome, setSelectedClienteNome] = useState('');
    const [selectedClienteCpf, setSelectedClienteCpf] = useState('');

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Payment form
    const [formaPagamentoId, setFormaPagamentoId] = useState('');
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [valorPago, setValorPago] = useState('');
    const [valorDesconto, setValorDesconto] = useState('');
    const [motivoDesconto, setMotivoDesconto] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [dataBaixa, setDataBaixa] = useState(() => dataHojeIsoLocal());
    const [pixPagador, setPixPagador] = useState<PixPagadorState>(pixPagadorStateInicial);
    const [pixPagador2, setPixPagador2] = useState<PixPagadorState>(pixPagadorStateInicial);
    const [errorMsg, setErrorMsg] = useState('');
    const [processing, setProcessing] = useState(false);
    const [criarRecebimentoCarteira, setCriarRecebimentoCarteira] = useState(false);
    const [valorCarteira, setValorCarteira] = useState('');
    const [vencimentoCarteira, setVencimentoCarteira] = useState(dataHojeIsoLocal());
    const [descricaoCarteira, setDescricaoCarteira] = useState('');
    const [creditoClienteCentavos, setCreditoClienteCentavos] = useState(0);

    // Split payment states
    const [isSplit, setIsSplit] = useState(false);
    const [formaPagamentoId2, setFormaPagamentoId2] = useState('');
    const [contaBancariaId2, setContaBancariaId2] = useState('');
    const [valorPago1, setValorPago1] = useState('');
    const [valorPago2, setValorPago2] = useState('');

    type ReciboBaixaInput = Parameters<typeof montarReciboTermicoBaixa>[0];

    // Receipt state
    const [receiptData, setReceiptData] = useState<{
        parcelas: number;
        valorTotal: number;
        valorPago: number;
        valorDesconto: number;
        troco: number;
        formaNome: string;
        contaNome: string;
        clienteNome: string;
        saldoGerado: number;
        creditoProximaParcela: number;
        reciboTermico: ReciboTermicoData | null;
        reciboBaixaInput?: ReciboBaixaInput;
        reimpressao?: boolean;
        parcelasDetalhes: Array<{
            numero: number;
            mesReferencia: string;
            descricao: string;
            vencimento: string;
            valor: number;
        }>;
    } | null>(null);
    const [printandoRecibo, setPrintandoRecibo] = useState(false);

    // Load payment methods and bank accounts
    useEffect(() => {
        loadFormasPagamento();
        loadContasBancarias();
    }, [loadFormasPagamento, loadContasBancarias]);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const searchFromQuery = params.get('search') || '';
        if (searchFromQuery) {
            setSearchTerm(searchFromQuery);
            setHasSearched(true);
            loadContasReceberDetalhado({ search_term: searchFromQuery });
        }
    }, [location.search, loadContasReceberDetalhado]);

    // Set defaults for payment method
    useEffect(() => {
        if (formasPagamento.length > 0 && !formaPagamentoId) {
            setFormaPagamentoId(formasPagamento[0].id);
        }
        if (formasPagamento.length > 0 && !formaPagamentoId2) {
            setFormaPagamentoId2(formasPagamento[1]?.id || formasPagamento[0].id);
        }
    }, [formasPagamento, formaPagamentoId, formaPagamentoId2]);

    // Refs para evitar que o effect sobrescreva a seleção manual do operador
    const contaBancariaIdRef = React.useRef(contaBancariaId);
    contaBancariaIdRef.current = contaBancariaId;
    const contaOverriddenRef = React.useRef(false);   // true = operador trocou manualmente após última sugestão
    const ultimaFormaAutoRef = React.useRef('');       // forma que disparou a última auto-seleção

    // Conta destino conforme forma: espécie/PIX → caixa do operador; outros → conta principal
    useEffect(() => {
        if (contasOperaveis.length === 0) return;
        const idsValidos = new Set(contasOperaveis.map((c) => c.id));

        // Parâmetro de URL tem prioridade na primeira abertura
        if (contaIdUrl && idsValidos.has(contaIdUrl) && !ultimaFormaAutoRef.current) {
            setContaBancariaId(contaIdUrl);
            ultimaFormaAutoRef.current = formaPagamentoId;
            return;
        }
        if (!formaPagamentoId) return;

        const formaChanged = formaPagamentoId !== ultimaFormaAutoRef.current;
        // Quando a forma muda, libera nova sugestão (reseta override do operador)
        if (formaChanged) contaOverriddenRef.current = false;

        const currentInvalid =
            !contaBancariaIdRef.current || !idsValidos.has(contaBancariaIdRef.current);

        // Só auto-seleciona se: nunca inicializou, forma mudou (sem override), ou conta atual inválida
        if (!ultimaFormaAutoRef.current || (formaChanged && !contaOverriddenRef.current) || currentInvalid) {
            const forma = formasPagamento.find((f) => f.id === formaPagamentoId);
            const destino = resolverContaDestinoBaixa(
                contasOperaveis,
                forma?.tipo || forma?.nome,
                user?.id,
                verTodosCaixas,
            );
            setContaBancariaId(destino?.id || contasOperaveis[0].id);
            ultimaFormaAutoRef.current = formaPagamentoId;
            contaOverriddenRef.current = false;
        }
    // contaBancariaId excluído das deps propositalmente — o effect não deve sobrescrever a escolha manual
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contasOperaveis, formaPagamentoId, formasPagamento, contaIdUrl, user?.id, verTodosCaixas]);

    useEffect(() => {
        if (!isSplit || contasOperaveis.length === 0 || !formaPagamentoId2) return;
        const forma = formasPagamento.find((f) => f.id === formaPagamentoId2);
        const destino = resolverContaDestinoBaixa(
            contasOperaveis,
            forma?.tipo || forma?.nome,
            user?.id,
            verTodosCaixas,
        );
        if (destino) setContaBancariaId2(destino.id);
    }, [isSplit, contasOperaveis, formaPagamentoId2, formasPagamento, user?.id, verTodosCaixas]);

    const montarEExibirRecibo = useCallback(
        async (
            parcelasPagas: ContaReceberDetalhada[],
            resumo: {
                valorTotal: number;
                valorPago: number;
                valorDesconto: number;
                troco: number;
                formaNome: string;
                contaNome: string;
                saldoGerado: number;
                creditoProximaParcela: number;
                dataPagamento?: string;
            },
            opts?: { reimpressao?: boolean },
        ) => {
            const reimpressao = opts?.reimpressao === true;
            const valorParcela = (p: ContaReceberDetalhada) =>
                reimpressao ? p.valor_pago_centavos : p.valor_aberto_centavos;

            let reciboTermico: ReciboTermicoData | null = null;
            if (selectedClienteId) {
                try {
                    reciboTermico = await montarReciboTermicoBaixa({
                        clienteId: selectedClienteId,
                        clienteNome: selectedClienteNome,
                        parcelas: parcelasPagas.map((p) => ({
                            parcela_numero: p.parcela_numero,
                            data_vencimento: p.data_vencimento,
                            valorCentavos: valorParcela(p),
                            descricao: p.descricao,
                            total_parcelas: p.total_parcelas,
                            codigo: p.codigo,
                        })),
                        totalCentavos: resumo.valorPago,
                        formaPagamento: resumo.formaNome,
                        atendente: user?.nome || undefined,
                        planoNome: parcelasPagas[0]?.plano_nome,
                        dataPagamento: resumo.dataPagamento,
                    });
                } catch (e) {
                    console.warn('[BaixaParcelas] recibo térmico:', e);
                }
            }
            const reciboBaixaInput: ReciboBaixaInput | undefined = selectedClienteId
                ? {
                      clienteId: selectedClienteId,
                      clienteNome: selectedClienteNome,
                      parcelas: parcelasPagas.map((p) => ({
                          parcela_numero: p.parcela_numero,
                          data_vencimento: p.data_vencimento,
                          valorCentavos: valorParcela(p),
                          descricao: p.descricao,
                          total_parcelas: p.total_parcelas,
                          codigo: p.codigo,
                      })),
                      totalCentavos: resumo.valorPago,
                      formaPagamento: resumo.formaNome,
                      atendente: user?.nome || undefined,
                      planoNome: parcelasPagas[0]?.plano_nome,
                      dataPagamento: resumo.dataPagamento,
                  }
                : undefined;
            setReceiptData({
                parcelas: parcelasPagas.length,
                clienteNome: selectedClienteNome,
                reciboTermico,
                reciboBaixaInput,
                reimpressao,
                parcelasDetalhes: parcelasPagas.map((p) => ({
                    numero: p.parcela_numero || 1,
                    mesReferencia: obterMesReferencia(p.data_vencimento),
                    descricao: p.descricao || 'MENSALIDADE',
                    vencimento: p.data_vencimento
                        ? new Date(p.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')
                        : '',
                    valor: valorParcela(p) / 100,
                })),
                ...resumo,
            });
            setView('receipt');
        },
        [selectedClienteId, selectedClienteNome, user?.nome],
    );

    // ==================== SEARCH ====================
    const handleSearch = useCallback(async () => {
        const term = searchTerm.trim();
        if (!term) return;
        setHasSearched(true);
        setSearchError('');
        try {
            const [clientes] = await Promise.all([
                buscarClientesPorTermo(empresaScopeIds, term, 50),
                loadContasReceberDetalhado({ search_term: term }),
            ]);
            setClientesBusca(clientes);
        } catch (e) {
            setClientesBusca([]);
            setSearchError(e instanceof Error ? e.message : 'Erro ao buscar clientes');
        }
    }, [searchTerm, loadContasReceberDetalhado, empresaScopeIds]);

    // Sync removed to use store contasReceberDetalhadas directly

    const clientResults = useMemo(() => {
        if (!searchTerm.trim() || !hasSearched) return [];

        const uniqueClients = new Map<
            string,
            {
                id: string;
                nome: string;
                cpf: string;
                totalAberto: number;
                qtdAberto: number;
                totalPago: number;
                qtdPago: number;
            }
        >();

        clientesBusca.forEach((c) => {
            uniqueClients.set(c.id, {
                id: c.id,
                nome: c.nome,
                cpf: c.cpf || '',
                totalAberto: 0,
                qtdAberto: 0,
                totalPago: 0,
                qtdPago: 0,
            });
        });

        contasReceberDetalhadas.forEach((cr) => {
            if (!cr.cliente_id) return;
            const isOpen = ['aberto', 'vencido', 'pago_parcial'].includes(cr.status);
            const isPaid = cr.status === 'pago';
            const existing = uniqueClients.get(cr.cliente_id);
            if (existing) {
                if (isOpen) {
                    existing.totalAberto += cr.valor_aberto_centavos;
                    existing.qtdAberto += 1;
                }
                if (isPaid) {
                    existing.totalPago += cr.valor_pago_centavos;
                    existing.qtdPago += 1;
                }
            } else {
                uniqueClients.set(cr.cliente_id, {
                    id: cr.cliente_id,
                    nome: cr.cliente_nome,
                    cpf: cr.cliente_cpf || '',
                    totalAberto: isOpen ? cr.valor_aberto_centavos : 0,
                    qtdAberto: isOpen ? 1 : 0,
                    totalPago: isPaid ? cr.valor_pago_centavos : 0,
                    qtdPago: isPaid ? 1 : 0,
                });
            }
        });

        return Array.from(uniqueClients.values()).sort((a, b) =>
            a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
        );
    }, [contasReceberDetalhadas, clientesBusca, searchTerm, hasSearched]);

    const resetBuscaCliente = () => {
        setSearchTerm('');
        setHasSearched(false);
        setClientesBusca([]);
        setSearchError('');
        setSelectedClienteId(null);
        setSelectedClienteNome('');
        setSelectedClienteCpf('');
        setSelectedIds(new Set());
        setReimprimirSelectedIds(new Set());
        setReceiptData(null);
        setErrorMsg('');
    };

    const switchMainTab = (tab: MainTab) => {
        setMainTab(tab);
        setView('search');
        resetBuscaCliente();
    };

    // ==================== SELECT CLIENT ====================
    const handleSelectClient = async (clienteId: string, nome: string, cpf: string) => {
        setSelectedClienteId(clienteId);
        setSelectedClienteNome(nome);
        setSelectedClienteCpf(cpf);
        await loadContasReceberDetalhado({ cliente_id: clienteId });

        if (mainTab === 'reimprimir') {
            setReimprimirSelectedIds(new Set());
            setView('reimprimir_parcelas');
            return;
        }

        try {
            const credito = await getCreditoCliente(empresaId, clienteId);
            setCreditoClienteCentavos(credito);
            setValorDesconto((credito / 100).toFixed(2));
            setMotivoDesconto(credito > 0 ? 'Crédito automático para próxima parcela' : '');
        } catch {
            setCreditoClienteCentavos(0);
            setValorDesconto('');
            setMotivoDesconto('');
        }
        setSelectedIds(new Set());
        setView('parcelas');
    };

    // Client installments
    const clienteParcelas = useMemo(() => {
        if (!selectedClienteId) return [];
        return contasReceberDetalhadas
            .filter(cr => cr.cliente_id === selectedClienteId && ['aberto', 'vencido', 'pago_parcial'].includes(cr.status))
            .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
    }, [contasReceberDetalhadas, selectedClienteId]);

    const clienteParcelasPagas = useMemo(() => {
        if (!selectedClienteId) return [];
        return contasReceberDetalhadas
            .filter((cr) => cr.cliente_id === selectedClienteId && cr.status === 'pago')
            .sort((a, b) => {
                const da = b.data_pagamento || b.data_vencimento;
                const db = a.data_pagamento || a.data_vencimento;
                return da.localeCompare(db);
            });
    }, [contasReceberDetalhadas, selectedClienteId]);

    const totalReimprimirSelecionado = useMemo(() => {
        return clienteParcelasPagas
            .filter((p) => reimprimirSelectedIds.has(p.id))
            .reduce((s, p) => s + p.valor_pago_centavos, 0);
    }, [clienteParcelasPagas, reimprimirSelectedIds]);

    const toggleReimprimirSelect = (id: string) => {
        setReimprimirSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllReimprimir = () => {
        if (reimprimirSelectedIds.size === clienteParcelasPagas.length) {
            setReimprimirSelectedIds(new Set());
        } else {
            setReimprimirSelectedIds(new Set(clienteParcelasPagas.map((p) => p.id)));
        }
    };

    const handleReimprimirRecibo = async () => {
        const parcelas = clienteParcelasPagas.filter((p) => reimprimirSelectedIds.has(p.id));
        if (parcelas.length === 0) {
            showToast('Selecione ao menos uma parcela paga.', 'warning');
            return;
        }
        setReimprimindo(true);
        try {
            const meta = await carregarMetadadosBaixaRecibo(parcelas[0].id);
            const valorTotal = parcelas.reduce((s, p) => s + p.valor_pago_centavos, 0);
            const valorDesconto = parcelas.reduce((s, p) => s + p.valor_desconto_centavos, 0);
            await montarEExibirRecibo(
                parcelas,
                {
                    valorTotal,
                    valorPago: valorTotal,
                    valorDesconto,
                    troco: 0,
                    formaNome: meta.formaNome,
                    contaNome: meta.contaNome,
                    saldoGerado: 0,
                    creditoProximaParcela: 0,
                    dataPagamento: meta.dataPagamento,
                },
                { reimpressao: true },
            );
        } catch (e) {
            console.error('[BaixaParcelas] reimpressão:', e);
            showToast(
                e instanceof Error ? e.message : 'Erro ao montar recibo para reimpressão.',
                'error',
            );
        } finally {
            setReimprimindo(false);
        }
    };

    // ==================== SELECTION ====================
    const toggleSelect = (id: string) => {
        const targetIndex = clienteParcelas.findIndex(p => p.id === id);
        if (targetIndex === -1) return;

        setSelectedIds(prev => {
            const next = new Set(prev);
            const isSelecting = !next.has(id);

            if (isSelecting) {
                // Verificar se há alguma parcela anterior que não está selecionada
                for (let i = 0; i < targetIndex; i++) {
                    if (!next.has(clienteParcelas[i].id)) {
                        const vencFormated = new Date(clienteParcelas[i].data_vencimento + 'T12:00:00')
                            .toLocaleDateString('pt-BR');
                        alert(`Não é permitido selecionar esta parcela, pois a parcela com vencimento em ${vencFormated} anterior está em aberto e precisa ser paga primeiro.`);
                        return prev;
                    }
                }
                next.add(id);
            } else {
                // Ao desmarcar, desmarca todas as posteriores
                next.delete(id);
                for (let i = targetIndex + 1; i < clienteParcelas.length; i++) {
                    next.delete(clienteParcelas[i].id);
                }
            }
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === clienteParcelas.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(clienteParcelas.map(p => p.id)));
        }
    };

    const selectedParcelas = useMemo(() =>
        clienteParcelas.filter(p => selectedIds.has(p.id)),
        [clienteParcelas, selectedIds]
    );

    const totalSelecionado = useMemo(() =>
        selectedParcelas.reduce((s, p) => s + p.valor_aberto_centavos, 0),
        [selectedParcelas]
    );

    // ==================== PAYMENT CALCULATIONS ====================
    const valorPago1Centavos = Math.round(parseFloat(valorPago1 || '0') * 100);
    const valorPago2Centavos = Math.round(parseFloat(valorPago2 || '0') * 100);

    const valorPagoCentavos = isSplit
        ? valorPago1Centavos + valorPago2Centavos
        : Math.round(parseFloat(valorPago || '0') * 100);

    const valorDescontoCentavos = Math.round(parseFloat(valorDesconto || '0') * 100);
    const totalComDesconto = totalSelecionado - valorDescontoCentavos;
    const creditoProximaParcelaCentavos = valorPagoCentavos > totalComDesconto ? valorPagoCentavos - totalComDesconto : 0;
    const valorPagoProcessadoCentavos = Math.min(valorPagoCentavos, Math.max(0, totalComDesconto));
    const saldoNaoPagoCentavos = totalComDesconto > valorPagoProcessadoCentavos ? totalComDesconto - valorPagoProcessadoCentavos : 0;
    const troco = 0;

    // Auto-fill valor pago when selection changes
    useEffect(() => {
        if (selectedIds.size > 0) {
            const total = (totalSelecionado - valorDescontoCentavos) / 100;
            if (isSplit) {
                const val1 = parseFloat(valorPago1 || '0');
                const rest = Math.max(0, total - val1);
                setValorPago2(rest.toFixed(2));
            } else {
                setValorPago(total > 0 ? total.toFixed(2) : '0.00');
            }
        }
    }, [totalSelecionado, valorDescontoCentavos, isSplit]);

    const selectedForma = formasPagamento.find(f => f.id === formaPagamentoId);
    const selectedConta = contasOperaveis.find(c => c.id === contaBancariaId);
    const formaTipoNormalizada = String(selectedForma?.tipo || selectedForma?.nome || '').toLowerCase();
    const pagamentoEmEspecie = ['dinheiro', 'especie', 'espécie'].includes(formaTipoNormalizada);
    const pagamentoPix = formaTipoNormalizada.includes('pix');
    const selectedForma2 = formasPagamento.find((f) => f.id === formaPagamentoId2);
    const formaTipoNormalizada2 = String(selectedForma2?.tipo || selectedForma2?.nome || '').toLowerCase();
    const pagamentoPix2 = formaTipoNormalizada2.includes('pix');

    const resolverContaPorId = useCallback(
        (contaId: string) =>
            contasOperaveis.find((c) => c.id === contaId)
            || contasBancarias.find((c) => c.id === contaId)
            || null,
        [contasOperaveis, contasBancarias],
    );

    /** Abre automaticamente o caixa na(s) conta(s) de destino selecionada(s). */
    const ensureContasDestinoNaBaixa = useCallback(
        async (contaIds: string[]): Promise<{ ok: true } | { ok: false; errorMsg: string }> => {
            const dia = dataBaixa || dataHojeIsoLocal();
            const contas = [...new Set(contaIds.map((id) => id.trim()).filter(Boolean))]
                .map((id) => resolverContaPorId(id))
                .filter(Boolean)
                .map((c) => ({ id: c!.id, nome: c!.nome, tipo: c!.tipo }));

            return ensureContasDestinoBaixa({
                contas,
                dataPagamento: dia,
                usuarioId: user?.id,
                observacaoPrefixo: 'Sessão retroativa — baixa de parcelas',
            });
        },
        [dataBaixa, resolverContaPorId, user?.id],
    );

    const verificarEGerarProximasParcelas = useCallback(
        async (parcelasPagas: ContaReceberDetalhada[]) => {
            try {
                const uniqueAssinaturaIds = Array.from(
                    new Set(parcelasPagas.map((p) => p.assinatura_id).filter(Boolean)),
                ) as string[];

                for (const assId of uniqueAssinaturaIds) {
                    await sincronizarParcelasAssinatura(assId, gerarMensalidadesMes);
                }

                if (uniqueAssinaturaIds.length > 0 && selectedClienteId) {
                    await loadContasReceberDetalhado({ cliente_id: selectedClienteId });
                }
            } catch (err) {
                console.error('[BaixaParcelas] Erro ao verificar/gerar próximas mensalidades:', err);
            }
        },
        [selectedClienteId, loadContasReceberDetalhado, gerarMensalidadesMes],
    );

    // ==================== SUBMIT ====================
    const handleSubmit = async () => {
        if (selectedParcelas.length === 0) return;

        // Garantir ordem cronológica contígua de parcelas
        const selectedCount = selectedParcelas.length;
        for (let i = 0; i < selectedCount; i++) {
            if (!selectedIds.has(clienteParcelas[i].id)) {
                setErrorMsg('Não é permitido pular parcelas. Por favor, selecione as parcelas na ordem cronológica (a mais antiga primeiro).');
                return;
            }
        }
        if (isSplit) {
            if (!formaPagamentoId || !formaPagamentoId2 || !contaBancariaId || !contaBancariaId2) {
                setErrorMsg('Selecione ambas as formas de pagamento e contas destino.');
                return;
            }
        } else {
            if (!formaPagamentoId || !contaBancariaId) {
                setErrorMsg('Selecione a forma de pagamento e o destino.');
                return;
            }
        }
        if (valorPagoCentavos <= 0) {
            setErrorMsg('Informe o valor pago.');
            return;
        }
        const valorCarteiraCentavos = Math.round(parseFloat(valorCarteira || '0') * 100);
        if (criarRecebimentoCarteira && valorCarteiraCentavos <= 0) {
            setErrorMsg('Informe o valor do novo recebimento em carteira.');
            return;
        }
        if (criarRecebimentoCarteira && !vencimentoCarteira) {
            setErrorMsg('Informe o vencimento do novo recebimento em carteira.');
            return;
        }
        const validarPermissaoConta = (contaId: string): boolean => {
            const conta = contasBancarias.find((c) => c.id === contaId);
            if (!conta) return true;
            if (!usuarioPodeOperarConta(conta, user?.id, verTodosCaixas)) {
                setErrorMsg(
                    `Você não está autorizado a baixar na conta "${conta.nome}". Peça ao gestor para vincular seu usuário em Contas Bancárias → Operadores do caixa.`,
                );
                return false;
            }
            return true;
        };
        if (!validarPermissaoConta(contaBancariaId)) return;
        if (isSplit && !validarPermissaoConta(contaBancariaId2)) return;
        if (contasOperaveis.length === 0) {
            setErrorMsg('Nenhuma conta disponível para baixa. Verifique suas permissões em Contas Bancárias.');
            return;
        }

        const erroPix = isSplit
            ? validarPixPagador(pagamentoPix, pixPagador) || validarPixPagador(pagamentoPix2, pixPagador2)
            : validarPixPagador(pagamentoPix, pixPagador);
        if (erroPix) {
            setErrorMsg(erroPix);
            return;
        }

        setProcessing(true);
        setErrorMsg('');

        try {
            const totalBaixaCentavos = Math.max(0, valorPagoProcessadoCentavos);
            const hoje = dataBaixa || dataHojeIsoLocal();
            let saldoGeradoCentavos = 0;
            const descontoManualTotalCentavos = Math.round(parseFloat(valorDesconto || '0') * 100);
            const creditoAplicadoCentavos = Math.min(creditoClienteCentavos, descontoManualTotalCentavos);

            if (isSplit) {
                const totalBaixa1Centavos = Math.max(0, valorPago1Centavos);
                const totalBaixa2Centavos = Math.max(0, valorPago2Centavos);

                const selectedForma2 = formasPagamento.find(f => f.id === formaPagamentoId2);
                const selectedConta2 = contasOperaveis.find(c => c.id === contaBancariaId2);
                const formaTipoNormalizada2 = String(selectedForma2?.tipo || selectedForma2?.nome || '').toLowerCase();
                const pagamentoEmEspecie2 = ['dinheiro', 'especie', 'espécie'].includes(formaTipoNormalizada2);
                const pagamentoPix2 = formaTipoNormalizada2.includes('pix');

                const caixaSplit = await ensureContasDestinoNaBaixa([contaBancariaId, contaBancariaId2]);
                if (caixaSplit.ok === false) {
                    setErrorMsg(caixaSplit.errorMsg);
                    return;
                }

                let descontoRestante = valorDescontoCentavos;
                const totalAberto = selectedParcelas.reduce((s, p) => s + p.valor_aberto_centavos, 0);

                let valorRestantePago1 = totalBaixa1Centavos;
                let valorRestantePago2 = totalBaixa2Centavos;

                for (let i = 0; i < selectedParcelas.length; i++) {
                    const parcela = selectedParcelas[i];
                    const descontoParcela = i === selectedParcelas.length - 1
                        ? descontoRestante
                        : Math.round((parcela.valor_aberto_centavos / totalAberto) * valorDescontoCentavos);
                    descontoRestante -= descontoParcela;

                    const valorEfetivoInicial = Math.max(0, parcela.valor_aberto_centavos - descontoParcela);

                    // Distribute portion 1
                    const valorPago1Parcela = Math.min(valorRestantePago1, valorEfetivoInicial);
                    valorRestantePago1 -= valorPago1Parcela;
                    const valorEfetivoRestante = valorEfetivoInicial - valorPago1Parcela;

                    // Distribute portion 2
                    const valorPago2Parcela = Math.min(valorRestantePago2, valorEfetivoRestante);
                    valorRestantePago2 -= valorPago2Parcela;
                    const saldoParcela = Math.max(0, valorEfetivoRestante - valorPago2Parcela);

                    // Call backend for Part 1
                    if (valorPago1Parcela > 0) {
                        const params1: BaixarContaReceberParams = {
                            conta_receber_id: parcela.id,
                            valor_pago_centavos: valorPago1Parcela,
                            forma_pagamento_id: formaPagamentoId,
                            conta_bancaria_id: contaBancariaId,
                            valor_desconto_centavos: 0,
                            observacoes: `${observacoes || ''} (Parte 1/2 - Split)`.trim(),
                            data_pagamento: hoje,
                            ...pixPagadorParaBaixa(pagamentoPix, pixPagador),
                        };
                        const result1 = await baixarContaReceber(params1);
                        if (!result1) throw new Error('Falha ao processar pagamento da Parte 1');
                    }

                    // Call backend for Part 2
                    const descontoTecnicoParcela = descontoParcela + saldoParcela;
                    if (valorPago2Parcela > 0 || descontoTecnicoParcela > 0) {
                        const params2: BaixarContaReceberParams = {
                            conta_receber_id: parcela.id,
                            valor_pago_centavos: valorPago2Parcela,
                            forma_pagamento_id: formaPagamentoId2,
                            conta_bancaria_id: contaBancariaId2,
                            valor_desconto_centavos: descontoTecnicoParcela,
                            observacoes: `${observacoes || ''} (Parte 2/2 - Split)`.trim(),
                            data_pagamento: hoje,
                            ...pixPagadorParaBaixa(pagamentoPix2, pixPagador2),
                        };
                        const result2 = await baixarContaReceber(params2);
                        if (!result2) throw new Error('Falha ao processar pagamento da Parte 2');
                    }

                    if (saldoParcela > 0 && selectedClienteId) {
                        saldoGeradoCentavos += saldoParcela;
                        await criarContaReceber({
                            cliente_id: selectedClienteId,
                            tipo_documento: 'outro',
                            descricao: `Saldo remanescente automático da parcela ${parcela.codigo}`,
                            valor_original_centavos: saldoParcela,
                            valor_juros_centavos: 0,
                            valor_multa_centavos: 0,
                            valor_desconto_centavos: 0,
                            valor_total_centavos: saldoParcela,
                            valor_pago_centavos: 0,
                            valor_aberto_centavos: saldoParcela,
                            data_emissao: hoje,
                            data_vencimento: parcela.data_vencimento || hoje,
                            data_competencia: hoje,
                            status: 'aberto',
                            parcela_numero: 1,
                            total_parcelas: 1,
                        });
                    }

                    // Extrato bancário para PIX na conta principal (conciliação)
                    const contaConciliacao = resolverContaPrincipal(contasOperaveis, user?.id, verTodosCaixas);
                    if (valorPago1Parcela > 0 && pagamentoPix && contaConciliacao) {
                            const fitid = `PIX-${parcela.id}-${Date.now()}-${i}-1`;
                            await supabase.from('fin_extratos_bancarios').insert({
                                empresa_id: contaConciliacao.empresa_id,
                                conta_bancaria_id: contaConciliacao.id,
                                data_lancamento: hoje,
                                data_balancete: hoje,
                                tipo: 'credito',
                                valor_centavos: valorPago1Parcela,
                                descricao: `PIX recebido Parte 1/2 - parcela ${parcela.codigo} - ${selectedClienteNome}${sufixoDescricaoPixExtrato(pixPagador)}`,
                                memo: 'Recebimento PIX pendente de conciliação bancária',
                                numero_referencia: parcela.codigo || parcela.id,
                                fitid,
                                conciliado: false,
                            });
                    }

                    if (valorPago2Parcela > 0 && pagamentoPix2 && contaConciliacao) {
                            const fitid = `PIX-${parcela.id}-${Date.now()}-${i}-2`;
                            await supabase.from('fin_extratos_bancarios').insert({
                                empresa_id: contaConciliacao.empresa_id,
                                conta_bancaria_id: contaConciliacao.id,
                                data_lancamento: hoje,
                                data_balancete: hoje,
                                tipo: 'credito',
                                valor_centavos: valorPago2Parcela,
                                descricao: `PIX recebido Parte 2/2 - parcela ${parcela.codigo} - ${selectedClienteNome}${sufixoDescricaoPixExtrato(pixPagador2)}`,
                                memo: 'Recebimento PIX pendente de conciliação bancária',
                                numero_referencia: parcela.codigo || parcela.id,
                                fitid,
                                conciliado: false,
                            });
                    }
                }

                if (criarRecebimentoCarteira && selectedClienteId) {
                    await criarContaReceber({
                        cliente_id: selectedClienteId,
                        tipo_documento: 'outro',
                        descricao: (descricaoCarteira || 'Novo recebimento em carteira gerado na baixa de parcelas').trim(),
                        valor_original_centavos: valorCarteiraCentavos,
                        valor_juros_centavos: 0,
                        valor_multa_centavos: 0,
                        valor_desconto_centavos: 0,
                        valor_total_centavos: valorCarteiraCentavos,
                        valor_pago_centavos: 0,
                        valor_aberto_centavos: valorCarteiraCentavos,
                        data_emissao: hoje,
                        data_vencimento: vencimentoCarteira,
                        data_competencia: hoje,
                        status: 'aberto',
                        parcela_numero: 1,
                        total_parcelas: 1,
                    });
                }
                if (creditoProximaParcelaCentavos > 0 && selectedClienteId) {
                    await addCreditoCliente(empresaId, selectedClienteId, creditoProximaParcelaCentavos);
                }
                if (selectedClienteId && creditoAplicadoCentavos > 0) {
                    await consumeCreditoCliente(empresaId, selectedClienteId, creditoAplicadoCentavos);
                }

                // Verificar e gerar as parcelas subsequentes se tudo foi pago
                await verificarEGerarProximasParcelas(selectedParcelas);

                await montarEExibirRecibo(selectedParcelas, {
                    valorTotal: totalSelecionado,
                    valorPago: valorPagoProcessadoCentavos,
                    valorDesconto: valorDescontoCentavos,
                    troco,
                    formaNome: `${selectedForma?.nome || ''} + ${selectedForma2?.nome || ''} (Dividido)`,
                    contaNome: `${selectedConta?.nome || ''} / ${selectedConta2?.nome || ''}`,
                    saldoGerado: saldoGeradoCentavos || saldoNaoPagoCentavos,
                    creditoProximaParcela: creditoProximaParcelaCentavos,
                    dataPagamento: hoje,
                });
            } else {
                // Standard single payment flow
                const totalBaixaCentavos = Math.max(0, valorPagoProcessadoCentavos);
                const caixa = await ensureContasDestinoNaBaixa([contaBancariaId]);
                if (caixa.ok === false) {
                    setErrorMsg(caixa.errorMsg);
                    return;
                }

                let descontoRestante = valorDescontoCentavos;
                const totalAberto = selectedParcelas.reduce((s, p) => s + p.valor_aberto_centavos, 0);

                let valorRestanteParaBaixar = totalBaixaCentavos;

                for (let i = 0; i < selectedParcelas.length; i++) {
                    const parcela = selectedParcelas[i];
                    const descontoParcela = i === selectedParcelas.length - 1
                        ? descontoRestante
                        : Math.round((parcela.valor_aberto_centavos / totalAberto) * valorDescontoCentavos);
                    descontoRestante -= descontoParcela;

                    const valorEfetivo = Math.max(0, parcela.valor_aberto_centavos - descontoParcela);
                    const valorPagoParcela = Math.min(valorRestanteParaBaixar, valorEfetivo);
                    valorRestanteParaBaixar -= valorPagoParcela;
                    const saldoParcela = Math.max(0, valorEfetivo - valorPagoParcela);
                    const descontoTecnicoParcela = descontoParcela + saldoParcela;
                    const params: BaixarContaReceberParams = {
                        conta_receber_id: parcela.id,
                        valor_pago_centavos: valorPagoParcela,
                        forma_pagamento_id: formaPagamentoId,
                        conta_bancaria_id: contaBancariaId,
                        valor_desconto_centavos: descontoTecnicoParcela,
                        observacoes: observacoes || undefined,
                        data_pagamento: hoje,
                        ...pixPagadorParaBaixa(pagamentoPix, pixPagador),
                    };
                    const result = await baixarContaReceber(params);
                    if (!result) throw new Error('Falha ao processar pagamento');

                    if (saldoParcela > 0 && selectedClienteId) {
                        saldoGeradoCentavos += saldoParcela;
                        await criarContaReceber({
                            cliente_id: selectedClienteId,
                            tipo_documento: 'outro',
                            descricao: `Saldo remanescente automático da parcela ${parcela.codigo}`,
                            valor_original_centavos: saldoParcela,
                            valor_juros_centavos: 0,
                            valor_multa_centavos: 0,
                            valor_desconto_centavos: 0,
                            valor_total_centavos: saldoParcela,
                            valor_pago_centavos: 0,
                            valor_aberto_centavos: saldoParcela,
                            data_emissao: hoje,
                            data_vencimento: parcela.data_vencimento || hoje,
                            data_competencia: hoje,
                            status: 'aberto',
                            parcela_numero: 1,
                            total_parcelas: 1,
                        });
                    }

                    if (pagamentoPix && valorPagoParcela > 0) {
                        const contaConciliacao = resolverContaPrincipal(contasOperaveis, user?.id, verTodosCaixas);
                        if (contaConciliacao) {
                            const fitid = `PIX-${parcela.id}-${Date.now()}-${i}`;
                            await supabase.from('fin_extratos_bancarios').insert({
                                empresa_id: contaConciliacao.empresa_id,
                                conta_bancaria_id: contaConciliacao.id,
                                data_lancamento: hoje,
                                data_balancete: hoje,
                                tipo: 'credito',
                                valor_centavos: valorPagoParcela,
                                descricao: `PIX recebido - parcela ${parcela.codigo} - ${selectedClienteNome}${sufixoDescricaoPixExtrato(pixPagador)}`,
                                memo: 'Recebimento PIX pendente de conciliação bancária',
                                numero_referencia: parcela.codigo || parcela.id,
                                fitid,
                                conciliado: false,
                            });
                        }
                    }
                }

                if (criarRecebimentoCarteira && selectedClienteId) {
                    await criarContaReceber({
                        cliente_id: selectedClienteId,
                        tipo_documento: 'outro',
                        descricao: (descricaoCarteira || 'Novo recebimento em carteira gerado na baixa de parcelas').trim(),
                        valor_original_centavos: valorCarteiraCentavos,
                        valor_juros_centavos: 0,
                        valor_multa_centavos: 0,
                        valor_desconto_centavos: 0,
                        valor_total_centavos: valorCarteiraCentavos,
                        valor_pago_centavos: 0,
                        valor_aberto_centavos: valorCarteiraCentavos,
                        data_emissao: hoje,
                        data_vencimento: vencimentoCarteira,
                        data_competencia: hoje,
                        status: 'aberto',
                        parcela_numero: 1,
                        total_parcelas: 1,
                    });
                }
                if (creditoProximaParcelaCentavos > 0 && selectedClienteId) {
                    await addCreditoCliente(empresaId, selectedClienteId, creditoProximaParcelaCentavos);
                }
                if (selectedClienteId && creditoAplicadoCentavos > 0) {
                    await consumeCreditoCliente(empresaId, selectedClienteId, creditoAplicadoCentavos);
                }

                // Verificar e gerar as parcelas subsequentes se tudo foi pago
                await verificarEGerarProximasParcelas(selectedParcelas);

                await montarEExibirRecibo(selectedParcelas, {
                    valorTotal: totalSelecionado,
                    valorPago: valorPagoProcessadoCentavos,
                    valorDesconto: valorDescontoCentavos,
                    troco,
                    formaNome: selectedForma?.nome || '',
                    contaNome: selectedConta?.nome || '',
                    saldoGerado: saldoGeradoCentavos || saldoNaoPagoCentavos,
                    creditoProximaParcela: creditoProximaParcelaCentavos,
                    dataPagamento: hoje,
                });
            }
        } catch {
            setErrorMsg('Erro ao processar o(s) pagamento(s). Tente novamente.');
        } finally {
            setProcessing(false);
        }
    };

    // ==================== RESET ====================
    const handleNewBaixa = () => {
        const tabAtual = mainTab;
        setView('search');
        resetBuscaCliente();
        setValorPago('');
        setValorDesconto('');
        setMotivoDesconto('');
        setObservacoes('');
        setCriarRecebimentoCarteira(false);
        setValorCarteira('');
        setVencimentoCarteira(dataHojeIsoLocal());
        setDescricaoCarteira('');
        setCreditoClienteCentavos(0);
        setIsSplit(false);
        setFormaPagamentoId2('');
        setContaBancariaId2('');
        setValorPago1('');
        setValorPago2('');
        setMainTab(tabAtual);
    };

    const renderMainTabs = () => (
        <div className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl w-full sm:w-fit">
            <button
                type="button"
                onClick={() => switchMainTab('baixa')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    mainTab === 'baixa'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 dark:text-slate-100'
                }`}
            >
                <DollarSign className="h-4 w-4" />
                Baixa de parcelas
            </button>
            <button
                type="button"
                onClick={() => switchMainTab('reimprimir')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    mainTab === 'reimprimir'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 dark:text-slate-100'
                }`}
            >
                <History className="h-4 w-4" />
                Reimprimir recibo
            </button>
        </div>
    );

    // ==================== RECEIPT VIEW ====================
    if (view === 'receipt' && receiptData) {
        return (
            <div className="space-y-6">
                <div className="no-print">
                    <PageHeader
                        title="Baixa de Parcelas"
                        subtitle={receiptData.reimpressao ? 'Reimpressão de recibo' : 'Comprovante de Pagamento'}
                    />
                </div>

                <div className="max-w-lg mx-auto print:max-w-none print:m-0 print:w-full">
                    <Card className="overflow-hidden shadow-xl print:shadow-none print:border-0 print:m-0">
                        {/* Print Header */}
                        <div className="hidden print:block text-center p-8 border-b-2 border-gray-100">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Fênix Funerária</h2>
                            <p className="text-sm text-gray-500 uppercase tracking-widest mt-1">Recibo de Pagamento</p>
                        </div>
                        {/* Success Header */}
                        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 text-center text-white">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                                <CheckCircle2 className="h-10 w-10 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold">
                                {receiptData.reimpressao ? 'Recibo para reimpressão' : 'Pagamento Confirmado!'}
                            </h2>
                            <p className="text-green-100 mt-2">
                                {receiptData.reimpressao
                                    ? `${receiptData.parcelas} parcela(s) selecionada(s)`
                                    : `${receiptData.parcelas} parcela(s) baixada(s) com sucesso`}
                            </p>
                        </div>

                        {/* Receipt Details */}
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3 pb-4 border-b">
                                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                                    {receiptData.clienteNome.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900 dark:text-slate-100">{receiptData.clienteNome}</p>
                                    <p className="text-sm text-gray-500">{new Date().toLocaleString('pt-BR')}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Parcelas baixadas</span>
                                    <span className="font-medium">{receiptData.parcelas}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Valor total</span>
                                    <span className="font-medium">{formatCentavos(receiptData.valorTotal)}</span>
                                </div>
                                {receiptData.valorDesconto > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Desconto</span>
                                        <span className="font-medium text-green-600">-{formatCentavos(receiptData.valorDesconto)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Forma de pagamento</span>
                                    <span className="font-medium">{receiptData.formaNome}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Conta destino</span>
                                    <span className="font-medium">{receiptData.contaNome}</span>
                                </div>

                                <div className="border-t pt-3 mt-3">
                                    <div className="flex justify-between items-center">
                                        <span className="font-semibold text-gray-900 dark:text-slate-100">Valor Pago</span>
                                        <span className="text-2xl font-bold text-green-600">{formatCentavos(receiptData.valorPago)}</span>
                                    </div>
                                    {receiptData.saldoGerado > 0 && (
                                        <div className="flex justify-between items-center mt-2 bg-blue-50 rounded-lg p-3">
                                            <span className="font-semibold text-blue-800">Novo saldo gerado</span>
                                            <span className="text-lg font-bold text-blue-700">{formatCentavos(receiptData.saldoGerado)}</span>
                                        </div>
                                    )}
                                    {receiptData.creditoProximaParcela > 0 && (
                                        <div className="flex justify-between items-center mt-2 bg-green-50 rounded-lg p-3">
                                            <span className="font-semibold text-green-800">Crédito próxima parcela</span>
                                            <span className="text-lg font-bold text-green-700">{formatCentavos(receiptData.creditoProximaParcela)}</span>
                                        </div>
                                    )}
                                    {receiptData.troco > 0 && (
                                        <div className="flex justify-between items-center mt-2 bg-amber-50 rounded-lg p-3">
                                            <span className="font-semibold text-amber-800">Troco</span>
                                            <span className="text-lg font-bold text-amber-700">{formatCentavos(receiptData.troco)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Print Footer / Signatures */}
                        <div className="hidden print:block mt-16 px-6">
                            <div className="flex justify-between items-end gap-20">
                                <div className="flex-1 border-t border-gray-400 pt-2 text-center">
                                    <p className="text-xs font-medium text-gray-600">Assinatura do Cliente</p>
                                </div>
                                <div className="flex-1 border-t border-gray-400 pt-2 text-center">
                                    <p className="text-xs font-medium text-gray-600">Representante Fênix</p>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-400 text-center mt-12 italic">
                                Comprovante gerado em {new Date().toLocaleString('pt-BR')} pelo sistema Fênix Funerária.
                            </p>
                        </div>

                        {/* Actions — impressão manual (atendente); cobrador em campo usa outro fluxo */}
                        <div className="p-4 sm:p-6 border-t bg-gray-50 no-print space-y-3">
                            <p className="text-sm text-gray-600 text-center">
                                Impressora do financeiro: Bematech MP-4200 TH (bobina 80 mm). Escolha abaixo como
                                imprimir — não imprime automaticamente.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Button
                                    variant="outline"
                                    className="w-full h-auto min-h-[2.75rem] py-2.5 px-3"
                                    loading={printandoRecibo}
                                    disabled={!receiptData.reciboTermico && !receiptData.reciboBaixaInput}
                                    onClick={() => {
                                        void (async () => {
                                            setPrintandoRecibo(true);
                                            try {
                                                if (receiptData.reciboTermico) {
                                                    const ok = imprimirReciboTermico(
                                                        receiptData.reciboTermico,
                                                        loadReciboTermicoConfigFinanceiro(),
                                                    );
                                                    if (!ok) {
                                                        showToast(
                                                            'Permita pop-ups do navegador para imprimir na térmica.',
                                                            'warning',
                                                        );
                                                    }
                                                } else if (receiptData.reciboBaixaInput) {
                                                    await imprimirReciboTermicoBaixaInteligente(
                                                        receiptData.reciboBaixaInput,
                                                    );
                                                } else {
                                                    showToast('Dados do recibo indisponíveis.', 'error');
                                                }
                                            } catch (e) {
                                                console.error('[BaixaParcelas] térmica:', e);
                                                showToast(
                                                    e instanceof Error
                                                        ? e.message
                                                        : 'Erro ao imprimir recibo térmico.',
                                                    'error',
                                                );
                                            } finally {
                                                setPrintandoRecibo(false);
                                            }
                                        })();
                                    }}
                                >
                                    <span className="inline-flex items-center justify-center gap-2 w-full">
                                        <Printer className="h-4 w-4 shrink-0" aria-hidden />
                                        <span className="text-xs sm:text-sm leading-snug">Recibo térmica</span>
                                    </span>
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full h-auto min-h-[2.75rem] py-2.5 px-3"
                                    loading={printandoRecibo}
                                    onClick={() => {
                                        void (async () => {
                                            const janelaPdf = reservarJanelaImpressaoPdf();
                                            if (!janelaPdf) {
                                                showToast(
                                                    'Permita pop-ups do navegador para abrir o PDF.',
                                                    'warning',
                                                );
                                                return;
                                            }
                                            setPrintandoRecibo(true);
                                            try {
                                                await generateReciboPDF(
                                                    {
                                                        numero: `REC-${Date.now()}`,
                                                        data: new Date().toLocaleDateString('pt-BR'),
                                                        clienteNome: receiptData.clienteNome,
                                                        valor: receiptData.valorPago / 100,
                                                        referencia: `Baixa de ${receiptData.parcelas} parcela(s)`,
                                                        descricao: `Pagamento via ${receiptData.formaNome}`,
                                                        vencimento: '-',
                                                        contratoCodigo: receiptData.reciboTermico?.contratoCodigo,
                                                        planoNome: receiptData.reciboTermico?.planoNome,
                                                        dataPagamento: new Date().toLocaleDateString('pt-BR'),
                                                        atendenteNome: receiptData.reciboTermico?.atendente,
                                                        formaPagamento: receiptData.formaNome,
                                                        parcelasDetalhes: receiptData.parcelasDetalhes,
                                                        empresaNome: receiptData.reciboTermico?.empresaNome,
                                                        empresaCnpj: receiptData.reciboTermico?.empresaCnpj,
                                                    },
                                                    'newtab',
                                                    janelaPdf,
                                                );
                                                if (janelaPdf.closed) {
                                                    showToast(
                                                        'Não foi possível abrir o PDF. Verifique o bloqueio de pop-ups.',
                                                        'warning',
                                                    );
                                                }
                                            } catch (e) {
                                                console.error('[BaixaParcelas] PDF:', e);
                                                if (!janelaPdf.closed) janelaPdf.close();
                                                showToast(
                                                    e instanceof Error
                                                        ? e.message
                                                        : 'Erro ao gerar recibo PDF.',
                                                    'error',
                                                );
                                            } finally {
                                                setPrintandoRecibo(false);
                                            }
                                        })();
                                    }}
                                >
                                    <span className="inline-flex items-center justify-center gap-2 w-full">
                                        <Receipt className="h-4 w-4 shrink-0" aria-hidden />
                                        <span className="text-xs sm:text-sm leading-snug">Recibo PDF (A5)</span>
                                    </span>
                                </Button>
                                <Button
                                    className="w-full h-auto min-h-[2.75rem] py-2.5 px-3"
                                    onClick={handleNewBaixa}
                                >
                                    <span className="inline-flex items-center justify-center gap-2 w-full">
                                        <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                        <span className="text-xs sm:text-sm leading-snug">
                                            {receiptData.reimpressao ? 'Nova busca' : 'Nova baixa'}
                                        </span>
                                    </span>
                                </Button>
                            </div>
                            {!receiptData.reciboTermico && receiptData.reciboBaixaInput && (
                                <p className="text-xs text-amber-700 text-center">
                                    O preview térmico será montado ao imprimir (dados do cliente salvos).
                                </p>
                            )}
                        </div>

                    </Card>
                </div>

            </div>
        );
    }

    // ==================== INSTALLMENTS VIEW ====================
    if (view === 'parcelas' && selectedClienteId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Baixa de Parcelas"
                    subtitle="Selecione as parcelas e registre o pagamento"
                    actionButton={
                        <Button variant="outline" onClick={handleNewBaixa}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Nova Busca
                        </Button>
                    }
                />

                {renderMainTabs()}

                {/* Client Card */}
                <Card className="p-5 bg-gradient-to-r from-slate-800 to-slate-900 text-white border-0">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 bg-white/15 rounded-full flex items-center justify-center text-2xl font-bold backdrop-blur-sm">
                            {selectedClienteNome.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold">{selectedClienteNome}</h3>
                            {selectedClienteCpf && (
                                <p className="text-slate-300 text-sm mt-0.5">{selectedClienteCpf}</p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-400">Parcelas em aberto</p>
                            <p className="text-2xl font-bold mt-0.5">{clienteParcelas.length}</p>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Left: Parcelas List */}
                    <div className="xl:col-span-2 space-y-4">
                        {/* Select All */}
                        <div className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size === clienteParcelas.length && clienteParcelas.length > 0}
                                    onChange={selectAll}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-gray-700">
                                    Selecionar todas ({clienteParcelas.length})
                                </span>
                            </label>
                            {selectedIds.size > 0 && (
                                <span className="text-sm font-semibold text-blue-600">
                                    {selectedIds.size} selecionada(s) • {formatCentavos(totalSelecionado)}
                                </span>
                            )}
                        </div>

                        {/* Parcelas */}
                        {clienteParcelas.length > 0 ? (
                            <div className="space-y-2">
                                {clienteParcelas.map(p => {
                                    const isSelected = selectedIds.has(p.id);
                                    const isOverdue = p.status === 'vencido';
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => toggleSelect(p.id)}
                                            className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                                                    ? 'border-blue-500 bg-blue-50/60 shadow-sm'
                                                    : isOverdue
                                                        ? 'border-red-200 bg-red-50/30 hover:border-red-300'
                                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => { }}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                            />

                                            {/* Parcela Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                                        Parcela {rotuloParcelaCobranca(p, clienteParcelas)}
                                                    </span>
                                                    <StatusFinanceiroBadge status={p.status} />
                                                    {p.dias_atraso > 0 && (
                                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                                                            <Clock className="h-3 w-3" />
                                                            {p.dias_atraso}d
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        Venc: {new Date(p.data_vencimento + 'T00:00').toLocaleDateString('pt-BR')}
                                                    </span>
                                                    <span className="font-mono">{p.codigo}</span>
                                                    <span className="capitalize">{p.tipo_documento.replace(/_/g, ' ')}</span>
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-medium">
                                                        Ref: {obterMesReferencia(p.data_vencimento)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Values */}
                                            <div className="text-right flex-shrink-0">
                                                {p.valor_pago_centavos > 0 && (
                                                    <p className="text-xs text-gray-400 line-through">
                                                        {formatCentavos(p.valor_original_centavos)}
                                                    </p>
                                                )}
                                                <p className={`text-lg font-bold ${isOverdue ? 'text-red-600' : 'text-gray-900 dark:text-slate-100'}`}>
                                                    {formatCentavos(p.valor_aberto_centavos)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <Card className="p-12 text-center">
                                <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Tudo em dia!</h3>
                                <p className="text-gray-500 mt-1">Este cliente não possui parcelas pendentes.</p>
                            </Card>
                        )}
                    </div>

                    {/* Right: Payment Panel */}
                    <div className="xl:col-span-1">
                        <Card className="sticky top-6 shadow-lg">
                            <div className="p-5 border-b bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-lg">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <DollarSign className="h-5 w-5" />
                                    Painel de Pagamento
                                </h3>
                                <p className="text-blue-100 text-sm mt-1">
                                    {selectedIds.size > 0
                                        ? `${selectedIds.size} parcela(s) selecionada(s)`
                                        : 'Selecione parcelas ao lado'}
                                </p>
                            </div>

                            <div className="p-5 space-y-5">
                                {/* Total Selected */}
                                <div className="text-center p-4 rounded-xl bg-gradient-to-br from-gray-50 to-blue-50 border">
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Selecionado</p>
                                    <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">{formatCentavos(totalSelecionado)}</p>
                                </div>

                                {/* Split Payment Toggle */}
                                <div className="flex items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-100 shadow-sm">
                                    <label className="flex items-center gap-2 cursor-pointer w-full select-none">
                                        <input
                                            type="checkbox"
                                            checked={isSplit}
                                            onChange={(e) => {
                                                setIsSplit(e.target.checked);
                                                if (e.target.checked) {
                                                    if (formasPagamento.length > 0 && !formaPagamentoId2) {
                                                        setFormaPagamentoId2(formasPagamento[1]?.id || formasPagamento[0].id);
                                                    }
                                                    if (contasOperaveis.length > 0 && !contaBancariaId2) {
                                                        const padrao = resolverContaCaixaPadrao(contasOperaveis, user?.id, verTodosCaixas);
                                                        setContaBancariaId2(padrao?.id || contasOperaveis[0].id);
                                                    }
                                                    // Split current total 50/50
                                                    const half = ((totalSelecionado - valorDescontoCentavos) / 2 / 100).toFixed(2);
                                                    setValorPago1(half);
                                                    setValorPago2(half);
                                                } else {
                                                    const totalVal = (totalSelecionado - valorDescontoCentavos) / 100;
                                                    const total = totalVal.toFixed(2);
                                                    setValorPago(totalVal > 0 ? total : '0.00');
                                                }
                                            }}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div className="flex-1">
                                            <span className="text-sm font-bold text-blue-900 block">Dividir Recebimento</span>
                                            <span className="text-[11px] text-blue-600 block mt-0.5">Baixar em 2 formas de pagamento</span>
                                        </div>
                                    </label>
                                </div>

                                {/* Payment Details (Split / Single) */}
                                {isSplit ? (
                                    <div className="space-y-4 border-l-2 border-blue-500 pl-3">
                                        {/* PARTE 1 */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">Parte 1</h4>
                                            <div>
                                                <label className="block text-[11px] font-medium text-gray-500 mb-1">Forma de Pagamento 1</label>
                                                <Select
                                                    value={formaPagamentoId}
                                                    onChange={(e) => setFormaPagamentoId(e.target.value)}
                                                >
                                                    {formasPagamento.filter(f => f.ativo).map(forma => (
                                                        <option key={forma.id} value={forma.id}>{forma.nome}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-medium text-gray-500 mb-1">Caixa / Conta destino 1</label>
                                                <Select
                                                    value={contaBancariaId}
                                                    onChange={(e) => {
                                                        contaOverriddenRef.current = true;
                                                        setContaBancariaId(e.target.value);
                                                    }}
                                                >
                                                    <option value="">Selecione...</option>
                                                    {contasOperaveis.map(conta => (
                                                        <option key={conta.id} value={conta.id}>
                                                            {conta.nome} — {formatCentavos(conta.saldo_atual_centavos)}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-medium text-gray-500 mb-1">Valor Pago Parte 1 (R$)</label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={valorPago1}
                                                    onChange={(e) => {
                                                        setValorPago1(e.target.value);
                                                        if (totalSelecionado > 0) {
                                                            const val1 = parseFloat(e.target.value || '0');
                                                            const total = (totalSelecionado - valorDescontoCentavos) / 100;
                                                            const rest = Math.max(0, total - val1);
                                                            setValorPago2(rest.toFixed(2));
                                                        }
                                                    }}
                                                    className="font-semibold text-blue-700"
                                                />
                                            </div>
                                        </div>

                                        {/* PARTE 2 */}
                                        <div className="space-y-3 pt-2 border-t border-gray-100">
                                            <h4 className="text-xs font-bold text-teal-700 uppercase tracking-wider">Parte 2</h4>
                                            <div>
                                                <label className="block text-[11px] font-medium text-gray-500 mb-1">Forma de Pagamento 2</label>
                                                <Select
                                                    value={formaPagamentoId2}
                                                    onChange={(e) => setFormaPagamentoId2(e.target.value)}
                                                >
                                                    {formasPagamento.filter(f => f.ativo).map(forma => (
                                                        <option key={forma.id} value={forma.id}>{forma.nome}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-medium text-gray-500 mb-1">Caixa / Conta destino 2</label>
                                                <Select
                                                    value={contaBancariaId2}
                                                    onChange={(e) => setContaBancariaId2(e.target.value)}
                                                >
                                                    <option value="">Selecione...</option>
                                                    {contasOperaveis.map(conta => (
                                                        <option key={conta.id} value={conta.id}>
                                                            {conta.nome} — {formatCentavos(conta.saldo_atual_centavos)}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-medium text-gray-500 mb-1">Valor Pago Parte 2 (R$)</label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={valorPago2}
                                                        onChange={(e) => setValorPago2(e.target.value)}
                                                        className="font-semibold text-teal-700 flex-1"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="px-2 py-1 text-xs whitespace-nowrap bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200"
                                                        onClick={() => {
                                                            const val1 = parseFloat(valorPago1 || '0');
                                                            const total = (totalSelecionado - valorDescontoCentavos) / 100;
                                                            const rest = Math.max(0, total - val1);
                                                            setValorPago2(rest.toFixed(2));
                                                        }}
                                                    >
                                                        Calcular Restante
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Global Discount */}
                                        <div className="pt-2 border-t border-gray-100">
                                            <label className="block text-[11px] font-medium text-gray-500 mb-1">Desconto Geral (R$)</label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={valorDesconto}
                                                onChange={(e) => setValorDesconto(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Payment Method */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Forma de Pagamento</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {formasPagamento.filter(f => f.ativo).map(forma => (
                                                    <button
                                                        key={forma.id}
                                                        type="button"
                                                        onClick={() => setFormaPagamentoId(forma.id)}
                                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 text-xs font-semibold shadow-sm cursor-pointer ${
                                                            formaPagamentoId === forma.id
                                                                ? 'border-blue-600 bg-blue-600 text-white shadow-md scale-[1.02]'
                                                                : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50 text-gray-600 bg-white'
                                                        }`}
                                                    >
                                                        <div className={`transition-transform duration-200 ${formaPagamentoId === forma.id ? 'scale-110' : ''}`}>
                                                            {formaIcons[forma.tipo] || <DollarSign className="h-5 w-5" />}
                                                        </div>
                                                        <span className="leading-tight text-center">{forma.nome}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Destination */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Caixa / Conta destino</label>
                                            <Select
                                                value={contaBancariaId}
                                                onChange={(e) => {
                                                    contaOverriddenRef.current = true;
                                                    setContaBancariaId(e.target.value);
                                                }}
                                            >
                                                <option value="">Selecione...</option>
                                                {contasOperaveis.map(conta => (
                                                    <option key={conta.id} value={conta.id}>
                                                        {conta.nome} {conta.principal ? '⭐' : ''} — {formatCentavos(conta.saldo_atual_centavos)}
                                                    </option>
                                                ))}
                                            </Select>
                                        </div>

                                        {/* Values */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor Pago (R$)</label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={valorPago}
                                                    onChange={(e) => setValorPago(e.target.value)}
                                                    className="text-lg font-semibold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Desconto (R$)</label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={valorDesconto}
                                                    onChange={(e) => setValorDesconto(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Discount Reason */}
                                {parseFloat(valorDesconto || '0') > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Motivo do Desconto</label>
                                        <Input
                                            placeholder="Ex: Acordo comercial, cortesia..."
                                            value={motivoDesconto}
                                            onChange={(e) => setMotivoDesconto(e.target.value)}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Data da baixa</label>
                                    <Input
                                        type="date"
                                        value={dataBaixa}
                                        onChange={(e) => setDataBaixa(e.target.value)}
                                    />
                                </div>

                                {isSplit ? (
                                    <>
                                        {pagamentoPix && (
                                            <PixPagadorConfirmacao
                                                visivel
                                                titularNome={selectedClienteNome}
                                                state={pixPagador}
                                                onChange={setPixPagador}
                                                idPrefix="baixa-split-pix-1"
                                            />
                                        )}
                                        {pagamentoPix2 && (
                                            <PixPagadorConfirmacao
                                                visivel
                                                titularNome={selectedClienteNome}
                                                state={pixPagador2}
                                                onChange={setPixPagador2}
                                                idPrefix="baixa-split-pix-2"
                                            />
                                        )}
                                    </>
                                ) : (
                                    <PixPagadorConfirmacao
                                        visivel={pagamentoPix}
                                        titularNome={selectedClienteNome}
                                        state={pixPagador}
                                        onChange={setPixPagador}
                                        idPrefix="baixa-pix"
                                    />
                                )}

                                {/* Notes */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Observações</label>
                                    <textarea
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                        rows={2}
                                        placeholder="Informações adicionais..."
                                        value={observacoes}
                                        onChange={(e) => setObservacoes(e.target.value)}
                                    />
                                </div>

                                <div className="border rounded-xl p-3 bg-slate-50/70 space-y-3">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                                        <input
                                            type="checkbox"
                                            checked={criarRecebimentoCarteira}
                                            onChange={(e) => setCriarRecebimentoCarteira(e.target.checked)}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        Criar novo recebimento em carteira para este cliente
                                    </label>
                                    {criarRecebimentoCarteira && (
                                        <div className="grid grid-cols-1 gap-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor (R$)</label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        value={valorCarteira}
                                                        onChange={(e) => setValorCarteira(e.target.value)}
                                                        placeholder="0,00"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Vencimento</label>
                                                    <Input
                                                        type="date"
                                                        value={vencimentoCarteira}
                                                        onChange={(e) => setVencimentoCarteira(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrição</label>
                                                <Input
                                                    value={descricaoCarteira}
                                                    onChange={(e) => setDescricaoCarteira(e.target.value)}
                                                    placeholder="Ex: Diferença de carteira / acordo complementar"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Summary */}
                                <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-4 border space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Subtotal</span>
                                        <span className="font-semibold">{formatCentavos(totalSelecionado)}</span>
                                    </div>
                                    {valorDescontoCentavos > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Desconto</span>
                                            <span className="font-semibold text-green-600">-{formatCentavos(valorDescontoCentavos)}</span>
                                        </div>
                                    )}
                                    <div className="border-t pt-2 flex justify-between items-center">
                                        <span className="font-semibold text-gray-900 dark:text-slate-100">A Cobrar</span>
                                        <span className="text-xl font-bold text-blue-600">{formatCentavos(totalComDesconto > 0 ? totalComDesconto : 0)}</span>
                                    </div>
                                    {troco > 0 && (
                                        <div className="flex justify-between items-center bg-amber-50 rounded-lg px-3 py-2 -mx-1">
                                            <span className="font-semibold text-amber-800 text-sm">Troco</span>
                                            <span className="text-lg font-bold text-amber-700">{formatCentavos(troco)}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Error */}
                                {errorMsg && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                        {errorMsg}
                                    </div>
                                )}

                                {/* Submit */}
                                <Button
                                    className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white shadow-lg py-3 text-base"
                                    onClick={handleSubmit}
                                    loading={processing}
                                    disabled={
                                        selectedIds.size === 0 ||
                                        (isSplit
                                            ? !formaPagamentoId || !formaPagamentoId2 || !contaBancariaId || !contaBancariaId2 || valorPagoCentavos <= 0
                                            : !formaPagamentoId || !contaBancariaId || valorPagoCentavos <= 0)
                                    }
                                >
                                    <CheckCircle2 className="h-5 w-5 mr-2" />
                                    Confirmar Baixa
                                </Button>
                            </div>
                        </Card>
                    </div>
                </div>

            </div>
        );
    }

    // ==================== REPRINT VIEW ====================
    if (view === 'reimprimir_parcelas' && selectedClienteId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Baixa de Parcelas"
                    subtitle="Selecione parcelas pagas para reimprimir o recibo"
                    actionButton={
                        <Button variant="outline" onClick={handleNewBaixa}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Nova Busca
                        </Button>
                    }
                />

                {renderMainTabs()}

                <Card className="p-5 bg-gradient-to-r from-slate-800 to-slate-900 text-white border-0">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 bg-white/15 rounded-full flex items-center justify-center text-2xl font-bold backdrop-blur-sm">
                            {selectedClienteNome.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold">{selectedClienteNome}</h3>
                            {selectedClienteCpf && (
                                <p className="text-slate-300 text-sm mt-0.5">{selectedClienteCpf}</p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-400">Parcelas pagas</p>
                            <p className="text-2xl font-bold mt-0.5">{clienteParcelasPagas.length}</p>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 space-y-4">
                        {clienteParcelasPagas.length > 0 ? (
                            <>
                                <div className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm border">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={
                                                reimprimirSelectedIds.size === clienteParcelasPagas.length
                                                && clienteParcelasPagas.length > 0
                                            }
                                            onChange={selectAllReimprimir}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">
                                            Selecionar todas ({clienteParcelasPagas.length})
                                        </span>
                                    </label>
                                    {reimprimirSelectedIds.size > 0 && (
                                        <span className="text-sm font-semibold text-blue-600">
                                            {reimprimirSelectedIds.size} selecionada(s) • {formatCentavos(totalReimprimirSelecionado)}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {clienteParcelasPagas.map((p) => {
                                        const isSelected = reimprimirSelectedIds.has(p.id);
                                        const dataPgto = p.data_pagamento
                                            ? new Date(p.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')
                                            : '—';
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => toggleReimprimirSelect(p.id)}
                                                className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                                    isSelected
                                                        ? 'border-blue-500 bg-blue-50/60 shadow-sm'
                                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}}
                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                                                            Parcela {rotuloParcelaCobranca(p, clienteParcelasPagas)}
                                                        </span>
                                                        <StatusFinanceiroBadge status={p.status} />
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            Venc: {new Date(p.data_vencimento + 'T00:00').toLocaleDateString('pt-BR')}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-green-700">
                                                            <CheckCircle2 className="h-3 w-3" />
                                                            Pago em {dataPgto}
                                                        </span>
                                                        <span className="font-mono">{p.codigo}</span>
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-medium">
                                                            Ref: {obterMesReferencia(p.data_vencimento)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-lg font-bold text-green-700">
                                                        {formatCentavos(p.valor_pago_centavos)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <Card className="p-12 text-center">
                                <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Nenhuma parcela paga</h3>
                                <p className="text-gray-500 mt-1">
                                    Este cliente ainda não possui parcelas quitadas para reimprimir recibo.
                                </p>
                            </Card>
                        )}
                    </div>

                    <div className="xl:col-span-1">
                        <Card className="sticky top-6 shadow-lg">
                            <div className="p-5 border-b bg-gradient-to-r from-emerald-600 to-green-700 rounded-t-lg">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Printer className="h-5 w-5" />
                                    Reimprimir recibo
                                </h3>
                                <p className="text-emerald-100 text-sm mt-1">
                                    {reimprimirSelectedIds.size > 0
                                        ? `${reimprimirSelectedIds.size} parcela(s) selecionada(s)`
                                        : 'Selecione parcelas pagas ao lado'}
                                </p>
                            </div>
                            <div className="p-5 space-y-5">
                                <div className="text-center p-4 rounded-xl bg-gradient-to-br from-gray-50 to-emerald-50 border">
                                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total selecionado</p>
                                    <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">
                                        {formatCentavos(totalReimprimirSelecionado)}
                                    </p>
                                </div>
                                <Button
                                    className="w-full bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-700 hover:to-green-600 text-white shadow-lg py-3 text-base"
                                    onClick={() => void handleReimprimirRecibo()}
                                    loading={reimprimindo}
                                    disabled={reimprimirSelectedIds.size === 0}
                                >
                                    <Printer className="h-5 w-5 mr-2" />
                                    Gerar recibo
                                </Button>
                                <p className="text-xs text-gray-500 text-center">
                                    Na próxima tela você poderá imprimir na térmica ou em PDF (A5).
                                </p>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        );
    }

    // ==================== SEARCH VIEW ====================
    return (
        <div className="space-y-6">
            <PageHeader
                title="Baixa de Parcelas"
                subtitle={
                    mainTab === 'reimprimir'
                        ? 'Busque o cliente e reimprima recibos de parcelas já pagas'
                        : 'Localize o cliente e efetue a baixa de parcelas no balcão'
                }
            />

            {renderMainTabs()}

            {/* Search Box */}
            <Card className="p-8 bg-gradient-to-br from-white to-blue-50/50">
                <div className="max-w-2xl mx-auto text-center">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                        mainTab === 'reimprimir' ? 'bg-emerald-100' : 'bg-blue-100'
                    }`}>
                        {mainTab === 'reimprimir' ? (
                            <History className="h-8 w-8 text-emerald-600" />
                        ) : (
                            <Users className="h-8 w-8 text-blue-600" />
                        )}
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-1">Buscar Cliente</h2>
                    <p className="text-sm text-gray-500 mb-6">
                        {mainTab === 'reimprimir'
                            ? 'Pesquise o cliente para ver parcelas pagas e reimprimir o recibo'
                            : 'Pesquise por nome, CPF, código, telefone ou número do contrato'}
                    </p>

                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Nome, CPF, código ou nº contrato (ex. 55, CTR-000055)..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="w-full pl-12 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none"
                                autoFocus
                            />
                        </div>
                        <Button
                            className="px-6"
                            onClick={handleSearch}
                            loading={loading}
                        >
                            <Search className="h-4 w-4 mr-2" />
                            Buscar
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Results */}
            {hasSearched && (
                <>
                    {clientResults.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-sm font-medium text-gray-600">
                                {clientResults.length} cliente(s) encontrado(s)
                            </p>
                            {clientResults.map(client => (
                                <Card
                                    key={client.id}
                                    className="p-4 hover:shadow-md transition-all cursor-pointer border-2 border-transparent hover:border-blue-200"
                                    onClick={() => handleSelectClient(client.id, client.nome, client.cpf)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg flex-shrink-0">
                                            {client.nome.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 dark:text-slate-100 truncate">{client.nome}</h3>
                                            {client.cpf && (
                                                <p className="text-sm text-gray-500 mt-0.5">{client.cpf}</p>
                                            )}
                                        </div>
                                        <div className="text-right flex-shrink-0 mr-2">
                                            {mainTab === 'reimprimir' ? (
                                                client.qtdPago > 0 ? (
                                                    <>
                                                        <p className="text-lg font-bold text-green-600">{formatCentavos(client.totalPago)}</p>
                                                        <p className="text-xs text-gray-500">{client.qtdPago} parcela(s) paga(s)</p>
                                                    </>
                                                ) : (
                                                    <span className="text-sm text-gray-500 font-medium">Sem pagamentos</span>
                                                )
                                            ) : client.qtdAberto > 0 ? (
                                                <>
                                                    <p className="text-lg font-bold text-red-600">{formatCentavos(client.totalAberto)}</p>
                                                    <p className="text-xs text-gray-500">{client.qtdAberto} parcela(s) em aberto</p>
                                                </>
                                            ) : (
                                                <span className="text-sm text-green-600 font-medium">Em dia ✓</span>
                                            )}
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-gray-400" />
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <Card className="p-12 text-center">
                            <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">Nenhum cliente encontrado</h3>
                            <p className="text-gray-500 mt-1">
                                {searchError || 'Tente nome completo, CPF ou código. Confira também a unidade selecionada no topo.'}
                            </p>
                        </Card>
                    )}
                </>
            )}

        </div>
    );
};

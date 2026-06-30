import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, DollarSign, CreditCard, Banknote, QrCode, AlertTriangle, CheckCircle2, Wallet, Printer } from 'lucide-react';
import { useFinanceiro, formatCentavos, type ContaReceberDetalhada, type BaixarContaReceberParams } from '../../lib/FinanceiroStore';
import { Button, Input, Select } from '../ui/Components';
import { StatusFinanceiroBadge } from './FinanceiroComponents';
import { PixPagadorConfirmacao } from './PixPagadorConfirmacao';
import {
    formaEhPix,
    pixPagadorParaBaixa,
    pixPagadorStateInicial,
    validarPixPagador,
    type PixPagadorState,
} from '../../lib/pixPagadorBaixa';
import { supabase } from '../../lib/supabase';
import { generateReciboPDF, obterMesReferencia } from '../../lib/ReciboService';
import { useAuth } from '../../lib/AuthContext';
import {
    filtrarContasOperaveis,
    resolverContaDestinoBaixa,
    usuarioPodeVerTodosCaixas,
} from '../../lib/finCaixaPermissoes';
import { ensureContasDestinoBaixa } from '../../lib/finCaixaAutoAbertura';
import { dataHojeIsoLocal } from '../../lib/contratoDatas';

interface ReceberPagamentoModalProps {
    conta: ContaReceberDetalhada;
    onClose: () => void;
    onSuccess: () => void;
}

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

export const ReceberPagamentoModal: React.FC<ReceberPagamentoModalProps> = ({ conta, onClose, onSuccess }) => {
    const { empresaId, baixarContaReceber, criarContaReceber, formasPagamento, loadFormasPagamento, contasBancarias, loadContasBancarias, loading } = useFinanceiro();
    const { user } = useAuth();
    const verTodosCaixas = usuarioPodeVerTodosCaixas(user?.role, user?.permissoes);
    const contasOperaveis = useMemo(
        () => filtrarContasOperaveis(contasBancarias, user?.id, verTodosCaixas),
        [contasBancarias, user?.id, verTodosCaixas],
    );

    const [formaPagamentoId, setFormaPagamentoId] = useState('');
    const [contaBancariaId, setContaBancariaId] = useState('');
    const [valorRecebido, setValorRecebido] = useState('');
    const [valorDesconto, setValorDesconto] = useState('');
    const [dataRecebimento, setDataRecebimento] = useState(dataHojeIsoLocal());
    const [observacoes, setObservacoes] = useState('');
    const [success, setSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [creditoClienteCentavos, setCreditoClienteCentavos] = useState(0);
    const [hasParcelaAnteriorAberta, setHasParcelaAnteriorAberta] = useState(false);
    const [parcelaAnteriorInfo, setParcelaAnteriorInfo] = useState<string | null>(null);
    const [carregandoValidacaoParcela, setCarregandoValidacaoParcela] = useState(false);

    useEffect(() => {
        if (!conta.cliente_id) return;
        let active = true;
        const verificarParcelasAnteriores = async () => {
            setCarregandoValidacaoParcela(true);
            try {
                const { data, error } = await supabase
                    .from('fin_contas_receber')
                    .select('id, data_vencimento, parcela_numero, descricao')
                    .eq('cliente_id', conta.cliente_id)
                    .in('status', ['aberto', 'vencido', 'pago_parcial'])
                    .lt('data_vencimento', conta.data_vencimento)
                    .is('deleted_at', null)
                    .order('data_vencimento', { ascending: true })
                    .limit(1);

                if (error) throw error;

                if (active && data && data.length > 0) {
                    setHasParcelaAnteriorAberta(true);
                    const vencStr = new Date(data[0].data_vencimento + 'T12:00:00')
                        .toLocaleDateString('pt-BR');
                    const descStr = data[0].descricao || `Parcela ${data[0].parcela_numero || ''}`;
                    setParcelaAnteriorInfo(`${descStr} com vencimento em ${vencStr}`);
                } else if (active) {
                    setHasParcelaAnteriorAberta(false);
                    setParcelaAnteriorInfo(null);
                }
            } catch (err) {
                console.error('[ReceberPagamentoModal] erro verificar parcelas anteriores:', err);
            } finally {
                if (active) setCarregandoValidacaoParcela(false);
            }
        };

        void verificarParcelasAnteriores();
        return () => {
            active = false;
        };
    }, [conta.cliente_id, conta.data_vencimento]);

    // Split payment states
    const [isSplit, setIsSplit] = useState(false);
    const [formaPagamentoId2, setFormaPagamentoId2] = useState('');
    const [contaBancariaId2, setContaBancariaId2] = useState('');
    const [valorRecebido1, setValorRecebido1] = useState('');
    const [valorRecebido2, setValorRecebido2] = useState('');
    const [pixPagador, setPixPagador] = useState<PixPagadorState>(pixPagadorStateInicial);
    const [pixPagador2, setPixPagador2] = useState<PixPagadorState>(pixPagadorStateInicial);

    useEffect(() => {
        loadFormasPagamento();
        loadContasBancarias();
    }, [loadFormasPagamento, loadContasBancarias]);

    // Set defaults
    useEffect(() => {
        if (formasPagamento.length > 0 && !formaPagamentoId) {
            setFormaPagamentoId(formasPagamento[0].id);
        }
        if (formasPagamento.length > 0 && !formaPagamentoId2) {
            setFormaPagamentoId2(formasPagamento[1]?.id || formasPagamento[0].id);
        }
    }, [formasPagamento, formaPagamentoId, formaPagamentoId2]);

    useEffect(() => {
        if (contasOperaveis.length === 0 || !formaPagamentoId) return;
        const forma = formasPagamento.find((f) => f.id === formaPagamentoId);
        const destino = resolverContaDestinoBaixa(
            contasOperaveis,
            forma?.tipo || forma?.nome,
            user?.id,
            verTodosCaixas,
        );
        if (destino) setContaBancariaId(destino.id);
    }, [contasOperaveis, formaPagamentoId, formasPagamento, user?.id, verTodosCaixas]);

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

    // Set default valor to open amount
    useEffect(() => {
        if (!valorRecebido) {
            setValorRecebido((conta.valor_aberto_centavos / 100).toFixed(2));
        }
    }, [conta.valor_aberto_centavos, valorRecebido]);

    useEffect(() => {
        if (!conta.cliente_id) return;
        const loadCredito = async () => {
            try {
                const credito = await getCreditoCliente(empresaId, conta.cliente_id!);
                setCreditoClienteCentavos(credito);
                if (credito > 0) {
                    setValorDesconto((credito / 100).toFixed(2));
                }
            } catch {
                setCreditoClienteCentavos(0);
            }
        };
        void loadCredito();
    }, [conta.cliente_id, empresaId]);

    const valorDescontoCentavos = Math.round(parseFloat(valorDesconto || '0') * 100);
    const hojeIso = dataHojeIsoLocal();
    const dataRetroativa = !!dataRecebimento && dataRecebimento !== hojeIso;

    const valorRecebido1Centavos = Math.round(parseFloat(valorRecebido1 || '0') * 100);
    const valorRecebido2Centavos = Math.round(parseFloat(valorRecebido2 || '0') * 100);

    const valorRecebidoCentavos = isSplit
        ? valorRecebido1Centavos + valorRecebido2Centavos
        : Math.round(parseFloat(valorRecebido || '0') * 100);

    const creditoProximaParcelaCentavos = valorRecebidoCentavos > conta.valor_aberto_centavos
        ? valorRecebidoCentavos - conta.valor_aberto_centavos
        : 0;
    const valorRecebidoProcessadoCentavos = Math.min(valorRecebidoCentavos, Math.max(0, conta.valor_aberto_centavos));
    const saldoRemanescenteCentavos = Math.max(0, conta.valor_aberto_centavos - (valorRecebidoProcessadoCentavos + valorDescontoCentavos));

    const totalEfetivo = valorRecebidoProcessadoCentavos - valorDescontoCentavos;

    const selectedForma = formasPagamento.find(f => f.id === formaPagamentoId);
    const selectedConta = contasOperaveis.find(c => c.id === contaBancariaId);

    const selectedForma2 = formasPagamento.find(f => f.id === formaPagamentoId2);
    const selectedConta2 = contasOperaveis.find(c => c.id === contaBancariaId2);

    const canSubmit = isSplit
        ? valorRecebido1Centavos > 0 && valorRecebido2Centavos > 0 && formaPagamentoId && formaPagamentoId2 && contaBancariaId && contaBancariaId2 && !loading && !hasParcelaAnteriorAberta && !carregandoValidacaoParcela
        : valorRecebidoCentavos > 0 && formaPagamentoId && contaBancariaId && !loading && !hasParcelaAnteriorAberta && !carregandoValidacaoParcela;

    const resolverContaPorId = useCallback(
        (contaId: string) =>
            contasOperaveis.find((c) => c.id === contaId)
            || contasBancarias.find((c) => c.id === contaId)
            || null,
        [contasOperaveis, contasBancarias],
    );

    const ensureContasDestinoNaBaixa = async (
        contaIds: string[],
        dataPagamento: string,
    ): Promise<{ ok: true } | { ok: false; errorMsg: string }> => {
        const dia = dataPagamento.slice(0, 10) || dataHojeIsoLocal();
        const contas = [...new Set(contaIds.map((id) => id.trim()).filter(Boolean))]
            .map((id) => resolverContaPorId(id))
            .filter(Boolean)
            .map((c) => ({ id: c!.id, nome: c!.nome, tipo: c!.tipo }));

        return ensureContasDestinoBaixa({
            contas,
            dataPagamento: dia,
            usuarioId: user?.id,
            observacaoPrefixo: 'Sessão retroativa — recebimento',
        });
    };

    const formaSelecionada = formasPagamento.find((f) => f.id === formaPagamentoId);
    const formaSelecionada2 = formasPagamento.find((f) => f.id === formaPagamentoId2);
    const pagamentoPix = formaEhPix(formaSelecionada?.tipo || formaSelecionada?.nome);
    const pagamentoPix2 = formaEhPix(formaSelecionada2?.tipo || formaSelecionada2?.nome);

    const handleSubmit = async () => {
        setErrorMsg('');
        if (hasParcelaAnteriorAberta) {
            setErrorMsg(`Não é permitido realizar a baixa desta parcela pois existe parcela anterior em aberto: ${parcelaAnteriorInfo}.`);
            return;
        }
        if (!canSubmit) return;

        const erroPix = isSplit
            ? validarPixPagador(pagamentoPix, pixPagador) || validarPixPagador(pagamentoPix2, pixPagador2)
            : validarPixPagador(pagamentoPix, pixPagador);
        if (erroPix) {
            setErrorMsg(erroPix);
            return;
        }

        if (isSplit) {
            const totalBaixa1Centavos = Math.max(0, valorRecebido1Centavos);
            const totalBaixa2Centavos = Math.max(0, valorRecebido2Centavos);

            // Ensure boxes are open
            const caixaSplit = await ensureContasDestinoNaBaixa(
                [contaBancariaId, contaBancariaId2],
                dataRecebimento,
            );
            if (caixaSplit.ok === false) {
                setErrorMsg(caixaSplit.errorMsg);
                return;
            }

            // Call first partial payment
            const params1: BaixarContaReceberParams = {
                conta_receber_id: conta.id,
                valor_pago_centavos: valorRecebido1Centavos,
                forma_pagamento_id: formaPagamentoId,
                conta_bancaria_id: contaBancariaId,
                valor_desconto_centavos: 0,
                observacoes: `${observacoes || ''} (Parte 1/2 - Split)`.trim(),
                data_pagamento: dataRecebimento,
                ...pixPagadorParaBaixa(pagamentoPix, pixPagador),
            };

            const result1 = await baixarContaReceber(params1);
            if (!result1) {
                setErrorMsg('Erro ao registrar a primeira parte do pagamento. Operação cancelada.');
                return;
            }

            // Call second payment with discount and remanescente
            const descontoTecnicoCentavos = valorDescontoCentavos + saldoRemanescenteCentavos;
            const params2: BaixarContaReceberParams = {
                conta_receber_id: conta.id,
                valor_pago_centavos: valorRecebido2Centavos,
                forma_pagamento_id: formaPagamentoId2,
                conta_bancaria_id: contaBancariaId2,
                valor_desconto_centavos: descontoTecnicoCentavos,
                observacoes: `${observacoes || ''} (Parte 2/2 - Split)`.trim(),
                data_pagamento: dataRecebimento,
                ...pixPagadorParaBaixa(pagamentoPix2, pixPagador2),
            };

            const result2 = await baixarContaReceber(params2);
            if (!result2) {
                setErrorMsg('A primeira parte foi paga, mas ocorreu um erro no segundo pagamento. Por favor, verifique o saldo do título.');
                return;
            }

            // Post payment operations
            if (saldoRemanescenteCentavos > 0 && conta.cliente_id) {
                const hoje = dataHojeIsoLocal();
                await criarContaReceber({
                    cliente_id: conta.cliente_id,
                    tipo_documento: 'outro',
                    descricao: `Saldo remanescente automático da parcela ${conta.codigo}`,
                    valor_original_centavos: saldoRemanescenteCentavos,
                    valor_juros_centavos: 0,
                    valor_multa_centavos: 0,
                    valor_desconto_centavos: 0,
                    valor_total_centavos: saldoRemanescenteCentavos,
                    valor_pago_centavos: 0,
                    valor_aberto_centavos: saldoRemanescenteCentavos,
                    data_emissao: hoje,
                    data_vencimento: conta.data_vencimento || hoje,
                    data_competencia: hoje,
                    status: 'aberto',
                    parcela_numero: 1,
                    total_parcelas: 1,
                });
            }
            if (creditoProximaParcelaCentavos > 0 && conta.cliente_id) {
                await addCreditoCliente(empresaId, conta.cliente_id, creditoProximaParcelaCentavos);
            }
            if (conta.cliente_id) {
                const descontoInformadoCentavos = Math.round(parseFloat(valorDesconto || '0') * 100);
                const creditoAplicadoCentavos = Math.min(creditoClienteCentavos, descontoInformadoCentavos);
                if (creditoAplicadoCentavos > 0) {
                    await consumeCreditoCliente(empresaId, conta.cliente_id, creditoAplicadoCentavos);
                }
            }
            setSuccess(true);
            setTimeout(() => {
                onSuccess();
            }, 1500);

        } else {
            // Standard single payment flow
            const totalBaixaCentavos = Math.max(0, valorRecebidoProcessadoCentavos - valorDescontoCentavos);
            const caixa = await ensureContasDestinoNaBaixa([contaBancariaId], dataRecebimento);
            if (caixa.ok === false) {
                setErrorMsg(caixa.errorMsg);
                return;
            }

            const descontoTecnicoCentavos = valorDescontoCentavos + saldoRemanescenteCentavos;
            const params: BaixarContaReceberParams = {
                conta_receber_id: conta.id,
                valor_pago_centavos: valorRecebidoProcessadoCentavos,
                forma_pagamento_id: formaPagamentoId,
                conta_bancaria_id: contaBancariaId,
                valor_desconto_centavos: descontoTecnicoCentavos,
                observacoes: observacoes || undefined,
                data_pagamento: dataRecebimento,
                ...pixPagadorParaBaixa(pagamentoPix, pixPagador),
            };

            const result = await baixarContaReceber(params);
            if (result) {
                if (saldoRemanescenteCentavos > 0 && conta.cliente_id) {
                    const hoje = dataHojeIsoLocal();
                    await criarContaReceber({
                        cliente_id: conta.cliente_id,
                        tipo_documento: 'outro',
                        descricao: `Saldo remanescente automático da parcela ${conta.codigo}`,
                        valor_original_centavos: saldoRemanescenteCentavos,
                        valor_juros_centavos: 0,
                        valor_multa_centavos: 0,
                        valor_desconto_centavos: 0,
                        valor_total_centavos: saldoRemanescenteCentavos,
                        valor_pago_centavos: 0,
                        valor_aberto_centavos: saldoRemanescenteCentavos,
                        data_emissao: hoje,
                        data_vencimento: conta.data_vencimento || hoje,
                        data_competencia: hoje,
                        status: 'aberto',
                        parcela_numero: 1,
                        total_parcelas: 1,
                    });
                }
                if (creditoProximaParcelaCentavos > 0 && conta.cliente_id) {
                    await addCreditoCliente(empresaId, conta.cliente_id, creditoProximaParcelaCentavos);
                }
                if (conta.cliente_id) {
                    const descontoInformadoCentavos = Math.round(parseFloat(valorDesconto || '0') * 100);
                    const creditoAplicadoCentavos = Math.min(creditoClienteCentavos, descontoInformadoCentavos);
                    if (creditoAplicadoCentavos > 0) {
                        await consumeCreditoCliente(empresaId, conta.cliente_id, creditoAplicadoCentavos);
                    }
                }
                setSuccess(true);
                setTimeout(() => {
                    onSuccess();
                }, 1500);
            } else {
                setErrorMsg('Erro ao processar o pagamento. Verifique os dados e tente novamente.');
            }
        }
    };

    const handleImprimirRecibo = async () => {
        let contratoCodigo = '';
        let planoNome = conta.plano_nome || '';

        // Tenta buscar assinatura ativa no banco
        if (conta.cliente_id) {
            try {
                const { data: ass } = await supabase
                    .from('assinaturas')
                    .select('codigo, plano_nome, planos(nome)')
                    .eq('cliente_id', conta.cliente_id)
                    .eq('status', 'ativo')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                if (ass) {
                    contratoCodigo = ass.codigo || '';
                    if (!planoNome) {
                        planoNome = ass.plano_nome || (ass as any).planos?.nome || '';
                    }
                }
            } catch (e) {
                console.warn('[ReceberPagamentoModal] erro ao buscar assinatura:', e);
            }
        }

        const descOriginal = conta.descricao || `Pagamento de ${conta.tipo_documento.replace(/_/g, ' ')}`;
        const formaPgtoLabel = isSplit
            ? `${selectedForma?.nome || ''} + ${selectedForma2?.nome || ''}`
            : (selectedForma?.nome || '');
        const referencia = isSplit
            ? `${descOriginal} [Split: ${formatCentavos(valorRecebido1Centavos)} via ${selectedForma?.nome || ''} e ${formatCentavos(valorRecebido2Centavos)} via ${selectedForma2?.nome || ''}]`
            : descOriginal;

        const userRaw = sessionStorage.getItem('user');
        const user = userRaw ? JSON.parse(userRaw) : null;

        await generateReciboPDF({
            numero: `REC-${Date.now()}`,
            data: new Date().toLocaleDateString('pt-BR'),
            clienteNome: conta.cliente_nome,
            valor: totalEfetivo / 100,
            referencia,
            descricao: descOriginal,
            vencimento: conta.data_vencimento
                ? new Date(conta.data_vencimento + 'T00:00').toLocaleDateString('pt-BR')
                : new Date().toLocaleDateString('pt-BR'),
            contratoCodigo: contratoCodigo || undefined,
            planoNome: planoNome || undefined,
            dataPagamento: new Date().toLocaleDateString('pt-BR'),
            atendenteNome: user?.nome || undefined,
            formaPagamento: formaPgtoLabel,
            empresaId: conta.empresa_id,
            parcelasDetalhes: [{
                numero: conta.parcela_numero || 1,
                mesReferencia: obterMesReferencia(conta.data_vencimento),
                descricao: conta.descricao || 'MENSALIDADE',
                vencimento: conta.data_vencimento
                    ? new Date(conta.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')
                    : new Date().toLocaleDateString('pt-BR'),
                valor: totalEfetivo / 100,
            }],
        });
    };

    if (success) {
        return (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Pagamento Recebido!</h3>
                    <div className="text-gray-500 mb-4 space-y-1">
                        <p className="font-semibold text-lg text-gray-800">
                            Total: {formatCentavos(valorRecebidoProcessadoCentavos)}
                        </p>
                        {isSplit ? (
                            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 mt-2 space-y-1">
                                <p>• {formatCentavos(valorRecebido1Centavos)} via {selectedForma?.nome || 'N/A'} ({selectedConta?.nome || 'N/A'})</p>
                                <p>• {formatCentavos(valorRecebido2Centavos)} via {selectedForma2?.nome || 'N/A'} ({selectedConta2?.nome || 'N/A'})</p>
                            </div>
                        ) : (
                            <p className="text-sm">
                                Recebido via {selectedForma?.nome || 'N/A'} em {selectedConta?.nome || 'N/A'}
                            </p>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mb-6 uppercase tracking-wide">
                        {totalEfetivo >= conta.valor_aberto_centavos ? 'Quitação total' : 'Quitação parcial'}
                    </p>
                    {saldoRemanescenteCentavos > 0 && (
                        <p className="text-xs text-blue-700 mb-4">
                            Saldo restante de {formatCentavos(saldoRemanescenteCentavos)} virou uma nova parcela automaticamente.
                        </p>
                    )}
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={onSuccess}>
                            Fechar
                        </Button>
                        <Button
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white animate-pulse"
                            onClick={handleImprimirRecibo}
                        >
                            <Printer className="h-4 w-4 mr-2" />
                            Recibo PDF
                        </Button>
                    </div>
                </div>

            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl">
                    <div>
                        <h2 className="text-lg font-bold text-white">Receber Pagamento</h2>
                        <p className="text-blue-100 text-sm mt-0.5">Baixar título de mensalidade</p>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Client & Title Info */}
                <div className="p-6 space-y-4 border-b bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg flex-shrink-0">
                            {conta.cliente_nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{conta.cliente_nome}</h3>
                            {conta.cliente_cpf && (
                                <p className="text-sm text-gray-500">{conta.cliente_cpf}</p>
                            )}
                        </div>
                        <StatusFinanceiroBadge status={conta.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-lg p-3 border">
                            <p className="text-xs text-gray-500 font-medium">Código</p>
                            <p className="text-sm font-mono text-gray-800 mt-0.5">{conta.codigo}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border">
                            <p className="text-xs text-gray-500 font-medium">Vencimento</p>
                            <p className="text-sm text-gray-800 mt-0.5">
                                {new Date(conta.data_vencimento + 'T00:00').toLocaleDateString('pt-BR')}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border">
                            <p className="text-xs text-gray-500 font-medium">Valor Original</p>
                            <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatCentavos(conta.valor_original_centavos)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border">
                            <p className="text-xs text-gray-500 font-medium">Em Aberto</p>
                            <p className="text-sm font-semibold text-red-600 mt-0.5">{formatCentavos(conta.valor_aberto_centavos)}</p>
                        </div>
                    </div>

                    {conta.dias_atraso > 0 && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                            <p className="text-sm text-amber-700">
                                <span className="font-semibold">{conta.dias_atraso} dias</span> em atraso — Juros e multa serão calculados automaticamente
                            </p>
                        </div>
                    )}
                </div>

                {/* Payment Form */}
                <div className="p-6 space-y-4">
                    {hasParcelaAnteriorAberta && (
                        <div className="flex flex-col gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                            <div className="flex items-center gap-2 font-semibold animate-pulse">
                                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                                <span>Pagamento Bloqueado</span>
                            </div>
                            <p className="text-sm">
                                Este cliente possui parcelas anteriores em aberto. Para manter a integridade financeira e contratual, você deve receber primeiro as parcelas mais antigas.
                            </p>
                            <div className="text-xs font-semibold bg-red-100/50 rounded-lg p-2 mt-1">
                                Parcela pendente: {parcelaAnteriorInfo}
                            </div>
                        </div>
                    )}
                    {dataRetroativa && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800">
                            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <p className="text-sm">
                                Atenção: este recebimento será registrado no caixa do dia {new Date(`${dataRecebimento}T12:00:00`).toLocaleDateString('pt-BR')}.
                            </p>
                        </div>
                    )}

                    {/* Toggle Split Payment */}
                    <div className="flex items-center justify-between bg-blue-50/50 border border-blue-100 rounded-xl p-3">
                        <div className="flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-blue-600" />
                            <div>
                                <p className="text-sm font-semibold text-gray-900">Multi-pagamento</p>
                                <p className="text-xs text-gray-500">Pagar com duas formas de pagamento ao mesmo tempo</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={isSplit}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setIsSplit(checked);
                                    if (checked) {
                                        const half = Math.floor(conta.valor_aberto_centavos / 2);
                                        const remaining = conta.valor_aberto_centavos - half;
                                        setValorRecebido1((half / 100).toFixed(2));
                                        setValorRecebido2((remaining / 100).toFixed(2));
                                    } else {
                                        setValorRecebido((conta.valor_aberto_centavos / 100).toFixed(2));
                                    }
                                }}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {!isSplit ? (
                        <>
                            {/* Forma de Pagamento */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Forma de Pagamento</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {formasPagamento.filter(f => f.ativo).map(forma => (
                                        <button
                                            key={forma.id}
                                            type="button"
                                            onClick={() => setFormaPagamentoId(forma.id)}
                                            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm ${formaPagamentoId === forma.id
                                                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                                                : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                                }`}
                                        >
                                            {formaIcons[forma.tipo] || <DollarSign className="h-5 w-5" />}
                                            <span className="text-xs font-medium leading-tight text-center">{forma.nome}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Conta Bancária e Data */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Onde entra o dinheiro</label>
                                    <Select
                                        value={contaBancariaId}
                                        onChange={(e) => setContaBancariaId(e.target.value)}
                                    >
                                        <option value="">Selecione...</option>
                                        {contasOperaveis.map(conta => (
                                            <option key={conta.id} value={conta.id}>
                                                {conta.nome} {conta.principal ? '(Principal)' : ''} — {formatCentavos(conta.saldo_atual_centavos)}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Data do Recebimento</label>
                                    <Input
                                        type="date"
                                        value={dataRecebimento}
                                        onChange={(e) => setDataRecebimento(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Valores */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Valor Recebido (R$)</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={valorRecebido}
                                        onChange={(e) => setValorRecebido(e.target.value)}
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

                            <PixPagadorConfirmacao
                                visivel={pagamentoPix}
                                titularNome={conta.cliente_nome}
                                state={pixPagador}
                                onChange={setPixPagador}
                                idPrefix="receber-pix-1"
                            />
                        </>
                    ) : (
                        <>
                            {/* Split payment inputs */}
                            <div className="space-y-4">
                                {/* Forma 1 */}
                                <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/10 space-y-3">
                                    <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">Forma de Pagamento 1</h4>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Método de Pagamento</label>
                                        <Select
                                            value={formaPagamentoId}
                                            onChange={(e) => setFormaPagamentoId(e.target.value)}
                                        >
                                            <option value="">Selecione...</option>
                                            {formasPagamento.filter(f => f.ativo).map(forma => (
                                                <option key={forma.id} value={forma.id}>{forma.nome}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Onde entra o dinheiro 1</label>
                                            <Select
                                                value={contaBancariaId}
                                                onChange={(e) => setContaBancariaId(e.target.value)}
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
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Valor 1 (R$)</label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={valorRecebido1}
                                                onChange={(e) => setValorRecebido1(e.target.value)}
                                                className="font-semibold text-sm"
                                            />
                                        </div>
                                    </div>
                                    <PixPagadorConfirmacao
                                        visivel={pagamentoPix}
                                        titularNome={conta.cliente_nome}
                                        state={pixPagador}
                                        onChange={setPixPagador}
                                        idPrefix="receber-split-pix-1"
                                    />
                                </div>

                                {/* Forma 2 */}
                                <div className="border border-indigo-100 rounded-xl p-4 bg-indigo-50/10 space-y-3">
                                    <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Forma de Pagamento 2</h4>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Método de Pagamento</label>
                                        <Select
                                            value={formaPagamentoId2}
                                            onChange={(e) => setFormaPagamentoId2(e.target.value)}
                                        >
                                            <option value="">Selecione...</option>
                                            {formasPagamento.filter(f => f.ativo).map(forma => (
                                                <option key={forma.id} value={forma.id}>{forma.nome}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Onde entra o dinheiro 2</label>
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
                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Valor 2 (R$)</label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={valorRecebido2}
                                                onChange={(e) => setValorRecebido2(e.target.value)}
                                                className="font-semibold text-sm"
                                            />
                                        </div>
                                    </div>
                                    <PixPagadorConfirmacao
                                        visivel={pagamentoPix2}
                                        titularNome={conta.cliente_nome}
                                        state={pixPagador2}
                                        onChange={setPixPagador2}
                                        idPrefix="receber-split-pix-2"
                                    />
                                </div>

                                {/* General fields */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Desconto Geral (R$)</label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={valorDesconto}
                                            onChange={(e) => setValorDesconto(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Data do Recebimento</label>
                                        <Input
                                            type="date"
                                            value={dataRecebimento}
                                            onChange={(e) => setDataRecebimento(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Observações */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Observações (opcional)</label>
                        <textarea
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            rows={2}
                            placeholder="Informações adicionais sobre o pagamento..."
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                        />
                    </div>

                    {/* Summary */}
                    <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-4 border">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600">Valor recebido</span>
                            <span className="text-sm font-semibold">{formatCentavos(valorRecebidoCentavos)}</span>
                        </div>
                        {valorDescontoCentavos > 0 && (
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-600">Desconto</span>
                                <span className="text-sm font-semibold text-green-600">-{formatCentavos(valorDescontoCentavos)}</span>
                            </div>
                        )}
                        <div className="border-t pt-2 mt-2 flex items-center justify-between">
                            <span className="font-semibold text-gray-900">Total Efetivo</span>
                            <span className="text-xl font-bold text-blue-600">{formatCentavos(totalEfetivo)}</span>
                        </div>
                        {creditoProximaParcelaCentavos > 0 && (
                            <div className="mt-2 flex items-center justify-between">
                                <span className="text-sm text-gray-600">Crédito próxima parcela</span>
                                <span className="text-sm font-semibold text-green-600">{formatCentavos(creditoProximaParcelaCentavos)}</span>
                            </div>
                        )}
                        {saldoRemanescenteCentavos > 0 && (
                            <div className="mt-2 flex items-center justify-between">
                                <span className="text-sm text-gray-600">Nova parcela automática</span>
                                <span className="text-sm font-semibold text-blue-600">{formatCentavos(saldoRemanescenteCentavos)}</span>
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {errorMsg && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                            {errorMsg}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 p-6 border-t bg-gray-50 rounded-b-2xl">
                    <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button
                        className="flex-1 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white shadow-lg"
                        onClick={handleSubmit}
                        loading={loading}
                        disabled={!canSubmit}
                    >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Receber Pagamento
                    </Button>
                </div>
            </div>

        </div>
    );
};

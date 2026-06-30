import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, FileText, Bluetooth, Download } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card } from '../../components/ui/Components';
import { useToast } from '../../lib/ToastStore';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import {
    listarRecebimentosCampo,
    listarCobradoresSelect,
    type RecebimentoCampoDto,
} from '../../lib/cobRecebimentosSupabase';
import { useCobradorEscopo } from '../../lib/useCobradorEscopo';
import { reimprimirReciboRecebimentoCampo } from '../../lib/cobradorReciboCampo';
import {
    carregarContextoEmpresaRecibo,
    imprimirRelatorioCobradorPeriodo,
    labelFormaPagamentoRecibo,
    type ModoReciboBaixaCobrador,
    type TipoRelatorioCobradorPeriodo,
} from '../../lib/ReciboTermicoService';
import { calcularResumoSintetico, rotuloParcelasItem, rotuloContratoItem } from '../../lib/cobradorRelatorioPeriodo';
import {
    montarPdfRelatorioCobradorPeriodo,
    nomeArquivoRelatorioCobradorPeriodo,
} from '../../lib/cobradorRelatorioPeriodoPdf';
import {
    abrirPdfNaJanelaReservada,
    downloadPdfBlob,
    reservarJanelaImpressaoPdf,
} from '../../lib/printPdfBlob';
import { carregarContasCobrador, rotuloContasCobrador } from '../../lib/cobradorContasBancarias';
import {
    gerarBlobPdfCaixaCobrador,
    montarSnapshotsPdfCaixaCobrador,
    nomeArquivoPdfCaixaCobrador,
} from '../../lib/cobradorCaixaPdfService';
import { ImpressoraBluetoothSetup } from '../../components/cobradores/ImpressoraBluetoothSetup';
import { mensagemErroSupabase } from '../../lib/supabaseErrorMessage';

const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

function primeiroDiaMesIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function hojeIso(): string {
    return new Date().toISOString().slice(0, 10);
}

export const CobradorImpressoes: React.FC = () => {
    const { showToast } = useToast();
    const { empresaIdsFiltro, dataRevisionEmpresa } = useEmpresaIdsOperacao();
    const { cobradorRestrito, meuCobradorId, vinculoLoading } = useCobradorEscopo(empresaIdsFiltro);

    const [cobradores, setCobradores] = useState<{ id: string; nome: string }[]>([]);
    const [cobradorId, setCobradorId] = useState('');
    const [dataInicio, setDataInicio] = useState(primeiroDiaMesIso);
    const [dataFim, setDataFim] = useState(hojeIso);
    const [items, setItems] = useState<RecebimentoCampoDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [caixaRotulo, setCaixaRotulo] = useState('');
    const [modoImpressao, setModoImpressao] = useState<ModoReciboBaixaCobrador>('termica');
    const [tipoRelatorio, setTipoRelatorio] = useState<TipoRelatorioCobradorPeriodo>('sintetico');
    const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
    const [gerandoPdfCaixa, setGerandoPdfCaixa] = useState(false);
    const [reimprimindoId, setReimprimindoId] = useState<string | null>(null);

    const cobradorIdEfetivo = cobradorRestrito ? meuCobradorId || '' : cobradorId;

    const cobradorNome = useMemo(
        () => cobradores.find((c) => c.id === cobradorIdEfetivo)?.nome || '',
        [cobradores, cobradorIdEfetivo],
    );

    const itensRelatorio = useMemo(
        () =>
            items.map((r) => ({
                data: r.data,
                cliente_id: r.cliente_id,
                cliente_codigo: r.cliente_codigo,
                cliente_nome: r.cliente_nome,
                contrato_codigo: r.contrato_codigo,
                parcela_codigo: r.parcela_codigo,
                parcela_numero: r.parcela_numero,
                total_parcelas: r.total_parcelas,
                qtd_parcelas: 1,
                forma_pagamento: r.forma_pagamento,
                valor_centavos: r.valor_centavos,
                status: r.status,
            })),
        [items],
    );

    const resumoSintetico = useMemo(() => calcularResumoSintetico(itensRelatorio), [itensRelatorio]);

    useEffect(() => {
        if (empresaIdsFiltro.length === 0) return;
        void listarCobradoresSelect(empresaIdsFiltro).then(setCobradores);
    }, [empresaIdsFiltro.join(','), dataRevisionEmpresa]);

    const cobradorIdConsulta = cobradorRestrito ? meuCobradorId || '' : cobradorId;

    useEffect(() => {
        if (cobradorRestrito && meuCobradorId) setCobradorId(meuCobradorId);
    }, [cobradorRestrito, meuCobradorId]);

    useEffect(() => {
        if (!cobradorId) {
            setCaixaRotulo('');
            return;
        }
        void carregarContasCobrador(cobradorId).then((v) => setCaixaRotulo(rotuloContasCobrador(v)));
    }, [cobradorId]);

    const carregar = useCallback(async () => {
        if (empresaIdsFiltro.length === 0) return;
        const idFiltro = cobradorRestrito ? meuCobradorId : cobradorId;
        if (!idFiltro) {
            showToast(
                cobradorRestrito
                    ? 'Seu usuário não está vinculado a um cobrador. Peça ao gestor para vincular em Cobradores → editar.'
                    : 'Selecione o cobrador.',
                'warning',
            );
            return;
        }
        setLoading(true);
        try {
            const rows = await listarRecebimentosCampo(empresaIdsFiltro, {
                cobrador_id: idFiltro,
                data_inicio: dataInicio,
                data_fim: dataFim,
            });
            setItems(rows);
        } catch (e) {
            showToast(mensagemErroSupabase(e, 'Erro ao carregar recebimentos'), 'error');
        } finally {
            setLoading(false);
        }
    }, [empresaIdsFiltro, cobradorId, meuCobradorId, cobradorRestrito, dataInicio, dataFim, showToast]);

    useEffect(() => {
        if (cobradorIdConsulta) void carregar();
    }, [cobradorIdConsulta, dataRevisionEmpresa]);

    const handleReimprimir = async (id: string) => {
        setReimprimindoId(id);
        try {
            await reimprimirReciboRecebimentoCampo(id, empresaIdsFiltro, modoImpressao);
            showToast('Recibo enviado para impressão.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao reimprimir.', 'error');
        } finally {
            setReimprimindoId(null);
        }
    };

    const payloadRelatorio = useCallback(async () => {
        const idFiltro = cobradorRestrito ? meuCobradorId : cobradorId;
        if (!idFiltro || !cobradorNome) {
            showToast('Selecione o cobrador.', 'warning');
            return null;
        }
        if (items.length === 0) {
            showToast('Nenhum recebimento no período.', 'warning');
            return null;
        }
        const empresa = await carregarContextoEmpresaRecibo();
        return {
            empresaNome: empresa.nome,
            cobradorNome,
            caixaNome: caixaRotulo,
            dataInicio,
            dataFim,
            itens: itensRelatorio,
        };
    }, [
        cobradorRestrito,
        meuCobradorId,
        cobradorId,
        cobradorNome,
        itensRelatorio,
        caixaRotulo,
        dataInicio,
        dataFim,
        showToast,
    ]);

    const handleRelatorio = async (tipo: TipoRelatorioCobradorPeriodo, modo: ModoReciboBaixaCobrador) => {
        const janelaPdf = modo === 'pdf' ? reservarJanelaImpressaoPdf() : null;
        setGerandoRelatorio(true);
        try {
            const base = await payloadRelatorio();
            if (!base) {
                if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
                return;
            }
            await imprimirRelatorioCobradorPeriodo({
                ...base,
                tipo,
                modo,
                janelaPdf,
            });
            const rotulo =
                tipo === 'sintetico' ? 'Relatório sintético' : 'Relatório analítico';
            showToast(
                modo === 'pdf'
                    ? `${rotulo} aberto em PDF — use Imprimir na aba ou salve o arquivo.`
                    : `${rotulo} enviado para a impressora.`,
                'success',
            );
        } catch (e) {
            if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
            showToast(e instanceof Error ? e.message : 'Falha ao gerar relatório.', 'error');
        } finally {
            setGerandoRelatorio(false);
        }
    };

    const handleBaixarPdf = async (tipo: TipoRelatorioCobradorPeriodo) => {
        setGerandoRelatorio(true);
        try {
            const base = await payloadRelatorio();
            if (!base) return;
            const blob = montarPdfRelatorioCobradorPeriodo({ tipo, ...base });
            const nome = nomeArquivoRelatorioCobradorPeriodo(
                base.cobradorNome,
                base.dataInicio,
                base.dataFim,
                tipo,
            );
            if (!(await downloadPdfBlob(blob, nome))) {
                showToast('Não foi possível baixar o PDF.', 'error');
                return;
            }
            showToast('PDF baixado.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao gerar PDF.', 'error');
        } finally {
            setGerandoRelatorio(false);
        }
    };

    const carregarSnapshotsCaixa = useCallback(async () => {
        const idFiltro = cobradorRestrito ? meuCobradorId : cobradorId;
        if (!idFiltro || !cobradorNome) {
            showToast('Selecione o cobrador.', 'warning');
            return null;
        }
        if (!caixaRotulo) {
            showToast('Nenhum caixa vinculado ao cobrador. Configure em Cobradores → editar.', 'warning');
            return null;
        }
        const empresa = await carregarContextoEmpresaRecibo();
        const snapshots = await montarSnapshotsPdfCaixaCobrador({
            cobradorId: idFiltro,
            dataInicio,
            dataFim,
            empresaNome: empresa.nome,
        });
        return { snapshots, cobradorNome };
    }, [
        cobradorRestrito,
        meuCobradorId,
        cobradorId,
        cobradorNome,
        caixaRotulo,
        dataInicio,
        dataFim,
        showToast,
    ]);

    const handleAbrirPdfCaixa = async () => {
        const janelaPdf = reservarJanelaImpressaoPdf('Gerando PDF do caixa…');
        setGerandoPdfCaixa(true);
        try {
            const ctx = await carregarSnapshotsCaixa();
            if (!ctx) {
                if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
                return;
            }
            const { snapshots, cobradorNome: nome } = ctx;
            const primeiro = snapshots[0];
            const blob = gerarBlobPdfCaixaCobrador(primeiro);
            const titulo = nomeArquivoPdfCaixaCobrador(
                nome,
                primeiro.data_abertura,
                primeiro.conta_nome,
            );
            const ok = await abrirPdfNaJanelaReservada(janelaPdf, blob, titulo);
            if (!ok) {
                showToast('Não foi possível abrir o PDF. Permita pop-ups neste site.', 'error');
                return;
            }
            if (snapshots.length > 1) {
                showToast(
                    `Período com ${snapshots.length} dias de caixa — exibindo o primeiro. Use Baixar PDF do caixa para salvar todos.`,
                    'success',
                );
            } else {
                showToast('PDF do caixa aberto.', 'success');
            }
        } catch (e) {
            if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
            showToast(e instanceof Error ? e.message : 'Falha ao gerar PDF do caixa.', 'error');
        } finally {
            setGerandoPdfCaixa(false);
        }
    };

    const handleBaixarPdfCaixa = async () => {
        setGerandoPdfCaixa(true);
        try {
            const ctx = await carregarSnapshotsCaixa();
            if (!ctx) return;
            const { snapshots, cobradorNome: nome } = ctx;
            let baixados = 0;
            for (const snap of snapshots) {
                const blob = gerarBlobPdfCaixaCobrador(snap);
                const arquivo = nomeArquivoPdfCaixaCobrador(nome, snap.data_abertura, snap.conta_nome);
                if (await downloadPdfBlob(blob, arquivo)) baixados += 1;
            }
            if (baixados === 0) {
                showToast('Não foi possível baixar o PDF do caixa.', 'error');
                return;
            }
            showToast(
                baixados === 1
                    ? 'PDF do caixa baixado.'
                    : `${baixados} PDFs do caixa baixados (um por dia).`,
                'success',
            );
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao gerar PDF do caixa.', 'error');
        } finally {
            setGerandoPdfCaixa(false);
        }
    };

    return (
        <div className="space-y-6 pb-12">
            <PageHeader
                title={cobradorRestrito ? 'Minhas impressões' : 'Impressões'}
                subtitle={
                    cobradorRestrito
                        ? 'Somente os seus recebimentos no período — você não vê dados de outros cobradores.'
                        : 'Consulte o que foi recebido no período, reimprima comprovantes e imprima o resumo do caixa.'
                }
            />

            {cobradorRestrito && !vinculoLoading && !meuCobradorId && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    Usuário sem vínculo com cadastro de cobrador. O gestor precisa vincular seu login em{' '}
                    <strong>Cobradores → editar</strong>.
                </p>
            )}

            <ImpressoraBluetoothSetup />

            <Card className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Select
                        label="Cobrador"
                        value={cobradorId}
                        onChange={(e) => setCobradorId(e.target.value)}
                        disabled={cobradorRestrito}
                    >
                        <option value="">Selecione…</option>
                        {cobradores.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.nome}
                            </option>
                        ))}
                    </Select>
                    <Input
                        label="Data inicial"
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                    />
                    <Input
                        label="Data final"
                        type="date"
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                    />
                    <Select
                        label="Modo de impressão"
                        value={modoImpressao}
                        onChange={(e) => setModoImpressao(e.target.value as ModoReciboBaixaCobrador)}
                    >
                        <option value="termica">Térmica / Bluetooth</option>
                        <option value="pdf">PDF (A5)</option>
                    </Select>
                </div>
                {caixaRotulo ? (
                    <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        Caixa vinculado: <strong>{caixaRotulo}</strong>
                    </p>
                ) : cobradorId ? (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        Nenhum caixa vinculado — configure em Cobradores → editar.
                    </p>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-gray-100">
                    <Select
                        label="Tipo de relatório"
                        value={tipoRelatorio}
                        onChange={(e) => setTipoRelatorio(e.target.value as TipoRelatorioCobradorPeriodo)}
                    >
                        <option value="sintetico">Sintético (resumido)</option>
                        <option value="analitico">Analítico (detalhado)</option>
                    </Select>
                    <p className="text-xs text-gray-600 sm:col-span-2 -mt-1">
                        {tipoRelatorio === 'sintetico'
                            ? 'Resumo: total PIX, total cartão, quantidade de clientes e total geral do período.'
                            : 'Detalhe: contrato, nome do cliente, parcelas pagas e valor de cada recebimento.'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void carregar()} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!cobradorIdEfetivo || items.length === 0 || gerandoRelatorio}
                        onClick={() => void handleRelatorio(tipoRelatorio, modoImpressao)}
                    >
                        {modoImpressao === 'termica' ? (
                            <Printer className="h-4 w-4 mr-2" />
                        ) : (
                            <FileText className="h-4 w-4 mr-2" />
                        )}
                        {gerandoRelatorio
                            ? 'Gerando…'
                            : modoImpressao === 'pdf'
                              ? `Abrir PDF ${tipoRelatorio === 'sintetico' ? 'sintético' : 'analítico'}`
                              : `Imprimir ${tipoRelatorio === 'sintetico' ? 'sintético' : 'analítico'}`}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!cobradorIdEfetivo || items.length === 0 || gerandoRelatorio}
                        onClick={() => void handleBaixarPdf(tipoRelatorio)}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar PDF
                    </Button>
                </div>
                <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-sm font-medium text-gray-800">Movimentações do caixa (Tesouraria)</p>
                    <p className="text-xs text-gray-500">
                        Mesmo relatório de entradas/saídas da Tesouraria, do caixa vinculado ao cobrador no período.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!cobradorIdEfetivo || !caixaRotulo || gerandoPdfCaixa}
                            onClick={() => void handleAbrirPdfCaixa()}
                        >
                            <FileText className="h-4 w-4 mr-2" />
                            {gerandoPdfCaixa ? 'Gerando…' : 'Abrir PDF do caixa'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!cobradorIdEfetivo || !caixaRotulo || gerandoPdfCaixa}
                            onClick={() => void handleBaixarPdfCaixa()}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Baixar PDF do caixa
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="p-4 bg-violet-50 border-violet-100">
                    <p className="text-xs font-bold text-violet-700 uppercase">Total PIX</p>
                    <p className="text-xl font-bold text-violet-900 mt-1">
                        {formatCurrency(resumoSintetico.totalPixCentavos)}
                    </p>
                </Card>
                <Card className="p-4 bg-blue-50 border-blue-100">
                    <p className="text-xs font-bold text-blue-700 uppercase">Total cartão</p>
                    <p className="text-xl font-bold text-blue-900 mt-1">
                        {formatCurrency(resumoSintetico.totalCartaoCentavos)}
                    </p>
                </Card>
                <Card className="p-4 bg-amber-50 border-amber-100">
                    <p className="text-xs font-bold text-amber-700 uppercase">Clientes</p>
                    <p className="text-xl font-bold text-amber-900 mt-1">{resumoSintetico.qtdClientes}</p>
                </Card>
                <Card className="p-4 bg-green-50 border-green-100">
                    <p className="text-xs font-bold text-green-700 uppercase">Total geral</p>
                    <p className="text-xl font-bold text-green-900 mt-1">
                        {formatCurrency(resumoSintetico.totalCentavos)}
                    </p>
                </Card>
            </div>

            <Card className="overflow-hidden border-gray-200">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b">
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Data</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Contrato</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Cliente</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Parc.</th>
                                <th className="text-left py-3 px-4 font-semibold text-gray-600">Forma</th>
                                <th className="text-right py-3 px-4 font-semibold text-gray-600">Valor</th>
                                <th className="text-center py-3 px-4 font-semibold text-gray-600">Recibo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-12 text-center text-gray-400">
                                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                        Nenhum recebimento no período. Ajuste as datas e clique em Atualizar.
                                    </td>
                                </tr>
                            ) : (
                                items.map((item, idx) => {
                                    const linha = itensRelatorio[idx];
                                    return (
                                    <tr key={item.id} className="hover:bg-gray-50/50">
                                        <td className="py-3 px-4 text-gray-600">
                                            {new Date(`${item.data}T12:00:00`).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="py-3 px-4 font-mono text-xs text-gray-700">
                                            {rotuloContratoItem(linha)}
                                        </td>
                                        <td className="py-3 px-4 font-medium text-gray-900">
                                            {item.cliente_nome}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 text-xs">
                                            {rotuloParcelasItem(linha)}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 capitalize">
                                            {labelFormaPagamentoRecibo(item.forma_pagamento) || item.forma_pagamento}
                                        </td>
                                        <td className="py-3 px-4 text-right font-semibold text-gray-900">
                                            {formatCurrency(item.valor_centavos)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={reimprimindoId === item.id}
                                                onClick={() => void handleReimprimir(item.id)}
                                            >
                                                {modoImpressao === 'termica' ? (
                                                    <Bluetooth className="h-3.5 w-3.5 mr-1" />
                                                ) : (
                                                    <FileText className="h-3.5 w-3.5 mr-1" />
                                                )}
                                                {reimprimindoId === item.id ? '…' : 'Reimprimir'}
                                            </Button>
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <p className="text-xs text-gray-500 max-w-2xl">
                <strong>Sintético / Analítico:</strong> resumo dos recebimentos em campo (não é o extrato da Tesouraria).
                <strong> PDF do caixa:</strong> movimentações do caixa vinculado, igual ao da Tesouraria. Comprovantes
                individuais: <strong>Reimprimir</strong> na tabela.
            </p>
        </div>
    );
};

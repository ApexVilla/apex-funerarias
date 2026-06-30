import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { abrirPdfNaJanelaReservada, reservarJanelaImpressaoPdf } from './printPdfBlob';
import type { LinhaComissaoOperacional, PagamentoComissaoOperacionalDto } from './comissaoOperacionalPagamentoService';
import { generateReciboPDF, valorPorExtenso } from './ReciboService';
import { drawRelatorioComissaoFenixHeader, PDF_PALETTE } from './documentoPdfLayout';

const fmt = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const fmtData = (iso: string) => {
  if (!iso) return '—';
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
};

export type RelatorioComissaoOperacionalInput = {
  colaboradorNome: string;
  colaboradorCargo: string;
  periodoInicio: string;
  periodoFim: string;
  empresaNome?: string;
  empresaLogoUrl?: string | null;
  empresaCnpj?: string;
  linhas: LinhaComissaoOperacional[];
  pagamento?: PagamentoComissaoOperacionalDto | null;
  apenasConfirmadas?: boolean;
};

export async function gerarRelatorioComissaoOperacionalPdf(
  input: RelatorioComissaoOperacionalInput,
): Promise<boolean> {
  const janela = reservarJanelaImpressaoPdf();
  const linhas = input.apenasConfirmadas
    ? input.linhas.filter((l) => l.status_label !== 'Aguardando' && l.status_label !== 'Cancelado')
    : input.linhas;

  const totalOs = linhas.length;
  const faturamento = linhas.reduce((s, l) => s + l.valor_os_centavos, 0);
  const comissao = linhas.reduce((s, l) => s + l.valor_comissao_centavos, 0);
  const comissaoPaga = linhas.filter((l) => l.ja_pago).reduce((s, l) => s + l.valor_comissao_centavos, 0);
  const comissaoPendente = comissao - comissaoPaga;
  const osContaBaixada = linhas.filter((l) => l.conta_baixada).length;
  const osComissaoAposBaixa = linhas.filter((l) => l.comissao_paga_apos_baixa === true).length;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const periodoTxt = `${fmtData(input.periodoInicio)} — ${fmtData(input.periodoFim)}`;

  let startY = await drawRelatorioComissaoFenixHeader(doc, W, {
    subtituloModulo: 'Relatório de Comissão Operacional',
    badgeTitulo: 'COMISSÃO OPERACIONAL',
    badgeSubtitulo: periodoTxt,
    empresaLogoUrl: input.empresaLogoUrl,
    empresaCnpj: input.empresaCnpj,
    unidadeNome: input.empresaNome,
  });

  startY += 4;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_PALETTE.TEXTO_MEDIO);
  doc.text(`Colaborador: ${input.colaboradorNome}`, PDF_PALETTE.MX, startY);
  startY += 5;
  doc.text(`Função: ${input.colaboradorCargo}`, PDF_PALETTE.MX, startY);
  startY += 5;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, PDF_PALETTE.MX, startY);
  startY += 6;

  if (input.pagamento) {
    doc.setTextColor(5, 120, 90);
    doc.text(
      `Pago em ${fmtData(input.pagamento.pago_em)} — Recibo ${input.pagamento.numero_recibo}`,
      PDF_PALETTE.MX,
      startY,
    );
    startY += 8;
  }

  const body = linhas.map((l) => [
    l.codigo,
    fmtData(l.data_servico),
    l.cliente_nome.length > 22 ? `${l.cliente_nome.slice(0, 22)}…` : l.cliente_nome,
    l.status_label,
    l.conta_baixada ? (l.conta_baixada_em ? `Sim (${fmtData(l.conta_baixada_em)})` : 'Sim') : 'Não',
    l.ja_pago ? (l.comissao_paga_em ? `Sim (${fmtData(l.comissao_paga_em)})` : 'Sim') : 'Não',
    l.relacao_baixa_label,
    fmt(l.valor_os_centavos),
    fmt(l.valor_comissao_centavos),
  ]);

  autoTable(doc, {
    startY,
    head: [['OS', 'Data', 'Cliente', 'Status', 'Baixa', 'Comissão', 'Após baixa', 'Valor OS', 'Comissão']],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PDF_PALETTE.AZUL_PROFUNDO },
    alternateRowStyles: { fillColor: PDF_PALETTE.CINZA_FUNDO },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80;

  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(`Total de OS: ${totalOs}`, 14, finalY + 10);
  doc.text(`Contas baixadas: ${osContaBaixada}`, 14, finalY + 16);
  doc.text(`Comissão paga após baixa: ${osComissaoAposBaixa} OS`, 14, finalY + 22);
  doc.text(`Faturamento: ${fmt(faturamento)}`, 14, finalY + 28);
  doc.text(`Comissão total: ${fmt(comissao)}`, 14, finalY + 34);
  if (!input.pagamento) {
    doc.text(`Comissão já paga: ${fmt(comissaoPaga)}`, 14, finalY + 40);
    doc.text(`Comissão pendente: ${fmt(comissaoPendente)}`, 14, finalY + 46);
  }

  const blob = doc.output('blob');
  await abrirPdfNaJanelaReservada(janela, blob);
  return true;
}

export async function gerarReciboPagamentoComissaoOperacional(params: {
  pagamento: PagamentoComissaoOperacionalDto;
  colaboradorNome: string;
  empresaId: string;
  empresaNome?: string;
  pagoPorNome: string;
  totalOs: number;
}): Promise<void> {
  const valorReais = params.pagamento.valor_comissao_centavos / 100;
  const periodoTxt = `${fmtData(params.pagamento.periodo_inicio)} a ${fmtData(params.pagamento.periodo_fim)}`;

  await generateReciboPDF(
    {
      numero: params.pagamento.numero_recibo,
      data: fmtData(params.pagamento.pago_em),
      clienteNome: params.colaboradorNome,
      valor: valorReais,
      valorExtenso: valorPorExtenso(valorReais),
      referencia: `Pagamento de comissão operacional — período ${periodoTxt}`,
      descricao: `Comissão sobre ${params.totalOs} ordem(ns) de serviço confirmada(s)`,
      vencimento: fmtData(params.pagamento.periodo_fim),
      empresaId: params.empresaId,
      empresaNome: params.empresaNome,
      tipoOperacao: 'pagamento',
      modoDocumento: 'quitado',
      dataPagamento: fmtData(params.pagamento.pago_em),
      atendenteNome: params.pagoPorNome,
      mesReferencia: periodoTxt,
    },
    'newtab',
    window.open('', '_blank'),
  );
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCentavos } from './FinanceiroStore';
import {
  calcularResumoSintetico,
  rotuloContratoItem,
  rotuloParcelasItem,
  type ItemRelatorioCobradorPeriodo,
  type TipoRelatorioCobradorPeriodo,
} from './cobradorRelatorioPeriodo';
import { labelFormaPagamentoRecibo } from './ReciboTermicoService';

export type { ItemRelatorioCobradorPeriodo, TipoRelatorioCobradorPeriodo };

export type RelatorioCobradorPeriodoPdfInput = {
  tipo: TipoRelatorioCobradorPeriodo;
  empresaNome: string;
  cobradorNome: string;
  caixaNome?: string;
  dataInicio: string;
  dataFim: string;
  itens: ItemRelatorioCobradorPeriodo[];
};

function fmtData(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

function pdfParaBlob(doc: jsPDF): Blob {
  const buf = doc.output('arraybuffer');
  if (!buf || (buf as ArrayBuffer).byteLength === 0) {
    throw new Error('PDF vazio após geração.');
  }
  return new Blob([buf], { type: 'application/pdf' });
}

function desenharCabecalho(
  doc: jsPDF,
  input: RelatorioCobradorPeriodoPdfInput,
  tituloRelatorio: string,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(194, 65, 12);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(tituloRelatorio, 14, 12);
  doc.setFontSize(8);
  doc.text(`Impresso em: ${new Date().toLocaleString('pt-BR')}`, pageW - 14, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.text(String(input.empresaNome || '').slice(0, 90), 14, 20);
  doc.text(`Cobrador: ${input.cobradorNome}`, 14, 25);
  const caixa = input.caixaNome?.trim();
  const periodo = `Período: ${fmtData(input.dataInicio)} a ${fmtData(input.dataFim)}`;
  doc.text(caixa ? `${periodo}  |  Caixa: ${caixa}` : periodo, 14, 30);
  doc.setTextColor(30, 30, 30);
  return 38;
}

function montarPdfSintetico(input: RelatorioCobradorPeriodoPdfInput): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const resumo = calcularResumoSintetico(input.itens);
  let y = desenharCabecalho(doc, input, 'RELATÓRIO SINTÉTICO — COBRADOR');

  const linhas: string[][] = [
    ['Total PIX', formatCentavos(resumo.totalPixCentavos)],
    ['Total cartão', formatCentavos(resumo.totalCartaoCentavos)],
  ];
  if (resumo.totalDinheiroCentavos > 0) {
    linhas.push(['Total dinheiro', formatCentavos(resumo.totalDinheiroCentavos)]);
  }
  if (resumo.totalOutrosCentavos > 0) {
    linhas.push(['Outras formas', formatCentavos(resumo.totalOutrosCentavos)]);
  }
  linhas.push(['Total de clientes', String(resumo.qtdClientes)]);
  linhas.push(['Qtd. recebimentos', String(resumo.qtdRecebimentos)]);
  linhas.push(['TOTAL GERAL', formatCentavos(resumo.totalCentavos)]);

  autoTable(doc, {
    head: [['Descrição', 'Valor']],
    body: linhas,
    startY: y + 6,
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: 3 },
    headStyles: { fillColor: [194, 65, 12], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 20, right: 20 },
    didParseCell: (data) => {
      if (data.row.index === linhas.length - 1 && data.section === 'body') {
        data.cell.styles.fillColor = [240, 253, 244];
        data.cell.styles.fontSize = 12;
      }
    },
  });

  return pdfParaBlob(doc);
}

function montarPdfAnalitico(input: RelatorioCobradorPeriodoPdfInput): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const resumo = calcularResumoSintetico(input.itens);
  let y = desenharCabecalho(doc, input, 'RELATÓRIO ANALÍTICO — COBRADOR');

  const itensOrdenados = [...input.itens].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      rotuloContratoItem(a).localeCompare(rotuloContratoItem(b), 'pt-BR') ||
      a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR'),
  );

  const body = itensOrdenados.map((r) => [
    fmtData(r.data),
    rotuloContratoItem(r),
    String(r.cliente_nome || '').slice(0, 45),
    rotuloParcelasItem(r),
    labelFormaPagamentoRecibo(r.forma_pagamento) || r.forma_pagamento,
    formatCentavos(r.valor_centavos),
  ]);

  if (body.length === 0) {
    doc.setFontSize(10);
    doc.text('Nenhum recebimento no período.', 14, y + 4);
  } else {
    autoTable(doc, {
      head: [['Data', 'Contrato', 'Cliente', 'Parcelas', 'Forma', 'Valor']],
      body,
      startY: y + 4,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [194, 65, 12], textColor: 255 },
      columnStyles: { 5: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY as number) || y + 20;

    autoTable(doc, {
      head: [['', '']],
      body: [
        ['Total PIX', formatCentavos(resumo.totalPixCentavos)],
        ['Total cartão', formatCentavos(resumo.totalCartaoCentavos)],
        ['Total clientes', String(resumo.qtdClientes)],
        ['TOTAL GERAL', formatCentavos(resumo.totalCentavos)],
      ],
      startY: y + 4,
      theme: 'plain',
      styles: { fontSize: 9, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    });
  }

  return pdfParaBlob(doc);
}

export function montarPdfRelatorioCobradorPeriodo(input: RelatorioCobradorPeriodoPdfInput): Blob {
  return input.tipo === 'analitico' ? montarPdfAnalitico(input) : montarPdfSintetico(input);
}

export function nomeArquivoRelatorioCobradorPeriodo(
  cobradorNome: string,
  dataInicio: string,
  dataFim: string,
  tipo: TipoRelatorioCobradorPeriodo,
): string {
  const slug = cobradorNome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `relatorio-${tipo}-cobrador-${slug || 'cobrador'}-${dataInicio}_${dataFim}.pdf`;
}

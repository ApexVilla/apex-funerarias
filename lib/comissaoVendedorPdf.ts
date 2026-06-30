import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { abrirPdfNaJanelaReservada, reservarJanelaImpressaoPdf } from './printPdfBlob';
import type { PagamentoComissaoVendedorDto } from './comissaoVendedorService';
import type { PropostaVendedorLinha } from './comissaoVendedorCalculo';
import { generateReciboPDF, valorPorExtenso } from './ReciboService';
import { drawRelatorioComissaoFenixHeader, PDF_PALETTE } from './documentoPdfLayout';

const fmt = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const fmtData = (iso: string | null | undefined) => {
  if (!iso) return '—';
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
};

export type RelatorioComissaoVendedorInput = {
  vendedorNome: string;
  periodoInicio: string;
  periodoFim: string;
  empresaNome?: string;
  empresaLogoUrl?: string | null;
  empresaCnpj?: string;
  tipoRelatorio: 'confirmadas' | 'realizadas';
  linhas: PropostaVendedorLinha[];
  linhasComissao?: Array<PropostaVendedorLinha & { valor_comissao_centavos: number }>;
  faixaLabel?: string;
  valorPorContratoCentavos?: number;
  pagamento?: PagamentoComissaoVendedorDto | null;
};

export async function gerarRelatorioComissaoVendedorPdf(input: RelatorioComissaoVendedorInput): Promise<boolean> {
  const janela = reservarJanelaImpressaoPdf();
  const titulo =
    input.tipoRelatorio === 'confirmadas'
      ? 'Relatório de Comissão — Contratos Confirmados'
      : 'Relatório de Vendas — Contratos Realizados';

  const linhas =
    input.tipoRelatorio === 'confirmadas' && input.linhasComissao
      ? input.linhasComissao
      : input.linhas;

  const totalComissao =
    input.tipoRelatorio === 'confirmadas'
      ? (input.linhasComissao || linhas).reduce(
          (s, l) => s + ((l as { valor_comissao_centavos?: number }).valor_comissao_centavos || 0),
          0,
        )
      : 0;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const periodoTxt = `${fmtData(input.periodoInicio)} — ${fmtData(input.periodoFim)}`;
  const badgeTitulo =
    input.tipoRelatorio === 'confirmadas'
      ? 'COMISSÃO — CONTRATOS CONFIRMADOS'
      : 'VENDAS — CONTRATOS REALIZADOS';

  let startY = await drawRelatorioComissaoFenixHeader(doc, W, {
    subtituloModulo: titulo,
    badgeTitulo,
    badgeSubtitulo: periodoTxt,
    empresaLogoUrl: input.empresaLogoUrl,
    empresaCnpj: input.empresaCnpj,
    unidadeNome: input.empresaNome,
  });

  startY += 4;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_PALETTE.TEXTO_MEDIO);
  doc.text(`Vendedor: ${input.vendedorNome}`, PDF_PALETTE.MX, startY);
  startY += 5;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, PDF_PALETTE.MX, startY);
  startY += 6;
  if (input.tipoRelatorio === 'confirmadas' && input.faixaLabel) {
    doc.text(`Faixa aplicada: ${input.faixaLabel}`, 14, startY);
    startY += 6;
    if (input.valorPorContratoCentavos != null) {
      doc.text(`Valor por contrato confirmado: ${fmt(input.valorPorContratoCentavos)}`, 14, startY);
      startY += 6;
    }
  }

  if (input.pagamento) {
    doc.setTextColor(5, 120, 90);
    doc.text(
      `Pago em ${fmtData(input.pagamento.pago_em)} — Recibo ${input.pagamento.numero_recibo}`,
      14,
      startY,
    );
    startY += 8;
  }

  const body = linhas.map((l) => {
    const comissao = (l as { valor_comissao_centavos?: number }).valor_comissao_centavos;
    const cols = [
      String(l.sequencial),
      fmtData(l.data_contrato || l.created_at.slice(0, 10)),
      fmtData(l.data_confirmacao),
      (l.contribuinte_nome || '').length > 24
        ? `${l.contribuinte_nome.slice(0, 24)}…`
        : l.contribuinte_nome,
      l.plano_nome || '—',
      l.confirmada ? 'Sim' : 'Não',
      l.ja_pago_comissao ? 'Sim' : 'Não',
    ];
    if (input.tipoRelatorio === 'confirmadas') {
      cols.push(fmt(comissao || 0));
    }
    return cols;
  });

  const head =
    input.tipoRelatorio === 'confirmadas'
      ? [['Prop.', 'Contrato', 'Confirmação', 'Cliente', 'Plano', '1ª parc.', 'Comiss. paga', 'Comissão']]
      : [['Prop.', 'Contrato', 'Confirmação', 'Cliente', 'Plano', '1ª parc.', 'Comiss. paga']];

  autoTable(doc, {
    startY,
    head,
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PDF_PALETTE.AZUL_PROFUNDO },
    alternateRowStyles: { fillColor: PDF_PALETTE.AZUL_CLARO },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80;
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(`Total de registros: ${linhas.length}`, 14, finalY + 10);
  const confirmadas = linhas.filter((l) => l.confirmada).length;
  doc.text(`Confirmadas (1ª mensalidade quitada no financeiro): ${confirmadas}`, 14, finalY + 16);
  if (input.tipoRelatorio === 'confirmadas') {
    doc.text(`Comissão total: ${fmt(totalComissao)}`, 14, finalY + 22);
  }

  const blob = doc.output('blob');
  return await abrirPdfNaJanelaReservada(janela, blob);
}

export async function gerarReciboPagamentoComissaoVendedor(params: {
  pagamento: PagamentoComissaoVendedorDto;
  vendedorNome: string;
  empresaId: string;
  empresaNome?: string;
  pagoPorNome: string;
}): Promise<void> {
  const valorReais = params.pagamento.valor_comissao_centavos / 100;
  const periodoTxt = `${fmtData(params.pagamento.periodo_inicio)} a ${fmtData(params.pagamento.periodo_fim)}`;

  await generateReciboPDF(
    {
      numero: params.pagamento.numero_recibo,
      data: fmtData(params.pagamento.pago_em),
      clienteNome: params.vendedorNome,
      valor: valorReais,
      valorExtenso: valorPorExtenso(valorReais),
      referencia: `Pagamento de comissão comercial — período ${periodoTxt}`,
      descricao: `Comissão sobre ${params.pagamento.total_confirmados} contrato(s) com baixa da 1ª parcela. Faixa: ${params.pagamento.faixa_aplicada_label || '—'}.`,
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

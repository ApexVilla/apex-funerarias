import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadLogoForPdf, fitLogoMm } from './fenixLogo';
import { carregarEmpresaReciboContext } from './reciboEmpresaContexto';
import { abrirPdfParaImprimir } from './printPdfBlob';
import {
  agruparServicosPorCategoria,
  formatarPrecoServico,
  labelCategoriaServico,
  ordenarServicosCatalogo,
  type ServicoCatalogoItem,
} from './servicosFunerariosCatalogo';

export type ServicoCatalogoPdfItem = ServicoCatalogoItem;

export async function buildServicosCatalogoPdfBlob(
  servicos: ServicoCatalogoPdfItem[],
  empresaId?: string | null,
): Promise<{ blob: Blob; filename: string }> {
  const empresa = await carregarEmpresaReciboContext(empresaId);
  const ativos = servicos.filter((s) => s.ativo !== false);
  const ordenados = ordenarServicosCatalogo(ativos);

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  const AZUL = [8, 30, 70] as [number, number, number];
  const AZUL_MED = [22, 70, 145] as [number, number, number];
  const DOURADO = [198, 158, 60] as [number, number, number];
  const BORDER = [210, 220, 235] as [number, number, number];
  const TEXTO = [20, 30, 48] as [number, number, number];

  const logo = await loadLogoForPdf(empresa.logoUrl);

  doc.setFillColor(...AZUL);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setFillColor(...DOURADO);
  doc.rect(0, 32, pageW, 2, 'F');
  doc.setFillColor(...DOURADO);
  doc.rect(0, 0, 4, 34, 'F');

  let textoX = margin + 2;
  if (logo) {
    try {
      const { w, h } = fitLogoMm(logo.aspect, 28, 22);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 2, 5, w + 2, h + 2, 1.5, 1.5, 'F');
      doc.addImage(logo.dataUrl, logo.format, margin + 3, 6, w, h, undefined, 'FAST');
      textoX = margin + w + 8;
    } catch {
      /* logo opcional */
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(empresa.nome, textoX, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(185, 205, 235);
  doc.text(`CNPJ: ${empresa.cnpj}`, textoX, 20);
  if (empresa.endereco) {
    doc.text(empresa.endereco, textoX, 25.5, { maxWidth: pageW - textoX - margin - 50 });
  }

  doc.setTextColor(...DOURADO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CATÁLOGO DE SERVIÇOS', pageW - margin, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  const emitido = new Date().toLocaleDateString('pt-BR');
  doc.text(`Emitido em ${emitido}`, pageW - margin, 19.5, { align: 'right' });
  doc.text('Tabela de referência — valores sujeitos a alteração', pageW - margin, 25, { align: 'right' });

  const body: (string | { content: string; colSpan: number; styles: Record<string, unknown> })[][] = [];
  let seq = 0;
  let catAtual = '';

  for (const s of ordenados) {
    const cat = s.categoria || 'geral';
    if (cat !== catAtual) {
      catAtual = cat;
      body.push([
        {
          content: labelCategoriaServico(cat).toUpperCase(),
          colSpan: 4,
          styles: { fillColor: AZUL_MED, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        },
      ]);
    }
    seq += 1;
    body.push([String(seq), s.nome, s.descricao || '—', formatarPrecoServico(s)]);
  }

  autoTable(doc, {
    startY: 40,
    margin: { left: margin, right: margin },
    head: [['#', 'Serviço', 'Descrição', 'Valor']],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: TEXTO,
      lineColor: BORDER,
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: AZUL,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 52, fontStyle: 'bold' },
      2: { cellWidth: 68 },
      3: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: () => {
      const footerY = pageH - 10;
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(margin, footerY - 4, pageW - margin, footerY - 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120, 130, 150);
      doc.text(
        `${empresa.nome} · ${empresa.telefone} · Valores em reais (BRL)`,
        pageW / 2,
        footerY,
        { align: 'center' },
      );
    },
  });

  const unidade = (empresa.nome || 'catalogo').replace(/\s+/g, '-').toLowerCase();
  const filename = `Catalogo-Servicos-${unidade}-${emitido.replace(/\//g, '-')}.pdf`;
  const blob = doc.output('blob');
  return { blob, filename };
}

export async function imprimirServicosCatalogoPdf(
  servicos: ServicoCatalogoPdfItem[],
  empresaId?: string | null,
): Promise<boolean> {
  const { blob, filename } = await buildServicosCatalogoPdfBlob(servicos, empresaId);
  return await abrirPdfParaImprimir(blob, filename);
}

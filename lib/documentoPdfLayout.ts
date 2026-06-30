import type jsPDF from 'jspdf';
import { drawLogoPdf, loadLogoForPdf, type LogoPdfAsset } from './fenixLogo';
import { JURIDICA_APARECIDA } from './contratoEmpresaJuridica';

export const PDF_PALETTE = {
  AZUL_PROFUNDO: [8, 28, 64] as [number, number, number],
  AZUL_MEDIO: [22, 70, 150] as [number, number, number],
  AZUL_CLARO: [235, 242, 255] as [number, number, number],
  DOURADO: [198, 158, 60] as [number, number, number],
  DOURADO_SUAVE: [252, 246, 222] as [number, number, number],
  CINZA_FUNDO: [246, 248, 252] as [number, number, number],
  CINZA_BORDA: [210, 220, 235] as [number, number, number],
  TEXTO_ESCURO: [20, 28, 45] as [number, number, number],
  TEXTO_MEDIO: [75, 88, 110] as [number, number, number],
  BRANCO: [255, 255, 255] as [number, number, number],
  MX: 14,
};

export type DocumentoPdfGrid = {
  mx: number;
  pad: number;
  innerW: number;
  colGap: number;
  colW: number;
  col1X: number;
  col2X: number;
  centerX: number;
};

/** Nova página se não couber o bloco (evita conteúdo “invisível” abaixo da folha). */
export function ensurePdfVerticalSpace(
  doc: jsPDF,
  y: number,
  neededMm: number,
  topMargin = 18,
): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + neededMm > pageH - 16) {
    doc.addPage();
    return topMargin;
  }
  return y;
}

export function pdfBlobFromJsPDF(doc: jsPDF): Blob {
  try {
    const out = doc.output('blob');
    if (out instanceof Blob && out.size > 200) return out;
  } catch {
    /* fallback */
  }
  const buf = doc.output('arraybuffer');
  return new Blob([buf], { type: 'application/pdf' });
}

export function formatDataPdfBr(iso?: string | null): string {
  const raw = String(iso ?? '').trim();
  if (!raw) return '—';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const d = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('pt-BR');
}

export function getDocumentoPdfGrid(pageWidth: number): DocumentoPdfGrid {
  const mx = PDF_PALETTE.MX;
  const pad = mx + 4;
  const innerW = pageWidth - mx * 2 - 8;
  const colGap = 8;
  const colW = (innerW - colGap) / 2;
  return {
    mx,
    pad,
    innerW,
    colGap,
    colW,
    col1X: pad,
    col2X: pad + colW + colGap,
    centerX: pageWidth / 2,
  };
}

export type DocumentoPdfHeaderOpts = {
  empresaNome: string;
  subtitulo: string;
  cnpj: string;
  unidadeNome?: string | null;
  badgeTitulo: string;
  badgeSubtitulo: string;
  logo?: LogoPdfAsset | null;
};

/** Cabeçalho centralizado — padrão organizado para propostas e documentos comerciais. */
export function drawDocumentoPdfHeaderCentered(
  doc: jsPDF,
  pageWidth: number,
  opts: DocumentoPdfHeaderOpts,
): number {
  const { TEXTO_ESCURO, TEXTO_MEDIO, MX } = PDF_PALETTE;
  const headerH = 26;
  const cx = pageWidth / 2;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MX, headerH, pageWidth - MX, headerH);

  if (opts.logo) {
    drawLogoPdf(doc, opts.logo, {
      x: MX,
      y: 4,
      maxW: 24,
      maxH: 12,
      align: 'left',
    });
  }

  doc.setTextColor(...TEXTO_ESCURO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(opts.empresaNome.toUpperCase(), cx, 8, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXTO_MEDIO);
  doc.text(opts.subtitulo.toUpperCase(), cx, 13, { align: 'center' });

  doc.setFontSize(7);
  const unidadeTxt = opts.unidadeNome?.trim()
    ? `  ·  UNIDADE: ${opts.unidadeNome.trim().toUpperCase()}`
    : '';
  doc.text(`CNPJ: ${opts.cnpj}${unidadeTxt}`, cx, 18, { align: 'center' });

  const badgeW = Math.min(110, pageWidth - 40);
  const badgeX = cx - badgeW / 2;
  const badgeY = 21;
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(180, 180, 180);
  doc.roundedRect(badgeX, badgeY, badgeW, 6.5, 0.8, 0.8, 'FD');

  doc.setTextColor(...TEXTO_ESCURO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(`${opts.badgeTitulo.toUpperCase()}  |  ${opts.badgeSubtitulo.toUpperCase()}`, cx, badgeY + 4.5, { align: 'center' });

  return headerH + 6.5 + 4;
}

/** Cabeçalho Fênix para relatórios de comissão (logo + faixa azul). */
export async function drawRelatorioComissaoFenixHeader(
  doc: jsPDF,
  pageWidth: number,
  opts: {
    subtituloModulo: string;
    badgeTitulo: string;
    badgeSubtitulo: string;
    empresaLogoUrl?: string | null;
    empresaCnpj?: string;
    unidadeNome?: string | null;
  },
): Promise<number> {
  const logo = await loadLogoForPdf(opts.empresaLogoUrl);
  return drawDocumentoPdfHeaderCentered(doc, pageWidth, {
    empresaNome: 'FENIX FUNERÁRIA',
    subtitulo: opts.subtituloModulo,
    cnpj: opts.empresaCnpj || JURIDICA_APARECIDA.cnpjFormatado,
    unidadeNome: opts.unidadeNome,
    badgeTitulo: opts.badgeTitulo,
    badgeSubtitulo: opts.badgeSubtitulo,
    logo,
  });
}

/** Cabeçalho lateral (ficha de cadastro legado). */
export function drawDocumentoPdfHeader(
  doc: jsPDF,
  pageWidth: number,
  opts: DocumentoPdfHeaderOpts & { direitaTitulo?: string; direitaSubtitulo?: string },
): number {
  return drawDocumentoPdfHeaderCentered(doc, pageWidth, {
    ...opts,
    badgeTitulo: opts.badgeTitulo || opts.direitaTitulo || '',
    badgeSubtitulo: opts.badgeSubtitulo || opts.direitaSubtitulo || '',
  });
}

export function drawDocumentoPdfFooter(
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  opts: { empresaNome: string; linhaCentral: string; linhaInferior: string },
): void {
  const { TEXTO_MEDIO, MX } = PDF_PALETTE;
  const footerY = pageHeight - 10;
  const cx = pageWidth / 2;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MX, footerY - 1, pageWidth - MX, footerY - 1);

  doc.setTextColor(...TEXTO_MEDIO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(`${opts.empresaNome.toUpperCase()}  ·  ${opts.linhaCentral.toUpperCase()}`, cx, footerY + 4, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(opts.linhaInferior.toUpperCase(), cx, footerY + 8, { align: 'center' });
}

export function drawDocumentoSectionTitle(
  doc: jsPDF,
  pageWidth: number,
  y: number,
  title: string,
): number {
  const { TEXTO_ESCURO, MX } = PDF_PALETTE;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.35);
  doc.line(MX, y + 5.5, pageWidth - MX, y + 5.5);

  doc.setTextColor(...TEXTO_ESCURO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(title.toUpperCase(), MX, y + 3.5);
  return y + 8;
}

export function drawDocumentoField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  fieldY: number,
  maxWidth: number,
): number {
  const { TEXTO_MEDIO, TEXTO_ESCURO } = PDF_PALETTE;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXTO_MEDIO);
  doc.setFontSize(7);
  doc.text(label.toUpperCase(), x, fieldY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXTO_ESCURO);
  doc.setFontSize(8.5);
  const lines = doc.splitTextToSize((value || '—').toUpperCase(), maxWidth);
  doc.text(lines, x, fieldY + 4);
  return lines.length;
}

export function drawDocumentoFieldPair(
  doc: jsPDF,
  grid: DocumentoPdfGrid,
  y: number,
  left: { label: string; value: string },
  right?: { label: string; value: string },
): number {
  const lineH = 4.2;
  const leftLines = drawDocumentoField(doc, left.label, left.value, grid.col1X, y, grid.colW);
  let maxLines = leftLines;
  if (right) {
    const rightLines = drawDocumentoField(doc, right.label, right.value, grid.col2X, y, grid.colW);
    maxLines = Math.max(leftLines, rightLines);
  }
  return y + 10.5 + Math.max(0, maxLines - 1) * lineH;
}

export function drawDocumentoFieldFullWidth(
  doc: jsPDF,
  grid: DocumentoPdfGrid,
  y: number,
  field: { label: string; value: string },
): number {
  const lineH = 4.2;
  const linesCount = drawDocumentoField(doc, field.label, field.value, grid.col1X, y, grid.innerW);
  return y + 10.5 + Math.max(0, linesCount - 1) * lineH;
}

/** Fundo da seção — chamar antes do texto. */
export function drawDocumentoSectionBackground(
  doc: jsPDF,
  pageWidth: number,
  y: number,
  height: number,
): void {
  const { CINZA_FUNDO, MX } = PDF_PALETTE;
  doc.setFillColor(...CINZA_FUNDO);
  doc.roundedRect(MX, y - 2, pageWidth - MX * 2, height, 1.5, 1.5, 'F');
}

/** Borda da seção — chamar depois do conteúdo (altura final). */
export function drawDocumentoSectionBorder(
  doc: jsPDF,
  pageWidth: number,
  y: number,
  height: number,
): void {
  const { CINZA_BORDA, MX } = PDF_PALETTE;
  doc.setDrawColor(...CINZA_BORDA);
  doc.setLineWidth(0.2);
  doc.roundedRect(MX, y - 2, pageWidth - MX * 2, height, 1.5, 1.5, 'S');
}

/** Fundo + borda antes do conteúdo (ficha cadastro, etc.). */
export function drawDocumentoSectionBox(
  doc: jsPDF,
  pageWidth: number,
  y: number,
  height: number,
): void {
  drawDocumentoSectionBackground(doc, pageWidth, y, height);
  drawDocumentoSectionBorder(doc, pageWidth, y, height);
}

export function drawDocumentoSignatures(
  doc: jsPDF,
  pageWidth: number,
  y: number,
  left: { titulo: string; nome: string },
  right: { titulo: string; nome: string },
): number {
  const { AZUL_PROFUNDO, TEXTO_MEDIO } = PDF_PALETTE;
  const sigW = 72;
  const leftX = pageWidth / 2 - sigW - 12;
  const rightX = pageWidth / 2 + 12;

  doc.setDrawColor(...AZUL_PROFUNDO);
  doc.setLineWidth(0.35);
  doc.line(leftX, y, leftX + sigW, y);
  doc.line(rightX, y, rightX + sigW, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXTO_MEDIO);
  doc.text(left.titulo.toUpperCase(), leftX + sigW / 2, y + 5, { align: 'center' });
  doc.text((left.nome || '—').toUpperCase(), leftX + sigW / 2, y + 9, { align: 'center' });
  doc.text(right.titulo.toUpperCase(), rightX + sigW / 2, y + 5, { align: 'center' });
  doc.text((right.nome || '—').toUpperCase(), rightX + sigW / 2, y + 9, { align: 'center' });

  return y + 16;
}

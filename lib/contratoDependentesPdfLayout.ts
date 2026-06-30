import type jsPDF from 'jspdf';
import { PDF_PALETTE } from './documentoPdfLayout';
import { drawLogoPdf, loadLogoForPdf } from './fenixLogo';

/** Borda neutra (sem tom azul) para contrato e anexo. */
const BORDA_NEUTRA: [number, number, number] = [190, 190, 190];

export type DependenteContratoPdf = {
  nome: string;
  parentesco: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
};

type ColKey = 'num' | 'nome' | 'parentesco' | 'cpf' | 'rg' | 'nasc';

const COL_WIDTH: Record<ColKey, number> = {
  num: 8,
  nome: 54,
  parentesco: 26,
  cpf: 28,
  rg: 22,
  nasc: 20,
};

/** Espaço reservado para numeração "Página X de Y" no rodapé (aplicada em H - 10). */
export const CONTRATO_MARGEM_MM = 15;
export const CONTRATO_TOPO_MM = 15;
export const CONTRATO_RODAPE_RESERVA_MM = 12;
const RODAPE_PAGINA_MM = CONTRATO_RODAPE_RESERVA_MM;
const TOPO_PAGINA_CONTINUACAO_MM = 12;

export function limiteInferiorContratoCorpo(H: number): number {
  return H - CONTRATO_RODAPE_RESERVA_MM;
}

function alturaLinhaContrato(doc: jsPDF, fontSize: number): number {
  return (fontSize * doc.getLineHeightFactor()) / doc.internal.scaleFactor;
}

export type FluxoTextoContrato = {
  y: number;
  margin: number;
  contentWidth: number;
  bottom: number;
  ensureSpace: (needed: number) => boolean;
  addText: (
    text: string,
    fontSize?: number,
    align?: 'left' | 'center' | 'right' | 'justify',
    bold?: boolean,
  ) => void;
  addTitle: (text: string) => void;
};

/** Fluxo de texto do corpo do contrato (Fênix/Onix) com quebra de página otimizada. */
export function criarFluxoTextoContrato(doc: jsPDF, W: number, H: number): FluxoTextoContrato {
  const margin = CONTRATO_MARGEM_MM;
  const contentWidth = W - margin * 2;
  const bottom = limiteInferiorContratoCorpo(H);
  const ctx = {
    y: CONTRATO_TOPO_MM,
    margin,
    contentWidth,
    bottom,
    ensureSpace(needed: number) {
      if (ctx.y + needed > bottom) {
        doc.addPage();
        ctx.y = CONTRATO_TOPO_MM;
        return true;
      }
      return false;
    },
    addText(
      text: string,
      fontSize = 8,
      align: 'left' | 'center' | 'right' | 'justify' = 'justify',
      bold = false,
    ) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
      const lines = doc.splitTextToSize(text, contentWidth) as string[];
      const step = alturaLinhaContrato(doc, fontSize);

      for (let i = 0; i < lines.length; i++) {
        if (ctx.y + step > bottom) {
          doc.addPage();
          ctx.y = CONTRATO_TOPO_MM;
        }
        const isLastLine = i === lines.length - 1;
        const currentAlign = align === 'justify' && isLastLine ? 'left' : align;
        doc.text(lines[i], margin, ctx.y, {
          align: currentAlign,
          maxWidth: currentAlign === 'justify' ? contentWidth : undefined,
        });
        ctx.y += step;
      }
      ctx.y += 1;
    },
    addTitle(text: string) {
      const fontSize = 9;
      const blockH = alturaLinhaContrato(doc, fontSize) + 2;
      ctx.ensureSpace(blockH + 1);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fontSize);
      doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
      doc.text(text, margin, ctx.y);
      doc.setDrawColor(...BORDA_NEUTRA);
      doc.setLineWidth(0.2);
      doc.line(margin, ctx.y + 1.8, margin + contentWidth, ctx.y + 1.8);
      ctx.y += blockH;
    },
  };
  return ctx;
}

const ROW_PAD = { top: 4, bottom: 3.5 };

function limiteInferiorPagina(H: number): number {
  return H - RODAPE_PAGINA_MM;
}

/** Distribui larguras das colunas dentro da área útil (evita corte lateral). */
function largurasColunas(contentWidth: number, cols: ColKey[]): Record<ColKey, number> {
  const peso: Record<ColKey, number> = {
    num: 0.06,
    nome: 0.34,
    parentesco: 0.14,
    cpf: 0.16,
    rg: 0.13,
    nasc: 0.12,
  };
  const somaPeso = cols.reduce((s, c) => s + peso[c], 0);
  const larguras = {} as Record<ColKey, number>;
  let usado = 0;
  cols.forEach((col, i) => {
    if (i === cols.length - 1) {
      larguras[col] = Math.max(12, contentWidth - usado);
    } else {
      larguras[col] = Math.max(col === 'num' ? 7 : 14, Math.floor((contentWidth * peso[col]) / somaPeso));
      usado += larguras[col];
    }
  });
  return larguras;
}

const formatCpf = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return (value || '').trim() || '—';
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
};

function fontSizeForRow(compact: boolean) {
  return compact ? 6.5 : 7.5;
}

function lineHeightMm(doc: jsPDF, fontSize: number) {
  return (fontSize * doc.getLineHeightFactor()) / doc.internal.scaleFactor;
}

function countWrappedLines(doc: jsPDF, text: string, maxWidth: number, fontSize: number) {
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(String(text || '—'), maxWidth).length;
}

function measureMaxLines(
  doc: jsPDF,
  dep: DependenteContratoPdf,
  cols: ColKey[],
  compact: boolean,
  larguras: Record<ColKey, number>,
): number {
  const fontSize = fontSizeForRow(compact);
  let maxLines = 1;

  const linhas = (col: ColKey, texto: string) => {
    maxLines = Math.max(
      maxLines,
      countWrappedLines(doc, texto, Math.max(8, larguras[col] - 4), fontSize),
    );
  };

  if (cols.includes('nome')) linhas('nome', (dep.nome || '—').toUpperCase());
  if (cols.includes('parentesco')) linhas('parentesco', (dep.parentesco || '—').toUpperCase());
  if (cols.includes('cpf')) linhas('cpf', formatCpf(dep.cpf));
  if (cols.includes('rg')) linhas('rg', (dep.rg || '—').trim() || '—');
  if (cols.includes('nasc')) linhas('nasc', (dep.dataNascimento || '—').trim() || '—');

  return maxLines;
}

function measureRowHeight(
  doc: jsPDF,
  dep: DependenteContratoPdf,
  cols: ColKey[],
  _margin: number,
  compact: boolean,
  larguras: Record<ColKey, number>,
): number {
  const fontSize = fontSizeForRow(compact);
  const maxLines = measureMaxLines(doc, dep, cols, compact, larguras);
  const step = lineHeightMm(doc, fontSize);
  return ROW_PAD.top + maxLines * step + ROW_PAD.bottom;
}

function colOffsets(margin: number, cols: ColKey[], larguras: Record<ColKey, number>) {
  let x = margin;
  const xs: Partial<Record<ColKey, number>> = {};
  for (const col of cols) {
    xs[col] = x;
    x += larguras[col];
  }
  return xs;
}

function drawTableHeader(
  doc: jsPDF,
  y: number,
  margin: number,
  contentWidth: number,
  cols: ColKey[],
  compact: boolean,
  larguras: Record<ColKey, number>,
): number {
  const rowH = compact ? 6.5 : 7.5;
  const { TEXTO_ESCURO } = PDF_PALETTE;
  const xs = colOffsets(margin, cols, larguras);

  doc.setDrawColor(...BORDA_NEUTRA);
  doc.setLineWidth(0.25);
  doc.line(margin, y, margin + contentWidth, y);
  doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(compact ? 6.5 : 7.5);
  doc.setTextColor(...TEXTO_ESCURO);

  const labels: Record<ColKey, string> = {
    num: '#',
    nome: 'NOME COMPLETO',
    parentesco: 'PARENTESCO',
    cpf: 'CPF',
    rg: 'RG',
    nasc: 'NASCIMENTO',
  };

  for (const col of cols) {
    const tx = (xs[col] ?? margin) + (col === 'num' ? 3 : 2);
    doc.text(labels[col], tx, y + (compact ? 4.2 : 5));
  }

  doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
  return y + rowH;
}

function firstBaselineY(y: number, fontSize: number) {
  return y + ROW_PAD.top + fontSize * 0.85;
}

function drawTableRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentWidth: number,
  cols: ColKey[],
  dep: DependenteContratoPdf,
  idx: number,
  rowH: number,
  compact: boolean,
  larguras: Record<ColKey, number>,
): number {
  const xs = colOffsets(margin, cols, larguras);
  const { TEXTO_ESCURO, TEXTO_MEDIO } = PDF_PALETTE;

  doc.setDrawColor(...BORDA_NEUTRA);
  doc.setLineWidth(0.15);
  doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

  const fontSize = fontSizeForRow(compact);
  const lineStep = lineHeightMm(doc, fontSize);
  doc.setFontSize(fontSize);
  const textY = firstBaselineY(y, fontSize);

  const drawCol = (
    col: ColKey,
    texto: string,
    bold = false,
    cor: [number, number, number] = TEXTO_ESCURO,
  ) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...cor);
    const w = Math.max(8, larguras[col] - 4);
    const lines = doc.splitTextToSize(texto, w);
    // Renderiza linha a linha para evitar sobreposição causada por lineHeightFactor incorreto
    lines.forEach((line: string, li: number) => {
      doc.text(line, (xs[col] ?? margin) + 2, textY + li * lineStep);
    });
  };

  if (cols.includes('num')) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXTO_MEDIO);
    doc.text(String(idx + 1).padStart(2, '0'), (xs.num ?? margin) + 3, textY);
  }

  if (cols.includes('nome')) {
    drawCol('nome', (dep.nome || '—').toUpperCase(), true, TEXTO_ESCURO);
  }

  if (cols.includes('parentesco')) {
    drawCol('parentesco', (dep.parentesco || '—').toUpperCase(), false, TEXTO_MEDIO);
  }

  if (cols.includes('cpf')) {
    drawCol('cpf', formatCpf(dep.cpf), false, TEXTO_MEDIO);
  }

  if (cols.includes('rg')) {
    drawCol('rg', (dep.rg || '—').trim() || '—', false, TEXTO_MEDIO);
  }

  if (cols.includes('nasc')) {
    drawCol('nasc', (dep.dataNascimento || '—').trim() || '—', false, TEXTO_MEDIO);
  }

  return y + rowH;
}

/** Desenha tabela com quebra de página e cabeçalho repetido. */
function desenharTabelaDependentesPaginada(
  doc: jsPDF,
  opts: {
    margin: number;
    contentWidth: number;
    pageHeight: number;
    yStart: number;
    cols: ColKey[];
    compact: boolean;
    dependentes: DependenteContratoPdf[];
    tituloContinuacao?: string;
    /** Limite Y inferior (mm). Padrão: rodapé do contrato. */
    bottomLimit?: number;
  },
): number {
  const { margin, contentWidth, pageHeight, cols, compact, dependentes } = opts;
  const larguras = largurasColunas(contentWidth, cols);
  const bottom = opts.bottomLimit ?? limiteInferiorPagina(pageHeight);
  let y = opts.yStart;

  const novaPaginaTabela = (alturaMinima: number) => {
    doc.addPage();
    y = TOPO_PAGINA_CONTINUACAO_MM;
    if (opts.tituloContinuacao) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
      doc.text(opts.tituloContinuacao, margin, y);
      y += 6;
    }
    y = drawTableHeader(doc, y, margin, contentWidth, cols, compact, larguras);
    return y;
  };

  if (y + 10 > bottom) {
    y = novaPaginaTabela(10);
  } else {
    y = drawTableHeader(doc, y, margin, contentWidth, cols, compact, larguras);
  }

  dependentes.forEach((dep, idx) => {
    const rowH = measureRowHeight(doc, dep, cols, margin, compact, larguras);
    const ultimo = idx === dependentes.length - 1;
    const reservaApos = ultimo ? 6 : 2;

    if (y + rowH > bottom) {
      y = novaPaginaTabela(rowH + 2);
    } else if (y + rowH + reservaApos > bottom) {
      y = novaPaginaTabela(rowH + reservaApos);
    }

    y = drawTableRow(doc, y, margin, contentWidth, cols, dep, idx, rowH, compact, larguras);
  });

  return y;
}

/** Tabela compacta para a cláusula 2.2 do contrato. */
export function drawContratoRolDependentes(
  doc: jsPDF,
  opts: {
    margin: number;
    contentWidth: number;
    y: number;
    pageHeight: number;
    dependentes: DependenteContratoPdf[];
    checkNewPage?: (needed: number) => boolean;
  },
): number {
  const { margin, contentWidth, pageHeight, dependentes } = opts;
  let y = opts.y;
  const cols: ColKey[] = ['num', 'nome', 'parentesco', 'nasc'];
  const compact = true;

  if (dependentes.length === 0) return y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_PALETTE.TEXTO_ESCURO);
  doc.text('2.2. Rol de dependentes beneficiários individualizados e inscritos nesta data:', margin, y);
  y += 5;

  y = desenharTabelaDependentesPaginada(doc, {
    margin,
    contentWidth,
    pageHeight,
    yStart: y,
    cols,
    compact,
    dependentes,
    tituloContinuacao: '2.2. Rol de dependentes (continuação):',
  });

  const bottom = limiteInferiorPagina(pageHeight);
  const rodapeH = 6;
  if (y + rodapeH > bottom) {
    doc.addPage();
    y = TOPO_PAGINA_CONTINUACAO_MM;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_PALETTE.TEXTO_MEDIO);
  doc.text(`Total de ${dependentes.length} dependente(s) cadastrado(s).`, margin, y + 3);
  y += rodapeH;

  return y;
}

/** Anexo I — relação completa de beneficiários dependentes. */
export async function drawContratoAnexoDependentes(
  doc: jsPDF,
  opts: {
    margin: number;
    W: number;
    H: number;
    numeroContrato: string;
    titularNome: string;
    titularCpf?: string;
    dataContrato: string;
    planoNome?: string;
    dependentes: DependenteContratoPdf[];
    subtituloPlano?: string;
    logoUrl?: string | null;
    razaoSocial?: string;
    cnpjFormatado?: string;
  },
): Promise<void> {
  const {
    margin,
    W,
    H,
    numeroContrato,
    titularNome,
    titularCpf,
    dataContrato,
    planoNome,
    dependentes,
    subtituloPlano = 'Certificado de Adesão',
    razaoSocial = 'FENIX FUNERÁRIA LTDA',
    cnpjFormatado = '03.617.822/0002-95',
  } = opts;
  const contentWidth = W - margin * 2;
  const { TEXTO_ESCURO, TEXTO_MEDIO } = PDF_PALETTE;
  const cols: ColKey[] = ['num', 'nome', 'parentesco', 'cpf', 'rg', 'nasc'];

  doc.addPage();
  const logo = await loadLogoForPdf(opts.logoUrl);
  const textoX = margin + (logo ? 34 : 0);
  const textoW = contentWidth - (logo ? 34 : 0);
  let y = 14;

  if (logo) {
    drawLogoPdf(doc, logo, { x: margin, y: 10, maxW: 30, maxH: 16, align: 'left' });
  }

  doc.setTextColor(...TEXTO_ESCURO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(razaoSocial.toUpperCase(), textoX, y, { maxWidth: textoW });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXTO_MEDIO);
  doc.text(`CNPJ: ${cnpjFormatado}`, textoX, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXTO_ESCURO);
  doc.text('ANEXO I — RELAÇÃO DE BENEFICIÁRIOS DEPENDENTES', textoX, y, { maxWidth: textoW });
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXTO_MEDIO);
  doc.text(subtituloPlano, textoX, y);
  y += 8;

  doc.setDrawColor(...BORDA_NEUTRA);
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXTO_ESCURO);
  doc.text('DADOS DO CONTRATO', margin, y);
  y += 5;

  doc.setDrawColor(...BORDA_NEUTRA);
  doc.setLineWidth(0.2);
  doc.line(margin, y, W - margin, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXTO_ESCURO);
  doc.text(`Contrato nº: ${numeroContrato}`, margin, y);
  if (planoNome) {
    doc.text(`Plano: ${planoNome}`, W - margin, y, { align: 'right' });
  }
  y += 4.5;
  doc.text(`Data: ${dataContrato}`, margin, y);
  if (titularCpf) {
    doc.text(`CPF: ${formatCpf(titularCpf)}`, W - margin, y, { align: 'right' });
  }
  y += 4.5;
  doc.text(`Titular: ${titularNome.toUpperCase()}`, margin, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${dependentes.length} dependente(s)`, W - margin, y, { align: 'right' });
  y += 4.5;

  doc.setDrawColor(...BORDA_NEUTRA);
  doc.line(margin, y, W - margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXTO_MEDIO);
  const intro =
    `Este anexo é parte integrante e indissolúvel do Contrato de Adesão nº ${numeroContrato}. ` +
    'Relaciona os beneficiários dependentes indicados pelo contratante e aptos a usufruir das coberturas do plano na data de sua oficialização.';
  const introLines = doc.splitTextToSize(intro, contentWidth);
  doc.text(introLines, margin, y);
  y += introLines.length * 3.8 + 4;

  const compactAnexo = dependentes.length >= 10;
  y = desenharTabelaDependentesPaginada(doc, {
    margin,
    contentWidth,
    pageHeight: H,
    yStart: y,
    cols,
    compact: compactAnexo,
    dependentes,
    tituloContinuacao: 'ANEXO I — Beneficiários dependentes (continuação)',
  });

  const bottom = limiteInferiorPagina(H);

  if (y + 12 > bottom) {
    doc.addPage();
    y = TOPO_PAGINA_CONTINUACAO_MM;
  }

  doc.setDrawColor(...BORDA_NEUTRA);
  doc.setLineWidth(0.2);
  doc.line(margin, y, margin + contentWidth, y);

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...TEXTO_ESCURO);
  doc.text(`Total de beneficiários dependentes: ${dependentes.length}`, margin, y);

  y += 8;
  if (y + 26 > bottom) {
    doc.addPage();
    y = TOPO_PAGINA_CONTINUACAO_MM + 4;
  }

  doc.setDrawColor(...BORDA_NEUTRA);
  doc.setLineWidth(0.35);
  const sigW = 72;
  const leftX = W / 2 - sigW - 12;
  const rightX = W / 2 + 12;
  doc.line(leftX, y, leftX + sigW, y);
  doc.line(rightX, y, rightX + sigW, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXTO_MEDIO);
  doc.text('Assinatura da Contratada', leftX + sigW / 2, y, { align: 'center' });
  doc.text('Assinatura do Contratante', rightX + sigW / 2, y, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXTO_ESCURO);
  doc.text('FENIX FUNERÁRIA LTDA', leftX + sigW / 2, y, { align: 'center' });
  doc.text(titularNome.toUpperCase(), rightX + sigW / 2, y, { align: 'center' });
}

/** Tabela de dependentes para proposta comercial — lista todos, com quebra de página se necessário. */
export function drawPropostaTabelaDependentes(
  doc: jsPDF,
  opts: {
    W: number;
    y: number;
    dependentes: DependenteContratoPdf[];
    /** Reserva espaço para rodapé da proposta (mm a partir do topo = limite Y). */
    bottomLimit?: number;
    numeroProposta?: string;
  },
): number {
  const { W, dependentes } = opts;
  let y = opts.y;
  const { MX } = PDF_PALETTE;
  const margin = MX + 2;
  const contentWidth = W - MX * 2 - 4;
  const cols: ColKey[] = ['num', 'nome', 'parentesco', 'cpf', 'nasc'];

  if (dependentes.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_PALETTE.TEXTO_MEDIO);
    doc.text('Nenhum dependente cadastrado.', margin + 2, y + 4);
    return y + 8;
  }

  const pageH = doc.internal.pageSize.getHeight();
  const bottom = opts.bottomLimit ?? limiteInferiorPagina(pageH);
  const compact = dependentes.length >= 4;
  const tituloContinuacao = opts.numeroProposta
    ? `Dependentes — Proposta Nº ${opts.numeroProposta} (continuação)`
    : 'Dependentes (continuação)';

  y = desenharTabelaDependentesPaginada(doc, {
    margin,
    contentWidth,
    pageHeight: pageH,
    yStart: y,
    cols,
    compact,
    dependentes,
    tituloContinuacao,
    bottomLimit: bottom,
  });

  if (y + 8 > bottom) {
    doc.addPage();
    y = TOPO_PAGINA_CONTINUACAO_MM;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_PALETTE.TEXTO_MEDIO);
  doc.text(
    `Total: ${dependentes.length} dependente(s) incluído(s) nesta proposta.`,
    margin + 2,
    y + 4,
  );
  return y + 8;
}

/** Numeração no rodapé de cada página do PDF do contrato (Fênix / Onix). */
export function aplicarNumeracaoPaginasContratoPdf(
  doc: jsPDF,
  opts?: { numeroContrato?: string; margemInferiorMm?: number },
): void {
  const total = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const bottom = opts?.margemInferiorMm ?? 10;
  const contrato = (opts?.numeroContrato || '').trim().toLocaleUpperCase('pt-BR');

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text(`Página ${i} de ${total}`, W / 2, H - bottom, { align: 'center' });
    if (contrato) {
      doc.text(`Contrato nº ${contrato}`, W - 15, H - bottom, { align: 'right' });
    }
    doc.setTextColor(0);
  }
}

/** Quadro inicial do contrato (Onix/Fênix) com quebra de linha no endereço e titular longos. */
export function drawContratoCabecalhoInfoBox(
  doc: jsPDF,
  opts: {
    boxTopY: number;
    margin: number;
    contentWidth: number;
    pageWidth: number;
    numeroContrato: string;
    titularNome: string;
    titularEndereco: string;
    vendedorNome: string;
    nomePlano: string;
    /** Data da contratação (dd/mm/aaaa) — exibida no quadro inicial do PDF */
    dataContrato?: string;
  },
): { boxBottomY: number } {
  const padX = 3;
  const padTop = 5;
  const padBottom = 4;
  const lineStep = 4.2;
  const innerW = opts.contentWidth - padX * 2;
  const fontSize = 8;
  const dataContrato =
    opts.dataContrato && opts.dataContrato !== '—' ? opts.dataContrato.trim() : '';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  const titularLines = doc.splitTextToSize(
    `Titular: ${opts.titularNome.toUpperCase()}`,
    innerW,
  );
  const enderecoLines = doc.splitTextToSize(
    `Endereço: ${opts.titularEndereco.toLocaleUpperCase('pt-BR')}`,
    innerW,
  );

  const boxHeight =
    padTop +
    lineStep +
    (dataContrato ? lineStep : 0) +
    titularLines.length * lineStep +
    enderecoLines.length * lineStep +
    lineStep +
    padBottom;

  const y0 = opts.boxTopY;
  const { TEXTO_ESCURO, TEXTO_MEDIO } = PDF_PALETTE;

  doc.setDrawColor(...BORDA_NEUTRA);
  doc.setLineWidth(0.25);
  doc.roundedRect(opts.margin, y0, opts.contentWidth, boxHeight, 1.2, 1.2, 'S');

  let cy = y0 + padTop;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...TEXTO_ESCURO);
  doc.text(`Contrato Nº: ${opts.numeroContrato}`, opts.margin + padX, cy);
  doc.text(`SÉRIE ÚNICA: Nº 07/001/98`, opts.pageWidth - opts.margin - padX, cy, {
    align: 'right',
  });
  cy += lineStep;
  if (dataContrato) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXTO_MEDIO);
    doc.text(`Data do contrato: ${dataContrato}`, opts.margin + padX, cy);
    doc.text(`Tipo de Plano: ${opts.nomePlano}`, opts.pageWidth - opts.margin - padX, cy, {
      align: 'right',
    });
    cy += lineStep;
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXTO_ESCURO);
  for (const line of titularLines) {
    doc.text(line, opts.margin + padX, cy);
    cy += lineStep;
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXTO_MEDIO);
  for (const line of enderecoLines) {
    doc.text(line, opts.margin + padX, cy);
    cy += lineStep;
  }

  doc.text(`Vendedor: ${opts.vendedorNome}`, opts.margin + padX, cy);
  if (!dataContrato) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXTO_ESCURO);
    doc.text(`Tipo de Plano: ${opts.nomePlano}`, opts.pageWidth - opts.margin - padX, cy, {
      align: 'right',
    });
  }

  return { boxBottomY: y0 + boxHeight };
}

export function normalizarDependentesContrato(
  detalhados?: DependenteContratoPdf[] | null,
  resumo?: string[] | null,
): DependenteContratoPdf[] {
  const base =
    detalhados && detalhados.length > 0
      ? detalhados.filter((d) => (d.nome || '').trim())
      : resumo && resumo.length > 0 && resumo[0] !== '—'
        ? (resumo.map((nome) => ({ nome, parentesco: '—', cpf: '' })) as DependenteContratoPdf[])
        : [];

  const vistos = new Set<string>();
  return base.filter((d) => {
    const chave = `${(d.nome || '').trim().toUpperCase()}|${String(d.cpf || '').replace(/\D/g, '')}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

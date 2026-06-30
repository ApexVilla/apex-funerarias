import jsPDF from 'jspdf';
import { labelParentescoDependente } from './parentescoDependente';
import { obterUrlWhatsapp } from './whatsappValidacao';
import { abrirPdfNaJanelaReservada, abrirPdfParaImprimir } from './printPdfBlob';
import { montarEnderecoResidenciaProposta } from './propostaEndereco';
import {
  drawPropostaTabelaDependentes,
  normalizarDependentesContrato,
  type DependenteContratoPdf,
} from './contratoDependentesPdfLayout';
import { labelStatusProposta } from './propostaStatusLabels';
import { loadLogoForPdf } from './fenixLogo';
import {
  drawDocumentoField,
  drawDocumentoPdfFooter,
  drawDocumentoPdfHeaderCentered,
  drawDocumentoSectionBackground,
  drawDocumentoSectionBorder,
  drawDocumentoSignatures,
  formatDataPdfBr,
  getDocumentoPdfGrid,
  pdfBlobFromJsPDF,
  PDF_PALETTE,
} from './documentoPdfLayout';

export interface PropostaDocumentoData {
  numero: string;
  dataPedido: string;
  empresaNome?: string | null;
  empresaLogoUrl?: string | null;
  /** Nome da filial/unidade emissora (aparece no PDF). */
  unidadeEmissoraNome?: string | null;
  empresaCnpj?: string | null;
  vendedorNome: string;
  vendedorDocumento?: string | null;
  contribuinteNome: string;
  contribuinteDocumento: string;
  contribuinteTelefone?: string | null;
  contribuinteEmail?: string | null;
  contribuinteEndereco?: string | null;
  enderecoLogradouro?: string | null;
  enderecoNumero?: string | null;
  enderecoBairro?: string | null;
  enderecoQuadra?: string | null;
  enderecoLote?: string | null;
  enderecoCidade?: string | null;
  enderecoUf?: string | null;
  enderecoCep?: string | null;
  contribuinteRg?: string | null;
  contribuinteDataNascimento?: string | null;
  contribuinteEstadoCivil?: string | null;
  contribuinteNaturalidade?: string | null;
  contribuinteProfissao?: string | null;
  contribuinteReligiao?: string | null;
  planoNome: string;
  valorAdesaoCentavos: number;
  primeiroVencimento: string;
  metodoCobranca: string;
  cobrancaConfirmada?: boolean | null;
  cobradorMesmoEndereco?: boolean | null;
  cobradorEnderecoEntrega?: string | null;
  cobradorEnderecoCep?: string | null;
  cobradorEnderecoCidade?: string | null;
  cobradorEnderecoUf?: string | null;
  statusProposta?: string | null;
  parcelasRecebidasQuantidade?: number | null;
  parcelasRecebidasTotalCentavos?: number | null;
  dependentesResumo?: string[] | null;
  dependentesDetalhados?: DependenteContratoPdf[] | null;
  observacoes?: string | null;
}

const formatCurrency = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const formatarCnpj = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return value || '-';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const CNPJ_EMPRESA_PADRAO = String(
  (import.meta as any)?.env?.VITE_EMPRESA_CNPJ_PADRAO || ''
).replace(/\D/g, '');

const formatarCep = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) return value || '';
  return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
};

const metodoLabel = (metodo: string) => {
  switch (metodo) {
    case 'boleto':          return 'Boleto bancário';
    case 'pix':             return 'PIX';
    case 'debito_automatico': return 'Débito automático';
    case 'cartao_credito':  return 'Cartão de crédito';
    case 'cobrador':        return 'Cobrador';
    default:                return metodo || '-';
  }
};

const estadoCivilLabel = (val?: string | null): string => {
  if (!val) return '—';
  switch (String(val).toLowerCase()) {
    case 'solteiro': return 'Solteiro(a)';
    case 'casado': return 'Casado(a)';
    case 'divorciado': return 'Divorciado(a)';
    case 'viuvo': return 'Viúvo(a)';
    case 'uniao_estavel': return 'União estável';
    case 'separado': return 'Separado(a)';
    case 'separado_judicialmente': return 'Separado(a) judicialmente';
    case 'convivente': return 'Convivente';
    case 'nao_informado': return 'Prefere não informar';
    default: return val;
  }
};

const religiaoLabel = (val?: string | null): string => {
  if (!val) return '—';
  switch (String(val).toLowerCase()) {
    case 'catolica': return 'Católica';
    case 'evangelica': return 'Evangélica';
    case 'espirita': return 'Espírita';
    case 'umbanda': return 'Umbanda';
    case 'candomble': return 'Candomblé';
    case 'adventista': return 'Adventista';
    case 'batista': return 'Batista';
    case 'presbiteriana': return 'Presbiteriana';
    case 'luterana': return 'Luterana';
    case 'metodista': return 'Metodista';
    case 'assembleia_de_deus': return 'Assembleia de Deus';
    case 'testemunha_de_jeova': return 'Testemunha de Jeová';
    case 'mormon': return 'Mórmon';
    case 'judaica': return 'Judaica';
    case 'islamica': return 'Islâmica';
    case 'budista': return 'Budista';
    case 'hinduista': return 'Hinduísta';
    case 'sem_religiao': return 'Sem religião';
    case 'ateu': return 'Ateu(ia)';
    case 'agnostico': return 'Agnóstico(a)';
    case 'outra': return 'Outra';
    default: return val;
  }
};

const formatarCpf = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || '—';
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
};

const PROPOSTA_FOOTER_H = 12;
const PROPOSTA_SIG_H = 18;

type EnderecoPdfResolvido = {
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  resumo: string;
};

function resolverEnderecoPdf(data: PropostaDocumentoData): EnderecoPdfResolvido {
  const montado = montarEnderecoResidenciaProposta({
    logradouro: data.enderecoLogradouro,
    numero: data.enderecoNumero,
    bairro: data.enderecoBairro,
    quadra: data.enderecoQuadra,
    lote: data.enderecoLote,
    cidade: data.enderecoCidade,
    uf: data.enderecoUf,
    cep: data.enderecoCep,
  });
  return {
    logradouro: (data.enderecoLogradouro || '').trim() || '—',
    numero: (data.enderecoNumero || '').trim() || '—',
    bairro: (data.enderecoBairro || '').trim() || '—',
    cidade: (data.enderecoCidade || '').trim() || '—',
    uf: (data.enderecoUf || '').trim() || '—',
    cep: formatarCep(data.enderecoCep) || '—',
    resumo: montado || (data.contribuinteEndereco || '').trim() || '—',
  };
}

function drawPropostaCampoParCompacto(
  doc: jsPDF,
  grid: ReturnType<typeof getDocumentoPdfGrid>,
  y: number,
  left: { label: string; value: string },
  right?: { label: string; value: string },
): number {
  const lineH = 3.6;
  const leftLines = drawDocumentoField(doc, left.label, left.value, grid.col1X, y, grid.colW);
  let maxLines = leftLines;
  if (right) {
    const rightLines = drawDocumentoField(doc, right.label, right.value, grid.col2X, y, grid.colW);
    maxLines = Math.max(leftLines, rightLines);
  }
  return y + 8.5 + Math.max(0, maxLines - 1) * lineH;
}

function drawPropostaCampoLarguraCompacto(
  doc: jsPDF,
  grid: ReturnType<typeof getDocumentoPdfGrid>,
  y: number,
  field: { label: string; value: string },
): number {
  const lineH = 3.6;
  const linesCount = drawDocumentoField(doc, field.label, field.value, grid.col1X, y, grid.innerW);
  return y + 8.5 + Math.max(0, linesCount - 1) * lineH;
}

function drawPropostaSecaoTituloCompacto(doc: jsPDF, pageWidth: number, y: number, title: string): number {
  const { AZUL_MEDIO, DOURADO, BRANCO, MX } = PDF_PALETTE;
  const cx = pageWidth / 2;
  doc.setFillColor(...AZUL_MEDIO);
  doc.roundedRect(MX, y, pageWidth - MX * 2, 5.5, 1, 1, 'F');
  doc.setFillColor(...DOURADO);
  doc.roundedRect(MX, y, 2, 5.5, 0.6, 0.6, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(title.toUpperCase(), cx, y + 3.8, { align: 'center' });
  return y + 7;
}

function garantirEspacoProposta(doc: jsPDF, y: number, neededMm: number, H: number): number {
  const limite = H - PROPOSTA_FOOTER_H - 2;
  if (y + neededMm > limite) {
    doc.addPage();
    return 16;
  }
  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
export const buildPropostaPdfBlob = async (data: PropostaDocumentoData): Promise<Blob> => {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const { MX, DOURADO_SUAVE, DOURADO, TEXTO_ESCURO } = PDF_PALETTE;
  const grid = getDocumentoPdfGrid(W);

  const cnpjExibicao = formatarCnpj(data.empresaCnpj || CNPJ_EMPRESA_PADRAO);
  const empresaNome = data.empresaNome || 'FENIX FUNERÁRIA';
  const unidadeNome =
    (data.unidadeEmissoraNome || '').trim() &&
    (data.unidadeEmissoraNome || '').trim().localeCompare(empresaNome, 'pt-BR', {
      sensitivity: 'accent',
    }) !== 0
      ? (data.unidadeEmissoraNome || '').trim()
      : null;

  const logo = await loadLogoForPdf(data.empresaLogoUrl);
  let y = drawDocumentoPdfHeaderCentered(doc, W, {
    empresaNome,
    subtitulo: 'Proposta Comercial de Plano',
    cnpj: cnpjExibicao,
    unidadeNome,
    badgeTitulo: `PROPOSTA Nº ${data.numero}`,
    badgeSubtitulo: `Emitido em: ${formatDataPdfBr(data.dataPedido)}`,
    logo,
  });

  const endereco = resolverEnderecoPdf(data);
  const limiteTabelaY = H - PROPOSTA_FOOTER_H - 2;

  // ── Titular + endereço (cidade, UF, CEP explícitos) ───────────────────────
  y = drawPropostaSecaoTituloCompacto(doc, W, y + 1, 'Dados do Titular');
  {
    const startY = y;
    drawDocumentoSectionBackground(doc, W, startY, 4);
    let rowY = startY + 2;
    rowY = drawPropostaCampoLarguraCompacto(doc, grid, rowY, {
      label: 'Nome completo',
      value: data.contribuinteNome || '—',
    });
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'CPF', value: formatarCpf(data.contribuinteDocumento) },
      { label: 'RG', value: data.contribuinteRg || '—' },
    );
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'Data de nascimento', value: data.contribuinteDataNascimento || '—' },
      { label: 'Estado civil', value: estadoCivilLabel(data.contribuinteEstadoCivil) },
    );
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'Naturalidade', value: data.contribuinteNaturalidade || '—' },
      { label: 'Profissão', value: data.contribuinteProfissao || '—' },
    );
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'Religião', value: religiaoLabel(data.contribuinteReligiao) },
      { label: 'Telefone', value: data.contribuinteTelefone || '—' },
    );
    if (data.contribuinteEmail?.trim()) {
      rowY = drawPropostaCampoLarguraCompacto(doc, grid, rowY, {
        label: 'E-mail',
        value: data.contribuinteEmail.trim(),
      });
    }
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'Logradouro', value: endereco.logradouro },
      { label: 'Nº', value: endereco.numero },
    );
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'Bairro', value: endereco.bairro },
      { label: 'Cidade', value: endereco.cidade },
    );
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'UF', value: endereco.uf },
      { label: 'CEP', value: endereco.cep },
    );
    if (endereco.resumo !== '—' && endereco.cidade === '—') {
      rowY = drawPropostaCampoLarguraCompacto(doc, grid, rowY, {
        label: 'Endereço completo',
        value: endereco.resumo,
      });
    }

    const boxH = rowY - startY + 2;
    drawDocumentoSectionBorder(doc, W, startY, boxH);
    y = startY + boxH + 3;
  }

  // ── Plano e cobrança ──────────────────────────────────────────────────────
  y = drawPropostaSecaoTituloCompacto(doc, W, y, 'Plano e Cobrança');
  {
    const startY = y;
    drawDocumentoSectionBackground(doc, W, startY, 4);
    let rowY = startY + 2;
    rowY = drawPropostaCampoLarguraCompacto(doc, grid, rowY, {
      label: 'Plano contratado',
      value: data.planoNome || '—',
    });
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'Valor de adesão', value: formatCurrency(data.valorAdesaoCentavos) },
      { label: '1º vencimento', value: formatDataPdfBr(data.primeiroVencimento) },
    );
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'Forma de cobrança', value: metodoLabel(data.metodoCobranca) },
      { label: 'Status', value: labelStatusProposta(data.statusProposta) },
    );
    rowY = drawPropostaCampoParCompacto(
      doc,
      grid,
      rowY,
      { label: 'Vendedor', value: data.vendedorNome || '—' },
      { label: 'Contato vendedor', value: data.vendedorDocumento || '—' },
    );
    if ((data.parcelasRecebidasQuantidade || 0) > 0) {
      rowY = drawPropostaCampoLarguraCompacto(doc, grid, rowY, {
        label: 'Parcelas recebidas',
        value: `${data.parcelasRecebidasQuantidade}x (${formatCurrency(data.parcelasRecebidasTotalCentavos || 0)})`,
      });
    }
    if (data.metodoCobranca === 'cobrador') {
      const entregaCobrador =
        data.cobradorMesmoEndereco !== false
          ? 'Mesmo endereço do titular'
          : [
              data.cobradorEnderecoEntrega || '',
              [data.cobradorEnderecoCidade || '', data.cobradorEnderecoUf || ''].filter(Boolean).join(' - '),
              data.cobradorEnderecoCep ? `CEP ${formatarCep(data.cobradorEnderecoCep)}` : '',
            ]
              .filter(Boolean)
              .join(' | ');
      rowY = drawPropostaCampoLarguraCompacto(doc, grid, rowY, {
        label: 'Entrega do cobrador',
        value: entregaCobrador || '—',
      });
    }

    const boxH = rowY - startY + 2;
    drawDocumentoSectionBorder(doc, W, startY, boxH);
    y = startY + boxH + 3;
  }

  const dependentesResolvidos = data.dependentesDetalhados?.map((d) => ({
    ...d,
    parentesco: labelParentescoDependente(d.parentesco, 'completo', null, d.nome),
  })) || null;

  const listaDependentes = normalizarDependentesContrato(
    dependentesResolvidos,
    data.dependentesResumo,
  );

  // ── Dependentes — todos listados, com 2ª folha se necessário ─────────────
  y = garantirEspacoProposta(doc, y, 14, H);
  y = drawPropostaSecaoTituloCompacto(doc, W, y, 'Dependentes');
  y = drawPropostaTabelaDependentes(doc, {
    W,
    y: y + 1,
    dependentes: listaDependentes,
    bottomLimit: limiteTabelaY,
    numeroProposta: data.numero,
  });
  y += 2;

  // ── Observações ───────────────────────────────────────────────────────────
  if (data.observacoes?.trim()) {
    y = garantirEspacoProposta(doc, y, 18, H);
    y = drawPropostaSecaoTituloCompacto(doc, W, y, 'Observações');
    doc.setFillColor(...DOURADO_SUAVE);
    doc.setDrawColor(...DOURADO);
    doc.setLineWidth(0.25);
    const linhas = doc.splitTextToSize(data.observacoes.trim(), grid.innerW);
    const obsH = Math.min(22, 6 + linhas.length * 3.6);
    doc.roundedRect(MX, y - 1, W - MX * 2, obsH, 1, 1, 'FD');
    doc.setTextColor(...TEXTO_ESCURO);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(linhas, grid.pad, y + 3);
    y += obsH + 3;
  }

  // ── Assinaturas na última página (após todo o conteúdo) ───────────────────
  y = garantirEspacoProposta(doc, y, PROPOSTA_SIG_H + 6, H);
  y = drawDocumentoSignatures(doc, W, y + 2, {
    titulo: 'Assinatura do Contratante',
    nome: data.contribuinteNome || '—',
  }, {
    titulo: 'Assinatura do Vendedor',
    nome: data.vendedorNome || '—',
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    drawDocumentoPdfFooter(doc, W, H, {
      empresaNome,
      linhaCentral: 'PROPOSTA COMERCIAL DE PLANO',
      linhaInferior: `CNPJ: ${cnpjExibicao}  ·  Impresso em ${new Date().toLocaleString('pt-BR')}`,
    });
  }

  return pdfBlobFromJsPDF(doc);
};

// ─────────────────────────────────────────────────────────────────────────────
export const downloadPropostaPdf = (blob: Blob, numero: string) => {
  if (!blob?.size) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proposta-${numero.replace(/\s+/g, '-')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** Abre o PDF em nova aba para visualizar/imprimir (mais confiável que iframe oculto). */
export const abrirPropostaPdfEmNovaAba = (blob: Blob): boolean => {
  if (!blob?.size) return false;
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) return false;
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
};

export const printPropostaPdf = async (
  blob: Blob,
  janelaReservada?: Window | null,
): Promise<boolean> => {
  if (janelaReservada && !janelaReservada.closed) {
    return abrirPdfNaJanelaReservada(janelaReservada, blob);
  }
  return abrirPdfParaImprimir(blob);
};

export const openWhatsAppComMensagem = (
  mensagem: string,
  telefone?: string | null
) => {
  const url =
    obterUrlWhatsapp(telefone, mensagem) ||
    `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

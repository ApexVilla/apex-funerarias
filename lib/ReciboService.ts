import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { abrirPdfNaJanelaReservada, abrirPdfParaImprimir, downloadPdfBlob, isNavegadorMobile } from './printPdfBlob';
import { supabase } from './supabase';
import { drawReciboCabecalhoComLogo, loadLogoForPdf } from './fenixLogo';
import { carregarEmpresaReciboContext } from './reciboEmpresaContexto';

export interface ReciboData {
  numero: string;
  data: string;
  clienteNome: string;
  valor: number;
  valorExtenso?: string;
  referencia: string;
  descricao: string;
  vencimento: string;
  empresaCnpj?: string;
  empresaNome?: string;
  /** Empresa emissora (prioriza CNPJ da unidade do cliente/conta). */
  empresaId?: string;
  /** recebimento = parcela de cliente; pagamento = conta a pagar */
  tipoOperacao?: 'recebimento' | 'pagamento';
  /** quitado = pagamento/recebimento efetuado; em_aberto = orçamento/conta pendente */
  modoDocumento?: 'quitado' | 'em_aberto';
  contratoCodigo?: string;
  planoNome?: string;
  dataPagamento?: string;
  atendenteNome?: string;
  formaPagamento?: string;
  contaBancaria?: string;
  notaFiscal?: string;
  parcelaNumero?: string | number;
  mesReferencia?: string;
  parcelasDetalhes?: Array<{
    numero: string | number;
    vencimento: string;
    mesReferencia: string;
    valor: number;
    descricao: string;
  }>;
}

export function obterMesReferencia(dataVencimento: string): string {
  if (!dataVencimento || dataVencimento === '-') return '—';
  let dataStr = dataVencimento;
  if (dataVencimento.includes('/')) {
    const parts = dataVencimento.split('/');
    if (parts.length === 3) {
      dataStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  const d = new Date(`${dataStr.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return `${meses[d.getMonth()]} / ${d.getFullYear()}`;
}

export type ReciboContaPagarInput = {
  codigo: string;
  descricao: string;
  tipo_documento: string;
  fornecedor_nome?: string;
  numero_nota_fiscal?: string;
  data_vencimento: string;
  /** Quitado: valor pago na baixa. Em aberto: valor pendente (valor_aberto_centavos). */
  valor_pago_centavos?: number;
  valor_aberto_centavos?: number;
  data_pagamento?: string;
  situacao?: 'quitado' | 'em_aberto';
  forma_pagamento?: string;
  conta_bancaria?: string;
};

export function buildReciboContaPagarData(input: ReciboContaPagarInput): ReciboData {
  const emAberto = input.situacao === 'em_aberto';
  const beneficiario = input.fornecedor_nome?.trim() || input.descricao;
  const tipoLabel = input.tipo_documento.replace(/_/g, ' ');
  const nf = input.numero_nota_fiscal ? ` — NF ${input.numero_nota_fiscal}` : '';
  const vencimento = new Date(`${input.data_vencimento}T00:00:00`).toLocaleDateString('pt-BR');
  const valorCentavos = emAberto
    ? (input.valor_aberto_centavos ?? input.valor_pago_centavos ?? 0)
    : (input.valor_pago_centavos ?? 0);
  const dataDoc = emAberto
    ? new Date().toLocaleDateString('pt-BR')
    : new Date(`${input.data_pagamento || new Date().toISOString().slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

  return {
    numero: input.codigo,
    data: dataDoc,
    clienteNome: beneficiario,
    valor: valorCentavos / 100,
    referencia: emAberto
      ? `Orçamento em aberto — conta a pagar (${tipoLabel}): ${input.descricao}${nf}. Vencimento: ${vencimento}.`
      : `Pagamento de ${tipoLabel}: ${input.descricao}${nf}`,
    descricao: input.descricao,
    vencimento,
    tipoOperacao: 'pagamento',
    modoDocumento: emAberto ? 'em_aberto' : 'quitado',
    formaPagamento: input.forma_pagamento,
    contaBancaria: input.conta_bancaria,
    notaFiscal: input.numero_nota_fiscal,
    dataPagamento: input.data_pagamento ? new Date(`${input.data_pagamento}T12:00:00`).toLocaleDateString('pt-BR') : undefined,
  };
}

export async function imprimirReciboContaPagar(input: ReciboContaPagarInput) {
  let forma_pagamento = input.forma_pagamento;
  let conta_bancaria = input.conta_bancaria;
  let data_pagamento = input.data_pagamento;

  if (input.situacao === 'quitado' && (!forma_pagamento || !conta_bancaria)) {
    try {
      const { data: cp } = await supabase
        .from('fin_contas_pagar')
        .select('id')
        .eq('codigo', input.codigo)
        .maybeSingle();
      
      if (cp?.id) {
        const { data: bData } = await supabase
          .from('fin_contas_pagar_baixas')
          .select('forma_pagamento_id, conta_bancaria_id, data_baixa, created_at')
          .eq('conta_pagar_id', cp.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bData) {
          if (bData.forma_pagamento_id && !forma_pagamento) {
            const { data: f } = await supabase
              .from('fin_formas_pagamento')
              .select('nome')
              .eq('id', bData.forma_pagamento_id)
              .maybeSingle();
            if (f?.nome) forma_pagamento = f.nome;
          }
          if (bData.conta_bancaria_id && !conta_bancaria) {
            const { data: c } = await supabase
              .from('fin_contas_bancarias')
              .select('nome')
              .eq('id', bData.conta_bancaria_id)
              .maybeSingle();
            if (c?.nome) conta_bancaria = c.nome;
          }
          if (!data_pagamento) {
            data_pagamento = bData.data_baixa
              ? String(bData.data_baixa).slice(0, 10)
              : bData.created_at?.slice(0, 10);
          }
        }
      }
    } catch (e) {
      console.error('Erro ao buscar metadados da baixa para recibo:', e);
    }
  }

  await generateReciboPDF(buildReciboContaPagarData({
    ...input,
    forma_pagamento,
    conta_bancaria,
    data_pagamento,
  }));
}

const EMPRESA_NOME_PADRAO = 'FÊNIX FUNERÁRIA';
const EMPRESA_CNPJ_PADRAO = '03.617.822/0001-04';

const formatarCnpj = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return String(value || '').trim();
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const getEmpresaContext = async (empresaId?: string | null) => {
  const ctx = await carregarEmpresaReciboContext(empresaId);
  return {
    nome: ctx.nome,
    cnpj: ctx.cnpj,
    logo_url: ctx.logoUrlOrigem ?? null,
  };
};

const unidades = ["", "UM", "DOIS", "TRÊS", "QUATRO", "CINCO", "SEIS", "SETE", "OITO", "NOVE"];
const dez_a_dezenove = ["DEZ", "ONZE", "DOZE", "TREZE", "QUATORZE", "QUINZE", "DEZESSEIS", "DEZESSETE", "DEZEOITO", "DEZENOVE"];
const dezenas = ["", "", "VINTE", "TRINTA", "QUARENTA", "CINQUENTA", "SESSENTA", "SETENTA", "OITENTA", "NOVENTA"];
const centenas = ["", "CENTO", "DUZENTOS", "TREZENTOS", "QUATROCENTOS", "QUINHENTOS", "SEISCENTOS", "SETECENTOS", "OITOCENTOS", "NOVECENTOS"];

function escrever_grupo(n: number) {
    if (n === 100) return "CEM";
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    let res = centenas[c];
    if (res && (d > 0 || u > 0)) res += " E ";
    if (d === 1) {
        res += dez_a_dezenove[u];
    } else {
        res += dezenas[d];
        if (dezenas[d] && u > 0) res += " E ";
        res += unidades[u];
    }
    return res;
}

export function valorPorExtenso(valor: number) {
    if (valor === 0) return "ZERO REAIS";
    const inteiro = Math.floor(valor);
    const centavos = Math.round((valor - inteiro) * 100);

    let res = "";
    if (inteiro > 0) {
        const milhares = Math.floor(inteiro / 1000);
        const restinho = inteiro % 1000;
        if (milhares > 0) {
            if (milhares === 1) res += "MIL";
            else res += escrever_grupo(milhares) + " MIL";
            if (restinho > 0) res += (restinho < 100 || restinho % 100 === 0) ? " E " : ", ";
        }
        if (restinho > 0 || inteiro === 0) res += escrever_grupo(restinho);
        res += (inteiro === 1) ? " REAL" : " REAIS";
    }

    if (centavos > 0) {
        if (inteiro > 0) res += " E ";
        res += escrever_grupo(centavos);
        res += (centavos === 1) ? " CENTAVO" : " CENTAVOS";
    }

    return res;
}

type ReciboOutput = 'newtab' | 'blob';

export type OpcoesGenerateReciboPdf = {
  /** Modo PDF: salva o arquivo na pasta Downloads além de abrir na tela. */
  baixarTambem?: boolean;
};

export const generateReciboPDF = async (
  data: ReciboData,
  output: ReciboOutput = 'newtab',
  /** Abrir no clique (window.open('')) evita bloqueio após await. */
  janelaImpressao?: Window | null,
  opcoes?: OpcoesGenerateReciboPdf,
): Promise<{ blob: Blob; filename: string } | void> => {
  const empresa = await getEmpresaContext(data.empresaId);
  const empresaNome = data.empresaNome || empresa.nome || EMPRESA_NOME_PADRAO;
  const empresaCnpj = formatarCnpj(data.empresaCnpj) || empresa.cnpj || EMPRESA_CNPJ_PADRAO;

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const PRETO: [number, number, number] = [0, 0, 0];
  const M = 15;

  const upper = (s: string) => String(s ?? '—').toLocaleUpperCase('pt-BR');

  const isPagamento = data.tipoOperacao === 'pagamento';
  const emAberto = data.modoDocumento === 'em_aberto';
  const tituloDocumento = emAberto
    ? 'ORÇAMENTO EM ABERTO Nº'
    : isPagamento
      ? 'COMPROVANTE Nº'
      : 'RECIBO Nº';

  const logo = await loadLogoForPdf(empresa.logo_url);
  const corpoY = drawReciboCabecalhoComLogo(doc, W, M, null, {
    logo,
    empresaNome,
    subtitulo: 'Serviços Funerários e Planos de Assistência Familiar',
    cnpj: empresaCnpj,
    tituloDocumento,
    numero: data.numero,
    data: data.data,
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const boxW = 62;
  const boxH = 20;
  const boxX = W - M - boxW;
  const boxY = corpoY;
  const gapCaixa = 8;
  const colTextW = W - M * 2 - boxW - gapCaixa;
  const fontSizeCorpo = 10;
  const lineStepCorpo = fontSizeCorpo * 0.45;

  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.35);
  doc.rect(boxX, boxY, boxW, boxH);
  doc.setTextColor(...PRETO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(emAberto ? 'VALOR EM ABERTO' : 'VALOR TOTAL', boxX + boxW / 2, boxY + 7, { align: 'center' });
  doc.setFontSize(15);
  doc.text(formatCurrency(data.valor), boxX + boxW / 2, boxY + 15, { align: 'center' });

  let y = boxY;
  const rotulo =
    emAberto && isPagamento
      ? 'CONTA A PAGAR EM ABERTO —'
      : isPagamento
        ? 'PAGAMENTO EFETUADO A'
        : 'RECEBEMOS DE';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(rotulo, M, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSizeCorpo);
  const nomeLines = doc.splitTextToSize(upper(data.clienteNome || '—'), colTextW);
  nomeLines.forEach((line: string, i: number) => {
    doc.text(line, M, y + 11 + i * lineStepCorpo);
  });

  const fimBlocoNome = y + 11 + nomeLines.length * lineStepCorpo;
  y = Math.max(fimBlocoNome, boxY + boxH) + 10;

  const extenso = data.valorExtenso || valorPorExtenso(data.valor);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(emAberto ? 'NO VALOR DE:' : 'A QUANTIA DE:', M, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const extensoLines = doc.splitTextToSize(`${upper(extenso)},`, W - M * 2);
  doc.text(extensoLines, M, y + 6);
  y += 6 + extensoLines.length * 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('REFERENTE A:', M, y + 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const refLines = doc.splitTextToSize(upper(data.referencia), W - M * 2);
  doc.text(refLines, M, y + 9);
  y += 9 + refLines.length * 5 + 8;

  const showMetaCard = !!(data.contratoCodigo || data.planoNome || data.atendenteNome || data.formaPagamento || data.dataPagamento || data.contaBancaria || (isPagamento && data.clienteNome));
  if (showMetaCard) {
    const pad = 5;
    const rowH = 6;
    const labelColW = 30;
    const col1X = M + pad;
    const col1ValX = col1X + labelColW;
    const col1ValW = W / 2 - col1ValX - 4;
    const col2X = W / 2 + 4;
    const col2LabelW = 28;
    const col2ValX = col2X + col2LabelW;
    const col2ValW = W - M - pad - col2ValX;

    const drawMetaLabel = (label: string, x: number, lineY: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...PRETO);
      doc.text(label, x, lineY);
    };

    const drawMetaValue = (value: string, x: number, lineY: number, maxW: number): number => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...PRETO);
      const lines = doc.splitTextToSize(upper(value), maxW);
      lines.forEach((line: string, i: number) => {
        doc.text(line, x, lineY + i * 4);
      });
      return lines.length;
    };

    type MetaField = { label: string; value: string; col: 1 | 2 };
    const fields: MetaField[] = isPagamento
      ? [
          { label: 'FORNECEDOR:', value: data.clienteNome || '—', col: 1 },
          { label: 'NOTA FISCAL:', value: data.notaFiscal || '—', col: 1 },
          { label: 'VENCIMENTO:', value: data.vencimento || '—', col: 1 },
          { label: 'FORMA PGTO:', value: data.formaPagamento || '—', col: 2 },
          { label: 'CONTA/CAIXA:', value: data.contaBancaria || '—', col: 2 },
          { label: 'DATA PGTO:', value: data.dataPagamento || data.data || '—', col: 2 },
        ]
      : [
          { label: 'CONTRATO:', value: data.contratoCodigo || '—', col: 1 },
          { label: 'PLANO:', value: data.planoNome || '—', col: 1 },
          { label: 'ATENDENTE:', value: data.atendenteNome || '—', col: 1 },
          { label: 'FORMA PGTO:', value: data.formaPagamento || '—', col: 2 },
          { label: 'DATA PGTO:', value: data.dataPagamento || data.data || '—', col: 2 },
        ];

    const col1Fields = fields.filter((f) => f.col === 1);
    const col2Fields = fields.filter((f) => f.col === 2);

    const measureCol = (cols: MetaField[], valW: number) => {
      let h = pad;
      cols.forEach((f) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        const lines = doc.splitTextToSize(upper(f.value), valW);
        h += Math.max(1, lines.length) * rowH;
      });
      return h + pad;
    };

    const metaCardH = Math.max(measureCol(col1Fields, col1ValW), measureCol(col2Fields, col2ValW), 22);

    doc.setDrawColor(...PRETO);
    doc.setLineWidth(0.3);
    doc.rect(M, y, W - M * 2, metaCardH);

    const midX = W / 2;
    doc.line(midX, y, midX, y + metaCardH);

    let y1 = y + pad + 4;
    col1Fields.forEach((f) => {
      drawMetaLabel(f.label, col1X, y1);
      const n = drawMetaValue(f.value, col1ValX, y1, col1ValW);
      y1 += Math.max(1, n) * rowH;
    });

    let y2 = y + pad + 4;
    col2Fields.forEach((f) => {
      drawMetaLabel(f.label, col2X, y2);
      const n = drawMetaValue(f.value, col2ValX, y2, col2ValW);
      y2 += Math.max(1, n) * rowH;
    });

    y += metaCardH + 8;
  }

  const colValor = emAberto ? 'EM ABERTO' : 'VALOR';
  let headCols = [['DESCRIÇÃO', 'VENCIMENTO', colValor]];
  let bodyRows = [[upper(data.descricao), upper(data.vencimento), formatCurrency(data.valor)]];
  let colStyles: Record<string, { cellWidth: number; halign: 'left' | 'center' | 'right'; fontStyle?: 'bold' | 'normal' }> = {
    0: { cellWidth: (W - M * 2) * 0.55, halign: 'left' },
    1: { cellWidth: (W - M * 2) * 0.25, halign: 'center' },
    2: { cellWidth: (W - M * 2) * 0.20, halign: 'right', fontStyle: 'bold' },
  };

  if (data.parcelasDetalhes && data.parcelasDetalhes.length > 0) {
    headCols = [['Nº', 'MÊS REF.', 'DESCRIÇÃO', 'VENCIMENTO', 'VALOR']];
    bodyRows = data.parcelasDetalhes.map(p => [
      String(p.numero),
      upper(p.mesReferencia),
      upper(p.descricao),
      upper(p.vencimento),
      formatCurrency(p.valor)
    ]);
    colStyles = {
      0: { cellWidth: (W - M * 2) * 0.10, halign: 'center' },
      1: { cellWidth: (W - M * 2) * 0.22, halign: 'center' },
      2: { cellWidth: (W - M * 2) * 0.32, halign: 'left' },
      3: { cellWidth: (W - M * 2) * 0.20, halign: 'center' },
      4: { cellWidth: (W - M * 2) * 0.16, halign: 'right', fontStyle: 'bold' },
    };
  }

  autoTable(doc, {
    startY: y,
    head: headCols,
    body: bodyRows,
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: PRETO,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9,
      cellPadding: 2.5,
      lineWidth: 0.3,
      lineColor: PRETO,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: PRETO,
      halign: 'center',
      fontSize: 9,
      cellPadding: 2.5,
      lineWidth: 0.3,
      lineColor: PRETO,
    },
    columnStyles: colStyles,
    tableLineColor: PRETO,
    tableLineWidth: 0.3,
    margin: { left: M, right: M },
  });

  const afterTable = (doc as any).lastAutoTable.finalY as number;

  const sigY = Math.max(afterTable + 18, H - 55);
  const sigLineW = (W - M * 2) / 2 - 8;
  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.35);
  doc.line(M, sigY, M + sigLineW, sigY);
  doc.line(W - M - sigLineW, sigY, W - M, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PRETO);
  doc.text('ASSINATURA DO RESPONSÁVEL PELA EMPRESA', M + sigLineW / 2, sigY + 5, { align: 'center' });

  const assinaturaDireita =
    emAberto && isPagamento
      ? 'ASSINATURA DO FORNECEDOR / BENEFICIÁRIO'
      : isPagamento
        ? 'ASSINATURA DE QUEM RECEBEU O VALOR'
        : 'ASSINATURA DO CLIENTE / PAGADOR';
  const assinaturaLines = doc.splitTextToSize(assinaturaDireita, sigLineW - 4);
  assinaturaLines.forEach((line: string, i: number) => {
    doc.text(line, W - M - sigLineW / 2, sigY + 5 + i * 4, { align: 'center' });
  });

  const footerY = H - M - 2;
  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.35);
  doc.line(M, footerY - 14, W - M, footerY - 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(upper(empresaNome), W / 2, footerY - 9, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const rodapeMsg = emAberto
    ? `CNPJ: ${empresaCnpj} — DOCUMENTO DE CONTA A PAGAR EM ABERTO. NÃO COMPROVA PAGAMENTO EFETUADO.`
    : `CNPJ: ${empresaCnpj} — ESTE RECIBO É SUA GARANTIA DE PAGAMENTO. GUARDE-O COM CUIDADO.`;
  doc.text(rodapeMsg, W / 2, footerY - 4, { align: 'center' });

  if (output === 'blob') {
    return {
      blob: doc.output('blob'),
      filename: `${emAberto ? 'Orcamento-Aberto' : 'Recibo'}-${data.numero || Date.now()}.pdf`,
    };
  }

  const blob = doc.output('blob') as Blob;
  const filename = `${emAberto ? 'Orcamento-Aberto' : 'Recibo'}-${data.numero || Date.now()}.pdf`;
  const dataUrl = isNavegadorMobile() ? doc.output('dataurlstring') : undefined;
  const opcoesAbrir = { baixarTambem: opcoes?.baixarTambem };

  if (janelaImpressao) {
    if (!(await abrirPdfNaJanelaReservada(janelaImpressao, blob, filename, dataUrl, opcoesAbrir))) {
      if (!(await abrirPdfParaImprimir(blob, filename, opcoesAbrir))) {
        await downloadPdfBlob(blob, filename);
      }
    }
    return;
  }
  if (!(await abrirPdfParaImprimir(blob, filename, opcoesAbrir))) {
    await downloadPdfBlob(blob, filename);
  }
};

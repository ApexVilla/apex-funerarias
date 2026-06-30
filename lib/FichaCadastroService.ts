import jsPDF from 'jspdf';
import type { ClienteSB, AssinaturaSB, BeneficiarioSB } from './ClienteStore';
import { formatClienteEndereco, resolvePlanoContratoAssinatura } from './ContratoAssinaturaService';
import {
  PDF_PALETTE,
  drawDocumentoPdfFooter,
  drawDocumentoPdfHeader,
  drawDocumentoField,
  drawDocumentoFieldPair,
  drawDocumentoSectionBackground,
  drawDocumentoSectionBorder,
  drawDocumentoSectionBox,
  drawDocumentoSectionTitle,
  drawDocumentoSignatures,
  getDocumentoPdfGrid,
} from './documentoPdfLayout';
import { labelParentescoDependente } from './parentescoDependente';

export interface FichaParcelaResumo {
  assinatura_id?: string | null;
  parcelasPagas: number;
  parcelasEmAberto: number;
  parcelasVencidas: number;
  ultimoPagamento?: string | null;
  valorUltimoPagamentoCentavos?: number;
  totalPagoCentavos: number;
}

export interface FichaCadastroData {
  cliente: ClienteSB;
  assinaturas: AssinaturaSB[];
  beneficiarios: BeneficiarioSB[];
  parcelas?: Array<{
    assinatura_id?: string | null;
    status?: string | null;
    data_pagamento?: string | null;
    valor_pago_centavos?: number | null;
    data_vencimento?: string | null;
  }>;
  empresaNome?: string | null;
  empresaCnpj?: string | null;
  unidadeNome?: string | null;
}

export function calcularResumoParcelasFicha(
  parcelas: FichaCadastroData['parcelas'],
): { geral: FichaParcelaResumo; porAssinatura: Record<string, FichaParcelaResumo> } {
  const lista = Array.isArray(parcelas) ? parcelas : [];
  const empty: FichaParcelaResumo = {
    parcelasPagas: 0,
    parcelasEmAberto: 0,
    parcelasVencidas: 0,
    totalPagoCentavos: 0,
  };

  const porAssinatura: Record<string, FichaParcelaResumo> = {};
  const geral: FichaParcelaResumo = { ...empty };

  const registrarPagamento = (alvo: FichaParcelaResumo, pago: number, dt: string) => {
    alvo.parcelasPagas += 1;
    geral.parcelasPagas += 1;
    alvo.totalPagoCentavos += pago;
    geral.totalPagoCentavos += pago;
    if (dt && (!alvo.ultimoPagamento || dt > alvo.ultimoPagamento)) {
      alvo.ultimoPagamento = dt;
      alvo.valorUltimoPagamentoCentavos = pago;
    }
    if (dt && (!geral.ultimoPagamento || dt > geral.ultimoPagamento)) {
      geral.ultimoPagamento = dt;
      geral.valorUltimoPagamentoCentavos = pago;
    }
  };

  for (const p of lista) {
    const assId = p.assinatura_id || '_sem_contrato';
    if (!porAssinatura[assId]) {
      porAssinatura[assId] = { ...empty, assinatura_id: p.assinatura_id };
    }
    const alvo = porAssinatura[assId];
    const st = String(p.status || '').toLowerCase();
    const pago = Number(p.valor_pago_centavos || 0);
    const dt = (p.data_pagamento || '').slice(0, 10);

    if (st === 'pago') {
      registrarPagamento(alvo, pago, dt);
    } else if (st === 'pago_parcial') {
      if (pago > 0) {
        alvo.totalPagoCentavos += pago;
        geral.totalPagoCentavos += pago;
        if (dt && (!alvo.ultimoPagamento || dt > alvo.ultimoPagamento)) {
          alvo.ultimoPagamento = dt;
          alvo.valorUltimoPagamentoCentavos = pago;
        }
        if (dt && (!geral.ultimoPagamento || dt > geral.ultimoPagamento)) {
          geral.ultimoPagamento = dt;
          geral.valorUltimoPagamentoCentavos = pago;
        }
      }
      alvo.parcelasEmAberto += 1;
      geral.parcelasEmAberto += 1;
    } else if (st === 'vencido') {
      alvo.parcelasVencidas += 1;
      geral.parcelasVencidas += 1;
    } else if (st === 'aberto') {
      alvo.parcelasEmAberto += 1;
      geral.parcelasEmAberto += 1;
    }
  }

  return { geral, porAssinatura };
}

const formatCurrency = (centavos: number | null | undefined) =>
  `R$ ${(Number(centavos || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const formatarCpf = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 11) return value || '—';
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
};

const formatarCnpj = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return value || '—';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatarData = (isoDate?: string | null) => {
  if (!isoDate) return '—';
  try {
    const parts = isoDate.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  } catch {
    /* ignore */
  }
  return isoDate;
};

const formatarTelefone = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  }
  return value || '—';
};

const statusAssinaturaLabel = (status?: string | null) => {
  switch (String(status || '').toLowerCase()) {
    case 'ativo':
      return 'Ativo';
    case 'inativo':
      return 'Inativo';
    case 'cancelado':
      return 'Cancelado';
    case 'suspenso':
      return 'Suspenso';
    case 'atrasado':
      return 'Em Atraso';
    default:
      return status || '—';
  }
};

const parentescoLabel = (p?: string | null, sexo?: string | null, nome?: string | null) => labelParentescoDependente(p, 'completo', sexo, nome);

const MAX_CONTRATOS_FICHA = 2;
const MAX_DEPENDENTES_FICHA = 12;
const FOOTER_RESERVA_MM = 14;
const ZEBRA_CLARO: [number, number, number] = [243, 246, 252];

/** Ficha de cadastro / contato em uma única folha A4, layout em colunas. */
export const buildFichaCadastroPdfBlob = (data: FichaCadastroData): Blob => {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const { TEXTO_ESCURO, TEXTO_MEDIO, BRANCO, AZUL_PROFUNDO, MX } = PDF_PALETTE;
  const grid = getDocumentoPdfGrid(W);
  const maxY = H - FOOTER_RESERVA_MM;

  const empresaNome = (data.empresaNome || 'FENIX FUNERÁRIA').toUpperCase();
  const matricula = data.cliente.codigo || '—';

  let y = drawDocumentoPdfHeader(doc, W, {
    empresaNome,
    subtitulo: 'Ficha de Cadastro e Contato do Cliente',
    cnpj: formatarCnpj(data.empresaCnpj || '03.617.822/0002-95'),
    unidadeNome: data.unidadeNome,
    badgeTitulo: `MATRÍCULA: ${matricula}`,
    badgeSubtitulo: `Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
  });

  const { geral: resumoGeral, porAssinatura: resumoPorAssinatura } =
    calcularResumoParcelasFicha(data.parcelas);
  const assinaturasAtivas = (data.assinaturas || []).filter(
    (a) => String(a.status || '').toLowerCase() !== 'cancelado',
  );
  const activeDeps = data.beneficiarios.filter((b) => b.ativo !== false && !!(b.nome || '').trim());
  const depsExibir = activeDeps.slice(0, MAX_DEPENDENTES_FICHA);
  const depsRestantes = activeDeps.length - depsExibir.length;

  const cobrancaEnd =
    data.cliente.usa_endereco_residencial_cobranca !== false
      ? 'Mesmo endereço residencial'
      : [
          data.cliente.endereco_cob_logradouro,
          data.cliente.endereco_cob_numero,
          data.cliente.endereco_cob_complemento,
          data.cliente.endereco_cob_bairro,
          data.cliente.endereco_cob_cidade,
          data.cliente.endereco_cob_uf,
        ]
          .filter(Boolean)
          .join(' — ') || '—';

  // —— Bloco duas colunas: titular | contato ——
  const colTop = y;
  drawDocumentoSectionBackground(doc, W, colTop, 78);
  const halfW = grid.colW;
  const leftX = grid.col1X;
  const rightX = grid.col2X;
  let yL = colTop + 2;
  let yR = colTop + 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...AZUL_PROFUNDO);
  doc.text('DADOS DO TITULAR', leftX, yL);
  doc.text('ENDEREÇO E CONTATO', rightX, yR);
  yL += 5;
  yR += 5;

  const drawFullField = (label: string, value: string, x: number, yy: number, width: number): number => {
    const lines = drawDocumentoField(doc, label, value, x, yy, width);
    return yy + 7 + Math.max(0, lines - 1) * 4.2;
  };

  const drawPairFields = (
    left: { label: string; value: string },
    right: { label: string; value: string },
    x: number,
    yy: number,
    width: number,
  ): number => {
    const colGap = 3;
    const wHalf = (width - colGap) / 2;
    const leftLines = doc.splitTextToSize(left.value || '—', wHalf).length;
    const rightLines = doc.splitTextToSize(right.value || '—', wHalf).length;
    drawDocumentoField(doc, left.label, left.value, x, yy, wHalf);
    drawDocumentoField(doc, right.label, right.value, x + wHalf + colGap, yy, wHalf);
    const maxLines = Math.max(leftLines, rightLines);
    return yy + 7 + Math.max(0, maxLines - 1) * 4.2;
  };

  yL = drawFullField('Nome', data.cliente.nome || '—', leftX, yL, halfW - 2);
  yL = drawPairFields(
    { label: 'CPF', value: formatarCpf(data.cliente.cpf) },
    { label: 'RG', value: data.cliente.rg || '—' },
    leftX,
    yL,
    halfW - 2,
  );
  yL = drawPairFields(
    { label: 'Órgão / UF', value: `${data.cliente.rg_orgao_emissor || '—'} / ${data.cliente.rg_uf || '—'}` },
    { label: 'Nascimento', value: formatarData(data.cliente.data_nascimento) },
    leftX,
    yL,
    halfW - 2,
  );
  yL = drawPairFields(
    { label: 'Sexo', value: data.cliente.sexo || '—' },
    { label: 'Estado civil', value: data.cliente.estado_civil || '—' },
    leftX,
    yL,
    halfW - 2,
  );
  yL = drawPairFields(
    { label: 'Profissão', value: data.cliente.profissao || '—' },
    {
      label: 'Naturalidade',
      value: `${data.cliente.naturalidade_cidade || '—'}/${data.cliente.naturalidade_uf || '—'}`,
    },
    leftX,
    yL,
    halfW - 2,
  );
  yL = drawPairFields(
    { label: 'Mãe', value: data.cliente.nome_mae || '—' },
    { label: 'Pai', value: data.cliente.nome_pai || '—' },
    leftX,
    yL,
    halfW - 2,
  );

  yR = drawFullField('Residencial', formatClienteEndereco(data.cliente), rightX, yR, halfW - 2);
  yR = drawFullField('Cobrança', cobrancaEnd, rightX, yR, halfW - 2);
  yR = drawFullField('E-mail', data.cliente.email || '—', rightX, yR, halfW - 2);
  yR = drawPairFields(
    { label: 'Telefone', value: formatarTelefone(data.cliente.telefone_principal) },
    { label: 'Celular', value: formatarTelefone(data.cliente.celular) },
    rightX,
    yR,
    halfW - 2,
  );
  yR = drawFullField('Status', data.cliente.status || 'Ativo', rightX, yR, halfW - 2);

  const maxColY = Math.max(yL, yR);
  const colH = maxColY - colTop;
  drawDocumentoSectionBorder(doc, W, colTop, colH + 2);

  y = colTop + colH + 5;

  // —— Contratos (tabela compacta) ——
  y = drawDocumentoSectionTitle(doc, W, y, 'Contratos e planos');
  const contrH = assinaturasAtivas.length === 0 ? 10 : 8 + Math.min(assinaturasAtivas.length, MAX_CONTRATOS_FICHA) * 6.5;
  drawDocumentoSectionBox(doc, W, y, contrH);

  if (assinaturasAtivas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXTO_MEDIO);
    doc.text('Nenhum contrato registrado.', grid.pad, y + 4);
  } else {
    const cols = [32, 38, 28, 22, 22, 22];
    const headers = ['Código', 'Plano', 'Mensalidade', 'Venc.', 'Status', 'Pagas'];
    let hx = grid.pad;
    doc.setFillColor(...AZUL_PROFUNDO);
    doc.rect(MX, y, W - MX * 2, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...BRANCO);
    headers.forEach((h, i) => {
      doc.text(h, hx + 1, y + 3.8);
      hx += cols[i];
    });
    y += 5.5;

    assinaturasAtivas.slice(0, MAX_CONTRATOS_FICHA).forEach((ass, idx) => {
      doc.setFillColor(...(idx % 2 === 0 ? BRANCO : ZEBRA_CLARO));
      doc.rect(MX, y, W - MX * 2, 6, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...TEXTO_ESCURO);
      let cx = grid.pad;
      const pl = resolvePlanoContratoAssinatura(ass);
      const cells = [
        ass.codigo || '—',
        pl.label,
        formatCurrency(ass.valor_mensal_centavos),
        `Dia ${ass.dia_vencimento || '—'}`,
        statusAssinaturaLabel(ass.status),
        String(resumoPorAssinatura[ass.id]?.parcelasPagas ?? 0),
      ];
      cells.forEach((cell, i) => {
        const txt = doc.splitTextToSize(String(cell), cols[i] - 2)[0] as string;
        doc.text(txt, cx + 1, y + 4.2);
        cx += cols[i];
      });
      y += 6;
    });
    if (assinaturasAtivas.length > MAX_CONTRATOS_FICHA) {
      doc.setFontSize(6.5);
      doc.setTextColor(...TEXTO_MEDIO);
      doc.text(
        `+ ${assinaturasAtivas.length - MAX_CONTRATOS_FICHA} contrato(s) não exibido(s) nesta folha.`,
        grid.pad,
        y + 2,
      );
      y += 4;
    }
  }
  y += 2;

  // —— Financeiro (uma linha) ——
  y = drawDocumentoSectionTitle(doc, W, y, 'Situação financeira');
  drawDocumentoSectionBox(doc, W, y, 14);
  y += 2;
  y = drawDocumentoFieldPair(
    doc,
    grid,
    y,
    {
      label: 'Pagas / em aberto / vencidas',
      value: `${resumoGeral.parcelasPagas} / ${resumoGeral.parcelasEmAberto} / ${resumoGeral.parcelasVencidas}`,
    },
    {
      label: 'Último pagamento',
      value: resumoGeral.ultimoPagamento
        ? `${formatarData(resumoGeral.ultimoPagamento)} — ${formatCurrency(resumoGeral.valorUltimoPagamentoCentavos)}`
        : '—',
    },
  );
  y = drawDocumentoFieldPair(
    doc,
    grid,
    y,
    { label: 'Total recebido', value: formatCurrency(resumoGeral.totalPagoCentavos) },
    { label: '', value: '' },
  );
  y += 4;

  // —— Dependentes ——
  const depHeaderH = 5.5;
  const depRowH = 5;
  const depBodyH =
    depsExibir.length === 0 ? 8 : depHeaderH + depsExibir.length * depRowH + (depsRestantes > 0 ? 4 : 0);
  const depBlockH = Math.min(depBodyH + 4, maxY - y - 38);

  y = drawDocumentoSectionTitle(doc, W, y, `Dependentes (${activeDeps.length})`);
  drawDocumentoSectionBox(doc, W, y, depBlockH);

  if (depsExibir.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXTO_MEDIO);
    doc.text('Nenhum dependente ativo.', grid.pad, y + 4);
    y += depBlockH;
  } else {
    const dCols = [72, 28, 30, 24, 24];
    const dHead = ['Nome', 'Parentesco', 'CPF', 'Nascimento'];
    let dhx = grid.pad;
    doc.setFillColor(...AZUL_PROFUNDO);
    doc.rect(MX, y, W - MX * 2, depHeaderH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...BRANCO);
    dHead.forEach((h, i) => {
      doc.text(h, dhx + 1, y + 3.5);
      dhx += dCols[i];
    });
    y += depHeaderH;

    const maxRows = Math.floor((depBlockH - depHeaderH - 4) / depRowH);
    depsExibir.slice(0, maxRows).forEach((dep, idx) => {
      doc.setFillColor(...(idx % 2 === 0 ? BRANCO : ZEBRA_CLARO));
      doc.rect(MX, y, W - MX * 2, depRowH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...TEXTO_ESCURO);
      let rx = grid.pad;
      const nomeTxt = doc.splitTextToSize((dep.nome || '—').toUpperCase(), dCols[0] - 2)[0] as string;
      doc.text(nomeTxt, rx + 1, y + 3.5);
      rx += dCols[0];
      doc.text(parentescoLabel(dep.parentesco, dep.sexo, dep.nome), rx + 1, y + 3.5);
      rx += dCols[1];
      doc.text(formatarCpf(dep.cpf), rx + 1, y + 3.5);
      rx += dCols[2];
      doc.text(formatarData(dep.data_nascimento), rx + 1, y + 3.5);
      y += depRowH;
    });
    if (depsRestantes > 0 || activeDeps.length > maxRows) {
      const extra = activeDeps.length - Math.min(depsExibir.length, maxRows);
      doc.setFontSize(6.5);
      doc.setTextColor(...TEXTO_MEDIO);
      doc.text(`+ ${extra} dependente(s) — consulte o sistema para lista completa.`, grid.pad, y + 2);
      y += 4;
    }
    y += 2;
  }

  // —— Declaração + assinaturas (fixo no rodapé da folha) ——
  const sigY = maxY - 28;
  if (y < sigY - 4) y = sigY - 4;

  const { DOURADO_SUAVE, DOURADO } = PDF_PALETTE;
  doc.setFillColor(...DOURADO_SUAVE);
  doc.setDrawColor(...DOURADO);
  doc.setLineWidth(0.3);
  doc.roundedRect(MX, y, W - MX * 2, 11, 1, 1, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TEXTO_ESCURO);
  const decl =
    'Declaro que as informações desta ficha são verdadeiras e completas, responsabilizando-me pela exatidão dos dados.';
  doc.text(doc.splitTextToSize(decl, W - MX * 2 - 6), MX + 3, y + 4);
  y += 14;

  drawDocumentoSignatures(doc, W, y, {
    titulo: 'Assinatura do cliente',
    nome: (data.cliente.nome || '—').toUpperCase(),
  }, {
    titulo: 'Atendente / Fênix',
    nome: 'CONTRATADA',
  });

  drawDocumentoPdfFooter(doc, W, H, {
    empresaNome,
    linhaCentral: 'FICHA DE CADASTRO · UMA PÁGINA',
    linhaInferior: `Matrícula ${matricula} · Impresso em ${new Date().toLocaleString('pt-BR')}`,
  });

  return doc.output('blob');
};

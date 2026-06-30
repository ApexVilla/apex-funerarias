import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCentavos } from './FinanceiroStore';
import { rotuloFormaPagamento, calcularSaldoSessaoFromMovimentos, movimentoImpactaSaldoFisicoCaixa } from './caixaFormaPagamento';

export type CaixaPdfMovimento = {
  created_at: string;
  tipo: string;
  valor_centavos: number;
  forma_pagamento?: string | null;
  descricao?: string | null;
  usuario_nome?: string | null;
};

export type CaixaPdfSnapshot = {
  data_abertura: string;
  status: string;
  saldo_abertura_centavos: number;
  conta_nome: string;
  banco_nome?: string;
  filial_nome?: string;
  /** Caixa físico: saldo final só em espécie. Conta bancária: todas as formas. */
  somente_especie?: boolean;
  movimentos: CaixaPdfMovimento[];
};

export function mensagemErroDesconhecido(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const o = err as { message?: string; details?: string; hint?: string; code?: string };
    const partes = [o.message, o.details, o.hint, o.code].filter(Boolean);
    if (partes.length) return partes.join(' — ');
  }
  return String(err || 'Erro desconhecido');
}

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function fmtData(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function tipoEhEntrada(tipo: string): boolean {
  const t = tipo.toLowerCase();
  return t === 'entrada' || t === 'suprimento';
}

function pdfParaBlob(doc: jsPDF): Blob {
  const buf = doc.output('arraybuffer');
  if (!buf || (buf as ArrayBuffer).byteLength === 0) {
    throw new Error('PDF vazio apos geracao.');
  }
  return new Blob([buf], { type: 'application/pdf' });
}

/** Monta PDF a partir dos dados ja carregados na Tesouraria (sem Supabase). */
export function montarPdfCaixaBlob(snapshot: CaixaPdfSnapshot): Blob {
  const contaNome = snapshot.conta_nome || 'Conta';
  const banco = snapshot.banco_nome ? ` — ${snapshot.banco_nome}` : '';
  const filial = snapshot.filial_nome || '';

  let totalEntrada = 0;
  let totalSaida = 0;
  const totaisPorForma = new Map<string, { ent: number; sai: number }>();

  const somenteEspecie = snapshot.somente_especie === true;

  const linhasTabela = snapshot.movimentos.map((m) => {
    const valor = Number(m.valor_centavos) || 0;
    const entrada = tipoEhEntrada(m.tipo);
    const contaNoSaldo =
      !somenteEspecie
      || m.tipo === 'suprimento'
      || m.tipo === 'sangria'
      || movimentoImpactaSaldoFisicoCaixa(m);
    if (entrada && contaNoSaldo) totalEntrada += valor;
    if (!entrada && contaNoSaldo) totalSaida += valor;

    const formaKey = rotuloFormaPagamento(m.forma_pagamento);
    const acc = totaisPorForma.get(formaKey) || { ent: 0, sai: 0 };
    if (entrada) acc.ent += valor;
    else acc.sai += valor;
    totaisPorForma.set(formaKey, acc);

    return [
      fmtDataHora(m.created_at),
      rotuloFormaPagamento(m.forma_pagamento),
      entrada ? 'ENTRADA' : 'SAIDA',
      entrada ? formatCentavos(valor) : '-',
      entrada ? '-' : formatCentavos(valor),
      String(m.descricao || '').slice(0, 80),
      m.usuario_nome || 'Sistema',
    ];
  });

  const saldoAnt = Number(snapshot.saldo_abertura_centavos || 0);
  const saldoFin = calcularSaldoSessaoFromMovimentos(
    saldoAnt,
    snapshot.movimentos,
    somenteEspecie,
  );

  const totaisFormaRows: string[][] = [];
  totaisPorForma.forEach((v, forma) => {
    totaisFormaRows.push([
      forma,
      formatCentavos(v.ent),
      v.sai ? formatCentavos(v.sai) : '-',
      formatCentavos(v.ent - v.sai),
    ]);
  });
  totaisFormaRows.push([
    'TOTAL GERAL',
    formatCentavos(totalEntrada),
    totalSaida ? formatCentavos(totalSaida) : '-',
    formatCentavos(saldoFin),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(13, 27, 42);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('RELATORIO DE MOVIMENTACOES DO CAIXA', 14, 12);
  doc.setFontSize(8);
  doc.text(`Impresso em: ${new Date().toLocaleString('pt-BR')}`, pageW - 14, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.text(`Conta: ${contaNome}${banco}`, 14, 20);
  doc.text(
    `Data: ${fmtData(snapshot.data_abertura)}  |  Status: ${String(snapshot.status || '').toUpperCase()}  |  ${filial}`,
    14,
    25,
  );

  doc.setTextColor(30, 30, 30);
  let y = 36;
  [
    `Saldo anterior: ${formatCentavos(saldoAnt)}`,
    `Total entradas: ${formatCentavos(totalEntrada)}`,
    `Total saidas: ${formatCentavos(totalSaida)}`,
    `Saldo final: ${formatCentavos(saldoFin)}`,
  ].forEach((linha, i) => {
    doc.setFontSize(9);
    doc.text(linha, 14 + (i % 2) * 130, y + Math.floor(i / 2) * 5);
  });
  y += 14;

  if (linhasTabela.length === 0) {
    doc.setFontSize(10);
    doc.text('Nenhum lancamento nesta sessao.', 14, y + 4);
    y += 10;
  } else {
    autoTable(doc, {
      head: [['Data/Hora', 'Forma', 'Tipo', 'Entrada', 'Saida', 'Historico', 'Usuario']],
      body: linhasTabela,
      startY: y,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [27, 46, 69], textColor: 255 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 10, right: 10 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY as number) || y + 20;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Totais por forma de pagamento', 14, y + 8);
  doc.setFont('helvetica', 'normal');

  autoTable(doc, {
    head: [['Forma', 'Entradas', 'Saidas', 'Liquido']],
    body: totaisFormaRows,
    startY: y + 10,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 10, right: 10 },
  });

  return pdfParaBlob(doc);
}

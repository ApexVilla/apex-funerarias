import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { valorPorExtenso } from './ReciboService';
import { buildContratoFenixPdfBlob } from './ContratoFenixService';
import { buildContratoOnixPdfBlob } from './ContratoOnixService';

const fmtMoney = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);

const EMPRESA_EXEMPLO = {
  nome: 'Funerária Exemplo Ltda',
  cnpj: '03.617.822/2000-95',
  endereco: 'Av. Brasil, 1000, Centro - Goiânia/GO',
};

// ───────────────────────── Ordem de Serviço (exemplo) ─────────────────────────
export function buildOrdemServicoMockBlob(): { blob: Blob; filename: string } {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 14;
  const AZUL: [number, number, number] = [15, 55, 95];
  const BORDER: [number, number, number] = [200, 210, 220];

  // Cabeçalho
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(EMPRESA_EXEMPLO.nome, margin, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`CNPJ: ${EMPRESA_EXEMPLO.cnpj}`, margin, 17);
  doc.text(EMPRESA_EXEMPLO.endereco, margin, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ORDEM DE SERVIÇO Nº ATD-EXEMPLO', W - margin, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Emitida em ' + new Date().toLocaleString('pt-BR'), W - margin, 17, { align: 'right' });
  doc.text('PRÉVIA DE LAYOUT — DADOS DE EXEMPLO', W - margin, 22, { align: 'right' });

  let y = 34;
  const sectionTitle = (text: string) => {
    doc.setFillColor(243, 246, 249);
    doc.setDrawColor(...BORDER);
    doc.rect(margin, y, W - 2 * margin, 6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...AZUL);
    doc.text(text, margin + 2, y + 4.2);
    y += 8;
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
  };

  sectionTitle('DADOS DO FALECIDO');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    body: [
      ['Nome', 'José da Silva (exemplo)', 'CPF', '123.456.789-00'],
      ['Nascimento', '12/03/1950', 'Falecimento', new Date().toLocaleDateString('pt-BR')],
      ['Local do óbito', 'Hospital Santa Casa - Goiânia/GO', 'Causa', 'Causas naturais (exemplo)'],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  sectionTitle('DADOS DO RESPONSÁVEL');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    body: [
      ['Nome', 'Maria da Silva (exemplo)', 'Parentesco', 'Esposa'],
      ['Documento', '987.654.321-00', 'Telefone', '(62) 98888-1111'],
      ['Endereço', 'Rua das Flores 123, Setor Central, Goiânia - GO', '', ''],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  sectionTitle('SERVIÇO CONTRATADO');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Item', 'Descrição', 'Qtd', 'Valor']],
    body: [
      ['1', 'Plano Família Premium', '1', fmtMoney(450000)],
      ['2', 'Urna padrão Linha Ouro', '1', fmtMoney(180000)],
      ['3', 'Translado urbano', '1', fmtMoney(35000)],
    ],
    styles: { fontSize: 8 },
    headStyles: { fillColor: AZUL, fontSize: 8 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Valor total: ${fmtMoney(665000)}`, W - margin, y + 4, { align: 'right' });
  y += 12;

  sectionTitle('AUTORIZAÇÃO (RESUMO)');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    'A autorização técnica completa, com checklist de procedimentos e termo legal, está detalhada na próxima página.',
    margin,
    y,
    { maxWidth: W - 2 * margin }
  );
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  y += 12;

  doc.setDrawColor(120, 120, 120);
  doc.line(margin, y, margin + 70, y);
  doc.line(W - margin - 70, y, W - margin, y);
  doc.setFontSize(7.5);
  doc.text('Assinatura do responsável', margin + 35, y + 4, { align: 'center' });
  doc.text('Atendente funerário', W - margin - 35, y + 4, { align: 'center' });

  // ──────────── Página 2: Autorização Técnica ────────────
  doc.addPage();
  y = 14;
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(EMPRESA_EXEMPLO.nome, margin, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`CNPJ: ${EMPRESA_EXEMPLO.cnpj}`, margin, 17);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('AUTORIZAÇÃO TÉCNICA — ATENDIMENTO Nº ATD-EXEMPLO', W - margin, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(new Date().toLocaleString('pt-BR'), W - margin, 17, { align: 'right' });

  y = 32;
  doc.setTextColor(40, 40, 40);

  sectionTitle('1 — FALECIDO');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ['Nome', 'José da Silva (exemplo)'],
      ['CPF / Nascimento', '123.456.789-00  •  12/03/1950'],
      ['Data do óbito', new Date().toLocaleDateString('pt-BR')],
      ['Causa informada / Médico', 'Causas naturais — Dr. Antônio Souza CRM/GO 12345'],
    ],
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  sectionTitle('2 — RESPONSÁVEL');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ['Nome', 'Maria da Silva (exemplo)'],
      ['Contato', '(62) 98888-1111'],
      ['CPF', '987.654.321-00'],
    ],
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  sectionTitle('3 — PROCEDIMENTOS AUTORIZADOS');
  doc.setFontSize(9);
  const checkbox = (x: number, yy: number, marcado: boolean, label: string) => {
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.3);
    doc.rect(x, yy - 3.2, 4, 4);
    if (marcado) {
      doc.setFont('helvetica', 'bold');
      doc.text('X', x + 1, yy);
      doc.setFont('helvetica', 'normal');
    }
    doc.text(label, x + 6, yy);
  };
  checkbox(margin + 2, y + 5, true, 'Embalsamento / Higienização externa');
  checkbox(margin + 90, y + 5, true, 'Formalização (intervenção interna)');
  checkbox(margin + 2, y + 12, false, 'Coleta de material');
  checkbox(margin + 90, y + 12, true, 'Remoção autorizada');
  checkbox(margin + 2, y + 19, true, 'Tanatopraxia');
  checkbox(margin + 90, y + 19, false, 'Reconstituição');
  y += 25;

  sectionTitle('4 — ORIENTAÇÕES TÉCNICAS');
  doc.setFontSize(9);
  doc.text('Aplicar tanatopraxia básica e ornamentação padrão. Vestimenta fornecida pela família.', margin, y, {
    maxWidth: W - 2 * margin,
  });
  y += 8;

  sectionTitle('5 — TERMO DE AUTORIZAÇÃO');
  doc.setFontSize(9);
  const termo = doc.splitTextToSize(
    `Eu, Maria da Silva, portadora do contato (62) 98888-1111, na qualidade de responsável legal pelo(a) falecido(a) acima identificado(a), AUTORIZO a ${EMPRESA_EXEMPLO.nome} a realizar todos os procedimentos técnicos assinalados, nas condições e limites previstos em contrato e na legislação vigente. Declaro estar ciente de que a execução dos procedimentos é irreversível e prestada por equipe técnica habilitada.`,
    W - 2 * margin
  );
  doc.text(termo, margin, y);
  y += termo.length * 4.2 + 14;

  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  const sigW = (W - 2 * margin - 8) / 2;
  doc.line(margin, y, margin + sigW, y);
  doc.line(margin + sigW + 8, y, W - margin, y);
  doc.setFontSize(8);
  doc.text('Maria da Silva', margin + sigW / 2, y + 4, { align: 'center' });
  doc.text('Assinatura do responsável', margin + sigW / 2, y + 8, { align: 'center' });
  doc.text('Atendente / Técnico responsável', margin + sigW + 8 + sigW / 2, y + 8, { align: 'center' });

  return { blob: doc.output('blob'), filename: 'OS-Previa-Exemplo.pdf' };
}

// ───────────────────────── Recibo de Pagamento (exemplo) ─────────────────────────
export function buildReciboAtendimentoMockBlob(): { blob: Blob; filename: string } {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const AZUL: [number, number, number] = [15, 55, 95];
  const CINZA: [number, number, number] = [243, 246, 249];

  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.rect(5, 5, W - 10, H - 10);

  doc.setFillColor(...AZUL);
  doc.rect(5, 5, W - 10, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(EMPRESA_EXEMPLO.nome, 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`CNPJ: ${EMPRESA_EXEMPLO.cnpj}`, 10, 21);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RECIBO • ATD-EXEMPLO', W - 8, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, W - 8, 21, { align: 'right' });

  const valor = 665000;
  doc.setFillColor(...CINZA);
  doc.roundedRect(W - 60, 36, 50, 14, 1, 1, 'F');
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(fmtMoney(valor), W - 35, 45, { align: 'center' });

  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 55;
  doc.text('Recebemos de Maria da Silva (CPF 987.654.321-00),', 8, y);
  y += 6;
  const extenso = valorPorExtenso(valor / 100);
  const linhasExt = doc.splitTextToSize(`a quantia de ${extenso.toLowerCase()},`, W - 16);
  doc.text(linhasExt, 8, y);
  y += linhasExt.length * 5;
  doc.text(`referente ao atendimento ATD-EXEMPLO (${new Date().toLocaleDateString('pt-BR')}).`, 8, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: 8, right: 8 },
    head: [['Forma', 'Valor']],
    body: [
      ['PIX', fmtMoney(300000)],
      ['Cartão crédito', fmtMoney(265000)],
      ['Dinheiro', fmtMoney(100000)],
    ],
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: AZUL, fontSize: 8 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Valor total recebido: ${fmtMoney(valor)}`, 8, y);
  y += 10;

  doc.setDrawColor(120, 120, 120);
  doc.line(W / 2 - 35, H - 25, W / 2 + 35, H - 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text('Maria da Silva', W / 2, H - 21, { align: 'center' });
  doc.text('Assinatura do responsável', W / 2, H - 17, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(`${EMPRESA_EXEMPLO.nome} • CNPJ ${EMPRESA_EXEMPLO.cnpj}`, W / 2, H - 9, { align: 'center' });

  return { blob: doc.output('blob'), filename: 'ReciboAtendimento-Previa.pdf' };
}

// ───────────────────────── Contrato Plano Fênix (exemplo) ─────────────────────────
export const generateMockContratoFenix = async () => {
  return buildContratoFenixPdfBlob({
    numeroContrato: "2024.001",
    nomePlano: "PLANO FÊNIX",
    titularNome: "JOÃO DA SILVA (MOCK)",
    titularCpf: "000.000.000-00",
    titularEndereco: "AVENIDA PRINCIPAL, 123, APARECIDA DE GOIÂNIA - GO",
    vendedorNome: "ADMINISTRADOR",
    dataContrato: format(new Date(), "dd/MM/yyyy"),
    dependentes: ["MARIA SILVA (ESPOSA)", "PEDRO SILVA (FILHO)"]
  });
};

export const generateMockContratoOnix = async () => {
  return buildContratoOnixPdfBlob({
    numeroContrato: "2024.ONIX.001",
    nomePlano: "PLANO ONIX",
    titularNome: "MARIA OLIVEIRA (MOCK)",
    titularCpf: "111.111.111-11",
    titularEndereco: "RUA DAS FLORES, 456, GOIÂNIA - GO",
    vendedorNome: "VENDEDOR EXEMPLO",
    dataContrato: format(new Date(), "dd/MM/yyyy"),
    dependentes: ["JOSE OLIVEIRA (MARIDO)", "ANA OLIVEIRA (FILHA)"]
  });
};

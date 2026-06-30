import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { gerarOrdemServicoAtendimentoPdf } from './AtendimentoOrdemServicoPdf';
import { supabase } from './supabase';
import { loadLogoForPdf } from './fenixLogo';
import { valorPorExtenso } from './ReciboService';

const formatarCnpj = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return value || '—';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const fmtMoney = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
};

async function getEmpresaCtx(empresaId: string) {
  const { data } = await supabase
    .from('empresas')
    .select('nome, cnpj, logo_url')
    .eq('id', empresaId)
    .maybeSingle();
  return {
    nome: data?.nome || 'Funerária',
    cnpj: formatarCnpj(data?.cnpj),
    logoUrl: (data as any)?.logo_url || null,
  };
}

function getEmpresaIdFromSession(): string {
  try {
    const raw = sessionStorage.getItem('user');
    const u = raw ? JSON.parse(raw) : {};
    return u?.empresa_id || sessionStorage.getItem('empresa_id') || '';
  } catch {
    return sessionStorage.getItem('empresa_id') || '';
  }
}

// ───────────────────────── Recibo de pagamento do atendimento ─────────────────────────
async function gerarReciboAtendimentoPdf(
  atendimentoId: string
): Promise<{ blob: Blob; filename: string } | null> {
  const empresaId = getEmpresaIdFromSession();
  if (!empresaId) return null;

  const { data: atd } = await supabase
    .from('ser_atendimentos')
    .select(
      `id, codigo, data_servico, valor_total_centavos, valor_pago_centavos, pagamentos_divididos, observacoes,
       representante_nome, representante_contato,
       clientes:cliente_id ( nome, cpf )`
    )
    .eq('id', atendimentoId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (!atd) return null;

  const empresa = await getEmpresaCtx(empresaId);
  const logo = await loadLogoForPdf(empresa.logoUrl);
  const cliente = atd.clientes as { nome?: string; cpf?: string } | null;
  const valorPago = Number(atd.valor_pago_centavos || 0);

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const AZUL = [15, 55, 95] as [number, number, number];
  const CINZA = [243, 246, 249] as [number, number, number];

  // Borda externa
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.rect(5, 5, W - 10, H - 10);

  // Cabeçalho
  doc.setFillColor(...AZUL);
  doc.rect(5, 5, W - 10, 26, 'F');
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(8, 8, 18, 18, 1.2, 1.2, 'F');
      doc.addImage(logo.dataUrl, logo.format, 9, 9, 16, 16, undefined, 'FAST');
    } catch { /* noop */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(empresa.nome, logo ? 30 : 10, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`CNPJ: ${empresa.cnpj}`, logo ? 30 : 10, 21);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const tit = `RECIBO • ATENDIMENTO ${atd.codigo}`;
  doc.text(tit, W - 8, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, W - 8, 21, { align: 'right' });

  // Caixa de valor
  doc.setFillColor(...CINZA);
  doc.roundedRect(W - 60, 36, 50, 14, 1, 1, 'F');
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(fmtMoney(valorPago), W - 35, 45, { align: 'center' });

  // Corpo
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 55;
  doc.text(`Recebemos de ${cliente?.nome || '—'}${cliente?.cpf ? ` (CPF ${cliente.cpf})` : ''},`, 8, y);
  y += 6;
  const extenso = valorPorExtenso(valorPago / 100);
  const linhasExt = doc.splitTextToSize(`a quantia de ${extenso.toLowerCase()},`, W - 16);
  doc.text(linhasExt, 8, y);
  y += linhasExt.length * 5;
  const referencia = `referente ao atendimento ${atd.codigo} (${fmtDate(atd.data_servico)}).`;
  const linhasRef = doc.splitTextToSize(referencia, W - 16);
  doc.text(linhasRef, 8, y);
  y += linhasRef.length * 5 + 4;

  // Tabela de pagamentos
  const pagamentos = Array.isArray(atd.pagamentos_divididos) && atd.pagamentos_divididos.length > 0
    ? (atd.pagamentos_divididos as Array<{ forma: string; valor_centavos: number }>)
    : [{ forma: 'pagamento', valor_centavos: valorPago }];
  const formaLabel = (f: string) => ({
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao_credito: 'Cartão crédito',
    cartao_debito: 'Cartão débito',
    boleto: 'Boleto',
    transferencia: 'Transferência',
    outro: 'Outro',
  } as Record<string, string>)[f] || f;

  autoTable(doc, {
    startY: y,
    margin: { left: 8, right: 8 },
    head: [['Forma', 'Valor']],
    body: pagamentos.map((p) => [formaLabel(p.forma), fmtMoney(Number(p.valor_centavos || 0))]),
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: AZUL, fontSize: 8 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Valor total recebido: ${fmtMoney(valorPago)}`, 8, y);
  if (Number(atd.valor_total_centavos || 0) > valorPago) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(170, 60, 60);
    doc.text(
      `Saldo em aberto: ${fmtMoney(Number(atd.valor_total_centavos || 0) - valorPago)}`,
      8,
      y + 4
    );
    doc.setTextColor(40, 40, 40);
  }
  y += 12;

  // Assinatura
  doc.setDrawColor(120, 120, 120);
  doc.line(W / 2 - 35, H - 25, W / 2 + 35, H - 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text(atd.representante_nome || '—', W / 2, H - 21, { align: 'center' });
  doc.text('Assinatura do responsável', W / 2, H - 17, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(`${empresa.nome} • CNPJ ${empresa.cnpj}`, W / 2, H - 9, { align: 'center' });

  const filename = `Recibo-${atd.codigo}.pdf`;
  return { blob: doc.output('blob'), filename };
}

// ───────────────────────── Autorização Técnica (Tanatopraxia / Preparação) ─────────────────────────
// NOTA: A Autorização Técnica agora é gerada como parte da Ordem de Serviço (página 2 da OS).
// Esta função é mantida apenas como referência histórica e não é mais usada no app.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function gerarAutorizacaoTecnicaPdf(
  atendimentoId: string
): Promise<{ blob: Blob; filename: string } | null> {
  const empresaId = getEmpresaIdFromSession();
  if (!empresaId) return null;

  const { data: atd } = await supabase
    .from('ser_atendimentos')
    .select(
      `id, codigo, data_servico, observacoes,
       inspecao_interna, inspecao_externa, coleta_material,
       orientacoes_tecnicas, observacoes_corpo, autoriza_remocao,
       formulario_preparacao, motivo_morte, medico_nome_crm,
       representante_nome, representante_contato,
       clientes:cliente_id ( nome, cpf, telefone_principal, celular ),
       falecidos:falecido_id ( nome, cpf, data_nascimento, data_falecimento )`
    )
    .eq('id', atendimentoId)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (!atd) return null;

  const empresa = await getEmpresaCtx(empresaId);
  const logo = await loadLogoForPdf(empresa.logoUrl);
  const cliente = (atd.clientes as any) as Record<string, unknown> | null;
  const falecido = (atd.falecidos as any) as Record<string, unknown> | null;

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 14;
  const AZUL = [15, 55, 95] as [number, number, number];
  const BORDER = [200, 210, 220] as [number, number, number];

  // Cabeçalho com logo
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 26, 'F');
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, 4, 18, 18, 1.2, 1.2, 'F');
      doc.addImage(logo.dataUrl, logo.format, margin + 1, 5, 16, 16, undefined, 'FAST');
    } catch { /* noop */ }
  }
  const xTxt = margin + (logo ? 22 : 0);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(empresa.nome, xTxt, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`CNPJ: ${empresa.cnpj}`, xTxt, 17);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const tit = `AUTORIZAÇÃO TÉCNICA — ATENDIMENTO Nº ${atd.codigo}`;
  doc.text(tit, W - margin - doc.getTextWidth(tit), 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, W - margin, 17, { align: 'right' });

  let y = 32;
  doc.setTextColor(40, 40, 40);

  const sectionTitle = (text: string) => {
    doc.setFillColor(243, 246, 249);
    doc.setDrawColor(...BORDER);
    doc.rect(margin, y, W - 2 * margin, 6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...AZUL);
    doc.text(text.toUpperCase(), margin + 2, y + 4.2);
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    y += 8;
  };

  // 1 — Falecido
  sectionTitle('1 — Falecido');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ['Nome', String(falecido?.nome || '—')],
      ['CPF / Nascimento', `${String(falecido?.cpf || '—')}  •  ${fmtDate(falecido?.data_nascimento as string)}`],
      ['Data do óbito', fmtDate(falecido?.data_falecimento as string)],
      ['Causa informada / Médico', `${String(atd.motivo_morte || '—')} — ${String(atd.medico_nome_crm || '—')}`],
    ],
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // 2 — Responsável
  sectionTitle('2 — Responsável');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ['Nome', String(atd.representante_nome || cliente?.nome || '—')],
      ['Contato', String(atd.representante_contato || cliente?.telefone_principal || cliente?.celular || '—')],
      ['CPF', String(cliente?.cpf || '—')],
    ],
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // 3 — Procedimentos autorizados
  sectionTitle('3 — Procedimentos autorizados');
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
  checkbox(margin + 2, y + 5, !!atd.inspecao_externa, 'Embalsamento / Higienização externa');
  checkbox(margin + 90, y + 5, !!atd.inspecao_interna, 'Formalização (intervenção interna)');
  checkbox(margin + 2, y + 12, !!atd.coleta_material, 'Coleta de material');
  checkbox(margin + 90, y + 12, !!atd.autoriza_remocao, 'Remoção autorizada');
  // Tanatopraxia: marcar se houver palavra-chave
  const txtAutorizacao = `${atd.formulario_preparacao || ''} ${atd.orientacoes_tecnicas || ''}`.toLowerCase();
  const tanato = /tanat/.test(txtAutorizacao);
  checkbox(margin + 2, y + 19, tanato, 'Tanatopraxia');
  checkbox(margin + 90, y + 19, /reconstit/.test(txtAutorizacao), 'Reconstituição');
  y += 25;

  // 4 — Orientações técnicas
  sectionTitle('4 — Orientações técnicas');
  doc.setFontSize(9);
  const orient = doc.splitTextToSize(String(atd.orientacoes_tecnicas || '—'), W - 2 * margin);
  doc.text(orient, margin, y);
  y += orient.length * 4.2 + 4;

  // 5 — Observações sobre o corpo
  sectionTitle('5 — Observações sobre o corpo');
  const obsCorpo = doc.splitTextToSize(String(atd.observacoes_corpo || '—'), W - 2 * margin);
  doc.text(obsCorpo, margin, y);
  y += obsCorpo.length * 4.2 + 6;

  // Termo de autorização
  sectionTitle('6 — Termo de autorização');
  doc.setFontSize(9);
  const termo = doc.splitTextToSize(
    `Eu, ${atd.representante_nome || '__________________________________'}, portador do contato ${atd.representante_contato || '___________________'}, na qualidade de responsável legal pelo(a) falecido(a) acima identificado(a), AUTORIZO a ${empresa.nome} a realizar todos os procedimentos técnicos assinalados, nas condições e limites previstos em contrato e na legislação vigente. Declaro estar ciente de que a execução dos procedimentos é irreversível e prestada por equipe técnica habilitada.`,
    W - 2 * margin
  );
  doc.text(termo, margin, y);
  y += termo.length * 4.2 + 14;

  // Assinaturas
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  const sigW = (W - 2 * margin - 8) / 2;
  doc.line(margin, y, margin + sigW, y);
  doc.line(margin + sigW + 8, y, W - margin, y);
  doc.setFontSize(8);
  doc.text(atd.representante_nome || '—', margin + sigW / 2, y + 4, { align: 'center' });
  doc.text('Assinatura do responsável', margin + sigW / 2, y + 8, { align: 'center' });
  doc.text('Atendente / Técnico responsável', margin + sigW + 8 + sigW / 2, y + 8, { align: 'center' });

  // Rodapé
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const rodape = `${empresa.nome} • CNPJ ${empresa.cnpj}`;
  doc.text(rodape, W / 2, H - 8, { align: 'center' });

  const filename = `Autorizacao-Tecnica-${atd.codigo}.pdf`;
  return { blob: doc.output('blob'), filename };
}

// ───────────────────────── Catálogo público ─────────────────────────
export interface DocumentoCatalogo {
  id: string;
  titulo: string;
  descricao: string;
  disponivel: boolean;
  motivoIndisponivel?: string;
  gerar: () => Promise<{ blob: Blob; filename: string } | null>;
}

export interface AtendimentoResumoDoc {
  id: string;
  codigo?: string;
  status?: string;
  valor_pago_centavos?: number;
  valor_total_centavos?: number;
  valor_desconto_centavos?: number;
  desconto_autorizado_por?: string | null;
  autoriza_remocao?: boolean;
  inspecao_interna?: boolean;
  inspecao_externa?: boolean;
  coleta_material?: boolean;
  orientacoes_tecnicas?: string | null;
  formulario_preparacao?: string | null;
}

export function getDocumentosAtendimento(atd: AtendimentoResumoDoc): DocumentoCatalogo[] {
  const valorPago = Number(atd.valor_pago_centavos || 0);
  const houveProcedimento =
    !!atd.inspecao_interna ||
    !!atd.inspecao_externa ||
    !!atd.coleta_material ||
    !!atd.formulario_preparacao ||
    !!atd.orientacoes_tecnicas;

  // Mantemos referência apenas para evitar erro de "variável não usada" — autorização agora é parte da OS.
  void houveProcedimento;
  return [
    {
      id: 'ordem-servico',
      titulo: 'Ordem de Serviço (OS) completa',
      descricao:
        'OS principal + Autorização Técnica + folha de deslocamentos em um único documento.',
      disponivel: true,
      gerar: () => gerarOrdemServicoAtendimentoPdf(atd.id, { download: false }),
    },
    {
      id: 'recibo-pagamento',
      titulo: 'Recibo de Pagamento',
      descricao: 'Comprovante das formas de pagamento informadas no atendimento.',
      disponivel: valorPago > 0,
      motivoIndisponivel: 'Disponível somente após registrar o valor pago e fechar o atendimento.',
      gerar: () => gerarReciboAtendimentoPdf(atd.id),
    },
  ];
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadLogoForPdf } from './fenixLogo';
import { supabase } from './supabase';

type ViagemRow = {
  id: string;
  motorista_id: string | null;
  veiculo_id: string;
  origem: string | null;
  destino: string | null;
  data_saida: string | null;
  hora_saida: string | null;
  data_retorno: string | null;
  hora_retorno: string | null;
  km_saida: number | null;
  km_retorno: number | null;
  observacao: string | null;
  status: string;
};

const fmtMoney = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
};

const fmtTime = (t?: string | null) => {
  if (!t) return '—';
  return String(t).slice(0, 5);
};

const formatarCnpj = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return value || '—';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

function diffMinutes(horaSaida?: string | null, horaChegada?: string | null): number | null {
  if (!horaSaida || !horaChegada) return null;
  const [sh, sm] = horaSaida.split(':').map(Number);
  const [eh, em] = horaChegada.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  return eh * 60 + em - (sh * 60 + sm);
}

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} h`;
}

async function getEmpresaHeader(empresaId: string) {
  const { data } = await supabase
    .from('empresas')
    .select('nome, cnpj, logo_url')
    .eq('id', empresaId)
    .maybeSingle();
  return {
    nome: data?.nome || 'Funerária',
    cnpj: formatarCnpj(data?.cnpj),
    logo_url: (data as any)?.logo_url || null,
    endereco: '',
    telefone: '',
  };
}

async function enrichViagens(rows: ViagemRow[]) {
  const veiculoIds = [...new Set(rows.map((r) => r.veiculo_id).filter(Boolean))];
  const motoristaIds = [...new Set(rows.map((r) => r.motorista_id).filter(Boolean) as string[])];
  const veicMap: Record<string, { placa: string; modelo: string }> = {};
  const motMap: Record<string, string> = {};
  if (veiculoIds.length) {
    const { data } = await supabase.from('frota_veiculos').select('id, placa, modelo').in('id', veiculoIds);
    (data || []).forEach((v: any) => {
      veicMap[v.id] = { placa: v.placa || '', modelo: v.modelo || '' };
    });
  }
  if (motoristaIds.length) {
    const { data } = await supabase.from('frota_motoristas').select('id, nome').in('id', motoristaIds);
    (data || []).forEach((m: any) => {
      motMap[m.id] = m.nome || '';
    });
  }
  return rows.map((r) => ({
    ...r,
    placa: veicMap[r.veiculo_id]?.placa || '—',
    veiculo_modelo: veicMap[r.veiculo_id]?.modelo || '',
    motorista_nome: r.motorista_id ? motMap[r.motorista_id] || '—' : '—',
  }));
}

export interface GerarOsPdfOptions {
  /** Se false, apenas retorna o blob sem disparar download */
  download?: boolean;
  filename?: string;
}

/**
 * Monta o PDF da Ordem de Serviço (modelo Fenix otimizado) + folha de deslocamentos.
 * Deslocamentos são preenchidos com frota_viagens.atendimento_id quando existirem.
 */
export async function gerarOrdemServicoAtendimentoPdf(
  atendimentoId: string,
  options: GerarOsPdfOptions = {}
): Promise<{ blob: Blob; filename: string } | null> {
  const download = options.download !== false;
  const { empresaId } = await (async () => {
    try {
      const raw = sessionStorage.getItem('user');
      const u = raw ? JSON.parse(raw) : {};
      const eid = u?.empresa_id || sessionStorage.getItem('empresa_id') || '';
      return { empresaId: eid };
    } catch {
      return { empresaId: '' };
    }
  })();

  if (!empresaId) {
    console.error('[OS PDF] empresa_id não encontrado na sessão');
    return null;
  }

  const { data: atd, error: atdErr } = await supabase
    .from('ser_atendimentos')
    .select(
      `
      *,
      clientes:cliente_id (
        id, nome, cpf, telefone_principal, celular, email,
        endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro,
        endereco_cidade, endereco_estado, endereco_cep
      ),
      falecidos:falecido_id ( nome, cpf, data_nascimento, data_falecimento, local_falecimento, parentesco ),
      usuarios:usuario_id ( nome )
    `
    )
    .eq('id', atendimentoId)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (atdErr || !atd) {
    console.error('[OS PDF] atendimento não encontrado', atdErr);
    return null;
  }

  const [{ data: itensServ }, { data: itensProd }, { data: viagensRaw }, empresa] = await Promise.all([
    supabase
      .from('ser_atendimento_servicos')
      .select('quantidade, preco_unitario_centavos, subtotal_centavos, ser_servicos ( nome )')
      .eq('atendimento_id', atendimentoId),
    supabase
      .from('ser_atendimento_produtos')
      .select('quantidade, preco_unitario_centavos, subtotal_centavos, ser_produtos ( nome )')
      .eq('atendimento_id', atendimentoId),
    supabase.from('frota_viagens').select('*').eq('atendimento_id', atendimentoId).order('created_at', { ascending: true }),
    getEmpresaHeader(empresaId),
  ]);

  let planoNome: string | null = null;
  let kmsFranquia: number | null = null;
  if (atd.tipo_atendimento === 'plano' && atd.cliente_id) {
    const { data: ass } = await supabase
      .from('assinaturas')
      .select('plano_id, planos ( nome )')
      .eq('cliente_id', atd.cliente_id)
      .eq('status', 'ativo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const pl = ass?.planos as { nome?: string } | null;
    planoNome = pl?.nome || null;
    const pid = ass?.plano_id as string | undefined;
    if (pid) {
      const { data: plKm, error: plKmErr } = await supabase
        .from('planos')
        .select('kms_franquia_transporte')
        .eq('id', pid)
        .maybeSingle();
      if (!plKmErr && plKm && typeof plKm.kms_franquia_transporte === 'number') {
        kmsFranquia = plKm.kms_franquia_transporte;
      }
    }
  }

  const viagensAll = await enrichViagens((viagensRaw || []) as ViagemRow[]);
  const viagensExtraNote = viagensAll.length > 6 ? viagensAll.length - 6 : 0;
  const viagens = viagensAll.slice(0, 6);

  const cliente = atd.clientes as Record<string, unknown> | null;
  const falecido = atd.falecidos as Record<string, unknown> | null;
  const atendente = (atd.usuarios as { nome?: string } | null)?.nome || '—';

  const tipoLabel =
    atd.tipo_atendimento === 'plano'
      ? `Plano / conveniado${planoNome ? ` — ${planoNome}` : ''}`
      : 'Particular';

  const coberturaKmTexto =
    atd.tipo_atendimento === 'plano'
      ? kmsFranquia != null && kmsFranquia > 0
        ? `Franquia de quilometragem prevista no contrato: até ${kmsFranquia} km para deslocamentos cobertos. KM excedente pode ser cobrado conforme contrato.`
        : 'Quilometragem de transporte/remoção conforme cobertura do plano contratado. Consulte o contrato para limites e excessos.'
      : 'Atendimento particular: quilometragem e valores de deslocamento conforme tabela vigente e negociação — não há franquia de plano.';

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  // ── Paleta premium ────────────────────────────────────────────────────────
  const AZUL       = [8, 30, 70]   as [number, number, number];
  const AZUL_MED   = [22, 70, 145] as [number, number, number];
  const DOURADO    = [198, 158, 60] as [number, number, number];
  const CINZA_BG   = [246, 248, 252] as [number, number, number];
  const BORDER     = [210, 220, 235] as [number, number, number];
  const TEXTO      = [20, 30, 48] as [number, number, number];

  const sectionTitle = (title: string) => {
    // Fundo azul médio + acento dourado lateral
    doc.setFillColor(...AZUL_MED);
    doc.roundedRect(margin, y, pageW - 2 * margin, 7.5, 1.2, 1.2, 'F');
    doc.setFillColor(...DOURADO);
    doc.roundedRect(margin, y, 3.5, 7.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), margin + 7, y + 5.1);
    y += 11;
    doc.setTextColor(...TEXTO);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
  };

  // ── Cabeçalho com logo ──────────────────────────────────────────────────
  const logo = await loadLogoForPdf((empresa as any).logo_url);

  // Fundo azul profundo
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, pageW, 30, 'F');
  // Faixa dourada decorativa
  doc.setFillColor(...DOURADO);
  doc.rect(0, 30, pageW, 2, 'F');
  // Acento lateral
  doc.setFillColor(...DOURADO);
  doc.rect(0, 0, 4, 32, 'F');

  let textoEmpresaX = margin + 2;
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 2, 4, 22, 22, 1.5, 1.5, 'F');
      doc.addImage(logo.dataUrl, logo.format, margin + 3, 5, 20, 20, undefined, 'FAST');
      textoEmpresaX = margin + 28;
    } catch (err) {
      console.warn('[OS PDF] Falha ao desenhar logo:', err);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(empresa.nome.toUpperCase(), textoEmpresaX, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(185, 205, 235);
  doc.text(`CNPJ: ${empresa.cnpj}`, textoEmpresaX, 19.5);
  if (empresa.endereco) doc.text(empresa.endereco, textoEmpresaX, 25);

  doc.setTextColor(...DOURADO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  const tituloOs = `ORDEM DE SERVIÇO Nº ${atd.codigo || atendimentoId.slice(0, 8)}`;
  doc.text(tituloOs, pageW - margin, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  const emit = `Emitido em ${new Date().toLocaleString('pt-BR')}`;
  doc.text(emit, pageW - margin, 18.5, { align: 'right' });

  y = 36;
  doc.setTextColor(50, 50, 50);

  // Faixa de metadados
  doc.setDrawColor(...BORDER);
  doc.setFillColor(...CINZA_BG);
  doc.roundedRect(margin, y, pageW - 2 * margin, 15, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 115, 135);
  doc.text('TIPO DE ATENDIMENTO', margin + 3, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXTO);
  doc.text(tipoLabel, margin + 3, y + 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 115, 135);
  doc.text('DATA DO SERVIÇO', pageW / 2 - 20, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXTO);
  doc.text(fmtDate(atd.data_servico), pageW / 2 - 20, y + 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 115, 135);
  doc.text('ATENDENTE', pageW - margin - 55, y + 4.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXTO);
  doc.text(atendente, pageW - margin - 55, y + 10);
  y += 19;

  // Transporte / KM (contexto plano vs particular)
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 80, 90);
  const splitKm = doc.splitTextToSize(coberturaKmTexto, pageW - 2 * margin);
  doc.text(splitKm, margin, y);
  y += splitKm.length * 3.8 + 4;
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');

  // ── Falecido ──
  sectionTitle('1 — Falecido');
  const fNome = (falecido?.nome as string) || '—';
  const linhasF = [
    ['Nome', fNome],
    ['Nascimento / Falecimento', `${fmtDate(falecido?.data_nascimento as string)} / ${fmtDate(falecido?.data_falecimento as string) || fmtDate(atd.data_falecido)}`],
    ['Local do óbito', String(falecido?.local_falecimento || '—')],
    ['Onde o corpo se encontra', String(atd.onde_corpo_se_encontra || '—')],
    ['Remover para velório / endereço', String(atd.local_velorio || '—')],
    ['Sepultamento', String(atd.local_sepultamento || '—')],
    ['Motivo / médico', `${String(atd.motivo_morte || '—')} — ${String(atd.medico_nome_crm || '—')}`],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: linhasF,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Responsável / Cliente ──
  sectionTitle('2 — Responsável / Cliente fatura');
  const endCliente = [
    cliente?.endereco_logradouro,
    cliente?.endereco_numero ? `nº ${cliente.endereco_numero}` : '',
    cliente?.endereco_complemento,
    cliente?.endereco_bairro,
    [cliente?.endereco_cidade, cliente?.endereco_estado].filter(Boolean).join(' - '),
    cliente?.endereco_cep ? `CEP ${cliente.endereco_cep}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const linhasC = [
    ['Nome', String(cliente?.nome || '—')],
    ['CPF/CNPJ', String(cliente?.cpf || '—')],
    ['Telefones', [cliente?.telefone_principal, cliente?.celular].filter(Boolean).join(' / ') || '—'],
    ['E-mail', String(cliente?.email || '—')],
    ['Endereço', endCliente || '—'],
    ['Representante (fechamento)', `${String(atd.representante_nome || '—')} — ${String(atd.representante_contato || '—')}`],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: linhasC,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Aspecto do corpo (resumo) ──
  sectionTitle('3 — Aspecto do corpo e orientações');
  const asp = [
    `Inspeção interna: ${atd.inspecao_interna ? 'Sim' : 'Não'} | Externa: ${atd.inspecao_externa ? 'Sim' : 'Não'} | Coleta material: ${atd.coleta_material ? 'Sim' : 'Não'}`,
    `Autoriza remoção: ${atd.autoriza_remocao ? 'SIM' : 'Não'}`,
    atd.orientacoes_tecnicas ? `Orientações: ${atd.orientacoes_tecnicas}` : '',
    atd.observacoes_corpo ? `Obs. corpo: ${atd.observacoes_corpo}` : '',
    atd.comentarios_falecido ? `Família: ${atd.comentarios_falecido}` : '',
  ].filter(Boolean);
  doc.setFontSize(8);
  asp.forEach((line) => {
    const t = doc.splitTextToSize(line, pageW - 2 * margin);
    doc.text(t, margin, y);
    y += t.length * 3.8;
  });
  y += 4;

  // ── Itens ──
  sectionTitle('4 — Itens contratados');
  const tableBody: (string | number)[][] = [];
  (itensServ || []).forEach((row: any) => {
    const nome = row.ser_servicos?.nome || 'Serviço';
    tableBody.push([
      nome,
      String(row.quantidade),
      fmtMoney(row.preco_unitario_centavos),
      fmtMoney(row.subtotal_centavos),
    ]);
  });
  (itensProd || []).forEach((row: any) => {
    const nome = row.ser_produtos?.nome || 'Produto';
    tableBody.push([
      nome,
      String(row.quantidade),
      fmtMoney(row.preco_unitario_centavos),
      fmtMoney(row.subtotal_centavos),
    ]);
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Descrição', 'Qtd', 'Valor unit.', 'Total']],
    body: tableBody.length ? tableBody : [['—', '—', '—', '—']],
    theme: 'striped',
    headStyles: { fillColor: AZUL, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.5 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  const descontoCents = Math.max(0, Number(atd.valor_desconto_centavos || 0));
  const subtotalFromItems = (itensServ || []).reduce((s: number, r: any) => s + Number(r.subtotal_centavos || 0), 0)
    + (itensProd || []).reduce((s: number, r: any) => s + Number(r.subtotal_centavos || 0), 0);

  if (descontoCents > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Subtotal: ${fmtMoney(subtotalFromItems)}`, pageW - margin - 68, y + 2, { align: 'right' });
    y += 4;
    doc.setTextColor(0, 120, 60);
    doc.text(`Desconto: - ${fmtMoney(descontoCents)}`, pageW - margin - 68, y + 2, { align: 'right' });
    y += 4;
    if (atd.desconto_autorizado_por) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`Autorizado por: ${String(atd.desconto_autorizado_por)}`, pageW - margin - 68, y + 2, { align: 'right' });
      y += 5;
    }
  }

  // Caixa de total destacada
  doc.setFillColor(...AZUL);
  doc.roundedRect(pageW - margin - 68, y - 2, 68, 10, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL GERAL:', pageW - margin - 65, y + 5);
  doc.setTextColor(...DOURADO);
  doc.setFontSize(10);
  doc.text(fmtMoney(Number(atd.valor_total_centavos || 0)), pageW - margin - 2, y + 5.5, { align: 'right' });
  doc.setTextColor(...TEXTO);
  y += 14;

  // ── Autorização (resumo, conteúdo completo na próxima página) ──
  sectionTitle('5 — Autorização (assinatura)');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  const authText = doc.splitTextToSize(
    'A autorização técnica completa, com checklist de procedimentos e termo legal, está detalhada na próxima página deste documento.',
    pageW - 2 * margin
  );
  doc.text(authText, margin, y);
  y += authText.length * 3.5 + 10;
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, margin + 75, y);
  doc.line(pageW - margin - 75, y, pageW - margin, y);
  doc.setFontSize(7);
  doc.text('Assinatura do responsável', margin, y + 4);
  doc.text('Atendente funerário', pageW - margin - 75, y + 4);
  y += 14;

  if (atd.observacoes) {
    sectionTitle('Observações internas');
    const obs = doc.splitTextToSize(String(atd.observacoes), pageW - 2 * margin);
    doc.text(obs, margin, y);
    y += obs.length * 3.6 + 6;
  }

  // ── Página 2: Autorização Técnica completa ──
  doc.addPage();
  y = margin;

  // Cabeçalho página 2 (padrão premium)
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setFillColor(...DOURADO);
  doc.rect(0, 28, pageW, 1.8, 'F');
  doc.setFillColor(...DOURADO);
  doc.rect(0, 0, 4, 29.8, 'F');
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 2, 4, 20, 20, 1.5, 1.5, 'F');
      doc.addImage(logo.dataUrl, logo.format, margin + 3, 5, 18, 18, undefined, 'FAST');
    } catch { /* noop */ }
  }
  const xTxtAut = margin + 2 + (logo ? 24 : 0);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(empresa.nome.toUpperCase(), xTxtAut, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(185, 205, 235);
  doc.text(`CNPJ: ${empresa.cnpj}`, xTxtAut, 18.5);
  doc.setTextColor(...DOURADO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`AUTORIZAÇÃO TÉCNICA Nº ${atd.codigo || atendimentoId.slice(0, 8)}`, pageW - margin, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, pageW - margin, 18.5, { align: 'right' });

  y = 34;
  doc.setTextColor(40, 40, 40);

  // 1 — Falecido (autorização)
  sectionTitle('1 — Falecido');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: [
      ['Nome', String(falecido?.nome || '—')],
      ['CPF / Nascimento', `${String(falecido?.cpf || '—')}  •  ${fmtDate(falecido?.data_nascimento as string)}`],
      ['Data do óbito', fmtDate((falecido?.data_falecimento as string) || atd.data_falecido)],
      ['Causa informada / Médico', `${String(atd.motivo_morte || '—')} — ${String(atd.medico_nome_crm || '—')}`],
    ],
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // 2 — Responsável (autorização)
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
  const txtAutorizacao = `${atd.formulario_preparacao || ''} ${atd.orientacoes_tecnicas || ''}`.toLowerCase();
  checkbox(margin + 2, y + 19, /tanat/.test(txtAutorizacao), 'Tanatopraxia');
  checkbox(margin + 90, y + 19, /reconstit/.test(txtAutorizacao), 'Reconstituição');
  y += 25;

  // 4 — Orientações técnicas
  sectionTitle('4 — Orientações técnicas');
  doc.setFontSize(9);
  const orient = doc.splitTextToSize(String(atd.orientacoes_tecnicas || '—'), pageW - 2 * margin);
  doc.text(orient, margin, y);
  y += orient.length * 4.2 + 4;

  // 5 — Observações sobre o corpo
  sectionTitle('5 — Observações sobre o corpo');
  const obsCorpo = doc.splitTextToSize(String(atd.observacoes_corpo || '—'), pageW - 2 * margin);
  doc.text(obsCorpo, margin, y);
  y += obsCorpo.length * 4.2 + 6;

  // 6 — Termo de autorização
  sectionTitle('6 — Termo de autorização');
  doc.setFontSize(9);
  const termo = doc.splitTextToSize(
    `Eu, ${atd.representante_nome || '__________________________________'}, portador do contato ${atd.representante_contato || '___________________'}, na qualidade de responsável legal pelo(a) falecido(a) acima identificado(a), AUTORIZO a ${empresa.nome} a realizar todos os procedimentos técnicos assinalados, nas condições e limites previstos em contrato e na legislação vigente. Declaro estar ciente de que a execução dos procedimentos é irreversível e prestada por equipe técnica habilitada.`,
    pageW - 2 * margin
  );
  doc.text(termo, margin, y);
  y += termo.length * 4.2 + 14;

  // Assinaturas autorização
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  const sigW = (pageW - 2 * margin - 8) / 2;
  doc.line(margin, y, margin + sigW, y);
  doc.line(margin + sigW + 8, y, pageW - margin, y);
  doc.setFontSize(8);
  doc.text(String(atd.representante_nome || '—'), margin + sigW / 2, y + 4, { align: 'center' });
  doc.text('Assinatura do responsável', margin + sigW / 2, y + 8, { align: 'center' });
  doc.text('Atendente / Técnico responsável', margin + sigW + 8 + sigW / 2, y + 8, { align: 'center' });

  // ── Página 3: Deslocamentos ──────────────────────────────────────────────
  doc.addPage();
  y = margin;

  // Cabeçalho página 3 (compacto, padrão)
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, pageW, 25, 'F');
  doc.setFillColor(...DOURADO);
  doc.rect(0, 25, pageW, 1.5, 'F');
  doc.setFillColor(...DOURADO);
  doc.rect(0, 0, 4, 26.5, 'F');
  if (logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 2, 3.5, 18, 18, 1.2, 1.2, 'F');
      doc.addImage(logo.dataUrl, logo.format, margin + 3, 4.5, 16, 16, undefined, 'FAST');
    } catch (err) {
      console.warn('[OS PDF] logo página 3:', err);
    }
  }
  const xP3 = margin + 2 + (logo ? 22 : 0);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(empresa.nome.toUpperCase(), xP3, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...DOURADO);
  doc.text('CONTROLE DE DESLOCAMENTOS', xP3, 18);
  doc.setTextColor(...DOURADO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`OS Nº ${atd.codigo || atendimentoId.slice(0, 8)}`, pageW - margin, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  const sub2 = atd.tipo_atendimento === 'plano' ? `Tipo: Plano${planoNome ? ' — ' + planoNome : ''}` : 'Tipo: Particular';
  doc.text(sub2, pageW - margin, 18, { align: 'right' });

  y = 30;
  doc.setTextColor(40, 40, 40);

  if (viagensExtraNote > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 80, 0);
    doc.text(
      `Existem mais ${viagensExtraNote} viagem(ns) no sistema — verifique Frota → Viagens.`,
      margin,
      y
    );
    y += 5;
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
  }

  const slots = 6;
  const filled = [...viagens];
  while (filled.length < slots) {
    filled.push({
      id: `empty-${filled.length}`,
      motorista_id: null,
      veiculo_id: '',
      origem: null,
      destino: null,
      data_saida: null,
      hora_saida: null,
      data_retorno: null,
      hora_retorno: null,
      km_saida: null,
      km_retorno: null,
      observacao: null,
      status: '',
      placa: '',
      veiculo_modelo: '',
      motorista_nome: '',
    } as any);
  }

  let totalKmAll = 0;
  let totalMinAll = 0;
  let countDurAll = 0;
  let totalKmPrimeira = 0;
  let totalKmSegunda = 0;
  viagensAll.forEach((v, idx) => {
    if (v.km_saida != null && v.km_retorno != null) {
      const k = Math.max(0, Number(v.km_retorno) - Number(v.km_saida));
      totalKmAll += k;
      if (idx === 0) totalKmPrimeira += k;
      else if (idx === 1) totalKmSegunda += k;
    }
    const d = diffMinutes(v.hora_saida, v.hora_retorno);
    if (d != null && d >= 0) {
      totalMinAll += d;
      countDurAll++;
    }
  });

  // Layout em grade — cada deslocamento é um quadro com 4 linhas:
  // L1: Motorista | Placa | Veículo | Data
  // L2: Origem.................................................. | KM saída
  // L3: Destino................................................. | KM chegada
  // L4: Hora saída | Hora chegada | Tempo total | KM total
  const blockH = 26;
  const blockGap = 3;
  const colW = pageW - 2 * margin;

  // Definição de colunas absolutas baseadas no width
  const c = {
    motoristaW: 70,
    placaW: 28,
    veicW: 42,
    dataW: 0, // ocupa o resto
    kmCol: 28, // largura coluna KM lateral
  };
  c.dataW = colW - c.motoristaW - c.placaW - c.veicW;

  for (let i = 0; i < slots; i++) {
    const v = filled[i] as any;
    const kmTot =
      v.km_saida != null && v.km_retorno != null ? Math.max(0, Number(v.km_retorno) - Number(v.km_saida)) : null;
    const dur = diffMinutes(v.hora_saida, v.hora_retorno);

    if (y > pageH - blockH - 50) {
      doc.addPage();
      y = margin;
    }

    // Container externo
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, colW, blockH, 1, 1, 'FD');

    // Faixa do cabeçalho do bloco
    doc.setFillColor(...AZUL);
    doc.rect(margin, y, colW, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`${i + 1}º DESLOCAMENTO`, margin + 2, y + 3.6);
    if (v.id && !String(v.id).startsWith('empty-')) {
      const tag = (v.status as string) ? (v.status as string).toUpperCase().replace('_', ' ') : '';
      if (tag) {
        doc.text(tag, pageW - margin - doc.getTextWidth(tag) - 2, y + 3.6);
      }
    }

    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    const motorista = v.motorista_nome || '';
    const placa = v.placa || '';
    const veiculo = v.veiculo_modelo || '';
    const origem = v.origem || '';
    const destino = v.destino || '';
    const kmIni = v.km_saida != null ? String(v.km_saida) : '';
    const kmFim = v.km_retorno != null ? String(v.km_retorno) : '';
    const hSai = v.hora_saida ? fmtTime(v.hora_saida) : '';
    const hCheg = v.hora_retorno ? fmtTime(v.hora_retorno) : '';
    const kmLinha = kmTot != null ? `${kmTot} km` : '';
    const tempoLinha = dur != null && dur >= 0 ? formatDuration(dur) : '';
    const dataLinha = v.data_saida ? fmtDate(v.data_saida) : '';

    // Helper para campo "label: valor / sublinhado"
    const drawField = (label: string, value: string, x: number, yy: number, w: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(90, 90, 90);
      doc.text(label.toUpperCase(), x + 1, yy + 2.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      const txt = value || '';
      doc.text(txt, x + 1, yy + 6);
      // Linha base (estilo formulário)
      doc.setDrawColor(180, 190, 200);
      doc.setLineWidth(0.15);
      doc.line(x + 1, yy + 6.6, x + w - 1, yy + 6.6);
    };

    const innerY = y + 6;
    const rowH = 7;
    const colMot = margin;
    const colPlaca = colMot + c.motoristaW;
    const colVeic = colPlaca + c.placaW;
    const colData = colVeic + c.veicW;

    // Linha 1
    drawField('Motorista', motorista, colMot, innerY, c.motoristaW);
    drawField('Placa', placa, colPlaca, innerY, c.placaW);
    drawField('Veículo', veiculo, colVeic, innerY, c.veicW);
    drawField('Data', dataLinha, colData, innerY, c.dataW);

    // Linha 2 — Origem | KM saída
    drawField('Origem', origem, colMot, innerY + rowH, colW - c.kmCol);
    drawField('KM saída', kmIni, margin + colW - c.kmCol, innerY + rowH, c.kmCol);

    // Linha 3 — Destino | KM chegada
    drawField('Destino', destino, colMot, innerY + rowH * 2, colW - c.kmCol);
    drawField('KM chegada', kmFim, margin + colW - c.kmCol, innerY + rowH * 2, c.kmCol);

    // Rodapé do bloco — horários, tempo e KM total inline
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `HORA SAÍDA: ${hSai || '—'}    HORA CHEGADA: ${hCheg || '—'}    TEMPO TOTAL: ${tempoLinha || '—'}    KM TOTAL: ${kmLinha || '—'}`.toUpperCase(),
      margin + 2,
      y + blockH - 2
    );
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'normal');

    y += blockH + blockGap;
  }

  // Totais — caixa em duas colunas (esquerda totais + direita assinatura)
  const totalsH = 30;
  const colTotalsW = (pageW - 2 * margin) * 0.62;
  doc.setDrawColor(...BORDER);
  doc.setFillColor(250, 251, 252);
  doc.roundedRect(margin, y, colTotalsW, totalsH, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text('TOTAIS DE KM', margin + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text(`Total de KM rodados na 1ª remoção:  ${totalKmPrimeira || '—'} km`, margin + 3, y + 11);
  doc.text(`Total de KM rodados na 2ª remoção:  ${totalKmSegunda || '—'} km`, margin + 3, y + 16);
  doc.text(`Total geral de KM rodados:           ${totalKmAll || '—'} km`, margin + 3, y + 21);
  doc.text(
    `Total geral de horas gastas:         ${countDurAll ? formatDuration(totalMinAll) : '—'}`,
    margin + 3,
    y + 26
  );

  // Caixa direita: encarregado do transporte
  doc.setDrawColor(...BORDER);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + colTotalsW + 4, y, pageW - 2 * margin - colTotalsW - 4, totalsH, 1, 1, 'FD');
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  const yLinhaAss = y + 18;
  doc.line(margin + colTotalsW + 8, yLinhaAss, pageW - margin - 4, yLinhaAss);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text(
    'Encarregado do departamento de transporte',
    margin + colTotalsW + 4 + (pageW - 2 * margin - colTotalsW - 4) / 2,
    yLinhaAss + 4,
    { align: 'center' }
  );
  y += totalsH + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text('OBSERVAÇÕES:', margin, y + 4);
  // Algumas linhas para anotação manual
  doc.setDrawColor(180, 190, 200);
  doc.setLineWidth(0.2);
  for (let li = 0; li < 4; li++) {
    const yy = y + 9 + li * 5;
    if (yy > pageH - 18) break;
    doc.line(margin, yy, pageW - margin, yy);
  }
  doc.setTextColor(...TEXTO);
  doc.setFont('helvetica', 'normal');

  // Rodapé página 3 institucional
  doc.setFillColor(...AZUL);
  doc.rect(0, pageH - 12, pageW, 12, 'F');
  doc.setFillColor(...DOURADO);
  doc.rect(0, pageH - 13, pageW, 1, 'F');
  doc.setFillColor(...DOURADO);
  doc.rect(0, pageH - 12, 4, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(
    `${empresa.nome.toUpperCase()}  ·  Controle de Deslocamentos  ·  1ª via: Responsável  |  2ª via: Arquivo`,
    pageW / 2, pageH - 7.5, { align: 'center' }
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(175, 200, 235);
  doc.text(
    'Preencha KM e horários ao concluir cada trecho em Frota → Viagens.',
    pageW / 2, pageH - 3.5, { align: 'center' }
  );

  const filename = options.filename || `OS-${String(atd.codigo || atendimentoId).replace(/\s+/g, '')}.pdf`;
  const blob = doc.output('blob');
  if (download && typeof window !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return { blob, filename };
}

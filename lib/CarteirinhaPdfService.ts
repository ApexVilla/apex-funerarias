import { jsPDF } from 'jspdf';
import type { AssinaturaSB, BeneficiarioSB, ClienteSB } from './ClienteStore';
import { resolvePlanoContratoAssinatura } from './ContratoAssinaturaService';
import { formatarDataIsoPtBr } from './contratoDatas';
import { labelParentescoDependente } from './parentescoDependente';

export type CarteirinhaLinha = {
  nome: string;
  codigo: string;
  plano: string;
  parentesco?: string;
  cpfMascarado?: string;
  contratoCodigo?: string;
  cobradorNome?: string;
  bairro?: string;
};

function mascararCpf(cpf?: string | null): string {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return '—';
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function montarLinhasCarteirinha(
  cliente: ClienteSB,
  assinatura: AssinaturaSB | null,
  beneficiarios: BeneficiarioSB[],
  cobradorNome?: string,
): CarteirinhaLinha[] {
  const plano = assinatura ? resolvePlanoContratoAssinatura(assinatura).label : '—';
  const codigoContrato = assinatura?.codigo || '—';
  const bairro = cliente.endereco_bairro || '—';
  const cobNome = cobradorNome || '—';

  const linhas: CarteirinhaLinha[] = [
    {
      nome: cliente.nome,
      codigo: cliente.codigo || cliente.id.slice(0, 8).toUpperCase(),
      plano,
      parentesco: 'Titular',
      cpfMascarado: mascararCpf(cliente.cpf),
      contratoCodigo: codigoContrato,
      cobradorNome: cobNome,
      bairro: bairro,
    },
  ];
  const deps =
    assinatura
      ? beneficiarios.filter((b) => !b.assinatura_id || b.assinatura_id === assinatura.id)
      : beneficiarios;
  for (const b of deps) {
    linhas.push({
      nome: b.nome,
      codigo: `${cliente.codigo || 'CLI'}-D${(b.id || b.nome).slice(0, 4).toUpperCase()}`,
      plano,
      parentesco: labelParentescoDependente(b.parentesco, 'completo', b.sexo, b.nome) || 'Dependente',
      cpfMascarado: mascararCpf(b.cpf),
      contratoCodigo: codigoContrato,
      cobradorNome: cobNome,
      bairro: bairro,
    });
  }
  return linhas;
}

export function obterTipoPlano(nomePlano?: string | null): 'fenix' | 'onix' | 'padrao' {
  const nome = String(nomePlano || '').toLowerCase();
  if (nome.includes('onix') || nome.includes('ônix')) return 'onix';
  if (nome.includes('fenix') || nome.includes('fênix')) return 'fenix';
  return 'padrao';
}

export type CarteirinhaPdfOptions = {
  layout?: 'pre_impresso' | 'completo';
  formato?: 'pvc' | 'a4';
  emitidoEm?: Date;
};

function desenharCard(
  doc: jsPDF,
  linha: CarteirinhaLinha,
  cardX: number,
  cardY: number,
  layout: 'pre_impresso' | 'completo',
  tipoPlano: 'fenix' | 'onix' | 'padrao',
  emitido: string,
  formato: 'pvc' | 'a4',
  emitidoEm: Date = new Date(),
) {
  // O cartão tem formato físico de 85.6mm de largura por 54.0mm de altura.
  // Usamos coordenadas reais landscape (horizontal) para A4 e para PVC.
  const drawContext = {
    rect: (xl: number, yl: number, wl: number, hl: number, style?: string) => {
      doc.rect(cardX + xl, cardY + yl, wl, hl, style);
    },
    text: (text: string, xl: number, yl: number, options?: { align?: 'left' | 'center' | 'right'; bold?: boolean; size?: number; color?: number[] }) => {
      if (options?.color) {
        doc.setTextColor(options.color[0], options.color[1], options.color[2]);
      }
      if (options?.size) {
        doc.setFontSize(options.size);
      }
      doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
      doc.text(text, cardX + xl, cardY + yl, {
        align: options?.align || 'left'
      });
    },
    line: (x1: number, y1: number, x2: number, y2: number) => {
      doc.line(cardX + x1, cardY + y1, cardX + x2, cardY + y2);
    }
  };

  // Se for completo, desenha a arte e os fundos correspondentes ao plano (Top-to-Bottom)
  if (layout === 'completo') {
    if (tipoPlano === 'onix') {
      // Plano Ônix (Preto e Dourado)
      // Cabeçalho superior Zinc 900
      doc.setFillColor(24, 24, 27);
      drawContext.rect(0, 0, 85.6, 22, 'F');

      // Faixa dourada
      doc.setFillColor(180, 83, 9); // Amber 700
      drawContext.rect(0, 22, 85.6, 1.5, 'F');

      // Corpo inferior amarelo claro
      doc.setFillColor(254, 252, 232); // Yellow 50
      drawContext.rect(0, 23.5, 85.6, 30.5, 'F');

      // Cabeçalho / Logos centralizados
      drawContext.text('FÊNIX ADMINISTRAÇÃO FUNERÁRIA', 42.8, 6.5, { align: 'center', bold: true, size: 7.5, color: [251, 191, 36] });
      drawContext.text('O melhor Plano Funerário de Goiás', 42.8, 10.0, { align: 'center', bold: false, size: 5.0, color: [228, 228, 231] });
      drawContext.text('PLANO ÔNIX', 42.8, 15.5, { align: 'center', bold: true, size: 10.5, color: [255, 255, 255] });
      drawContext.text('"A Sua Amiga Certa nas Horas Incertas!"', 42.8, 19.5, { align: 'center', bold: false, size: 5.0, color: [251, 191, 36] });
    } else {
      // Plano Fênix (Azul e Cyan)
      // Cabeçalho superior Blue 700
      doc.setFillColor(29, 78, 216);
      drawContext.rect(0, 0, 85.6, 22, 'F');

      // Faixa cyan
      doc.setFillColor(6, 182, 212); // Cyan 500
      drawContext.rect(0, 22, 85.6, 1.5, 'F');

      // Corpo inferior azul claro
      doc.setFillColor(236, 254, 255); // Cyan 50
      drawContext.rect(0, 23.5, 85.6, 30.5, 'F');

      // Cabeçalho / Logos centralizados
      drawContext.text('FÊNIX ADMINISTRAÇÃO FUNERÁRIA', 42.8, 6.5, { align: 'center', bold: true, size: 7.5, color: [255, 255, 255] });
      drawContext.text('O melhor Plano Funerário de Goiás', 42.8, 10.0, { align: 'center', bold: false, size: 5.0, color: [207, 250, 254] });
      drawContext.text('PLANO FÊNIX', 42.8, 15.5, { align: 'center', bold: true, size: 10.5, color: [255, 255, 255] });
      drawContext.text('"A Sua Amiga Certa nas Horas Incertas!"', 42.8, 19.5, { align: 'center', bold: false, size: 5.0, color: [207, 250, 254] });
    }
  } else {
    // Se for pré-impresso e formato A4, desenha borda tracejada de corte
    if (formato === 'a4') {
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.setLineDashPattern([1, 1], 0);
      doc.roundedRect(cardX, cardY, 85.6, 54.0, 2, 2, 'D');
      doc.setLineDashPattern([], 0); // reset
    }
  }

  // --- DADOS DINÂMICOS ---
  // A impressão térmica de dados é em preto para leitura e contraste ideais
  const textPrimaryColor = [0, 0, 0];
  const col1X = 6.0;
  const col2X = 46.0;
  const maxW = 73.6; // 85.6 - 6mm de margem esquerda - 6mm de margem direita

  // Função auxiliar para desenhar texto com redimensionamento de fonte automático caso ultrapasse o limite horizontal
  const textLeft = (text: string, xl: number, yl: number, maxSize: number, maxW: number, bold = true) => {
    let size = maxSize;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    while (size > 6.0 && (doc.getStringUnitWidth(text) * size * 0.3528) > maxW) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    drawContext.text(text, xl, yl, { bold, size, color: textPrimaryColor });
  };

  // Calcula validade do cartão (2 anos a partir da emissão)
  const validadeDate = new Date(emitidoEm);
  validadeDate.setFullYear(validadeDate.getFullYear() + 2);
  const validade = validadeDate.toLocaleDateString('pt-BR');

  // Coordenadas Y — pré-impresso desce ~2mm para não colidir com a faixa do cartão físico
  const y =
    layout === 'pre_impresso'
      ? { l1: 30.5, l2: 36.0, l3: 41.0, l4: 46.0, l5: 50.5 }
      : { l1: 28.5, l2: 34.5, l3: 40.5, l4: 46.5, l5: 52.0 };

  const numeroContrato =
    linha.contratoCodigo && linha.contratoCodigo !== '—' ? linha.contratoCodigo : linha.codigo;

  // Nº do contrato & Validade
  textLeft(`Nº ${numeroContrato}`, col1X, y.l1, 10.0, col2X - col1X - 2.0, true);
  textLeft(`VALIDADE: ${validade}`, col2X, y.l1, 8.5, 85.6 - col2X - 6.0, true);

  // Nome (Em destaque)
  const nomeLimpo = linha.nome.toUpperCase().slice(0, 36);
  textLeft(nomeLimpo, col1X, y.l2, 12.0, maxW, true);

  // Parentesco & CPF
  const parentescoStr = `PARENTESCO: ${(linha.parentesco || 'TITULAR').toUpperCase()}`;
  const cpfStr = `CPF: ${linha.cpfMascarado || '—'}`;
  textLeft(parentescoStr, col1X, y.l3, 8.5, col2X - col1X - 2.0, true);
  textLeft(cpfStr, col2X, y.l3, 8.5, 85.6 - col2X - 6.0, true);

  // Cobrador
  const cobNome = `COBRADOR: ${(linha.cobradorNome || '—').toUpperCase()}`;
  textLeft(cobNome, col1X, y.l4, 8.5, maxW, true);

  // Bairro & Tipo de plano (aproveita o espaço inferior direito do cartão)
  const bairroNome = `BAIRRO: ${(linha.bairro || '—').toUpperCase()}`;
  const planoStr = `PLANO: ${(linha.plano || '—').toUpperCase()}`;
  textLeft(bairroNome, col1X, y.l5, 8.5, col2X - col1X - 2.0, true);
  textLeft(planoStr, col2X, y.l5, 8.0, 85.6 - col2X - 6.0, true);
}

export function buildCarteirinhasPdfBlob(
  empresaNome: string,
  linhas: CarteirinhaLinha[],
  options?: CarteirinhaPdfOptions,
): Blob {
  const layout = options?.layout || 'pre_impresso';
  const formato = options?.formato || 'pvc';
  const emitidoEm = options?.emitidoEm || new Date();
  const emitido = emitidoEm.toLocaleDateString('pt-BR');

  if (formato === 'pvc') {
    // Formato de cartão PVC (CR-80 Paisagem: 85.6mm x 54.0mm)
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 54.0] });

    linhas.forEach((linha, index) => {
      if (index > 0) {
        doc.addPage([85.6, 54.0], 'landscape');
      }

      const tipoPlano = obterTipoPlano(linha.plano);
      desenharCard(doc, linha, 0, 0, layout, tipoPlano, emitido, formato, emitidoEm);
    });

    return doc.output('blob');
  } else {
    // Formato de folha A4 (210mm x 297mm) com grade de cartões landscape para recortar (2 colunas x 4 linhas = 8 cartões por página)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    // Título do PDF na folha A4
    const desenharCabecalhoA4 = (paginaNum: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(empresaNome || 'Fênix Funerária', 14, 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(`Carteirinhas do Cliente (Horizontal) — Grade A4 — Página ${paginaNum}`, 14, 19.5);
      doc.text(`Emitido em: ${emitido} · Formato: ${layout === 'pre_impresso' ? 'Apenas dados (Pré-Impresso)' : 'Completo com arte'}`, 14, 24);
      
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.3);
      doc.line(14, 26.5, 196, 26.5);
    };

    let col = 0;
    let row = 0;
    let pag = 1;
    
    desenharCabecalhoA4(pag);

    linhas.forEach((linha, index) => {
      if (index > 0 && index % 8 === 0) {
        doc.addPage();
        pag++;
        desenharCabecalhoA4(pag);
        col = 0;
        row = 0;
      }

      // Grade A4 landscape (Margem = 16mm, colunas espaçadas em 10mm, linhas espaçadas em 8mm)
      const cardX = 16 + col * (85.6 + 10);
      const cardY = 32 + row * (54.0 + 8);

      const tipoPlano = obterTipoPlano(linha.plano);
      desenharCard(doc, linha, cardX, cardY, layout, tipoPlano, emitido, formato, emitidoEm);

      col++;
      if (col >= 2) {
        col = 0;
        row++;
      }
    });

    return doc.output('blob');
  }
}

export function imprimirCarteirinhasPdf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w) {
    w.addEventListener('load', () => {
      w.print();
    });
  }
}

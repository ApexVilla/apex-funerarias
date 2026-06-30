import type { jsPDF } from 'jspdf';
import { supabase } from './supabase';
import { obterSignedUrlAssinatura } from './assinaturaDigitalService';

export interface AssinaturaDigitalPdfInfo {
  imagemUrl: string;
  assinadoEm?: string | null;
}

/** Última assinatura eletrônica concluída do contrato (para o PDF). */
export async function buscarUltimaAssinaturaDigitalContrato(
  assinaturaId: string,
): Promise<AssinaturaDigitalPdfInfo | null> {
  try {
    const { data, error } = await supabase
      .from('contratos_assinaturas_digitais')
      .select('assinatura_imagem_url, assinado_em')
      .eq('assinatura_id', assinaturaId)
      .eq('status', 'assinado')
      .not('assinatura_imagem_url', 'is', null)
      .order('assinado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.assinatura_imagem_url) return null;

    // Obter URL assinada (temporária e segura) para o PDF
    const signedUrl = await obterSignedUrlAssinatura(data.assinatura_imagem_url, 120);
    if (!signedUrl) return null;

    return {
      imagemUrl: signedUrl,
      assinadoEm: data.assinado_em,
    };
  } catch (e) {
    console.warn('[buscarUltimaAssinaturaDigitalContrato]', e);
    return null;
  }
}

function formatarAssinadoEmPdf(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function urlParaDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Rodapé padrão do contrato: linhas de assinatura da contratada e do contratante.
 * Se houver assinatura digital, desenha a imagem acima da linha do contratante.
 */
export async function drawRodapeAssinaturasContrato(
  doc: jsPDF,
  opts: {
    W: number;
    margin: number;
    yStart: number;
    titularNome: string;
    nomeEmpresa?: string;
    assinaturaDigital?: AssinaturaDigitalPdfInfo | null;
  },
): Promise<number> {
  const { W, margin, titularNome, assinaturaDigital } = opts;
  const contratadaCenter = opts.margin + 40;
  const contratanteCenter = W - margin - 40;

  let lineY = opts.yStart;
  let blocoAltura = 0;

  if (assinaturaDigital?.imagemUrl) {
    const dataUrl = await urlParaDataUrl(assinaturaDigital.imagemUrl);
    if (dataUrl) {
      const imgW = 55;
      const imgH = 18;
      doc.addImage(dataUrl, 'PNG', contratanteCenter - imgW / 2, lineY, imgW, imgH);
      blocoAltura = imgH + 2;
      if (assinaturaDigital.assinadoEm) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6);
        doc.text(
          `Assinatura eletrônica — ${formatarAssinadoEmPdf(assinaturaDigital.assinadoEm)}`,
          contratanteCenter,
          lineY + imgH + 2,
          { align: 'center' },
        );
        blocoAltura += 4;
      }
      lineY += blocoAltura + 2;
    }
  }

  doc.setDrawColor(0);
  doc.line(margin, lineY, margin + 80, lineY);
  doc.line(W - margin - 80, lineY, W - margin, lineY);

  let y = lineY + 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('ASSINATURA DA CONTRATADA', contratadaCenter, y, { align: 'center' });
  doc.text('ASSINATURA DO CONTRATANTE', contratanteCenter, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(opts.nomeEmpresa || 'FENIX FUNERARIA LTDA', contratadaCenter, y, { align: 'center' });
  doc.text(titularNome.toUpperCase(), contratanteCenter, y, { align: 'center' });

  return y;
}

/** Espaço vertical necessário no PDF antes do rodapé de assinaturas. */
export function alturaRodapeAssinaturasContrato(
  assinaturaDigital?: AssinaturaDigitalPdfInfo | null,
): number {
  return assinaturaDigital?.imagemUrl ? 58 : 36;
}

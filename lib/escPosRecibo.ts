/** Gera bytes ESC/POS a partir de linhas de texto (recibo térmico). */
export function transliterateParaImpressora(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
}

const ESC = 0x1b;
const GS = 0x1d;

function linhaPrecisaDestaque(linha: string): boolean {
  const t = linha.trim().toUpperCase();
  return (
    t === 'RECIBO DE PAGAMENTO' ||
    /PARCELA\(S\)|^\d+ PARC/.test(t) ||
    (/\d,\d{2}$/.test(t) && t.includes('PARCELA'))
  );
}

function linhaPrecisaNegrito(linha: string): boolean {
  const t = linha.trim().toUpperCase();
  return (
    linhaPrecisaDestaque(linha) ||
    t === 'RECIBO DE PAGAMENTO' ||
    t.startsWith('FENIX FUNERARIA') ||
    t.startsWith('FUNERARIA FENIX') ||
    t.startsWith('CLIENTE:') ||
    t.startsWith('CPF/CNPJ:') ||
    t.startsWith('CONTRATO') ||
    t.startsWith('PARCELA   TIPO') ||
    /PARCELA\(S\) NO VALOR TOTAL/i.test(t) ||
    t.startsWith('ATENDENTE:') ||
    t.startsWith('COBRADOR:') ||
    t.startsWith('RECIBO GERADO EM:') ||
    t.startsWith('PIX RECEBIDO EM:') ||
    t.startsWith('FORMA PAGAMENTO:') ||
    t.startsWith('VALOR PAGO:') ||
    /^\*{2,}\s*PAGAMENTO CONFIRMADO/i.test(t) ||
    (/^\d{2}\/\d{2}\/\d{4}/.test(t) && /\d,\d{2}$/.test(t))
  );
}

export function montarEscPosRecibo(opts: {
  linhas: string[];
  logoRaster?: Uint8Array | null;
}): Uint8Array {
  const out: number[] = [];
  out.push(ESC, 0x40);
  out.push(ESC, 0x74, 0x00);

  if (opts.logoRaster?.length) {
    out.push(...opts.logoRaster);
    out.push(0x0a);
  }

  for (const linhaBruta of opts.linhas) {
    const linha = linhaBruta.trim();
    if (!linha) {
      out.push(0x0a);
      continue;
    }
    const destaque = linhaPrecisaDestaque(linhaBruta);
    const negrito = linhaPrecisaNegrito(linhaBruta);
    if (destaque) out.push(GS, 0x21, 0x11);
    else if (negrito) out.push(ESC, 0x45, 0x01);
    const texto = transliterateParaImpressora(linha);
    for (const b of new TextEncoder().encode(texto + '\n')) {
      out.push(b);
    }
    if (destaque) out.push(GS, 0x21, 0x00);
    else if (negrito) out.push(ESC, 0x45, 0x00);
  }

  out.push(ESC, 0x64, 1);
  out.push(GS, 0x56, 0x00);
  return new Uint8Array(out);
}

export function linhasParaEscPos(linhas: string[]): Uint8Array {
  return montarEscPosRecibo({ linhas });
}

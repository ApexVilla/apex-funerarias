/** Logo padrão Fênix em `public/logo-fenix.png` (também aceita URL da empresa em Config). */
export const FENIX_LOGO_PATH = '/logo-fenix.png';

/** Logo da unidade Aparecida (evita CORS com URL externa no PDF). */
export const FENIX_LOGO_APARECIDA_PATH = '/logo-fenix-aparecida.png';

/** Versão reduzida para menu/login (gerada se ImageMagick existir; senão usa a principal). */
export const FENIX_LOGO_WEB_PATH = '/logo-fenix-web.png';

export type LogoPdfAsset = {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
  /** largura / altura da imagem original */
  aspect: number;
};

/** URLs de imagem inválidas (ex.: link de busca do Google em vez do arquivo). */
function isLogoUrlInvalida(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('google.com/imgres')
    || u.includes('googleusercontent.com/imgres')
    || u.includes('bing.com/images')
  );
}

/** URL exibida no sistema: empresa configurada ou logo padrão da pasta public. */
export function resolveLogoUrl(empresaLogoUrl?: string | null): string {
  const custom = String(empresaLogoUrl || '').trim();
  if (custom && !isLogoUrlInvalida(custom)) return custom;
  return FENIX_LOGO_PATH;
}

function absolutizarUrl(src: string): string {
  const s = src.trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
  const path = s.startsWith('/') ? s : `/${s}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

async function detectImageFormat(blob: Blob): Promise<'PNG' | 'JPEG' | null> {
  try {
    const buf = await blob.slice(0, 12).arrayBuffer();
    const b = new Uint8Array(buf);
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'PNG';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'JPEG';
  } catch {
    /* ignore */
  }
  return null;
}

function medirAspectoDataUrl(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const h = img.naturalHeight || 1;
      resolve((img.naturalWidth || 1) / h);
    };
    img.onerror = () => resolve(2.5);
    img.src = dataUrl;
  });
}

/** Converte qualquer imagem carregável em PNG válido para o jsPDF. */
function normalizarDataUrlParaPng(dataUrl: string): Promise<LogoPdfAsset | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || 1;
        const h = img.naturalHeight || 1;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          format: 'PNG',
          aspect: w / h,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function blobParaLogoAsset(blob: Blob): Promise<LogoPdfAsset | null> {
  if (!blob.size) return null;

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const normalizado = await normalizarDataUrlParaPng(dataUrl);
  if (normalizado) return normalizado;

  const format = await detectImageFormat(blob);
  if (!format) return null;

  const aspect = await medirAspectoDataUrl(dataUrl);
  return { dataUrl, format, aspect };
}

async function fetchLogoAsset(url: string): Promise<LogoPdfAsset | null> {
  const absolute = absolutizarUrl(url);
  if (!absolute) return null;
  try {
    const res = await fetch(absolute);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return blobParaLogoAsset(blob);
  } catch {
    return null;
  }
}

/** Carrega logo da empresa ou, se vazio/falhar, a logo Fênix em `public/`. */
export async function loadLogoForPdf(empresaLogoUrl?: string | null): Promise<LogoPdfAsset | null> {
  const custom = resolveLogoUrl(empresaLogoUrl);
  if (custom !== FENIX_LOGO_PATH || String(empresaLogoUrl || '').trim()) {
    const fromEmpresa = await fetchLogoAsset(custom);
    if (fromEmpresa) return fromEmpresa;
  }
  let asset = await fetchLogoAsset(FENIX_LOGO_PATH);
  if (!asset) {
    asset = await fetchLogoAsset(FENIX_LOGO_WEB_PATH);
  }
  return asset;
}

export function fitLogoMm(aspect: number, maxW: number, maxH: number): { w: number; h: number } {
  const a = aspect > 0 ? aspect : 2.5;
  let w = maxW;
  let h = w / a;
  if (h > maxH) {
    h = maxH;
    w = h * a;
  }
  return { w, h };
}

export type DrawLogoPdfOpts = {
  x: number;
  y: number;
  maxW: number;
  maxH: number;
  align?: 'left' | 'center' | 'right';
  areaWidth?: number;
};

/** Desenha logo no PDF mantendo proporção. */
export function drawLogoPdf(
  doc: import('jspdf').jsPDF,
  logo: LogoPdfAsset,
  opts: DrawLogoPdfOpts,
): { w: number; h: number; x: number; y: number } {
  const { w, h } = fitLogoMm(logo.aspect, opts.maxW, opts.maxH);
  let x = opts.x;
  const areaW = opts.areaWidth ?? opts.maxW;
  if (opts.align === 'center') {
    x = opts.x + (areaW - w) / 2;
  } else if (opts.align === 'right') {
    x = opts.x + areaW - w;
  }
  try {
    doc.addImage(logo.dataUrl, logo.format, x, opts.y, w, h, undefined, 'SLOW');
  } catch (err) {
    console.warn('[drawLogoPdf] Logo ignorado no PDF:', err);
  }
  return { w, h, x, y: opts.y };
}

/** Cabeçalho da capa dos contratos Onix/Fênix (logo + linhas centralizadas). */
export async function drawCapaContratoFenix(
  doc: import('jspdf').jsPDF,
  W: number,
  yStart: number,
  opts: {
    logoUrl?: string | null;
    linhaEmpresa: string;
    linhaSubtitulo?: string;
    linhaTitulo?: string;
    linhaCertificado?: string;
  },
): Promise<number> {
  let y = yStart;
  const logo = await loadLogoForPdf(opts.logoUrl);
  if (logo) {
    const placed = drawLogoPdf(doc, logo, {
      x: 0,
      y,
      maxW: 52,
      maxH: 22,
      align: 'center',
      areaWidth: W,
    });
    y += placed.h + 4;
  }

  doc.setTextColor(20, 28, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(opts.linhaEmpresa, W / 2, y, { align: 'center' });
  y += 5;

  if (opts.linhaSubtitulo) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 88, 110);
    doc.text(opts.linhaSubtitulo, W / 2, y, { align: 'center' });
    y += 8;
  }

  if (opts.linhaTitulo) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 28, 45);
    doc.text(opts.linhaTitulo, W / 2, y, { align: 'center', maxWidth: W - 30 });
    y += 5;
  }

  if (opts.linhaCertificado) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 88, 110);
    doc.text(opts.linhaCertificado, W / 2, y, { align: 'center' });
    y += 6;
  } else {
    y += 4;
  }

  doc.setDrawColor(210, 220, 235);
  doc.setLineWidth(0.3);
  doc.line(15, y, W - 15, y);
  y += 6;

  return y;
}

/** Quando o logo já traz "FÊNIX FUNERÁRIA", exibe só a unidade (ex.: APARECIDA). */
function nomeCabecalhoAoLadoLogo(empresaNome: string): string | null {
  const u = empresaNome.toUpperCase().trim();
  const unitMatch = u.match(/^FENIX\s+FUNERARIA\s+(.+)$/);
  if (unitMatch?.[1]?.trim()) return unitMatch[1].trim();
  if (/^FENIX\s+FUNERARIA$/i.test(u)) return null;
  return empresaNome;
}

/** Cabeçalho do recibo/comprovante A4 — monocromático (sem preenchimento, economia de tinta). */
export function drawReciboCabecalhoComLogo(
  doc: import('jspdf').jsPDF,
  W: number,
  M: number,
  _palette: unknown,
  opts: {
    logo: LogoPdfAsset | null;
    empresaNome: string;
    subtitulo: string;
    cnpj: string;
    tituloDocumento: string;
    numero: string;
    data: string;
  },
): number {
  const PRETO: [number, number, number] = [0, 0, 0];
  const pageH = doc.internal.pageSize.getHeight();
  const upper = (s: string) => String(s ?? '').toLocaleUpperCase('pt-BR');

  const rightColW = 58;
  const logoPadY = M + 4;
  const logoDims = opts.logo ? fitLogoMm(opts.logo.aspect, 32, 20) : { w: 0, h: 0 };
  const logoGap = opts.logo ? 5 : 0;
  const textX = opts.logo ? M + logoDims.w + logoGap : M;
  const maxTextW = Math.max(40, W - M - textX - rightColW);

  const nomeExibir = opts.logo ? nomeCabecalhoAoLadoLogo(opts.empresaNome) : opts.empresaNome;
  const fontSizeNome = opts.logo ? 12 : 16;
  const fontSizeSub = 8;
  const fontSizeCnpj = 7.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSizeNome);
  const nomeLines = nomeExibir ? doc.splitTextToSize(upper(nomeExibir), maxTextW) : [];
  if (!opts.logo && nomeLines.length === 0) {
    nomeLines.push(...doc.splitTextToSize(upper(opts.empresaNome), maxTextW));
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSizeSub);
  const subLines = doc.splitTextToSize(upper(opts.subtitulo), maxTextW);

  const nomeLineH = fontSizeNome * 0.45;
  const subLineH = fontSizeSub * 0.48;
  const nomeBlockH = nomeLines.length > 0 ? nomeLines.length * nomeLineH + 2 : 0;
  const subBlockH = subLines.length > 0 ? 3 + subLines.length * subLineH : 0;
  const cnpjBlockH = 5;
  const textBlockH = nomeBlockH + subBlockH + cnpjBlockH;
  const headerH = Math.max(32, Math.max(logoDims.h + 8, textBlockH + 10));

  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.5);
  doc.rect(M - 3, M - 3, W - (M - 3) * 2, pageH - (M - 3) * 2);
  doc.setLineWidth(0.2);
  doc.rect(M - 1, M - 1, W - (M - 1) * 2, pageH - (M - 1) * 2);

  const headerTop = M + 2;
  const headerBottom = headerTop + headerH;

  if (opts.logo) {
    drawLogoPdf(doc, opts.logo, { x: M, y: logoPadY, maxW: 32, maxH: 20, align: 'left' });
  }

  let y = headerTop + 6;
  doc.setTextColor(...PRETO);
  if (nomeLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSizeNome);
    nomeLines.forEach((line: string, i: number) => {
      doc.text(line, textX, y + i * nomeLineH);
    });
    y += nomeBlockH;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSizeSub);
  subLines.forEach((line: string, i: number) => {
    doc.text(line, textX, y + i * subLineH);
  });
  y += subBlockH;

  doc.setFontSize(fontSizeCnpj);
  doc.text(`CNPJ: ${opts.cnpj}`, textX, y);

  let tituloLimpo = opts.tituloDocumento.trim();
  if (tituloLimpo.endsWith(' Nº') || tituloLimpo.endsWith(' nº')) {
    tituloLimpo = tituloLimpo.slice(0, -3).trim();
  }

  const rightY0 = headerTop + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(upper(tituloLimpo), W - M, rightY0, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`Nº ${upper(opts.numero)}`, W - M, rightY0 + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`DATA: ${upper(opts.data)}`, W - M, rightY0 + 12, { align: 'right' });

  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.35);
  doc.line(M, headerBottom, W - M, headerBottom);

  return headerBottom + 10;
}

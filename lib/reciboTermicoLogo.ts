import { resolveLogoUrl } from './fenixLogo';

/** Largura útil em pixels (8 dots/mm — padrão ESC/POS 58/80mm). */
export function larguraLogoTermicoPx(larguraMm: 58 | 80): number {
  return larguraMm === 58 ? 384 : 576;
}

export function urlLogoReciboTermico(empresaLogoUrl?: string | null): string {
  return resolveLogoUrl(empresaLogoUrl);
}

/** Converte ImageData monocromático para comando GS v 0 (raster bit image). */
export function imageDataParaEscPosRaster(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const bytesPerRow = Math.ceil(width / 8);
  const raster: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let xByte = 0; xByte < bytesPerRow; xByte++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xByte * 8 + bit;
        if (x >= width) continue;
        const i = (y * width + x) * 4;
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        if (gray < 145) byte |= 0x80 >> bit;
      }
      raster.push(byte);
    }
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  return new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...raster]);
}

/** Carrega logo e gera raster ESC/POS (navegador). */
export async function carregarRasterLogoEscPos(
  url: string,
  larguraMm: 58 | 80,
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;

  const src = url.startsWith('http') || url.startsWith('/') || url.startsWith('data:')
    ? (url.startsWith('/') && typeof window !== 'undefined'
        ? `${window.location.origin}${url}`
        : url)
    : url;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const maxW = larguraLogoTermicoPx(larguraMm);
        const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const contrast = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < contrast.data.length; i += 4) {
          const g = contrast.data[i] * 0.299 + contrast.data[i + 1] * 0.587 + contrast.data[i + 2] * 0.114;
          const v = g < 128 ? 0 : 255;
          contrast.data[i] = v;
          contrast.data[i + 1] = v;
          contrast.data[i + 2] = v;
        }
        ctx.putImageData(contrast, 0, 0);
        resolve(imageDataParaEscPosRaster(ctx.getImageData(0, 0, w, h)));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

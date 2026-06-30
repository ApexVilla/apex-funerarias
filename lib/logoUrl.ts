/** Aviso quando a URL não serve como imagem direta (ex.: link da busca do Google). */
export function avisoUrlLogoInvalida(url: string): string | null {
  const u = url.trim().toLowerCase();
  if (!u) return null;
  if (
    u.includes('imgres') ||
    u.includes('google.com/url') ||
    u.includes('googleusercontent.com/imgres') ||
    u.includes('bing.com/images/async')
  ) {
    return 'Use o link direto da imagem (terminando em .png, .jpg ou .webp), não o endereço da página de busca do Google.';
  }
  try {
    const parsed = new URL(u.startsWith('http') ? u : `https://${u}`);
    if (parsed.hostname.includes('google.') && parsed.pathname.includes('imgres')) {
      return 'Use o link direto da imagem (PNG/JPG), não um link da busca do Google.';
    }
  } catch {
    return 'URL da logo inválida.';
  }
  return null;
}

/** Endereço cadastrado por engano com link (ex.: URL do Google colada no campo endereço). */
export function enderecoPareceUrlInvalida(texto?: string | null): boolean {
  const t = String(texto || '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (avisoUrlLogoInvalida(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (lower.includes('fenixfuneraria.com.br/storage/')) return true;
  if (lower.includes('google.com/imgres')) return true;
  return false;
}

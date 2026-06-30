/**
 * Abre PDF em nova aba para visualizar e imprimir (como antes).
 * Reservar a janela no mesmo instante do clique evita bloqueio de pop-up após await.
 */

export function isNavegadorMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry/i.test(navigator.userAgent);
}

export type OpcoesAbrirPdf = {
  /** No modo PDF: abre na tela e também salva na pasta Downloads. */
  baixarTambem?: boolean;
};

export function reservarJanelaImpressaoPdf(mensagemCarregando = 'Gerando PDF…'): Window | null {
  try {
    const w = window.open('', '_blank');
    if (w) escreverCarregamentoJanelaPdf(w, mensagemCarregando);
    return w;
  } catch {
    return null;
  }
}

export function escreverCarregamentoJanelaPdf(
  janela: Window,
  mensagem = 'Gerando PDF…',
): void {
  try {
    janela.document.open();
    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>PDF</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  font-family:system-ui,sans-serif;background:#f8fafc;color:#334155;padding:24px;text-align:center}
</style></head>
<body><p>${mensagem}</p></body></html>`);
    janela.document.close();
  } catch {
    /* ignore */
  }
}

function agendarRevogarBlobUrl(url: string): void {
  setTimeout(() => URL.revokeObjectURL(url), 300_000);
}

export function nomeArquivoPdf(titulo: string): string {
  const base = (titulo || 'documento').replace(/[^\w\-]+/g, '-').replace(/-+/g, '-');
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Visualizador mobile: PDF na tela + botões Enviar / Baixar. */
export function escreverPdfVisualizadorMobile(
  janela: Window,
  pdfUrl: string,
  titulo: string,
  filename: string,
): boolean {
  if (!pdfUrl || janela.closed) return false;
  try {
    const tituloSafe = escapeHtml(titulo);
    const filenameJson = JSON.stringify(filename);
    const urlJson = JSON.stringify(pdfUrl);
    janela.document.open();
    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
<title>${tituloSafe}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:#0f172a;font-family:system-ui,sans-serif}
  .viewer{position:fixed;inset:0 0 56px 0;background:#1e293b}
  embed,iframe,object{border:0;width:100%;height:100%;display:block}
  .bar{position:fixed;left:0;right:0;bottom:0;height:56px;display:flex;gap:8px;padding:8px 12px;
  background:#fff;border-top:1px solid #e2e8f0;z-index:10}
  .bar button{flex:1;border:0;border-radius:10px;font-size:15px;font-weight:600;padding:10px 8px}
  .btn-share{background:#2563eb;color:#fff}
  .btn-dl{background:#16a34a;color:#fff}
  .btn-share:active,.btn-dl:active{opacity:.85}
</style></head>
<body>
<div class="viewer"><embed src=${urlJson} type="application/pdf" width="100%" height="100%" /></div>
<div class="bar">
  <button type="button" class="btn-share" id="btnShare">Enviar</button>
  <button type="button" class="btn-dl" id="btnDl">Baixar</button>
</div>
<script>
(function(){
  var url = ${urlJson};
  var filename = ${filenameJson};
  function baixar(){
    try {
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      window.open(url, '_blank');
    }
  }
  document.getElementById('btnDl').onclick = baixar;
  document.getElementById('btnShare').onclick = async function(){
    try {
      if (!navigator.share) { baixar(); return; }
      var resp = await fetch(url);
      var blob = await resp.blob();
      var file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Recibo' });
        return;
      }
      await navigator.share({ title: 'Recibo', text: filename, url: url });
    } catch (e) {
      var msg = e && e.message ? String(e.message) : '';
      if (!/abort|cancel/i.test(msg)) baixar();
    }
  };
})();
</script>
</body></html>`);
    janela.document.close();
    janela.focus();
    return true;
  } catch (err) {
    console.error('[escreverPdfVisualizadorMobile]', err);
    return false;
  }
}

/** Android/iOS: embed com data URL (blob: em iframe costuma falhar). */
export function escreverPdfDataUrlNaJanela(
  janela: Window,
  dataUrl: string,
  titulo: string,
): boolean {
  if (!dataUrl.startsWith('data:') || janela.closed) return false;
  return escreverPdfVisualizadorMobile(janela, dataUrl, titulo, nomeArquivoPdf(titulo));
}

function abrirPdfNaJanelaComEmbed(janela: Window, url: string, titulo: string): boolean {
  try {
    const tituloSafe = escapeHtml(titulo);
    janela.document.open();
    janela.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${tituloSafe}</title>
<style>
  html,body{margin:0;padding:0;height:100%;background:#1e293b}
  iframe,embed,object{border:0;width:100%;height:100%;display:block}
</style></head>
<body>
<iframe src="${url}" title="${tituloSafe}"></iframe>
</body></html>`);
    janela.document.close();
    janela.focus();
    return true;
  } catch (err) {
    console.error('[abrirPdfNaJanelaComEmbed]', err);
    return false;
  }
}

/** Compartilhar (Android) ou baixar com nome legível. */
export async function compartilharOuBaixarPdfBlob(
  blob: Blob,
  titulo: string,
): Promise<boolean> {
  if (!blob?.size) return false;
  return downloadPdfBlob(blob, titulo);
}

/** Download direto na pasta Downloads (Android) ou Salvar em Arquivos (iOS via share). */
export async function downloadPdfBlob(blob: Blob, filename: string): Promise<boolean> {
  if (!blob?.size) return false;
  const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
  const nome = nomeArquivoPdf(filename);

  const tentarLinkDownload = (url: string): boolean => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch {
      return false;
    }
  };

  const blobUrl = URL.createObjectURL(pdfBlob);
  if (tentarLinkDownload(blobUrl)) {
    agendarRevogarBlobUrl(blobUrl);
    return true;
  }
  URL.revokeObjectURL(blobUrl);

  if (isNavegadorMobile()) {
    try {
      const dataUrl = await blobParaDataUrl(pdfBlob);
      if (tentarLinkDownload(dataUrl)) return true;
    } catch {
      /* ignore */
    }

    if (typeof navigator.share === 'function') {
      try {
        const file = new File([pdfBlob], nome, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: nome });
          return true;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/abort|cancel/i.test(msg)) return false;
      }
    }
  }

  try {
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    agendarRevogarBlobUrl(url);
    return true;
  } catch (err) {
    console.error('[downloadPdfBlob]', err);
    return false;
  }
}

async function abrirPdfMobile(
  blob: Blob,
  titulo: string,
  janela?: Window | null,
  opcoes?: OpcoesAbrirPdf,
): Promise<boolean> {
  const filename = nomeArquivoPdf(titulo);
  const dataUrl = await blobParaDataUrl(blob);

  const win = janela && !janela.closed ? janela : window.open('', '_blank');
  if (win) {
    if (escreverPdfVisualizadorMobile(win, dataUrl, titulo, filename)) {
      if (opcoes?.baixarTambem) {
        void downloadPdfBlob(blob, filename);
      }
      return true;
    }
    if (!janela) win.close();
  }

  try {
    const opened = window.open(dataUrl, '_blank');
    if (opened) {
      if (opcoes?.baixarTambem) {
        void downloadPdfBlob(blob, filename);
      }
      return true;
    }
  } catch {
    /* ignore */
  }

  if (opcoes?.baixarTambem) {
    return downloadPdfBlob(blob, filename);
  }
  return false;
}

/** Preenche janela já aberta no clique (melhor contra bloqueio de pop-up). */
export async function abrirPdfNaJanelaReservada(
  janela: Window | null | undefined,
  blob: Blob,
  titulo = 'Recibo',
  dataUrl?: string,
  opcoes?: OpcoesAbrirPdf,
): Promise<boolean> {
  if (!blob?.size) {
    console.error('[abrirPdfNaJanelaReservada] PDF vazio ou inválido.');
    if (janela && !janela.closed) janela.close();
    return false;
  }
  if (!janela || janela.closed) {
    return abrirPdfParaImprimir(blob, titulo, opcoes);
  }

  if (isNavegadorMobile()) {
    const url = dataUrl || (await blobParaDataUrl(blob));
    if (escreverPdfVisualizadorMobile(janela, url, titulo, nomeArquivoPdf(titulo))) {
      if (opcoes?.baixarTambem) {
        void downloadPdfBlob(blob, titulo);
      }
      return true;
    }
    const ok = await abrirPdfMobile(blob, titulo, janela, opcoes);
    if (ok) return true;
    if (!janela.closed) janela.close();
    return downloadPdfBlob(blob, titulo);
  }

  const blobUrl = URL.createObjectURL(blob);
  try {
    const okEmbed = abrirPdfNaJanelaComEmbed(janela, blobUrl, titulo);
    if (okEmbed) {
      agendarRevogarBlobUrl(blobUrl);
      if (opcoes?.baixarTambem) {
        void downloadPdfBlob(blob, titulo);
      }
      return true;
    }
    janela.location.href = blobUrl;
    janela.focus();
    agendarRevogarBlobUrl(blobUrl);
    if (opcoes?.baixarTambem) {
      void downloadPdfBlob(blob, titulo);
    }
    return true;
  } catch (err) {
    console.error('[abrirPdfNaJanelaReservada]', err);
    URL.revokeObjectURL(blobUrl);
    if (!janela.closed) janela.close();
    return abrirPdfParaImprimir(blob, titulo, opcoes);
  }
}

/** Abre PDF em nova aba para visualizar/imprimir. */
export async function abrirPdfParaImprimir(
  blob: Blob,
  titulo = 'Documento',
  opcoes?: OpcoesAbrirPdf,
): Promise<boolean> {
  if (!blob?.size) {
    console.error('[abrirPdfParaImprimir] PDF vazio ou inválido.');
    return false;
  }

  if (isNavegadorMobile()) {
    const ok = await abrirPdfMobile(blob, titulo, undefined, opcoes);
    if (ok) return true;
    return downloadPdfBlob(blob, titulo);
  }

  const url = URL.createObjectURL(blob);
  const filename = nomeArquivoPdf(titulo);

  const win = window.open('', '_blank');
  if (win) {
    if (abrirPdfNaJanelaComEmbed(win, url, titulo)) {
      agendarRevogarBlobUrl(url);
      if (opcoes?.baixarTambem) {
        void downloadPdfBlob(blob, titulo);
      }
      return true;
    }
    try {
      win.location.href = url;
      win.focus();
      agendarRevogarBlobUrl(url);
      if (opcoes?.baixarTambem) {
        void downloadPdfBlob(blob, titulo);
      }
      return true;
    } catch {
      if (!win.closed) win.close();
    }
  }

  if (opcoes?.baixarTambem) {
    return downloadPdfBlob(blob, titulo);
  }

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  agendarRevogarBlobUrl(url);
  return true;
}

/** @deprecated Preferir abrirPdfParaImprimir ou abrirPdfNaJanelaReservada */
export function printPdfBlob(blob: Blob, titulo = 'Documento'): boolean {
  void abrirPdfParaImprimir(blob, titulo);
  return true;
}

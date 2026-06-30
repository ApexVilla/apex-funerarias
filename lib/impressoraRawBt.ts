/** Envio ESC/POS via app RawBT (Android) — compatível com Datecs DPP-250 / DPP-350 (Bluetooth clássico). */

const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';
const RAWBT_PLAY_STORE =
  'https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter';

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export function rawBtDisponivel(): boolean {
  return isAndroid();
}

export function linkInstalarRawBt(): string {
  return RAWBT_PLAY_STORE;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function abrirUrlRawBt(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Formato oficial Mike42/escpos-php RawbtPrintConnector:
 * intent:base64,{dados}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;
 */
function montarIntentEscPosBase64(b64: string): string {
  return `intent:base64,${b64}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
}

/** Texto simples (teste de conexão no RawBT). */
export function enviarTextoViaRawBt(texto: string): void {
  if (!rawBtDisponivel()) {
    throw new Error('RawBT requer celular Android.');
  }
  const t = texto.trim();
  if (!t) throw new Error('Nenhum texto para imprimir.');
  const intent = `intent:${encodeURI(t)}#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;
  window.location.href = intent;
}

/**
 * Dispara intent Android para o app RawBT imprimir bytes ESC/POS.
 * A DPP-250 deve estar selecionada dentro do app RawBT (não só no Bluetooth do Android).
 */
export function enviarEscPosViaRawBt(bytes: Uint8Array): void {
  if (!rawBtDisponivel()) {
    throw new Error(
      'Impressora Datecs DPP-250 requer celular Android com o app RawBT. No iPhone use Recibo PDF.',
    );
  }
  if (!bytes.length) {
    throw new Error('Nenhum dado para imprimir.');
  }

  const b64 = uint8ToBase64(bytes);
  const intent = montarIntentEscPosBase64(b64);
  try {
    window.location.href = intent;
  } catch {
    abrirUrlRawBt(`rawbt:base64,${b64}`);
  }
}

/** Bytes mínimos ESC/POS para validar impressora DPP-250 via RawBT. */
export function bytesTesteEscPosDpp250(): Uint8Array {
  const texto = 'FUNERARIA FENIX\nTESTE DPP-250\nOK\n\n';
  const out: number[] = [0x1b, 0x40, 0x1b, 0x74, 0x00];
  for (const b of new TextEncoder().encode(texto)) {
    out.push(b);
  }
  out.push(0x1b, 0x64, 0x03);
  out.push(0x1d, 0x56, 0x00);
  return new Uint8Array(out);
}

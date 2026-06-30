/**
 * Web Serial API — acesso direto à porta COM da DPP-250 pareada via Bluetooth no Windows.
 * Chrome/Edge 89+ em Windows/Linux/macOS. Não disponível no Android.
 *
 * Fluxo: DPP-250 pareada no Windows → COM port virtual → Web Serial → bytes ESC/POS → imprime.
 */

// Tipos mínimos da Web Serial API (não incluídos no lib DOM padrão)
type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
};

type NavigatorSerial = {
  requestPort(options?: object): Promise<SerialPortLike>;
};

function serialApi(): NavigatorSerial | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as { serial?: NavigatorSerial };
  return nav.serial ?? null;
}

export function webSerialDisponivel(): boolean {
  return serialApi() !== null;
}

let portaAtiva: SerialPortLike | null = null;

export function portaSerialConectada(): boolean {
  return !!portaAtiva;
}

export async function conectarPortaSerial(): Promise<{ nome: string }> {
  const api = serialApi();
  if (!api) {
    throw new Error(
      'Web Serial não disponível. Use Chrome ou Edge no PC com a DPP-250 pareada via Bluetooth.',
    );
  }

  await desconectarPortaSerial();

  let port: SerialPortLike;
  try {
    // Sem filtros: mostra todas as portas COM, incluindo a COM virtual do Bluetooth
    port = await api.requestPort({});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|abort/i.test(msg)) throw new Error('Seleção cancelada.');
    throw new Error(`Não foi possível selecionar a porta: ${msg}`);
  }

  try {
    // Baud rate: em portas Bluetooth virtuais o valor é ignorado pelo SO, mas é obrigatório
    await port.open({ baudRate: 9600 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Não foi possível abrir a porta COM. Certifique-se que a DPP-250 está ligada e pareada. (${msg})`,
    );
  }

  portaAtiva = port;

  const info = port.getInfo?.();
  const nome = info?.usbVendorId
    ? `DPP-250 (USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')})`
    : 'DPP-250 (Bluetooth COM)';

  return { nome };
}

export async function desconectarPortaSerial(): Promise<void> {
  if (!portaAtiva) return;
  const p = portaAtiva;
  portaAtiva = null;
  try {
    await p.close();
  } catch {
    // ignora erros ao fechar — porta pode já estar fechada
  }
}

export async function enviarBytesSerial(bytes: Uint8Array): Promise<void> {
  if (!portaAtiva) {
    throw new Error(
      'DPP-250 não conectada. Clique em "Reconectar" para selecionar a porta COM.',
    );
  }

  const writable = portaAtiva.writable;
  if (!writable) {
    throw new Error('Porta serial não está pronta para escrita.');
  }

  const writer = writable.getWriter();
  try {
    await writer.write(bytes);
    await (writer as WritableStreamDefaultWriter<Uint8Array> & { ready?: Promise<void> }).ready;
  } finally {
    writer.releaseLock();
  }
}

export async function testarImpressoraSerial(): Promise<void> {
  const { montarEscPosRecibo } = await import('./escPosRecibo');
  const linhas = [
    'FUNERARIA FENIX',
    'TESTE DPP-250 SERIAL',
    new Date().toLocaleString('pt-BR'),
    '--------------------------------',
    'OK',
    '',
    '',
  ];
  const bytes = montarEscPosRecibo({ linhas });
  await enviarBytesSerial(bytes);
}

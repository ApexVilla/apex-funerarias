import {
  filtrosBluetoothImpressora,
  perfilParaDispositivo,
  servicosOpcionaisBluetoothImpressora,
  type ImpressoraBleProfile,
} from './impressoraBluetoothProfiles';
import { montarEscPosRecibo } from './escPosRecibo';
import { isAndroid } from './impressoraRawBt';
import { carregarRasterLogoEscPos, urlLogoReciboTermico } from './reciboTermicoLogo';
import {
  IMPRESSORA_BLUETOOTH_CELULAR_ID,
  IMPRESSORA_SERIAL_ID,
  loadReciboTermicoConfig,
  saveReciboTermicoConfig,
  type DriverImpressoraCobrador,
  type ImpressoraBluetoothSalva,
  type ReciboTermicoConfig,
  RECIBO_COBRADOR_DEFAULTS,
} from './reciboTermicoConfig';

export type { ImpressoraBluetoothSalva } from './reciboTermicoConfig';

export function webBluetoothDisponivel(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** True somente para impressoras BLE pareadas (não celular, não serial). */
export function impressoraEhBleSalva(id?: string | null): boolean {
  return !!(id && id !== IMPRESSORA_BLUETOOTH_CELULAR_ID && id !== IMPRESSORA_SERIAL_ID);
}

export function impressoraEhSerial(id?: string | null): boolean {
  return id === IMPRESSORA_SERIAL_ID;
}

/** Impressão pela tela do celular (DPP-250 pareada no Android — sem app extra). */
export function impressoraCobradorUsaNavegador(cfg?: ReciboTermicoConfig): boolean {
  const c = cfg ?? loadReciboTermicoConfig();
  const id = c.impressoraBluetooth?.id;
  if (id === IMPRESSORA_BLUETOOTH_CELULAR_ID) return true;
  if (impressoraEhBleSalva(id)) return false;
  if (impressoraEhSerial(id)) return false;
  if (c.driverImpressora === 'navegador' || c.driverImpressora === 'rawbt') return true;
  if (!id) return true;
  return false;
}

/** Precisa conectar BLE antes da baixa (só impressoras BLE). */
export function impressoraCobradorPrecisaConexaoPrevia(cfg?: ReciboTermicoConfig): boolean {
  const c = cfg ?? loadReciboTermicoConfig();
  return impressoraEhBleSalva(c.impressoraBluetooth?.id) && webBluetoothDisponivel();
}

/** RawBT desativado — cobrador usa impressão pelo navegador ou BLE direto. */
export function deveUsarRawBt(_cfg?: ReciboTermicoConfig): boolean {
  return false;
}

export function labelDriverImpressoraCobrador(_driver?: DriverImpressoraCobrador): string {
  return 'Maquininha 58 mm';
}

/** Configura impressora pareada no Bluetooth do Android (Datecs DPP-250 etc.). */
export function configurarImpressoraBluetoothCelular(nome?: string): ImpressoraBluetoothSalva {
  const salva: ImpressoraBluetoothSalva = {
    id: IMPRESSORA_BLUETOOTH_CELULAR_ID,
    name: (nome || '').trim() || 'Impressora Bluetooth',
  };
  const cfg = loadReciboTermicoConfig();
  saveReciboTermicoConfig({
    ...cfg,
    ...RECIBO_COBRADOR_DEFAULTS,
    impressoraBluetooth: salva,
    driverImpressora: 'navegador',
    modoImpressao: 'navegador',
    larguraMm: 58,
  });
  return salva;
}

/** Configura DPP-250 via Web Serial (porta COM Bluetooth no Windows/PC). */
export function configurarImpressoraSerial(nome: string): ImpressoraBluetoothSalva {
  const salva: ImpressoraBluetoothSalva = {
    id: IMPRESSORA_SERIAL_ID,
    name: nome || 'DPP-250 (Serial)',
  };
  const cfg = loadReciboTermicoConfig();
  saveReciboTermicoConfig({
    ...cfg,
    ...RECIBO_COBRADOR_DEFAULTS,
    impressoraBluetooth: salva,
    driverImpressora: 'serial',
    modoImpressao: 'bluetooth',
    larguraMm: 58,
  });
  return salva;
}

async function solicitarDispositivoBle(): Promise<BluetoothDevice> {
  try {
    return await navigator.bluetooth.requestDevice({
      filters: filtrosBluetoothImpressora(),
      optionalServices: servicosOpcionaisBluetoothImpressora(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/cancel|abort/i.test(msg)) {
      return navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: servicosOpcionaisBluetoothImpressora(),
      } as RequestDeviceOptions);
    }
    throw err;
  }
}

type ConexaoAtiva = {
  device: BluetoothDevice;
  characteristic: BluetoothRemoteGATTCharacteristic;
  profile: ImpressoraBleProfile;
};

let conexao: ConexaoAtiva | null = null;
let filaEscrita: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mensagemErroBluetooth(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/gatt server is disconnected|cannot retrieve services|not connected/i.test(msg)) {
    return (
      'A impressora desconectou antes de concluir. Deixe-a ligada, afaste outros celulares pareados, ' +
      'toque em Conectar de novo e escolha o mesmo aparelho.'
    );
  }
  if (/user cancelled|cancelled|abort/i.test(msg)) {
    return 'Conexão cancelada.';
  }
  return msg;
}

function enfileirar<T>(fn: () => Promise<T>): Promise<T> {
  const run = filaEscrita.then(fn, fn);
  filaEscrita = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function desconectarGatt(device: BluetoothDevice | undefined): void {
  if (!device?.gatt) return;
  try {
    if (device.gatt.connected) device.gatt.disconnect();
  } catch {
    /* ignore */
  }
}

/** Conecta GATT com nova tentativa (comum em Android após escolher o aparelho). */
async function conectarGattComRetry(device: BluetoothDevice, maxTentativas = 4): Promise<BluetoothRemoteGATTServer> {
  const gatt = device.gatt;
  if (!gatt) {
    throw new Error('Este aparelho não expõe Bluetooth GATT. Use outra impressora ESC/POS 58mm.');
  }

  let ultimoErro: unknown;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa += 1) {
    try {
      if (gatt.connected) {
        try {
          const s = await gatt.connect();
          if (s.connected) return s;
        } catch {
          desconectarGatt(device);
          await sleep(350);
        }
      }

      const server = await gatt.connect();
      await sleep(tentativa === 0 ? 280 : 450);
      if (!server.connected) {
        throw new Error('GATT desconectou logo após conectar.');
      }
      return server;
    } catch (err) {
      ultimoErro = err;
      desconectarGatt(device);
      await sleep(400 + tentativa * 250);
    }
  }

  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

async function listarServicosPrimarios(
  device: BluetoothDevice,
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTService[]> {
  try {
    return await server.getPrimaryServices();
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (!/disconnected|gatt|not connected|retrieve services/i.test(msg)) {
      throw err;
    }
    const server2 = await conectarGattComRetry(device);
    return server2.getPrimaryServices();
  }
}

async function abrirDispositivo(device: BluetoothDevice): Promise<ConexaoAtiva> {
  if (conexao && conexao.device.id !== device.id) {
    desconectarGatt(conexao.device);
    conexao = null;
  } else if (conexao?.device.id === device.id) {
    desconectarGatt(device);
    conexao = null;
  }

  const server = await conectarGattComRetry(device);
  const services = await listarServicosPrimarios(device, server);
  const uuids = services.map((s) => s.uuid);

  const profile = perfilParaDispositivo(uuids, device);

  if (!profile) {
    desconectarGatt(device);
    throw new Error(
      'Impressora não reconhecida. Use maquininha ESC/POS Bluetooth 58mm (MPT-II, Printer001, TM-P) ou configure pelo celular.',
    );
  }

  const printService = await server.getPrimaryService(profile.print.service);
  const characteristic = await printService.getCharacteristic(profile.print.characteristic);

  const onDisconnect = () => {
    if (conexao?.device === device) conexao = null;
  };
  device.removeEventListener('gattserverdisconnected', onDisconnect);
  device.addEventListener('gattserverdisconnected', onDisconnect);

  return { device, characteristic, profile };
}

async function escreverChunk(
  char: BluetoothRemoteGATTCharacteristic,
  chunk: Uint8Array,
  comResposta: boolean,
): Promise<void> {
  if (comResposta && char.properties.write) {
    await char.writeValueWithResponse(chunk);
    return;
  }
  if (char.properties.writeWithoutResponse) {
    await char.writeValueWithoutResponse(chunk);
    return;
  }
  if (char.properties.write) {
    await char.writeValueWithResponse(chunk);
    return;
  }
  throw new Error('Característica de impressão não permite envio de dados.');
}

async function enviarBytes(
  data: Uint8Array,
  profile: ImpressoraBleProfile,
  char: BluetoothRemoteGATTCharacteristic,
) {
  const max = profile.messageSize ?? 100;
  const sleepMs = profile.sleepAfterChunkMs ?? 0;
  const comResposta = char.properties.write && !char.properties.writeWithoutResponse;

  for (let offset = 0; offset < data.length; offset += max) {
    const chunk = data.slice(offset, Math.min(offset + max, data.length));
    await escreverChunk(char, chunk, comResposta);
    if (sleepMs > 0) {
      await sleep(sleepMs);
    } else if (data.length > max) {
      await sleep(15);
    }
  }
}

export function impressoraBluetoothConectadaAgora(): boolean {
  return !!(conexao?.device.gatt?.connected && conexao.characteristic);
}

export async function parearImpressoraBluetooth(): Promise<ImpressoraBluetoothSalva> {
  if (!webBluetoothDisponivel()) {
    throw new Error('Este navegador não suporta Web Bluetooth. Use Chrome ou Edge no celular.');
  }

  desconectarImpressoraBluetooth();

  let device: BluetoothDevice;
  try {
    device = await solicitarDispositivoBle();
  } catch (err) {
    throw new Error(mensagemErroBluetooth(err));
  }

  try {
    conexao = await abrirDispositivo(device);
  } catch (err) {
    desconectarGatt(device);
    throw new Error(mensagemErroBluetooth(err));
  }

  const salva: ImpressoraBluetoothSalva = { id: device.id, name: device.name || 'Impressora' };

  const cfg = loadReciboTermicoConfig();
  saveReciboTermicoConfig({
    ...cfg,
    ...RECIBO_COBRADOR_DEFAULTS,
    impressoraBluetooth: salva,
    driverImpressora: 'web_ble',
    modoImpressao: 'bluetooth',
    larguraMm: 58,
  });

  return salva;
}

/**
 * Fluxo único do cobrador: tenta BLE (MPT-II, TM-P…); se não aparecer, usa impressora
 * pareada no Bluetooth do Android (Datecs DPP-250).
 */
export async function conectarImpressoraCobrador(): Promise<ImpressoraBluetoothSalva> {
  if (webBluetoothDisponivel()) {
    try {
      return await parearImpressoraBluetooth();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancel|abort|user cancelled/i.test(msg)) {
        throw err;
      }
    }
  }

  return configurarImpressoraBluetoothCelular('Datecs DPP-250 / Bluetooth');
}

export async function reconectarImpressoraSalva(
  salva?: ImpressoraBluetoothSalva | null,
): Promise<boolean> {
  if (!webBluetoothDisponivel()) return false;
  const alvo = salva ?? loadReciboTermicoConfig().impressoraBluetooth;
  if (!alvo?.id || alvo.id === IMPRESSORA_BLUETOOTH_CELULAR_ID) return false;

  if (conexao?.device.id === alvo.id && impressoraBluetoothConectadaAgora()) {
    return true;
  }

  const getDevices = navigator.bluetooth.getDevices;
  if (!getDevices) return false;

  try {
    const devices = await getDevices();
    const device = devices.find((d) => d.id === alvo.id);
    if (!device) return false;

    conexao = await abrirDispositivo(device);
    return impressoraBluetoothConectadaAgora();
  } catch {
    conexao = null;
    return false;
  }
}

export async function imprimirLinhasBluetooth(
  linhas: string[],
  logoUrl?: string | null,
): Promise<void> {
  return enfileirar(async () => {
    const cfg = loadReciboTermicoConfig();

    let logoRaster: Uint8Array | null = null;
    const src = logoUrl ? urlLogoReciboTermico(logoUrl) : urlLogoReciboTermico(null);
    try {
      logoRaster = await carregarRasterLogoEscPos(src, cfg.larguraMm);
    } catch {
      logoRaster = null;
    }

    const bytes = montarEscPosRecibo({ linhas, logoRaster });

    const tentarBle = async (): Promise<boolean> => {
      if (!webBluetoothDisponivel()) return false;
      if (!impressoraEhBleSalva(cfg.impressoraBluetooth?.id)) return false;

      if (!impressoraBluetoothConectadaAgora()) {
        const ok = await reconectarImpressoraSalva(cfg.impressoraBluetooth);
        if (!ok || !conexao) return false;
      }

      try {
        await enviarBytes(bytes, conexao!.profile, conexao!.characteristic);
        return true;
      } catch (err) {
        conexao = null;
        if (cfg.driverImpressora === 'web_ble') {
          throw new Error(mensagemErroBluetooth(err));
        }
        return false;
      }
    };

    if (await tentarBle()) return;

    // DPP-250 via Web Serial (porta COM Bluetooth no Windows)
    if (impressoraEhSerial(cfg.impressoraBluetooth?.id)) {
      const { enviarBytesSerial, portaSerialConectada } = await import('./impressoraWebSerial');
      if (!portaSerialConectada()) {
        throw new Error(
          'DPP-250 não conectada. Clique em "Reconectar Serial" para selecionar a porta COM.',
        );
      }
      await enviarBytesSerial(bytes);
      return;
    }

    if (impressoraCobradorUsaNavegador(cfg)) {
      throw new Error(
        'Use Teste ou receba uma parcela para abrir a impressão e escolher a impressora no celular.',
      );
    }

    if (!webBluetoothDisponivel() && !isAndroid()) {
      throw new Error(
        'Use Chrome ou Edge no Android e configure a impressora em Conectar, ou use Teste para imprimir pelo celular.',
      );
    }

    throw new Error(
      'Impressora não conectada. Toque em Conectar no topo e escolha a impressora na lista — ' +
        'se não aparecer, cancele e confirme o pareamento em Configurações → Bluetooth do Android (PIN 0000).',
    );
  });
}

export async function testarImpressoraBluetooth(linhasTeste?: string[]): Promise<void> {
  const linhas =
    linhasTeste ??
    [
      'FUNERARIA FENIX',
      'TESTE IMPRESSORA BT',
      new Date().toLocaleString('pt-BR'),
      '--------------------------------',
      'OK',
    ];
  await imprimirLinhasBluetooth(linhas);
}

export function desconectarImpressoraBluetooth(): void {
  if (conexao) desconectarGatt(conexao.device);
  conexao = null;
}

export function limparImpressoraSalva(): void {
  desconectarImpressoraBluetooth();
  const cfg = loadReciboTermicoConfig();
  const { impressoraBluetooth: _, ...rest } = cfg;
  saveReciboTermicoConfig(rest as ReciboTermicoConfig);
}

export type FallbackImpressaoRecibo = 'pdf' | 'termico' | 'nenhum';

/**
 * Deve ser a primeira operação assíncrona no clique "Receber" (gesto do usuário).
 */
export async function garantirConexaoBluetoothAntesDaBaixa(): Promise<void> {
  const cfg = loadReciboTermicoConfig();

  if (impressoraCobradorUsaNavegador(cfg)) {
    return;
  }

  if (!webBluetoothDisponivel()) {
    throw new Error('Use Chrome ou Edge no celular para conectar a impressora.');
  }

  if (impressoraBluetoothConectadaAgora()) return;

  const reconectou = await reconectarImpressoraSalva(cfg.impressoraBluetooth);
  if (reconectou && conexao) return;

  await conectarImpressoraCobrador();
}

async function tentarBluetooth(
  _cfg: ReturnType<typeof loadReciboTermicoConfig>,
  linhas: string[],
  logoUrl?: string | null,
) {
  await imprimirLinhasBluetooth(linhas, logoUrl);
}

/** Imprime recibo: Bluetooth, depois fallback (PDF ou térmica no navegador). */
export async function imprimirReciboModoConfigurado(
  linhas: string[],
  callbacks: {
    termico: () => boolean;
    pdf?: () => Promise<void>;
  },
  opts?: { fallback?: FallbackImpressaoRecibo; logoUrl?: string | null },
): Promise<'bluetooth' | 'navegador' | 'pdf'> {
  const cfg = loadReciboTermicoConfig();
  const fallback: FallbackImpressaoRecibo =
    opts?.fallback ?? (cfg.fallbackNavegador ? 'termico' : 'nenhum');
  const logoUrl = opts?.logoUrl;

  const querBluetooth =
    cfg.modoImpressao === 'bluetooth' ||
    impressoraEhBleSalva(cfg.impressoraBluetooth?.id) ||
    (cfg.modoImpressao === 'automatico' && !!cfg.impressoraBluetooth?.id);

  if (querBluetooth && webBluetoothDisponivel()) {
    try {
      await tentarBluetooth(cfg, linhas, logoUrl);
      return 'bluetooth';
    } catch (err) {
      if (fallback === 'nenhum') throw err;
    }
  }

  if (cfg.modoImpressao === 'navegador' || fallback === 'termico') {
    const ok = callbacks.termico();
    if (!ok) {
      throw new Error('Permita pop-ups do navegador ou conecte a impressora Bluetooth.');
    }
    return 'navegador';
  }

  if (fallback === 'pdf' && callbacks.pdf) {
    await callbacks.pdf();
    return 'pdf';
  }

  throw new Error('Nenhum modo de impressão disponível.');
}

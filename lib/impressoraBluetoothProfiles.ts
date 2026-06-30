/** Perfis BLE de impressoras térmicas portáteis (ESC/POS) compatíveis com Web Bluetooth. */
export type ImpressoraBleProfile = {
  filters: BluetoothLEScanFilter[];
  print: { service: string; characteristic: string };
  messageSize?: number;
  sleepAfterChunkMs?: number;
};

export const IMPRESSORA_BLE_PROFILES: ImpressoraBleProfile[] = [
  // DPP-250 BLE com serviço ESC/POS genérico (18f0)
  {
    filters: [{ namePrefix: 'DPP' }, { namePrefix: 'Datecs' }],
    print: {
      service: '000018f0-0000-1000-8000-00805f9b34fb',
      characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    },
    messageSize: 100,
  },
  // DPP-250 Plus BT / modelos com serviço ISSC BLE serial
  {
    filters: [
      { namePrefix: 'DPP', services: ['49535343-fe7d-4ae5-8fa9-9faf205455fd'] },
      { namePrefix: 'Datecs', services: ['49535343-fe7d-4ae5-8fa9-9faf205455fd'] },
    ],
    print: {
      service: '49535343-fe7d-4ae5-8fa9-9faf205455fd',
      characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    },
    messageSize: 100,
  },
  {
    filters: [{ namePrefix: 'TM-P' }],
    print: {
      service: '49535343-fe7d-4ae5-8fa9-9faf205455fd',
      characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    },
    messageSize: 100,
  },
  {
    filters: [{ name: 'BlueTooth Printer', services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    print: {
      service: '000018f0-0000-1000-8000-00805f9b34fb',
      characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    },
  },
  {
    filters: [{ name: 'Printer001', services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    print: {
      service: '000018f0-0000-1000-8000-00805f9b34fb',
      characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    },
  },
  {
    filters: [{ name: 'MPT-II', services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    print: {
      service: '000018f0-0000-1000-8000-00805f9b34fb',
      characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    },
  },
  {
    filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    print: {
      service: '000018f0-0000-1000-8000-00805f9b34fb',
      characteristic: '00002af1-0000-1000-8000-00805f9b34fb',
    },
  },
];

export function filtrosBluetoothImpressora(): BluetoothLEScanFilter[] {
  return IMPRESSORA_BLE_PROFILES.flatMap((p) => p.filters);
}

export function servicosOpcionaisBluetoothImpressora(): string[] {
  const ids = IMPRESSORA_BLE_PROFILES.map((p) => p.print.service);
  return [...new Set(ids)];
}

function filtroCompativel(filter: BluetoothLEScanFilter, uuids: string[], device: BluetoothDevice): boolean {
  if (filter.services) {
    for (const s of filter.services) {
      if (!uuids.includes(s)) return false;
    }
  }
  if (filter.name && device.name !== filter.name) return false;
  if (filter.namePrefix && !String(device.name || '').startsWith(filter.namePrefix)) return false;
  return true;
}

export function perfilParaDispositivo(
  uuids: string[],
  device: BluetoothDevice,
): ImpressoraBleProfile | null {
  // Prioriza perfis onde o serviço de impressão está presente no dispositivo
  const comServico = IMPRESSORA_BLE_PROFILES.find(
    (profile) =>
      uuids.includes(profile.print.service) &&
      profile.filters.some((f) => filtroCompativel(f, uuids, device)),
  );
  if (comServico) return comServico;
  // Fallback: match por nome/filtro sem verificar se o serviço existe
  return (
    IMPRESSORA_BLE_PROFILES.find((profile) =>
      profile.filters.some((f) => filtroCompativel(f, uuids, device)),
    ) ?? null
  );
}

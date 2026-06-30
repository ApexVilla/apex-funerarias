export type ModoImpressaoRecibo = 'automatico' | 'bluetooth' | 'navegador';

/** Driver da maquininha do cobrador em campo. */
export type DriverImpressoraCobrador = 'navegador' | 'web_ble' | 'rawbt' | 'automatico' | 'serial';

export type ImpressoraBluetoothSalva = {
  id: string;
  name: string;
};

/** Impressora pareada no Android (Datecs DPP-250 etc.) — impressão pela tela do celular. */
export const IMPRESSORA_BLUETOOTH_CELULAR_ID = 'android-sistema';

/** DPP-250 via Web Serial API (porta COM Bluetooth no Windows). */
export const IMPRESSORA_SERIAL_ID = 'web-serial';

/** Preferências do recibo térmico (por estação / navegador). */
export type ReciboTermicoConfig = {
  larguraMm: 80 | 58;
  imprimirAutomatico: boolean;
  /** Cobrador em campo: maquininha Bluetooth; escritório: navegador ou automático. */
  modoImpressao: ModoImpressaoRecibo;
  impressoraBluetooth?: ImpressoraBluetoothSalva | null;
  /** Se Bluetooth falhar, abre impressão pelo navegador. */
  fallbackNavegador: boolean;
  /**
   * Cobrador em campo:
   * - navegador: impressão pelo celular (58 mm) — Datecs DPP-250 pareada no Android, igual financeiro.
   * - web_ble: Web Bluetooth (MPT-II, TM-P…).
   * - rawbt: legado — tratado como navegador.
   * - automatico: BLE se pareada; senão navegador.
   */
  driverImpressora?: DriverImpressoraCobrador;
  telefone?: string;
  /** Se true (padrão), o rodapé usa janeiro do ano seguinte — não precisa alterar todo ano. */
  avisoRodapeAutomatico?: boolean;
  avisoRodape?: string;
  valorPlanoFenix?: string;
  valorPlanoOnix?: string;
};

/** Janeiro do ano seguinte à data de referência (reajuste anual). */
export function textoAvisoReajusteJaneiroProximo(dataRef: Date = new Date()): string {
  const anoReajuste = dataRef.getFullYear() + 1;
  return `A partir do dia 1 de janeiro de ${anoReajuste} havera reajuste na mensalidade`;
}

function avisoPareceReajusteAnualLegado(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return t.includes('reajuste') && t.includes('janeiro');
}

/** Texto do rodapé no recibo térmico (dinâmico ou personalizado). */
export function resolveAvisoRodape(cfg: ReciboTermicoConfig): string | undefined {
  if (cfg.avisoRodapeAutomatico === false) {
    const custom = cfg.avisoRodape?.trim();
    return custom || undefined;
  }
  return textoAvisoReajusteJaneiroProximo();
}

const STORAGE_KEY = 'apex_recibo_termico_config';

export const RECIBO_TERMICO_DEFAULTS: ReciboTermicoConfig = {
  /** Escritório / baixa de parcelas: impressoras 80 mm (MP-2800 etc.). Cobradores usam 58 mm. */
  larguraMm: 80,
  /** Legado: não usado na Baixa de parcelas (impressão manual). Mantido para configs antigas. */
  imprimirAutomatico: false,
  modoImpressao: 'automatico',
  fallbackNavegador: true,
  avisoRodapeAutomatico: false,
  avisoRodape: '',
  valorPlanoFenix: 'Plano Fenix 53,00',
  valorPlanoOnix: 'Plano Onix 68,00',
};

/** Padrão recomendado na tela de cobrança em rota (DPP-250 / 58 mm pelo celular). */
export const RECIBO_COBRADOR_DEFAULTS: Partial<ReciboTermicoConfig> = {
  larguraMm: 58,
  modoImpressao: 'navegador',
  fallbackNavegador: true,
  driverImpressora: 'navegador',
};

/** Config efetiva do cobrador (58 mm; não herda 80 mm do financeiro). */
export function loadReciboTermicoConfigCobrador(): ReciboTermicoConfig {
  const cfg = loadReciboTermicoConfig();
  const driver = cfg.driverImpressora ?? RECIBO_COBRADOR_DEFAULTS.driverImpressora ?? 'navegador';
  const driverNorm = driver === 'rawbt' ? 'navegador' : driver;
  const modo =
    driverNorm === 'web_ble'
      ? 'bluetooth'
      : driverNorm === 'navegador'
        ? 'navegador'
        : cfg.modoImpressao === 'navegador'
          ? 'navegador'
          : cfg.modoImpressao || 'bluetooth';
  return {
    ...cfg,
    ...RECIBO_COBRADOR_DEFAULTS,
    larguraMm: 58,
    driverImpressora: driverNorm,
    modoImpressao: modo,
  };
}

/** Financeiro — baixa de parcelas: Bematech MP-4200 TH / MP-2800 (bobina 80 mm, impressão pelo PC). */
export const RECIBO_FINANCEIRO_DEFAULTS: Partial<ReciboTermicoConfig> = {
  larguraMm: 80,
  modoImpressao: 'navegador',
  fallbackNavegador: true,
};

/** Config do recibo na baixa de parcelas (sempre 80 mm; ignora 58 mm salvo para cobrador). */
export function loadReciboTermicoConfigFinanceiro(): ReciboTermicoConfig {
  const cfg = loadReciboTermicoConfig();
  const modo =
    cfg.modoImpressao === 'bluetooth' ? 'navegador' : cfg.modoImpressao || 'navegador';
  return {
    ...cfg,
    ...RECIBO_FINANCEIRO_DEFAULTS,
    larguraMm: 80,
    modoImpressao: modo,
  };
}


export function loadReciboTermicoConfig(): ReciboTermicoConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...RECIBO_TERMICO_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ReciboTermicoConfig>;
    const avisoRodapeAutomatico =
      parsed.avisoRodapeAutomatico ??
      (parsed.avisoRodape ? avisoPareceReajusteAnualLegado(String(parsed.avisoRodape)) : true);

    const impId = parsed.impressoraBluetooth?.id;
    let driver = parsed.driverImpressora ?? 'navegador';

    if (impId === IMPRESSORA_BLUETOOTH_CELULAR_ID) {
      driver = 'navegador';
    } else if (impId) {
      driver = 'web_ble';
    } else if (driver === 'rawbt' || driver === 'automatico') {
      driver = 'navegador';
    }

    const modoImpressao =
      impId === IMPRESSORA_BLUETOOTH_CELULAR_ID
        ? 'navegador'
        : driver === 'web_ble'
          ? 'bluetooth'
          : driver === 'navegador'
            ? 'navegador'
            : parsed.modoImpressao ?? RECIBO_TERMICO_DEFAULTS.modoImpressao;

    return {
      ...RECIBO_TERMICO_DEFAULTS,
      ...parsed,
      modoImpressao,
      driverImpressora: driver,
      fallbackNavegador: parsed.fallbackNavegador ?? RECIBO_TERMICO_DEFAULTS.fallbackNavegador,
      avisoRodapeAutomatico,
    };
  } catch {
    return { ...RECIBO_TERMICO_DEFAULTS };
  }
}

export function saveReciboTermicoConfig(cfg: ReciboTermicoConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/** Colunas de texto (menos colunas = fonte maior na impressão térmica). */
export function charsPorLinha(larguraMm: 80 | 58): number {
  return larguraMm === 58 ? 24 : 32;
}

/** Tamanho da fonte e margens para impressão legível em MP-4200 / 80 mm. */
export function metricasLayoutReciboImpressao(larguraMm: 80 | 58): {
  cols: number;
  fontSizeMm: number;
  tituloMm: number;
  destaqueMm: number;
  paddingHorizontalMm: number;
} {
  const cols = charsPorLinha(larguraMm);
  const paddingHorizontalMm = larguraMm === 58 ? 2 : 3;
  const fontSizeMm = larguraMm === 58 ? 2.35 : 2.75;
  const tituloMm = larguraMm === 58 ? 2.85 : 3.35;
  const destaqueMm = larguraMm === 58 ? 2.65 : 3.1;
  return { cols, fontSizeMm, tituloMm, destaqueMm, paddingHorizontalMm };
}

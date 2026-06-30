import React, { useEffect, useState } from 'react';
import { Bluetooth, Printer, Unplug, Smartphone, Cable } from 'lucide-react';
import { Button, Card } from '../ui/Components';
import { useToast } from '../../lib/ToastStore';
import {
  IMPRESSORA_BLUETOOTH_CELULAR_ID,
  IMPRESSORA_SERIAL_ID,
  loadReciboTermicoConfig,
  loadReciboTermicoConfigCobrador,
} from '../../lib/reciboTermicoConfig';
import {
  configurarImpressoraBluetoothCelular,
  configurarImpressoraSerial,
  conectarImpressoraCobrador,
  impressoraBluetoothConectadaAgora,
  impressoraEhBleSalva,
  impressoraEhSerial,
  limparImpressoraSalva,
  testarImpressoraBluetooth,
  webBluetoothDisponivel,
} from '../../lib/ImpressoraBluetoothService';
import { imprimirLinhasReciboTermico } from '../../lib/ReciboTermicoService';
import { webSerialDisponivel } from '../../lib/impressoraWebSerial';

type Props = {
  compacto?: boolean;
};

const LINHAS_TESTE = [
  'FUNERARIA FENIX',
  'TESTE IMPRESSORA 58mm',
  new Date().toLocaleString('pt-BR'),
  '--------------------------------',
  'OK',
];

export const ImpressoraBluetoothSetup: React.FC<Props> = ({ compacto }) => {
  const { showToast } = useToast();
  const [cfg, setCfg] = useState(loadReciboTermicoConfig());
  const [conectada, setConectada] = useState(false);
  const [serialConectada, setSerialConectada] = useState(false);
  const [busy, setBusy] = useState(false);

  const atualizarEstado = () => {
    const c = loadReciboTermicoConfig();
    setCfg(c);
    const ble = impressoraEhBleSalva(c.impressoraBluetooth?.id);
    setConectada(ble ? impressoraBluetoothConectadaAgora() : !!c.impressoraBluetooth?.id);
  };

  useEffect(() => {
    atualizarEstado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nome = cfg.impressoraBluetooth?.name;
  const modoCelular = cfg.impressoraBluetooth?.id === IMPRESSORA_BLUETOOTH_CELULAR_ID;
  const modoSerial = impressoraEhSerial(cfg.impressoraBluetooth?.id);
  const modoBle = impressoraEhBleSalva(cfg.impressoraBluetooth?.id);

  // ─── Ações ───────────────────────────────────────────────────────────────

  const conectarBle = async () => {
    if (!webBluetoothDisponivel()) {
      showToast(
        'Bluetooth BLE não disponível neste navegador. Use Chrome ou Edge, ou escolha outra opção.',
        'warning',
      );
      return;
    }
    setBusy(true);
    try {
      const salva = await conectarImpressoraCobrador();
      atualizarEstado();
      setConectada(true);
      if (salva.id === IMPRESSORA_BLUETOOTH_CELULAR_ID) {
        showToast('Pareie a impressora no Bluetooth do celular (PIN 0000) e use Teste.', 'success');
      } else {
        showToast(`Impressora "${salva.name}" conectada via BLE.`, 'success');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível conectar.';
      if (!/cancel|abort/i.test(msg)) showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const configurarDpp250Celular = () => {
    configurarImpressoraBluetoothCelular('DPP-250');
    atualizarEstado();
    showToast('DPP-250 configurada. Pareie no Bluetooth do celular/PC e use Teste.', 'success');
  };

  const conectarSerial = async () => {
    if (!webSerialDisponivel()) {
      showToast(
        'Web Serial não disponível. Use Chrome ou Edge no PC (Windows/Linux/macOS).',
        'warning',
      );
      return;
    }
    setBusy(true);
    try {
      const { conectarPortaSerial } = await import('../../lib/impressoraWebSerial');
      const { nome: nomeSalvo } = await conectarPortaSerial();
      configurarImpressoraSerial(nomeSalvo);
      atualizarEstado();
      setSerialConectada(true);
      showToast(`DPP-250 conectada via serial (${nomeSalvo}). Use Teste para confirmar.`, 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível conectar.';
      if (!/cancelad|cancel|abort/i.test(msg)) showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const testar = async () => {
    setBusy(true);
    try {
      const cfgCob = loadReciboTermicoConfigCobrador();

      if (impressoraEhSerial(cfgCob.impressoraBluetooth?.id)) {
        const { testarImpressoraSerial, portaSerialConectada } = await import('../../lib/impressoraWebSerial');
        if (!portaSerialConectada()) {
          showToast('Conecte a porta serial antes de testar.', 'warning');
          return;
        }
        await testarImpressoraSerial();
        setSerialConectada(true);
        showToast('Recibo de teste enviado para DPP-250.', 'success');
        return;
      }

      if (impressoraEhBleSalva(cfgCob.impressoraBluetooth?.id)) {
        await testarImpressoraBluetooth(LINHAS_TESTE);
        showToast('Recibo de teste enviado via BLE.', 'success');
        setConectada(true);
        return;
      }

      const ok = imprimirLinhasReciboTermico(LINHAS_TESTE, cfgCob);
      if (!ok) {
        showToast('Permita pop-ups e escolha a impressora na tela do celular/PC.', 'warning');
        return;
      }
      showToast('Escolha a DPP-250 no diálogo de impressão que abriu.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Falha no teste.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const desconectar = async () => {
    if (modoSerial) {
      const { desconectarPortaSerial } = await import('../../lib/impressoraWebSerial');
      await desconectarPortaSerial();
      setSerialConectada(false);
    }
    limparImpressoraSalva();
    atualizarEstado();
    setConectada(false);
    showToast('Impressora desvinculada.', 'info');
  };

  // ─── Sem impressora: mostra as 3 opções ──────────────────────────────────

  if (!nome) {
    return (
      <Card className={`${compacto ? 'p-3' : 'p-4'} border-violet-200 bg-violet-50/50`}>
        <h4 className="font-semibold text-violet-900 flex items-center gap-2 text-sm mb-3">
          <Printer className="h-4 w-4 shrink-0" />
          Impressora 58 mm — Escolha o tipo
        </h4>

        <div className="flex flex-col gap-2">
          {/* Opção 1: BLE */}
          <div className="rounded-lg border border-violet-100 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  <Bluetooth className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  Bluetooth BLE
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  MPT-II, TM-P, DPP-250 BLE — aparece na lista ao conectar
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void conectarBle()} loading={busy} disabled={busy}>
                Conectar
              </Button>
            </div>
          </div>

          {/* Opção 2: Serial COM (Web Serial) */}
          <div className="rounded-lg border border-violet-100 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  <Cable className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  DPP-250 via porta COM
                  {!webSerialDisponivel() && (
                    <span className="text-[10px] text-gray-400 font-normal ml-1">(só PC)</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  DPP-250 clássica pareada no Windows — acesso direto à porta COM, sem app
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void conectarSerial()}
                loading={busy}
                disabled={busy || !webSerialDisponivel()}
              >
                Conectar
              </Button>
            </div>
            {!webSerialDisponivel() && (
              <p className="text-[11px] text-gray-400 mt-2">
                Disponível em Chrome/Edge no PC. No Android, use a opção abaixo.
              </p>
            )}
          </div>

          {/* Opção 3: DPP-250 pelo diálogo de impressão */}
          <div className="rounded-lg border border-violet-100 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  DPP-250 pelo diálogo do sistema
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Imprime pelo diálogo de impressão — Android ou PC com driver instalado
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={configurarDpp250Celular} disabled={busy}>
                Configurar
              </Button>
            </div>
          </div>
        </div>

        {!compacto && (
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            <strong>DPP-250 antiga (Bluetooth clássico):</strong> use "via porta COM" no Chrome/Edge
            do PC (pareie a DPP-250 no Bluetooth do Windows → cria uma COM automática) ou "pelo
            diálogo do sistema" no celular. Se a DPP-250 aparecer na lista BLE, use "Bluetooth BLE".
          </p>
        )}
      </Card>
    );
  }

  // ─── Impressora configurada: mostra status e ações ───────────────────────

  const statusTexto = modoSerial
    ? serialConectada
      ? `Conectada: ${nome}`
      : `${nome} — clique Reconectar para abrir a porta COM`
    : modoCelular
      ? `Pronta: ${nome} — imprime pelo diálogo do sistema`
      : conectada
        ? `Conectada via BLE: ${nome}`
        : `Última BLE: ${nome} — clique Reconectar`;

  const icone = modoSerial ? (
    <Cable className="h-4 w-4 shrink-0 text-green-600" />
  ) : modoCelular ? (
    <Smartphone className="h-4 w-4 shrink-0 text-violet-500" />
  ) : (
    <Bluetooth className="h-4 w-4 shrink-0 text-blue-500" />
  );

  const tituloModo = modoSerial
    ? 'DPP-250 via porta COM'
    : modoCelular
      ? 'DPP-250 / Bluetooth pareado'
      : 'Impressora BLE (58 mm)';

  return (
    <Card className={`${compacto ? 'p-3' : 'p-4'} border-violet-200 bg-violet-50/50`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-violet-900 flex items-center gap-2 text-sm">
            {icone}
            {tituloModo}
          </h4>
          <p className="text-xs text-gray-600 mt-1">{statusTexto}</p>
          {modoSerial && !compacto && (
            <p className="text-[11px] text-gray-500 mt-1">
              Certifique-se que a DPP-250 está ligada. Se desconectou, clique Reconectar para
              selecionar a porta COM novamente.
            </p>
          )}
          {modoCelular && !compacto && (
            <p className="text-[11px] text-gray-500 mt-1">
              Pareie a DPP-250 em Configurações → Bluetooth (PIN 0000). No Teste, escolha-a no
              diálogo de impressão.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {modoSerial && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void conectarSerial()}
              loading={busy}
              disabled={busy}
            >
              <Cable className="h-4 w-4 mr-1" />
              {busy ? 'Conectando…' : 'Reconectar'}
            </Button>
          )}
          {modoBle && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void conectarBle()}
              loading={busy}
              disabled={busy}
            >
              <Bluetooth className="h-4 w-4 mr-1" />
              {busy ? 'Conectando…' : 'Reconectar'}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => void testar()} loading={busy} disabled={busy}>
            <Printer className="h-4 w-4 mr-1" />
            Teste
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void desconectar()}>
            <Unplug className="h-4 w-4 mr-1" />
            Trocar
          </Button>
        </div>
      </div>
    </Card>
  );
};

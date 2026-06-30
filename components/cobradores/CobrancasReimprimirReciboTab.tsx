import React, { useCallback, useMemo, useState } from 'react';
import { Search, History, Bluetooth, FileText, CheckCircle2 } from 'lucide-react';
import { Button, Card, Input } from '../ui/Components';
import { useToast } from '../../lib/ToastStore';
import { buscarClientesPorTermo, type ClienteBuscaRow } from '../../lib/buscarClientesEmpresa';
import {
  listarRecebimentosCampoPorCliente,
  type RecebimentoCampoDto,
} from '../../lib/cobRecebimentosSupabase';
import { reimprimirRecibosRecebimentosCampo } from '../../lib/cobradorReciboCampo';
import {
  garantirConexaoBluetoothAntesDaBaixa,
  impressoraCobradorPrecisaConexaoPrevia,
} from '../../lib/ImpressoraBluetoothService';
import { IMPRESSORA_BLUETOOTH_CELULAR_ID, loadReciboTermicoConfigCobrador } from '../../lib/reciboTermicoConfig';
import { labelFormaPagamentoRecibo } from '../../lib/ReciboTermicoService';
import { reservarJanelaImpressaoPdf } from '../../lib/printPdfBlob';
import { formatarDataIsoPtBr } from '../../lib/contratoDatas';

const formatCurrency = (centavos: number) =>
  `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

type Props = {
  empresaIdsFiltro: string[];
  /** Quando definido, lista só recebimentos desse cobrador (perfil cobrador). */
  cobradorIdFiltro?: string | null;
};

export const CobrancasReimprimirReciboTab: React.FC<Props> = ({
  empresaIdsFiltro,
  cobradorIdFiltro,
}) => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [clientes, setClientes] = useState<ClienteBuscaRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState('');
  const [recebimentos, setRecebimentos] = useState<RecebimentoCampoDto[]>([]);
  const [carregandoReceb, setCarregandoReceb] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imprimindo, setImprimindo] = useState(false);

  const totalSelecionado = useMemo(
    () =>
      recebimentos
        .filter((r) => selectedIds.has(r.id))
        .reduce((s, r) => s + r.valor_centavos, 0),
    [recebimentos, selectedIds],
  );

  const handleBuscar = async () => {
    const term = searchTerm.trim();
    if (!term) {
      showToast('Digite nome, CPF ou código do cliente.', 'warning');
      return;
    }
    if (empresaIdsFiltro.length === 0) {
      showToast('Selecione a unidade no topo da tela.', 'warning');
      return;
    }
    setBuscando(true);
    setHasSearched(true);
    setClienteId(null);
    setClienteNome('');
    setRecebimentos([]);
    setSelectedIds(new Set());
    try {
      const rows = await buscarClientesPorTermo(empresaIdsFiltro, term, 40);
      setClientes(rows);
    } catch (e) {
      setClientes([]);
      showToast(e instanceof Error ? e.message : 'Erro na busca.', 'error');
    } finally {
      setBuscando(false);
    }
  };

  const carregarRecebimentos = useCallback(
    async (id: string, nome: string) => {
      setClienteId(id);
      setClienteNome(nome);
      setSelectedIds(new Set());
      setCarregandoReceb(true);
      try {
        const rows = await listarRecebimentosCampoPorCliente(empresaIdsFiltro, {
          cliente_id: id,
          cobrador_id: cobradorIdFiltro || undefined,
          limite: 120,
        });
        setRecebimentos(rows);
        if (rows.length === 0) {
          showToast(
            'Nenhum recebimento em campo encontrado para este cliente. Só aparecem parcelas que você já baixou aqui na carteira.',
            'info',
          );
        }
      } catch (e) {
        setRecebimentos([]);
        showToast(e instanceof Error ? e.message : 'Erro ao carregar recebimentos.', 'error');
      } finally {
        setCarregandoReceb(false);
      }
    },
    [empresaIdsFiltro, cobradorIdFiltro, showToast],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === recebimentos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recebimentos.map((r) => r.id)));
    }
  };

  const imprimir = async (modo: 'termica' | 'pdf') => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      showToast('Selecione ao menos um recebimento.', 'warning');
      return;
    }

    const janelaPdf = modo === 'pdf' ? reservarJanelaImpressaoPdf() : null;
    if (modo === 'pdf' && !janelaPdf) {
      showToast('Permita pop-ups para abrir o PDF.', 'warning');
      return;
    }

    if (modo === 'termica') {
      const cfgCob = loadReciboTermicoConfigCobrador();
      const precisaConectar =
        !cfgCob.impressoraBluetooth?.id || impressoraCobradorPrecisaConexaoPrevia(cfgCob);
      if (precisaConectar) {
        try {
          await garantirConexaoBluetoothAntesDaBaixa();
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Não foi possível conectar à impressora.';
          if (!/cancel|abort/i.test(msg)) showToast(msg, 'warning');
          return;
        }
      }
    }

    setImprimindo(true);
    try {
      const resultado = await reimprimirRecibosRecebimentosCampo(
        ids,
        empresaIdsFiltro,
        modo,
        janelaPdf ?? undefined,
      );
      const msg =
        resultado === 'bluetooth'
          ? 'Recibo enviado para a maquininha.'
          : resultado === 'pdf'
            ? 'Recibo PDF aberto.'
            : 'Recibo aberto para impressão.';
      showToast(msg, 'success');
    } catch (e) {
      if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
      showToast(e instanceof Error ? e.message : 'Falha ao reimprimir.', 'error');
    } finally {
      setImprimindo(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-emerald-50 border-emerald-200 text-sm text-emerald-950">
        <p className="font-semibold flex items-center gap-2">
          <History className="h-4 w-4 shrink-0" />
          Reimprimir recibo de parcelas já pagas
        </p>
        <p className="mt-1 text-emerald-900/90 leading-snug">
          Busque o cliente, marque o(s) recebimento(s) e imprima na{' '}
          <strong>impressora térmica</strong> (Bluetooth) como na baixa em campo.
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-gray-400 absolute top-3 left-3" />
            <Input
              className="pl-9"
              placeholder="Nome, CPF ou código do cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleBuscar();
              }}
            />
          </div>
          <Button type="button" onClick={() => void handleBuscar()} loading={buscando}>
            Buscar
          </Button>
        </div>

        {hasSearched && clientes.length === 0 && !buscando && (
          <p className="text-sm text-gray-500">Nenhum cliente encontrado.</p>
        )}

        {clientes.length > 0 && !clienteId && (
          <ul className="divide-y border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            {clientes.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                  onClick={() => void carregarRecebimentos(c.id, c.nome)}
                >
                  <p className="font-medium text-gray-900">{c.nome}</p>
                  <p className="text-xs text-gray-500">
                    {c.codigo ? `Cód. ${c.codigo}` : ''}
                    {c.cpf ? ` · ${c.cpf}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {clienteId && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cliente</p>
              <p className="font-semibold text-gray-900">{clienteNome}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setClienteId(null);
                setRecebimentos([]);
                setSelectedIds(new Set());
              }}
            >
              Trocar cliente
            </Button>
          </div>

          {carregandoReceb ? (
            <p className="text-sm text-gray-500 py-6 text-center">Carregando recebimentos…</p>
          ) : recebimentos.length === 0 ? (
            <p className="text-sm text-gray-600 py-4">
              Não há recebimentos registrados em campo para este cliente
              {cobradorIdFiltro ? ' na sua carteira' : ''}.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={
                      recebimentos.length > 0 && selectedIds.size === recebimentos.length
                    }
                    onChange={selectAll}
                  />
                  Selecionar todos ({recebimentos.length})
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-sm font-medium text-emerald-700">
                    {selectedIds.size} selecionado(s) · {formatCurrency(totalSelecionado)}
                  </span>
                )}
              </div>

              <ul className="divide-y border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                {recebimentos.map((r) => {
                  const sel = selectedIds.has(r.id);
                  const parcelaLabel =
                    r.parcela_codigo
                    || (r.parcela_numero
                      ? `Parcela ${r.parcela_numero}${r.total_parcelas ? `/${r.total_parcelas}` : ''}`
                      : 'Mensalidade');
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                          sel ? 'bg-emerald-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => toggleSelect(r.id)}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 mt-1 rounded border-gray-300"
                          checked={sel}
                          readOnly
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{parcelaLabel}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Pago em {formatarDataIsoPtBr(r.data)} ·{' '}
                            {labelFormaPagamentoRecibo(r.forma_pagamento) || r.forma_pagamento}
                            {r.cobrador_nome ? ` · ${r.cobrador_nome}` : ''}
                          </p>
                        </div>
                        <span className="font-semibold text-gray-900 shrink-0">
                          {formatCurrency(r.valor_centavos)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  className="flex-1"
                  loading={imprimindo}
                  disabled={selectedIds.size === 0}
                  onClick={() => void imprimir('termica')}
                >
                  <Bluetooth className="h-4 w-4 mr-2 shrink-0" />
                  Imprimir na térmica
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  loading={imprimindo}
                  disabled={selectedIds.size === 0}
                  onClick={() => void imprimir('pdf')}
                >
                  <FileText className="h-4 w-4 mr-2 shrink-0" />
                  Recibo PDF
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                {!loadReciboTermicoConfigCobrador().impressoraBluetooth?.id
                  ? 'Conecte a maquininha no topo antes de imprimir.'
                  : loadReciboTermicoConfigCobrador().impressoraBluetooth?.id === IMPRESSORA_BLUETOOTH_CELULAR_ID
                    ? 'Térmica: escolha a impressora na tela do celular.'
                    : 'Impressora BLE conectada no topo.'}
              </p>
            </>
          )}
        </Card>
      )}
    </div>
  );
};

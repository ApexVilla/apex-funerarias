import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  QrCode,
  Receipt,
} from 'lucide-react';
import type { AssinaturaSB, ClienteSB } from '../../lib/ClienteStore';
import type { ContaReceberDetalhada } from '../../lib/FinanceiroStore';
import { Button, Card, Select } from '../ui/Components';
import { Modal } from '../ui/Modal';
import { ContratoResumoHeader } from './ContratoResumoHeader';
import { formatarDataIsoPtBr, parcelaEstaVencida } from '../../lib/contratoDatas';
import {
  dispararEmissaoBoletoEdge,
  listarBoletosPorAssinatura,
  solicitarEmissaoBoleto,
  type BoletoIntegracaoRow,
} from '../../lib/BoletoIntegrationService';
import { montarLinkPagamentoInterno, montarUrlQrCode } from '../../lib/linkPagamentoCliente';
import {
  buscarChavePixEmpresa,
  formatarCnpjExibicao,
  montarPixCopiaColaEstatico,
} from '../../lib/pixCobrancaCliente';
import { useToast } from '../../lib/ToastStore';

type Props = {
  cliente: ClienteSB;
  assinaturas: AssinaturaSB[];
  assinaturaId: string;
  onAssinaturaIdChange: (id: string) => void;
  mensalidades: ContaReceberDetalhada[];
  empresaNome?: string;
};

function labelStatusBoleto(status: string) {
  const map: Record<string, string> = {
    pendente_envio: 'Enviando…',
    emitido: 'Emitido',
    erro_emissao: 'Erro',
    cancelado: 'Cancelado',
    baixado: 'Baixado',
  };
  return map[status] || status;
}

export const ContratoCobrancaView: React.FC<Props> = ({
  cliente,
  assinaturas,
  assinaturaId,
  onAssinaturaIdChange,
  mensalidades,
  empresaNome,
}) => {
  const { showToast } = useToast();
  const [boletos, setBoletos] = useState<BoletoIntegracaoRow[]>([]);
  const [loadingBoletos, setLoadingBoletos] = useState(false);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [parcelaSelecionadaId, setParcelaSelecionadaId] = useState<string | null>(null);
  const [chavePix, setChavePix] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  const assinatura =
    assinaturaId === 'todos'
      ? assinaturas.find((a) => (a.status || '').toLowerCase() === 'ativo') || assinaturas[0] || null
      : assinaturas.find((a) => a.id === assinaturaId) || null;

  const parcelasContrato = useMemo(() => {
    if (!assinatura) return [];
    return mensalidades
      .filter((m) => m.assinatura_id === assinatura.id)
      .sort((a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime());
  }, [mensalidades, assinatura]);

  const parcelasCobraveis = useMemo(
    () =>
      parcelasContrato.filter((m) => {
        const s = (m.status || '').toLowerCase();
        return ['aberto', 'pendente', 'vencido', 'pago_parcial'].includes(s);
      }),
    [parcelasContrato],
  );

  const parcelaSel =
    parcelasCobraveis.find((p) => p.id === parcelaSelecionadaId) || parcelasCobraveis[0] || null;

  const carregarBoletos = useCallback(async () => {
    if (!assinatura?.id) {
      setBoletos([]);
      return;
    }
    setLoadingBoletos(true);
    try {
      const rows = await listarBoletosPorAssinatura(assinatura.id);
      setBoletos(rows);
    } catch (e) {
      console.warn(e);
      setBoletos([]);
    } finally {
      setLoadingBoletos(false);
    }
  }, [assinatura?.id]);

  useEffect(() => {
    void carregarBoletos();
  }, [carregarBoletos]);

  useEffect(() => {
    if (!cliente.empresa_id) return;
    void buscarChavePixEmpresa(cliente.empresa_id).then(setChavePix);
  }, [cliente.empresa_id]);

  useEffect(() => {
    if (parcelaSel?.id) setParcelaSelecionadaId(parcelaSel.id);
  }, [parcelaSel?.id, assinatura?.id]);

  const valorParcelaReais = parcelaSel
    ? (parcelaSel.valor_total_centavos || parcelaSel.valor_original_centavos || 0) / 100
    : 0;

  const linkPagamento = parcelaSel
    ? montarLinkPagamentoInterno({
        clienteNome: cliente.nome,
        parcelaId: parcelaSel.id,
        clienteId: cliente.id,
      })
    : '';

  const pixCopiaCola =
    chavePix && parcelaSel
      ? montarPixCopiaColaEstatico({
          chavePix,
          valorReais: valorParcelaReais,
          nomeBeneficiario: empresaNome || 'Fênix Funerária',
          identificador: parcelaSel.codigo || parcelaSel.id.slice(0, 8),
        })
      : '';

  const copiar = async (texto: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      showToast(msg, 'success');
    } catch {
      showToast('Não foi possível copiar.', 'error');
    }
  };

  const emitirBoleto = async () => {
    if (!assinatura || !parcelaSel) {
      showToast('Selecione um contrato e uma parcela em aberto.', 'warning');
      return;
    }
    setProcessandoId(parcelaSel.id);
    try {
      const row = await solicitarEmissaoBoleto({
        empresaId: cliente.empresa_id,
        assinaturaId: assinatura.id,
        mensalidadeId: parcelaSel.id,
        valorCentavos: parcelaSel.valor_total_centavos || parcelaSel.valor_original_centavos || 0,
        vencimento: parcelaSel.data_vencimento,
        payloadEnvio: { origem: 'cliente_perfil_cobranca' },
      });
      await dispararEmissaoBoletoEdge({
        boletoIntegracaoId: row.id,
        mensalidadeId: parcelaSel.id,
        assinaturaId: assinatura.id,
        cliente: {
          nome: cliente.nome,
          documento: cliente.cpf,
          email: cliente.email,
          telefone: cliente.telefone_principal || cliente.celular,
        },
        cobranca: {
          valorCentavos: row.valor_centavos,
          vencimento: row.vencimento,
          descricao: parcelaSel.descricao || `Parcela ${parcelaSel.codigo || ''}`,
        },
      });
      showToast('Solicitação de boleto enviada.', 'success');
      await carregarBoletos();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Falha ao emitir boleto.', 'error');
    } finally {
      setProcessandoId(null);
    }
  };

  const boletoDaParcela = (mensalidadeId: string) =>
    boletos.find((b) => b.mensalidade_id === mensalidadeId);

  return (
    <div className="space-y-4">
      {assinaturas.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase text-slate-500">Contrato</label>
          <Select
            value={assinaturaId}
            onChange={(e) => onAssinaturaIdChange(e.target.value)}
            className="h-9 w-full max-w-md text-xs font-semibold"
          >
            <option value="todos">Contrato ativo / principal</option>
            {assinaturas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo || a.id.slice(0, 8)} — {a.plano_nome || 'Plano'}
              </option>
            ))}
          </Select>
        </div>
      )}

      <ContratoResumoHeader cliente={cliente} assinatura={assinatura} />

      <div className="border-b border-slate-200 pb-3">
        <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">Cobrança</h2>
        <p className="text-xs text-slate-600 mt-0.5">
          Boleto, link de pagamento e QR Code PIX para as parcelas do contrato.
        </p>
      </div>

      {chavePix && (
        <Card className="p-4 border-emerald-200 bg-emerald-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                PIX da empresa — {empresaNome || 'Fênix Funerária'}
              </p>
              <p className="text-lg font-mono font-black text-emerald-950 mt-1">{formatarCnpjExibicao(chavePix)}</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">Tipo: CNPJ · chave {chavePix}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 bg-white text-emerald-800"
              onClick={() => void copiar(chavePix, 'Chave PIX copiada.')}
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Copiar chave PIX
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 bg-white border border-slate-200 rounded-lg p-3">
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700"
          disabled={!parcelaSel || !!processandoId}
          onClick={() => void emitirBoleto()}
        >
          {processandoId ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-1.5" />
          )}
          Emitir boleto
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!linkPagamento}
          onClick={() => void copiar(linkPagamento, 'Link de pagamento copiado.')}
        >
          <Link2 className="h-4 w-4 mr-1.5" />
          Copiar link de pagamento
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!linkPagamento}
          onClick={() => window.open(linkPagamento, '_blank', 'noopener')}
        >
          <ExternalLink className="h-4 w-4 mr-1.5" />
          Abrir link
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!chavePix || !parcelaSel}
          onClick={() => setQrModalOpen(true)}
        >
          <QrCode className="h-4 w-4 mr-1.5" />
          Gerar QR Code PIX
        </Button>
        {parcelaSel?.url_boleto || boletoDaParcela(parcelaSel?.id || '')?.url_boleto ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const url =
                boletoDaParcela(parcelaSel!.id)?.url_boleto || (parcelaSel as { url_boleto?: string })?.url_boleto;
              if (url) window.open(url, '_blank', 'noopener');
            }}
          >
            <Banknote className="h-4 w-4 mr-1.5" />
            Abrir boleto
          </Button>
        ) : null}
      </div>

      <Modal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="Pagamento via PIX"
        size="md"
      >
        {parcelaSel && pixCopiaCola ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>
                <strong>Cliente:</strong> {cliente.nome}
              </p>
              <p>
                <strong>Parcela:</strong> {parcelaSel.codigo || parcelaSel.id.slice(0, 8)}
              </p>
              <p>
                <strong>Valor:</strong> R$ {valorParcelaReais.toFixed(2)}
              </p>
              <p>
                <strong>Vencimento:</strong> {formatarDataIsoPtBr(parcelaSel.data_vencimento)}
              </p>
            </div>

            <div className="flex justify-center">
              <img
                src={montarUrlQrCode(pixCopiaCola, 240)}
                alt="QR Code PIX"
                className="rounded-lg border border-slate-200 bg-white p-2"
                width={240}
                height={240}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-slate-500">PIX copia e cola</p>
              <pre className="text-[11px] bg-slate-50 border rounded-lg p-3 whitespace-pre-wrap break-all text-slate-800 max-h-28 overflow-auto">
                {pixCopiaCola}
              </pre>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copiar(pixCopiaCola, 'PIX copiado.')}
                >
                  <Copy className="h-4 w-4 mr-1.5" />
                  Copiar PIX
                </Button>
                <Button size="sm" onClick={() => setQrModalOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Não foi possível gerar o QR Code. Verifique se a parcela e a chave PIX estão disponíveis.
          </p>
        )}
      </Modal>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold uppercase text-slate-500">Parcela para cobrança</label>
        <Select
          value={parcelaSelecionadaId || ''}
          onChange={(e) => setParcelaSelecionadaId(e.target.value)}
          className="h-9 min-w-[280px] text-xs"
        >
          {parcelasCobraveis.length === 0 ? (
            <option value="">Nenhuma parcela em aberto</option>
          ) : (
            parcelasCobraveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo || p.id.slice(0, 8)} — venc. {formatarDataIsoPtBr(p.data_vencimento)} — R${' '}
                {((p.valor_total_centavos || 0) / 100).toFixed(2)}
              </option>
            ))
          )}
        </Select>
      </div>

      <Card className="p-0 overflow-hidden border-slate-300 shadow-md">
        <div className="px-4 py-2 bg-slate-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Parcelas e boletos
          {loadingBoletos ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-2" /> : null}
        </div>
        <div className="overflow-x-auto max-h-[min(480px,55vh)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-800 text-white uppercase text-[10px] font-black">
              <tr>
                <th className="px-3 py-2 text-left">Parcela</th>
                <th className="px-3 py-2 text-left">Vencimento</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-left">Situação</th>
                <th className="px-3 py-2 text-left">Boleto</th>
                <th className="px-3 py-2 text-left">Nosso número</th>
              </tr>
            </thead>
            <tbody>
              {parcelasContrato.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Nenhuma parcela para este contrato.
                  </td>
                </tr>
              ) : (
                parcelasContrato.map((p, i) => {
                  const bol = boletoDaParcela(p.id);
                  const vencida = parcelaEstaVencida(p.data_vencimento, p.status);
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-slate-100 cursor-pointer ${
                        parcelaSelecionadaId === p.id ? 'bg-indigo-50' : i % 2 ? 'bg-slate-50' : 'bg-white'
                      }`}
                      onClick={() => setParcelaSelecionadaId(p.id)}
                    >
                      <td className="px-3 py-2 font-semibold">{p.codigo || '—'}</td>
                      <td className="px-3 py-2">{formatarDataIsoPtBr(p.data_vencimento)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        R$ {((p.valor_total_centavos || 0) / 100).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            p.status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : vencida
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.status || 'aberto'}
                        </span>
                      </td>
                      <td className="px-3 py-2">{bol ? labelStatusBoleto(bol.status) : '—'}</td>
                      <td className="px-3 py-2 font-mono text-[10px]">{bol?.nosso_numero || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

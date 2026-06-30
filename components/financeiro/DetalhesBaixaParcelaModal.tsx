import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Calendar,
  Landmark,
  CreditCard,
  MapPin,
  Clock,
  Loader2,
  AlertCircle,
  Truck,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Components';
import { formatCentavos } from '../../lib/FinanceiroStore';
import {
  carregarDetalhesBaixaParcela,
  type DetalheBaixaParcela,
  type ResumoDetalhesBaixaParcela,
} from '../../lib/baixaParcelaDetalhes';

interface DetalhesBaixaParcelaModalProps {
  contaReceberId: string;
  parcelaCodigo?: string | null;
  onClose: () => void;
}

const fmtData = (iso?: string | null) => {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const fmtDataHora = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
};

const InfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900 mt-0.5 break-words">{value || '—'}</p>
    </div>
  </div>
);

const BaixaCard: React.FC<{ baixa: DetalheBaixaParcela; indice: number }> = ({ baixa, indice }) => (
  <div
    className={`rounded-xl border p-4 space-y-1 ${
      baixa.estornada
        ? 'bg-amber-50/60 border-amber-200'
        : 'bg-emerald-50/40 border-emerald-100'
    }`}
  >
    <div className="flex items-center justify-between gap-2 mb-3">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
        Baixa {indice + 1}
        {baixa.estornada && (
          <span className="ml-2 text-amber-700">(estornada)</span>
        )}
      </span>
      <span className="font-mono font-black text-emerald-800">
        {formatCentavos(baixa.valorPagoCentavos)}
      </span>
    </div>

    <InfoRow
      icon={<User className="h-4 w-4" />}
      label="Quem baixou"
      value={baixa.operadorNome}
    />
    <InfoRow
      icon={<Clock className="h-4 w-4" />}
      label="Registrado em"
      value={fmtDataHora(baixa.registradoEm)}
    />
    <InfoRow
      icon={<Calendar className="h-4 w-4" />}
      label="Data do pagamento"
      value={fmtData(baixa.dataPagamento || baixa.dataBaixa)}
    />
    <InfoRow
      icon={<Landmark className="h-4 w-4" />}
      label="Onde (caixa / conta)"
      value={
        baixa.contaNome
          ? `${baixa.contaNome}${baixa.contaTipo ? ` · ${baixa.contaTipo}` : ''}`
          : null
      }
    />
    <InfoRow
      icon={<CreditCard className="h-4 w-4" />}
      label="Forma de pagamento"
      value={baixa.formaPagamentoNome}
    />
    {baixa.pixNomePagador && (
      <InfoRow
        icon={<User className="h-4 w-4" />}
        label="Pagador PIX"
        value={baixa.pixNomePagador}
      />
    )}
    {baixa.observacoes && (
      <InfoRow
        icon={<AlertCircle className="h-4 w-4" />}
        label="Observações"
        value={baixa.observacoes}
      />
    )}
    {baixa.estornada && (
      <>
        <InfoRow
          icon={<User className="h-4 w-4" />}
          label="Estornado por"
          value={baixa.estornadaPorNome}
        />
        <InfoRow
          icon={<Clock className="h-4 w-4" />}
          label="Estornado em"
          value={fmtDataHora(baixa.estornadaEm)}
        />
        {baixa.motivoEstorno && (
          <InfoRow
            icon={<AlertCircle className="h-4 w-4" />}
            label="Motivo do estorno"
            value={baixa.motivoEstorno}
          />
        )}
      </>
    )}
  </div>
);

export const DetalhesBaixaParcelaModal: React.FC<DetalhesBaixaParcelaModalProps> = ({
  contaReceberId,
  parcelaCodigo,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<ResumoDetalhesBaixaParcela | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void carregarDetalhesBaixaParcela(contaReceberId).then((res) => {
      if (!cancelled) {
        setDados(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [contaReceberId]);

  const codigo = parcelaCodigo || dados?.parcelaCodigo || '—';
  const baixasAtivas = (dados?.baixas || []).filter((b) => !b.estornada);
  const baixasExibir = baixasAtivas.length ? baixasAtivas : dados?.baixas || [];

  return (
    <Modal isOpen onClose={onClose} title="Detalhes da baixa">
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Parcela</p>
          <p className="font-mono font-bold text-slate-900">{codigo}</p>
          {dados?.parcelaDescricao && (
            <p className="text-xs text-slate-600 mt-1">{dados.parcelaDescricao}</p>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Carregando informações da baixa…</span>
          </div>
        ) : baixasExibir.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            Nenhuma baixa registrada para esta parcela.
          </div>
        ) : (
          <div className="space-y-3">
            {dados?.filialNome && (
              <InfoRow
                icon={<MapPin className="h-4 w-4" />}
                label="Unidade / filial do título"
                value={dados.filialNome}
              />
            )}
            {baixasExibir.map((b, idx) => (
              <BaixaCard key={b.id} baixa={b} indice={idx} />
            ))}
          </div>
        )}

        {!loading && dados?.recebimentoCampo && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-2 flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" />
              Recebimento em campo
            </p>
            <InfoRow
              icon={<User className="h-4 w-4" />}
              label="Cobrador"
              value={dados.recebimentoCampo.cobradorNome}
            />
            <InfoRow
              icon={<Calendar className="h-4 w-4" />}
              label="Data na rua"
              value={fmtData(dados.recebimentoCampo.data)}
            />
            {dados.recebimentoCampo.formaPagamento && (
              <InfoRow
                icon={<CreditCard className="h-4 w-4" />}
                label="Forma"
                value={dados.recebimentoCampo.formaPagamento}
              />
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
};

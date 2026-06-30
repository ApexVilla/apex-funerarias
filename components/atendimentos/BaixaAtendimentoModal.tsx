import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, AlertCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button, Input, Select } from '../ui/Components';
import { useFinanceiro } from '../../lib/FinanceiroStore';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import {
  darBaixaAtendimento,
  type AtendimentoBaixaRow,
  type PagamentoAtendimento,
} from '../../lib/atendimentoBaixaService';
import { dataHojeIsoLocal } from '../../lib/contratoDatas';

const FORMAS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_credito', label: 'Cartão crédito' },
  { value: 'cartao_debito', label: 'Cartão débito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outro', label: 'Outro' },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  atendimento: AtendimentoBaixaRow | null;
  onSuccess: () => void;
};

export const BaixaAtendimentoModal: React.FC<Props> = ({ isOpen, onClose, atendimento, onSuccess }) => {
  const { contasBancarias, loadContasBancarias } = useFinanceiro();
  const { user, empresa } = useAuth();
  const { showToast } = useToast();

  const [contaId, setContaId] = useState('');
  const [dataPagamento, setDataPagamento] = useState(dataHojeIsoLocal());
  const [pagamentos, setPagamentos] = useState<PagamentoAtendimento[]>([]);
  const [saving, setSaving] = useState(false);

  const fmt = (c: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100);

  const contasAtivas = useMemo(
    () => (contasBancarias || []).filter((c) => c.ativo),
    [contasBancarias],
  );

  useEffect(() => {
    if (!isOpen) return;
    void loadContasBancarias();
  }, [isOpen, loadContasBancarias]);

  useEffect(() => {
    if (!isOpen || !atendimento) return;
    setDataPagamento(dataHojeIsoLocal());
    const inicial =
      Array.isArray(atendimento.pagamentos_divididos) && atendimento.pagamentos_divididos.length > 0
        ? atendimento.pagamentos_divididos.map((p) => ({
            forma: p.forma || 'dinheiro',
            valor_centavos: Number(p.valor_centavos || 0),
          }))
        : [{ forma: 'dinheiro', valor_centavos: Number(atendimento.valor_total_centavos || 0) }];
    setPagamentos(inicial);
    const principal = contasAtivas.find((c) => c.principal) || contasAtivas[0];
    setContaId(principal?.id || '');
  }, [isOpen, atendimento, contasAtivas]);

  const totalInformado = pagamentos.reduce((s, p) => s + Number(p.valor_centavos || 0), 0);
  const totalAtendimento = Number(atendimento?.valor_total_centavos || 0);
  const totaisOk = totalInformado === totalAtendimento;

  const parseMoeda = (v: string) => {
    const n = Number(String(v || '').replace(/\./g, '').replace(',', '.').trim());
    if (Number.isNaN(n) || n < 0) return 0;
    return Math.round(n * 100);
  };

  const confirmar = async () => {
    if (!atendimento) return;
    if (!contaId) {
      showToast('Selecione o caixa/conta de destino.', 'warning');
      return;
    }
    if (!totaisOk) {
      showToast('A soma das formas deve ser igual ao total do atendimento.', 'warning');
      return;
    }
    setSaving(true);
    const res = await darBaixaAtendimento({
      atendimentoId: atendimento.id,
      empresaId: atendimento.empresa_id || empresa?.id || '',
      userId: user?.id || '',
      contaBancariaId: contaId,
      dataPagamento,
      pagamentos,
    });
    setSaving(false);
    if (res.ok === false) {
      showToast(res.error, 'error');
      return;
    }
    showToast('Baixa registrada no caixa e atendimento concluído.', 'success');
    onSuccess();
    onClose();
  };

  if (!atendimento) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dar baixa — recebimento no caixa" size="lg">
      <div className="p-6 space-y-5">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm">
          <p className="font-semibold text-blue-900">{atendimento.codigo}</p>
          <p className="text-blue-800 mt-1">
            Total a receber: <strong>{fmt(totalAtendimento)}</strong>
          </p>
          {atendimento.os_aprovada ? (
            <p className="text-xs text-emerald-700 mt-2">OS aprovada — pronto para registrar no caixa.</p>
          ) : (
            <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              A OS precisa estar aprovada antes da baixa.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="Caixa / conta de destino *" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            <option value="">Selecione…</option>
            {contasAtivas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({c.tipo})
              </option>
            ))}
          </Select>
          <Input
            label="Data do recebimento *"
            type="date"
            value={dataPagamento}
            onChange={(e) => setDataPagamento(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-800">Formas de pagamento</p>
          {pagamentos.map((pg, idx) => (
            <div key={`pg-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-5">
                <Select
                  label={idx === 0 ? 'Forma' : undefined}
                  value={pg.forma}
                  onChange={(e) =>
                    setPagamentos((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, forma: e.target.value } : p)),
                    )
                  }
                >
                  {FORMAS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-5">
                <Input
                  label={idx === 0 ? 'Valor (R$)' : undefined}
                  value={(pg.valor_centavos / 100).toFixed(2).replace('.', ',')}
                  onChange={(e) => {
                    const cents = parseMoeda(e.target.value);
                    setPagamentos((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, valor_centavos: cents } : p)),
                    );
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={pagamentos.length === 1}
                  onClick={() => setPagamentos((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remover
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setPagamentos((prev) => [
                ...prev,
                { forma: 'dinheiro', valor_centavos: Math.max(0, totalAtendimento - totalInformado) },
              ])
            }
          >
            Adicionar forma
          </Button>
        </div>

        <div
          className={`rounded-lg border p-3 text-sm flex justify-between ${
            totaisOk ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span>Total informado</span>
          <strong>{fmt(totalInformado)}</strong>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            loading={saving}
            disabled={!atendimento.os_aprovada || !totaisOk}
          >
            <Wallet className="h-4 w-4 mr-2" />
            Confirmar baixa no caixa
          </Button>
        </div>
      </div>
    </Modal>
  );
};

import React from 'react';
import {
  X,
  DollarSign,
  Printer,
  RotateCcw,
  Eye,
  Calendar,
} from 'lucide-react';
import { Button, Badge } from '../ui/Components';
import { ContaReceberDetalhada } from '../../lib/FinanceiroStore';
import { parcelaEstaVencida } from '../../lib/contratoDatas';
import { StatusBadge } from '../common/StatusBadge';

const formatMoney = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const podeReceber = (status?: string) => {
  const s = (status || '').toLowerCase();
  return ['aberto', 'vencido', 'pago_parcial', 'pendente'].includes(s);
};

interface ParcelaClienteAcoesModalProps {
  parcela: ContaReceberDetalhada;
  clienteNome?: string;
  onClose: () => void;
  onReceber: () => void;
  onVerDetalhes: () => void;
  onImprimirRecibo?: () => void;
  onEstornar?: () => void;
}

export const ParcelaClienteAcoesModal: React.FC<ParcelaClienteAcoesModalProps> = ({
  parcela,
  clienteNome,
  onClose,
  onReceber,
  onVerDetalhes,
  onImprimirRecibo,
  onEstornar,
}) => {
  const vencida = parcelaEstaVencida(parcela.data_vencimento, parcela.status);
  const recebivel = podeReceber(parcela.status);
  const paga = (parcela.status || '').toLowerCase() === 'pago';
  const mesRef = parcela.data_competencia
    ? new Date(parcela.data_competencia).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b bg-gradient-to-r from-indigo-50 to-white">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">
              Parcela selecionada
            </p>
            <h3 className="font-bold text-gray-900 truncate">
              {parcela.codigo || 'Sem código'}
            </h3>
            {clienteNome && (
              <p className="text-sm text-gray-600 truncate mt-0.5">{clienteNome}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors shrink-0"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 p-3 border">
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Vencimento</p>
              <p className="font-bold text-gray-900 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                {new Date(parcela.data_vencimento).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 border">
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Valor</p>
              <p className="font-black text-gray-900">
                {formatMoney(parcela.valor_total_centavos || parcela.valor_original_centavos || 0)}
              </p>
            </div>
            {mesRef && (
              <div className="rounded-xl bg-gray-50 p-3 border col-span-2">
                <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Competência</p>
                <p className="font-medium text-gray-800 capitalize">{mesRef}</p>
              </div>
            )}
            <div className="rounded-xl bg-gray-50 p-3 border col-span-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Status</p>
                {vencida ? <Badge variant="danger">Vencida</Badge> : <StatusBadge status={parcela.status} />}
              </div>
              {parcela.plano_nome && (
                <div className="text-right min-w-0">
                  <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Plano</p>
                  <p className="text-xs font-semibold text-indigo-700 truncate">{parcela.plano_nome}</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            Ações disponíveis
          </p>

          <div className="space-y-2">
            {recebivel && (
              <button
                type="button"
                onClick={() => { onReceber(); onClose(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50 text-gray-800 border border-emerald-100 transition-colors group"
              >
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full group-hover:bg-emerald-200">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-emerald-800">Dar baixa / Receber</p>
                  <p className="text-xs text-gray-500">Registrar pagamento da parcela</p>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => { onVerDetalhes(); onClose(); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 text-gray-800 border border-transparent hover:border-blue-100 transition-colors group"
            >
              <div className="p-2 bg-blue-100 text-blue-600 rounded-full group-hover:bg-blue-200">
                <Eye className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-semibold">Ver / editar título</p>
                <p className="text-xs text-gray-500">Detalhes completos e formas de pagamento</p>
              </div>
            </button>

            {paga && onImprimirRecibo && (
              <button
                type="button"
                onClick={() => { onImprimirRecibo(); onClose(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 text-gray-800 border border-transparent hover:border-indigo-100 transition-colors group"
              >
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-full group-hover:bg-indigo-200">
                  <Printer className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="font-semibold">Reimprimir recibo</p>
                  <p className="text-xs text-gray-500">Gerar PDF do comprovante</p>
                </div>
              </button>
            )}

            {paga && onEstornar && (
              <button
                type="button"
                onClick={() => { onEstornar(); onClose(); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-amber-50 text-gray-800 border border-amber-100 transition-colors group"
              >
                <div className="p-2 bg-amber-100 text-amber-600 rounded-full group-hover:bg-amber-200">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-amber-800">Estornar baixa</p>
                  <p className="text-xs text-gray-500">Reverter o pagamento registrado</p>
                </div>
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pb-5">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
};

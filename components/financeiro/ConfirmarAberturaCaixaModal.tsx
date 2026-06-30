import React from 'react';
import { AlertTriangle, Wallet } from 'lucide-react';
import { Button } from '../ui/Components';

interface ConfirmarAberturaCaixaModalProps {
  isOpen: boolean;
  caixaNome: string;
  valorFormatado: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export const ConfirmarAberturaCaixaModal: React.FC<ConfirmarAberturaCaixaModalProps> = ({
  isOpen,
  caixaNome,
  valorFormatado,
  onCancel,
  onConfirm,
  loading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Dia encerrado</h3>
              <p className="text-xs text-gray-600">Confirme para abrir o dia e concluir a baixa</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm text-gray-700">
          <p>
            O dia de movimentação em <span className="font-semibold">"{caixaNome}"</span> está encerrado.
          </p>
          <div className="rounded-lg border bg-gray-50 px-3 py-2 flex items-center justify-between">
            <span className="text-gray-500">Valor da operação</span>
            <span className="font-semibold text-gray-900">{valorFormatado}</span>
          </div>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" />
            Ao confirmar, o sistema abre o dia automaticamente e segue com o lançamento.
          </p>
        </div>

        <div className="p-5 border-t bg-gray-50 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} loading={loading}>
            Confirmar e abrir o dia
          </Button>
        </div>
      </div>
    </div>
  );
};


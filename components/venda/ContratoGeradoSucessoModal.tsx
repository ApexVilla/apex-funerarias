import React, { useState } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Components';
import { imprimirContratoAssinatura } from '../../lib/ContratoAssinaturaService';

export type ContratoGeradoSucessoInfo = {
  codigoContrato: string;
  assinaturaId?: string;
  dependentesIncluidos?: number;
  propostaSequencial?: number;
};

type Props = {
  info: ContratoGeradoSucessoInfo | null;
  onClose: () => void;
  onToast?: (msg: string, tipo: 'success' | 'error' | 'warning') => void;
};

export const ContratoGeradoSucessoModal: React.FC<Props> = ({ info, onClose, onToast }) => {
  const [imprimindo, setImprimindo] = useState(false);

  const handleImprimir = async () => {
    if (!info?.assinaturaId) {
      onToast?.('Contrato sem vínculo para impressão. Abra o cadastro do cliente.', 'warning');
      return;
    }
    setImprimindo(true);
    try {
      const r = await imprimirContratoAssinatura(info.assinaturaId);
      if (!r.ok) {
        onToast?.(r.error || 'Não foi possível imprimir o contrato.', 'error');
        return;
      }
      onToast?.('Abrindo contrato para impressão…', 'success');
    } finally {
      setImprimindo(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(info)}
      onClose={onClose}
      title="Contrato gerado"
      size="sm"
    >
      {info && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 text-sm text-emerald-950 leading-relaxed">
              {info.propostaSequencial != null && (
                <p className="text-emerald-800/90 mb-1">
                  Proposta nº {String(info.propostaSequencial).padStart(3, '0')}
                </p>
              )}
              <p>
                O contrato <strong className="font-mono">{info.codigoContrato}</strong> foi criado no
                sistema com sucesso.
              </p>
              {info.dependentesIncluidos != null && info.dependentesIncluidos > 0 && (
                <p className="mt-2 text-emerald-800">
                  {info.dependentesIncluidos} dependente(s) vinculado(s) ao contrato.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
            {info.assinaturaId && (
              <Button
                type="button"
                loading={imprimindo}
                onClick={() => void handleImprimir()}
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Imprimir contrato
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

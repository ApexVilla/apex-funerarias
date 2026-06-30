import React, { useState, useEffect } from 'react';
import { Truck, Calendar, User, UserCheck, AlertCircle, FileText } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button, Input, Textarea } from '../ui/Components';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/ToastStore';
import type { AssinaturaSB } from '../../lib/ClienteStore';
import { formatarDataIsoPtBr } from '../../lib/contratoDatas';

interface GerenciarEntregaContratoModalProps {
  isOpen: boolean;
  onClose: () => void;
  contrato: AssinaturaSB;
  onSuccess: () => void;
}

export const GerenciarEntregaContratoModal: React.FC<GerenciarEntregaContratoModalProps> = ({
  isOpen,
  onClose,
  contrato,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [salvando, setSalvando] = useState(false);

  // States
  const [entregaEntregador, setEntregaEntregador] = useState('');
  const [entregaDataSaida, setEntregaDataSaida] = useState('');
  const [entregaDataRetorno, setEntregaDataRetorno] = useState('');
  const [entregaPara, setEntregaPara] = useState('');
  const [entregaRecebedor, setEntregaRecebedor] = useState('');
  const [entregaData, setEntregaData] = useState('');
  const [entregaObs, setEntregaObs] = useState('');

  // Load existing values when modal opens
  useEffect(() => {
    if (contrato) {
      setEntregaEntregador(contrato.entrega_entregador || '');
      setEntregaDataSaida(contrato.entrega_data_saida || '');
      setEntregaDataRetorno(contrato.entrega_data_retorno || '');
      setEntregaPara(contrato.entrega_para || '');
      setEntregaRecebedor(contrato.entrega_recebedor || '');
      setEntregaData(contrato.entrega_data || '');
      setEntregaObs(contrato.entrega_obs || '');
    }
  }, [contrato, isOpen]);

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const { error: err } = await supabase
        .from('assinaturas')
        .update({
          entrega_entregador: entregaEntregador || null,
          entrega_data_saida: entregaDataSaida || null,
          entrega_data_retorno: entregaDataRetorno || null,
          entrega_para: entregaPara || null,
          entrega_recebedor: entregaRecebedor || null,
          entrega_data: entregaData || null,
          entrega_obs: entregaObs || null,
        })
        .eq('id', contrato.id);

      if (err) throw err;

      // Registrar auditoria
      const descAuditoria = [
        entregaDataSaida ? `Saída: ${formatarDataIsoPtBr(entregaDataSaida)}` : null,
        entregaEntregador ? `Entregador: ${entregaEntregador}` : null,
        entregaData ? `Entregue em: ${formatarDataIsoPtBr(entregaData)}` : null,
        entregaPara ? `Entregue para: ${entregaPara}` : null,
        entregaDataRetorno ? `Retorno: ${formatarDataIsoPtBr(entregaDataRetorno)}` : null,
      ].filter(Boolean).join(' | ');

      await supabase.from('timeline_clientes').insert({
        empresa_id: contrato.empresa_id,
        cliente_id: contrato.cliente_id,
        tipo_evento: 'AUDITORIA',
        categoria: 'contrato',
        titulo: `Entrega de contrato atualizada: ${contrato.codigo || contrato.id.slice(0, 8)}`,
        descricao: descAuditoria || 'Alteração das informações de entrega do contrato.',
        referencia_tipo: 'assinatura',
        referencia_id: contrato.id,
      });

      showToast('Entrega do contrato atualizada com sucesso!', 'success');
      onSuccess();
    } catch (error: any) {
      console.error('[GerenciarEntregaContratoModal] erro ao atualizar entrega:', error);
      showToast(error.message || 'Erro ao atualizar informações de entrega.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rastreamento de Entrega do Contrato"
    >
      <form onSubmit={handleSalvar} className="space-y-6">
        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 border border-indigo-100 dark:border-indigo-900/40 rounded-xl space-y-1">
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Contrato Selecionado</p>
          <h4 className="text-sm font-black text-indigo-900 dark:text-indigo-200">
            {contrato.plano_nome} · Código: {contrato.codigo || contrato.id.slice(0, 8)}
          </h4>
        </div>

        <div className="space-y-4">
          {/* Seção 1: Envio para Entrega */}
          <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border rounded-xl space-y-4">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
              <Truck className="h-4 w-4 text-slate-500" />
              1. Envio para Entrega (Saída)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Quem foi entregar (Entregador/Cobrador)"
                type="text"
                placeholder="Ex: Carlos Santos"
                value={entregaEntregador}
                onChange={(e) => setEntregaEntregador(e.target.value)}
              />
              <Input
                label="Data de Saída"
                type="date"
                value={entregaDataSaida}
                onChange={(e) => setEntregaDataSaida(e.target.value)}
              />
            </div>
          </div>

          {/* Seção 2: Confirmação de Entrega */}
          <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border rounded-xl space-y-4">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
              <UserCheck className="h-4 w-4 text-emerald-500" />
              2. Confirmação de Entrega (Retorno)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Para quem foi entregue (Final)"
                type="text"
                placeholder="Ex: Maria (Titular)"
                value={entregaPara}
                onChange={(e) => setEntregaPara(e.target.value)}
              />
              <Input
                label="Quem recebeu (Assinatura/Parentesco)"
                type="text"
                placeholder="Ex: José (Filho)"
                value={entregaRecebedor}
                onChange={(e) => setEntregaRecebedor(e.target.value)}
              />
              <Input
                label="Data da Entrega"
                type="date"
                value={entregaData}
                onChange={(e) => setEntregaData(e.target.value)}
              />
              <Input
                label="Data de Retorno do Contrato"
                type="date"
                value={entregaDataRetorno}
                onChange={(e) => setEntregaDataRetorno(e.target.value)}
              />
            </div>
          </div>

          {/* Seção 3: Observações */}
          <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border rounded-xl space-y-3">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
              <FileText className="h-4 w-4 text-slate-500" />
              3. Observações Gerais
            </div>
            <Textarea
              placeholder="Descreva detalhes como: cliente não estava em casa, entregue no vizinho, observação de assinatura..."
              value={entregaObs}
              onChange={(e) => setEntregaObs(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="success"
            loading={salvando}
          >
            Salvar Rastreamento
          </Button>
        </div>
      </form>
    </Modal>
  );
};

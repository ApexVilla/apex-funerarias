import { useState } from 'react';
import {
  mensagemErroDesconhecido,
  montarPdfCaixaBlob,
  type CaixaPdfSnapshot,
} from './caixaRelatorioPdf';
import { abrirPdfNaJanelaReservada } from './printPdfBlob';

export type ImprimirCaixaOptions = {
  /** Dados da sessão já carregados na Tesouraria (obrigatório — sem PHP/backend). */
  snapshot: CaixaPdfSnapshot;
};

/**
 * PDF do caixa — somente no navegador (jsPDF + dados da tela).
 * Não usa backend PHP nem serviço Python.
 */
export function usePrintCaixa() {
  const [loading, setLoading] = useState(false);

  async function imprimirCaixa(
    caixaId: string,
    _empresaId?: string,
    opts?: ImprimirCaixaOptions,
  ) {
    if (!caixaId?.trim()) {
      alert('Erro: ID do caixa inválido.');
      return;
    }
    if (!opts?.snapshot) {
      alert(
        'Abra os movimentos do caixa na Tesouraria e clique em PDF com a janela de detalhes aberta.',
      );
      return;
    }

    const janelaPdf = window.open('', '_blank');
    setLoading(true);
    try {
      const blob = montarPdfCaixaBlob(opts.snapshot);

      if (!blob?.size) {
        throw new Error('PDF vazio.');
      }

      if (!(await abrirPdfNaJanelaReservada(janelaPdf, blob))) {
        throw new Error('Permita pop-ups para abrir o PDF do caixa.');
      }
    } catch (e: unknown) {
      const msg = mensagemErroDesconhecido(e);
      console.error('[usePrintCaixa]', e);
      alert(`Erro ao gerar PDF do caixa: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return { imprimirCaixa, loading };
}

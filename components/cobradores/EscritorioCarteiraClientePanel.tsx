import React, { useCallback, useEffect, useState } from 'react';
import { Building2, UserMinus } from 'lucide-react';
import { Button, Card } from '../ui/Components';
import { useToast } from '../../lib/ToastStore';
import {
  atribuirClienteCarteiraEscritorio,
  clienteNaCarteiraEscritorio,
  removerClienteDaCarteiraEscritorio,
} from '../../lib/carteiraEscritorio';
import { cobradorAtualNaCarteiraCliente } from '../../lib/cobradorDisponiveis';

type Props = {
  clienteId: string;
  empresaId: string;
  titulo?: string;
};

export const EscritorioCarteiraClientePanel: React.FC<Props> = ({
  clienteId,
  empresaId,
  titulo = 'Carteira do escritório',
}) => {
  const { showToast } = useToast();
  const [noEscritorio, setNoEscritorio] = useState(false);
  const [nomeCobradorCarteira, setNomeCobradorCarteira] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const recarregar = useCallback(async () => {
    if (!empresaId || !clienteId) return;
    setLoading(true);
    try {
      const [esc, cob] = await Promise.all([
        clienteNaCarteiraEscritorio(empresaId, clienteId),
        cobradorAtualNaCarteiraCliente(empresaId, clienteId),
      ]);
      setNoEscritorio(esc);
      setNomeCobradorCarteira(cob?.cobradorNome || null);
    } finally {
      setLoading(false);
    }
  }, [empresaId, clienteId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const incluir = async () => {
    if (nomeCobradorCarteira) {
      showToast(
        `Cliente está na carteira de ${nomeCobradorCarteira}. Remova o cobrador antes ou reatribua em Cobradores → Carteira.`,
        'warning',
      );
      return;
    }
    setSaving(true);
    try {
      const res = await atribuirClienteCarteiraEscritorio(empresaId, clienteId);
      if (!res.ok) {
        showToast(res.erro || 'Não foi possível incluir no escritório.', 'error');
        return;
      }
      showToast(`Incluído na carteira do escritório (${res.linhasAtualizadas} pendência(s)).`, 'success');
      await recarregar();
    } finally {
      setSaving(false);
    }
  };

  const remover = async () => {
    setSaving(true);
    try {
      const res = await removerClienteDaCarteiraEscritorio(empresaId, clienteId);
      if (!res.ok) {
        showToast(res.erro || 'Cliente não estava na carteira do escritório.', 'warning');
        return;
      }
      showToast('Removido da carteira do escritório.', 'success');
      await recarregar();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 border-l-4 border-l-teal-500">
      <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2 text-teal-700">
        <Building2 className="h-5 w-5" /> {titulo}
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Clientes que pagam mensalidade diretamente no escritório da unidade (sem cobrador).
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <>
          {noEscritorio ? (
            <p className="text-sm text-teal-800 mb-3">
              <strong>Pagamento no escritório</strong> — este cliente está na carteira da unidade.
            </p>
          ) : nomeCobradorCarteira ? (
            <p className="text-sm text-amber-700 mb-3">
              Cobrador: <strong>{nomeCobradorCarteira}</strong>. Remova da carteira do cobrador para usar pagamento no
              escritório.
            </p>
          ) : (
            <p className="text-sm text-gray-600 mb-3">Este cliente ainda não está na carteira do escritório.</p>
          )}

          <div className="flex flex-wrap gap-2">
            {!noEscritorio ? (
              <Button
                size="sm"
                className="min-h-11 h-auto whitespace-nowrap px-4 py-2.5"
                onClick={() => void incluir()}
                loading={saving}
                disabled={!!nomeCobradorCarteira}
              >
                Incluir no escritório
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 h-auto whitespace-nowrap px-4 py-2.5"
                onClick={() => void remover()}
                loading={saving}
              >
                <UserMinus className="h-4 w-4 mr-1 shrink-0" /> Remover do escritório
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
};

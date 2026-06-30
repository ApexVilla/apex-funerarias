import React, { useEffect, useState } from 'react';
import { useWhatsappCRM, WhatsAppCliente, WhatsAppContato } from '../../lib/WhatsappCRMStore';
import { useToast } from '../../lib/ToastStore';

export const CRMContatosPage: React.FC = () => {
  const { getClientes, getContatos, createContato, sendMensagemWhatsApp, isAdmin } = useWhatsappCRM();
  const { showToast } = useToast();
  const [clientes, setClientes] = useState<WhatsAppCliente[]>([]);
  const [contatos, setContatos] = useState<WhatsAppContato[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [resumo, setResumo] = useState('');
  const [statusContato, setStatusContato] = useState<WhatsAppContato['status_contato']>('Mensagem enviada');
  const [enviarAgora, setEnviarAgora] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [c, h] = await Promise.all([getClientes(), getContatos()]);
    setClientes(c);
    setContatos(h);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !resumo.trim()) return;
    try {
      setSaving(true);
      await createContato({ cliente_id: clienteId, resumo, status_contato: statusContato });

      if (enviarAgora) {
        const result = await sendMensagemWhatsApp({
          cliente_id: clienteId,
          mensagem: resumo
        });
        showToast(`Mensagem enviada com sucesso (${result.provider}).`, 'success');
      } else {
        showToast('Contato registrado com sucesso.', 'success');
      }

      setResumo('');
      setClienteId('');
      setStatusContato('Mensagem enviada');
      setEnviarAgora(false);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao registrar/enviar contato.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-[#185FA5]">Controle de Contatos WhatsApp</h1>

      <form onSubmit={submit} className="grid gap-2 rounded-lg border border-gray-200 p-3 md:grid-cols-3">
        <select
          className="rounded-md border border-gray-300 px-3 py-2"
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          required
        >
          <option value="">Selecione o cliente</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-gray-300 px-3 py-2"
          value={statusContato}
          onChange={(e) => setStatusContato(e.target.value as WhatsAppContato['status_contato'])}
        >
          <option>Mensagem enviada</option>
          <option>Respondeu</option>
          <option>Não atendeu</option>
          <option>Prometeu pagar</option>
        </select>
        <input
          className="rounded-md border border-gray-300 px-3 py-2 md:col-span-3"
          placeholder="Resumo do que foi tratado"
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          required
        />
        <label className="md:col-span-3 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={enviarAgora}
            onChange={(e) => setEnviarAgora(e.target.checked)}
          />
          Enviar WhatsApp real para o cliente ao registrar
        </label>
        <button disabled={saving} className="rounded-md bg-[#185FA5] px-4 py-2 text-white md:col-span-3 disabled:opacity-60">
          {saving ? 'Salvando...' : enviarAgora ? 'Registrar e enviar WhatsApp' : 'Registrar contato'}
        </button>
      </form>

      <div className="rounded-lg border border-gray-200 p-3">
        <h2 className="mb-3 font-semibold">Histórico ({isAdmin ? 'todos' : 'meus contatos'})</h2>
        <div className="space-y-2">
          {contatos.map((c) => (
            <div key={c.id} className="rounded border border-gray-100 bg-gray-50 p-3">
              <div className="text-sm font-medium">{c.cliente_nome || c.cliente_id}</div>
              <div className="text-xs text-gray-600">
                {new Date(c.created_at).toLocaleString('pt-BR')} • {c.status_contato} • {c.vendedor_nome || 'Vendedor'}
              </div>
              <p className="mt-1 text-sm">{c.resumo}</p>
            </div>
          ))}
          {contatos.length === 0 && <p className="text-sm text-gray-500">Sem contatos registrados.</p>}
        </div>
      </div>
    </div>
  );
};

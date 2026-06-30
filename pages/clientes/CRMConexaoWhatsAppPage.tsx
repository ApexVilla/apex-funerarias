import React, { useEffect, useState } from 'react';
import { Link2, PlugZap, Unplug, MessageCircle } from 'lucide-react';
import { Button, Input } from '../../components/ui/Components';
import { useWhatsappCRM } from '../../lib/WhatsappCRMStore';
import { useToast } from '../../lib/ToastStore';
import { normalizarNumeroWhatsappInternacional } from '../../lib/whatsappValidacao';

export const CRMConexaoWhatsAppPage: React.FC = () => {
  const { canManageConexao, getConexao, saveConexao, desconectarNumero } = useWhatsappCRM();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  const [form, setForm] = useState({
    provider: 'evolution-api',
    numero_whatsapp: '',
    instance_key: '',
    access_token: '',
    webhook_url: ''
  });
  const [statusConexao, setStatusConexao] = useState<'desconectado' | 'conectado'>('desconectado');

  const load = async () => {
    try {
      setLoading(true);
      const conexao = await getConexao();
      if (conexao) {
        setForm({
          provider: conexao.provider || 'evolution-api',
          numero_whatsapp: conexao.numero_whatsapp || '',
          instance_key: conexao.instance_key || '',
          access_token: conexao.access_token || '',
          webhook_url: conexao.webhook_url || ''
        });
        setStatusConexao(conexao.status_conexao);
      } else {
        setStatusConexao('desconectado');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao carregar conexão do WhatsApp.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageConexao) {
      showToast('Seu perfil não possui permissão para configurar conexão WhatsApp.', 'warning');
      return;
    }

    try {
      setSaving(true);
      await saveConexao(form);
      setStatusConexao('conectado');
      showToast('Conexão WhatsApp salva com sucesso.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao salvar conexão.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const onDisconnect = async () => {
    if (!canManageConexao) {
      showToast('Seu perfil não possui permissão para desconectar número.', 'warning');
      return;
    }

    try {
      setDesconectando(true);
      await desconectarNumero();
      setStatusConexao('desconectado');
      setForm((prev) => ({
        ...prev,
        access_token: '',
        instance_key: '',
        webhook_url: ''
      }));
      showToast('Número desconectado com sucesso.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro ao desconectar número.', 'error');
    } finally {
      setDesconectando(false);
    }
  };

  const numeroWaLink = normalizarNumeroWhatsappInternacional(form.numero_whatsapp);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#185FA5]">Conexão WhatsApp da Empresa</h1>
            <p className="text-sm text-gray-600">
              Configure o número oficial para uso do CRM e da equipe comercial.
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase ${
              statusConexao === 'conectado'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            {statusConexao}
          </div>
        </div>
      </div>

      <form onSubmit={onSave} className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Provedor de integração"
            value={form.provider}
            onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
            placeholder="Ex: evolution-api, z-api, gupshup"
            disabled={!canManageConexao || loading}
            required
          />
          <Input
            label="Número WhatsApp da empresa"
            value={form.numero_whatsapp}
            onChange={(e) => setForm((prev) => ({ ...prev, numero_whatsapp: e.target.value }))}
            placeholder="5511999999999"
            disabled={!canManageConexao || loading}
            required
          />
          <Input
            label="Chave da instância"
            value={form.instance_key}
            onChange={(e) => setForm((prev) => ({ ...prev, instance_key: e.target.value }))}
            placeholder="instance-key"
            disabled={!canManageConexao || loading}
          />
          <Input
            label="Token de acesso"
            value={form.access_token}
            onChange={(e) => setForm((prev) => ({ ...prev, access_token: e.target.value }))}
            placeholder="token-secret"
            disabled={!canManageConexao || loading}
          />
          <div className="md:col-span-2">
            <Input
              label="Webhook URL"
              value={form.webhook_url}
              onChange={(e) => setForm((prev) => ({ ...prev, webhook_url: e.target.value }))}
              placeholder="https://sua-api/webhooks/whatsapp"
              disabled={!canManageConexao || loading}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saving} disabled={!canManageConexao || loading}>
            <PlugZap className="mr-2 h-4 w-4" />
            Salvar conexão
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onDisconnect}
            loading={desconectando}
            disabled={!canManageConexao || loading || statusConexao !== 'conectado'}
          >
            <Unplug className="mr-2 h-4 w-4" />
            Desconectar
          </Button>
          {numeroWaLink && (
            <a
              href={`https://wa.me/${numeroWaLink}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Link2 className="h-4 w-4" />
              Testar número
            </a>
          )}
        </div>
      </form>
    </div>
  );
};

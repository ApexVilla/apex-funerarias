import React, { useState, useCallback, useMemo } from 'react';
import {
  Send, Link2, Copy, CheckCircle2, MessageCircle, Mail,
  Smartphone, Clock, Shield, FileText, X, Loader2, AlertCircle, ExternalLink,
} from 'lucide-react';
import { Button, Input, Card } from '../ui/Components';
import {
  criarAssinaturaDigitalComContrato,
  gerarLinkWhatsApp,
  type CriarAssinaturaDigitalPayload,
} from '../../lib/assinaturaDigitalService';
import { useToast } from '../../lib/ToastStore';
import type { AssinaturaSB, ClienteSB } from '../../lib/ClienteStore';

interface EnviarParaAssinaturaModalProps {
  open: boolean;
  onClose: () => void;
  cliente: ClienteSB;
  assinatura: AssinaturaSB;
  empresaId: string;
  onEnviado?: () => void;
}

export function EnviarParaAssinaturaModal({
  open,
  onClose,
  cliente,
  assinatura,
  empresaId,
  onEnviado,
}: EnviarParaAssinaturaModalProps) {
  const { showToast } = useToast();
  const [enviando, setEnviando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [canal, setCanal] = useState<'whatsapp' | 'sms' | 'email' | 'presencial'>('whatsapp');
  const [observacoes, setObservacoes] = useState('');
  const [horasValidade, setHorasValidade] = useState(72);

  const telefonePrincipal = useMemo(() => {
    return (
      cliente.whatsapp ||
      cliente.celular ||
      cliente.telefone_principal ||
      ''
    ).replace(/\D/g, '');
  }, [cliente]);

  const handleEnviar = useCallback(async () => {
    setEnviando(true);
    try {
      // Pegar userId da sessão
      let userId: string | undefined;
      try {
        const u = JSON.parse(sessionStorage.getItem('user') || '{}');
        userId = u?.id;
      } catch { /* ignore */ }

      const payload: CriarAssinaturaDigitalPayload = {
        empresa_id: empresaId,
        assinatura_id: assinatura.id,
        cliente_id: cliente.id,
        contrato_numero: assinatura.codigo || assinatura.id.slice(0, 8).toUpperCase(),
        contrato_plano: assinatura.plano_nome || '',
        titular_nome: cliente.nome,
        titular_cpf: cliente.cpf,
        titular_telefone: telefonePrincipal,
        canal_envio: canal,
        enviado_por: userId,
        observacoes: observacoes || undefined,
        horas_validade: horasValidade,
      };

      const { data, error, link } = await criarAssinaturaDigitalComContrato(payload, cliente, assinatura);

      if (error || !data || !link) {
        showToast(error || 'Erro ao gerar link de assinatura.', 'error');
        return;
      }

      setLinkGerado(link);
      showToast('Link de assinatura gerado com sucesso!', 'success');
      onEnviado?.();
    } catch (err: any) {
      showToast(err.message || 'Erro inesperado.', 'error');
    } finally {
      setEnviando(false);
    }
  }, [empresaId, assinatura, cliente, telefonePrincipal, canal, observacoes, horasValidade, showToast, onEnviado]);

  const copiarLink = useCallback(() => {
    if (!linkGerado) return;
    navigator.clipboard.writeText(linkGerado).then(() => {
      setCopiado(true);
      showToast('Link copiado!', 'success');
      setTimeout(() => setCopiado(false), 3000);
    });
  }, [linkGerado, showToast]);

  const abrirWhatsApp = useCallback(() => {
    if (!linkGerado || !telefonePrincipal) return;
    const url = gerarLinkWhatsApp(telefonePrincipal, linkGerado, cliente.nome.split(' ')[0]);
    window.open(url, '_blank');
  }, [linkGerado, telefonePrincipal, cliente.nome]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95 slide-in-from-bottom-3 duration-300">
        {/* Header */}
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl" />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
                <Send className="h-5 w-5 text-indigo-300" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Enviar para Assinatura</h2>
                <p className="text-xs text-indigo-200/80">Assinatura digital do contrato</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {!linkGerado ? (
            <>
              {/* Dados do contrato */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Dados do Contrato
                </div>
                <div className="text-xs text-gray-600 space-y-1.5">
                  <p><span className="font-semibold text-gray-800">Titular:</span> {cliente.nome}</p>
                  {cliente.cpf && <p><span className="font-semibold text-gray-800">CPF:</span> {cliente.cpf}</p>}
                  <p>
                    <span className="font-semibold text-gray-800">Contrato:</span>{' '}
                    {assinatura.codigo || assinatura.id.slice(0, 8).toUpperCase()}
                  </p>
                  {assinatura.plano_nome && (
                    <p><span className="font-semibold text-gray-800">Plano:</span> {assinatura.plano_nome}</p>
                  )}
                </div>
              </div>

              {/* Canal de envio */}
              <div>
                <label className="text-xs font-bold text-gray-700 mb-2 block">Canal de Envio</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'whatsapp' as const, label: 'WhatsApp', icon: MessageCircle, color: 'text-green-600' },
                    { id: 'email' as const, label: 'E-mail', icon: Mail, color: 'text-blue-600' },
                    { id: 'sms' as const, label: 'SMS', icon: Smartphone, color: 'text-purple-600' },
                    { id: 'presencial' as const, label: 'Presencial', icon: FileText, color: 'text-amber-600' },
                  ].map(({ id, label, icon: Icon, color }) => (
                    <button
                      key={id}
                      onClick={() => setCanal(id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        canal === id
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${canal === id ? 'text-indigo-600' : color}`} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Validade */}
              <div>
                <label className="text-xs font-bold text-gray-700 mb-2 block flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  Validade do Link (horas)
                </label>
                <div className="flex gap-2">
                  {[24, 48, 72, 168].map((h) => (
                    <button
                      key={h}
                      onClick={() => setHorasValidade(h)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all ${
                        horasValidade === h
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {h === 168 ? '7 dias' : `${h}h`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="text-xs font-bold text-gray-700 mb-2 block">
                  Observações (opcional)
                </label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Notas internas sobre este envio..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:bg-white focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
                  rows={2}
                />
              </div>

              {/* Info de segurança */}
              <div className="flex items-start gap-2.5 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <Shield className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-blue-600 leading-relaxed">
                  Será gerado um link seguro com o contrato completo em PDF. O cliente poderá
                  ler o documento, aceitar os termos e assinar com o dedo na tela.
                  A assinatura será registrada com IP, data/hora e dispositivo.
                </p>
              </div>

              {/* Botão de gerar */}
              <Button
                onClick={handleEnviar}
                loading={enviando}
                className="w-full"
              >
                <Link2 className="h-4 w-4 mr-2" />
                Gerar Link de Assinatura
              </Button>
            </>
          ) : (
            /* LINK GERADO COM SUCESSO */
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="text-center">
                <div className="flex items-center justify-center mb-3">
                  <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  </div>
                </div>
                <h3 className="font-bold text-gray-900">Link Gerado!</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Envie o link abaixo para o cliente assinar o contrato.
                </p>
              </div>

              {/* Link copiável */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-center gap-2">
                <input
                  type="text"
                  value={linkGerado}
                  readOnly
                  className="flex-1 bg-transparent text-xs text-gray-600 truncate border-0 outline-none"
                />
                <button
                  onClick={copiarLink}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    copiado
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  }`}
                >
                  {copiado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiado ? 'Copiado!' : 'Copiar'}
                </button>
              </div>

              {/* Ações rápidas */}
              <div className="grid grid-cols-2 gap-3">
                {telefonePrincipal && (
                  <button
                    onClick={abrirWhatsApp}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Enviar via WhatsApp
                  </button>
                )}
                <button
                  onClick={() => window.open(linkGerado, '_blank')}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir Link
                </button>
              </div>

              {/* Informação de validade */}
              <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
                <Clock className="h-3.5 w-3.5" />
                <span>Válido por {horasValidade} horas</span>
              </div>

              <Button variant="outline" onClick={onClose} className="w-full">
                Fechar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

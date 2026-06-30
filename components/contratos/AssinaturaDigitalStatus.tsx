import React, { useState, useEffect, useCallback } from 'react';
import {
  Pen, Clock, CheckCircle2, XCircle, Eye, RefreshCw,
  Copy, Trash2, ExternalLink, Image, Shield, AlertCircle, Loader2,
} from 'lucide-react';
import {
  listarAssinaturasDigitais,
  cancelarAssinaturaDigital,
  formatarStatusAssinaturaDigital,
  montarLinkAssinaturaDigital,
  obterSignedUrlAssinatura,
  type AssinaturaDigital,
} from '../../lib/assinaturaDigitalService';
import { useToast } from '../../lib/ToastStore';

interface AssinaturaDigitalStatusProps {
  assinaturaId: string;
  compact?: boolean;
  onEnviarClick?: () => void;
}

export function AssinaturaDigitalStatus({
  assinaturaId,
  compact = false,
  onEnviarClick,
}: AssinaturaDigitalStatusProps) {
  const { showToast } = useToast();
  const [registros, setRegistros] = useState<AssinaturaDigital[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const data = await listarAssinaturasDigitais(assinaturaId);
    setRegistros(data);
    setLoading(false);
  }, [assinaturaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleVerAssinatura = async (url: string) => {
    const signedUrl = await obterSignedUrlAssinatura(url, 60);
    if (signedUrl) {
      setPreviewUrl(signedUrl);
    } else {
      showToast('Erro ao carregar a imagem da assinatura segura.', 'error');
    }
  };

  const handleCancelar = async (id: string) => {
    if (!confirm('Cancelar esta solicitação de assinatura?')) return;
    const { ok, error } = await cancelarAssinaturaDigital(id);
    if (ok) {
      showToast('Solicitação cancelada.', 'success');
      carregar();
    } else {
      showToast(error || 'Erro ao cancelar.', 'error');
    }
  };

  const copiarLink = (token: string) => {
    const link = montarLinkAssinaturaDigital(token);
    navigator.clipboard.writeText(link).then(() => showToast('Link copiado!', 'success'));
  };

  // Última assinatura ativa (mais recente não cancelada)
  const ultimaAtiva = registros.find((r) => r.status !== 'cancelado');
  const temAssinado = registros.some((r) => r.status === 'assinado');

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Verificando assinaturas digitais...</span>
      </div>
    );
  }

  // Modo compacto — badge simples
  if (compact) {
    if (!ultimaAtiva && !temAssinado) {
      return (
        <button
          onClick={onEnviarClick}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-200 transition-colors"
          title="Enviar contrato para assinatura digital"
        >
          <Pen className="h-3 w-3" />
          Assinar Digitalmente
        </button>
      );
    }

    if (temAssinado) {
      const assinado = registros.find((r) => r.status === 'assinado')!;
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Assinado em {new Date(assinado.assinado_em!).toLocaleDateString('pt-BR')}
        </div>
      );
    }

    if (ultimaAtiva) {
      const st = formatarStatusAssinaturaDigital(ultimaAtiva.status);
      return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded-lg border ${st.bgColor} ${st.color}`}>
          {ultimaAtiva.status === 'pendente' && <Clock className="h-3 w-3" />}
          {ultimaAtiva.status === 'visualizado' && <Eye className="h-3 w-3" />}
          {st.label}
        </div>
      );
    }

    return null;
  }

  // Modo completo — lista detalhada
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pen className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-bold text-gray-800">Assinatura Digital</span>
          {registros.length > 0 && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md font-medium">
              {registros.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {onEnviarClick && (
            <button
              onClick={onEnviarClick}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Pen className="h-3.5 w-3.5" />
              {temAssinado ? 'Reenviar' : 'Enviar para Assinatura'}
            </button>
          )}
        </div>
      </div>

      {/* Lista de registros */}
      {registros.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center">
          <Pen className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-medium">Nenhuma assinatura digital</p>
          <p className="text-xs text-gray-400 mt-1">
            Clique em "Enviar para Assinatura" para gerar um link de assinatura digital.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {(showAll ? registros : registros.slice(0, 3)).map((reg) => {
            const st = formatarStatusAssinaturaDigital(reg.status);
            const expirou = new Date(reg.expira_em) < new Date() && reg.status !== 'assinado' && reg.status !== 'cancelado';
            return (
              <div
                key={reg.id}
                className={`bg-white rounded-xl border p-3.5 space-y-2 ${
                  reg.status === 'assinado'
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                    expirou ? 'bg-gray-50 border-gray-200 text-gray-500' : `${st.bgColor} ${st.color}`
                  }`}>
                    {reg.status === 'assinado' && <CheckCircle2 className="h-3 w-3" />}
                    {reg.status === 'pendente' && <Clock className="h-3 w-3" />}
                    {reg.status === 'visualizado' && <Eye className="h-3 w-3" />}
                    {reg.status === 'cancelado' && <XCircle className="h-3 w-3" />}
                    {expirou ? 'Expirado' : st.label}
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(reg.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Detalhes da assinatura quando assinado */}
                {reg.status === 'assinado' && (
                  <div className="flex items-start gap-3 p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
                    <Shield className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div className="text-[10px] text-emerald-700 space-y-0.5">
                      <p className="font-semibold">Assinatura registrada</p>
                      <p>📅 {reg.assinado_em && new Date(reg.assinado_em).toLocaleString('pt-BR')}</p>
                      {reg.dispositivo && <p>📱 Dispositivo: {reg.dispositivo}</p>}
                      {reg.ip_assinatura && <p>🌐 IP: {String(reg.ip_assinatura)}</p>}
                    </div>
                  </div>
                )}

                {/* Imagem da assinatura */}
                {reg.assinatura_imagem_url && (
                  <button
                    onClick={() => handleVerAssinatura(reg.assinatura_imagem_url)}
                    className="flex items-center gap-1.5 text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                  >
                    <Image className="h-3 w-3" />
                    Ver assinatura
                  </button>
                )}

                {/* Ações */}
                {(reg.status === 'pendente' || reg.status === 'visualizado') && !expirou && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => copiarLink(reg.token)}
                      className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
                    >
                      <Copy className="h-3 w-3" />
                      Copiar Link
                    </button>
                    <span className="text-gray-200">|</span>
                    <button
                      onClick={() => window.open(montarLinkAssinaturaDigital(reg.token), '_blank')}
                      className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Abrir
                    </button>
                    <span className="text-gray-200">|</span>
                    <button
                      onClick={() => handleCancelar(reg.id)}
                      className="flex items-center gap-1 text-[10px] text-rose-500 hover:text-rose-700 font-medium transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Cancelar
                    </button>
                  </div>
                )}

                {reg.observacoes && (
                  <p className="text-[10px] text-gray-400 italic">{reg.observacoes}</p>
                )}
              </div>
            );
          })}

          {registros.length > 3 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-center text-[10px] text-indigo-600 hover:text-indigo-800 font-bold py-2 transition-colors"
            >
              Ver todos ({registros.length} registros)
            </button>
          )}
        </div>
      )}

      {/* Modal de preview da assinatura */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-sm">Assinatura Digital</h3>
              <button
                onClick={() => setPreviewUrl(null)}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <XCircle className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="border-2 border-gray-200 rounded-xl p-4 bg-white">
              <img
                src={previewUrl}
                alt="Assinatura digital do cliente"
                className="w-full h-auto"
              />
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-3">
              Assinatura eletrônica registrada conforme Lei nº 14.063/2020
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

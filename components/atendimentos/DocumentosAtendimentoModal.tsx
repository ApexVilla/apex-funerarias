import React, { useEffect, useMemo, useState } from 'react';
import { X, FileText, Download, ExternalLink, Loader2, Lock, Printer, RefreshCw } from 'lucide-react';
import { printPdfBlob } from '../../lib/printPdfBlob';
import {
  AtendimentoResumoDoc,
  DocumentoCatalogo,
  getDocumentosAtendimento,
} from '../../lib/AtendimentoDocumentos';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  atendimento: AtendimentoResumoDoc | null;
}

interface PreviewState {
  url: string;
  filename: string;
  blob: Blob;
}

export const DocumentosAtendimentoModal: React.FC<Props> = ({ isOpen, onClose, atendimento }) => {
  const documentos = useMemo<DocumentoCatalogo[]>(
    () => (atendimento ? getDocumentosAtendimento(atendimento) : []),
    [atendimento]
  );

  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  // Reset state quando o modal abre/fecha ou o atendimento muda
  useEffect(() => {
    if (!isOpen) return;
    setErro(null);
    const primeiroDisponivel = documentos.find((d) => d.disponivel);
    setSelecionado(primeiroDisponivel?.id || null);
  }, [isOpen, atendimento?.id]);

  // Limpa o blob URL ao desmontar/trocar
  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  // Gera (ou regenera) o PDF do documento selecionado
  useEffect(() => {
    if (!isOpen || !selecionado) return;
    const doc = documentos.find((d) => d.id === selecionado);
    if (!doc || !doc.disponivel) {
      setPreview(null);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    (async () => {
      try {
        const r = await doc.gerar();
        if (cancelado) return;
        if (!r) {
          setErro('Não foi possível gerar este documento.');
          return;
        }
        const url = URL.createObjectURL(r.blob);
        setPreview({ url, filename: r.filename, blob: r.blob });
      } catch (err) {
        if (cancelado) return;
        console.error(err);
        setErro(err instanceof Error ? err.message : 'Erro ao gerar documento.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [selecionado, isOpen]);

  // ESC para fechar + bloqueio de scroll
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !atendimento) return null;

  const baixarAtual = () => {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = preview.filename;
    a.click();
  };

  const abrirNovaAba = () => {
    if (!preview) return;
    window.open(preview.url, '_blank', 'noopener');
  };

  const imprimirAtual = () => {
    if (!preview) return;
    const ok = printPdfBlob(preview.blob, preview.filename);
    if (!ok) {
      const a = document.createElement('a');
      a.href = preview.url;
      a.download = preview.filename;
      a.click();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-6xl h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-blue-700" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">Documentos do atendimento</p>
              <p className="text-xs text-gray-500 truncate">
                Atendimento <span className="font-mono font-semibold">{atendimento.codigo || atendimento.id.slice(0, 8)}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
            aria-label="Fechar"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body: lateral + preview */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-0">
          {/* Lateral */}
          <aside className="border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50 overflow-y-auto">
            <ul className="divide-y divide-gray-100">
              {documentos.map((d) => {
                const ativo = selecionado === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      disabled={!d.disponivel}
                      onClick={() => setSelecionado(d.id)}
                      className={`w-full text-left px-4 py-3 transition flex items-start gap-3 ${
                        ativo
                          ? 'bg-blue-50 border-l-4 border-blue-600'
                          : 'hover:bg-white border-l-4 border-transparent'
                      } ${!d.disponivel ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`mt-0.5 h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                          d.disponivel ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {d.disponivel ? <FileText className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${ativo ? 'text-blue-700' : 'text-gray-800'}`}>
                          {d.titulo}
                        </p>
                        <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                          {d.descricao}
                        </p>
                        {!d.disponivel && d.motivoIndisponivel && (
                          <p className="text-[11px] text-amber-700 mt-1">{d.motivoIndisponivel}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Preview */}
          <main className="flex flex-col min-h-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-100 bg-white">
              <div className="text-xs text-gray-500 truncate">
                {preview ? preview.filename : 'Nenhum documento gerado.'}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    // Force regeneração
                    if (selecionado) {
                      const cur = selecionado;
                      setSelecionado(null);
                      setTimeout(() => setSelecionado(cur), 30);
                    }
                  }}
                  disabled={!selecionado || carregando}
                  className="p-2 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                  title="Regerar"
                >
                  <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={imprimirAtual}
                  disabled={!preview}
                  className="p-2 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                  title="Imprimir"
                >
                  <Printer className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={abrirNovaAba}
                  disabled={!preview}
                  className="p-2 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                  title="Abrir em nova aba"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={baixarAtual}
                  disabled={!preview}
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5"
                  title="Baixar"
                >
                  <Download className="h-4 w-4" />
                  Baixar
                </button>
              </div>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 bg-gray-100 overflow-hidden">
              {carregando && (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <p className="mt-3 text-sm">Gerando documento…</p>
                </div>
              )}
              {!carregando && erro && (
                <div className="h-full flex flex-col items-center justify-center text-red-600 px-6 text-center">
                  <p className="font-semibold">Erro ao gerar documento</p>
                  <p className="text-sm text-red-500 mt-1">{erro}</p>
                </div>
              )}
              {!carregando && !erro && !preview && (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 px-6 text-center">
                  <FileText className="h-10 w-10 text-gray-300 mb-2" />
                  <p className="text-sm">Selecione um documento ao lado para visualizar.</p>
                </div>
              )}
              {!carregando && !erro && preview && (
                <iframe
                  title={preview.filename}
                  src={preview.url}
                  className="w-full h-full border-0 bg-white"
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

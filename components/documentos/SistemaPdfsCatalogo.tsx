import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Download,
  ExternalLink,
  Loader2,
  Printer,
  Search,
  ChevronDown,
  CheckCircle2,
  Eye,
  X,
} from 'lucide-react';
import {
  AtendimentoSelectItem,
  PdfSistemaItem,
  getCatalogoSistemaPDFs,
  listarAtendimentosParaSelecao,
} from '../../lib/SistemaDocumentosCatalogo';
import { useAuth } from '../../lib/AuthContext';

interface PreviewState {
  url: string;
  filename: string;
  blob: Blob;
}

const formatStatus = (s?: string) => (s ? s.replace(/_/g, ' ') : '');

// ───────────────────────── Modal de prévia ─────────────────────────
interface PreviaModalProps {
  doc: PdfSistemaItem;
  onClose: () => void;
}

const PreviaModal: React.FC<PreviaModalProps> = ({ doc, onClose }) => {
  const { user } = useAuth();
  const empresaId = user?.empresa_id || '';
  const precisaSelecao = doc.requerSelecao === 'atendimento';

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const [busca, setBusca] = useState('');
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [atendimentos, setAtendimentos] = useState<AtendimentoSelectItem[]>([]);
  const [atdSelecionado, setAtdSelecionado] = useState<AtendimentoSelectItem | null>(null);
  const [listaAberta, setListaAberta] = useState(false);
  const refDropdown = useRef<HTMLDivElement | null>(null);

  // ESC + scroll lock
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  // Lista de atendimentos — apenas se o usuário abrir o seletor para usar dados reais
  useEffect(() => {
    if (!precisaSelecao || !empresaId) return;
    let cancelado = false;
    setCarregandoLista(true);
    const t = setTimeout(async () => {
      try {
        const r = await listarAtendimentosParaSelecao(empresaId, busca);
        if (!cancelado) setAtendimentos(r);
      } finally {
        if (!cancelado) setCarregandoLista(false);
      }
    }, 240);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [precisaSelecao, busca, empresaId]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!refDropdown.current) return;
      if (!refDropdown.current.contains(e.target as Node)) setListaAberta(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Limpa blob URL
  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  // Geração — sempre mostra prévia (mock por padrão; real se usuário escolher atendimento)
  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    setPreview((cur) => {
      if (cur?.url) URL.revokeObjectURL(cur.url);
      return null;
    });

    (async () => {
      try {
        let r: { blob: Blob; filename: string } | null | undefined = null;
        if (atdSelecionado && doc.gerarReal) {
          r = await doc.gerarReal(atdSelecionado.id);
        } else if (doc.gerarMock) {
          r = await doc.gerarMock();
        }
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
  }, [doc.id, atdSelecionado?.id]);

  const baixar = () => {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = preview.filename;
    a.click();
  };
  const abrirNovaAba = () => preview && window.open(preview.url, '_blank', 'noopener');
  const imprimir = () => {
    if (!preview) return;
    const w = window.open(preview.url, '_blank');
    if (!w) return;
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        /* noop */
      }
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-[92vh] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-blue-700" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{doc.titulo}</p>
              <p className="text-xs text-gray-500 truncate">{doc.modulo}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {precisaSelecao ? (
              <div className="relative w-full max-w-md" ref={refDropdown}>
                <button
                  type="button"
                  onClick={() => setListaAberta((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm hover:border-gray-300"
                >
                  <span className="truncate text-left flex items-center gap-2">
                    {atdSelecionado ? (
                      <>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold shrink-0">
                          dados reais
                        </span>
                        <span className="font-mono font-semibold text-blue-700">{atdSelecionado.codigo}</span>{' '}
                        <span className="text-gray-700 truncate">— {atdSelecionado.cliente_nome}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold shrink-0">
                          exemplo
                        </span>
                        <span className="text-gray-500">Usar dados de um atendimento real…</span>
                      </>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                </button>
                {listaAberta && (
                  <div className="absolute left-0 right-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-2 py-2 border-b border-gray-100 flex items-center gap-2">
                      <Search className="h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        autoFocus
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar pelo código…"
                        className="flex-1 text-sm outline-none"
                      />
                    </div>
                      <div className="max-h-72 overflow-y-auto">
                        {atdSelecionado && (
                          <button
                            type="button"
                            onClick={() => {
                              setAtdSelecionado(null);
                              setListaAberta(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 border-b border-amber-100 font-semibold flex items-center gap-2"
                          >
                            ← Voltar para prévia de exemplo
                          </button>
                        )}
                        {carregandoLista ? (
                          <div className="px-3 py-6 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                          </div>
                        ) : atendimentos.length === 0 ? (
                          <div className="px-3 py-6 text-center text-sm text-gray-500">
                            Nenhum atendimento encontrado.
                          </div>
                        ) : (
                        <ul>
                          {atendimentos.map((a) => {
                            const ativo = atdSelecionado?.id === a.id;
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAtdSelecionado(a);
                                    setListaAberta(false);
                                  }}
                                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2 ${
                                    ativo ? 'bg-blue-50' : ''
                                  }`}
                                >
                                  {ativo ? (
                                    <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5" />
                                  ) : (
                                    <div className="h-4 w-4 rounded-full border border-gray-300 mt-0.5" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm">
                                      <span className="font-mono font-semibold text-blue-700">{a.codigo}</span>{' '}
                                      <span className="text-gray-800">— {a.cliente_nome}</span>
                                    </p>
                                    <p className="text-[11px] text-gray-500">
                                      {new Date(a.data_servico).toLocaleDateString('pt-BR')} • {a.tipo_atendimento} •{' '}
                                      {formatStatus(a.status)}
                                    </p>
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500 truncate">{preview ? preview.filename : 'Carregando prévia…'}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={imprimir}
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
              onClick={baixar}
              disabled={!preview}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5"
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
              <p className="mt-3 text-sm">Gerando PDF…</p>
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
              <p className="text-sm">Preparando prévia…</p>
            </div>
          )}
          {!carregando && !erro && preview && (
            <iframe title={preview.filename} src={preview.url} className="w-full h-full border-0 bg-white" />
          )}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────── Catálogo ─────────────────────────
export const SistemaPdfsCatalogo: React.FC = () => {
  const documentos = useMemo<PdfSistemaItem[]>(() => getCatalogoSistemaPDFs(), []);
  const [aberto, setAberto] = useState<PdfSistemaItem | null>(null);

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white px-5 py-3">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <FileText className="h-5 w-5 text-blue-700" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">Documentos PDF do sistema</p>
            <p className="text-xs text-gray-500">Clique em um documento para abrir a prévia.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {documentos.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setAberto(d)}
              className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 leading-tight">{d.titulo}</p>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mt-0.5">{d.modulo}</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-3 line-clamp-2 leading-snug">{d.descricao}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-gray-500">
                  {d.requerSelecao === 'atendimento' ? 'Exemplo + dados reais' : 'Prévia de exemplo'}
                </span>
                <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold group-hover:underline">
                  <Eye className="h-3.5 w-3.5" /> Ver prévia
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {aberto && <PreviaModal doc={aberto} onClose={() => setAberto(null)} />}
    </>
  );
};

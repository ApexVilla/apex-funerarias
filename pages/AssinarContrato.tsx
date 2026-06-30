import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import {
  FileText, Shield, CheckCircle2, XCircle, Clock,
  RotateCcw, Pen, Smartphone, AlertCircle, Loader2,
  ArrowRight, RotateCw, Eye, ExternalLink,
} from 'lucide-react';
import {
  buscarAssinaturaPorToken,
  baixarContratoPdfPorToken,
  registrarAceiteTermosContrato,
  registrarAssinaturaDigital,
  type AssinaturaDigital,
} from '../lib/assinaturaDigitalService';
import { FENIX_LOGO_PATH } from '../lib/fenixLogo';

// ==========================================
// PÁGINA PÚBLICA DE ASSINATURA DIGITAL
// Acesso sem login — via token na URL
// ==========================================

type Etapa = 'carregando' | 'visualizar' | 'assinar' | 'sucesso' | 'erro';

export function AssinarContratoPage() {
  const { token } = useParams<{ token: string }>();
  const sigCanvasRef = useRef<SignatureCanvas | null>(null);

  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [registro, setRegistro] = useState<AssinaturaDigital | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [canvasVazio, setCanvasVazio] = useState(true);
  const [paisagemOk, setPaisagemOk] = useState(true);
  const [contratoPdfUrl, setContratoPdfUrl] = useState<string | null>(null);
  const [carregandoPdf, setCarregandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState('');
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [prosseguindo, setProsseguindo] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const atualizarOrientacao = useCallback(() => {
    const estreito = window.innerWidth < 768;
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    setPaisagemOk(!estreito || landscape);
  }, []);

  // Carregar dados do contrato pelo token
  useEffect(() => {
    if (!token) {
      setEtapa('erro');
      setErrMsg('Link de assinatura inválido.');
      return;
    }

    buscarAssinaturaPorToken(token).then(({ data, error, expirado }) => {
      if (error || !data) {
        setEtapa('erro');
        setErrMsg(error || 'Link não encontrado.');
        return;
      }
      if (expirado) {
        setEtapa('erro');
        setErrMsg('Este link de assinatura expirou. Solicite um novo link à funerária.');
        return;
      }
      if (data.status === 'assinado') {
        setRegistro(data);
        setEtapa('sucesso');
        return;
      }
      setRegistro(data);
      setEtapa('visualizar');
    });
  }, [token]);

  // Carregar PDF do contrato para leitura
  useEffect(() => {
    if (!token || etapa !== 'visualizar') return;

    let cancelado = false;

    setCarregandoPdf(true);
    setErroPdf('');
    setContratoPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    baixarContratoPdfPorToken(token, registro?.contrato_pdf_path).then(({ blob, error }) => {
      if (cancelado) return;
      if (error || !blob) {
        setErroPdf(error || 'Não foi possível carregar o contrato.');
        setCarregandoPdf(false);
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      setContratoPdfUrl(objectUrl);
      setCarregandoPdf(false);
    });

    return () => {
      cancelado = true;
      setContratoPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [token, etapa, registro?.contrato_pdf_path]);

  const prosseguirParaAssinar = async () => {
    if (!token || !aceiteTermos) return;
    setProsseguindo(true);
    setErrMsg('');
    const { ok, error } = await registrarAceiteTermosContrato(token);
    setProsseguindo(false);
    if (!ok) {
      setErrMsg(error || 'Não foi possível registrar o aceite dos termos.');
      return;
    }
    setEtapa('assinar');
  };

  useEffect(() => {
    if (etapa !== 'assinar') return;
    atualizarOrientacao();
    window.addEventListener('resize', atualizarOrientacao);
    window.addEventListener('orientationchange', () => {
      setTimeout(atualizarOrientacao, 200);
    });
    const orient = screen.orientation as ScreenOrientation & {
      lock?: (mode: string) => Promise<void>;
      unlock?: () => void;
    };
    orient?.lock?.('landscape').catch(() => undefined);
    return () => {
      window.removeEventListener('resize', atualizarOrientacao);
      orient?.unlock?.();
    };
  }, [etapa, atualizarOrientacao]);

  useEffect(() => {
    if (etapa !== 'assinar' || !paisagemOk) return;
    const ajustarCanvas = () => {
      const wrap = canvasContainerRef.current;
      const sig = sigCanvasRef.current;
      if (!wrap || !sig) return;
      const w = wrap.clientWidth;
      const landscape = window.matchMedia('(orientation: landscape)').matches;
      const h = landscape ? Math.max(200, Math.floor(window.innerHeight * 0.45)) : 180;
      const canvas = sig.getCanvas();
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    const t = window.setTimeout(ajustarCanvas, 80);
    window.addEventListener('resize', ajustarCanvas);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', ajustarCanvas);
    };
  }, [etapa, paisagemOk]);

  // Detectar quando o canvas é desenhado
  const handleCanvasEnd = useCallback(() => {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      setCanvasVazio(false);
    }
  }, []);

  // Limpar canvas
  const limparAssinatura = () => {
    sigCanvasRef.current?.clear();
    setCanvasVazio(true);
  };

  // Confirmar assinatura
  const confirmarAssinatura = async () => {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty() || !token) return;

    setSalvando(true);
    try {
      const canvas = sigCanvasRef.current.getTrimmedCanvas();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Erro ao gerar imagem'))),
          'image/png',
        );
      });

      const { ok, error } = await registrarAssinaturaDigital(token, blob, {
        userAgent: navigator.userAgent,
      });

      if (!ok || error) {
        setErrMsg(error || 'Erro ao registrar a assinatura.');
        return;
      }

      setEtapa('sucesso');
    } catch (err: any) {
      setErrMsg(err.message || 'Erro inesperado. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  // Formatar CPF
  const formatCpf = (cpf?: string | null) => {
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length !== 11) return cpf || '—';
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  };

  const planoUi = registro ? planoCardAssinatura(registro.contrato_plano) : null;

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col">
      {/* Header simples */}
      <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-4 py-4 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img
            src={FENIX_LOGO_PATH}
            alt="Fênix Funerária"
            className="h-10 w-10 rounded-lg object-contain bg-white/10 p-1"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div>
            <h1 className="text-lg font-bold tracking-tight">Fênix Funerária</h1>
            <p className="text-xs text-slate-300">Assinatura Digital de Contrato</p>
          </div>
        </div>
      </header>

      {/* Conteúdo central */}
      <main className="flex-1 flex items-start justify-center px-4 py-6">
        <div className={`w-full ${etapa === 'visualizar' ? 'max-w-3xl' : 'max-w-lg'}`}>

          {/* CARREGANDO */}
          {etapa === 'carregando' && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 animate-pulse">
              <Loader2 className="h-12 w-12 text-indigo-500 animate-spin" />
              <p className="text-gray-500 font-medium">Carregando contrato...</p>
            </div>
          )}

          {/* ERRO */}
          {etapa === 'erro' && (
            <div className="bg-white rounded-2xl shadow-lg border border-rose-200 p-8 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-rose-100 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-rose-500" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Link Indisponível</h2>
              <p className="text-gray-500 text-sm leading-relaxed">{errMsg}</p>
              <div className="mt-6 p-4 bg-slate-50 rounded-xl border">
                <p className="text-xs text-gray-400">
                  Se você acredita que isso é um erro, entre em contato com a Fênix Funerária
                  para solicitar um novo link de assinatura.
                </p>
              </div>
            </div>
          )}

          {/* VISUALIZAR CONTRATO */}
          {etapa === 'visualizar' && registro && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
              <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        Contrato — {registro.titular_nome}
                      </p>
                      {registro.contrato_numero && (
                        <p className="text-[10px] text-gray-500 font-mono">
                          Nº {registro.contrato_numero}
                        </p>
                      )}
                    </div>
                  </div>
                  {planoUi && (
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded flex-shrink-0">
                      {planoUi.texto}
                    </span>
                  )}
                </div>

                <div className="p-3 sm:p-4 space-y-3">
                  {registro.titular_cpf && (
                    <p className="text-[11px] text-gray-500 text-center">
                      CPF do titular:{' '}
                      <span className="font-medium text-gray-700">{formatCpf(registro.titular_cpf)}</span>
                    </p>
                  )}

                  <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center gap-2 text-xs text-gray-600">
                      <Eye className="h-3.5 w-3.5 text-indigo-600" />
                      Leia o contrato completo antes de assinar
                    </div>
                    <div className="h-[min(70vh,520px)] bg-white">
                      {carregandoPdf && (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
                          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                          <p className="text-sm">Carregando contrato...</p>
                        </div>
                      )}
                      {!carregandoPdf && erroPdf && (
                        <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
                          <AlertCircle className="h-8 w-8 text-amber-500" />
                          <p className="text-sm text-gray-600">{erroPdf}</p>
                        </div>
                      )}
                      {!carregandoPdf && !erroPdf && contratoPdfUrl && (
                        <div className="h-full flex flex-col">
                          <div className="flex-1 min-h-0 bg-white">
                            <object
                              title="Contrato para assinatura"
                              data={contratoPdfUrl}
                              type="application/pdf"
                              className="w-full h-full border-0"
                            >
                              <iframe
                                title="Contrato para assinatura"
                                src={contratoPdfUrl}
                                className="w-full h-full border-0 bg-white"
                              />
                            </object>
                          </div>
                          <a
                            href={contratoPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border-t border-indigo-100 hover:bg-indigo-100"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir contrato em tela cheia
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aceiteTermos}
                      onChange={(e) => setAceiteTermos(e.target.checked)}
                      disabled={carregandoPdf || !!erroPdf}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-gray-700 leading-relaxed">
                      Declaro que <strong>li e compreendi o contrato</strong> acima e concordo com
                      todos os seus termos e condições, nos termos da Lei nº 14.063/2020.
                    </span>
                  </label>

                  <p className="text-[10px] text-gray-400 text-center flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" />
                    Link válido até{' '}
                    {new Date(registro.expira_em).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-center text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-center justify-center gap-2">
                <RotateCw className="h-4 w-4 flex-shrink-0" />
                Na próxima tela, <strong>gire o celular de lado</strong> (horizontal) para assinar com mais espaço.
              </p>

              {errMsg && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
                  <p className="text-xs text-rose-700">{errMsg}</p>
                </div>
              )}

              <button
                onClick={prosseguirParaAssinar}
                disabled={!aceiteTermos || carregandoPdf || !!erroPdf || prosseguindo}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200/80 disabled:shadow-none transition-all active:scale-[0.98]"
              >
                {prosseguindo ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrando aceite...
                  </>
                ) : (
                  <>
                    <Pen className="h-4 w-4" />
                    Prosseguir para Assinar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* ASSINAR */}
          {etapa === 'assinar' && registro && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-500 relative">
              {!paisagemOk && (
                <div
                  className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col items-center justify-center text-white px-8 text-center"
                  role="dialog"
                  aria-labelledby="girar-celular-titulo"
                >
                  <RotateCw className="h-20 w-20 text-amber-400 animate-pulse mb-6" />
                  <h2 id="girar-celular-titulo" className="text-xl font-bold mb-2">
                    Gire o celular de lado
                  </h2>
                  <p className="text-sm text-slate-300 max-w-xs leading-relaxed">
                    Deixe o aparelho na posição <strong>horizontal</strong> (paisagem) para ter uma área maior e assinar com o dedo com mais conforto.
                  </p>
                </div>
              )}

              {planoUi && paisagemOk && (
                <PlanoCardCompacto texto={planoUi.texto} estilo={planoUi.estilo} />
              )}

              <div className={`bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden ${!paisagemOk ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                  <Pen className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-gray-800">Assine com o dedo</span>
                  <span className="text-[10px] text-gray-400 truncate ml-auto">{registro.titular_nome}</span>
                </div>

                <div className="p-4 space-y-3">

                  <div
                    ref={canvasContainerRef}
                    className="assinar-canvas-wrap relative border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 overflow-hidden"
                  >
                    <SignatureCanvas
                      ref={sigCanvasRef}
                      penColor="#1e293b"
                      minWidth={1.5}
                      maxWidth={3.5}
                      canvasProps={{
                        className: 'w-full touch-none assinar-canvas',
                        style: { width: '100%', height: '180px' },
                      }}
                      onEnd={handleCanvasEnd}
                    />
                    {/* Linha guia */}
                    <div className="absolute bottom-10 left-8 right-8 border-b border-gray-300/50" />
                    {canvasVazio && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Smartphone className="h-6 w-6" />
                          <span className="text-sm font-medium">Toque aqui para assinar</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex gap-3">
                    <button
                      onClick={limparAssinatura}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm rounded-xl transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Limpar
                    </button>
                    <button
                      onClick={() => setEtapa('visualizar')}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm rounded-xl transition-colors"
                    >
                      Voltar
                    </button>
                  </div>

                  {errMsg && (
                    <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl border border-rose-200">
                      <AlertCircle className="h-4 w-4 text-rose-500 flex-shrink-0" />
                      <p className="text-xs text-rose-700">{errMsg}</p>
                    </div>
                  )}

                  <p className="text-[10px] text-gray-400 text-center leading-snug">
                    Ao assinar, você concorda com os termos do contrato (Lei nº 14.063/2020).
                  </p>
                </div>
              </div>

              <button
                onClick={confirmarAssinatura}
                disabled={canvasVazio || salvando}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-200/80 disabled:shadow-none transition-all active:scale-[0.98]"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Registrando assinatura...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Confirmar Assinatura
                  </>
                )}
              </button>
            </div>
          )}

          {/* SUCESSO */}
          {etapa === 'sucesso' && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
              {planoUi && (
                <PlanoCardCompacto texto={planoUi.texto} estilo={planoUi.estilo} />
              )}
            <div className="bg-white rounded-xl shadow-md border border-emerald-200 p-6 text-center">
              <div className="flex items-center justify-center mb-5">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Assinatura Registrada!</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Sua assinatura foi registrada com sucesso e vinculada ao contrato
                {registro?.contrato_numero ? ` nº ${registro.contrato_numero}` : ''}.
              </p>

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-center gap-2 text-emerald-700 text-xs font-semibold">
                  <Shield className="h-4 w-4" />
                  Dados do Registro
                </div>
                <div className="text-xs text-emerald-600 space-y-1">
                  <p>📅 Data: {new Date().toLocaleString('pt-BR')}</p>
                  <p>📱 Dispositivo: {navigator.userAgent.includes('Mobile') ? 'Celular' : 'Computador'}</p>
                  <p>🔒 Registro protegido com hash de segurança</p>
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-6">
                Você pode fechar esta página. A funerária será notificada automaticamente.
              </p>
            </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-center py-4 text-[10px]">
        <p>Fênix Funerária LTDA · CNPJ 03.617.822/0002-95</p>
        <p className="mt-1">Assinatura eletrônica conforme Lei nº 14.063/2020</p>
      </footer>
    </div>
  );
}

type PlanoCardEstilo = 'onix' | 'catalao' | 'fenix' | 'padrao';

function planoCardAssinatura(planoRaw?: string | null): { texto: string; estilo: PlanoCardEstilo } | null {
  const bruto = (planoRaw || '').trim();
  if (!bruto) return null;

  const lower = bruto.toLowerCase();
  let estilo: PlanoCardEstilo = 'padrao';
  if (lower.includes('onix') || lower.includes('ônix')) estilo = 'onix';
  else if (lower.includes('catal')) estilo = 'catalao';
  else if (lower.includes('fenix') || lower.includes('fênix')) estilo = 'fenix';

  let texto: string;
  if (/^plano\b/i.test(bruto)) {
    texto = bruto.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Plano\b/i, 'Plano');
  } else {
    const titulo = bruto
      .toLowerCase()
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    texto = `Plano ${titulo}`;
  }

  return { texto, estilo };
}

const PLANO_CARD_CLASSES: Record<PlanoCardEstilo, string> = {
  onix: 'bg-slate-50 border-slate-200 text-slate-800',
  catalao: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  fenix: 'bg-amber-50 border-amber-200 text-amber-900',
  padrao: 'bg-indigo-50 border-indigo-200 text-indigo-900',
};

function PlanoCardCompacto({ texto, estilo }: { texto: string; estilo: PlanoCardEstilo }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-center shadow-sm ${PLANO_CARD_CLASSES[estilo]}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-70 mb-0.5">Plano</p>
      <p className="text-[13px] font-bold leading-tight">{texto}</p>
    </div>
  );
}

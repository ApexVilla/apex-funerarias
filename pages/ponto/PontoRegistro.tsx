import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge, Button, Card, Textarea } from '../../components/ui/Components';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import { Clock, Coffee, LogIn, LogOut, User, Briefcase, CalendarDays, ArrowRight, Camera, X, RefreshCw, WifiOff, CloudUpload } from 'lucide-react';
import {
  getUserPontoConfig,
  jornadaPontoFinalizada,
  labelRegimePonto,
  LABEL_TIPO_BATIDA,
  proximaBatidaPonto,
  tiposBatidaParaSelecao,
  usaPontoApenasEntradaSaida,
} from '../../lib/pontoRules';
import {
  isRegime12x36,
  labelMetaDiaria,
  metaMinutosNoDia,
} from '../../lib/pontoEscala';
import {
  type BatidaPonto,
  type TipoBatida,
  calcularTrabalhadoMinutos,
  formatarDuracaoPonto,
  diaLocalFromTimestamp,
  formatarHoraPonto,
  getDataLocalISO,
  montarChaveStoragePonto,
  normalizarBatidasParsed,
} from '../../lib/pontoUtils';
import {
  carregarBatidasJornadaAtiva,
  contarBatidasPendentes,
  enviarBatidaServidor,
  gravarBatidasPorDiaLocal,
  lerBatidasLocal,
  sincronizarBatidasPendentes,
  lerIdsPendentes,
} from '../../lib/pontoSyncService';
import {
  jornadaMultidia12x36Catalao,
  JORNADA_MULTIDIA_12X36_MAX_DIAS,
} from '../../lib/ponto12x36Catalao';

const nomeTipo: Record<TipoBatida, string> = {
  entrada: 'Entrada',
  inicio_intervalo: 'Início Intervalo',
  fim_intervalo: 'Fim Intervalo',
  saida: 'Saída',
};

const iconeTipo: Record<TipoBatida, React.ReactNode> = {
  entrada: <LogIn className="h-4 w-4" />,
  inicio_intervalo: <Coffee className="h-4 w-4" />,
  fim_intervalo: <LogIn className="h-4 w-4" />,
  saida: <LogOut className="h-4 w-4" />,
};

const corTipo: Record<TipoBatida, string> = {
  entrada: 'bg-green-500',
  inicio_intervalo: 'bg-amber-500',
  fim_intervalo: 'bg-blue-500',
  saida: 'bg-red-500',
};

const corTextoTipo: Record<TipoBatida, string> = {
  entrada: 'text-green-700',
  inicio_intervalo: 'text-amber-700',
  fim_intervalo: 'text-blue-700',
  saida: 'text-red-700',
};


const formatarHora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const PontoRegistro: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const pontoConfig = getUserPontoConfig(user?.permissoes);
  const hoje = getDataLocalISO();
  const storageKey = user?.empresa_id && user?.id ? montarChaveStoragePonto(user.empresa_id, user.id, hoje) : null;

  const [observacao, setObservacao] = useState('');
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [batidas, setBatidas] = useState<BatidaPonto[]>(() => {
    if (!storageKey) return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? normalizarBatidasParsed(JSON.parse(raw)) : [];
    } catch {
      return [];
    }
  });

  const [jornadaIniciadaOntem, setJornadaIniciadaOntem] = useState(false);
  const [diaInicioJornada, setDiaInicioJornada] = useState(hoje);

  const jornadaMultidiaCatalao = jornadaMultidia12x36Catalao(user?.empresa_id, pontoConfig);

  // Seletor manual de tipo + câmera
  const [modalSeletorTipo, setModalSeletorTipo] = useState(false);
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoBatida | null>(null);
  const [modalCamera, setModalCamera] = useState(false);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setHoraAtual(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [loadingDb, setLoadingDb] = useState(true);
  const [online, setOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  );
  const [pendentesSync, setPendentesSync] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [salvandoPonto, setSalvandoPonto] = useState(false);

  const atualizarContagemPendentes = useCallback(() => {
    if (!user?.empresa_id || !user?.id) {
      setPendentesSync(0);
      return;
    }
    setPendentesSync(contarBatidasPendentes(user.empresa_id, user.id));
  }, [user?.empresa_id, user?.id]);

  const loadPontoDia = useCallback(async () => {
    if (!user?.empresa_id || !user?.id || !storageKey) {
      setBatidas([]);
      return;
    }
    setLoadingDb(true);
    try {
      const { batidas: merged, origemServidor, jornadaIniciadaOntem: ontem, diaInicioJornada: diaInicio } =
        await carregarBatidasJornadaAtiva({
          empresaId: user.empresa_id,
          userId: user.id,
          dataISO: hoje,
          multidiaMaxDias: jornadaMultidiaCatalao ? JORNADA_MULTIDIA_12X36_MAX_DIAS : 2,
        });
      setBatidas(merged);
      setJornadaIniciadaOntem(ontem);
      setDiaInicioJornada(diaInicio);
      if (!origemServidor && merged.length > 0) {
        console.info('[Ponto] Exibindo batidas salvas no aparelho (sem internet).');
      }
    } catch (err) {
      console.warn('Erro ao carregar ponto:', err);
      setBatidas(lerBatidasLocal(storageKey));
    } finally {
      setLoadingDb(false);
      atualizarContagemPendentes();
    }
  }, [storageKey, user?.id, user?.empresa_id, hoje, atualizarContagemPendentes, jornadaMultidiaCatalao]);

  const executarSincronizacao = useCallback(async (silencioso = false) => {
    if (!user?.empresa_id || !user?.id || !navigator.onLine) return;
    setSincronizando(true);
    try {
      const { enviadas, falhas } = await sincronizarBatidasPendentes({
        empresaId: user.empresa_id,
        userId: user.id,
      });
      atualizarContagemPendentes();
      await loadPontoDia();
      if (!silencioso && enviadas > 0) {
        showToast(`${enviadas} batida(s) sincronizada(s) com o servidor.`, 'success');
      }
      if (!silencioso && falhas > 0) {
        showToast('Algumas batidas ainda não foram enviadas. Tente de novo.', 'warning');
      }
    } finally {
      setSincronizando(false);
    }
  }, [user?.empresa_id, user?.id, loadPontoDia, showToast, atualizarContagemPendentes]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void executarSincronizacao(true);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [executarSincronizacao]);

  useEffect(() => {
    void loadPontoDia();
  }, [loadPontoDia]);

  useEffect(() => {
    if (online && user?.empresa_id && user?.id) {
      void executarSincronizacao(true);
    }
  }, [online, user?.empresa_id, user?.id, executarSincronizacao]);

  const roleColaborador = user?.role;
  const pontoEntradaSaida = usaPontoApenasEntradaSaida(roleColaborador);
  const tiposDisponiveis = tiposBatidaParaSelecao(roleColaborador);
  const proximaBatida: TipoBatida | undefined = proximaBatidaPonto(batidas, roleColaborador);
  const jornadaFinalizada = jornadaPontoFinalizada(batidas, roleColaborador);

  const minutosTrabalhados = useMemo(() => calcularTrabalhadoMinutos(batidas), [batidas]);
  const temBatidaHoje = batidas.some((b) => diaLocalFromTimestamp(b.timestamp) === hoje);
  const metaDiaHoje = metaMinutosNoDia(pontoConfig, hoje, temBatidaHoje);
  const folga12x36Hoje = isRegime12x36(pontoConfig) && metaDiaHoje === 0 && !temBatidaHoje;
  const saldoMinutos = minutosTrabalhados - metaDiaHoje;
  const metaSegura = Math.max(1, metaDiaHoje);
  const pctBruto = metaDiaHoje > 0 ? Math.round((minutosTrabalhados / metaSegura) * 100) : 0;
  const percentualJornada = Number.isFinite(pctBruto) ? Math.min(100, pctBruto) : 0;
  const labelMetaHoje = labelMetaDiaria(pontoConfig, hoje, temBatidaHoje);

  const idsPendentesEnvio = useMemo(() => {
    if (!user?.empresa_id || !user?.id) return new Set<string>();
    return lerIdsPendentes(user.empresa_id, user.id);
  }, [user?.empresa_id, user?.id, pendentesSync, batidas.length]);

  const salvarBatidas = useCallback((novasBatidas: BatidaPonto[]) => {
    setBatidas(novasBatidas);
    if (user?.empresa_id && user?.id) {
      gravarBatidasPorDiaLocal(user.empresa_id, user.id, novasBatidas);
    } else if (storageKey) {
      const hojeBatidas = novasBatidas.filter((b) => diaLocalFromTimestamp(b.timestamp) === hoje);
      localStorage.setItem(storageKey, JSON.stringify(hojeBatidas));
    }
  }, [storageKey, user?.empresa_id, user?.id, hoje]);

  const iniciarCamera = async () => {
    setErroCamera(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraAtiva(true);
    } catch {
      setErroCamera('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    }
  };

  const pararCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraAtiva(false);
  }, []);

  const capturarFoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 320, 320);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    setFotoCapturada(dataUrl);
    pararCamera();
  };

  const abrirSeletorTipo = () => {
    setTipoSelecionado(null);
    setModalSeletorTipo(true);
  };

  const escolherTipoBatida = (tipo: TipoBatida) => {
    setTipoSelecionado(tipo);
    setModalSeletorTipo(false);
    setFotoCapturada(null);
    setErroCamera(null);
    setModalCamera(true);
    setTimeout(() => iniciarCamera(), 300);
  };

  const fecharModalCamera = () => {
    pararCamera();
    setFotoCapturada(null);
    setTipoSelecionado(null);
    setModalCamera(false);
  };

  const retirarFoto = () => {
    setFotoCapturada(null);
    iniciarCamera();
  };

  const confirmarRegistro = async () => {
    if (!tipoSelecionado) return;
    if (
      pontoEntradaSaida &&
      (tipoSelecionado === 'inicio_intervalo' || tipoSelecionado === 'fim_intervalo')
    ) {
      showToast('Para o seu cargo use apenas Entrada e Saída.', 'warning');
      return;
    }
    const semInternet = !navigator.onLine;
    if (!fotoCapturada && !semInternet) {
      showToast('Tire a foto antes de confirmar o registro.', 'warning');
      return;
    }

    if (!user?.empresa_id || !user?.id) {
      showToast('Usuário ou empresa não identificados.', 'warning');
      return;
    }

    setSalvandoPonto(true);
    const nova: BatidaPonto = {
      id: crypto.randomUUID(),
      tipo: tipoSelecionado,
      timestamp: new Date().toISOString(),
      observacao: observacao.trim() || undefined,
      foto: fotoCapturada || undefined,
    };

    const novasBatidas = [...batidas, nova];
    salvarBatidas(novasBatidas);

    const res = await enviarBatidaServidor({
      empresaId: user.empresa_id,
      userId: user.id,
      batida: nova,
    });
    atualizarContagemPendentes();

    if (res.offline) {
      showToast(
        `${nomeTipo[nova.tipo]} salva no aparelho${semInternet ? ' (sem internet)' : ''}. Sincroniza automaticamente depois.`,
        'success',
      );
    } else {
      showToast(`${nomeTipo[nova.tipo]} registrada no servidor.`, 'success');
    }

    setSalvandoPonto(false);
    setObservacao('');
    fecharModalCamera();
    void loadPontoDia();
  };

  const diaSemana = horaAtual.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFormatada = horaAtual.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registro de Ponto"
        subtitle="Controle de jornada de trabalho"
      />

      {(!online || pendentesSync > 0) && (
        <Card className="p-4 border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <WifiOff className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {!online ? 'Sem internet — ponto salvo neste aparelho' : 'Batidas aguardando envio'}
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                {!online
                  ? 'Você pode registrar normalmente. Quando a conexão voltar, enviamos automaticamente.'
                  : `${pendentesSync} marcação(ões) pendente(s) de sincronização.`}
              </p>
            </div>
          </div>
          {online && pendentesSync > 0 && (
            <Button
              size="sm"
              variant="outline"
              loading={sincronizando}
              onClick={() => void executarSincronizacao()}
              className="shrink-0 border-amber-300 text-amber-900 hover:bg-amber-100"
            >
              <CloudUpload className="h-4 w-4 mr-1" />
              Sincronizar agora
            </Button>
          )}
        </Card>
      )}

      {/* Cabeçalho com relógio e info do colaborador */}
      <Card className="p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center">
                <User className="h-6 w-6 text-white/80" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{user?.nome || 'Colaborador'}</h2>
                <div className="flex items-center gap-3 text-sm text-white/70 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {user?.role || 'Cargo não definido'}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {labelRegimePonto(pontoConfig.regime)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-bold tracking-wider">
                {horaAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <p className="text-sm text-white/60 capitalize mt-0.5">
                {diaSemana}, {dataFormatada}
              </p>
            </div>
          </div>
        </div>

        {pontoConfig.regime !== 'cargo_confianca' && (
          <>
            {jornadaIniciadaOntem && !jornadaFinalizada && (
              <div className="px-6 py-3 border-t bg-violet-50 border-violet-100 text-sm text-violet-900">
                <p>
                  <strong>
                    Jornada iniciada em{' '}
                    {new Date(`${diaInicioJornada}T12:00:00`).toLocaleDateString('pt-BR')}
                  </strong>{' '}
                  — as marcações desse plantão aparecem abaixo. Escolha o tipo que deseja registrar agora
                  (entrada, intervalo ou saída).
                </p>
              </div>
            )}

            {folga12x36Hoje && (
              <div className="px-6 py-3 border-t bg-gray-50 border-gray-100 text-sm text-gray-700">
                <p>
                  <strong>Escala 12x36 — dia de folga.</strong> Se estiver trabalhando hoje (turno extra ou dia seguido),
                  registre entrada, intervalo e saída normalmente — não precisa de autorização prévia.
                </p>
              </div>
            )}

            {/* Barra de progresso da jornada */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600 font-medium">Progresso da jornada</span>
                <span className="font-semibold text-gray-900">{percentualJornada}%</span>
              </div>
              <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    jornadaFinalizada
                      ? saldoMinutos >= 0 ? 'bg-green-500' : 'bg-amber-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${percentualJornada}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 mt-1.5">
                <span>Trabalhado: <strong className="text-gray-700">{formatarDuracaoPonto(minutosTrabalhados)}</strong></span>
                <span>
                  Meta:{' '}
                  <strong className="text-gray-700">
                    {metaDiaHoje > 0 ? formatarDuracaoPonto(metaDiaHoje) : labelMetaHoje}
                  </strong>
                </span>
              </div>
            </div>
          </>
        )}
      </Card>

      {pontoConfig.regime === 'cargo_confianca' ? (
        <Card className="p-6 text-center border-l-4 border-l-amber-500 bg-amber-50/20">
          <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <Briefcase className="h-6 w-6 text-amber-700" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Cargo de Confiança</h3>
          <p className="text-sm text-slate-600 mt-2 max-w-lg mx-auto leading-relaxed">
            Você está enquadrado no regime de <strong>Cargo de Confiança</strong> (Art. 62, II da CLT).
            Desta forma, você é isento de controle de jornada de trabalho e de registro de ponto.
          </p>
        </Card>
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 border-l-4 border-l-blue-500">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Horas Trabalhadas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 font-mono">{formatarDuracaoPonto(minutosTrabalhados)}</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-violet-500">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Meta Diária</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 font-mono">
                {metaDiaHoje > 0 ? formatarDuracaoPonto(metaDiaHoje) : labelMetaHoje}
              </p>
            </Card>
            <Card className={`p-4 border-l-4 ${saldoMinutos >= 0 ? 'border-l-green-500' : 'border-l-amber-500'}`}>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Saldo do Dia</p>
              <p className={`text-2xl font-bold mt-1 font-mono ${saldoMinutos >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                {saldoMinutos > 0 ? '+' : ''}{formatarDuracaoPonto(saldoMinutos)}
              </p>
            </Card>
          </div>

          {/* Ação de registro */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                <h3 className="text-base font-semibold text-gray-900">Marcação de Ponto</h3>
              </div>
              <Badge variant="info">
                {batidas.length === 0
                  ? 'Nenhuma marcação'
                  : `${batidas.length} marcação(ões)`}
              </Badge>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4">
              {pontoEntradaSaida ? (
                <>
                  Registre <strong>Entrada</strong> ao chegar e <strong>Saída</strong> ao encerrar o expediente.
                  São duas marcações por dia.
                </>
              ) : (
                <>
                  Registre quando quiser: <strong>folga, sábado, domingo ou turno noturno</strong> — escolha o tipo
                  (entrada, intervalo ou saída) e confirme.
                </>
              )}
            </p>

            {proximaBatida && (
              <div className={`rounded-xl border p-3 mb-4 ${
                proximaBatida === 'saida' && pontoEntradaSaida
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-dashed border-gray-200 bg-gray-50'
              }`}>
                <p className="text-xs text-gray-500 font-medium mb-0.5">
                  {proximaBatida === 'saida' && pontoEntradaSaida ? 'Próximo passo' : 'Sugestão (opcional)'}
                </p>
                <div className="flex items-center gap-2 text-gray-700">
                  {iconeTipo[proximaBatida]}
                  <span className="text-sm font-semibold">{LABEL_TIPO_BATIDA[proximaBatida]}</span>
                </div>
              </div>
            )}

            <Textarea
              label="Observação (opcional)"
              placeholder="Ex.: plantão, convocação, visita externa, retorno do intervalo..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />

            <div className="flex flex-wrap gap-3 mt-4">
              <Button
                onClick={abrirSeletorTipo}
                disabled={salvandoPonto}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
              >
                <Clock className="h-4 w-4 mr-2" />
                Registrar Ponto
              </Button>
              {!online && (
                <Button
                  variant="outline"
                  disabled={salvandoPonto}
                  onClick={abrirSeletorTipo}
                >
                  <WifiOff className="h-4 w-4 mr-2" />
                  Registrar offline
                </Button>
              )}
            </div>

            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Camera className="h-3 w-3" />
              {online
                ? 'Escolha o tipo de marcação e confirme com foto'
                : 'Escolha o tipo — sem internet a foto é opcional'}
            </p>
          </Card>
        </>
      )}

      {/* Timeline de marcações */}
      <Card className="p-6 relative">
        <h3 className="text-base font-semibold text-gray-900 mb-5">
          Marcações {jornadaIniciadaOntem ? 'do plantão' : 'do dia'}
        </h3>
        {loadingDb && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/80">
            <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
            <span className="text-sm font-medium text-gray-600">Carregando marcações...</span>
          </div>
        )}
        {!loadingDb && !batidas.length ? (
          <div className="text-center py-8">
            <Clock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Nenhuma marcação registrada hoje.</p>
            <p className="text-xs text-gray-400 mt-1">Clique em &quot;Registrar Ponto&quot; e escolha o tipo de marcação.</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-gray-200" />
            <div className="space-y-0">
              {batidas.map((batida, index) => {
                const diaBatida = diaLocalFromTimestamp(batida.timestamp);
                const diaAnteriorBatida =
                  index > 0 ? diaLocalFromTimestamp(batidas[index - 1].timestamp) : null;
                const mostrarSeparadorDia = diaAnteriorBatida && diaBatida !== diaAnteriorBatida;

                return (
                <React.Fragment key={batida.id}>
                  {mostrarSeparadorDia && (
                    <div className="relative flex items-center gap-3 pb-4 pl-14">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2 py-1 rounded">
                        {new Date(`${diaBatida}T12:00:00`).toLocaleDateString('pt-BR', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                      <div className="flex-1 h-px bg-violet-200" />
                    </div>
                  )}
                <div className="relative flex items-start gap-4 pb-6 last:pb-0">
                  <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${corTipo[batida.tipo]} shadow-sm`}>
                    {iconeTipo[batida.tipo]}
                  </div>
                  <div className="flex-1 pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${corTextoTipo[batida.tipo]}`}>
                          {nomeTipo[batida.tipo]}
                          {idsPendentesEnvio.has(batida.id) && (
                            <span className="ml-2 text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              pendente envio
                            </span>
                          )}
                        </p>
                        {batida.observacao && (
                          <p className="text-xs text-gray-500 mt-0.5 italic">"{batida.observacao}"</p>
                        )}
                        {index < batidas.length - 1 && (batida.tipo === 'entrada' || batida.tipo === 'fim_intervalo') && (
                          <p className="text-[11px] text-gray-400 mt-1">
                            Duração até próxima: {(() => {
                              const proxBatida = batidas[index + 1];
                              if (!proxBatida) return '--';
                              const diff = Math.round((new Date(proxBatida.timestamp).getTime() - new Date(batida.timestamp).getTime()) / 60000);
                              return formatarDuracaoPonto(diff);
                            })()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {batida.foto && (
                          <img
                            src={batida.foto}
                            alt={`Foto - ${nomeTipo[batida.tipo]}`}
                            className="h-10 w-10 rounded-lg object-cover border border-gray-200 shadow-sm"
                          />
                        )}
                        <span className="text-sm font-mono font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md">
                          {formatarHora(batida.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                </React.Fragment>
              );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Seletor de tipo de batida */}
      <Modal
        isOpen={modalSeletorTipo}
        onClose={() => setModalSeletorTipo(false)}
        title="Registrar Ponto"
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 text-center">
            O que você está registrando agora?
          </p>
          <div className="grid grid-cols-1 gap-2">
            {tiposDisponiveis.map((tipo) => {
              const sugerido = tipo === proximaBatida;
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => escolherTipoBatida(tipo)}
                  className={`flex items-center gap-3 w-full rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    sugerido
                      ? 'border-blue-300 bg-blue-50 hover:bg-blue-100'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${corTipo[tipo]}`}>
                    {iconeTipo[tipo]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${corTextoTipo[tipo]}`}>
                      {LABEL_TIPO_BATIDA[tipo]}
                    </p>
                    {sugerido && (
                      <p className="text-[11px] text-blue-600 font-medium">Sugestão</p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Modal de captura de foto */}
      <Modal isOpen={modalCamera} onClose={fecharModalCamera} title={tipoSelecionado ? `Registrar ${LABEL_TIPO_BATIDA[tipoSelecionado]}` : 'Registro'} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            Tire uma foto para confirmar sua marcação de ponto.
          </p>

          <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-xl overflow-hidden bg-gray-900">
            {!fotoCapturada && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            )}

            {fotoCapturada && (
              <img
                src={fotoCapturada}
                alt="Foto capturada"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            )}

            {!cameraAtiva && !fotoCapturada && !erroCamera && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-white/70">
                  <Camera className="h-10 w-10 mx-auto mb-2 animate-pulse" />
                  <p className="text-sm">Iniciando câmera...</p>
                </div>
              </div>
            )}

            {erroCamera && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="text-center text-white/80">
                  <X className="h-10 w-10 mx-auto mb-2 text-red-400" />
                  <p className="text-sm">{erroCamera}</p>
                </div>
              </div>
            )}

            {fotoCapturada && (
              <div className="absolute bottom-2 left-2 right-2 flex justify-center">
                <Badge variant="success">Foto capturada</Badge>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex justify-center gap-3">
            {!fotoCapturada && cameraAtiva && (
              <Button onClick={capturarFoto} className="bg-blue-600 hover:bg-blue-700 text-white px-8">
                <Camera className="h-4 w-4 mr-2" />
                Tirar Foto
              </Button>
            )}

            {fotoCapturada && (
              <>
                <Button variant="outline" onClick={retirarFoto} disabled={salvandoPonto}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tirar Outra
                </Button>
                <Button onClick={confirmarRegistro} disabled={salvandoPonto} className="bg-green-600 hover:bg-green-700 text-white px-6">
                  {salvandoPonto ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Confirmar Registro'
                  )}
                </Button>
              </>
            )}

            {erroCamera && (
              <Button variant="outline" onClick={() => iniciarCamera()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Tentar Novamente
              </Button>
            )}

            {!online && !fotoCapturada && (
              <Button
                onClick={confirmarRegistro}
                disabled={salvandoPonto}
                className="bg-green-600 hover:bg-green-700 text-white px-6"
              >
                Confirmar sem foto (offline)
              </Button>
            )}
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400">
              Horário da marcação: <strong>{horaAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};

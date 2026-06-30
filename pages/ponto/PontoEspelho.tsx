import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge, Button, Card, Input, Select } from '../../components/ui/Components';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useFilial } from '../../lib/FilialContext';
import { listarColaboradoresPonto, type ColaboradorPonto } from '../../lib/pontoColaboradores';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import {
  canEditarFolhaPonto,
  canVerEspelhoPontoTodosColaboradores,
  diaFechadoParaSaldoMensal,
  getUserPontoConfig,
  jornadaPontoFinalizada,
  labelRegimePonto,
  normalizarBatidasAfdDia,
  usaPontoApenasEntradaSaida,
} from '../../lib/pontoRules';
import {
  diaAntesInicioPonto,
  diaExigeRegistroPonto,
  isDiaExtra12x36,
  isDiaFolga12x36,
  isDiaHoraExtra,
  isDomingoLocal,
  isRegime12x36,
  isSabadoFolgaEscala,
  isSabadoLocal,
  isSabadoTrabalhoEscala,
  metaMinutosNoDia,
  temEscalaSabadoAlternado,
} from '../../lib/pontoEscala';
import {
  carregarFiliaisEmpresas,
  carregarFilialCobradores,
  listarFeriadosColaborador,
  montarFeriadosPorColaborador,
  isDiaFeriado,
} from '../../lib/pontoFeriados';
import {
  isDiaFerias,
  listarFeriasColaborador,
  type FeriasPeriodo,
} from '../../lib/pontoFerias';
import {
  type BatidaPonto,
  type TipoBatida,
  batidaEhAjusteManual,
  batidasDoTipo,
  batidaEmDiaPosterior,
  calcularTrabalhadoMinutos,
  consolidarEPrepararBatidasEspelho,
  diaLocalFromTimestamp,
  formatarDuracaoPonto,
  formatarHoraPontoExibicao,
  getDataLocalISO,
  intervaloMesComMargemJornada,
  mergeBatidasPorId,
  normalizarOrigemBatidaPonto,
} from '../../lib/pontoUtils';
import { EditarDiaPontoModal } from './EditarDiaPontoModal';
import {
  isDiaAtestado,
  isDiaFolgaManual,
  isDiaJustificadoPorOcorrencia,
  mapaOcorrenciasPorDia,
  type PontoDiaOcorrencia,
} from '../../lib/pontoDiaOcorrencia';
import { listarOcorrenciasDiaPonto } from '../../lib/pontoAdminService';
import { opcoesConsolidacaoJornadaMultidia } from '../../lib/ponto12x36Catalao';
import { Calendar, ChevronLeft, ChevronRight, Coffee, LogIn, LogOut, Pencil, Printer, RefreshCw, User, Camera, Search, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '../../lib/ToastStore';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const nomeTipo: Record<TipoBatida, string> = {
  entrada: 'Entrada',
  inicio_intervalo: 'Início Intervalo',
  fim_intervalo: 'Fim Intervalo',
  saida: 'Saída',
};

const calcularIntervaloMinutos = (batidas: BatidaPonto[]) => {
  const inicio = batidas.find(b => b.tipo === 'inicio_intervalo');
  const fim = batidas.find(b => b.tipo === 'fim_intervalo');
  if (!inicio || !fim) return 0;
  return Math.max(0, Math.round((new Date(fim.timestamp).getTime() - new Date(inicio.timestamp).getTime()) / 60000));
};

const getDiasNoMes = (ano: number, mes: number): string[] => {
  const dias: string[] = [];
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  for (let d = 1; d <= ultimoDia; d++) {
    dias.push(`${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dias;
};

const diaSemanaAbrev = (dataISO: string) => {
  const d = new Date(`${dataISO}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
};

const isFimDeSemana = (dataISO: string) => {
  const d = new Date(`${dataISO}T12:00:00`).getDay();
  return d === 0 || d === 6;
};

interface PontoEspelhoProps {
  modoRH?: boolean;
}

export const PontoEspelho: React.FC<PontoEspelhoProps> = ({ modoRH = false }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { empresaIdsFiltro, empresaIdOperacao, aguardandoContexto, dataRevisionEmpresa, empresaNomePorId } =
    useEmpresaIdsOperacao();
  const {
    visaoTodasEmpresasGrupo,
    empresasDoGrupo,
    podeAlternarEmpresa,
    dataRevisionEmpresa: revEmpresaCtx,
  } = useEmpresaContextoAtivo();
  const { filialId, isTodasFiliais, dataRevision: dataRevisionFilial } = useFilial();
  const podeVerEspelhoTodos = modoRH && canVerEspelhoPontoTodosColaboradores(user?.role, user?.permissoes);
  const podeEditarFolha = modoRH && canEditarFolhaPonto(user?.role, user?.permissoes);
  const hoje = new Date();

  const [activeTab, setActiveTab] = useState<'espelho' | 'graficos'>('espelho');
  const [mesRef, setMesRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  const [colaboradores, setColaboradores] = useState<ColaboradorPonto[]>([]);
  const [colabSelecionado, setColabSelecionado] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [buscaColab, setBuscaColab] = useState('');
  const [showColabDropdown, setShowColabDropdown] = useState(false);

  const lastColabRequestId = useRef(0);
  const lastRequestId = useRef(0);

  useEffect(() => {
    if (!podeVerEspelhoTodos) {
      if (user?.id) setColabSelecionado(user.id);
      return;
    }
    if (aguardandoContexto) {
      setLoading(true);
      return;
    }

    const ids = empresaIdsFiltro;
    if (ids.length === 0) {
      setColaboradores([]);
      return;
    }

    const load = async () => {
      const requestId = ++lastColabRequestId.current;
      setLoading(true);
      try {
        const lista = await listarColaboradoresPonto({
          empresaIdsFiltro: ids,
          empresaIdOperacao,
          empresasDoGrupo,
          visaoTodasEmpresasGrupo,
          podeAlternarEmpresa,
          filialId,
          isTodasFiliais,
        });
        if (requestId !== lastColabRequestId.current) return;

        setColaboradores(lista);
        const idsValidos = new Set(lista.map((c) => c.id));
        
        // Tenta obter o colabId dos parâmetros de busca da URL (HashRouter)
        const hash = window.location.hash;
        const queryIndex = hash.indexOf('?');
        let urlColabId = '';
        if (queryIndex !== -1) {
          const params = new URLSearchParams(hash.substring(queryIndex));
          urlColabId = params.get('colabId') || '';
        }

        if (urlColabId && idsValidos.has(urlColabId)) {
          setColabSelecionado(urlColabId);
        } else {
          const preferido = lista.find((c) => c.id === user?.id)?.id || lista[0]?.id || '';
          setColabSelecionado(preferido);
        }
      } catch (e) {
        if (requestId !== lastColabRequestId.current) return;
        console.error('[PontoEspelho] colaboradores', e);
        showToast('Não foi possível carregar a lista de colaboradores.', 'error');
        setColaboradores([]);
      } finally {
        if (requestId === lastColabRequestId.current) setLoading(false);
      }
    };
    void load();
  }, [
    podeVerEspelhoTodos,
    aguardandoContexto,
    empresaIdsFiltro.join(','),
    dataRevisionEmpresa,
    revEmpresaCtx,
    dataRevisionFilial,
    empresaIdOperacao,
    visaoTodasEmpresasGrupo,
    empresasDoGrupo,
    podeAlternarEmpresa,
    filialId,
    isTodasFiliais,
    user?.id,
    showToast,
  ]);

  const colaboradorAtual = useMemo(() => {
    if (colaboradores.length > 0) return colaboradores.find(c => c.id === colabSelecionado);
    if (!user) return undefined;
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      permissoes: user.permissoes,
      empresa_id: user.empresa_id,
    } as ColaboradorPonto;
  }, [colabSelecionado, colaboradores, user]);

  useEffect(() => {
    if (colaboradorAtual) {
      setBuscaColab(colaboradorAtual.nome || colaboradorAtual.email || '');
    } else {
      setBuscaColab('');
    }
  }, [colaboradorAtual]);

  const colaboradoresFiltrados = useMemo(() => {
    const term = buscaColab.toLowerCase().trim();
    const nomeAtual = (colaboradorAtual?.nome || '').toLowerCase().trim();
    const emailAtual = (colaboradorAtual?.email || '').toLowerCase().trim();

    if (!term || term === nomeAtual || term === emailAtual) {
      return colaboradores;
    }

    return colaboradores.filter((c) =>
      (c.nome || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term)
    );
  }, [colaboradores, buscaColab, colaboradorAtual]);

  const pontoConfig = getUserPontoConfig(colaboradorAtual?.permissoes);
  const empresaColaborador = (colaboradorAtual?.empresa_id || empresaIdOperacao || '').trim();
  const opcoesConsolidacao = opcoesConsolidacaoJornadaMultidia(empresaColaborador, pontoConfig);
  const margemDiasMes = opcoesConsolidacao?.multidiaMaxDias ?? 1;
  const cargaMetaMinutos = pontoConfig.carga_horaria_minutos;
  const espelhoEntradaSaida = usaPontoApenasEntradaSaida(colaboradorAtual?.role);

  const diasDoMes = useMemo(() => getDiasNoMes(mesRef.ano, mesRef.mes), [mesRef]);

  const [registrosPorDia, setRegistrosPorDia] = useState<Record<string, BatidaPonto[]>>({});
  const [ocorrenciasPorDia, setOcorrenciasPorDia] = useState<Record<string, PontoDiaOcorrencia>>({});
  const [loadingBatidas, setLoadingBatidas] = useState(false);
  const [feriadosColaborador, setFeriadosColaborador] = useState<ReadonlySet<string>>(new Set());
  const [feriasColaborador, setFeriasColaborador] = useState<FeriasPeriodo[]>([]);

  useEffect(() => {
    if (!colaboradorAtual?.id) {
      setFeriadosColaborador(new Set());
      setFeriasColaborador([]);
      return;
    }

    const loadFeriados = async () => {
      try {
        const empresaId = (colaboradorAtual.empresa_id || empresaIdOperacao || '').trim();
        const empresaIds = empresaId ? [empresaId] : empresaIdsFiltro;
        const [filiais, cobFilial] = await Promise.all([
          carregarFiliaisEmpresas(empresaIds),
          carregarFilialCobradores([colaboradorAtual.id]),
        ]);
        const inicio = `${mesRef.ano}-${String(mesRef.mes + 1).padStart(2, '0')}-01`;
        const fim = `${mesRef.ano}-${String(mesRef.mes + 1).padStart(2, '0')}-${String(new Date(mesRef.ano, mesRef.mes + 1, 0).getDate()).padStart(2, '0')}`;
        const [feriados, ferias] = await Promise.all([
          listarFeriadosColaborador(
            colaboradorAtual,
            filiais,
            cobFilial,
            empresaNomePorId,
            inicio,
            fim,
          ),
          listarFeriasColaborador(colaboradorAtual.id, empresaIds, inicio, fim),
        ]);
        setFeriadosColaborador(feriados);
        setFeriasColaborador(ferias);
      } catch (e) {
        console.warn('[PontoEspelho] feriados/ferias', e);
        setFeriadosColaborador(new Set());
        setFeriasColaborador([]);
      }
    };

    void loadFeriados();
  }, [
    colaboradorAtual?.id,
    colaboradorAtual?.empresa_id,
    mesRef.ano,
    mesRef.mes,
    empresaIdOperacao,
    empresaIdsFiltro.join(','),
    empresaNomePorId,
  ]);

  const [refreshTick, setRefreshTick] = useState(0);

  const loadBatidas = useCallback(async () => {
    if (!empresaColaborador || !colabSelecionado) {
      setRegistrosPorDia({});
      setOcorrenciasPorDia({});
      return;
    }

    const requestId = ++lastRequestId.current;
    setLoadingBatidas(true);
    const { inicio: startStr, fim: endStr } = intervaloMesComMargemJornada(mesRef.ano, mesRef.mes, margemDiasMes);

    try {
      let query = supabase
        .from('ponto_registros')
        .select('*')
        .eq('user_id', colabSelecionado)
        .eq('empresa_id', empresaColaborador)
        .gte('timestamp', startStr)
        .lte('timestamp', endStr)
        .order('timestamp');

      const primeiroDiaMes = `${mesRef.ano}-${String(mesRef.mes + 1).padStart(2, '0')}-01`;
      const ultimoDiaNum = new Date(mesRef.ano, mesRef.mes + 1, 0).getDate();
      const ultimoDiaMes = `${mesRef.ano}-${String(mesRef.mes + 1).padStart(2, '0')}-${String(ultimoDiaNum).padStart(2, '0')}`;

      const [{ data, error }, ocorrencias] = await Promise.all([
        query,
        listarOcorrenciasDiaPonto({
          empresaId: empresaColaborador,
          userId: colabSelecionado,
          dataInicio: primeiroDiaMes,
          dataFim: ultimoDiaMes,
        }).catch((err) => {
          console.warn('[PontoEspelho] ocorrencias', err);
          return [] as PontoDiaOcorrencia[];
        }),
      ]);
      if (error) throw error;

      if (requestId !== lastRequestId.current) return;

      const mapa: Record<string, BatidaPonto[]> = {};
      for (const row of data || []) {
        const batida: BatidaPonto = {
          id: row.id,
          tipo: row.tipo as TipoBatida,
          timestamp: row.timestamp,
          observacao: row.observacao || undefined,
          foto: row.foto || undefined,
          origem: normalizarOrigemBatidaPonto(row.origem),
          ajustado_por: row.ajustado_por || undefined,
          motivo_ajuste: row.motivo_ajuste || undefined,
        };
        const dia = diaLocalFromTimestamp(batida.timestamp);
        if (!dia) continue;
        mapa[dia] = mergeBatidasPorId(mapa[dia] || [], [batida]);
      }

      for (const dia of Object.keys(mapa)) {
        mapa[dia] = normalizarBatidasAfdDia(mapa[dia]);
      }

      if (requestId !== lastRequestId.current) return;
      setRegistrosPorDia(mapa);
      setOcorrenciasPorDia(mapaOcorrenciasPorDia(ocorrencias));
    } catch (err) {
      if (requestId !== lastRequestId.current) return;
      console.warn('Erro ao buscar registros de ponto do Supabase:', err);
      setRegistrosPorDia({});
      setOcorrenciasPorDia({});
    } finally {
      if (requestId === lastRequestId.current) {
        setLoadingBatidas(false);
      }
    }
  }, [colabSelecionado, mesRef.ano, mesRef.mes, diasDoMes, empresaColaborador, margemDiasMes]);

  useEffect(() => {
    void loadBatidas();
  }, [loadBatidas, refreshTick]);

  useEffect(() => {
    const onFocus = () => setRefreshTick((n) => n + 1);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const [visualizarFoto, setVisualizarFoto] = useState<{ url: string; tipo: string; dia: string } | null>(null);
  const [diaEmEdicao, setDiaEmEdicao] = useState<string | null>(null);

  const registrosConsolidados = useMemo(
    () => consolidarEPrepararBatidasEspelho(registrosPorDia, diasDoMes, opcoesConsolidacao),
    [registrosPorDia, diasDoMes, opcoesConsolidacao],
  );

  const temAjusteManualNoMes = useMemo(
    () => Object.values(registrosConsolidados).some((batidas) => batidas.some(batidaEhAjusteManual)),
    [registrosConsolidados],
  );

  const renderTimeCell = (batida?: BatidaPonto, diaLinha?: string) => {
    if (!batida) return <span className="text-gray-300">--:--</span>;
    const manual = batidaEhAjusteManual(batida);
    return (
      <span
        className={`inline-flex items-center gap-1.5 justify-center ${manual ? 'text-amber-800 font-semibold' : ''}`}
        title={manual ? (batida.motivo_ajuste || 'Horário ajustado manualmente') : undefined}
      >
        {formatarHoraPontoExibicao(batida)}
        {diaLinha && batida.tipo === 'saida' && batidaEmDiaPosterior(batida, diaLinha) && (
          <span className="text-[10px] text-indigo-600 font-sans" title="Saída no dia civil seguinte">
            +1
          </span>
        )}
        {batida.foto && (
          <button
            onClick={() => setVisualizarFoto({
              url: batida.foto!,
              tipo: nomeTipo[batida.tipo],
              dia: new Date(batida.timestamp).toLocaleDateString('pt-BR')
            })}
            className="text-indigo-600 hover:text-indigo-800 transition-colors p-0.5 rounded hover:bg-indigo-50 print:hidden"
            title="Ver foto registrada"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  };

  const renderBatidasTipoCell = (batidasDia: BatidaPonto[], tipo: TipoBatida, diaLinha?: string) => {
    const lista = batidasDoTipo(batidasDia, tipo);
    if (!lista.length) return <span className="text-gray-300">--:--</span>;
    return (
      <div className="flex flex-col items-center gap-0.5">
        {lista.map((batida) => (
          <span key={batida.id}>{renderTimeCell(batida, diaLinha)}</span>
        ))}
      </div>
    );
  };

  const resumoMensal = useMemo(() => {
    let totalTrabalhado = 0;
    let totalMeta = 0;
    let diasTrabalhados = 0;
    let diasFalta = 0;
    let diasFolga = 0;
    let diasAtestado = 0;
    let diasExtra = 0;
    let minutosExtra = 0;

    const hojeStr = getDataLocalISO(hoje);

    for (const dia of diasDoMes) {
      if (dia > hojeStr) break;
      if (diaAntesInicioPonto(pontoConfig, dia)) continue;

      const batidas = registrosConsolidados[dia] || [];
      const ocorrencia = ocorrenciasPorDia[dia];
      const folgaManual = isDiaFolgaManual(ocorrencia);
      const atestado = isDiaAtestado(ocorrencia);
      const feriadoManual = ocorrencia?.tipo === 'feriado';
      const jornadaNormalManual = ocorrencia?.tipo === 'jornada_normal';
      const horaExtraManual = ocorrencia?.tipo === 'hora_extra';
      
      const justificado = folgaManual || atestado || feriadoManual || horaExtraManual;
      const minutosTrabalhadosDia = calcularTrabalhadoMinutos(batidas);
      const temBatida = batidas.length > 0;
      
      let metaDia = metaMinutosNoDia(pontoConfig, dia, temBatida, feriadosColaborador, feriasColaborador);
      if (jornadaNormalManual) {
        metaDia = pontoConfig.carga_horaria_minutos;
      } else if (justificado) {
        metaDia = 0;
      }

      const extraDia = isDiaExtra12x36(pontoConfig, dia, temBatida) || horaExtraManual || (isDiaHoraExtra(pontoConfig, dia, temBatida) && !jornadaNormalManual);
      const contaNoSaldo = diaFechadoParaSaldoMensal(
        dia,
        hojeStr,
        batidas,
        colaboradorAtual?.role,
      );

      if (contaNoSaldo) {
        totalMeta += metaDia;
      }

      if (justificado) {
        if (folgaManual) diasFolga++;
        if (atestado) diasAtestado++;
        if (feriadoManual) diasFolga++;
        if (horaExtraManual && temBatida) {
          if (contaNoSaldo) {
            totalTrabalhado += minutosTrabalhadosDia;
          }
          diasTrabalhados++;
          if (contaNoSaldo) {
            diasExtra++;
            minutosExtra += minutosTrabalhadosDia;
          }
        }
      } else if (temBatida) {
        if (contaNoSaldo) {
          totalTrabalhado += minutosTrabalhadosDia;
        }
        diasTrabalhados++;
        if (extraDia && contaNoSaldo) {
          diasExtra++;
          minutosExtra += minutosTrabalhadosDia;
        }
      } else if (contaNoSaldo && (jornadaNormalManual || diaExigeRegistroPonto(pontoConfig, dia, temBatida, feriadosColaborador, feriasColaborador))) {
        diasFalta++;
      } else if (isDiaFerias(dia, feriasColaborador)) {
        diasFolga++;
      } else if (isDiaFeriado(dia, feriadosColaborador) || isDiaFolga12x36(pontoConfig, dia, temBatida)) {
        diasFolga++;
      }
    }

    return {
      totalTrabalhado,
      totalMeta,
      saldo: totalTrabalhado - totalMeta,
      diasTrabalhados,
      diasFalta,
      diasFolga,
      diasAtestado,
      diasExtra,
      minutosExtra,
    };
  }, [diasDoMes, registrosConsolidados, ocorrenciasPorDia, pontoConfig, feriadosColaborador, feriasColaborador, colaboradorAtual?.role]);

  const dadosGraficoDiario = useMemo(() => {
    if (!colaboradorAtual) return [];

    return diasDoMes.map((dia) => {
      const batidas = registrosConsolidados[dia] || [];
      const temBatida = batidas.length > 0;
      const trabalhadoMinutos = calcularTrabalhadoMinutos(batidas);
      const metaMinutos = metaMinutosNoDia(pontoConfig, dia, temBatida, feriadosColaborador, feriasColaborador);
      const diaFormatado = dia.slice(8);

      return {
        dia: diaFormatado,
        dataCompleta: dia,
        "Horas Trabalhadas": Number((trabalhadoMinutos / 60).toFixed(1)),
        "Meta de Horas": Number((metaMinutos / 60).toFixed(1)),
      };
    });
  }, [diasDoMes, registrosConsolidados, pontoConfig, feriadosColaborador, feriasColaborador, colaboradorAtual]);

  const navegarMes = (dir: -1 | 1) => {
    setMesRef(prev => {
      let novoMes = prev.mes + dir;
      let novoAno = prev.ano;
      if (novoMes < 0) { novoMes = 11; novoAno--; }
      if (novoMes > 11) { novoMes = 0; novoAno++; }
      return { ano: novoAno, mes: novoMes };
    });
  };

  const nomeMes = new Date(mesRef.ano, mesRef.mes).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const carregandoEspelho = aguardandoContexto || loading || loadingBatidas;

  const handleImprimir = () => window.print();

  return (
    <div className="space-y-6">
      <PageHeader
        title={podeVerEspelhoTodos ? 'Espelho de Ponto' : 'Meu espelho de ponto'}
        subtitle={
          podeVerEspelhoTodos
            ? 'Relatório consolidado de horas trabalhadas por colaborador'
            : 'Suas horas no período — você não vê a folha de outros colaboradores'
        }
        actionButton={
          <div className="flex gap-2 print:hidden">
            <Button
              variant="outline"
              onClick={() => setRefreshTick((n) => n + 1)}
              disabled={loadingBatidas}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingBatidas ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button variant="outline" onClick={handleImprimir}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </div>
        }
      />

      {/* Filtros */}
      <Card className="p-4 print:hidden !overflow-visible">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          {podeVerEspelhoTodos && colaboradores.length > 0 && (
            <div className="w-full sm:w-80 relative z-30">
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider ml-1 mb-1.5">
                Colaborador
              </label>
              <div className="relative group">
                <Search className="absolute left-3.5 top-3 h-5 w-5 text-gray-400 dark:text-slate-500 group-hover:text-gray-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Pesquise por nome ou e-mail..."
                  value={buscaColab}
                  onChange={(e) => {
                    setBuscaColab(e.target.value);
                    setShowColabDropdown(true);
                  }}
                  onFocus={(e) => {
                    e.target.select();
                    setShowColabDropdown(true);
                  }}
                  onBlur={() => setTimeout(() => setShowColabDropdown(false), 200)}
                  className="pl-11 pr-10 h-11 w-full rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 px-4 py-2 text-sm text-gray-900 dark:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent focus:bg-white dark:focus:bg-slate-900 group-hover:border-gray-300 dark:group-hover:border-slate-700 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowColabDropdown((prev) => !prev)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <ChevronsUpDown className="h-5 w-5" />
                </button>
              </div>

              {/* Dropdown de Resultados */}
              {showColabDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1.5 max-h-72 overflow-y-auto bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-xl z-50 divide-y divide-gray-50 dark:divide-slate-800/50 custom-scrollbar">
                  {colaboradoresFiltrados.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400 dark:text-slate-500 italic">
                      Nenhum colaborador encontrado.
                    </div>
                  ) : (
                    colaboradoresFiltrados.map((c) => {
                      const isSelected = colabSelecionado === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setColabSelecionado(c.id);
                            setBuscaColab(c.nome || c.email);
                            setShowColabDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 ${
                            isSelected
                              ? 'bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 font-semibold'
                              : 'text-gray-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{c.nome || 'Sem nome'}</span>
                            <span className="text-xs text-gray-400 dark:text-slate-500">{c.email}</span>
                          </div>
                          {isSelected && <Check className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400 shrink-0 ml-2" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={() => navegarMes(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-4 py-2 bg-gray-50 rounded-lg border text-sm font-medium text-gray-700 capitalize min-w-[160px] text-center">
              <Calendar className="h-4 w-4 inline mr-2 text-gray-400" />
              {nomeMes}
            </div>
            <Button variant="outline" size="sm" onClick={() => navegarMes(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Header do colaborador no print */}
      {colaboradorAtual && (
        <Card className="p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 px-6 py-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-white/80" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">{colaboradorAtual.nome || 'Colaborador'}</h2>
                  <p className="text-sm text-white/70">
                    {colaboradorAtual.role || 'Sem cargo'} &middot; {labelRegimePonto(pontoConfig.regime)}
                    {isRegime12x36(pontoConfig)
                      ? ' · Meta 12h nos dias com batida de ponto'
                      : temEscalaSabadoAlternado(pontoConfig)
                        ? ` · Meta ${formatarDuracaoPonto(pontoConfig.carga_horaria_minutos)}/dia útil · ${formatarDuracaoPonto(pontoConfig.meta_sabado_minutos ?? 4 * 60)} no sábado de plantão`
                        : pontoConfig.regime === 'cargo_confianca'
                          ? ' · Isento de registro de ponto'
                          : ` · Meta: ${formatarDuracaoPonto(cargaMetaMinutos)}/dia útil`}
                  </p>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm text-white/60">Período</p>
                <p className="font-semibold capitalize">{nomeMes}</p>
              </div>
            </div>
          </div>

          {/* Resumo mensal */}
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-gray-100">
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500 uppercase font-semibold">Trabalhado</p>
              <p className="text-xl font-bold text-gray-900 font-mono mt-1">{formatarDuracaoPonto(resumoMensal.totalTrabalhado)}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500 uppercase font-semibold">Meta</p>
              <p className="text-xl font-bold text-gray-900 font-mono mt-1">{formatarDuracaoPonto(resumoMensal.totalMeta)}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500 uppercase font-semibold">Saldo</p>
              <p className={`text-xl font-bold font-mono mt-1 ${resumoMensal.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {resumoMensal.saldo > 0 ? '+' : ''}{formatarDuracaoPonto(resumoMensal.saldo)}
              </p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500 uppercase font-semibold">Dias Trab.</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{resumoMensal.diasTrabalhados}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500 uppercase font-semibold">Faltas</p>
              <p className={`text-xl font-bold mt-1 ${resumoMensal.diasFalta > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {resumoMensal.diasFalta}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabs Navigation */}
      <div className="border-b border-gray-250 flex gap-4 print:hidden my-4">
        <button
          onClick={() => setActiveTab('espelho')}
          className={`py-3 px-1 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'espelho'
              ? 'border-indigo-650 text-indigo-750'
              : 'border-transparent text-gray-450 hover:text-gray-700'
          }`}
        >
          Espelho de Ponto
        </button>
        <button
          onClick={() => setActiveTab('graficos')}
          className={`py-3 px-1 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'graficos'
              ? 'border-indigo-650 text-indigo-750'
              : 'border-transparent text-gray-450 hover:text-gray-700'
          }`}
        >
          Gráficos de Horas
        </button>
      </div>

      {activeTab === 'espelho' && (
        <>
          {(podeEditarFolha || temAjusteManualNoMes) && (
            <p className="text-xs text-gray-600 print:text-gray-800">
              <span className="font-semibold text-amber-800">*</span> = horário lançado ou corrigido manualmente pelo
              administrador/gestor.
              {podeEditarFolha && (
                <span className="print:hidden"> Clique no lápis na linha do dia para ajustar.</span>
              )}
            </p>
          )}

          {/* Tabela detalhada por dia */}
          <Card className="p-0 overflow-hidden relative min-h-[280px]">
        {carregandoEspelho && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
              <span className="text-sm font-medium text-gray-600">
                {aguardandoContexto ? 'Preparando contexto da unidade...' : 'Buscando batidas de ponto...'}
              </span>
            </div>
          </div>
        )}
        <div className="overflow-x-auto max-h-[min(720px,calc(100vh-220px))] print:max-h-none">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20 print:static">
              <tr className="bg-slate-800 text-white uppercase text-[10px] font-black tracking-wider">
                <th className="text-left px-3 py-2.5 border border-slate-600 w-20 sticky left-0 z-30 bg-slate-800 print:static">Data</th>
                <th className="text-left px-3 py-2.5 border border-slate-600 w-12 sticky left-20 z-30 bg-slate-800 print:static">Dia</th>
                <th className="text-center px-2 py-2.5 border border-slate-600 min-w-[72px]">
                  <span className="inline-flex items-center justify-center gap-1"><LogIn className="h-3 w-3 shrink-0" /> Entrada</span>
                </th>
                {!espelhoEntradaSaida && (
                  <>
                    <th className="text-center px-2 py-2.5 border border-slate-600 min-w-[80px]">
                      <span className="inline-flex items-center justify-center gap-1"><Coffee className="h-3 w-3 shrink-0" /> Ini. Intervalo</span>
                    </th>
                    <th className="text-center px-2 py-2.5 border border-slate-600 min-w-[80px]">
                      <span className="inline-flex items-center justify-center gap-1"><LogIn className="h-3 w-3 shrink-0" /> Fim Intervalo</span>
                    </th>
                  </>
                )}
                <th className="text-center px-2 py-2.5 border border-slate-600 min-w-[72px]">
                  <span className="inline-flex items-center justify-center gap-1"><LogOut className="h-3 w-3 shrink-0" /> Saída</span>
                </th>
                {!espelhoEntradaSaida && (
                  <th className="text-center px-2 py-2.5 border border-slate-600 min-w-[64px]">Intervalo</th>
                )}
                <th className="text-center px-2 py-2.5 border border-slate-600 min-w-[72px]">Trabalhado</th>
                <th className="text-center px-2 py-2.5 border border-slate-600 min-w-[64px]">Saldo</th>
                <th className="text-center px-2 py-2.5 border border-slate-600 min-w-[88px]">Status</th>
                {podeEditarFolha && (
                  <th className="text-center px-2 py-2.5 border border-slate-600 w-12 print:hidden">Ações</th>
                )}
              </tr>
            </thead>
            <tbody>
              {diasDoMes.map(dia => {
                const batidas = registrosConsolidados[dia] || [];
                const ocorrencia = ocorrenciasPorDia[dia];
                const folgaManual = isDiaFolgaManual(ocorrencia);
                const atestado = isDiaAtestado(ocorrencia);
                const feriadoManual = ocorrencia?.tipo === 'feriado';
                const jornadaNormalManual = ocorrencia?.tipo === 'jornada_normal';
                const horaExtraManual = ocorrencia?.tipo === 'hora_extra';
                
                const justificado = folgaManual || atestado || feriadoManual || horaExtraManual;
                const fds = isFimDeSemana(dia);
                const futuro = dia > getDataLocalISO(hoje);
                const diaNum = dia.slice(8);
                const diaSem = diaSemanaAbrev(dia);

                const minutostrab = calcularTrabalhadoMinutos(batidas);
                const intervaloMin = calcularIntervaloMinutos(batidas);
                const temBatida = batidas.length > 0;
                
                let metaDia = metaMinutosNoDia(pontoConfig, dia, temBatida, feriadosColaborador, feriasColaborador);
                if (jornadaNormalManual) {
                  metaDia = pontoConfig.carga_horaria_minutos;
                } else if (justificado) {
                  metaDia = 0;
                }

                const saldoDia = minutostrab - metaDia;
                const hojeStr = getDataLocalISO(hoje);
                const jornadaFechada = jornadaPontoFinalizada(batidas, colaboradorAtual?.role);
                const diaEmAberto = dia === hojeStr && !jornadaFechada;
                const antesInicio = diaAntesInicioPonto(pontoConfig, dia);
                const folga12x36 = isDiaFolga12x36(pontoConfig, dia, temBatida) && !futuro;
                const extra12x36 = isDiaExtra12x36(pontoConfig, dia, temBatida) && !futuro;
                const horaExtra = (isDiaHoraExtra(pontoConfig, dia, temBatida) || horaExtraManual) && !jornadaNormalManual && !futuro;
                const sabadoPlantao = isSabadoTrabalhoEscala(pontoConfig, dia);
                const sabadoFolgaEscala = isSabadoFolgaEscala(pontoConfig, dia);
                const feriado = isDiaFeriado(dia, feriadosColaborador) && !futuro;
                const ferias = isDiaFerias(dia, feriasColaborador) && !futuro && !temBatida;
                
                const ocultarSaldo = futuro || antesInicio || feriado || ferias || (justificado && !horaExtraManual) || folga12x36
                  || diaEmAberto
                  || (metaDia === 0 && !temBatida);
                const rowBg = fds ? 'bg-slate-50/80' : 'bg-white';

                let statusBadge: React.ReactNode = null;
                if (pontoConfig.regime === 'cargo_confianca') {
                  statusBadge = <Badge variant="info" className="bg-slate-50 border-slate-200 text-slate-500">Isento</Badge>;
                } else if (antesInicio) {
                  statusBadge = <span className="text-xs text-gray-400">—</span>;
                } else if (futuro) {
                  statusBadge = <span className="text-xs text-gray-400">—</span>;
                } else if (feriado) {
                  statusBadge = <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">Feriado</Badge>;
                } else if (ferias) {
                  statusBadge = <Badge variant="outline" className="bg-teal-50 border-teal-200 text-teal-700">Férias</Badge>;
                } else if (atestado) {
                  statusBadge = (
                    <span title={ocorrencia?.motivo}>
                      <Badge variant="outline" className="bg-sky-50 border-sky-200 text-sky-700">
                        Atestado
                      </Badge>
                    </span>
                  );
                } else if (folgaManual) {
                  statusBadge = (
                    <span title={ocorrencia?.motivo}>
                      <Badge variant="outline" className="bg-violet-50 border-violet-200 text-violet-700">
                        Folga
                      </Badge>
                    </span>
                  );
                } else if (feriadoManual) {
                  statusBadge = (
                    <span title={ocorrencia?.motivo}>
                      <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-700">
                        Feriado
                      </Badge>
                    </span>
                  );
                } else if (horaExtraManual) {
                  statusBadge = (
                    <span title={ocorrencia?.motivo}>
                      <Badge variant="outline" className="bg-pink-50 border-pink-200 text-pink-700">
                        Hora Extra
                      </Badge>
                    </span>
                  );
                } else if (jornadaNormalManual) {
                  if (temBatida) {
                    if (jornadaFechada && saldoDia >= 0) {
                      statusBadge = <Badge variant="success">OK</Badge>;
                    } else if (jornadaFechada) {
                      statusBadge = <Badge variant="warning">Incompleto</Badge>;
                    } else {
                      statusBadge = <Badge variant="info">Parcial</Badge>;
                    }
                  } else {
                    statusBadge = <Badge variant="danger">Falta</Badge>;
                  }
                } else if (
                  folga12x36
                  || (sabadoFolgaEscala && !temBatida)
                  || (isDomingoLocal(dia) && !temBatida && (temEscalaSabadoAlternado(pontoConfig) || !isRegime12x36(pontoConfig)))
                  || (fds && !temBatida && !isRegime12x36(pontoConfig) && !temEscalaSabadoAlternado(pontoConfig))
                ) {
                  statusBadge = <Badge variant="outline">Folga</Badge>;
                } else if (temEscalaSabadoAlternado(pontoConfig) && isSabadoLocal(dia) && temBatida) {
                  if (jornadaFechada && saldoDia >= 0) {
                    statusBadge = <Badge variant="success">OK</Badge>;
                  } else if (jornadaFechada) {
                    statusBadge = <Badge variant="warning">Incompleto</Badge>;
                  } else {
                    statusBadge = <Badge variant="info">Parcial</Badge>;
                  }
                } else if (sabadoPlantao && temBatida) {
                  if (jornadaFechada && saldoDia >= 0) {
                    statusBadge = <Badge variant="success">OK</Badge>;
                  } else if (jornadaFechada) {
                    statusBadge = <Badge variant="warning">Incompleto</Badge>;
                  } else {
                    statusBadge = <Badge variant="info">Parcial</Badge>;
                  }
                } else if (extra12x36 || horaExtra) {
                  statusBadge = <Badge variant="info">Extra</Badge>;
                } else if (!justificado && (jornadaNormalManual || diaExigeRegistroPonto(pontoConfig, dia, temBatida, feriadosColaborador, feriasColaborador))) {
                  statusBadge = <Badge variant="danger">Falta</Badge>;
                } else if (jornadaFechada && saldoDia >= 0) {
                  statusBadge = <Badge variant="success">OK</Badge>;
                } else if (jornadaFechada) {
                  statusBadge = <Badge variant="warning">Incompleto</Badge>;
                } else if (temBatida) {
                  statusBadge = <Badge variant="info">Parcial</Badge>;
                } else {
                  statusBadge = <Badge variant="info">Aberto</Badge>;
                }

                return (
                  <tr
                    key={dia}
                    className={`border-b border-slate-200 ${rowBg} ${futuro || antesInicio ? 'opacity-40' : ''} hover:bg-indigo-50/40 transition-colors`}
                  >
                    <td className={`px-3 py-2 font-semibold text-gray-900 border border-slate-200 sticky left-0 z-10 ${rowBg}`}>{diaNum}/{String(mesRef.mes + 1).padStart(2, '0')}</td>
                    <td className={`px-3 py-2 text-[10px] uppercase font-bold border border-slate-200 sticky left-20 z-10 ${fds ? 'text-red-500' : 'text-gray-500'} ${rowBg}`}>{diaSem}</td>
                    <td className="px-2 py-2 text-center font-mono text-gray-700 border border-slate-200 tabular-nums">{renderBatidasTipoCell(batidas, 'entrada', dia)}</td>
                    {!espelhoEntradaSaida && (
                      <>
                        <td className="px-2 py-2 text-center font-mono text-gray-700 border border-slate-200 tabular-nums">{renderBatidasTipoCell(batidas, 'inicio_intervalo', dia)}</td>
                        <td className="px-2 py-2 text-center font-mono text-gray-700 border border-slate-200 tabular-nums">{renderBatidasTipoCell(batidas, 'fim_intervalo', dia)}</td>
                      </>
                    )}
                    <td className="px-2 py-2 text-center font-mono text-gray-700 border border-slate-200 tabular-nums">{renderBatidasTipoCell(batidas, 'saida', dia)}</td>
                    {!espelhoEntradaSaida && (
                      <td className="px-2 py-2 text-center font-mono text-gray-500 border border-slate-200 tabular-nums">{temBatida && intervaloMin > 0 ? formatarDuracaoPonto(intervaloMin) : <span className="text-gray-300">--:--</span>}</td>
                    )}
                    <td className="px-2 py-2 text-center font-mono font-medium text-gray-900 border border-slate-200 tabular-nums">{temBatida ? formatarDuracaoPonto(minutostrab) : <span className="text-gray-300">--:--</span>}</td>
                    <td className={`px-2 py-2 text-center font-mono font-medium border border-slate-200 tabular-nums ${
                      ocultarSaldo && !diaEmAberto ? 'text-gray-300' :
                      !ocultarSaldo && saldoDia >= 0 ? 'text-green-600' : !ocultarSaldo ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      {diaEmAberto && temBatida ? (
                        <span className="text-[10px] italic font-sans">Aberto</span>
                      ) : ocultarSaldo ? (
                        <span className="text-gray-300">--:--</span>
                      ) : (
                        <>{saldoDia > 0 ? '+' : ''}{formatarDuracaoPonto(saldoDia)}</>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center border border-slate-200">{statusBadge}</td>
                    {podeEditarFolha && (
                      <td className="px-2 py-2 text-center border border-slate-200 print:hidden">
                        {!futuro && empresaColaborador && (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDiaEmEdicao(dia)}
                              className="p-1.5 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="Editar horários do dia"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 print:static">
              <tr className="bg-slate-100 border-t-2 border-slate-400 font-bold text-[11px]">
                <td colSpan={espelhoEntradaSaida ? 4 : 7} className="px-3 py-2.5 text-right text-gray-700 border border-slate-300 sticky left-0 bg-slate-100">Total do Mês:</td>
                <td className="px-2 py-2.5 text-center font-mono text-gray-900 border border-slate-300 tabular-nums">{formatarDuracaoPonto(resumoMensal.totalTrabalhado)}</td>
                <td className={`px-2 py-2.5 text-center font-mono border border-slate-300 tabular-nums ${resumoMensal.saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {resumoMensal.saldo > 0 ? '+' : ''}{formatarDuracaoPonto(resumoMensal.saldo)}
                </td>
                <td className="px-2 py-2.5 text-center border border-slate-300">
                  <Badge variant={resumoMensal.saldo >= 0 ? 'success' : 'danger'}>
                    {resumoMensal.saldo >= 0 ? 'Positivo' : 'Negativo'}
                  </Badge>
                </td>
                {podeEditarFolha && <td className="border border-slate-300 print:hidden" />}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
        </>
      )}

      {activeTab === 'graficos' && (
        <Card className="p-5 border border-gray-200/80 shadow-sm bg-white dark:bg-slate-900">
          <div className="mb-4">
            <h3 className="font-bold text-gray-800 dark:text-white text-base">Acompanhamento Diário de Horas</h3>
            <p className="text-xs text-gray-450 mt-0.5">Gráfico diário de horas trabalhadas vs meta de horas requerida no mês</p>
          </div>
          <div className="h-80 w-full">
            {dadosGraficoDiario.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-450 italic text-sm">
                Nenhum dado registrado para gerar o gráfico.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosGraficoDiario} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTrabalhadoColab" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorMetaColab" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} unit="h" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelFormatter={(label) => `Dia ${label}`}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area type="monotone" dataKey="Horas Trabalhadas" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTrabalhadoColab)" />
                  <Area type="monotone" dataKey="Meta de Horas" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorMetaColab)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      )}

      {podeEditarFolha && empresaColaborador && colaboradorAtual && diaEmEdicao && (
        <EditarDiaPontoModal
          open={Boolean(diaEmEdicao)}
          onClose={() => setDiaEmEdicao(null)}
          onSaved={() => setRefreshTick((n) => n + 1)}
          empresaId={empresaColaborador}
          adminUserId={user.id}
          colaboradorNome={colaboradorAtual.nome || colaboradorAtual.email}
          colaboradorId={colabSelecionado}
          colaboradorRole={colaboradorAtual?.role}
          dataISO={diaEmEdicao}
          batidasDia={registrosConsolidados[diaEmEdicao] || []}
          ocorrenciaDia={ocorrenciasPorDia[diaEmEdicao] || null}
        />
      )}

      {/* Modal para Visualização de Foto */}
      <Modal
        isOpen={!!visualizarFoto}
        onClose={() => setVisualizarFoto(null)}
        title={`Foto do Registro - ${visualizarFoto?.tipo || ''}`}
        size="sm"
      >
        {visualizarFoto && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-gray-500 font-medium">
              Data do Registro: {visualizarFoto.dia}
            </p>
            <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-xl overflow-hidden bg-gray-950 border border-gray-200 shadow-inner">
              <img
                src={visualizarFoto.url}
                alt="Foto do colaborador no registro"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
            <div className="pt-2">
              <Button onClick={() => setVisualizarFoto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white">
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

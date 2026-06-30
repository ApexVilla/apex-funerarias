import React, { useEffect, useState, useMemo } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Badge } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useToast } from '../../lib/ToastStore';
import { supabase } from '../../lib/supabase';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useFilial } from '../../lib/FilialContext';
import { listarColaboradoresPonto, type ColaboradorPonto } from '../../lib/pontoColaboradores';
import {
  diaFechadoParaSaldoMensal,
  getUserPontoConfig,
  labelRegimePonto,
  normalizarBatidasAfdDia,
  usaPontoApenasEntradaSaida,
} from '../../lib/pontoRules';
import {
  diaExigeRegistroPonto,
  isRegime12x36,
  isSabadoFolgaEscala,
  metaMinutosNoDia,
  temEscalaSabadoAlternado,
} from '../../lib/pontoEscala';
import {
  carregarFiliaisEmpresas,
  carregarFilialCobradores,
  feriadosDoColaborador,
  isDiaFeriado,
  montarFeriadosPorColaborador,
  montarFilialPorColaborador,
} from '../../lib/pontoFeriados';
import {
  feriasDoColaborador,
  isDiaFerias,
  montarFeriasPorColaborador,
  type FeriasPeriodo,
} from '../../lib/pontoFerias';
import {
  type BatidaPonto,
  type TipoBatida,
  batidaEhAjusteManual,
  batidasDoTipo,
  calcularTrabalhadoMinutos,
  consolidarEPrepararBatidasEspelho,
  diaLocalFromTimestamp,
  formatarDuracaoPonto,
  getDataLocalISO,
  intervaloMesComMargemJornada,
  mergeBatidasPorId,
  normalizarOrigemBatidaPonto,
} from '../../lib/pontoUtils';
import {
  margemDiasCargaPontoMes,
  opcoesConsolidacaoJornadaMultidia,
} from '../../lib/ponto12x36Catalao';
import { EditarDiaPontoModal } from '../ponto/EditarDiaPontoModal';
import { ImportarAfdModal } from './ImportarAfdModal';
import {
  Users,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  LogIn,
  LogOut,
  UserX,
  Activity,
  Printer,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Pencil,
  Building,
  TrendingUp,
  TrendingDown,
  Info,
  Upload,
} from 'lucide-react';

type StatusHoje = 'trabalhando' | 'intervalo' | 'finalizado' | 'ausente' | 'folga' | 'ferias';

interface ColaboradorStatusPonto {
  colab: ColaboradorPonto;
  regime: string;
  cargaMetaMinutos: number;
  config: any;
  batidasHoje: BatidaPonto[];
  statusHoje: StatusHoje;
  trabalhadoHoje: number;
  intervaloHoje: number;
  totalTrabalhadoMes: number;
  totalMetaMes: number;
  saldoMes: number;
}

const getDiasNoMes = (ano: number, mes: number): string[] => {
  const dias: string[] = [];
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  for (let d = 1; d <= ultimoDia; d++) {
    dias.push(`${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dias;
};

export const PresencaBancoHoras: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { empresaIdsFiltro, empresaIdOperacao, aguardandoContexto, dataRevisionEmpresa, empresaNomePorId, empresasDoGrupo } =
    useEmpresaIdsOperacao();
  const {
    visaoTodasEmpresasGrupo,
    podeAlternarEmpresa,
    dataRevisionEmpresa: revEmpresaCtx,
  } = useEmpresaContextoAtivo();
  const { filialId, isTodasFiliais, dataRevision: dataRevisionFilial } = useFilial();

  const hoje = new Date();
  const hojeStr = getDataLocalISO(hoje);

  const [activeTab, setActiveTab] = useState<'presenca' | 'graficos'>('presenca');
  const [mesRef, setMesRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  const [colaboradores, setColaboradores] = useState<ColaboradorPonto[]>([]);
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [saldoFilter, setSaldoFilter] = useState<string>('todos');
  const [departamentoFilter, setDepartamentoFilter] = useState<string>('todos');
  const [departamentos, setDepartamentos] = useState<{ id: string; nome: string }[]>([]);

  // Carregar Departamentos
  useEffect(() => {
    if (aguardandoContexto || empresaIdsFiltro.length === 0) {
      setDepartamentos([]);
      return;
    }
    const loadDepts = async () => {
      try {
        const { data, error } = await supabase
          .from('departamentos')
          .select('id, nome')
          .in('empresa_id', empresaIdsFiltro)
          .eq('ativo', true)
          .is('deleted_at', null)
          .order('nome');
        if (error) throw error;
        setDepartamentos(data || []);
      } catch (e) {
        console.error('[PresencaBancoHoras] erro departamentos', e);
      }
    };
    void loadDepts();
  }, [empresaIdsFiltro.join(','), aguardandoContexto]);

  // Drawer de Detalhes
  const [selectedColabId, setSelectedColabId] = useState<string | null>(null);
  const [diaEdicao, setDiaEdicao] = useState<string | null>(null);
  const [showAfdModal, setShowAfdModal] = useState(false);
  const [feriadosPorColaborador, setFeriadosPorColaborador] = useState<Map<string, Set<string>>>(new Map());
  const [feriasPorColaborador, setFeriasPorColaborador] = useState<Map<string, FeriasPeriodo[]>>(new Map());
  const [filialPorColaborador, setFilialPorColaborador] = useState<Map<string, string>>(new Map());

  const diasDoMes = useMemo(() => getDiasNoMes(mesRef.ano, mesRef.mes), [mesRef]);

  const margemDiasMes = useMemo(
    () => margemDiasCargaPontoMes(colaboradores, getUserPontoConfig),
    [colaboradores],
  );

  // Carregar Colaboradores
  useEffect(() => {
    if (aguardandoContexto) return;
    const ids = empresaIdsFiltro;
    if (ids.length === 0) {
      setColaboradores([]);
      return;
    }

    const loadColabs = async () => {
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
        setColaboradores(lista);
      } catch (e) {
        console.error('[PresencaBancoHoras] erro colaboradores', e);
        showToast('Erro ao carregar colaboradores do ponto.', 'error');
      } finally {
        setLoading(false);
      }
    };
    void loadColabs();
  }, [
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
    showToast,
    refreshTick,
  ]);

  useEffect(() => {
    if (colaboradores.length === 0) {
      setFeriadosPorColaborador(new Map());
      setFeriasPorColaborador(new Map());
      setFilialPorColaborador(new Map());
      return;
    }

    const loadFeriados = async () => {
      try {
        const [filiais, cobFilial] = await Promise.all([
          carregarFiliaisEmpresas(empresaIdsFiltro),
          carregarFilialCobradores(colaboradores.map((c) => c.id)),
        ]);
        const filialMap = montarFilialPorColaborador(
          colaboradores,
          filiais,
          cobFilial,
          empresaNomePorId,
        );
        setFilialPorColaborador(filialMap);

        const inicio = `${mesRef.ano}-${String(mesRef.mes + 1).padStart(2, '0')}-01`;
        const fim = `${mesRef.ano}-${String(mesRef.mes + 1).padStart(2, '0')}-${String(new Date(mesRef.ano, mesRef.mes + 1, 0).getDate()).padStart(2, '0')}`;
        const [feriadosMap, feriasMap] = await Promise.all([
          montarFeriadosPorColaborador(
            colaboradores,
            filiais,
            cobFilial,
            empresaNomePorId,
            inicio,
            fim,
          ),
          montarFeriasPorColaborador(
            colaboradores.map((c) => c.id),
            empresaIdsFiltro,
            inicio,
            fim,
          ),
        ]);
        setFeriadosPorColaborador(feriadosMap);
        setFeriasPorColaborador(feriasMap);
      } catch (e) {
        console.warn('[PresencaBancoHoras] feriados/ferias', e);
        setFeriadosPorColaborador(new Map());
        setFeriasPorColaborador(new Map());
        setFilialPorColaborador(new Map());
      }
    };

    void loadFeriados();
  }, [colaboradores, mesRef.ano, mesRef.mes, empresaIdsFiltro.join(','), empresaNomePorId]);

  // Carregar Batidas do Mês para os colaboradores listados
  useEffect(() => {
    if (colaboradores.length === 0) {
      setRegistros([]);
      return;
    }

    const loadBatidas = async () => {
      const { inicio: startStr, fim: endStr } = intervaloMesComMargemJornada(
        mesRef.ano,
        mesRef.mes,
        margemDiasMes,
      );
      const colabIds = colaboradores.map((c) => c.id);

      try {
        const { data, error } = await supabase
          .from('ponto_registros')
          .select('*')
          .in('user_id', colabIds)
          .gte('timestamp', startStr)
          .lte('timestamp', endStr)
          .order('timestamp');

        if (error) throw error;
        setRegistros(data || []);
      } catch (err) {
        console.error('[PresencaBancoHoras] erro ao carregar registros', err);
        showToast('Erro ao carregar registros de ponto.', 'error');
      }
    };

    void loadBatidas();
  }, [colaboradores, mesRef, refreshTick, showToast, margemDiasMes]);

  // Consolidar informações por colaborador
  const colaboradoresConsolidados = useMemo((): ColaboradorStatusPonto[] => {
    if (colaboradores.length === 0) return [];

    return colaboradores.map((colab) => {
      const colabConfig = getUserPontoConfig(colab.permissoes);
      const feriadosColab = feriadosDoColaborador(colab.id, feriadosPorColaborador);
      const feriasColab = feriasDoColaborador(colab.id, feriasPorColaborador);
      const regimeLabel = labelRegimePonto(colabConfig.regime);
      const cargaMeta = colabConfig.carga_horaria_minutos;
      const colabRegistros = registros.filter((r) => r.user_id === colab.id);

      // Agrupar registros por dia local
      const mapa: Record<string, BatidaPonto[]> = {};
      for (const row of colabRegistros) {
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

      // Consolidar turnos noturnos
      const registrosConsolidados = consolidarEPrepararBatidasEspelho(
        mapa,
        diasDoMes,
        opcoesConsolidacaoJornadaMultidia(colab.empresa_id, colabConfig),
      );

      // Calcular Banco de Horas no mês
      let totalTrabalhadoMes = 0;
      let totalMetaMes = 0;

      for (const dia of diasDoMes) {
        if (dia > hojeStr) break;

        const batidasDia = registrosConsolidados[dia] || [];
        const temBatida = batidasDia.length > 0;
        const trabalhadoNoDia = calcularTrabalhadoMinutos(batidasDia);
        const metaNoDia = metaMinutosNoDia(colabConfig, dia, temBatida, feriadosColab, feriasColab);
        const contaNoSaldo = diaFechadoParaSaldoMensal(dia, hojeStr, batidasDia, colab.role);

        if (contaNoSaldo) {
          totalMetaMes += metaNoDia;
          if (temBatida) {
            totalTrabalhadoMes += trabalhadoNoDia;
          }
        }
      }

      const saldoMes = totalTrabalhadoMes - totalMetaMes;

      // Calcular status de HOJE
      const batidasHoje = registrosConsolidados[hojeStr] || [];
      const trabalhadoHoje = calcularTrabalhadoMinutos(batidasHoje);

      let statusHoje: StatusHoje = 'ausente';
      const diaSemanaHoje = new Date(`${hojeStr}T12:00:00`).getDay();
      const domingoHoje = diaSemanaHoje === 0;
      const sabadoHoje = diaSemanaHoje === 6;
      const folga12x36 = isRegime12x36(colabConfig) && batidasHoje.length === 0;
      const folgaSabadoEscala =
        sabadoHoje &&
        temEscalaSabadoAlternado(colabConfig) &&
        isSabadoFolgaEscala(colabConfig, hojeStr) &&
        batidasHoje.length === 0;
      const folgaDomingo = domingoHoje && batidasHoje.length === 0;
      const folgaSabadoSemEscala =
        sabadoHoje &&
        !temEscalaSabadoAlternado(colabConfig) &&
        batidasHoje.length === 0 &&
        !isRegime12x36(colabConfig);

      if (colabConfig.regime === 'cargo_confianca' && batidasHoje.length === 0) {
        statusHoje = 'folga';
      } else if (folga12x36 || folgaSabadoEscala || folgaDomingo || folgaSabadoSemEscala) {
        statusHoje = 'folga';
      } else if (isDiaFerias(hojeStr, feriasColab) && batidasHoje.length === 0) {
        statusHoje = 'ferias';
      } else if (isDiaFeriado(hojeStr, feriadosColab) && batidasHoje.length === 0) {
        statusHoje = 'folga';
      } else if (batidasHoje.length === 0 && diaExigeRegistroPonto(colabConfig, hojeStr, false, feriadosColab, feriasColab)) {
        statusHoje = 'ausente';
      } else if (batidasHoje.length > 0) {
        const ordenadas = [...batidasHoje].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        const ultimaBatida = ordenadas[ordenadas.length - 1];

        if (ultimaBatida.tipo === 'entrada' || ultimaBatida.tipo === 'fim_intervalo') {
          statusHoje = 'trabalhando';
        } else if (ultimaBatida.tipo === 'inicio_intervalo') {
          statusHoje = 'intervalo';
        } else if (ultimaBatida.tipo === 'saida') {
          statusHoje = 'finalizado';
        }
      }

      // Calcular intervalo de hoje
      let intervaloHoje = 0;
      const iniInt = batidasHoje.find((b) => b.tipo === 'inicio_intervalo');
      const fimInt = batidasHoje.find((b) => b.tipo === 'fim_intervalo');
      if (iniInt && fimInt) {
        intervaloHoje = Math.max(
          0,
          Math.round((new Date(fimInt.timestamp).getTime() - new Date(iniInt.timestamp).getTime()) / 60000)
        );
      }

      return {
        colab,
        regime: regimeLabel,
        cargaMetaMinutos: cargaMeta,
        config: colabConfig,
        batidasHoje,
        statusHoje,
        trabalhadoHoje,
        intervaloHoje,
        totalTrabalhadoMes,
        totalMetaMes,
        saldoMes,
      };
    });
  }, [colaboradores, registros, diasDoMes, hojeStr, feriadosPorColaborador, feriasPorColaborador]);

  // Estatísticas Gerais (Hoje)
  const stats = useMemo(() => {
    const total = colaboradoresConsolidados.length;
    const trabalhando = colaboradoresConsolidados.filter((c) => c.statusHoje === 'trabalhando').length;
    const intervalo = colaboradoresConsolidados.filter((c) => c.statusHoje === 'intervalo').length;
    const ausentes = colaboradoresConsolidados.filter((c) => c.statusHoje === 'ausente').length;
    const finalizados = colaboradoresConsolidados.filter((c) => c.statusHoje === 'finalizado').length;

    let saldoGeralMinutos = 0;
    colaboradoresConsolidados.forEach((c) => {
      saldoGeralMinutos += c.saldoMes;
    });

    return { total, trabalhando, intervalo, ausentes, finalizados, saldoGeralMinutos };
  }, [colaboradoresConsolidados]);

  // Estatísticas por Unidade (Filial)
  const statsPorUnidade = useMemo(() => {
    const units: Record<string, {
      id: string;
      nome: string;
      total: number;
      presente: number;
      ausente: number;
      folga: number;
    }> = {};

    empresasDoGrupo.forEach((e) => {
      units[e.id] = { id: e.id, nome: e.nome, total: 0, presente: 0, ausente: 0, folga: 0 };
    });

    colaboradoresConsolidados.forEach((item) => {
      const empId = item.colab.empresa_id || empresaIdOperacao || '';
      if (!units[empId]) {
        units[empId] = {
          id: empId,
          nome: empresaNomePorId[empId] || 'Outra Unidade',
          total: 0,
          presente: 0,
          ausente: 0,
          folga: 0
        };
      }

      const u = units[empId];
      u.total++;
      if (item.statusHoje === 'trabalhando' || item.statusHoje === 'intervalo' || item.statusHoje === 'finalizado') {
        u.presente++;
      } else if (item.statusHoje === 'ausente') {
        u.ausente++;
      } else if (item.statusHoje === 'folga' || item.statusHoje === 'ferias') {
        u.folga++;
      }
    });

    return Object.values(units).filter((u) => u.total > 0);
  }, [colaboradoresConsolidados, empresasDoGrupo, empresaIdOperacao, empresaNomePorId]);

  // Rankings de Horas (Banco Positivo e Negativo)
  const rankings = useMemo(() => {
    const comSaldo = [...colaboradoresConsolidados];
    const topPositivo = comSaldo
      .filter((c) => c.saldoMes > 0)
      .sort((a, b) => b.saldoMes - a.saldoMes)
      .slice(0, 5);

    const topNegativo = comSaldo
      .filter((c) => c.saldoMes < 0)
      .sort((a, b) => a.saldoMes - b.saldoMes)
      .slice(0, 5);

    return { topPositivo, topNegativo };
  }, [colaboradoresConsolidados]);

  const resumoTotalHoras = useMemo(() => {
    let totalTrabalhado = 0;
    let totalMeta = 0;

    colaboradoresConsolidados.forEach((c) => {
      totalTrabalhado += c.totalTrabalhadoMes;
      totalMeta += c.totalMetaMes;
    });

    const saldo = totalTrabalhado - totalMeta;

    return {
      trabalhado: (totalTrabalhado / 60).toFixed(1),
      meta: (totalMeta / 60).toFixed(1),
      saldo: (saldo / 60).toFixed(1),
      minutosSaldo: saldo,
    };
  }, [colaboradoresConsolidados]);

  const dadosGraficoDiario = useMemo(() => {
    if (colaboradores.length === 0 || registros.length === 0) return [];

    const colabData = colaboradores.map((colab) => {
      const colabConfig = getUserPontoConfig(colab.permissoes);
      const feriadosColab = feriadosDoColaborador(colab.id, feriadosPorColaborador);
      const feriasColab = feriasDoColaborador(colab.id, feriasPorColaborador);
      const colabRegistros = registros.filter((r) => r.user_id === colab.id);

      const mapa: Record<string, BatidaPonto[]> = {};
      for (const row of colabRegistros) {
        const batida: BatidaPonto = {
          id: row.id,
          tipo: row.tipo as TipoBatida,
          timestamp: row.timestamp,
          origem: normalizarOrigemBatidaPonto(row.origem),
        };
        const dia = diaLocalFromTimestamp(batida.timestamp);
        if (!dia) continue;
        mapa[dia] = mergeBatidasPorId(mapa[dia] || [], [batida]);
      }

      for (const dia of Object.keys(mapa)) {
        mapa[dia] = normalizarBatidasAfdDia(mapa[dia]);
      }

      const registrosConsolidados = consolidarEPrepararBatidasEspelho(
        mapa,
        diasDoMes,
        opcoesConsolidacaoJornadaMultidia(colab.empresa_id, colabConfig),
      );
      return { colabConfig, feriadosColab, feriasColab, registrosConsolidados };
    });

    return diasDoMes.map((dia) => {
      let totalTrabalhadoMinutos = 0;
      let totalMetaMinutos = 0;

      for (const item of colabData) {
        const batidasDia = item.registrosConsolidados[dia] || [];
        const temBatida = batidasDia.length > 0;
        const trabalhado = calcularTrabalhadoMinutos(batidasDia);
        const meta = metaMinutosNoDia(item.colabConfig, dia, temBatida, item.feriadosColab, item.feriasColab);

        totalMetaMinutos += meta;
        if (temBatida) {
          totalTrabalhadoMinutos += trabalhado;
        }
      }

      const diaFormatado = dia.slice(8);
      return {
        dia: diaFormatado,
        dataCompleta: dia,
        "Horas Trabalhadas": Number((totalTrabalhadoMinutos / 60).toFixed(1)),
        "Meta de Horas": Number((totalMetaMinutos / 60).toFixed(1)),
      };
    });
  }, [colaboradores, registros, diasDoMes, feriadosPorColaborador, feriasPorColaborador]);

  const dadosGraficoColaborador = useMemo(() => {
    return colaboradoresConsolidados.map((c) => ({
      name: c.colab.nome,
      "Horas Trabalhadas": Number((c.totalTrabalhadoMes / 60).toFixed(1)),
      "Meta de Horas": Number((c.totalMetaMes / 60).toFixed(1)),
    }));
  }, [colaboradoresConsolidados]);

  // Filtrar colaboradores consolidados
  const filteredColaboradores = useMemo(() => {
    return colaboradoresConsolidados.filter((item) => {
      // 1. Filtro de Texto (Nome / Email / Cargo)
      const query = searchTerm.toLowerCase();
      const matchText =
        item.colab.nome.toLowerCase().includes(query) ||
        item.colab.email.toLowerCase().includes(query) ||
        (item.colab.role || '').toLowerCase().includes(query);

      // 2. Filtro de Status Hoje
      const matchStatus = statusFilter === 'todos' || item.statusHoje === statusFilter;

      // 3. Filtro de Saldo Banco de Horas
      let matchSaldo = true;
      if (saldoFilter === 'positivo') {
        matchSaldo = item.saldoMes > 0;
      } else if (saldoFilter === 'negativo') {
        matchSaldo = item.saldoMes < 0;
      } else if (saldoFilter === 'zero') {
        matchSaldo = item.saldoMes === 0;
      }

      // 4. Filtro de Departamento
      const matchDepto = departamentoFilter === 'todos' || item.colab.departamento_id === departamentoFilter;

      return matchText && matchStatus && matchSaldo && matchDepto;
    });
  }, [colaboradoresConsolidados, searchTerm, statusFilter, saldoFilter, departamentoFilter]);

  // Colaborador Selecionado para Ficha Drawer
  const selectedColaboradorInfo = useMemo(() => {
    if (!selectedColabId) return null;
    return colaboradoresConsolidados.find((item) => item.colab.id === selectedColabId) || null;
  }, [selectedColabId, colaboradoresConsolidados]);

  // Dias Detalhados do Colaborador Selecionado
  const selectedColabDaysList = useMemo(() => {
    if (!selectedColaboradorInfo) return [];

    const colabConfig = selectedColaboradorInfo.config;
    const feriadosColab = feriadosDoColaborador(
      selectedColaboradorInfo.colab.id,
      feriadosPorColaborador,
    );
    const feriasColab = feriasDoColaborador(
      selectedColaboradorInfo.colab.id,
      feriasPorColaborador,
    );
    const colabRegistros = registros.filter((r) => r.user_id === selectedColaboradorInfo.colab.id);

    const mapa: Record<string, BatidaPonto[]> = {};
    for (const row of colabRegistros) {
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

    const registrosConsolidados = consolidarEPrepararBatidasEspelho(
      mapa,
      diasDoMes,
      opcoesConsolidacaoJornadaMultidia(
        selectedColaboradorInfo.colab.empresa_id,
        colabConfig,
      ),
    );

    return diasDoMes.map((dia) => {
      const batidas = registrosConsolidados[dia] || [];
      const trabalhado = calcularTrabalhadoMinutos(batidas);
      const meta = metaMinutosNoDia(colabConfig, dia, batidas.length > 0, feriadosColab, feriasColab);
      const contaSaldo = diaFechadoParaSaldoMensal(
        dia,
        hojeStr,
        batidas,
        selectedColaboradorInfo.colab.role,
      );
      const saldo = contaSaldo ? trabalhado - meta : null;
      const fds = new Date(`${dia}T12:00:00`).getDay() === 0 || new Date(`${dia}T12:00:00`).getDay() === 6;
      const folga12x36 = isRegime12x36(colabConfig) && batidas.length === 0;

      let dayStatus: 'folga' | 'falta' | 'trabalhado' | 'futuro' | 'ferias' = 'trabalhado';
      if (dia > hojeStr) {
        dayStatus = 'futuro';
      } else if (isDiaFerias(dia, feriasColab) && batidas.length === 0) {
        dayStatus = 'ferias';
      } else if (isDiaFeriado(dia, feriadosColab) && batidas.length === 0) {
        dayStatus = 'folga';
      } else if (folga12x36 || (fds && batidas.length === 0 && !isRegime12x36(colabConfig))) {
        dayStatus = 'folga';
      } else if (batidas.length === 0 && diaExigeRegistroPonto(colabConfig, dia, false, feriadosColab, feriasColab)) {
        dayStatus = 'falta';
      }

      return {
        dia,
        batidas,
        trabalhado,
        meta,
        saldo,
        status: dayStatus,
      };
    });
  }, [selectedColaboradorInfo, registros, diasDoMes, hojeStr, feriadosPorColaborador, feriasPorColaborador]);

  const navegarMes = (dir: -1 | 1) => {
    setMesRef((prev) => {
      let novoMes = prev.mes + dir;
      let novoAno = prev.ano;
      if (novoMes < 0) {
        novoMes = 11;
        novoAno--;
      }
      if (novoMes > 11) {
        novoMes = 0;
        novoAno++;
      }
      return { ano: novoAno, mes: novoMes };
    });
  };

  const nomeMes = new Date(mesRef.ano, mesRef.mes).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  const getStatusBadge = (status: StatusHoje) => {
    switch (status) {
      case 'trabalhando':
        return (
          <Badge variant="success" className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold animate-pulse shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            Trabalhando
          </Badge>
        );
      case 'intervalo':
        return (
          <Badge variant="warning" className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold shadow-sm">
            <Coffee className="w-3.5 h-3.5" />
            Em Intervalo
          </Badge>
        );
      case 'finalizado':
        return (
          <Badge variant="outline" className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-gray-50 border-gray-200 text-gray-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
            Finalizado
          </Badge>
        );
      case 'folga':
        return (
          <Badge variant="info" className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-slate-50 border-slate-200 text-slate-500">
            Folga
          </Badge>
        );
      case 'ferias':
        return (
          <Badge variant="outline" className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-teal-50 border-teal-200 text-teal-700">
            Férias
          </Badge>
        );
      default:
        return (
          <Badge variant="danger" className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold shadow-sm">
            Ausente
          </Badge>
        );
    }
  };

  const formatHoraPunch = (batida?: BatidaPonto) => {
    if (!batida) return '';
    const date = new Date(batida.timestamp);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel de Presença"
        subtitle="Presença da equipe, banco de horas e status operacional em tempo real."
        actionButton={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => setShowAfdModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Importar AFD
            </Button>
            <Button variant="outline" onClick={() => setRefreshTick((n) => n + 1)}>
              <Activity className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </div>
        }
      />

      {/* Estatísticas / Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4 bg-gradient-to-br from-indigo-50/50 to-indigo-100/30 border border-indigo-100/80 shadow-sm relative overflow-hidden dark:from-indigo-950/20 dark:to-slate-900 dark:border-indigo-900/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-700/80 font-bold uppercase tracking-wider dark:text-indigo-400">Total Equipe</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{stats.total}</h3>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-xl dark:text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 border border-emerald-100/80 shadow-sm relative overflow-hidden dark:from-emerald-950/20 dark:to-slate-900 dark:border-emerald-900/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-700/80 font-bold uppercase tracking-wider dark:text-emerald-400">Trabalhando</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{stats.trabalhando}</h3>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl dark:text-emerald-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-amber-50/50 to-amber-100/30 border border-amber-100/80 shadow-sm relative overflow-hidden dark:from-amber-950/20 dark:to-slate-900 dark:border-amber-900/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-700/80 font-bold uppercase tracking-wider dark:text-amber-400">Em Intervalo</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{stats.intervalo}</h3>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl dark:text-amber-400">
              <Coffee className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-rose-50/50 to-rose-100/30 border border-rose-100/80 shadow-sm relative overflow-hidden dark:from-rose-950/20 dark:to-slate-900 dark:border-rose-900/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-rose-700/80 font-bold uppercase tracking-wider dark:text-rose-400">Ausentes Hoje</p>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{stats.ausentes}</h3>
            </div>
            <div className="p-3 bg-rose-500/10 text-rose-600 rounded-xl dark:text-rose-400">
              <UserX className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-violet-50/50 to-violet-100/30 border border-violet-100/80 shadow-sm relative overflow-hidden dark:from-violet-950/20 dark:to-slate-900 dark:border-violet-900/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-violet-700/80 font-bold uppercase tracking-wider dark:text-violet-400">Banco de Horas</p>
              <h3 className={`text-xl font-bold mt-1 font-mono ${stats.saldoGeralMinutos >= 0 ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {stats.saldoGeralMinutos >= 0 ? '+' : ''}
                {formatarDuracaoPonto(stats.saldoGeralMinutos)}
              </h3>
            </div>
            <div className="p-3 bg-violet-500/10 text-violet-600 rounded-xl dark:text-violet-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-4 print:hidden">
        <button
          onClick={() => setActiveTab('presenca')}
          className={`py-3 px-1 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'presenca'
              ? 'border-indigo-650 text-indigo-750'
              : 'border-transparent text-slate-450 hover:text-slate-700'
          }`}
        >
          Presença da Equipe
        </button>
        <button
          onClick={() => setActiveTab('graficos')}
          className={`py-3 px-1 text-sm font-bold border-b-2 transition-all ${
            activeTab === 'graficos'
              ? 'border-indigo-650 text-indigo-750'
              : 'border-transparent text-slate-450 hover:text-slate-700'
          }`}
        >
          Gráficos e Indicadores
        </button>
      </div>

      {activeTab === 'presenca' && (
        <>
          {/* Filtros e Controles */}
          <Card className="p-4 print:hidden">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold uppercase text-slate-400 mb-1.5 block">Busca</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Buscar por colaborador, email ou cargo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="w-full sm:w-48">
                <Select
                  label="Status Hoje"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="todos">Todos os Status</option>
                  <option value="trabalhando">Trabalhando</option>
                  <option value="intervalo">Em Intervalo</option>
                  <option value="finalizado">Finalizado</option>
                  <option value="ausente">Ausente</option>
                  <option value="folga">Folga</option>
                  <option value="ferias">Férias</option>
                </Select>
              </div>

              <div className="w-full sm:w-48">
                <Select
                  label="Saldo Banco de Horas"
                  value={saldoFilter}
                  onChange={(e) => setSaldoFilter(e.target.value)}
                >
                  <option value="todos">Todos os Saldos</option>
                  <option value="positivo">Saldo Positivo (+)</option>
                  <option value="negativo">Saldo Negativo (-)</option>
                  <option value="zero">Saldo Zerado (0h)</option>
                </Select>
              </div>

              <div className="w-full sm:w-48">
                <Select
                  label="Departamento"
                  value={departamentoFilter}
                  onChange={(e) => setDepartamentoFilter(e.target.value)}
                >
                  <option value="todos">Todos os Departamentos</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-end gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => navegarMes(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 capitalize min-w-[160px] text-center dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300">
                  <Calendar className="h-4 w-4 inline mr-2 text-slate-400" />
                  {nomeMes}
                </div>
                <Button variant="outline" size="sm" onClick={() => navegarMes(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Tabela de Colaboradores e Ponto */}
          <Card className="p-0 overflow-hidden relative shadow-sm border border-slate-200/80">
            {loading && (
              <div className="absolute inset-0 bg-white/60 dark:bg-slate-950/60 flex items-center justify-center z-20">
                <div className="flex flex-col items-center gap-2">
                  <Activity className="h-8 w-8 text-indigo-600 animate-spin" />
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Carregando dados operacionais...</span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 dark:bg-slate-900/50 dark:border-slate-850">
                    <th className="text-left px-5 py-4 font-bold text-slate-500 uppercase tracking-wider w-72">Colaborador</th>
                    <th className="text-center px-4 py-4 font-bold text-slate-500 uppercase tracking-wider w-36">Status Hoje</th>
                    <th className="text-left px-4 py-4 font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Marcações de Hoje</th>
                    <th className="text-center px-4 py-4 font-bold text-slate-500 uppercase tracking-wider w-40">Banco de Horas ({nomeMes})</th>
                    <th className="text-center px-4 py-4 font-bold text-slate-500 uppercase tracking-wider w-28 print:hidden">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredColaboradores.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400 bg-white dark:bg-slate-900">
                        Nenhum colaborador encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredColaboradores.map((item) => {
                      const ent = item.batidasHoje.find((b) => b.tipo === 'entrada');
                      const iniInt = item.batidasHoje.find((b) => b.tipo === 'inicio_intervalo');
                      const fimInt = item.batidasHoje.find((b) => b.tipo === 'fim_intervalo');
                      const sai = item.batidasHoje.find((b) => b.tipo === 'saida');

                      const isPontoEntradaSaida = usaPontoApenasEntradaSaida(item.colab.role);

                      return (
                        <tr key={item.colab.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer" onClick={() => setSelectedColabId(item.colab.id)}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-extrabold shadow-sm select-none">
                                {(item.colab.nome || 'C').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-800 dark:text-white leading-tight">
                                  {item.colab.nome}
                                </div>
                                <div className="text-xs text-slate-400 capitalize mt-0.5">
                                  {item.colab.role || 'Sem cargo'} &middot; {item.regime}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            {getStatusBadge(item.statusHoje)}
                          </td>

                          <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                            {item.batidasHoje.length === 0 ? (
                              <span className="text-xs text-slate-450 dark:text-slate-500 italic">
                                {item.config.regime === 'cargo_confianca'
                                  ? 'Isento de registro de ponto'
                                  : item.statusHoje === 'ferias'
                                    ? 'Em período de férias'
                                    : item.statusHoje === 'folga'
                                    ? 'Folga programada'
                                    : 'Nenhuma batida registrada'}
                              </span>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-mono">
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-150 font-bold dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/30">
                                    Entrada: {formatHoraPunch(ent) || '--:--'}
                                  </span>
                                  {!isPontoEntradaSaida && (
                                    <>
                                      <span className="text-slate-300">|</span>
                                      <span className="px-1.5 py-0.5 rounded bg-amber-55 text-amber-700 border border-amber-150 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30">
                                        Almoço: {formatHoraPunch(iniInt) || '--:--'}
                                      </span>
                                      <span className="text-slate-350 text-[10px]">→</span>
                                      <span className="px-1.5 py-0.5 rounded bg-amber-55 text-amber-700 border border-amber-150 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30">
                                        {formatHoraPunch(fimInt) || '--:--'}
                                      </span>
                                    </>
                                  )}
                                  <span className="text-slate-300">|</span>
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-150 font-bold dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/30">
                                    Saída: {formatHoraPunch(sai) || '--:--'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 flex gap-3 flex-wrap">
                                  {item.trabalhadoHoje > 0 && (
                                    <span>Trabalhado hoje: <strong className="font-semibold text-slate-650 dark:text-slate-300">{formatarDuracaoPonto(item.trabalhadoHoje)}</strong></span>
                                  )}
                                  {item.intervaloHoje > 0 && (
                                    <span>Intervalo: <strong className="font-semibold text-slate-650 dark:text-slate-300">{formatarDuracaoPonto(item.intervaloHoje)}</strong></span>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex flex-col items-center">
                              <span className={`text-base font-bold font-mono ${item.saldoMes >= 0 ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {item.saldoMes > 0 ? '+' : ''}
                                {formatarDuracaoPonto(item.saldoMes)}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Real: {formatarDuracaoPonto(item.totalTrabalhadoMes)} / Meta: {formatarDuracaoPonto(item.totalMetaMes)}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4 text-center print:hidden" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="inline-flex items-center gap-1.5 border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/30"
                              onClick={() => setSelectedColabId(item.colab.id)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Ver Ficha
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {activeTab === 'graficos' && (
        <div className="space-y-6">
          {/* Métricas do Mês */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 flex items-center justify-between border border-slate-200/80 shadow-sm">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase text-slate-400">Total Trabalhado no Mês</span>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                  {resumoTotalHoras.trabalhado}h
                </h3>
                <p className="text-[10px] text-slate-400">Horas produtivas registradas</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border border-slate-200/80 shadow-sm">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase text-slate-400">Meta de Horas Esperada</span>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                  {resumoTotalHoras.meta}h
                </h3>
                <p className="text-[10px] text-slate-400">Carga horária total requerida</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-550 dark:text-slate-400 flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border border-slate-200/80 shadow-sm">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase text-slate-400">Saldo Consolidado</span>
                <h3 className={`text-2xl font-black ${resumoTotalHoras.minutosSaldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {resumoTotalHoras.minutosSaldo >= 0 ? '+' : ''}{resumoTotalHoras.saldo}h
                </h3>
                <p className="text-[10px] text-slate-400">Saldo de banco de horas geral</p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${resumoTotalHoras.minutosSaldo >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400'}`}>
                {resumoTotalHoras.minutosSaldo >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              </div>
            </Card>
          </div>

          {/* Gráfico Diário */}
          <Card className="p-5 border border-slate-200/80 shadow-sm">
            <div className="mb-4">
              <h3 className="font-extrabold text-slate-850 dark:text-white text-base">Acompanhamento Diário de Horas</h3>
              <p className="text-xs text-slate-450 mt-0.5">Soma total de horas trabalhadas vs meta de horas requerida a cada dia do mês ativo</p>
            </div>
            <div className="h-80 w-full">
              {dadosGraficoDiario.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
                  Nenhum dado registrado para gerar o gráfico.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dadosGraficoDiario} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTrabalhado" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorMeta" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis dataKey="dia" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} unit="h" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(label) => `Dia ${label}`}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Area type="monotone" dataKey="Horas Trabalhadas" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTrabalhado)" />
                    <Area type="monotone" dataKey="Meta de Horas" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorMeta)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Gráfico por Colaborador */}
          <Card className="p-5 border border-slate-200/80 shadow-sm">
            <div className="mb-4">
              <h3 className="font-extrabold text-slate-850 dark:text-white text-base">Comparativo de Horas por Colaborador</h3>
              <p className="text-xs text-slate-450 mt-0.5">Soma total acumulada de horas trabalhadas vs meta requerida por funcionário no período do mês</p>
            </div>
            <div className="h-96 w-full">
              {dadosGraficoColaborador.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 italic text-sm">
                  Nenhum colaborador com dados registrados.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosGraficoColaborador} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} angle={-30} textAnchor="end" interval={0} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} unit="h" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="Horas Trabalhadas" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="Meta de Horas" fill="#94a3b8" opacity={0.6} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Sessão por Unidade */}
          <div className="space-y-3 pt-4">
            <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-500" />
              Adesão de Ponto por Unidade (Hoje)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {statsPorUnidade.map((u) => {
                const divisor = u.total - u.folga;
                const taxaAdesao = divisor > 0 ? Math.round((u.presente / divisor) * 100) : 0;

                return (
                  <Card key={u.id} className="p-5 flex flex-col gap-4 border border-slate-200/80 shadow-sm">
                    <div>
                      <h4 className="font-extrabold text-slate-850 dark:text-white text-base truncate">{u.nome}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Total de Colaboradores: {u.total}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Presentes</span>
                        <span className="font-black text-emerald-600 text-lg mt-0.5 block">{u.presente}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Ausentes</span>
                        <span className="font-black text-rose-600 text-lg mt-0.5 block">{u.ausente}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Folgas</span>
                        <span className="font-black text-indigo-500 text-lg mt-0.5 block">{u.folga}</span>
                      </div>
                    </div>

                    {/* Barra de Progresso Taxa de Adesão */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-550 dark:text-slate-350">
                        <span>Taxa de Adesão</span>
                        <span>{taxaAdesao}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            taxaAdesao >= 80
                              ? 'bg-emerald-500'
                              : taxaAdesao >= 50
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${taxaAdesao}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Sessão de Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            {/* Top Horas Extras */}
            <div className="space-y-3">
              <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Top 5 - Maiores Saldos de Horas (Banco Positivo)
              </h2>
              <Card className="p-0 border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100 dark:divide-slate-850">
                  {rankings.topPositivo.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-white dark:bg-slate-900">
                      Nenhum colaborador com saldo positivo de banco de horas neste mês.
                    </div>
                  ) : (
                    rankings.topPositivo.map((c, index) => (
                      <div
                        key={c.colab.id}
                        className="p-4 flex items-center justify-between hover:bg-slate-50/40 transition-all cursor-pointer"
                        onClick={() => setSelectedColabId(c.colab.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-150 flex items-center justify-center font-black text-sm dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30">
                            #{index + 1}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 dark:text-white leading-tight">{c.colab.nome}</div>
                            <div className="text-xs text-slate-400 mt-0.5 capitalize">{c.colab.role || 'Sem cargo'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">
                            +{formatarDuracaoPonto(c.saldoMes)}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-0.5">Trabalhado: {formatarDuracaoPonto(c.totalTrabalhadoMes)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* Top Horas em Débito */}
            <div className="space-y-3">
              <h2 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-500" />
                Top 5 - Maiores Déficits de Horas (Banco Negativo)
              </h2>
              <Card className="p-0 border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100 dark:divide-slate-850">
                  {rankings.topNegativo.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-white dark:bg-slate-900">
                      Nenhum colaborador com saldo negativo de banco de horas neste mês.
                    </div>
                  ) : (
                    rankings.topNegativo.map((c, index) => (
                      <div
                        key={c.colab.id}
                        className="p-4 flex items-center justify-between hover:bg-slate-50/40 transition-all cursor-pointer"
                        onClick={() => setSelectedColabId(c.colab.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 border border-rose-150 flex items-center justify-center font-black text-sm dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30">
                            #{index + 1}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 dark:text-white leading-tight">{c.colab.nome}</div>
                            <div className="text-xs text-slate-400 mt-0.5 capitalize">{c.colab.role || 'Sem cargo'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-base">
                            -{formatarDuracaoPonto(Math.abs(c.saldoMes))}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-0.5">Meta: {formatarDuracaoPonto(c.totalMetaMes)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER / SIDEBAR DE DETALHES (Ficha do Colaborador) */}
      {selectedColaboradorInfo && (
        <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity" onClick={() => setSelectedColabId(null)}>
          <div
            className="fixed top-0 right-0 h-full w-full sm:w-[620px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-50 transform transition-transform animate-[slideInRight_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drawer */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-600 flex items-center justify-center text-white font-extrabold shadow-sm select-none">
                  {(selectedColaboradorInfo.colab.nome || 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Painel de Presença
                  </p>
                  <h3 className="font-extrabold text-slate-800 dark:text-white text-base leading-tight">
                    {selectedColaboradorInfo.colab.nome}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium break-words">
                    {selectedColaboradorInfo.colab.email} &middot; {selectedColaboradorInfo.colab.role || 'Sem cargo'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedColabId(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Drawer */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Regime & Meta */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 flex gap-3 text-indigo-900 dark:bg-indigo-950/20 dark:border-indigo-900/40 dark:text-indigo-300">
                <Info className="w-5 h-5 shrink-0 text-indigo-500 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong>Regime de Jornada:</strong> {selectedColaboradorInfo.regime}.<br />
                  <strong>Meta Diária:</strong> {formatarDuracaoPonto(selectedColaboradorInfo.cargaMetaMinutos)} por dia útil trabalhado.
                </div>
              </div>

              {/* Resumo Mensal */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumo de {nomeMes}</h4>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-800/60 p-3 rounded-xl text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Trabalhado</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-sm mt-1 block">
                      {formatarDuracaoPonto(selectedColaboradorInfo.totalTrabalhadoMes)}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-800/60 p-3 rounded-xl text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Meta Mês</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-sm mt-1 block">
                      {formatarDuracaoPonto(selectedColaboradorInfo.totalMetaMes)}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-800/60 p-3 rounded-xl text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Saldo</span>
                    <span className={`font-mono font-bold text-sm mt-1 block ${selectedColaboradorInfo.saldoMes >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                      {selectedColaboradorInfo.saldoMes > 0 ? '+' : ''}
                      {formatarDuracaoPonto(selectedColaboradorInfo.saldoMes)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Listagem de Dias do Mês */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Histórico Diário</h4>
                <Card className="p-0 border border-slate-200/80 shadow-inner overflow-hidden">
                  <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850">
                    {selectedColabDaysList.map((dayItem) => {
                      const dayName = new Date(`${dayItem.dia}T12:00:00`).toLocaleDateString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                      });

                      const fds = new Date(`${dayItem.dia}T12:00:00`).getDay() === 0 || new Date(`${dayItem.dia}T12:00:00`).getDay() === 6;

                      let dayStatusBadge = null;
                      if (dayItem.status === 'futuro') {
                        dayStatusBadge = <span className="text-[10px] text-slate-300">—</span>;
                      } else if (dayItem.status === 'folga') {
                        dayStatusBadge = <Badge variant="outline" className="text-[9px] px-1 py-0 bg-slate-50 border-slate-200 text-slate-400">Folga</Badge>;
                      } else if (dayItem.status === 'ferias') {
                        dayStatusBadge = <Badge variant="outline" className="text-[9px] px-1 py-0 bg-teal-50 border-teal-200 text-teal-700">Férias</Badge>;
                      } else if (dayItem.status === 'falta') {
                        dayStatusBadge = <Badge variant="danger" className="text-[9px] px-1 py-0">Falta</Badge>;
                      }

                      return (
                        <div key={dayItem.dia} className={`p-3 flex items-center justify-between text-xs hover:bg-slate-50/60 dark:hover:bg-slate-900/20 ${fds ? 'bg-slate-50/20' : ''}`}>
                          <div className="w-16 capitalize font-semibold text-slate-750 dark:text-slate-300">
                            {dayName}
                          </div>

                          <div className="flex-1 px-3 text-center">
                            {dayItem.batidas.length === 0 ? (
                              dayStatusBadge
                            ) : (
                              <div className="font-mono text-slate-600 dark:text-slate-400 text-[10px] truncate max-w-[180px] mx-auto" title={dayItem.batidas.map(formatHoraPunch).join(' | ')}>
                                {dayItem.batidas.map((b) => formatHoraPunch(b)).join(' | ')}
                              </div>
                            )}
                          </div>

                          <div className="w-20 text-right font-mono font-medium text-slate-700 dark:text-slate-400">
                            {dayItem.batidas.length > 0 && (
                              <span>{formatarDuracaoPonto(dayItem.trabalhado)}</span>
                            )}
                          </div>

                          <div className="w-14 text-right font-mono">
                            {dayItem.saldo != null ? (
                              <span className={dayItem.saldo >= 0 ? 'text-green-600 font-semibold' : 'text-rose-650'}>
                                {dayItem.saldo > 0 ? '+' : ''}
                                {formatarDuracaoPonto(dayItem.saldo)}
                              </span>
                            ) : dayItem.batidas.length > 0 && dayItem.dia === hojeStr ? (
                              <span className="text-[10px] text-slate-400 italic">Aberto</span>
                            ) : null}
                          </div>

                          {/* Botão de Edição Rápida */}
                          <div className="w-8 flex justify-end">
                            {dayItem.status !== 'futuro' && (
                              <button
                                onClick={() => setDiaEdicao(dayItem.dia)}
                                className="p-1 text-indigo-650 hover:bg-indigo-50 hover:text-indigo-800 rounded-md transition-colors"
                                title="Ajustar batidas deste dia"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            </div>

            {/* Footer Drawer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex gap-2.5">
              <Button
                variant="outline"
                className="flex-1 border-slate-200 hover:bg-slate-150 text-slate-700 text-xs py-2 dark:border-slate-800"
                onClick={() => setSelectedColabId(null)}
              >
                Fechar Ficha
              </Button>
              <Button
                className="flex-1 bg-indigo-650 hover:bg-indigo-750 text-white text-xs py-2"
                onClick={() => {
                  window.location.hash = `/rh/espelho-ponto?colabId=${selectedColaboradorInfo.colab.id}`;
                }}
              >
                Abrir Espelho Completo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE BATIDA DIA */}
      {diaEdicao && selectedColaboradorInfo && (
        <EditarDiaPontoModal
          open={Boolean(diaEdicao)}
          onClose={() => setDiaEdicao(null)}
          onSaved={() => setRefreshTick((n) => n + 1)}
          empresaId={selectedColaboradorInfo.colab.empresa_id || empresaIdOperacao || ''}
          adminUserId={user?.id || ''}
          colaboradorNome={selectedColaboradorInfo.colab.nome}
          colaboradorId={selectedColaboradorInfo.colab.id}
          colaboradorRole={selectedColaboradorInfo.colab.role}
          dataISO={diaEdicao}
          batidasDia={selectedColabDaysList.find((d) => d.dia === diaEdicao)?.batidas || []}
        />
      )}

      {/* MODAL DE IMPORTAÇÃO DE ARQUIVO AFD */}
      <ImportarAfdModal
        open={showAfdModal}
        onClose={() => setShowAfdModal(false)}
        onImported={() => setRefreshTick((n) => n + 1)}
        colaboradores={colaboradores}
        empresaIdOperacao={empresaIdOperacao}
      />
    </div>
  );
};

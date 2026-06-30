import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Wallet, Settings, DollarSign, UserCheck, Percent, FileText,
  ChevronRight, Calendar, CheckCircle2, Clock, Info, RefreshCw,
  TrendingUp, Award, User, Layers, Search, BarChart3, Download, Printer,
  History, Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';
import {
  listarConfiguracoesComissao,
  salvarConfiguracaoComissao,
  salvarComissaoColaborador,
  listarColaboradoresParaComissao,
  listarAtendimentosComissao,
  listarPlanosParaComissao,
  listarOverridesOperacionalPlano,
  salvarOverrideOperacionalPlano,
  usuarioEhGestorComissao,
  type ComissaoConfigPadrao,
  type AtendimentoComissaoDto,
  type ColaboradorResumoDto,
  type PlanoComissaoResumoDto,
  type OperacionalPlanoComissaoDto,
  type ModoCalculoComissao,
} from '../../lib/comissaoAtendenteService';
import {
  buscarPagamentoComissaoPeriodo,
  filtrarLinhasConfirmadasPagaveis,
  listarPagamentosComissaoPorAtendimento,
  montarLinhasComissaoColaborador,
  registrarPagamentoComissaoOperacional,
  type LinhaComissaoOperacional,
  type PagamentoComissaoOperacionalDto,
  type PagamentoComissaoOsInfo,
} from '../../lib/comissaoOperacionalPagamentoService';
import {
  gerarReciboPagamentoComissaoOperacional,
  gerarRelatorioComissaoOperacionalPdf,
} from '../../lib/comissaoOperacionalPdf';
import {
  formatarRegraComissao,
  normalizarRegraColaborador,
  normalizarRegraConfigPadrao,
  resolverRegraOperacionalOS,
  validarEntradaComissao,
  atendimentoComissaoConfirmada,
  atendimentoComissaoPendente,
  atendimentoContaBaixada,
  comissaoPagaAposBaixaConta,
  labelRelacaoComissaoBaixa,
  labelStatusComissaoAtendimento,
  type CargoComissaoOperacional,
  type RegraComissao,
} from '../../lib/comissaoCalculo';
import {
  listarComissaoOperacionalServicos,
  type ComissaoOperacionalServicoDto,
} from '../../lib/comissaoOperacionalServico';
import {
  calcularComissaoAtendimentoOperacional,
  modoCalculoCargo,
} from '../../lib/comissaoOperacionalServicoCalculo';
import { ComissaoServicosCargoPanel } from '../../components/rh/ComissaoServicosCargoPanel';
import { ComissaoPlanilhaDemonstrativo } from '../../components/rh/ComissaoPlanilhaDemonstrativo';
import {
  listarComissaoAuditoria,
  registrarComissaoAuditoria,
  LABEL_ACAO_COMISSAO_AUDITORIA,
  type ComissaoAuditoriaDto,
} from '../../lib/comissaoAuditoriaService';

function cargoOperacionalColab(role: string): CargoComissaoOperacional {
  return role === 'atendente' ? 'atendente' : 'agente_funerario';
}

function planoComissaoFromAtendimento(atd: AtendimentoComissaoDto) {
  return {
    comissao_agente_percentual: atd.plano_comissao_agente_percentual,
    comissao_agente_fixo_centavos: atd.plano_comissao_agente_fixo_centavos,
    comissao_atendente_percentual: atd.plano_comissao_atendente_percentual,
    comissao_atendente_fixo_centavos: atd.plano_comissao_atendente_fixo_centavos,
  };
}

interface CalculoComissaoColaborador {
  colaborador: ColaboradorResumoDto;
  total_os: number;
  faturamento_os_centavos: number;
  valor_comissao_centavos: number;
  total_os_previsto: number;
  faturamento_previsto_centavos: number;
  comissao_prevista_centavos: number;
  atendimentos: AtendimentoComissaoDto[];
}

interface HistoricoMensalItem {
  mes: string;
  mesLabel: string;
  faturamento_centavos: number;
  comissao_centavos: number;
  percentual_efetivo: number;
  total_os: number;
}

const OPCOES_MESES_HISTORICO = [3, 6, 12] as const;

const ultimoDiaMesLocal = (mesAno: string): string => {
  const [ano, mes] = mesAno.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${mesAno}-${String(ultimo).padStart(2, '0')}`;
};

const periodoDoMes = (yyyyMm: string) => ({
  inicio: `${yyyyMm}-01`,
  fim: ultimoDiaMesLocal(yyyyMm),
});

const formatarPeriodo = (inicio: string, fim: string) =>
  `${new Date(inicio + 'T12:00:00').toLocaleDateString('pt-BR')} — ${new Date(fim + 'T12:00:00').toLocaleDateString('pt-BR')}`;

export const ComissoesAtendentes: React.FC = () => {
  const { user } = useAuth();
  const { dataRevisionEmpresa, empresasDoGrupo, visaoTodasEmpresasGrupo, empresaIdEfetivo } = useEmpresaContextoAtivo();
  const { empresaIdsFiltro } = useEmpresaIdsOperacao();
  const { showToast } = useToast();

  /** Gestor/RH/financeiro vê todos os colaboradores; um atendente/agente comum só vê a própria comissão. */
  const souGestor = usuarioEhGestorComissao(user?.role);

  const [mesFilter, setMesFilter] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });
  const [dataInicio, setDataInicio] = useState(() => periodoDoMes(
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })(),
  ).inicio);
  const [dataFim, setDataFim] = useState(() => periodoDoMes(
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })(),
  ).fim);

  const mesesDisponiveis = useMemo(() => {
    const list = [];
    const hoje = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      list.push({ value: `${yyyy}-${mm}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return list;
  }, []);

  const [activeTab, setActiveTab] = useState<'valores' | 'config' | 'taxas' | 'auditoria'>('valores');
  const [auditoriaRegistros, setAuditoriaRegistros] = useState<ComissaoAuditoriaDto[]>([]);
  const [loadingAuditoria, setLoadingAuditoria] = useState(false);
  const [searchAuditoria, setSearchAuditoria] = useState('');
  const [colaboradores, setColaboradores] = useState<ColaboradorResumoDto[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoComissaoDto[]>([]);
  const [configs, setConfigs] = useState<ComissaoConfigPadrao[]>([]);
  const [servicosOperacional, setServicosOperacional] = useState<ComissaoOperacionalServicoDto[]>([]);
  const [modoCalculoAtendente, setModoCalculoAtendente] = useState<ModoCalculoComissao>('por_servico');
  const [modoCalculoAgente, setModoCalculoAgente] = useState<ModoCalculoComissao>('por_servico');
  const [planos, setPlanos] = useState<PlanoComissaoResumoDto[]>([]);
  const [overridesPorColaborador, setOverridesPorColaborador] = useState<Record<string, OperacionalPlanoComissaoDto[]>>({});
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Default values for config panel inputs
  const [configAtendente, setConfigAtendente] = useState({ percentual: '2.00', fixo: '0.00' });
  const [configAgente, setConfigAgente] = useState({ percentual: '0.00', fixo: '50.00' });

  const [editingColab, setEditingColab] = useState<ColaboradorResumoDto | null>(null);
  const [editColabForm, setEditColabForm] = useState({
    usarPadrao: true,
    percentual: '0.00',
    fixo: '0.00',
  });
  const [editPlanoOverrides, setEditPlanoOverrides] = useState<Record<string, { percentual: string; fixo: string }>>({});
  const [searchColab, setSearchColab] = useState('');
  const [roleColabFilter, setRoleColabFilter] = useState('');

  // Details Modal State
  const [selectedColabDetails, setSelectedColabDetails] = useState<CalculoComissaoColaborador | null>(null);
  const [pagamentosComissaoPorOs, setPagamentosComissaoPorOs] = useState<Map<string, PagamentoComissaoOsInfo>>(
    new Map(),
  );
  const [pagamentoPeriodo, setPagamentoPeriodo] = useState<PagamentoComissaoOperacionalDto | null>(null);
  const [registrandoPagamento, setRegistrandoPagamento] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);

  // Histórico mensal (gráfico) do colaborador aberto no modal de detalhes.
  const [historicoMensal, setHistoricoMensal] = useState<HistoricoMensalItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [mesesHistorico, setMesesHistorico] = useState<number>(6);

  // Filters for demonstrativo tab
  const [searchValores, setSearchValores] = useState('');
  const [roleValoresFilter, setRoleValoresFilter] = useState('');

  // Filters for details modal
  const [searchModalOS, setSearchModalOS] = useState('');

  // Load all data
  const loadData = async () => {
    if (empresaIdsFiltro.length === 0) return;
    setLoading(true);
    try {
      const idsGrupo = empresasDoGrupo.map(e => e.id).filter(Boolean);
      const [colabs, atds, confs, planosLista, servicosLista] = await Promise.all([
        listarColaboradoresParaComissao(idsGrupo),
        listarAtendimentosComissao(empresaIdsFiltro, {
          data_inicio: dataInicio,
          data_fim: dataFim,
          colaborador_id: souGestor ? undefined : user?.id,
        }),
        listarConfiguracoesComissao(empresaIdsFiltro),
        listarPlanosParaComissao(empresaIdsFiltro),
        listarComissaoOperacionalServicos(empresaIdsFiltro),
      ]);

      const operationalColabs = colabs.filter(
        u =>
          (u.role === 'atendente' || u.role === 'agente_funerario' || u.role === 'agentes_funerarios') &&
          (souGestor || u.id === user?.id)
      );
      setColaboradores(operationalColabs);
      setAtendimentos(atds);
      setConfigs(confs);
      setPlanos(planosLista);
      setServicosOperacional(servicosLista);

      const mainEmpresaId = empresaIdsFiltro[0];
      setModoCalculoAtendente(modoCalculoCargo(confs, mainEmpresaId, 'atendente'));
      setModoCalculoAgente(modoCalculoCargo(confs, mainEmpresaId, 'agente_funerario'));

      const overridesEntries = await Promise.all(
        operationalColabs.map(async (c) => {
          const cargo = cargoOperacionalColab(c.role);
          const ovs = await listarOverridesOperacionalPlano(c.id, cargo, empresaIdsFiltro);
          return [c.id, ovs] as const;
        }),
      );
      setOverridesPorColaborador(Object.fromEntries(overridesEntries));

      // Populate config panel from loaded configs if they exist for the main company
      const confAt = confs.find(c => c.empresa_id === mainEmpresaId && c.cargo === 'atendente');
      const confAg = confs.find(c => c.empresa_id === mainEmpresaId && c.cargo === 'agente_funerario');

      const regraAt = normalizarRegraConfigPadrao(confAt || { tipo_comissao: 'percentual', valor: 2 });
      const regraAg = normalizarRegraConfigPadrao(
        confAg || { tipo_comissao: 'fixo', valor: 50, percentual: 0, valor_fixo_centavos: 5000 },
      );

      setConfigAtendente({
        percentual: regraAt.percentual.toFixed(2),
        fixo: (regraAt.fixoCentavos / 100).toFixed(2),
      });
      setConfigAgente({
        percentual: regraAg.percentual.toFixed(2),
        fixo: (regraAg.fixoCentavos / 100).toFixed(2),
      });

    } catch (err) {
      console.error('[ComissoesAtendentes] loadData error:', err);
      showToast('Erro ao carregar dados de comissão.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [empresaIdsFiltro, dataInicio, dataFim, dataRevisionEmpresa, souGestor, user?.id]);

  // Defesa extra: usuário sem perfil de gestão nunca deve ficar nas abas administrativas.
  useEffect(() => {
    if (!souGestor && activeTab !== 'valores') setActiveTab('valores');
  }, [souGestor, activeTab]);

  const nomeUsuarioAuditoria = user?.nome || user?.email || 'Sistema';

  const carregarAuditoria = useCallback(async () => {
    if (empresaIdsFiltro.length === 0) return;
    setLoadingAuditoria(true);
    try {
      const registros = await listarComissaoAuditoria(empresaIdsFiltro, {
        dataInicio,
        dataFim,
        limite: 300,
      });
      setAuditoriaRegistros(registros);
    } finally {
      setLoadingAuditoria(false);
    }
  }, [empresaIdsFiltro, dataInicio, dataFim]);

  useEffect(() => {
    if (activeTab === 'auditoria' && souGestor) void carregarAuditoria();
  }, [activeTab, souGestor, carregarAuditoria, dataRevisionEmpresa]);

  const auditoriaFiltrada = useMemo(() => {
    const q = searchAuditoria.trim().toLowerCase();
    if (!q) return auditoriaRegistros;
    return auditoriaRegistros.filter((r) => {
      const blob = [
        r.descricao,
        r.usuario_nome,
        r.colaborador_nome,
        r.campo_alterado,
        r.valor_anterior,
        r.valor_novo,
        LABEL_ACAO_COMISSAO_AUDITORIA[r.acao] || r.acao,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [auditoriaRegistros, searchAuditoria]);

  const formatarDataHoraAuditoria = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const mainEmpresaId = empresaIdsFiltro[0] || '';

  const regrasPadraoEmpresa = useMemo(() => {
    const padraoAt = normalizarRegraConfigPadrao(
      configs.find((c) => c.empresa_id === mainEmpresaId && c.cargo === 'atendente') || {
        tipo_comissao: 'percentual',
        valor: 2,
      },
    );
    const padraoAg = normalizarRegraConfigPadrao(
      configs.find((c) => c.empresa_id === mainEmpresaId && c.cargo === 'agente_funerario') || {
        tipo_comissao: 'fixo',
        valor: 50,
        valor_fixo_centavos: 5000,
      },
    );
    return { padraoAt, padraoAg };
  }, [configs, mainEmpresaId]);

  const calcComissaoAtd = useCallback(
    (
      atd: AtendimentoComissaoDto,
      colab: ColaboradorResumoDto,
      override?: OperacionalPlanoComissaoDto,
    ) => {
      const cargo = cargoOperacionalColab(colab.role);
      return calcularComissaoAtendimentoOperacional({
        atd,
        colab,
        cargo,
        configs,
        servicosConfig: servicosOperacional,
        empresaId: mainEmpresaId,
        padraoAt: regrasPadraoEmpresa.padraoAt,
        padraoAg: regrasPadraoEmpresa.padraoAg,
        override,
      }).total_centavos;
    },
    [configs, servicosOperacional, mainEmpresaId, regrasPadraoEmpresa],
  );

  const calcDetalhesAtd = useCallback(
    (
      atd: AtendimentoComissaoDto,
      colab: ColaboradorResumoDto,
      override?: OperacionalPlanoComissaoDto,
    ) => {
      const cargo = cargoOperacionalColab(colab.role);
      return calcularComissaoAtendimentoOperacional({
        atd,
        colab,
        cargo,
        configs,
        servicosConfig: servicosOperacional,
        empresaId: mainEmpresaId,
        padraoAt: regrasPadraoEmpresa.padraoAt,
        padraoAg: regrasPadraoEmpresa.padraoAg,
        override,
      }).detalhes;
    },
    [configs, servicosOperacional, mainEmpresaId, regrasPadraoEmpresa],
  );

  // Handle settings saving
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (empresaIdsFiltro.length === 0) return;

    let validacaoAt = validarEntradaComissao('0', '0');
    let validacaoAg = validarEntradaComissao('0', '0');

    if (modoCalculoAtendente === 'percentual_os') {
      validacaoAt = validarEntradaComissao(configAtendente.percentual, configAtendente.fixo, 'padrão do Atendente');
      if (!validacaoAt.ok) {
        showToast(validacaoAt.mensagem!, 'error');
        return;
      }
    }
    if (modoCalculoAgente === 'percentual_os') {
      validacaoAg = validarEntradaComissao(configAgente.percentual, configAgente.fixo, 'padrão do Agente Funerário');
      if (!validacaoAg.ok) {
        showToast(validacaoAg.mensagem!, 'error');
        return;
      }
    }

    setSavingConfig(true);
    try {
      const mainEmpresaId = empresaIdsFiltro[0];
      const confAtAntes = configs.find((c) => c.empresa_id === mainEmpresaId && c.cargo === 'atendente');
      const confAgAntes = configs.find((c) => c.empresa_id === mainEmpresaId && c.cargo === 'agente_funerario');
      const regraAtAntes = normalizarRegraConfigPadrao(
        confAtAntes || { tipo_comissao: 'percentual', valor: 2 },
      );
      const regraAgAntes = normalizarRegraConfigPadrao(
        confAgAntes || { tipo_comissao: 'fixo', valor: 50, valor_fixo_centavos: 5000 },
      );

      const successAt = await salvarConfiguracaoComissao(
        mainEmpresaId,
        'atendente',
        validacaoAt.percentual,
        validacaoAt.fixoCentavos,
        modoCalculoAtendente,
      );

      const successAg = await salvarConfiguracaoComissao(
        mainEmpresaId,
        'agente_funerario',
        validacaoAg.percentual,
        validacaoAg.fixoCentavos,
        modoCalculoAgente,
      );

      if (successAt && successAg) {
        const regraAtNova: RegraComissao = {
          percentual: validacaoAt.percentual,
          fixoCentavos: validacaoAt.fixoCentavos,
        };
        const regraAgNova: RegraComissao = {
          percentual: validacaoAg.percentual,
          fixoCentavos: validacaoAg.fixoCentavos,
        };
        const auditBase = {
          empresaId: mainEmpresaId,
          usuarioId: user?.id,
          usuarioNome: nomeUsuarioAuditoria,
        };
        if (formatarRegraComissao(regraAtAntes) !== formatarRegraComissao(regraAtNova)) {
          await registrarComissaoAuditoria({
            ...auditBase,
            acao: 'config_padrao',
            entidadeTipo: 'cargo',
            entidadeId: 'atendente',
            campoAlterado: 'Padrão — Atendente',
            valorAnterior: formatarRegraComissao(regraAtAntes),
            valorNovo: formatarRegraComissao(regraAtNova),
            descricao: `Alterou o padrão de comissão do cargo Atendente.`,
          });
        }
        if (formatarRegraComissao(regraAgAntes) !== formatarRegraComissao(regraAgNova)) {
          await registrarComissaoAuditoria({
            ...auditBase,
            acao: 'config_padrao',
            entidadeTipo: 'cargo',
            entidadeId: 'agente_funerario',
            campoAlterado: 'Padrão — Agente Funerário',
            valorAnterior: formatarRegraComissao(regraAgAntes),
            valorNovo: formatarRegraComissao(regraAgNova),
            descricao: `Alterou o padrão de comissão do cargo Agente Funerário.`,
          });
        }
        showToast('Configurações de comissão salvas com sucesso!', 'success');
        // reload configs
        const confs = await listarConfiguracoesComissao(empresaIdsFiltro);
        setConfigs(confs);
        setActiveTab('valores');
      } else {
        showToast('Falha ao salvar alguma configuração.', 'warning');
      }
    } catch (err) {
      console.error('[ComissoesAtendentes] handleSaveConfig error:', err);
      showToast('Erro ao salvar as configurações.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Handle individual collaborator rate saving
  const handleSaveColabCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingColab) return;

    // Valida a comissão customizada do colaborador antes de salvar — cada pessoa pode ter um
    // valor diferente, mas precisa ser um número válido dentro da faixa aceitável.
    let pct: number | null = null;
    let fixoCentavos: number | null = null;
    if (!editColabForm.usarPadrao) {
      const validacao = validarEntradaComissao(
        editColabForm.percentual,
        editColabForm.fixo,
        `comissão de ${editingColab.nome}`,
      );
      if (!validacao.ok) {
        showToast(validacao.mensagem!, 'error');
        return;
      }
      pct = validacao.percentual;
      fixoCentavos = validacao.fixoCentavos;
    }

    // Valida todas as regras por plano antes de salvar qualquer coisa (evita salvar parcial).
    const overridesValidados: { planoId: string; pct: number | null; fixo: number | null }[] = [];
    for (const plano of planos) {
      const ov = editPlanoOverrides[plano.id];
      if (!ov) continue;
      const validacao = validarEntradaComissao(ov.percentual, ov.fixo, `${editingColab.nome} no plano ${plano.nome}`);
      if (!validacao.ok) {
        showToast(validacao.mensagem!, 'error');
        return;
      }
      overridesValidados.push({
        planoId: plano.id,
        pct: ov.percentual.trim() ? validacao.percentual : null,
        fixo: ov.fixo.trim() ? validacao.fixoCentavos : null,
      });
    }

    setSavingConfig(true);
    try {
      const empresaId = editingColab.empresa_id || empresaIdsFiltro[0];
      const padraoAt = normalizarRegraConfigPadrao(
        configs.find((c) => c.empresa_id === empresaId && c.cargo === 'atendente') || {
          tipo_comissao: 'percentual',
          valor: 2,
        },
      );
      const padraoAg = normalizarRegraConfigPadrao(
        configs.find((c) => c.empresa_id === empresaId && c.cargo === 'agente_funerario') || {
          tipo_comissao: 'fixo',
          valor: 50,
          valor_fixo_centavos: 5000,
        },
      );
      const padrao = editingColab.role === 'atendente' ? padraoAt : padraoAg;
      const regraAntes = normalizarRegraColaborador(editingColab, padrao);
      const temCustomAntes =
        editingColab.comissao_percentual != null ||
        editingColab.comissao_fixo_centavos != null ||
        editingColab.comissao_tipo === 'percentual' ||
        editingColab.comissao_tipo === 'fixo';
      const overridesAntes = overridesPorColaborador[editingColab.id] || [];

      const success = await salvarComissaoColaborador(editingColab.id, pct, fixoCentavos);
      if (success) {
        const cargo = cargoOperacionalColab(editingColab.role);
        for (const ov of overridesValidados) {
          await salvarOverrideOperacionalPlano(empresaId, editingColab.id, ov.planoId, cargo, ov.pct, ov.fixo);
        }

        const auditBase = {
          empresaId,
          usuarioId: user?.id,
          usuarioNome: nomeUsuarioAuditoria,
          colaboradorId: editingColab.id,
          colaboradorNome: editingColab.nome,
        };
        const regraNova: RegraComissao = editColabForm.usarPadrao
          ? padrao
          : { percentual: pct ?? 0, fixoCentavos: fixoCentavos ?? 0 };
        const temCustomNova = !editColabForm.usarPadrao;
        if (
          temCustomAntes !== temCustomNova ||
          formatarRegraComissao(regraAntes) !== formatarRegraComissao(regraNova)
        ) {
          await registrarComissaoAuditoria({
            ...auditBase,
            acao: 'colaborador',
            entidadeTipo: 'colaborador',
            entidadeId: editingColab.id,
            campoAlterado: 'Comissão individual',
            valorAnterior: temCustomAntes
              ? `Customizado: ${formatarRegraComissao(regraAntes)}`
              : `Padrão: ${formatarRegraComissao(padrao)}`,
            valorNovo: temCustomNova
              ? `Customizado: ${formatarRegraComissao(regraNova)}`
              : `Padrão: ${formatarRegraComissao(padrao)}`,
            descricao: `Atualizou a comissão de ${editingColab.nome}.`,
          });
        }
        for (const ov of overridesValidados) {
          const plano = planos.find((p) => p.id === ov.planoId);
          const ant = overridesAntes.find((a) => a.plano_id === ov.planoId);
          const regraOvAntes: RegraComissao = {
            percentual: ant?.percentual ?? 0,
            fixoCentavos: ant?.valor_fixo_centavos ?? 0,
          };
          const regraOvNova: RegraComissao = {
            percentual: ov.pct ?? 0,
            fixoCentavos: ov.fixo ?? 0,
          };
          if (formatarRegraComissao(regraOvAntes) !== formatarRegraComissao(regraOvNova)) {
            await registrarComissaoAuditoria({
              ...auditBase,
              acao: 'override_plano',
              entidadeTipo: 'plano',
              entidadeId: ov.planoId,
              campoAlterado: `Plano ${plano?.nome || ov.planoId}`,
              valorAnterior: formatarRegraComissao(regraOvAntes) || '—',
              valorNovo: formatarRegraComissao(regraOvNova) || '—',
              descricao: `Alterou regra por plano (${plano?.nome || 'plano'}) de ${editingColab.nome}.`,
            });
          }
        }

        showToast(`Comissão de ${editingColab.nome} atualizada com sucesso!`, 'success');
        setEditingColab(null);
        await loadData();
      } else {
        showToast('Erro ao atualizar comissão do colaborador.', 'error');
      }
    } catch (err) {
      console.error('[handleSaveColabCommission] error:', err);
      showToast('Erro ao salvar as configurações.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const calculos = useMemo(() => {
    const { padraoAt, padraoAg } = regrasPadraoEmpresa;

    return colaboradores.map(colab => {
      const colabAtds = atendimentos.filter(a => {
        if (colab.role === 'atendente') {
          return a.atendente_id === colab.id || (a.atendente_id === null && a.usuario_id === colab.id);
        } else if (colab.role === 'agente_funerario' || colab.role === 'agentes_funerarios') {
          return a.agente_funerario_id === colab.id;
        }
        return false;
      });

      const overrides = overridesPorColaborador[colab.id] || [];
      const overrideMap = new Map(overrides.map(o => [o.plano_id, o]));

      const colabAtdsConcluidos = colabAtds.filter(a => atendimentoComissaoConfirmada(a));
      const colabAtdsPrevistos = colabAtds.filter(a => atendimentoComissaoPendente(a));

      const totalFaturamentoConcluido = colabAtdsConcluidos.reduce((acc, curr) => acc + curr.valor_total_centavos, 0);
      const totalComissaoConcluido = colabAtdsConcluidos.reduce((acc, atd) => {
        const override = atd.plano_id ? overrideMap.get(atd.plano_id) : undefined;
        return acc + calcComissaoAtd(atd, colab, override);
      }, 0);

      const totalFaturamentoPrevisto = colabAtdsPrevistos.reduce((acc, curr) => acc + curr.valor_total_centavos, 0);
      const totalComissaoPrevisto = colabAtdsPrevistos.reduce((acc, atd) => {
        const override = atd.plano_id ? overrideMap.get(atd.plano_id) : undefined;
        return acc + calcComissaoAtd(atd, colab, override);
      }, 0);

      return {
        colaborador: colab,
        total_os: colabAtdsConcluidos.length,
        faturamento_os_centavos: totalFaturamentoConcluido,
        valor_comissao_centavos: totalComissaoConcluido,
        total_os_previsto: colabAtdsPrevistos.length,
        faturamento_previsto_centavos: totalFaturamentoPrevisto,
        comissao_prevista_centavos: totalComissaoPrevisto,
        atendimentos: colabAtds,
      };
    });
  }, [colaboradores, atendimentos, regrasPadraoEmpresa, overridesPorColaborador, calcComissaoAtd]);

  const calculosFiltrados = useMemo(() => {
    if (!souGestor) {
      // Visão "minhas comissões": nunca exibir dados de outro colaborador, mesmo defensivamente.
      return calculos.filter(item => item.colaborador.id === user?.id);
    }
    const isTodas = visaoTodasEmpresasGrupo || empresaIdsFiltro.length > 1;
    const empresaId = empresaIdEfetivo || (user?.empresa_id || '');
    return calculos.filter(item => {
      const belongs = isTodas || item.colaborador.empresa_id === empresaId || item.total_os > 0;
      if (!belongs) return false;

      if (searchValores) {
        const query = searchValores.toLowerCase();
        const matchesName = item.colaborador.nome.toLowerCase().includes(query);
        const matchesEmail = item.colaborador.email.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail) return false;
      }

      if (roleValoresFilter) {
        if (roleValoresFilter === 'atendente' && item.colaborador.role !== 'atendente') return false;
        if (roleValoresFilter === 'agente_funerario' && item.colaborador.role !== 'agente_funerario' && item.colaborador.role !== 'agentes_funerarios') return false;
      }

      return true;
    });
  }, [calculos, visaoTodasEmpresasGrupo, empresaIdsFiltro, empresaIdEfetivo, user?.empresa_id, searchValores, roleValoresFilter, souGestor, user?.id]);

  const atendimentosModalFiltrados = useMemo(() => {
    if (!selectedColabDetails) return [];
    if (!searchModalOS) return selectedColabDetails.atendimentos;

    const query = searchModalOS.toLowerCase().trim();
    return selectedColabDetails.atendimentos.filter((atd) => {
      return (
        atd.codigo.toLowerCase().includes(query) ||
        atd.cliente_nome.toLowerCase().includes(query) ||
        (atd.plano_nome || '').toLowerCase().includes(query) ||
        (atd.falecido_nome || '').toLowerCase().includes(query)
      );
    });
  }, [selectedColabDetails, searchModalOS]);

  const statsModalConcluidos = useMemo(() => {
    const atendimentosConcluidos = atendimentosModalFiltrados.filter(a => atendimentoComissaoConfirmada(a));
    const totalOs = atendimentosConcluidos.length;
    if (!selectedColabDetails) {
      return { totalOs: 0, totalFaturamento: 0, totalComissao: 0 };
    }

    const colab = selectedColabDetails.colaborador;
    const overrides = overridesPorColaborador[colab.id] || [];
    const overrideMap = new Map(overrides.map(o => [o.plano_id, o]));

    let totalFaturamento = 0;
    let totalComissao = 0;

    atendimentosConcluidos.forEach((atd) => {
      totalFaturamento += atd.valor_total_centavos;
      const override = atd.plano_id ? overrideMap.get(atd.plano_id) : undefined;
      totalComissao += calcComissaoAtd(atd, colab, override);
    });

    return {
      totalOs,
      totalFaturamento,
      totalComissao
    };
  }, [atendimentosModalFiltrados, selectedColabDetails, overridesPorColaborador, calcComissaoAtd]);

  const statsModalPendentes = useMemo(() => {
    const atendimentosPendentes = atendimentosModalFiltrados.filter(a => atendimentoComissaoPendente(a));
    const totalOs = atendimentosPendentes.length;
    if (!selectedColabDetails) {
      return { totalOs: 0, totalFaturamento: 0, totalComissao: 0 };
    }

    const colab = selectedColabDetails.colaborador;
    const overrides = overridesPorColaborador[colab.id] || [];
    const overrideMap = new Map(overrides.map(o => [o.plano_id, o]));

    let totalFaturamento = 0;
    let totalComissao = 0;

    atendimentosPendentes.forEach((atd) => {
      totalFaturamento += atd.valor_total_centavos;
      const override = atd.plano_id ? overrideMap.get(atd.plano_id) : undefined;
      totalComissao += calcComissaoAtd(atd, colab, override);
    });

    return {
      totalOs,
      totalFaturamento,
      totalComissao
    };
  }, [atendimentosModalFiltrados, selectedColabDetails, overridesPorColaborador, calcComissaoAtd]);

  const comissaoPorPlano = useMemo(() => {
    const map = new Map<string, { faturamento: number; comissao: number; count: number }>();
    
    atendimentosModalFiltrados.forEach((atd) => {
      const planoNome = atd.plano_nome || 'Particular / Sem Plano';
      const key = planoNome;
      const current = map.get(key) || { faturamento: 0, comissao: 0, count: 0 };
      
      current.faturamento += atd.valor_total_centavos;
      current.count += 1;

      const colab = selectedColabDetails?.colaborador;
      if (colab) {
        const overrides = overridesPorColaborador[colab.id] || [];
        const override = atd.plano_id ? overrides.find(o => o.plano_id === atd.plano_id) : undefined;
        current.comissao += calcComissaoAtd(atd, colab, override);
      }
      
      map.set(key, current);
    });
    
    return Array.from(map.entries()).map(([nome, val]) => ({
      nome,
      ...val
    })).sort((a, b) => b.comissao - a.comissao);
  }, [atendimentosModalFiltrados, selectedColabDetails, overridesPorColaborador, calcComissaoAtd]);

  // Filter list of collaborators for custom commission adjustment tab
  const colaboradoresFiltradosTaxa = useMemo(() => {
    const isTodas = visaoTodasEmpresasGrupo || empresaIdsFiltro.length > 1;
    const empresaId = empresaIdEfetivo || (user?.empresa_id || '');

    return colaboradores.filter(colab => {
      // Role filter
      if (colab.role !== 'atendente' && colab.role !== 'agente_funerario' && colab.role !== 'agentes_funerarios') {
        return false;
      }
      
      // Unit filter
      const belongsToUnit = isTodas || colab.empresa_id === empresaId;
      if (!belongsToUnit) return false;

      // Text search
      if (searchColab) {
        const query = searchColab.toLowerCase();
        const matchesName = colab.nome.toLowerCase().includes(query);
        const matchesEmail = colab.email.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail) return false;
      }

      // Role dropdown filter
      if (roleColabFilter) {
        if (roleColabFilter === 'atendente' && colab.role !== 'atendente') return false;
        if (roleColabFilter === 'agente_funerario' && colab.role !== 'agente_funerario' && colab.role !== 'agentes_funerarios') return false;
      }

      return true;
    });
  }, [colaboradores, searchColab, roleColabFilter, visaoTodasEmpresasGrupo, empresaIdsFiltro, empresaIdEfetivo, user?.empresa_id]);

  // Calculate global dashboard values
  const stats = useMemo(() => {
    const totalOs = atendimentos.filter(a => atendimentoComissaoConfirmada(a)).length;
    const totalFaturamento = atendimentos
      .filter(a => atendimentoComissaoConfirmada(a))
      .reduce((acc, curr) => acc + curr.valor_total_centavos, 0);
    const totalComissao = calculosFiltrados.reduce((acc, curr) => acc + curr.valor_comissao_centavos, 0);

    return {
      totalOs,
      totalFaturamento,
      totalComissao
    };
  }, [atendimentos, calculosFiltrados]);

  const handleStartEditColab = async (colab: ColaboradorResumoDto) => {
    setEditingColab(colab);
    const temCustom =
      colab.comissao_percentual != null ||
      colab.comissao_fixo_centavos != null ||
      colab.comissao_tipo === 'percentual' ||
      colab.comissao_tipo === 'fixo';

    setEditColabForm({
      usarPadrao: !temCustom,
      percentual:
        colab.comissao_percentual != null
          ? String(colab.comissao_percentual)
          : colab.comissao_tipo === 'percentual' && colab.comissao_valor != null
            ? String(colab.comissao_valor)
            : '0.00',
      fixo:
        colab.comissao_fixo_centavos != null
          ? (colab.comissao_fixo_centavos / 100).toFixed(2)
          : colab.comissao_tipo === 'fixo' && colab.comissao_valor != null
            ? String(colab.comissao_valor)
            : '0.00',
    });

    const cargo = cargoOperacionalColab(colab.role);
    const overrides = await listarOverridesOperacionalPlano(colab.id, cargo, empresaIdsFiltro);
    const map: Record<string, { percentual: string; fixo: string }> = {};
    overrides.forEach((o) => {
      map[o.plano_id] = {
        percentual: o.percentual != null ? String(o.percentual) : '',
        fixo: o.valor_fixo_centavos != null ? (o.valor_fixo_centavos / 100).toFixed(2) : '',
      };
    });
    setEditPlanoOverrides(map);
  };

  const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  // Busca, sob demanda (ao abrir o modal), o histórico dos últimos N meses do colaborador
  // selecionado para alimentar o gráfico de evolução mensal — não é pré-carregado para todo mundo.
  const carregarHistoricoMensal = useCallback(
    async (colab: ColaboradorResumoDto) => {
      setLoadingHistorico(true);
      setHistoricoMensal([]);
      try {
        const hoje = new Date();
        const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - (mesesHistorico - 1), 1);
        const dataInicioJanela = `${inicioJanela.getFullYear()}-${String(inicioJanela.getMonth() + 1).padStart(2, '0')}-01`;
        const dataFimJanela = ultimoDiaMesLocal(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);

        const atds = await listarAtendimentosComissao(empresaIdsFiltro, {
          data_inicio: dataInicioJanela,
          data_fim: dataFimJanela,
          colaborador_id: colab.id,
        });

        const mainEmpresaId = empresaIdsFiltro[0];
        const overrides = overridesPorColaborador[colab.id] || [];
        const overrideMap = new Map(overrides.map((o) => [o.plano_id, o]));

        const meusConcluidos = atds
          .filter((a) =>
            colab.role === 'atendente'
              ? a.atendente_id === colab.id || (a.atendente_id === null && a.usuario_id === colab.id)
              : a.agente_funerario_id === colab.id,
          )
          .filter((a) => atendimentoComissaoConfirmada(a));

        // Pré-popula os últimos N meses (mesmo sem OS) para o gráfico nunca ficar incompleto.
        const buckets = new Map<string, { faturamento: number; comissao: number; total_os: number }>();
        for (let i = 0; i < mesesHistorico; i++) {
          const d = new Date(hoje.getFullYear(), hoje.getMonth() - (mesesHistorico - 1 - i), 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          buckets.set(key, { faturamento: 0, comissao: 0, total_os: 0 });
        }

        meusConcluidos.forEach((atd) => {
          const mesKey = atd.data_servico.slice(0, 7);
          const bucket = buckets.get(mesKey) || { faturamento: 0, comissao: 0, total_os: 0 };
          const override = atd.plano_id ? overrideMap.get(atd.plano_id) : undefined;
          const comissao = calcComissaoAtd(atd, colab, override);
          bucket.faturamento += atd.valor_total_centavos;
          bucket.comissao += comissao;
          bucket.total_os += 1;
          buckets.set(mesKey, bucket);
        });

        const resultado: HistoricoMensalItem[] = Array.from(buckets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([mes, v]) => {
            const [ano, m] = mes.split('-').map(Number);
            const labelBruto = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            const mesLabel = labelBruto.charAt(0).toUpperCase() + labelBruto.slice(1).replace('.', '');
            return {
              mes,
              mesLabel,
              faturamento_centavos: v.faturamento,
              comissao_centavos: v.comissao,
              percentual_efetivo: v.faturamento > 0 ? Number(((v.comissao / v.faturamento) * 100).toFixed(2)) : 0,
              total_os: v.total_os,
            };
          });

        setHistoricoMensal(resultado);
      } catch (err) {
        console.error('[ComissoesAtendentes] carregarHistoricoMensal error:', err);
        setHistoricoMensal([]);
      } finally {
        setLoadingHistorico(false);
      }
    },
    [empresaIdsFiltro, configs, overridesPorColaborador, mesesHistorico],
  );

  // Reagir à troca do período do gráfico com o modal já aberto (sem precisar fechar/reabrir).
  useEffect(() => {
    if (selectedColabDetails) {
      void carregarHistoricoMensal(selectedColabDetails.colaborador);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesesHistorico]);

  const carregarDadosPagamentoModal = useCallback(async (colabId: string) => {
    if (empresaIdsFiltro.length === 0) return;
    const empresaId = empresaIdsFiltro[0];
    const [pagamentosPorOs, pagamento] = await Promise.all([
      listarPagamentosComissaoPorAtendimento(empresaIdsFiltro),
      buscarPagamentoComissaoPeriodo(empresaId, colabId, dataInicio, dataFim),
    ]);
    setPagamentosComissaoPorOs(pagamentosPorOs);
    setPagamentoPeriodo(pagamento);
  }, [empresaIdsFiltro, dataInicio, dataFim]);

  const linhasComissaoModal = useMemo((): LinhaComissaoOperacional[] => {
    if (!selectedColabDetails || empresaIdsFiltro.length === 0) return [];
    const colab = selectedColabDetails.colaborador;
    const overrides = overridesPorColaborador[colab.id] || [];
    return montarLinhasComissaoColaborador(
      colab,
      selectedColabDetails.atendimentos,
      configs,
      overrides,
      empresaIdsFiltro[0],
      pagamentosComissaoPorOs,
      servicosOperacional,
    );
  }, [selectedColabDetails, empresaIdsFiltro, configs, overridesPorColaborador, pagamentosComissaoPorOs, servicosOperacional]);

  const linhasAPagarModal = useMemo(() => {
    if (!selectedColabDetails) return [];
    return filtrarLinhasConfirmadasPagaveis(linhasComissaoModal, selectedColabDetails.atendimentos);
  }, [linhasComissaoModal, selectedColabDetails]);

  const totalComissaoAPagarModal = useMemo(
    () => linhasAPagarModal.reduce((s, l) => s + l.valor_comissao_centavos, 0),
    [linhasAPagarModal],
  );

  const empresaNomeRelatorio = useMemo(
    () => empresasDoGrupo.find((e) => e.id === empresaIdsFiltro[0])?.nome || '',
    [empresasDoGrupo, empresaIdsFiltro],
  );

  const handleImprimirRelatorioComissao = async () => {
    if (!selectedColabDetails) return;
    setGerandoRelatorio(true);
    try {
      await gerarRelatorioComissaoOperacionalPdf({
        colaboradorNome: selectedColabDetails.colaborador.nome,
        colaboradorCargo: selectedColabDetails.colaborador.role === 'atendente' ? 'Atendente' : 'Agente Funerário',
        periodoInicio: dataInicio,
        periodoFim: dataFim,
        empresaNome: empresaNomeRelatorio,
        linhas: linhasComissaoModal,
        pagamento: pagamentoPeriodo,
      });
      if (empresaIdsFiltro[0]) {
        await registrarComissaoAuditoria({
          empresaId: empresaIdsFiltro[0],
          acao: 'relatorio',
          usuarioId: user?.id,
          usuarioNome: nomeUsuarioAuditoria,
          colaboradorId: selectedColabDetails.colaborador.id,
          colaboradorNome: selectedColabDetails.colaborador.nome,
          descricao: `Gerou relatório de comissão de ${selectedColabDetails.colaborador.nome} (${formatarPeriodo(dataInicio, dataFim)}).`,
          metadata: { periodo_inicio: dataInicio, periodo_fim: dataFim },
        });
      }
      showToast('Relatório gerado para impressão.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao gerar relatório.', 'error');
    } finally {
      setGerandoRelatorio(false);
    }
  };

  const handleAceitarPagamentoComissao = async () => {
    if (!selectedColabDetails || !user?.id || empresaIdsFiltro.length === 0) return;
    if (pagamentoPeriodo) {
      showToast(
        `Comissão deste período já foi paga (recibo ${pagamentoPeriodo.numero_recibo}).`,
        'warning',
      );
      return;
    }
    if (linhasAPagarModal.length === 0 || totalComissaoAPagarModal <= 0) {
      showToast('Não há comissão confirmada pendente de pagamento neste período.', 'warning');
      return;
    }

    const colab = selectedColabDetails.colaborador;
    const msg = `Confirmar pagamento de ${formatCurrency(totalComissaoAPagarModal)} referente a ${linhasAPagarModal.length} OS(s) de ${colab.nome}?`;
    if (!window.confirm(msg)) return;

    setRegistrandoPagamento(true);
    try {
      const resultado = await registrarPagamentoComissaoOperacional({
        empresaId: empresaIdsFiltro[0],
        colaboradorId: colab.id,
        colaboradorNome: colab.nome,
        cargo: cargoOperacionalColab(colab.role),
        periodoInicio: dataInicio,
        periodoFim: dataFim,
        linhas: linhasAPagarModal,
        pagoPorId: user.id,
        pagoPorNome: user.nome || user.email || 'Sistema',
      });

      if (resultado.ok === false) {
        showToast(resultado.error, 'error');
        return;
      }

      setPagamentoPeriodo(resultado.pagamento);
      const novosPagamentos = new Map(pagamentosComissaoPorOs);
      linhasAPagarModal.forEach((l) => {
        novosPagamentos.set(l.atendimento_id, {
          pago_em: resultado.pagamento.pago_em,
          numero_recibo: resultado.pagamento.numero_recibo,
        });
      });
      setPagamentosComissaoPorOs(novosPagamentos);

      await gerarReciboPagamentoComissaoOperacional({
        pagamento: resultado.pagamento,
        colaboradorNome: colab.nome,
        empresaId: empresaIdsFiltro[0],
        empresaNome: empresaNomeRelatorio,
        pagoPorNome: user.nome || user.email || 'Sistema',
        totalOs: resultado.pagamento.total_os,
      });

      await registrarComissaoAuditoria({
        empresaId: empresaIdsFiltro[0],
        acao: 'pagamento',
        usuarioId: user.id,
        usuarioNome: nomeUsuarioAuditoria,
        colaboradorId: colab.id,
        colaboradorNome: colab.nome,
        entidadeTipo: 'pagamento',
        entidadeId: resultado.pagamento.id,
        valorNovo: formatCurrency(resultado.pagamento.valor_comissao_centavos),
        descricao: `Registrou pagamento de comissão — recibo ${resultado.pagamento.numero_recibo} (${linhasAPagarModal.length} OS, ${formatarPeriodo(dataInicio, dataFim)}).`,
        metadata: {
          numero_recibo: resultado.pagamento.numero_recibo,
          total_os: resultado.pagamento.total_os,
          periodo_inicio: dataInicio,
          periodo_fim: dataFim,
        },
      });

      showToast(`Pagamento registrado — recibo ${resultado.pagamento.numero_recibo}.`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Erro ao registrar pagamento.', 'error');
    } finally {
      setRegistrandoPagamento(false);
    }
  };

  const handleReimprimirReciboPagamento = async () => {
    if (!pagamentoPeriodo || !selectedColabDetails || empresaIdsFiltro.length === 0) return;
    try {
      await gerarReciboPagamentoComissaoOperacional({
        pagamento: pagamentoPeriodo,
        colaboradorNome: selectedColabDetails.colaborador.nome,
        empresaId: empresaIdsFiltro[0],
        empresaNome: empresaNomeRelatorio,
        pagoPorNome: pagamentoPeriodo.pago_por_nome || user?.nome || 'Sistema',
        totalOs: pagamentoPeriodo.total_os,
      });
    } catch (e) {
      console.error(e);
      showToast('Erro ao gerar recibo.', 'error');
    }
  };

  // Abre o modal de detalhes e já dispara o carregamento do histórico mensal (sem clique extra).
  const abrirDetalhesColab = useCallback(
    (item: CalculoComissaoColaborador) => {
      setSearchModalOS('');
      setPagamentoPeriodo(null);
      setPagamentosComissaoPorOs(new Map());
      setSelectedColabDetails(item);
      void carregarHistoricoMensal(item.colaborador);
      void carregarDadosPagamentoModal(item.colaborador.id);
    },
    [carregarHistoricoMensal, carregarDadosPagamentoModal],
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title={souGestor ? 'Comissões de Atendimento' : 'Minhas Comissões de Atendimento'}
        subtitle={
          souGestor
            ? 'Controle de faturamento e comissões para Atendentes e Agentes Funerários'
            : 'Suas ordens de serviço e comissões calculadas no período selecionado'
        }
        actionButton={
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 border border-gray-200 bg-white cursor-pointer"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Tabs Selector Bar */}
      <div className="flex border-b border-gray-200 bg-white rounded-lg p-1 shadow-sm gap-2">
        <button
          className={`py-2.5 px-5 font-semibold text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'valores'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
          onClick={() => setActiveTab('valores')}
        >
          <DollarSign className="h-4 w-4" />
          Demonstrativo de Comissões
        </button>
        {souGestor && (
          <>
            <button
              className={`py-2.5 px-5 font-semibold text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'config'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('config')}
            >
              <Settings className="h-4 w-4" />
              Tabela de Serviços
            </button>
            <button
              className={`py-2.5 px-5 font-semibold text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'taxas'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('taxas')}
            >
              <UserCheck className="h-4 w-4" />
              Ajustes por Colaborador
            </button>
            <button
              className={`py-2.5 px-5 font-semibold text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'auditoria'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('auditoria')}
            >
              <History className="h-4 w-4" />
              Auditoria
            </button>
          </>
        )}
      </div>

      {/* Overview Cards */}
      {activeTab === 'valores' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="p-5 flex items-center gap-4 bg-teal-50/50 border-teal-100">
            <div className="p-3 bg-teal-100/80 rounded-xl text-teal-700">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Faturamento Concluído (Mês)</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatCurrency(stats.totalFaturamento)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stats.totalOs} ordens de serviço concluídas</p>
            </div>
          </Card>

          <Card className="p-5 flex items-center gap-4 bg-blue-50/50 border-blue-100">
            <div className="p-3 bg-blue-100/80 rounded-xl text-blue-700">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de Comissões Calculadas</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatCurrency(stats.totalComissao)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Baseado em atendimentos concluídos no período</p>
            </div>
          </Card>

          <Card className="p-5 flex items-center gap-4 bg-indigo-50/50 border-indigo-100">
            <div className="p-3 bg-indigo-100/80 rounded-xl text-indigo-700">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Profissionais com Atendimento</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">
                {calculosFiltrados.filter(c => c.total_os > 0).length} de {calculosFiltrados.length}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Atendentes e agentes ativos cadastrados</p>
            </div>
          </Card>
        </div>
      )}

      {/* Filtro de período */}
      {activeTab === 'valores' && (
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mês rápido</label>
              <Select
                value={mesFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setMesFilter(val);
                  const p = periodoDoMes(val);
                  setDataInicio(p.inicio);
                  setDataFim(p.fim);
                }}
              >
                {mesesDisponiveis.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data início</label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Data fim</label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <div className="md:pb-1">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                Período: <span className="font-medium text-gray-700">{formatarPeriodo(dataInicio, dataFim)}</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Comissão confirmada para OS aprovadas ou concluídas na data do serviço.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Main Tab Panels */}
      {activeTab === 'valores' ? (
        <Card className="overflow-hidden border border-gray-150">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-3">
            <h3 className="font-bold text-gray-800 shrink-0">Demonstrativo por Colaborador</h3>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={searchValores}
                  onChange={(e) => setSearchValores(e.target.value)}
                  className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 w-full h-9 bg-white"
                />
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
              </div>
              <select
                value={roleValoresFilter}
                onChange={(e) => setRoleValoresFilter(e.target.value)}
                className="border border-gray-300 rounded-lg text-xs px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 h-9 shrink-0"
              >
                <option value="">Todos os Cargos</option>
                <option value="atendente">Atendentes</option>
                <option value="agente_funerario">Agentes Funerários</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-8 w-8 text-teal-600 animate-spin" />
              <span>Calculando comissões...</span>
            </div>
          ) : calculosFiltrados.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              Nenhum colaborador com cargo "Atendente" ou "Agente Funerário" encontrado no sistema.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {calculosFiltrados.map((item) => (
                <div
                  key={item.colaborador.id}
                  onClick={() => abrirDetalhesColab(item)}
                  className="p-6 flex flex-wrap items-center justify-between gap-4 hover:bg-teal-50/10 hover:shadow-md transition-all cursor-pointer rounded-xl bg-white border border-transparent hover:border-teal-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-teal-100/50 rounded-full flex items-center justify-center text-teal-700 font-bold text-base">
                      {item.colaborador.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{item.colaborador.nome}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <User className="h-3 w-3" />
                        {item.colaborador.role === 'atendente' ? 'Atendente' : 'Agente Funerário'} · {item.colaborador.email}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10">
                    <div className="text-center sm:text-left">
                      <p className="text-xs text-gray-500">Qtd. OS</p>
                      <p className="text-base font-bold text-gray-900 mt-0.5">
                        {item.total_os}
                        {item.total_os_previsto > 0 && (
                          <span className="text-xs text-amber-600 font-semibold ml-1">
                            (+{item.total_os_previsto} prev.)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-xs text-gray-500">Faturamento OS</p>
                      <p className="text-base font-medium text-gray-900 mt-0.5">
                        {formatCurrency(item.faturamento_os_centavos)}
                        {item.faturamento_previsto_centavos > 0 && (
                          <span className="block text-[10px] text-amber-600 font-semibold mt-0.5">
                            + {formatCurrency(item.faturamento_previsto_centavos)} prev.
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-xs text-gray-500">Comissão Devida</p>
                      <p className="text-base font-extrabold text-teal-700 mt-0.5">
                        {formatCurrency(item.valor_comissao_centavos)}
                      </p>
                      {item.comissao_prevista_centavos > 0 && (
                        <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                          + {formatCurrency(item.comissao_prevista_centavos)} previstos
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-center sm:justify-end">
                      <button
                        onClick={() => abrirDetalhesColab(item)}
                        className="flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
                      >
                        Ver Detalhes
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : activeTab === 'config' ? (
        /* Configuration Sub-module Panel */
        <div className="max-w-4xl mx-auto space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 border-b pb-3 mb-6">
              <div className="p-2 bg-teal-100 text-teal-700 rounded-lg">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Tabela de Comissão por Serviço</h3>
                <p className="text-xs text-gray-500">
                  Configure os valores como na planilha de controle — cada coluna (Roupa, Tanato, Fênix, Ônix, etc.) soma na comissão da OS
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-6">
              {mainEmpresaId && (
                <>
                  <ComissaoServicosCargoPanel
                    empresaId={mainEmpresaId}
                    cargo="atendente"
                    titulo="Atendente Funerário"
                    descricao="Roupa, Tanato, Sala, TP-3, TP-4 e percentual em OS particular."
                    corAccent="bg-teal-500"
                    servicos={servicosOperacional}
                    modoCalculo={modoCalculoAtendente}
                    onModoChange={setModoCalculoAtendente}
                    onSaved={loadData}
                    showToast={showToast}
                  />

                  <ComissaoServicosCargoPanel
                    empresaId={mainEmpresaId}
                    cargo="agente_funerario"
                    titulo="Agente Funerário"
                    descricao="Roupa, Preparação Fênix, Preparação Ônix, TP-3, TP-4, Retirada, Cortejo e percentual particular."
                    corAccent="bg-blue-500"
                    servicos={servicosOperacional}
                    modoCalculo={modoCalculoAgente}
                    onModoChange={setModoCalculoAgente}
                    onSaved={loadData}
                    showToast={showToast}
                  />
                </>
              )}

              {(modoCalculoAtendente === 'percentual_os' || modoCalculoAgente === 'percentual_os') && (
                <div className="space-y-4 border-t pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Modo legado — percentual sobre faturamento
                  </p>
                  {modoCalculoAtendente === 'percentual_os' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-xl border">
                      <Input
                        label="Atendente — Percentual (%)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={configAtendente.percentual}
                        onChange={(e) => setConfigAtendente(p => ({ ...p, percentual: e.target.value }))}
                      />
                      <Input
                        label="Atendente — Fixo por OS (R$)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={configAtendente.fixo}
                        onChange={(e) => setConfigAtendente(p => ({ ...p, fixo: e.target.value }))}
                      />
                    </div>
                  )}
                  {modoCalculoAgente === 'percentual_os' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-xl border">
                      <Input
                        label="Agente — Percentual (%)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={configAgente.percentual}
                        onChange={(e) => setConfigAgente(p => ({ ...p, percentual: e.target.value }))}
                      />
                      <Input
                        label="Agente — Fixo por OS (R$)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={configAgente.fixo}
                        onChange={(e) => setConfigAgente(p => ({ ...p, fixo: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab('valores')}
                  disabled={savingConfig}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  loading={savingConfig}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Salvar modo de cálculo
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : activeTab === 'taxas' ? (
        /* Custom Collaborator Rates Config Panel */
        <Card className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Ajuste de Comissão por Colaborador</h3>
              <p className="text-xs text-gray-500">Configure exceções e comissões específicas para cada atendente ou agente</p>
            </div>
            
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={searchColab}
                  onChange={(e) => setSearchColab(e.target.value)}
                  className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-48 md:w-64"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>

              {/* Role filter */}
              <select
                value={roleColabFilter}
                onChange={(e) => setRoleColabFilter(e.target.value)}
                className="border rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Todos os Cargos</option>
                <option value="atendente">Atendentes</option>
                <option value="agente_funerario">Agentes Funerários</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-150">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 font-semibold text-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left">Colaborador</th>
                  <th className="px-6 py-3 text-left">Cargo</th>
                  <th className="px-6 py-3 text-left">E-mail</th>
                  <th className="px-6 py-3 text-left">Configuração de Comissão</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-600 bg-white">
                {colaboradoresFiltradosTaxa.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      Nenhum atendente ou agente funerário encontrado para os filtros ativos.
                    </td>
                  </tr>
                ) : (
                  colaboradoresFiltradosTaxa.map((colab) => {
                    const mainEmpresaId = empresaIdsFiltro[0];
                    const padraoAt = normalizarRegraConfigPadrao(
                      configs.find(c => c.empresa_id === mainEmpresaId && c.cargo === 'atendente') || { tipo_comissao: 'percentual', valor: 2 },
                    );
                    const padraoAg = normalizarRegraConfigPadrao(
                      configs.find(c => c.empresa_id === mainEmpresaId && c.cargo === 'agente_funerario') || {
                        tipo_comissao: 'fixo',
                        valor: 50,
                        valor_fixo_centavos: 5000,
                      },
                    );
                    const padrao = colab.role === 'atendente' ? padraoAt : padraoAg;
                    const temCustom =
                      colab.comissao_percentual != null ||
                      colab.comissao_fixo_centavos != null ||
                      colab.comissao_tipo === 'percentual' ||
                      colab.comissao_tipo === 'fixo';
                    const regra = temCustom ? normalizarRegraColaborador(colab, padrao) : padrao;
                    const configLabel = temCustom
                      ? `Customizado: ${formatarRegraComissao(regra)}`
                      : `Padrão da Unidade: ${formatarRegraComissao(padrao)}`;
                    const qtdOverrides = (overridesPorColaborador[colab.id] || []).length;

                    return (
                      <tr key={colab.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 font-bold text-gray-900">{colab.nome}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            colab.role === 'atendente' ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}>
                            {colab.role === 'atendente' ? 'Atendente' : 'Agente Funerário'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500">{colab.email}</td>
                        <td className="px-6 py-4 font-medium">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${
                            temCustom ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-gray-50 text-gray-600 border border-gray-100'
                          }`}>
                            {configLabel}
                          </span>
                          {qtdOverrides > 0 && (
                            <p className="text-[11px] text-amber-600 mt-1">{qtdOverrides} regra(s) por plano</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleStartEditColab(colab)}
                            className="text-xs font-bold text-teal-600 hover:text-teal-700 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Editar Comissões
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* Auditoria — histórico de alterações */
        <Card className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
            <div>
              <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-teal-600" />
                Auditoria de Comissões
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Histórico de alterações em padrões, colaboradores, pagamentos e relatórios no período selecionado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar no histórico..."
                  value={searchAuditoria}
                  onChange={(e) => setSearchAuditoria(e.target.value)}
                  className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-56"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void carregarAuditoria()}
                disabled={loadingAuditoria}
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loadingAuditoria ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-4">
            Período do filtro: {formatarPeriodo(dataInicio, dataFim)}
          </p>

          {loadingAuditoria ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <span className="text-sm">Carregando histórico…</span>
            </div>
          ) : auditoriaFiltrada.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum registro de auditoria neste período.</p>
              <p className="text-xs mt-1">Alterações em padrões, colaboradores e pagamentos aparecerão aqui.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-gray-200 pl-6 ml-3 space-y-6 py-2">
              {auditoriaFiltrada.map((reg) => {
                const iconeAcao =
                  reg.acao === 'pagamento' ? (
                    <Wallet className="h-3.5 w-3.5" />
                  ) : reg.acao === 'relatorio' ? (
                    <FileText className="h-3.5 w-3.5" />
                  ) : reg.acao === 'override_plano' ? (
                    <Layers className="h-3.5 w-3.5" />
                  ) : reg.acao === 'colaborador' ? (
                    <UserCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Settings className="h-3.5 w-3.5" />
                  );
                const corPonto =
                  reg.acao === 'pagamento'
                    ? 'bg-emerald-600'
                    : reg.acao === 'relatorio'
                      ? 'bg-blue-600'
                      : 'bg-teal-600';

                return (
                  <div key={reg.id} className="relative">
                    <div
                      className={`absolute -left-[31px] top-0 ${corPonto} border-2 border-white rounded-lg p-1.5 text-white shadow-sm`}
                    >
                      {iconeAcao}
                    </div>
                    <div className="space-y-1.5 bg-gray-50/60 rounded-xl border border-gray-100 p-4">
                      <div className="flex flex-wrap justify-between gap-2 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                        <span>{LABEL_ACAO_COMISSAO_AUDITORIA[reg.acao] || reg.acao}</span>
                        <span>{formatarDataHoraAuditoria(reg.created_at)}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{reg.descricao}</p>
                      {reg.colaborador_nome && (
                        <p className="text-xs text-gray-600">
                          Colaborador: <strong className="text-gray-800">{reg.colaborador_nome}</strong>
                        </p>
                      )}
                      {(reg.valor_anterior || reg.valor_novo) && (
                        <div className="flex flex-wrap gap-2 text-xs mt-1">
                          {reg.valor_anterior && (
                            <span className="px-2 py-1 rounded-md bg-red-50 text-red-800 border border-red-100">
                              Antes: {reg.valor_anterior}
                            </span>
                          )}
                          {reg.valor_novo && (
                            <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-100">
                              Depois: {reg.valor_novo}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-gray-500 flex items-center gap-1.5 pt-1 border-t border-gray-100 mt-2">
                        <User className="h-3 w-3" />
                        Por: <strong className="text-gray-700">{reg.usuario_nome || 'Sistema'}</strong>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Details Modal */}
      {selectedColabDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-white">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Atendimentos de {selectedColabDetails.colaborador.nome}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  OS concluídas e previstas de {formatarPeriodo(dataInicio, dataFim)}
                </p>
              </div>
              <button
                onClick={() => setSelectedColabDetails(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-semibold p-1"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {pagamentoPeriodo && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      Comissão paga em{' '}
                      {new Date(pagamentoPeriodo.pago_em).toLocaleDateString('pt-BR')} — recibo{' '}
                      <strong>{pagamentoPeriodo.numero_recibo}</strong> ({formatCurrency(pagamentoPeriodo.valor_comissao_centavos)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleReimprimirReciboPagamento()}
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline"
                  >
                    Reimprimir recibo
                  </button>
                </div>
              )}
              {!pagamentoPeriodo && totalComissaoAPagarModal > 0 && souGestor && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                  Pendente de pagamento: <strong>{formatCurrency(totalComissaoAPagarModal)}</strong> em{' '}
                  {linhasAPagarModal.length} OS confirmada(s).
                </div>
              )}

              {selectedColabDetails && modoCalculoCargo(
                configs,
                mainEmpresaId,
                cargoOperacionalColab(selectedColabDetails.colaborador.role),
              ) === 'por_servico' && (
                <div className="mb-6">
                  <ComissaoPlanilhaDemonstrativo
                    atendimentos={atendimentosModalFiltrados.filter((a) => atendimentoComissaoConfirmada(a))}
                    servicos={servicosOperacional.filter(
                      (s) =>
                        s.cargo === cargoOperacionalColab(selectedColabDetails.colaborador.role) &&
                        s.ativo &&
                        s.empresa_id === mainEmpresaId,
                    )}
                    calcularDetalhes={(atd) => {
                      const colab = selectedColabDetails.colaborador;
                      const overrides = overridesPorColaborador[colab.id] || [];
                      const override = atd.plano_id ? overrides.find((o) => o.plano_id === atd.plano_id) : undefined;
                      return calcDetalhesAtd(atd, colab, override);
                    }}
                    tituloColaborador={selectedColabDetails.colaborador.nome}
                  />
                </div>
              )}

              {/* Evolução Mensal (gráfico) — carrega automaticamente ao abrir o modal */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-gray-400" />
                    Evolução Mensal — últimos {mesesHistorico} meses (OS concluídas)
                  </h4>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {OPCOES_MESES_HISTORICO.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setMesesHistorico(opt)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          mesesHistorico === opt
                            ? 'bg-teal-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        {opt}m
                      </button>
                    ))}
                  </div>
                </div>
                {loadingHistorico ? (
                  <div className="h-56 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <RefreshCw className="h-6 w-6 animate-spin text-teal-500" />
                    <span className="text-xs">Carregando histórico...</span>
                  </div>
                ) : historicoMensal.every((h) => h.total_os === 0) ? (
                  <div className="h-56 flex items-center justify-center text-xs text-gray-400 italic">
                    Nenhuma OS concluída nos últimos {mesesHistorico} meses para este colaborador.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={historicoMensal} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.20)" vertical={false} />
                      <XAxis
                        dataKey="mesLabel"
                        tick={{ fill: '#475569', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        yAxisId="comissao"
                        tick={{ fill: '#475569', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                        width={64}
                        tickFormatter={(v) => `R$ ${(Number(v) / 100).toFixed(0)}`}
                      />
                      <YAxis
                        yAxisId="percentual"
                        orientation="right"
                        tick={{ fill: '#475569', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                        width={48}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#334155', fontWeight: 600 }}
                        formatter={(value: number, name: string) => {
                          if (name === 'Comissão') return [formatCurrency(Number(value)), name];
                          if (name === '% Efetivo') return [`${Number(value).toFixed(2)}%`, name];
                          return [String(value), name];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', color: '#475569' }} />
                      <Bar
                        yAxisId="comissao"
                        dataKey="comissao_centavos"
                        name="Comissão"
                        fill="#0d9488"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="percentual"
                        type="monotone"
                        dataKey="percentual_efetivo"
                        name="% Efetivo"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Side: Search and OS Table */}
                <div className="lg:col-span-2 space-y-4">
                  {/* OS Search Bar */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Filtrar ordens de serviço por código, cliente, plano ou falecido..."
                      value={searchModalOS}
                      onChange={(e) => setSearchModalOS(e.target.value)}
                      className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-full bg-white"
                    />
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  </div>

                  {/* List of service orders */}
                  <div className="overflow-x-auto rounded-xl border border-gray-150 shadow-sm max-h-[55vh]">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50 font-semibold text-gray-700 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left">Código OS</th>
                          <th className="px-4 py-3 text-left">Data</th>
                          <th className="px-4 py-3 text-left">Cliente</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-right">Valor OS</th>
                          <th className="px-4 py-3 text-right">Comissão</th>
                          <th className="px-4 py-3 text-center">Baixa</th>
                          <th className="px-4 py-3 text-center">Comissão</th>
                          <th className="px-4 py-3 text-center">Após baixa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-600 bg-white">
                        {atendimentosModalFiltrados.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                              Nenhuma OS encontrada para os critérios informados.
                            </td>
                          </tr>
                        ) : (
                          atendimentosModalFiltrados.map((atd) => {
                            const colab = selectedColabDetails.colaborador;
                            const overrides = overridesPorColaborador[colab.id] || [];
                            const override = atd.plano_id ? overrides.find(o => o.plano_id === atd.plano_id) : undefined;
                            const indComis = calcComissaoAtd(atd, colab, override);

                            const statusLabel = labelStatusComissaoAtendimento(atd);
                            const contaBaixada = atendimentoContaBaixada(atd);
                            const pagamentoOs = pagamentosComissaoPorOs.get(atd.id);
                            const comissaoPaga = !!pagamentoOs;
                            const relacaoBaixa = labelRelacaoComissaoBaixa({
                              conta_baixada: contaBaixada,
                              comissao_paga: comissaoPaga,
                              comissao_paga_apos_baixa: comissaoPagaAposBaixaConta(
                                atd.baixa_registrada_em,
                                pagamentoOs?.pago_em,
                              ),
                            });

                            return (
                              <tr key={atd.id} className="hover:bg-gray-50/50">
                                <td className="px-4 py-3 font-bold text-gray-900">{atd.codigo}</td>
                                <td className="px-4 py-3">
                                  {new Date(atd.data_servico + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </td>
                                <td className="px-4 py-3 truncate max-w-[150px]" title={atd.cliente_nome}>
                                  {atd.cliente_nome}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${statusLabel.className}`}>
                                    {statusLabel.text}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-medium">{formatCurrency(atd.valor_total_centavos)}</td>
                                <td className="px-4 py-3 text-right font-bold text-teal-600">{formatCurrency(indComis)}</td>
                                <td className="px-4 py-3 text-center">
                                  {contaBaixada ? (
                                    <span
                                      className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded"
                                      title={
                                        atd.baixa_registrada_em
                                          ? `Baixa em ${new Date(atd.baixa_registrada_em).toLocaleString('pt-BR')}`
                                          : 'Recebimento registrado'
                                      }
                                    >
                                      Sim
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-gray-400">Não</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {comissaoPaga ? (
                                    <span
                                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded"
                                      title={
                                        pagamentoOs?.numero_recibo
                                          ? `Recibo ${pagamentoOs.numero_recibo}`
                                          : undefined
                                      }
                                    >
                                      Pago
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span
                                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                      relacaoBaixa === 'Pago após baixa'
                                        ? 'text-teal-700 bg-teal-50 border-teal-200'
                                        : relacaoBaixa === 'Pago antes da baixa'
                                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                                          : relacaoBaixa === 'Aguard. comissão'
                                            ? 'text-gray-600 bg-gray-50 border-gray-200'
                                            : 'text-gray-400 bg-white border-gray-100'
                                    }`}
                                  >
                                    {relacaoBaixa === 'Conta pendente'
                                      ? '—'
                                      : relacaoBaixa === 'Aguard. comissão'
                                        ? 'Aguard.'
                                        : relacaoBaixa === 'Pago após baixa'
                                          ? 'Sim'
                                          : relacaoBaixa === 'Pago antes da baixa'
                                            ? 'Não'
                                            : '—'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right Side: Dashboard Statistics */}
                <div className="space-y-4">
                  {/* Card: Resumo Concluído */}
                  <div className="bg-teal-50/40 p-4 rounded-xl border border-teal-100 space-y-3">
                    <h4 className="text-xs font-bold text-teal-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Confirmado (Aprovada/Concluída)</span>
                      <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs">Qtd. OS</p>
                        <p className="text-base font-bold text-gray-900">{statsModalConcluidos.totalOs}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Comissão</p>
                        <p className="text-base font-extrabold text-teal-700">{formatCurrency(statsModalConcluidos.totalComissao)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Card: Previsão (Pendente) */}
                  <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-100 space-y-3">
                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Previsão (Aguardando)</span>
                      <Clock className="h-4 w-4 text-amber-600" />
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs">Qtd. OS</p>
                        <p className="text-base font-bold text-gray-900">{statsModalPendentes.totalOs}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Comissão</p>
                        <p className="text-base font-extrabold text-amber-700">{formatCurrency(statsModalPendentes.totalComissao)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Efeito no Mês / Projeção Total */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-gray-200 space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Efeito no Mês (Projeção)
                    </h4>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium text-gray-700">
                        <span>Total Geral Projetado</span>
                        <span>{formatCurrency(statsModalConcluidos.totalComissao + statsModalPendentes.totalComissao)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-teal-600 h-2 rounded-full"
                          style={{
                            width: `${
                              statsModalConcluidos.totalComissao + statsModalPendentes.totalComissao > 0
                                ? (statsModalConcluidos.totalComissao /
                                    (statsModalConcluidos.totalComissao + statsModalPendentes.totalComissao)) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 text-right">
                        {statsModalConcluidos.totalComissao + statsModalPendentes.totalComissao > 0
                          ? `${(
                              (statsModalConcluidos.totalComissao /
                                (statsModalConcluidos.totalComissao + statsModalPendentes.totalComissao)) *
                              100
                            ).toFixed(1)}% confirmado`
                          : 'Nenhuma OS registrada'}
                      </p>
                    </div>
                  </div>

                  {/* Plano Distribution Chart ("Gráfico Top") */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3 shadow-sm">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-gray-400" />
                      Comissões por Plano
                    </h4>
                    <div className="space-y-2.5 max-h-48 overflow-y-auto">
                      {comissaoPorPlano.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Sem dados de planos.</p>
                      ) : (
                        comissaoPorPlano.map((pl, idx) => {
                          const maxComis = comissaoPorPlano[0].comissao || 1;
                          const pct = (pl.comissao / maxComis) * 100;
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-semibold text-gray-700 truncate max-w-[150px]" title={pl.nome}>
                                  {pl.nome}
                                </span>
                                <span className="font-bold text-gray-900">{formatCurrency(pl.comissao)}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                  className="bg-indigo-500 h-1.5 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="text-[9px] text-gray-400">
                                {pl.count} OSs • Fat. {formatCurrency(pl.faturamento)}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>

              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-3 px-6 py-4 border-t bg-gray-50 shrink-0 rounded-b-xl">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void handleImprimirRelatorioComissao()}
                  disabled={gerandoRelatorio || linhasComissaoModal.length === 0}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {gerandoRelatorio ? 'Gerando…' : 'Imprimir relatório'}
                </Button>
                {souGestor && (
                  <Button
                    onClick={() => void handleAceitarPagamentoComissao()}
                    disabled={
                      registrandoPagamento ||
                      !!pagamentoPeriodo ||
                      linhasAPagarModal.length === 0 ||
                      totalComissaoAPagarModal <= 0
                    }
                    className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    {registrandoPagamento ? 'Registrando…' : 'Aceitar e pagar comissão'}
                  </Button>
                )}
              </div>
              <Button onClick={() => setSelectedColabDetails(null)} className="bg-teal-600 text-white hover:bg-teal-700">
                Fechar
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Collaborator Commission Modal */}
      {editingColab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-md bg-white">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Configurar Comissão
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Defina a taxa de comissão de {editingColab.nome}
                </p>
              </div>
              <button
                onClick={() => setEditingColab(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-semibold p-1"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveColabCommission} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editColabForm.usarPadrao}
                  onChange={(e) => setEditColabForm(p => ({ ...p, usarPadrao: e.target.checked }))}
                />
                Herdar padrão da empresa
              </label>

              {!editColabForm.usarPadrao && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Percentual sobre Faturamento (%)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editColabForm.percentual}
                    onChange={(e) => setEditColabForm(p => ({ ...p, percentual: e.target.value }))}
                  />
                  <Input
                    label="Valor Fixo por OS (R$)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editColabForm.fixo}
                    onChange={(e) => setEditColabForm(p => ({ ...p, fixo: e.target.value }))}
                  />
                </div>
              )}

              {planos.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-sm font-semibold text-gray-800">Regras por plano (opcional)</p>
                  <p className="text-xs text-gray-500">
                    Sobrescreve % e fixo por OS conforme o plano ativo do cliente na ordem de serviço.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {planos.map((plano) => {
                      const ov = editPlanoOverrides[plano.id] || { percentual: '', fixo: '' };
                      return (
                        <div key={plano.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end border rounded-lg p-2">
                          <div className="text-xs font-medium text-gray-700 md:col-span-1">{plano.nome}</div>
                          <Input
                            label="%"
                            type="number"
                            step="0.01"
                            min="0"
                            value={ov.percentual}
                            onChange={(e) =>
                              setEditPlanoOverrides((prev) => ({
                                ...prev,
                                [plano.id]: { ...ov, percentual: e.target.value },
                              }))
                            }
                          />
                          <Input
                            label="Fixo R$"
                            type="number"
                            step="0.01"
                            min="0"
                            value={ov.fixo}
                            onChange={(e) =>
                              setEditPlanoOverrides((prev) => ({
                                ...prev,
                                [plano.id]: { ...ov, fixo: e.target.value },
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingColab(null)}
                  disabled={savingConfig}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  loading={savingConfig}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Salvar Alterações
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

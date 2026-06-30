import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Wallet, DollarSign, FileText,
  ChevronRight, Calendar, CheckCircle2,
  Info, RefreshCw, User, Search, BarChart3, Printer,
  History, Loader2, Layers,
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
import { Button, Card, Input } from '../../components/ui/Components';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useEmpresaIdsOperacao } from '../../lib/useEmpresaIdsOperacao';
import { useToast } from '../../lib/ToastStore';
import {
  buscarColaboradoresPorIds,
  listarVendedoresParaComissao,
  usuarioEhGestorComissao,
  type ColaboradorResumoDto,
} from '../../lib/comissaoAtendenteService';
import { usuarioTemAlgumRole } from '../../lib/userRoles';
import {
  buscarPagamentoComissaoVendedorPeriodo,
  filtrarPropostasConfirmadasPeriodo,
  filtrarPropostasRealizadasPeriodo,
  listarFaixasComissaoVendedor,
  listarPropostasVendedorComissao,
  listarPropostasVendedorMes,
  registrarPagamentoComissaoVendedor,
  salvarFaixasComissaoVendedor,
  type ComissaoVendedorFaixaDto,
  type PagamentoComissaoVendedorDto,
} from '../../lib/comissaoVendedorService';
import {
  calcularComissaoFaixaVendedor,
  formatarValorFaixa,
  labelFaixa,
  montarFaixaLabelVendedor,
  valorReferenciaPorConfirmacao,
  type PropostaVendedorLinha,
} from '../../lib/comissaoVendedorCalculo';
import {
  gerarReciboPagamentoComissaoVendedor,
  gerarRelatorioComissaoVendedorPdf,
} from '../../lib/comissaoVendedorPdf';
import {
  listarComissaoAuditoria,
  registrarComissaoAuditoria,
  LABEL_ACAO_COMISSAO_AUDITORIA,
  type ComissaoAuditoriaDto,
} from '../../lib/comissaoAuditoriaService';

interface CalculoComissaoVendedor {
  colaborador: ColaboradorResumoDto;
  total_realizados: number;
  total_confirmados: number;
  valor_comissao_centavos: number;
  valor_por_contrato_centavos: number;
  valor_referencia_centavos: number;
  valor_referencia_tipo: 'ativa' | 'proxima' | 'nenhuma';
  faixa_label: string;
  realizados: PropostaVendedorLinha[];
  confirmados: PropostaVendedorLinha[];
  linhas_comissao: Array<PropostaVendedorLinha & { valor_comissao_centavos: number }>;
}

interface HistoricoMensalVendedorItem {
  mes: string;
  mesLabel: string;
  realizados: number;
  confirmados: number;
  comissao_centavos: number;
}

interface FaixaFormRow {
  qtd_min: string;
  qtd_max: string;
  valor: string;
}

const OPCOES_MESES_HISTORICO = [3, 6, 12] as const;

const ultimoDiaMesHistorico = (mesAno: string): string => {
  const [ano, mes] = mesAno.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${mesAno}-${String(ultimo).padStart(2, '0')}`;
};

export const ComissoesVendedores: React.FC = () => {
  const { user } = useAuth();
  const { dataRevisionEmpresa, empresasDoGrupo, visaoTodasEmpresasGrupo } = useEmpresaContextoAtivo();
  const { empresaIdsFiltro, empresaNomePorId } = useEmpresaIdsOperacao();
  const { showToast } = useToast();

  /** Gestor/RH/financeiro vê todos os vendedores; um vendedor comum só vê a própria comissão. */
  const souGestor = usuarioEhGestorComissao(user?.role, user?.roles_extra);

  const [mesFilter, setMesFilter] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });

  const [activeTab, setActiveTab] = useState<'valores' | 'faixas' | 'auditoria'>('valores');
  const [colaboradores, setColaboradores] = useState<ColaboradorResumoDto[]>([]);
  const [linhasPropostas, setLinhasPropostas] = useState<PropostaVendedorLinha[]>([]);
  const [faixas, setFaixas] = useState<ComissaoVendedorFaixaDto[]>([]);
  const [faixasForm, setFaixasForm] = useState<FaixaFormRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [auditoriaRegistros, setAuditoriaRegistros] = useState<ComissaoAuditoriaDto[]>([]);
  const [loadingAuditoria, setLoadingAuditoria] = useState(false);
  const [searchAuditoria, setSearchAuditoria] = useState('');

  const [selectedColabDetails, setSelectedColabDetails] = useState<CalculoComissaoVendedor | null>(null);
  const [modalVisao, setModalVisao] = useState<'confirmadas' | 'realizadas'>('confirmadas');
  const [pagamentoPeriodo, setPagamentoPeriodo] = useState<PagamentoComissaoVendedorDto | null>(null);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [registrandoPagamento, setRegistrandoPagamento] = useState(false);

  const [historicoMensal, setHistoricoMensal] = useState<HistoricoMensalVendedorItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [mesesHistorico, setMesesHistorico] = useState<number>(6);

  const periodoInicio = `${mesFilter}-01`;
  const periodoFim = ultimoDiaMesHistorico(mesFilter);
  const nomeUsuarioAuditoria = user?.nome || user?.email || 'Sistema';

  const loadData = async () => {
    if (empresaIdsFiltro.length === 0) return;
    setLoading(true);
    try {
      const idsGrupo = empresasDoGrupo.map((e) => e.id).filter(Boolean);
      const idsVendedoresConsulta = [...new Set([...idsGrupo, ...empresaIdsFiltro])];
      const mainEmpresaId = empresaIdsFiltro[0];
      const [colabs, linhas, faixasDb] = await Promise.all([
        listarVendedoresParaComissao(idsVendedoresConsulta),
        listarPropostasVendedorMes(empresaIdsFiltro, mesFilter, souGestor ? undefined : user?.id),
        listarFaixasComissaoVendedor(mainEmpresaId),
      ]);

      const sellersBase = colabs.filter(
        (u) => usuarioTemAlgumRole(u.role, u.roles_extra, ['vendedor']) && (souGestor || u.id === user?.id),
      );
      const idsJaIncluidos = new Set(sellersBase.map((u) => u.id));
      const idsDasPropostas = [
        ...new Set(linhas.map((p) => p.vendedor_id).filter((id): id is string => Boolean(id))),
      ].filter((id) => !idsJaIncluidos.has(id));
      const sellersExtras =
        idsDasPropostas.length > 0
          ? (await buscarColaboradoresPorIds(idsDasPropostas, { empresaNomePorId })).filter(
              (u) => usuarioTemAlgumRole(u.role, u.roles_extra, ['vendedor']) && (souGestor || u.id === user?.id),
            )
          : [];
      const sellers = [...sellersBase, ...sellersExtras];
      setColaboradores(sellers);
      setLinhasPropostas(linhas);
      setFaixas(faixasDb);
      setFaixasForm(
        faixasDb.map((f) => ({
          qtd_min: String(f.qtd_min),
          qtd_max: f.qtd_max != null ? String(f.qtd_max) : '',
          valor: (f.valor_centavos / 100).toFixed(2),
        })),
      );
    } catch (err) {
      console.error('[ComissoesVendedores] loadData error:', err);
      showToast('Erro ao carregar dados de comissão de vendas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [empresaIdsFiltro, mesFilter, dataRevisionEmpresa, souGestor, user?.id]);

  // Defesa extra: usuário sem perfil de gestão nunca deve ficar nas abas administrativas.
  useEffect(() => {
    if (!souGestor && activeTab !== 'valores') setActiveTab('valores');
  }, [souGestor, activeTab]);

  const carregarAuditoria = useCallback(async () => {
    if (empresaIdsFiltro.length === 0) return;
    setLoadingAuditoria(true);
    try {
      const registros = await listarComissaoAuditoria(empresaIdsFiltro, {
        dataInicio: periodoInicio,
        dataFim: periodoFim,
        limite: 300,
      });
      setAuditoriaRegistros(
        registros.filter((r) =>
          ['vendedor_faixa', 'vendedor_pagamento', 'vendedor_relatorio'].includes(r.acao),
        ),
      );
    } finally {
      setLoadingAuditoria(false);
    }
  }, [empresaIdsFiltro, periodoInicio, periodoFim]);

  useEffect(() => {
    if (activeTab === 'auditoria' && souGestor) void carregarAuditoria();
  }, [activeTab, souGestor, carregarAuditoria, dataRevisionEmpresa]);

  const auditoriaFiltrada = useMemo(() => {
    const q = searchAuditoria.trim().toLowerCase();
    if (!q) return auditoriaRegistros;
    return auditoriaRegistros.filter((r) =>
      [r.descricao, r.usuario_nome, r.colaborador_nome, LABEL_ACAO_COMISSAO_AUDITORIA[r.acao]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [auditoriaRegistros, searchAuditoria]);

  const formatarDataHoraAuditoria = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const handleSaveFaixas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (empresaIdsFiltro.length === 0) return;

    const faixasAntes = [...faixas];
    const parsed: Omit<ComissaoVendedorFaixaDto, 'id' | 'empresa_id'>[] = [];
    for (let i = 0; i < faixasForm.length; i++) {
      const row = faixasForm[i];
      const qtdMin = parseInt(row.qtd_min, 10);
      const qtdMax = row.qtd_max.trim() ? parseInt(row.qtd_max, 10) : null;
      const valor = Math.round(parseFloat(row.valor.replace(',', '.')) * 100);
      if (!Number.isFinite(qtdMin) || qtdMin < 1) {
        showToast(`Faixa ${i + 1}: quantidade mínima inválida.`, 'error');
        return;
      }
      if (qtdMax != null && (!Number.isFinite(qtdMax) || qtdMax < qtdMin)) {
        showToast(`Faixa ${i + 1}: quantidade máxima inválida.`, 'error');
        return;
      }
      if (!Number.isFinite(valor) || valor < 0) {
        showToast(`Faixa ${i + 1}: valor inválido.`, 'error');
        return;
      }
      parsed.push({ qtd_min: qtdMin, qtd_max: qtdMax, valor_centavos: valor, ordem: i + 1 });
    }

    setSavingConfig(true);
    try {
      const mainEmpresaId = empresaIdsFiltro[0];
      const ok = await salvarFaixasComissaoVendedor(mainEmpresaId, parsed);
      if (!ok) {
        showToast('Falha ao salvar faixas.', 'warning');
        return;
      }
      await registrarComissaoAuditoria({
        empresaId: mainEmpresaId,
        acao: 'vendedor_faixa',
        usuarioId: user?.id,
        usuarioNome: nomeUsuarioAuditoria,
        valorAnterior: faixasAntes.map((f) => `${labelFaixa(f)} = ${formatarValorFaixa(f.valor_centavos)}`).join('; '),
        valorNovo: parsed
          .map((f) => `${f.qtd_min}-${f.qtd_max ?? '∞'} = ${formatarValorFaixa(f.valor_centavos)}`)
          .join('; '),
        descricao: 'Atualizou as faixas de comissão por volume de contratos confirmados.',
      });
      showToast('Faixas de comissão salvas!', 'success');
      await loadData();
      setActiveTab('valores');
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar faixas.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const faixasOrdenadas = useMemo(
    () => [...faixas].sort((a, b) => a.ordem - b.ordem || a.qtd_min - b.qtd_min),
    [faixas],
  );

  const formatarValorReferencia = (item: CalculoComissaoVendedor) => {
    if (item.valor_referencia_tipo === 'ativa') {
      return formatCurrency(item.valor_referencia_centavos);
    }
    if (item.valor_referencia_tipo === 'proxima') {
      return `${formatCurrency(item.valor_referencia_centavos)}*`;
    }
    return '—';
  };

  const calculos = useMemo(() => {
    return colaboradores.map((colab) => {
      const doVendedor = linhasPropostas.filter((p) => p.vendedor_id === colab.id);
      const realizados = filtrarPropostasRealizadasPeriodo(doVendedor, periodoInicio, periodoFim);
      const confirmados = filtrarPropostasConfirmadasPeriodo(doVendedor, periodoInicio, periodoFim);
      const calc = calcularComissaoFaixaVendedor(confirmados, faixas);
      const refValor = valorReferenciaPorConfirmacao(calc.qtd_confirmada, faixas, calc.faixa);
      const faixaLabel = montarFaixaLabelVendedor(
        calc.qtd_confirmada,
        calc.faixa,
        faixas,
        calc.valor_por_contrato_centavos,
      );

      return {
        colaborador: colab,
        total_realizados: realizados.length,
        total_confirmados: confirmados.length,
        valor_comissao_centavos: calc.valor_total_centavos,
        valor_por_contrato_centavos: calc.valor_por_contrato_centavos,
        valor_referencia_centavos: refValor.centavos,
        valor_referencia_tipo: refValor.tipo,
        faixa_label: faixaLabel,
        realizados,
        confirmados,
        linhas_comissao: calc.linhas,
      } satisfies CalculoComissaoVendedor;
    });
  }, [colaboradores, linhasPropostas, faixas, periodoInicio, periodoFim]);

  const calculosFiltrados = useMemo(() => {
    if (!souGestor) {
      return calculos.filter((item) => item.colaborador.id === user?.id);
    }
    const isTodas = visaoTodasEmpresasGrupo || empresaIdsFiltro.length > 1;
    const idsUnidade = new Set(empresaIdsFiltro.map((id) => id.trim()).filter(Boolean));
    return calculos.filter((item) => {
      if (isTodas) return true;
      const pertenceUnidade = item.colaborador.empresa_id
        ? idsUnidade.has(item.colaborador.empresa_id)
        : false;
      return pertenceUnidade || item.total_realizados > 0 || item.total_confirmados > 0;
    });
  }, [calculos, visaoTodasEmpresasGrupo, empresaIdsFiltro, souGestor, user?.id]);

  const stats = useMemo(() => {
    const realizados = calculosFiltrados.reduce((s, c) => s + c.total_realizados, 0);
    const confirmados = calculosFiltrados.reduce((s, c) => s + c.total_confirmados, 0);
    const totalComissao = calculosFiltrados.reduce((s, c) => s + c.valor_comissao_centavos, 0);
    return { realizados, confirmados, totalComissao };
  }, [calculosFiltrados]);

  const empresaNomeRelatorio = useMemo(
    () => empresasDoGrupo.find((e) => e.id === empresaIdsFiltro[0])?.nome || '',
    [empresasDoGrupo, empresaIdsFiltro],
  );

  const formatCurrency = (centavos: number) =>
    `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const formatarPeriodo = (inicio: string, fim: string) =>
    `${new Date(inicio + 'T12:00:00').toLocaleDateString('pt-BR')} — ${new Date(fim + 'T12:00:00').toLocaleDateString('pt-BR')}`;

  const carregarHistoricoMensal = useCallback(
    async (colab: ColaboradorResumoDto) => {
      setLoadingHistorico(true);
      setHistoricoMensal([]);
      try {
        const hoje = new Date();
        const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - (mesesHistorico - 1), 1);
        const dataInicioJanela = `${inicioJanela.getFullYear()}-${String(inicioJanela.getMonth() + 1).padStart(2, '0')}-01`;
        const dataFimJanela = ultimoDiaMesHistorico(
          `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`,
        );

        const props = await listarPropostasVendedorComissao(
          empresaIdsFiltro,
          dataInicioJanela,
          dataFimJanela,
          colab.id,
        );

        const buckets = new Map<string, { realizados: number; confirmados: number; comissao: number }>();
        for (let i = 0; i < mesesHistorico; i++) {
          const d = new Date(hoje.getFullYear(), hoje.getMonth() - (mesesHistorico - 1 - i), 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          buckets.set(key, { realizados: 0, confirmados: 0, comissao: 0 });
        }

        buckets.forEach((_, mesKey) => {
          const inicio = `${mesKey}-01`;
          const fim = ultimoDiaMesHistorico(mesKey);
          const realizados = filtrarPropostasRealizadasPeriodo(props, inicio, fim);
          const confirmados = filtrarPropostasConfirmadasPeriodo(props, inicio, fim);
          const calc = calcularComissaoFaixaVendedor(confirmados, faixas);
          buckets.set(mesKey, {
            realizados: realizados.length,
            confirmados: confirmados.length,
            comissao: calc.valor_total_centavos,
          });
        });

        const resultado: HistoricoMensalVendedorItem[] = Array.from(buckets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([mes, v]) => {
            const [ano, m] = mes.split('-').map(Number);
            const labelBruto = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', {
              month: 'short',
              year: '2-digit',
            });
            const mesLabel = labelBruto.charAt(0).toUpperCase() + labelBruto.slice(1).replace('.', '');
            return {
              mes,
              mesLabel,
              realizados: v.realizados,
              confirmados: v.confirmados,
              comissao_centavos: v.comissao,
            };
          });

        setHistoricoMensal(resultado);
      } catch (err) {
        console.error('[ComissoesVendedores] carregarHistoricoMensal error:', err);
        setHistoricoMensal([]);
      } finally {
        setLoadingHistorico(false);
      }
    },
    [empresaIdsFiltro, faixas, mesesHistorico],
  );

  const linhasModal = useMemo(() => {
    if (!selectedColabDetails) return [];
    if (modalVisao === 'realizadas') return selectedColabDetails.realizados;
    const unit = selectedColabDetails.valor_por_contrato_centavos;
    return selectedColabDetails.confirmados.map((p) => ({
      ...p,
      valor_comissao_centavos: unit,
    }));
  }, [selectedColabDetails, modalVisao]);

  const linhasAPagarModal = useMemo(() => {
    if (!selectedColabDetails) return [];
    return selectedColabDetails.linhas_comissao.filter(
      (l) => l.valor_comissao_centavos > 0 && !l.ja_pago_comissao,
    );
  }, [selectedColabDetails]);

  const handleImprimirRelatorio = async (tipo: 'confirmadas' | 'realizadas') => {
    if (!selectedColabDetails) return;
    setGerandoRelatorio(true);
    try {
      const linhas =
        tipo === 'confirmadas' ? selectedColabDetails.confirmados : selectedColabDetails.realizados;
      const linhasComissaoPdf =
        tipo === 'confirmadas'
          ? selectedColabDetails.confirmados.map((p) => ({
              ...p,
              valor_comissao_centavos: selectedColabDetails.valor_por_contrato_centavos,
            }))
          : selectedColabDetails.linhas_comissao;
      await gerarRelatorioComissaoVendedorPdf({
        vendedorNome: selectedColabDetails.colaborador.nome,
        periodoInicio,
        periodoFim,
        empresaNome: empresaNomeRelatorio,
        tipoRelatorio: tipo,
        linhas,
        linhasComissao: linhasComissaoPdf,
        faixaLabel: selectedColabDetails.faixa_label,
        valorPorContratoCentavos:
          selectedColabDetails.valor_por_contrato_centavos ||
          selectedColabDetails.valor_referencia_centavos,
        pagamento: pagamentoPeriodo,
      });
      if (empresaIdsFiltro[0]) {
        await registrarComissaoAuditoria({
          empresaId: empresaIdsFiltro[0],
          acao: 'vendedor_relatorio',
          usuarioId: user?.id,
          usuarioNome: nomeUsuarioAuditoria,
          colaboradorId: selectedColabDetails.colaborador.id,
          colaboradorNome: selectedColabDetails.colaborador.nome,
          descricao: `Gerou relatório de ${tipo === 'confirmadas' ? 'contratos confirmados' : 'contratos realizados'} — ${selectedColabDetails.colaborador.nome} (${formatarPeriodo(periodoInicio, periodoFim)}).`,
          metadata: { tipo, periodo_inicio: periodoInicio, periodo_fim: periodoFim },
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

  const handleAceitarPagamento = async () => {
    if (!selectedColabDetails || !user?.id || empresaIdsFiltro.length === 0) return;
    if (pagamentoPeriodo) {
      showToast(`Comissão já paga (recibo ${pagamentoPeriodo.numero_recibo}).`, 'warning');
      return;
    }
    if (linhasAPagarModal.length === 0 || selectedColabDetails.valor_comissao_centavos <= 0) {
      showToast('Não há comissão com baixa da 1ª parcela pendente neste período.', 'warning');
      return;
    }

    const colab = selectedColabDetails.colaborador;
    const total = selectedColabDetails.valor_comissao_centavos;
    const msg = `Confirmar pagamento de ${formatCurrency(total)} referente a ${linhasAPagarModal.length} contrato(s) com baixa da 1ª parcela de ${colab.nome}?`;
    if (!window.confirm(msg)) return;

    setRegistrandoPagamento(true);
    try {
      const resultado = await registrarPagamentoComissaoVendedor({
        empresaId: empresaIdsFiltro[0],
        vendedorId: colab.id,
        vendedorNome: colab.nome,
        periodoInicio,
        periodoFim,
        linhas: linhasAPagarModal,
        totalContratosRealizados: selectedColabDetails.total_realizados,
        faixaLabel: selectedColabDetails.faixa_label,
        valorPorContratoCentavos: selectedColabDetails.valor_por_contrato_centavos,
        pagoPorId: user.id,
        pagoPorNome: user.nome || user.email || 'Sistema',
      });

      if (resultado.ok === false) {
        showToast(resultado.error, 'error');
        return;
      }

      setPagamentoPeriodo(resultado.pagamento);
      await gerarReciboPagamentoComissaoVendedor({
        pagamento: resultado.pagamento,
        vendedorNome: colab.nome,
        empresaId: empresaIdsFiltro[0],
        empresaNome: empresaNomeRelatorio,
        pagoPorNome: user.nome || user.email || 'Sistema',
      });

      await registrarComissaoAuditoria({
        empresaId: empresaIdsFiltro[0],
        acao: 'vendedor_pagamento',
        usuarioId: user.id,
        usuarioNome: nomeUsuarioAuditoria,
        colaboradorId: colab.id,
        colaboradorNome: colab.nome,
        entidadeTipo: 'pagamento',
        entidadeId: resultado.pagamento.id,
        valorNovo: formatCurrency(resultado.pagamento.valor_comissao_centavos),
        descricao: `Registrou pagamento de comissão — recibo ${resultado.pagamento.numero_recibo} (${linhasAPagarModal.length} contratos, ${formatarPeriodo(periodoInicio, periodoFim)}).`,
        metadata: {
          numero_recibo: resultado.pagamento.numero_recibo,
          total_confirmados: resultado.pagamento.total_confirmados,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
        },
      });

      showToast(`Pagamento registrado — recibo ${resultado.pagamento.numero_recibo}.`, 'success');
      await loadData();
    } catch (e) {
      console.error(e);
      showToast('Erro ao registrar pagamento.', 'error');
    } finally {
      setRegistrandoPagamento(false);
    }
  };

  const abrirDetalhesColab = useCallback(
    async (item: CalculoComissaoVendedor) => {
      setSelectedColabDetails(item);
      setModalVisao('confirmadas');
      setPagamentoPeriodo(null);
      void carregarHistoricoMensal(item.colaborador);

      if (empresaIdsFiltro.length > 0 && souGestor) {
        const pag = await buscarPagamentoComissaoVendedorPeriodo(
          empresaIdsFiltro[0],
          item.colaborador.id,
          periodoInicio,
          periodoFim,
        );
        setPagamentoPeriodo(pag);
      }
    },
    [carregarHistoricoMensal, empresaIdsFiltro, periodoInicio, periodoFim, souGestor],
  );

  useEffect(() => {
    if (selectedColabDetails) {
      void carregarHistoricoMensal(selectedColabDetails.colaborador);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesesHistorico]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title={souGestor ? 'Comissões de Vendas' : 'Minhas Comissões de Vendas'}
        subtitle={
          souGestor
            ? 'Comissão por contratos confirmados (baixa da 1ª parcela no financeiro) com faixas por volume mensal'
            : 'Seus contratos realizados, confirmados e comissão no período'
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
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
          onClick={() => setActiveTab('valores')}
        >
          <DollarSign className="h-4 w-4" />
          Demonstrativo de Vendas
        </button>
        {souGestor && (
          <>
            <button
              className={`py-2.5 px-5 font-semibold text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'faixas'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('faixas')}
            >
              <Layers className="h-4 w-4" />
              Faixas de Comissão
            </button>
            <button
              className={`py-2.5 px-5 font-semibold text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'auditoria'
                  ? 'bg-amber-600 text-white shadow-sm'
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
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contratos Realizados</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.realizados}</p>
              <p className="text-xs text-gray-500 mt-0.5">Propostas com contrato gerado no mês</p>
            </div>
          </Card>

          <Card className="p-5 flex items-center gap-4 bg-emerald-50/50 border-emerald-100">
            <div className="p-3 bg-emerald-100/80 rounded-xl text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contratos Confirmados</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.confirmados}</p>
              <p className="text-xs text-gray-500 mt-0.5">Baixa da 1ª parcela no financeiro no período (base da comissão)</p>
            </div>
          </Card>

          <Card className="p-5 flex items-center gap-4 bg-amber-50/50 border-amber-100">
            <div className="p-3 bg-amber-100/80 rounded-xl text-amber-700">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de Comissões</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatCurrency(stats.totalComissao)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Sobre confirmados, conforme faixa do mês</p>
            </div>
          </Card>
        </div>
      )}

      {/* Month Filter Bar */}
      {activeTab === 'valores' && (
        <Card className="p-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Período de Referência:</span>
            <input
              type="month"
              value={mesFilter}
              onChange={(e) => setMesFilter(e.target.value)}
              className="rounded-lg border-gray-200 text-sm focus:border-teal-500 focus:ring-teal-500"
            />
          </div>
          <p className="text-xs text-gray-400 max-w-xl">
            Confirmação = baixa registrada no financeiro da 1ª parcela (contrato já gerado). Marcar “recebeu no ato” na proposta não conta.
            A faixa e o valor por confirmação vêm da configuração (aba Faixas). Mínimo 10 confirmados no mês para gerar comissão.
          </p>
        </Card>
      )}

      {activeTab === 'valores' && faixasOrdenadas.length > 0 && (
        <Card className="p-4 border-amber-100 bg-amber-50/30">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-700" />
              <span className="text-sm font-bold text-gray-800">Valores por confirmação (configuração)</span>
            </div>
            {souGestor && (
              <button
                type="button"
                onClick={() => setActiveTab('faixas')}
                className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
              >
                Editar faixas
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {faixasOrdenadas.map((f) => (
              <div
                key={f.id || `${f.qtd_min}-${f.qtd_max}`}
                className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-center"
              >
                <p className="text-[11px] text-gray-500 font-medium">
                  {f.qtd_max != null ? `${f.qtd_min}–${f.qtd_max}` : `${f.qtd_min}+`} confirmados
                </p>
                <p className="text-sm font-bold text-amber-800 mt-0.5">
                  {formatarValorFaixa(f.valor_centavos)}
                  <span className="text-[10px] font-normal text-gray-500"> / conf.</span>
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main Tab Panels */}
      {activeTab === 'valores' ? (
        <Card className="overflow-hidden border border-gray-150">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold text-gray-800">Demonstrativo de Vendas</h3>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-8 w-8 text-amber-600 animate-spin" />
              <span>Calculando comissões de vendas...</span>
            </div>
          ) : calculosFiltrados.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              Nenhum colaborador com cargo "Vendedor" encontrado no sistema para as empresas selecionadas.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {calculosFiltrados.map((item) => (
                <div key={item.colaborador.id} className="p-6 flex flex-wrap items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-amber-100/50 rounded-full flex items-center justify-center text-amber-700 font-bold text-base">
                      {item.colaborador.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{item.colaborador.nome}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <User className="h-3 w-3" />
                        Vendedor comercial · {item.colaborador.email}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 sm:gap-6">
                    <div className="text-center sm:text-left">
                      <p className="text-xs text-gray-500">Realizados</p>
                      <p className="text-base font-bold text-gray-900 mt-0.5">{item.total_realizados}</p>
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-xs text-gray-500">Confirmados</p>
                      <p className="text-base font-bold text-emerald-700 mt-0.5">{item.total_confirmados}</p>
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-xs text-gray-500">R$ / confirmação</p>
                      <p className="text-base font-bold text-amber-800 mt-0.5">{formatarValorReferencia(item)}</p>
                      {item.valor_referencia_tipo === 'proxima' && (
                        <p className="text-[10px] text-gray-400">após atingir a faixa</p>
                      )}
                    </div>
                    <div className="text-center sm:text-left sm:col-span-2">
                      <p className="text-xs text-gray-500">Faixa do mês</p>
                      <p className="text-xs font-semibold text-amber-800 mt-0.5 leading-snug">{item.faixa_label}</p>
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-xs text-gray-500">Comissão a pagar</p>
                      <p className="text-base font-extrabold text-amber-700 mt-0.5">{formatCurrency(item.valor_comissao_centavos)}</p>
                    </div>
                    <div className="flex items-center justify-center sm:justify-end col-span-2 sm:col-span-1">
                      <button
                        onClick={() => abrirDetalhesColab(item)}
                        className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline cursor-pointer"
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
      ) : activeTab === 'faixas' ? (
        <div className="max-w-3xl mx-auto">
          <Card className="p-6">
            <div className="flex items-center gap-3 border-b pb-3 mb-6">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Faixas por volume de confirmados</h3>
                <p className="text-xs text-gray-500">
                  Valor fixo por contrato confirmado, conforme a quantidade total de confirmados no mês
                </p>
              </div>
            </div>

            <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-900 flex gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Ex.: 50 contratos realizados e 25 com baixa da 1ª parcela → comissão sobre os 25. Confirmação exige baixa no sistema financeiro.
                Abaixo de 10 confirmados no mês, não há faixa (comissão R$ 0).
              </p>
            </div>

            <form onSubmit={handleSaveFaixas} className="space-y-4">
              {faixasForm.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border rounded-xl p-4 bg-gray-50/40">
                  <Input
                    label="Qtd. mínima"
                    type="number"
                    min="1"
                    value={row.qtd_min}
                    onChange={(e) => {
                      const next = [...faixasForm];
                      next[idx] = { ...next[idx], qtd_min: e.target.value };
                      setFaixasForm(next);
                    }}
                  />
                  <Input
                    label="Qtd. máxima (vazio = acima)"
                    type="number"
                    min="1"
                    value={row.qtd_max}
                    onChange={(e) => {
                      const next = [...faixasForm];
                      next[idx] = { ...next[idx], qtd_max: e.target.value };
                      setFaixasForm(next);
                    }}
                  />
                  <Input
                    label="Valor por contrato (R$)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.valor}
                    onChange={(e) => {
                      const next = [...faixasForm];
                      next[idx] = { ...next[idx], valor: e.target.value };
                      setFaixasForm(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="text-red-600 border-red-200"
                    onClick={() => setFaixasForm(faixasForm.filter((_, i) => i !== idx))}
                    disabled={faixasForm.length <= 1}
                  >
                    Remover
                  </Button>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setFaixasForm([...faixasForm, { qtd_min: '', qtd_max: '', valor: '' }])
                }
              >
                Adicionar faixa
              </Button>

              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab('valores')} disabled={savingConfig}>
                  Cancelar
                </Button>
                <Button type="submit" loading={savingConfig} className="bg-amber-600 hover:bg-amber-700 text-white">
                  Salvar faixas
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : (
        <Card className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Auditoria — Comissões de Vendedores</h3>
              <p className="text-xs text-gray-500">
                Histórico de alterações em faixas, pagamentos e relatórios ({formatarPeriodo(periodoInicio, periodoFim)})
              </p>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar na auditoria..."
                value={searchAuditoria}
                onChange={(e) => setSearchAuditoria(e.target.value)}
                className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 w-48 md:w-64"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            </div>
          </div>

          {loadingAuditoria ? (
            <div className="py-16 text-center text-gray-400 flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              Carregando auditoria...
            </div>
          ) : auditoriaFiltrada.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum registro neste período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {auditoriaFiltrada.map((reg) => (
                <div key={reg.id} className="border rounded-xl p-4 bg-white hover:bg-gray-50/50">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {LABEL_ACAO_COMISSAO_AUDITORIA[reg.acao] || reg.acao}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatarDataHoraAuditoria(reg.created_at)}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-600">{reg.usuario_nome || 'Sistema'}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-2">{reg.descricao}</p>
                  {reg.colaborador_nome && (
                    <p className="text-xs text-amber-700 mt-1">Vendedor: {reg.colaborador_nome}</p>
                  )}
                  {(reg.valor_anterior || reg.valor_novo) && (
                    <div className="mt-2 text-xs text-gray-600 space-y-1">
                      {reg.valor_anterior && <p>Antes: {reg.valor_anterior}</p>}
                      {reg.valor_novo && <p>Depois: {reg.valor_novo}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {selectedColabDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-white">
            <div className="flex justify-between items-start px-6 py-4 border-b border-gray-100 shrink-0 gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {selectedColabDetails.colaborador.nome}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatarPeriodo(periodoInicio, periodoFim)} · {selectedColabDetails.faixa_label}
                </p>
                {pagamentoPeriodo && (
                  <p className="text-xs text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Pago — recibo {pagamentoPeriodo.numero_recibo}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedColabDetails(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-semibold p-1"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-gray-400" />
                    Evolução — últimos {mesesHistorico} meses
                  </h4>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {OPCOES_MESES_HISTORICO.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setMesesHistorico(opt)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          mesesHistorico === opt
                            ? 'bg-amber-600 text-white shadow-sm'
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
                    <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
                    <span className="text-xs">Carregando histórico...</span>
                  </div>
                ) : historicoMensal.every((h) => h.realizados === 0 && h.confirmados === 0) ? (
                  <div className="h-56 flex items-center justify-center text-xs text-gray-400 italic">
                    Sem movimentação nos últimos {mesesHistorico} meses.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={historicoMensal} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.20)" vertical={false} />
                      <XAxis dataKey="mesLabel" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} />
                      <YAxis yAxisId="qtd" tick={{ fill: '#475569', fontSize: 11 }} width={36} allowDecimals={false} />
                      <YAxis
                        yAxisId="comissao"
                        orientation="right"
                        tick={{ fill: '#475569', fontSize: 11 }}
                        width={64}
                        tickFormatter={(v) => `R$ ${(Number(v) / 100).toFixed(0)}`}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'Comissão') return [formatCurrency(Number(value)), name];
                          return [String(value), name];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar yAxisId="qtd" dataKey="realizados" name="Realizados" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="qtd" dataKey="confirmados" name="Confirmados" fill="#059669" radius={[4, 4, 0, 0]} />
                      <Line
                        yAxisId="comissao"
                        type="monotone"
                        dataKey="comissao_centavos"
                        name="Comissão"
                        stroke="#d97706"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-amber-50/40 p-4 rounded-xl border border-amber-100">
                <div>
                  <p className="text-xs text-amber-800 font-semibold uppercase">Realizados</p>
                  <p className="text-xl font-bold text-gray-900">{selectedColabDetails.total_realizados}</p>
                </div>
                <div>
                  <p className="text-xs text-amber-800 font-semibold uppercase">Confirmados</p>
                  <p className="text-xl font-bold text-emerald-700">{selectedColabDetails.total_confirmados}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-amber-800 font-semibold uppercase">Comissão a pagar</p>
                  <p className="text-xl font-bold text-amber-700">
                    {formatCurrency(selectedColabDetails.valor_comissao_centavos)}
                  </p>
                  {selectedColabDetails.valor_por_contrato_centavos > 0 ? (
                    <p className="text-xs text-gray-500 mt-1">
                      {formatCurrency(selectedColabDetails.valor_por_contrato_centavos)} por confirmação (faixa ativa)
                    </p>
                  ) : selectedColabDetails.valor_referencia_tipo === 'proxima' ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Referência config.: {formatCurrency(selectedColabDetails.valor_referencia_centavos)}/confirmação
                      (só após atingir a 1ª faixa)
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setModalVisao('confirmadas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    modalVisao === 'confirmadas'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Confirmados ({selectedColabDetails.total_confirmados})
                </button>
                <button
                  type="button"
                  onClick={() => setModalVisao('realizadas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    modalVisao === 'realizadas'
                      ? 'bg-slate-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Realizados ({selectedColabDetails.total_realizados})
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 font-semibold text-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left">Proposta</th>
                      <th className="px-4 py-3 text-left">Titular</th>
                      <th className="px-4 py-3 text-left">Plano</th>
                      <th className="px-4 py-3 text-left">1ª parcela</th>
                      <th className="px-4 py-3 text-left">Comissão paga</th>
                      <th className="px-4 py-3 text-left">Data conf.</th>
                      {modalVisao === 'confirmadas' && (
                        <th className="px-4 py-3 text-right">R$ / conf.</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-600">
                    {linhasModal.length === 0 ? (
                      <tr>
                        <td colSpan={modalVisao === 'confirmadas' ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
                          Nenhum contrato nesta visão.
                        </td>
                      </tr>
                    ) : (
                      linhasModal.map((p) => {
                        const comissaoLinha =
                          modalVisao === 'confirmadas' && 'valor_comissao_centavos' in p
                            ? (p as PropostaVendedorLinha & { valor_comissao_centavos: number }).valor_comissao_centavos
                            : 0;
                        return (
                          <tr key={p.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 font-bold">#{String(p.sequencial).padStart(4, '0')}</td>
                            <td className="px-4 py-3 truncate max-w-[140px]" title={p.contribuinte_nome}>
                              {p.contribuinte_nome}
                            </td>
                            <td className="px-4 py-3">{p.plano_nome || '—'}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  p.confirmada
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {p.confirmada ? 'Quitada' : 'Pendente'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  p.ja_pago_comissao
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                {p.ja_pago_comissao ? 'Sim' : 'Não'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {p.data_confirmacao
                                ? new Date(p.data_confirmacao + 'T12:00:00').toLocaleDateString('pt-BR')
                                : '—'}
                            </td>
                            {modalVisao === 'confirmadas' && (
                              <td className="px-4 py-3 text-right font-bold text-amber-600">
                                {comissaoLinha > 0
                                  ? formatCurrency(comissaoLinha)
                                  : selectedColabDetails.valor_referencia_tipo === 'proxima'
                                    ? `${formatCurrency(selectedColabDetails.valor_referencia_centavos)}*`
                                    : '—'}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-3 px-6 py-4 border-t bg-gray-50 shrink-0 rounded-b-xl">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void handleImprimirRelatorio('realizadas')}
                  loading={gerandoRelatorio}
                  className="gap-1.5"
                >
                  <Printer className="h-4 w-4" />
                  Rel. realizados
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleImprimirRelatorio('confirmadas')}
                  loading={gerandoRelatorio}
                  className="gap-1.5"
                >
                  <Printer className="h-4 w-4" />
                  Rel. confirmados
                </Button>
              </div>
              <div className="flex gap-2">
                {souGestor && !pagamentoPeriodo && selectedColabDetails.valor_comissao_centavos > 0 && (
                  <Button
                    onClick={() => void handleAceitarPagamento()}
                    loading={registrandoPagamento}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    <Wallet className="h-4 w-4" />
                    Registrar pagamento
                  </Button>
                )}
                <Button onClick={() => setSelectedColabDetails(null)} className="bg-amber-600 text-white hover:bg-amber-700">
                  Fechar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

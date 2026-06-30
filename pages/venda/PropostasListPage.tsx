import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, FileSignature, Loader2, MessageCircle, Plus, Printer, Search, Send, Trash2, ChevronLeft, ChevronRight, User, CalendarClock, TrendingUp, FileText, XCircle, Ban, Phone, AlertTriangle, UserCheck, RotateCcw, Headphones, Eye, X, Calendar, CreditCard, MapPin, Users, Filter } from 'lucide-react';
import {
  obterUrlWhatsapp,
  resolverTelefoneWhatsapp,
  validarWhatsapp,
} from '../../lib/whatsappValidacao';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Textarea } from '../../components/ui/Components';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastStore';
import {
  useEmpresaIdsOperacao,
  filtrarQueryPorEmpresaIds,
  resolveEmpresaIdsConsultaComFilial,
} from '../../lib/useEmpresaIdsOperacao';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useFilial } from '../../lib/FilialContext';
import { useUnidadeOperacionalFiltro } from '../../lib/useUnidadeOperacionalFiltro';
import {
  labelStatusProposta,
  PROPOSTA_STATUS_META,
  propostaStatusEncerrado,
  rotuloPosVendaLista,
} from '../../lib/propostaStatusLabels';
import {
  normalizarStatusProposta,
  PROPOSTA_STATUS,
  propostaAguardandoContrato,
  propostaContratoGerado,
  propostaEhRascunho,
  propostaEmAberto,
  propostaEmPosVenda,
  propostaPodeEditar,
  propostaPodeGerarContrato,
} from '../../lib/propostaStatus';
import {
  assumirPosVendaProposta,
  formatarTempoPosVenda,
  isModoFilaPosVenda,
  liberarPosVendaProposta,
  minutosEmPosVenda,
  propostaPodeAssumirPosVenda,
  propostaPodeLiberarPosVenda,
} from '../../lib/propostaPosVenda';
import { resolverDadosVendedorPropostaPdf } from '../../lib/propostaVendedorPdf';
import {
  buildPropostaPdfBlob,
  downloadPropostaPdf,
  openWhatsAppComMensagem,
  printPropostaPdf,
} from '../../lib/PropostaDocumentoService';
import { enderecoResidenciaCompletoFromRow } from '../../lib/propostaEndereco';
import { reservarJanelaImpressaoPdf } from '../../lib/printPdfBlob';
import {
  usuarioPodeConfirmarProposta,
  usuarioPodeGerarContratoProposta,
  usuarioPodeVerTodasPropostasVenda,
} from '../../lib/propostasVisibilidade';
import { gerarContratoDesdeProposta } from '../../lib/propostaGerarContratoService';
import {
  ContratoGeradoSucessoModal,
  type ContratoGeradoSucessoInfo,
} from '../../components/venda/ContratoGeradoSucessoModal';
import { PropostaConfirmacaoBadge } from '../../components/venda/PropostaConfirmacaoBadge';
import { mapaConfirmacaoFinanceiroPropostas } from '../../lib/comissaoVendedorService';
import {
  calcularLinhaTempoProposta,
  classeDestaqueDiasPendencia,
  diasPendenciaProposta,
  diasTotalProposta,
  formatarDataProposta,
  isModoFilaContrato,
  resumoDiasFilaContrato,
} from '../../lib/propostaDiasPendente';

export interface PropostaVendaRow {
  id: string;
  empresa_id: string;
  sequencial: number;
  status: string;
  contribuinte_nome: string;
  contribuinte_documento: string;
  contribuinte_rg?: string | null;
  contribuinte_data_nascimento?: string | null;
  contribuinte_estado_civil?: string | null;
  contribuinte_naturalidade_uf?: string | null;
  contribuinte_naturalidade_cidade?: string | null;
  contribuinte_profissao?: string | null;
  contribuinte_religiao?: string | null;
  telefone_principal?: string | null;
  telefone_alternativo?: string | null;
  email?: string | null;
  plano_id: string | null;
  taxa_adesao_recebida_centavos: number | null;
  primeira_parcela_paga_no_ato?: boolean | null;
  parcelas_recebidas_quantidade?: number | null;
  parcelas_recebidas_total_centavos?: number | null;
  metodo_cobranca?: string | null;
  cobrador_endereco_mesmo_residencial?: boolean | null;
  cobrador_endereco_entrega?: string | null;
  cobrador_endereco_cep?: string | null;
  cobrador_endereco_cidade?: string | null;
  cobrador_endereco_uf?: string | null;
  whatsapp_unidade?: string | null;
  dependentes_inclusos?: number | null;
  dependentes_detalhes?: Array<{
    nome?: string;
    cpf?: string;
    data_nascimento?: string;
    parentesco?: string;
  }> | null;
  primeiro_vencimento: string;
  data_pedido: string;
  created_at: string;
  updated_at?: string | null;
  liberada_em?: string | null;
  contrato_gerado_em?: string | null;
  planos?: { nome?: string } | null;
  empresas?: { nome?: string } | null;
  users?: { nome?: string } | null;
  observacoes?: string | null;
  endereco_residencia?: string | null;
  endereco_cep?: string | null;
  endereco_cidade?: string | null;
  endereco_uf?: string | null;
  vendedor_id?: string | null;
  assinatura_id?: string | null;
  cliente_id?: string | null;
  confirmada_financeiro?: boolean;
  data_confirmacao_financeiro?: string | null;
  cadastro_existente_alerta?: boolean | null;
  cadastro_existente_alertas?: string[] | null;
  pos_venda_responsavel_id?: string | null;
  pos_venda_iniciado_em?: string | null;
  pos_venda_observacoes?: string | null;
  pos_venda_user?: { nome?: string } | null;
  motivo_rejeicao?: string | null;
  rejeitada_em?: string | null;
  rejeitada_por?: string | null;
  rejeitada_user?: { nome?: string } | null;
}

const statusMeta = PROPOSTA_STATUS_META;

function normalizarTextoBusca(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatCentavos(c: number | null | undefined) {
  if (c == null || Number.isNaN(c)) return '—';
  return `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function motivoRejeicaoResumo(row: PropostaVendaRow): string | null {
  if (normalizarStatusProposta(row.status) !== PROPOSTA_STATUS.REJEITADA) return null;
  const texto = row.motivo_rejeicao?.trim() || row.observacoes?.trim();
  return texto || null;
}

function labelMetodoCobranca(value: string | null | undefined) {
  switch (value) {
    case 'boleto':
      return 'Boleto bancário';
    case 'pix':
      return 'PIX';
    case 'debito_automatico':
      return 'Débito automático';
    case 'cartao_credito':
      return 'Cartão de crédito';
    case 'cobrador':
      return 'Cobrador';
    default:
      return '—';
  }
}

export const PropostasListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, empresa } = useAuth();
  const { showToast } = useToast();
  const { empresaIdsFiltro, aguardandoContexto, dataRevisionEmpresa } = useEmpresaIdsOperacao();
  const { empresasDoGrupo, empresaIdEfetivo } = useEmpresaContextoAtivo();
  const { filiais, filialNome } = useFilial();
  const { shouldFilterByFilialContext, filialId, dataRevisionUnidade } =
    useUnidadeOperacionalFiltro();

  const empresaIdsConsulta = useMemo(
    () =>
      resolveEmpresaIdsConsultaComFilial(empresaIdsFiltro, {
        empresasDoGrupo,
        empresaIdEfetivo,
        filtrarPorFilial: shouldFilterByFilialContext,
        filialNome: shouldFilterByFilialContext
          ? filiais.find((f) => f.id === filialId)?.nome || filialNome
          : '',
      }),
    [
      empresaIdsFiltro,
      empresasDoGrupo,
      empresaIdEfetivo,
      shouldFilterByFilialContext,
      filiais,
      filialId,
      filialNome,
    ],
  );
  const [rows, setRows] = useState<PropostaVendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [criadorFilter, setCriadorFilter] = useState('');
  const [dataInicioFilter, setDataInicioFilter] = useState('');
  const [dataFimFilter, setDataFimFilter] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [columnFilters, setColumnFilters] = useState<{ [key: string]: string[] }>({
    unidade: [],
    plano: [],
    metodoCobranca: [],
    status: [],
    posVenda: [],
    criadoPor: [],
  });
  const [filterMenuColumn, setFilterMenuColumn] = useState<string | null>(null);
  const [filterMenuPosition, setFilterMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [rejeitandoProposta, setRejeitandoProposta] = useState<PropostaVendaRow | null>(null);
  const [textoMotivoRejeicao, setTextoMotivoRejeicao] = useState('');
  const [motivoRejeicaoView, setMotivoRejeicaoView] = useState<PropostaVendaRow | null>(null);
  const [linhaTempoModal, setLinhaTempoModal] = useState<PropostaVendaRow | null>(null);

  const getRowValueForFilter = (row: PropostaVendaRow, columnKey: string): string => {
    switch (columnKey) {
      case 'unidade':
        return row.empresas?.nome || '—';
      case 'plano':
        return row.planos?.nome || '—';
      case 'metodoCobranca':
        return row.metodo_cobranca || '—';
      case 'status':
        return row.status || '—';
      case 'posVenda':
        if (propostaContratoGerado(row.status)) {
          return 'Concluída';
        }
        if (propostaEmPosVenda(row.status) || row.pos_venda_responsavel_id) {
          return row.pos_venda_user?.nome || (row.pos_venda_responsavel_id === user?.id ? 'Você' : 'Em andamento');
        }
        if (propostaAguardandoContrato(row.status)) {
          return 'Aguardando';
        }
        return '—';
      case 'criadoPor':
        return row.users?.nome || '—';
      default:
        return '';
    }
  };

  const getFriendlyLabel = (columnKey: string, val: string): string => {
    if (columnKey === 'metodoCobranca') return labelMetodoCobranca(val);
    if (columnKey === 'status') return labelStatusProposta(val);
    return val;
  };

  const getUniqueValuesForColumn = (columnKey: string): string[] => {
    const set = new Set<string>();
    rows.forEach((r) => {
      set.add(getRowValueForFilter(r, columnKey));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  };

  const getFilterColumnLabel = (columnKey: string): string => {
    switch (columnKey) {
      case 'unidade': return 'Unidade';
      case 'plano': return 'Plano';
      case 'metodoCobranca': return 'Método de cobrança';
      case 'status': return 'Status';
      case 'posVenda': return 'Pós-venda';
      case 'criadoPor': return 'Criado por';
      default: return '';
    }
  };

  const getFilteredDropdownOptions = (columnKey: string, searchVal: string) => {
    const uniqueValues = getUniqueValuesForColumn(columnKey);
    const searchNormalized = normalizarTextoBusca(searchVal);
    
    return uniqueValues
      .map((val) => ({
        value: val,
        label: getFriendlyLabel(columnKey, val),
      }))
      .filter((opt) => {
        if (!searchVal) return true;
        const optLabelNorm = normalizarTextoBusca(opt.label);
        return optLabelNorm.includes(searchNormalized);
      });
  };

  const handleOpenFilterMenu = (columnKey: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (filterMenuColumn === columnKey) {
      setFilterMenuColumn(null);
      setFilterMenuPosition(undefined);
      setDropdownSearch('');
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const popupWidth = 256;
      let left = rect.left;
      if (rect.left + popupWidth > window.innerWidth) {
        left = Math.max(8, rect.right - popupWidth);
      }
      setFilterMenuPosition({ x: left, y: rect.bottom + 4 });
      setFilterMenuColumn(columnKey);
      setDropdownSearch('');
    }
  };

  const handleToggleColumnFilter = (columnKey: string, value: string) => {
    setColumnFilters((prev) => {
      const current = prev[columnKey] || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return {
        ...prev,
        [columnKey]: updated,
      };
    });
  };

  const clearColumnFilter = (columnKey: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [columnKey]: [],
    }));
  };


  const [processingActionId, setProcessingActionId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [viewingProposta, setViewingProposta] = useState<PropostaVendaRow | null>(null);
  const [contratoGeradoInfo, setContratoGeradoInfo] = useState<ContratoGeradoSucessoInfo | null>(
    null,
  );

  const role = (user?.role || '').toLowerCase().trim();
  const canViewAllPropostas = usuarioPodeVerTodasPropostasVenda(
    role,
    user?.permissoes as Record<string, unknown>,
    user?.roles_extra,
  );
  const canConfirmarProposta = usuarioPodeConfirmarProposta(
    role,
    user?.permissoes as Record<string, unknown>,
    user?.roles_extra,
  );
  const canGerarContratoProposta = usuarioPodeGerarContratoProposta(
    role,
    user?.permissoes as Record<string, unknown>,
    user?.roles_extra,
  );
  const canExcluirProposta = ['admin_sistema', 'super_admin'].includes(role);

  const usuarioPodeEditarProposta = (row: PropostaVendaRow) => {
    if (!propostaPodeEditar(row.status)) return false;
    if (propostaEmPosVenda(row.status)) return canGerarContratoProposta;
    return true;
  };

  const obterDadosCompletos = async (row: PropostaVendaRow) => {
    const { data: propostaFull } = await supabase
      .from('propostas_venda')
      .select('*, planos(nome), empresas(nome), pos_venda_user:pos_venda_responsavel_id(nome)')
      .eq('id', row.id)
      .maybeSingle();

    const proposta = (propostaFull as PropostaVendaRow) || row;
    const { nome: vendedorNome, telefone: vendedorDocumento } = await resolverDadosVendedorPropostaPdf(
      supabase,
      proposta.vendedor_id || row.vendedor_id,
    );
    let empresaNome = empresa?.nome || null;
    let empresaCnpj = (empresa as any)?.cnpj || null;
    let empresaLogoUrl = empresa?.logo_url || null;
    if (!empresaCnpj && proposta.empresa_id) {
      const { data: empresaRow } = await supabase
        .from('empresas')
        .select('nome, cnpj, logo_url')
        .eq('id', proposta.empresa_id)
        .maybeSingle();
      if (empresaRow?.nome) empresaNome = empresaRow.nome;
      if ((empresaRow as any)?.cnpj) empresaCnpj = (empresaRow as any).cnpj;
      if ((empresaRow as any)?.logo_url) empresaLogoUrl = (empresaRow as any).logo_url;
    }
    const nomeUnidadeLista = (proposta as PropostaVendaRow).empresas?.nome || empresaNome;
    const naturalidade = [
      (proposta as any).contribuinte_naturalidade_cidade?.trim(),
      (proposta as any).contribuinte_naturalidade_uf?.trim()
    ].filter(Boolean).join(' - ');

    return {
      numero: String(proposta.sequencial).padStart(3, '0'),
      dataPedido: proposta.data_pedido || proposta.created_at,
      empresaNome,
      empresaLogoUrl,
      unidadeEmissoraNome: nomeUnidadeLista || empresaNome,
      empresaCnpj,
      vendedorNome,
      vendedorDocumento,
      contribuinteNome: proposta.contribuinte_nome || '—',
      contribuinteDocumento: proposta.contribuinte_documento || '—',
      contribuinteTelefone:
        proposta.telefone_principal || proposta.telefone_alternativo || null,
      contribuinteEmail: (proposta as any).email || null,
      contribuinteEndereco: enderecoResidenciaCompletoFromRow(proposta as any) || null,
      enderecoLogradouro: (proposta as any).endereco_logradouro || null,
      enderecoNumero: (proposta as any).endereco_numero || null,
      enderecoBairro: (proposta as any).endereco_bairro || null,
      enderecoQuadra: (proposta as any).endereco_quadra || null,
      enderecoLote: (proposta as any).endereco_lote || null,
      enderecoCidade: (proposta as any).endereco_cidade || null,
      enderecoUf: (proposta as any).endereco_uf || null,
      enderecoCep: (proposta as any).endereco_cep || null,
      contribuinteRg: proposta.contribuinte_rg || null,
      contribuinteDataNascimento: proposta.contribuinte_data_nascimento
        ? proposta.contribuinte_data_nascimento.split('-').reverse().join('/')
        : null,
      contribuinteEstadoCivil: proposta.contribuinte_estado_civil || null,
      contribuinteNaturalidade: naturalidade || null,
      contribuinteProfissao: proposta.contribuinte_profissao || null,
      contribuinteReligiao: proposta.contribuinte_religiao || null,
      planoNome: proposta.planos?.nome || row.planos?.nome || 'Plano',
      valorAdesaoCentavos: Number(proposta.taxa_adesao_recebida_centavos || 0),
      primeiroVencimento: proposta.primeiro_vencimento,
      metodoCobranca: proposta.metodo_cobranca || 'boleto',
      cobrancaConfirmada: Boolean((proposta as any).cobranca_confirmada),
      cobradorMesmoEndereco: (proposta as any).cobrador_endereco_mesmo_residencial !== false,
      cobradorEnderecoEntrega: (proposta as any).cobrador_endereco_entrega || null,
      cobradorEnderecoCep: (proposta as any).cobrador_endereco_cep || null,
      cobradorEnderecoCidade: (proposta as any).cobrador_endereco_cidade || null,
      cobradorEnderecoUf: (proposta as any).cobrador_endereco_uf || null,
      statusProposta: proposta.status || null,
      parcelasRecebidasQuantidade: proposta.parcelas_recebidas_quantidade || 0,
      parcelasRecebidasTotalCentavos: proposta.parcelas_recebidas_total_centavos || 0,
      dependentesResumo: (proposta.dependentes_detalhes || []).map((d) => d?.nome || '').filter(Boolean),
      dependentesDetalhados: (proposta.dependentes_detalhes || []).map((d) => ({
        nome: d?.nome || '',
        parentesco: d?.parentesco || '—',
        cpf: d?.cpf || '',
        dataNascimento: d?.data_nascimento
          ? d.data_nascimento.split('-').reverse().join('/')
          : '',
      })).filter((d) => d.nome.trim()),
      observacoes: proposta.observacoes || null,
    };
  };

  const handleImprimir = (row: PropostaVendaRow) => {
    const janelaPdf = reservarJanelaImpressaoPdf();
    setProcessingActionId(row.id);
    void (async () => {
      try {
        const dados = await obterDadosCompletos(row);
        const blob = await buildPropostaPdfBlob(dados);
        if (!blob?.size) {
          if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
          showToast('O PDF da proposta foi gerado vazio. Tente novamente.', 'error');
          return;
        }
        const ok = await printPropostaPdf(blob, janelaPdf);
        if (ok) {
          showToast('PDF aberto. Na nova aba use Ctrl+P (ou Imprimir) para imprimir.', 'success');
        } else {
          showToast('Permita pop-ups neste site para abrir o PDF da proposta.', 'warning');
        }
      } catch (err) {
        console.error('[handleImprimir]', err);
        if (janelaPdf && !janelaPdf.closed) janelaPdf.close();
        showToast('Erro ao gerar PDF da proposta.', 'error');
      } finally {
        setProcessingActionId(null);
      }
    })();
  };

  const handleWhatsapp = async (row: PropostaVendaRow) => {
    setProcessingActionId(row.id);
    try {
      const dados = await obterDadosCompletos(row);
      const telefoneWa = resolverTelefoneWhatsapp(
        dados.contribuinteTelefone,
        row.telefone_principal,
        row.telefone_alternativo,
      );
      if (!telefoneWa) {
        showToast('Informe um telefone celular válido na proposta antes de enviar.', 'warning');
        return;
      }
      const numero = dados.numero;
      const blob = await buildPropostaPdfBlob(dados);
      downloadPropostaPdf(blob, numero);
      openWhatsAppComMensagem(
        `Segue a proposta nº ${numero} de ${dados.contribuinteNome}. O PDF foi exportado para anexo nesta conversa.`,
        telefoneWa,
      );
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleOpenMenu = (propostaId: string, event?: React.MouseEvent) => {
    if (event?.currentTarget) {
      setMenuPosition({ x: event.clientX + 2, y: event.clientY + 2 });
    } else {
      setMenuPosition(undefined);
    }
    setOpenMenuId(propostaId);
  };

  const handleAssumirPosVenda = async (row: PropostaVendaRow) => {
    if (!canGerarContratoProposta) {
      showToast(
        'Sem permissão para assumir pós-venda e gerar contrato. Peça ao administrador a permissão «Ver propostas de todos» em Propostas.',
        'warning',
      );
      return;
    }
    if (!propostaPodeAssumirPosVenda(row)) {
      showToast('Esta proposta não está disponível para assumir pós-venda.', 'warning');
      return;
    }
    const ok = window.confirm(
      `Assumir a análise pós-venda da proposta nº ${String(row.sequencial).padStart(3, '0')} (${row.contribuinte_nome})? Você ficará como responsável até gerar o contrato.`,
    );
    if (!ok || !user?.id) return;

    setProcessingActionId(row.id);
    try {
      const result = await assumirPosVendaProposta(supabase, row.id, user.id);
      if (result.ok === false) {
        console.error(result.error);
        showToast(result.error, result.jaAssumida ? 'warning' : 'error');
        if (result.jaAssumida) await load();
        return;
      }
      showToast('Pós-venda iniciada. Analise a proposta e gere o contrato quando concluir.', 'success');
      setOpenMenuId(null);
      setMenuPosition(undefined);
      await load();
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleLiberarPosVenda = async (row: PropostaVendaRow) => {
    if (!canGerarContratoProposta) return;
    if (!propostaPodeLiberarPosVenda(row, user?.id, canGerarContratoProposta)) return;
    const respNome = row.pos_venda_user?.nome || 'outro responsável';
    const ok = window.confirm(
      `Devolver a proposta nº ${String(row.sequencial).padStart(3, '0')} para a fila?\n\nResponsável atual: ${respNome}. A proposta voltará para «Liberada para contrato».`,
    );
    if (!ok) return;

    setProcessingActionId(row.id);
    try {
      const result = await liberarPosVendaProposta(supabase, row.id);
      if (result.ok === false) {
        console.error(result.error);
        showToast(result.error, result.naoEncontrada ? 'warning' : 'error');
        if (result.naoEncontrada) await load();
        return;
      }
      showToast('Proposta devolvida à fila. Outra pessoa pode assumir a pós-venda.', 'info');
      setOpenMenuId(null);
      setMenuPosition(undefined);
      await load();
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleGerarContrato = async (row: PropostaVendaRow) => {
    if (!canGerarContratoProposta) {
      showToast(
        'Sem permissão para gerar contrato. Peça ao administrador a permissão «Ver propostas de todos» em Propostas.',
        'warning',
      );
      return;
    }
    if (propostaEhRascunho(row.status)) {
      showToast('Esta proposta ainda está em preenchimento. O vendedor deve finalizar e liberar antes de gerar o contrato.', 'warning');
      return;
    }
    if (propostaAguardandoContrato(row.status)) {
      showToast('Assuma a pós-venda desta proposta antes de gerar o contrato.', 'warning');
      return;
    }
    if (!propostaPodeGerarContrato(row.status)) {
      showToast('Esta proposta já foi processada ou não está em pós-venda.', 'warning');
      return;
    }
    const respId = (row.pos_venda_responsavel_id || '').trim();
    const isOwner = user?.id && respId === user.id;
    const isAdmin = ['admin', 'super_admin', 'admin_empresa', 'admin_sistema', 'gerente', 'gestor'].includes(role);
    if (respId && !isOwner && !isAdmin) {
      showToast(
        `Esta proposta está em pós-venda com ${row.pos_venda_user?.nome || 'outro responsável'}.`,
        'warning',
      );
      return;
    }
    const ok = window.confirm(
      `Gerar contrato e cadastro do cliente para a proposta nº ${String(row.sequencial).padStart(3, '0')} (${row.contribuinte_nome})?`,
    );
    if (!ok) return;

    setProcessingActionId(row.id);
    try {
      const res = await gerarContratoDesdeProposta(row.id);
      if (!res.ok) {
        showToast(res.error || 'Não foi possível gerar o contrato.', 'error');
        return;
      }
      setOpenMenuId(null);
      setMenuPosition(undefined);
      setViewingProposta(null);
      await load();
      if (res.codigoContrato || res.assinaturaId) {
        setContratoGeradoInfo({
          codigoContrato: res.codigoContrato || '—',
          assinaturaId: res.assinaturaId,
          dependentesIncluidos: res.dependentesIncluidos,
          propostaSequencial: row.sequencial,
        });
      } else {
        showToast('Contrato gerado com sucesso.', 'success');
      }
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleCancelarProposta = async (row: PropostaVendaRow) => {
    if (!canConfirmarProposta || propostaStatusEncerrado(row.status)) return;
    const ok = window.confirm(
      `Cancelar a proposta nº ${String(row.sequencial).padStart(3, '0')} de ${row.contribuinte_nome}?`,
    );
    if (!ok) return;
    const { error } = await supabase
      .from('propostas_venda')
      .update({ status: 'cancelado' })
      .eq('id', row.id);
    if (error) {
      console.error(error);
      showToast('Erro ao cancelar proposta.', 'error');
      return;
    }
    showToast('Proposta cancelada.', 'success');
    setOpenMenuId(null);
    setMenuPosition(undefined);
    await load();
  };

  const abrirRejeicaoProposta = (row: PropostaVendaRow) => {
    if (!canConfirmarProposta || propostaStatusEncerrado(row.status)) return;
    setRejeitandoProposta(row);
    setTextoMotivoRejeicao('');
    setOpenMenuId(null);
    setMenuPosition(undefined);
  };

  const confirmarRejeicaoProposta = async () => {
    if (!rejeitandoProposta) return;
    const motivo = textoMotivoRejeicao.trim();
    if (!motivo) {
      showToast('Informe o motivo da rejeição.', 'warning');
      return;
    }
    setProcessingActionId(rejeitandoProposta.id);
    try {
      const payload: Record<string, unknown> = {
        status: 'rejeitada',
        motivo_rejeicao: motivo,
        rejeitada_em: new Date().toISOString(),
        rejeitada_por: user?.id || null,
      };
      let { error } = await supabase
        .from('propostas_venda')
        .update(payload)
        .eq('id', rejeitandoProposta.id);
      if (error && /motivo_rejeicao|rejeitada_em|rejeitada_por|schema cache/i.test(error.message)) {
        const stamp = new Date().toLocaleString('pt-BR');
        const blocoRejeicao = `[REJEIÇÃO ${stamp}]: ${motivo}`;
        const obsAntiga = rejeitandoProposta.observacoes?.trim() || '';
        const observacoes = obsAntiga ? `${obsAntiga}\n\n${blocoRejeicao}` : blocoRejeicao;
        ({ error } = await supabase
          .from('propostas_venda')
          .update({ status: 'rejeitada', observacoes })
          .eq('id', rejeitandoProposta.id));
        if (!error) {
          showToast(
            'Proposta rejeitada. Motivo salvo em observações — aplique a migration de motivo_rejeicao no banco.',
            'warning',
          );
          setRejeitandoProposta(null);
          setTextoMotivoRejeicao('');
          await load();
          return;
        }
      }
      if (error) {
        console.error(error);
        showToast('Erro ao rejeitar proposta.', 'error');
        return;
      }
      showToast('Proposta rejeitada.', 'success');
      setRejeitandoProposta(null);
      setTextoMotivoRejeicao('');
      await load();
    } finally {
      setProcessingActionId(null);
    }
  };

  const handleExcluirProposta = async (row: PropostaVendaRow) => {
    if (!canExcluirProposta) return;
    const confirmado = window.confirm(
      `Tem certeza que deseja excluir a proposta nº ${String(row.sequencial).padStart(3, '0')} de ${row.contribuinte_nome}?\n\nEsta ação é irreversível.`
    );
    if (!confirmado) return;
    setDeletingId(row.id);
    try {
      const { error } = await supabase
        .from('propostas_venda')
        .delete()
        .eq('id', row.id);
      if (error) {
        console.error('[Excluir proposta]', error);
        showToast('Erro ao excluir a proposta. Somente administradores do sistema podem excluir.', 'error');
        return;
      }
      showToast('Proposta excluída permanentemente.', 'success');
      setOpenMenuId(null);
      setMenuPosition(undefined);
      setSelectedId(null);
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const handleCardClick = (targetStatus: string) => {
    if (statusFilter === targetStatus) {
      setStatusFilter('');
    } else {
      setStatusFilter(targetStatus);
    }
  };


  const PROPOSTAS_SELECT_COMPLETO =
    '*, planos(nome), empresas(nome), users:vendedor_id(nome), pos_venda_user:pos_venda_responsavel_id(nome), rejeitada_user:rejeitada_por(nome)';
  const PROPOSTAS_SELECT_SEM_REJEICAO_USER =
    '*, planos(nome), empresas(nome), users:vendedor_id(nome), pos_venda_user:pos_venda_responsavel_id(nome)';

  const erroRelacaoRejeicao = (message: string) => (
    /rejeitada_por|motivo_rejeicao|rejeitada_em|PGRST200|schema cache|relationship/i.test(message)
  );

  const load = async () => {
    if (aguardandoContexto) return;
    const idsEmpresa = empresaIdsConsulta;
    if (idsEmpresa.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const montarQuery = (select: string) => {
      let q = filtrarQueryPorEmpresaIds(
        supabase
          .from('propostas_venda')
          .select(select)
          .order('created_at', { ascending: false })
          .limit(5000),
        idsEmpresa,
      );
      if (!canViewAllPropostas && user?.id) {
        q = q.eq('vendedor_id', user.id);
      }
      if (dataInicioFilter) {
        q = q.or(`data_pedido.gte.${dataInicioFilter},created_at.gte.${dataInicioFilter}T00:00:00`);
      }
      if (dataFimFilter) {
        q = q.or(`data_pedido.lte.${dataFimFilter},created_at.lte.${dataFimFilter}T23:59:59`);
      }
      return q;
    };

    let { data, error } = await montarQuery(PROPOSTAS_SELECT_COMPLETO);
    if (error && erroRelacaoRejeicao(error.message)) {
      ({ data, error } = await montarQuery(PROPOSTAS_SELECT_SEM_REJEICAO_USER));
    }

    if (error) {
      console.error('[PropostasList]', error);
      showToast(error.message || 'Erro ao carregar propostas.', 'error');
      setRows([]);
    } else {
      const brutos = (data || []) as PropostaVendaRow[];
      const confMap = await mapaConfirmacaoFinanceiroPropostas(
        brutos.map((p) => ({
          id: p.id,
          status: p.status,
          assinatura_id: p.assinatura_id,
          cliente_id: p.cliente_id,
        })),
      );
      setRows(
        brutos.map((p) => {
          const conf = confMap.get(p.id);
          return {
            ...p,
            confirmada_financeiro: conf?.confirmada ?? false,
            data_confirmacao_financeiro: conf?.data_confirmacao ?? null,
          };
        }),
      );
    }
    setLoading(false);
  };

  const modoFilaContrato = isModoFilaContrato(searchParams);
  const modoFilaPosVenda = isModoFilaPosVenda(searchParams);

  useEffect(() => {
    if (modoFilaContrato) {
      setStatusFilter(PROPOSTA_STATUS.AGUARDANDO_CONTRATO);
    } else if (modoFilaPosVenda) {
      setStatusFilter(PROPOSTA_STATUS.EM_POS_VENDA);
    }
  }, [modoFilaContrato, modoFilaPosVenda]);

  useEffect(() => {
    void load();
  }, [
    canViewAllPropostas,
    user?.id,
    dataRevisionEmpresa,
    dataRevisionUnidade,
    empresaIdsConsulta.join(','),
    dataInicioFilter,
    dataFimFilter,
  ]);


  const opcoesCriadores = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const id = (r.vendedor_id || '').trim();
      if (!id) continue;
      const nome = r.users?.nome?.trim() || 'Sem nome';
      if (!map.has(id)) map.set(id, nome);
    }
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([id, nome]) => ({ id, nome }));
  }, [rows]);

  const mostrarFiltroCriador = canViewAllPropostas || opcoesCriadores.length > 1;

  const filtered = useMemo(() => {
    const q = normalizarTextoBusca(search);
    const qDigits = q.replace(/\D/g, '');
    return rows.filter((r) => {
      const nomeContribuinte = normalizarTextoBusca(r.contribuinte_nome);
      const criadorNome = normalizarTextoBusca(r.users?.nome);
      const documentoDigits = (r.contribuinte_documento || '').replace(/\D/g, '');
      const sequencialRaw = String(r.sequencial || '');
      const sequencial3 = sequencialRaw.padStart(3, '0');
      const okSearch =
        !q ||
        nomeContribuinte.includes(q) ||
        (qDigits.length > 0 && documentoDigits.includes(qDigits)) ||
        sequencialRaw.includes(q) ||
        sequencial3.includes(q) ||
        `#${sequencial3}`.includes(q) ||
        criadorNome.includes(q);
      const okStatus =
        !statusFilter
        || (statusFilter === 'em_aberto'
            ? propostaEmAberto(r.status)
            : normalizarStatusProposta(r.status) === statusFilter || r.status === statusFilter);
      const okCriador = !criadorFilter || r.vendedor_id === criadorFilter;

      let okPeriodo = true;
      if (dataInicioFilter || dataFimFilter) {
        const valDate = (r.data_pedido || r.created_at || '').slice(0, 10);
        if (dataInicioFilter && valDate < dataInicioFilter) okPeriodo = false;
        if (dataFimFilter && valDate > dataFimFilter) okPeriodo = false;
      }

      if (!okSearch || !okStatus || !okCriador || !okPeriodo) return false;

      // Filtros por coluna estilo Excel
      for (const [key, selectedValues] of Object.entries(columnFilters)) {
        if (selectedValues.length > 0) {
          const val = getRowValueForFilter(r, key);
          if (!selectedValues.includes(val)) {
            return false;
          }
        }
      }

      return true;
    });
  }, [rows, search, statusFilter, criadorFilter, columnFilters, dataInicioFilter, dataFimFilter]);

  const filteredOrdenado = useMemo(() => {
    if (modoFilaPosVenda) {
      return [...filtered].sort((a, b) => {
        const minA = minutosEmPosVenda(a) ?? 0;
        const minB = minutosEmPosVenda(b) ?? 0;
        return minB - minA;
      });
    }
    if (!modoFilaContrato) return filtered;
    return [...filtered].sort((a, b) => {
      const diasA = diasTotalProposta(a) ?? diasPendenciaProposta(a) ?? 0;
      const diasB = diasTotalProposta(b) ?? diasPendenciaProposta(b) ?? 0;
      return diasB - diasA;
    });
  }, [filtered, modoFilaContrato, modoFilaPosVenda]);

  const totalPages = Math.ceil(filteredOrdenado.length / pageSize);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrdenado.slice(start, start + pageSize);
  }, [filteredOrdenado, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, criadorFilter, dataInicioFilter, dataFimFilter, pageSize]);

  useEffect(() => {
    if (criadorFilter && !opcoesCriadores.some((c) => c.id === criadorFilter)) {
      setCriadorFilter('');
    }
  }, [criadorFilter, opcoesCriadores]);

  const filaContratoResumo = useMemo(() => resumoDiasFilaContrato(rows), [rows]);

  // KPIs
  const kpis = useMemo(() => {
    const hoje = new Date();
    const emAberto = rows.filter((r) => propostaEmAberto(r.status));
    const diasAberto = emAberto
      .map((r) => diasPendenciaProposta(r, hoje))
      .filter((d): d is number => d != null);
    const mediaDias =
      diasAberto.length > 0
        ? Math.round(diasAberto.reduce((a, b) => a + b, 0) / diasAberto.length)
        : 0;
    const contratosGerados = rows.filter((r) => propostaContratoGerado(r.status)).length;
    const canceladas = rows.filter(
      (r) => normalizarStatusProposta(r.status) === PROPOSTA_STATUS.CANCELADO
        || normalizarStatusProposta(r.status) === PROPOSTA_STATUS.REJEITADA,
    ).length;
    const rascunhos = rows.filter((r) => propostaEhRascunho(r.status)).length;
    const liberadas = rows.filter((r) => propostaAguardandoContrato(r.status)).length;
    const emPosVenda = rows.filter((r) => propostaEmPosVenda(r.status)).length;
    return {
      total: rows.length,
      emAberto: emAberto.length,
      mediaDias,
      contratosGerados,
      canceladas,
      rascunhos,
      liberadas,
      emPosVenda,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Propostas de Venda"
        subtitle={
          modoFilaPosVenda
            ? kpis.emPosVenda > 0
              ? `${kpis.emPosVenda} proposta(s) em análise pós-venda — veja responsável e tempo em cada linha.`
              : 'Nenhuma proposta em pós-venda no momento.'
            : modoFilaContrato
              ? filaContratoResumo.quantidade > 0
                ? `${filaContratoResumo.quantidade} aguardando assumir · média ${filaContratoResumo.mediaDias} dia(s) na fila · maior espera: ${filaContratoResumo.maxDias} dia(s)`
                : 'Nenhuma proposta liberada aguardando pós-venda.'
              : canConfirmarProposta
                ? 'Fluxo: vendedor libera → equipe assume pós-venda → gera contrato (cliente + assinatura + parcelas).'
                : canViewAllPropostas
                  ? 'Propostas de todos os vendedores das unidades do seu acesso'
                  : 'Exibindo apenas as suas propostas de venda'
        }
        actionButton={
          <div className="flex flex-wrap gap-2">
            {modoFilaContrato || modoFilaPosVenda ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/venda/propostas')}
              >
                Ver todas as propostas
              </Button>
            ) : null}
            {!modoFilaContrato && canGerarContratoProposta ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/venda/propostas?fila=contrato')}
              >
                <FileSignature className="h-4 w-4 mr-1" />
                Fila p/ contrato
                {kpis.liberadas > 0 ? ` (${kpis.liberadas})` : ''}
              </Button>
            ) : null}
            {!modoFilaPosVenda && canGerarContratoProposta ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/venda/propostas?fila=pos-venda')}
              >
                <Headphones className="h-4 w-4 mr-1" />
                Pós-venda
                {kpis.emPosVenda > 0 ? ` (${kpis.emPosVenda})` : ''}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Atualizar
            </Button>
            <Button size="sm" onClick={() => navigate('/venda/nova')}>
              <Plus className="h-4 w-4 mr-1" />
              Nova proposta
            </Button>
          </div>
        }
      />

      {/* Cards de KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card
          onClick={() => setStatusFilter('')}
          className={`p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 select-none hover:-translate-y-0.5 hover:shadow-md active:scale-95 ${
            statusFilter === ''
              ? 'ring-2 ring-blue-500 dark:ring-blue-400 shadow-md bg-blue-50/20 dark:bg-slate-800 scale-[1.02] border-transparent'
              : 'hover:border-blue-200 hover:bg-blue-50/10'
          }`}
        >
          <div className="p-2 bg-blue-50 rounded-lg"><FileText className="h-5 w-5 text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Total de propostas</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{kpis.total}</p>
          </div>
        </Card>

        <Card
          onClick={() => handleCardClick(PROPOSTA_STATUS.RASCUNHO)}
          className={`p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 select-none hover:-translate-y-0.5 hover:shadow-md active:scale-95 ${
            statusFilter === PROPOSTA_STATUS.RASCUNHO
              ? 'ring-2 ring-gray-500 dark:ring-slate-400 shadow-md bg-gray-50/50 dark:bg-slate-800 scale-[1.02] border-transparent'
              : 'hover:border-gray-300 hover:bg-gray-50/10'
          }`}
        >
          <div className="p-2 bg-gray-100 rounded-lg"><ClipboardList className="h-5 w-5 text-gray-500" /></div>
          <div>
            <p className="text-xs text-gray-500">Rascunhos</p>
            <p className="text-2xl font-bold text-gray-700 dark:text-slate-200">{kpis.rascunhos}</p>
            <p className="text-[11px] text-gray-400">Em preenchimento</p>
          </div>
        </Card>

        <Card
          onClick={() => handleCardClick('em_aberto')}
          className={`p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 select-none hover:-translate-y-0.5 hover:shadow-md active:scale-95 ${
            statusFilter === 'em_aberto'
              ? 'ring-2 ring-amber-500 dark:ring-amber-400 shadow-md bg-amber-50/20 dark:bg-slate-800 scale-[1.02] border-transparent'
              : 'hover:border-amber-200 hover:bg-amber-50/10'
          }`}
        >
          <div className="p-2 bg-amber-50 rounded-lg"><CalendarClock className="h-5 w-5 text-amber-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Em aberto</p>
            <p className="text-2xl font-bold text-amber-700">{kpis.emAberto}</p>
            <p className="text-[11px] text-gray-400">méd. {kpis.mediaDias} dias em aberto</p>
          </div>
        </Card>

        <Card
          onClick={() => handleCardClick(PROPOSTA_STATUS.EM_POS_VENDA)}
          className={`p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 select-none hover:-translate-y-0.5 hover:shadow-md active:scale-95 ${
            statusFilter === PROPOSTA_STATUS.EM_POS_VENDA
              ? 'ring-2 ring-teal-500 dark:ring-teal-400 shadow-md bg-teal-50/20 dark:bg-slate-800 scale-[1.02] border-transparent'
              : 'hover:border-teal-200 hover:bg-teal-50/10'
          }`}
        >
          <div className="p-2 bg-teal-50 rounded-lg"><Headphones className="h-5 w-5 text-teal-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Em pós-venda</p>
            <p className="text-2xl font-bold text-teal-700">{kpis.emPosVenda}</p>
            <p className="text-[11px] text-gray-400">{kpis.liberadas} na fila p/ contrato</p>
          </div>
        </Card>

        <Card
          onClick={() => handleCardClick(PROPOSTA_STATUS.CONTRATO_GERADO)}
          className={`p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 select-none hover:-translate-y-0.5 hover:shadow-md active:scale-95 ${
            statusFilter === PROPOSTA_STATUS.CONTRATO_GERADO
              ? 'ring-2 ring-green-500 dark:ring-green-400 shadow-md bg-green-50/20 dark:bg-slate-800 scale-[1.02] border-transparent'
              : 'hover:border-green-200 hover:bg-green-50/10'
          }`}
        >
          <div className="p-2 bg-green-50 rounded-lg"><TrendingUp className="h-5 w-5 text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Contratos gerados</p>
            <p className="text-2xl font-bold text-green-700">{kpis.contratosGerados}</p>
            <p className="text-[11px] text-gray-400">{kpis.canceladas} cancelada(s)/rejeitada(s)</p>
          </div>
        </Card>
      </div>

      {modoFilaContrato && filaContratoResumo.quantidade > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50/80">
          <div className="flex flex-wrap items-center gap-4 text-sm text-amber-950">
            <CalendarClock className="h-5 w-5 text-amber-700 shrink-0" />
            <span>
              <strong>{filaContratoResumo.quantidade}</strong> na fila · pendência média{' '}
              <strong>{filaContratoResumo.mediaDias} dia(s)</strong>
              {filaContratoResumo.maxDias > filaContratoResumo.mediaDias && (
                <>
                  {' '}
                  · mais antiga: <strong>{filaContratoResumo.maxDias} dia(s)</strong>
                </>
              )}
            </span>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-col xl:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome, documento, número ou criador..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 dark:text-slate-500 shrink-0 font-black uppercase tracking-wider">De:</span>
              <div className="w-[10.5rem] shrink-0">
                <Input
                  type="date"
                  pickerOnly
                  helperText=""
                  value={dataInicioFilter}
                  onChange={(e) => setDataInicioFilter(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 dark:text-slate-500 shrink-0 font-black uppercase tracking-wider">Até:</span>
              <div className="w-[10.5rem] shrink-0">
                <Input
                  type="date"
                  pickerOnly
                  helperText=""
                  value={dataFimFilter}
                  onChange={(e) => setDataFimFilter(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Status: todos</option>
                <option value="em_aberto">Em aberto</option>
                <option value={PROPOSTA_STATUS.AGUARDANDO_CONTRATO}>Liberada para contrato</option>
                <option value={PROPOSTA_STATUS.EM_POS_VENDA}>Em pós-venda</option>
                <option value={PROPOSTA_STATUS.RASCUNHO}>Em preenchimento</option>
                <option value={PROPOSTA_STATUS.CONTRATO_GERADO}>Contrato gerado</option>
                <option value="cancelado">Cancelada</option>
                <option value="rejeitada">Rejeitada</option>
              </Select>
            </div>
            {mostrarFiltroCriador && (
              <div className="w-full sm:w-48">
                <Select value={criadorFilter} onChange={(e) => setCriadorFilter(e.target.value)}>
                  <option value="">Criador: todos</option>
                  {opcoesCriadores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Excel-style Active Filters Bar */}
        {(Object.values(columnFilters).some((arr) => arr.length > 0) || dataInicioFilter || dataFimFilter || statusFilter || criadorFilter || search) && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Filtros ativos:</span>
              {search && (
                <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full border border-blue-100/80 dark:border-blue-900/40">
                  <span>Busca: "{search}"</span>
                  <button onClick={() => setSearch('')} className="text-blue-400 hover:text-blue-600 font-bold ml-1">×</button>
                </div>
              )}
              {dataInicioFilter && (
                <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full border border-blue-100/80 dark:border-blue-900/40">
                  <span>De: {dataInicioFilter.split('-').reverse().join('/')}</span>
                  <button onClick={() => setDataInicioFilter('')} className="text-blue-400 hover:text-blue-600 font-bold ml-1">×</button>
                </div>
              )}
              {dataFimFilter && (
                <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full border border-blue-100/80 dark:border-blue-900/40">
                  <span>Até: {dataFimFilter.split('-').reverse().join('/')}</span>
                  <button onClick={() => setDataFimFilter('')} className="text-blue-400 hover:text-blue-600 font-bold ml-1">×</button>
                </div>
              )}
              {statusFilter && (
                <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full border border-blue-100/80 dark:border-blue-900/40">
                  <span>Status: {statusFilter === 'em_aberto' ? 'Em aberto' : labelStatusProposta(statusFilter)}</span>
                  <button onClick={() => setStatusFilter('')} className="text-blue-400 hover:text-blue-600 font-bold ml-1">×</button>
                </div>
              )}
              {criadorFilter && (
                <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full border border-blue-100/80 dark:border-blue-900/40">
                  <span>Criador: {opcoesCriadores.find(c => c.id === criadorFilter)?.nome || criadorFilter}</span>
                  <button onClick={() => setCriadorFilter('')} className="text-blue-400 hover:text-blue-600 font-bold ml-1">×</button>
                </div>
              )}
              {Object.entries(columnFilters).map(([columnKey, values]) => {
                if (values.length === 0) return null;
                const columnLabel = getFilterColumnLabel(columnKey);
                return (
                  <div
                    key={columnKey}
                    className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full border border-blue-100/80 dark:border-blue-900/40"
                  >
                    <span>
                      {columnLabel}: {values.join(', ')}
                    </span>
                    <button
                      onClick={() => clearColumnFilter(columnKey)}
                      className="text-blue-400 hover:text-blue-600 transition-all font-bold ml-1"
                      title={`Limpar filtro de ${columnLabel}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => {
                setColumnFilters({
                  unidade: [],
                  plano: [],
                  metodoCobranca: [],
                  status: [],
                  posVenda: [],
                  criadoPor: [],
                });
                setDataInicioFilter('');
                setDataFimFilter('');
                setStatusFilter('');
                setCriadorFilter('');
                setSearch('');
              }}
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline transition-all flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Limpar todos os filtros
            </button>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">Nenhuma proposta encontrada.</p>
          <Button className="mt-4" onClick={() => navigate('/venda/nova')}>
            Criar primeira proposta
          </Button>
        </Card>
      ) : (
        <div className="list-table-shell">
          <div className="overflow-x-auto overflow-visible">
            <table className="list-table">
              <thead>
                <tr>
                  <th className="text-center w-16">Nº</th>
                  <th className="text-center whitespace-nowrap">Pedido</th>
                  <th>
                    <div className="flex items-center justify-between gap-1 select-none min-w-[120px]">
                      <span>Unidade</span>
                      <button
                        onClick={(e) => handleOpenFilterMenu('unidade', e)}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          columnFilters.unidade.length > 0
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-100 dark:ring-blue-900/50'
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                        }`}
                        title="Filtrar Unidade"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                  <th>Contribuinte</th>
                  <th>
                    <div className="flex items-center justify-between gap-1 select-none min-w-[120px]">
                      <span>Plano</span>
                      <button
                        onClick={(e) => handleOpenFilterMenu('plano', e)}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          columnFilters.plano.length > 0
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-100 dark:ring-blue-900/50'
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                        }`}
                        title="Filtrar Plano"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                  <th className="text-right whitespace-nowrap">Adesão recebida</th>
                  <th className="text-center whitespace-nowrap">Parcelas recebidas</th>
                  <th className="text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1 select-none mx-auto w-fit">
                      <span>Método cobrança</span>
                      <button
                        onClick={(e) => handleOpenFilterMenu('metodoCobranca', e)}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          columnFilters.metodoCobranca.length > 0
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-100 dark:ring-blue-900/50'
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                        }`}
                        title="Filtrar Método de cobrança"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                  <th className="text-center">Qtd. dep.</th>
                  <th className="text-center whitespace-nowrap">1º venc.</th>
                  <th className="text-center whitespace-nowrap" title="Quando o vendedor liberou para gerar o contrato">
                    Liberada em
                  </th>
                  <th className="text-center whitespace-nowrap" title="Quando o contrato foi gerado no sistema">
                    Contrato em
                  </th>
                  <th
                    className="text-center whitespace-nowrap"
                    title="1ª mensalidade quitada no financeiro (base da comissão do vendedor)"
                  >
                    Confirmação
                  </th>
                  <th
                    className="text-center whitespace-nowrap"
                    title="Dias totais do fluxo — clique na célula para ver o detalhamento"
                  >
                    Dias total
                  </th>
                  <th className="text-center">
                    <div className="flex items-center justify-center gap-1 select-none mx-auto w-fit">
                      <span>Status</span>
                      <button
                        onClick={(e) => handleOpenFilterMenu('status', e)}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          columnFilters.status.length > 0
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-100 dark:ring-blue-900/50'
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                        }`}
                        title="Filtrar Status"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                  <th className="text-center whitespace-nowrap" title="Responsável pela análise pós-venda">
                    <div className="flex items-center justify-center gap-1 select-none mx-auto w-fit">
                      <span>Pós-venda</span>
                      <button
                        onClick={(e) => handleOpenFilterMenu('posVenda', e)}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          columnFilters.posVenda.length > 0
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-100 dark:ring-blue-900/50'
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                        }`}
                        title="Filtrar Pós-venda"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                  <th className="text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1 select-none mx-auto w-fit">
                      <span>Criado por</span>
                      <button
                        onClick={(e) => handleOpenFilterMenu('criadoPor', e)}
                        className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          columnFilters.criadoPor.length > 0
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-100 dark:ring-blue-900/50'
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                        }`}
                        title="Filtrar Criado por"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((r) => {
                  const statusNorm = normalizarStatusProposta(r.status);
                  const sm = statusMeta[statusNorm] || statusMeta[r.status] || {
                    label: labelStatusProposta(r.status),
                    variant: 'default' as const,
                  };
                  const diasPend = diasTotalProposta(r) ?? diasPendenciaProposta(r);
                  const motivoRejeicao = motivoRejeicaoResumo(r);
                  return (
                    <tr
                      key={r.id}
                      className={`cursor-pointer transition-all ${openMenuId === r.id || selectedId === r.id ? 'bg-blue-50 ring-1 ring-inset ring-blue-100' : 'hover:bg-gray-50/80'}`}
                      onClick={() => {
                        setSelectedId(r.id);
                        setOpenMenuId(null);
                        setMenuPosition(undefined);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSelectedId(r.id);
                        handleOpenMenu(r.id, event);
                      }}
                      title="Clique para selecionar. Clique direito para ações."
                    >
                        <td className="p-0 text-center">
                          <DropdownMenu className="w-full block">
                            <DropdownMenuTrigger
                              onClick={(event: React.MouseEvent) => {
                                setSelectedId(r.id);
                                handleOpenMenu(r.id, event);
                              }}
                              className="py-3 px-4 w-full h-full text-center font-mono font-medium text-gray-900"
                            >
                              {String(r.sequencial).padStart(3, '0')}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              isOpen={openMenuId === r.id}
                              onClose={() => {
                                setOpenMenuId(null);
                                setMenuPosition(undefined);
                              }}
                              align="left"
                              position={menuPosition}
                            >
                              <DropdownMenuItem onClick={() => { setViewingProposta(r); setOpenMenuId(null); }}>
                                <Eye className="h-4 w-4 mr-2" />
                                Visualizar proposta
                              </DropdownMenuItem>
                              {usuarioPodeEditarProposta(r) && (
                                <DropdownMenuItem onClick={() => { navigate(`/venda/propostas/${r.id}/editar`); setOpenMenuId(null); }}>
                                  <MessageCircle className="h-4 w-4 mr-2" />
                                  {propostaEmPosVenda(r.status) ? 'Editar (pós-venda)' : 'Editar proposta'}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => { void handleImprimir(r); setOpenMenuId(null); }}>
                                <Printer className="h-4 w-4 mr-2" />
                                {processingActionId === r.id ? 'Gerando PDF...' : 'Imprimir'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { void handleWhatsapp(r); setOpenMenuId(null); }}>
                                <Send className="h-4 w-4 mr-2" />
                                {processingActionId === r.id ? 'Preparando envio...' : 'Mandar por WhatsApp'}
                              </DropdownMenuItem>
                              {canGerarContratoProposta && propostaPodeAssumirPosVenda(r) && (
                                <DropdownMenuItem onClick={() => { void handleAssumirPosVenda(r); }}>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  {processingActionId === r.id ? 'Assumindo...' : 'Assumir pós-venda'}
                                </DropdownMenuItem>
                              )}
                              {canGerarContratoProposta && propostaPodeLiberarPosVenda(r, user?.id, canGerarContratoProposta) && (
                                <DropdownMenuItem onClick={() => { void handleLiberarPosVenda(r); }}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Devolver à fila
                                </DropdownMenuItem>
                              )}
                              {canGerarContratoProposta && propostaPodeGerarContrato(r.status) && (
                                <DropdownMenuItem onClick={() => { void handleGerarContrato(r); }}>
                                  <FileSignature className="h-4 w-4 mr-2" />
                                  {processingActionId === r.id ? 'Gerando contrato...' : 'Gerar contrato'}
                                </DropdownMenuItem>
                              )}
                              {canConfirmarProposta && !propostaStatusEncerrado(r.status) && (
                                <>
                                  <DropdownMenuItem onClick={() => { void handleCancelarProposta(r); }}>
                                    <Ban className="h-4 w-4 mr-2" />
                                    Cancelar proposta
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { abrirRejeicaoProposta(r); }}>
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Rejeitar proposta
                                  </DropdownMenuItem>
                                </>
                              )}
                              {normalizarStatusProposta(r.status) === PROPOSTA_STATUS.REJEITADA && (
                                <DropdownMenuItem onClick={() => { setMotivoRejeicaoView(r); setOpenMenuId(null); }}>
                                  <AlertTriangle className="h-4 w-4 mr-2" />
                                  Ver motivo da rejeição
                                </DropdownMenuItem>
                              )}
                              {canViewAllPropostas && propostaContratoGerado(r.status) && (
                                <DropdownMenuItem disabled onClick={() => {}}>
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Contrato já gerado
                                </DropdownMenuItem>
                              )}
                              {canExcluirProposta && (
                                <DropdownMenuItem
                                  onClick={() => { void handleExcluirProposta(r); setOpenMenuId(null); }}
                                  variant="danger"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {deletingId === r.id ? 'Excluindo...' : 'Excluir proposta'}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                        <td className="text-center text-gray-600 whitespace-nowrap">
                          {new Date(r.data_pedido || r.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="text-gray-700 max-w-[140px]">
                          <span className="line-clamp-2" title={r.empresas?.nome || ''}>
                            {r.empresas?.nome || '—'}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{r.contribuinte_nome}</p>
                          <p className="text-xs text-gray-500">{r.contribuinte_documento}</p>
                            </div>
                            {r.cadastro_existente_alerta && (
                              <span
                                className="inline-flex items-center gap-1 shrink-0 rounded-md bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                title={
                                  Array.isArray(r.cadastro_existente_alertas)
                                    ? r.cadastro_existente_alertas.join('\n')
                                    : 'Cadastro já existia no sistema'
                                }
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Revisar
                              </span>
                            )}
                          </div>
                          {r.telefone_principal && (
                            <p className="text-xs text-gray-600 mt-1 flex items-center gap-1.5">
                              {validarWhatsapp(r.telefone_principal) ? (
                                <a
                                  href={obterUrlWhatsapp(r.telefone_principal)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-medium transition-colors cursor-pointer"
                                  title="Clique para abrir no WhatsApp"
                                >
                                  <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                  {r.telefone_principal}
                                </a>
                              ) : (
                                <>
                                  <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                  {r.telefone_principal}
                                </>
                              )}
                            </p>
                          )}
                        </td>
                        <td className="text-gray-700">{r.planos?.nome || '—'}</td>
                        <td className="text-right tabular-nums">
                          {formatCentavos(r.taxa_adesao_recebida_centavos)}
                        </td>
                        <td className="text-center text-gray-700">
                          {(r.parcelas_recebidas_quantidade || 0) > 0 ? (
                            <div>
                              <p className="font-medium">{r.parcelas_recebidas_quantidade}x</p>
                              <p className="text-xs text-gray-500">{formatCentavos(r.parcelas_recebidas_total_centavos || 0)}</p>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="text-center text-gray-700 whitespace-nowrap">
                          {labelMetodoCobranca(r.metodo_cobranca)}
                        </td>
                        <td className="text-center text-gray-700 tabular-nums font-medium">
                          {r.dependentes_inclusos ?? r.dependentes_detalhes?.length ?? 0}
                        </td>
                        <td className="text-center whitespace-nowrap">
                          {r.primeiro_vencimento
                            ? new Date(r.primeiro_vencimento).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="text-center text-xs text-gray-600 whitespace-nowrap">
                          {formatarDataProposta(r.liberada_em)}
                        </td>
                        <td className="text-center text-xs text-gray-600 whitespace-nowrap">
                          {formatarDataProposta(r.contrato_gerado_em)}
                        </td>
                        <td className="text-center whitespace-nowrap">
                          <PropostaConfirmacaoBadge
                            status={r.status}
                            confirmada={r.confirmada_financeiro}
                            dataConfirmacao={r.data_confirmacao_financeiro}
                          />
                        </td>
                        <td className="text-center whitespace-nowrap">
                          {diasPend != null ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLinhaTempoModal(r);
                              }}
                              className={`tabular-nums text-sm underline-offset-2 hover:underline cursor-pointer ${classeDestaqueDiasPendencia(diasPend, r.status)}`}
                              title="Clique para ver preenchimento, fila, pós-venda e total"
                            >
                              {diasPend}d
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="text-center max-w-[160px]">
                          <Badge variant={sm.variant}>{labelStatusProposta(r.status)}</Badge>
                          {motivoRejeicao && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMotivoRejeicaoView(r);
                              }}
                              className="text-[10px] text-red-700 line-clamp-2 mt-1 text-left leading-snug hover:underline underline-offset-2 w-full"
                              title={`${motivoRejeicao} — clique para ver completo`}
                            >
                              {motivoRejeicao}
                            </button>
                          )}
                        </td>
                        <td className="text-center text-xs whitespace-nowrap">
                          {propostaContratoGerado(r.status) ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              Concluída
                            </span>
                          ) : propostaEmPosVenda(r.status) || r.pos_venda_responsavel_id ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 font-medium text-teal-800">
                                <Headphones className="h-3.5 w-3.5 shrink-0" />
                                {rotuloPosVendaLista(
                                  r.status,
                                  r.pos_venda_user?.nome
                                    || (r.pos_venda_responsavel_id === user?.id ? 'Você' : undefined),
                                )}
                              </span>
                              {formatarTempoPosVenda(r) && (
                                <span className="text-[10px] text-teal-700 tabular-nums">
                                  {formatarTempoPosVenda(r)}
                                </span>
                              )}
                            </div>
                          ) : propostaAguardandoContrato(r.status) ? (
                            <span className="text-amber-700 font-medium">Aguardando</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="text-center whitespace-nowrap">
                           <span className="inline-flex items-center justify-center gap-1.5 text-gray-600 text-xs">
                             <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                             {(r as any).users?.nome || '—'}
                           </span>
                         </td>
                      </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer with Pagination */}
          <div className="px-6 py-4 border-t bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-500">
                      Mostrando <span className="font-medium text-gray-900">{paginated.length}</span> de <span className="font-medium text-gray-900">{filteredOrdenado.length}</span> propostas
                      {modoFilaContrato && filteredOrdenado.length > 0
                        ? ' · ordenadas por maior pendência na fila'
                        : ''}
                      {modoFilaPosVenda && filteredOrdenado.length > 0
                        ? ' · ordenadas por maior tempo em pós-venda'
                        : ''}
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Ver:</span>
                      <select 
                          value={pageSize} 
                          onChange={(e) => setPageSize(Number(e.target.value))}
                          className="text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 py-1"
                      >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={500}>500</option>
                          <option value={1000}>1000</option>
                          <option value={5000}>5000</option>
                      </select>
                  </div>
              </div>

              <div className="flex items-center gap-2">
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(prev => Math.max(1, prev - 1))}
                      disabled={page === 1}
                  >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>
                  <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-gray-900 px-3 py-1 bg-white border rounded-md shadow-sm">
                          {page} / {totalPages || 1}
                      </span>
                  </div>
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={page >= totalPages}
                  >
                      Próximo <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
              </div>
          </div>
        </div>
      )}

      {viewingProposta && (
        <Modal
          isOpen={viewingProposta !== null}
          onClose={() => setViewingProposta(null)}
          title={`Proposta de Venda Nº ${String(viewingProposta.sequencial).padStart(3, '0')}`}
          size="xl"
        >
          <div className="space-y-6">
            {/* Header banner */}
            <div className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white p-5 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-slate-300 font-semibold tracking-wider uppercase block mb-1">
                    Unidade: {viewingProposta.empresas?.nome || 'APex-Plan'}
                  </span>
                  <h4 className="text-xl font-bold text-white flex items-center gap-2">
                    {viewingProposta.contribuinte_nome}
                  </h4>
                  <p className="text-xs text-slate-200 mt-1 font-light">
                    Pedido: {viewingProposta.data_pedido ? new Date(viewingProposta.data_pedido + 'T12:00:00').toLocaleDateString('pt-BR') : new Date(viewingProposta.created_at).toLocaleDateString('pt-BR')} · Vendedor: {viewingProposta.users?.nome || '—'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge variant={PROPOSTA_STATUS_META[normalizarStatusProposta(viewingProposta.status)]?.variant || 'outline'} className="text-sm px-3 py-1 font-semibold uppercase tracking-wider shadow-sm">
                    {labelStatusProposta(viewingProposta.status)}
                  </Badge>
                  <PropostaConfirmacaoBadge
                    status={viewingProposta.status}
                    confirmada={viewingProposta.confirmada_financeiro}
                    dataConfirmacao={viewingProposta.data_confirmacao_financeiro}
                    size="md"
                  />
                  {viewingProposta.pos_venda_responsavel_id && (
                    <span className="text-[10px] text-teal-300 font-semibold flex items-center gap-1 bg-teal-900/40 px-2 py-0.5 rounded-full">
                      <Headphones className="h-3 w-3" />
                      Pós-venda: {viewingProposta.pos_venda_user?.nome || 'Sim'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {normalizarStatusProposta(viewingProposta.status) === PROPOSTA_STATUS.REJEITADA && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
                <p className="text-sm font-bold text-red-900 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Proposta rejeitada
                </p>
                <p className="text-sm text-red-800 whitespace-pre-wrap leading-relaxed">
                  {viewingProposta.motivo_rejeicao?.trim()
                    || viewingProposta.observacoes?.trim()
                    || 'Motivo não registrado (rejeição anterior ao cadastro de motivos).'}
                </p>
                <p className="text-xs text-red-700/80">
                  {viewingProposta.rejeitada_em
                    ? `Em ${new Date(viewingProposta.rejeitada_em).toLocaleString('pt-BR')}`
                    : 'Data da rejeição não registrada'}
                  {viewingProposta.rejeitada_user?.nome
                    ? ` · por ${viewingProposta.rejeitada_user.nome}`
                    : ''}
                </p>
              </div>
            )}

            {/* Grid for sections */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Contribuinte details */}
              <Card className="p-5 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all duration-300 bg-white">
                <h5 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                  <User className="h-4.5 w-4.5 text-indigo-600" />
                  Dados do Contribuinte
                </h5>
                <div className="grid grid-cols-2 gap-y-3.5 gap-x-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Nome Completo</p>
                    <p className="font-semibold text-slate-800 break-words text-base">{viewingProposta.contribuinte_nome}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Documento (CPF/CNPJ)</p>
                    <p className="text-slate-800 font-mono font-medium">{viewingProposta.contribuinte_documento || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">RG</p>
                    <p className="text-slate-800 font-medium">{viewingProposta.contribuinte_rg || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Data de Nascimento</p>
                    <p className="text-slate-800 font-medium">
                      {viewingProposta.contribuinte_data_nascimento 
                        ? new Date(viewingProposta.contribuinte_data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') 
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Estado Civil</p>
                    <p className="text-slate-800 capitalize font-medium">{viewingProposta.contribuinte_estado_civil || '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Naturalidade</p>
                    <p className="text-slate-800 font-medium">
                      {[viewingProposta.contribuinte_naturalidade_cidade, viewingProposta.contribuinte_naturalidade_uf].filter(Boolean).join(' / ') || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Profissão</p>
                    <p className="text-slate-800 font-medium">{viewingProposta.contribuinte_profissao || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Religião</p>
                    <p className="text-slate-800 font-medium">{viewingProposta.contribuinte_religiao || '—'}</p>
                  </div>
                </div>
              </Card>

              {/* Endereço & Contatos */}
              <Card className="p-5 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all duration-300 bg-white">
                <h5 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                  <MapPin className="h-4.5 w-4.5 text-indigo-600" />
                  Contato e Endereço
                </h5>
                <div className="grid grid-cols-2 gap-y-3.5 gap-x-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Endereço Residencial</p>
                    <p className="text-slate-800 leading-relaxed font-medium">{viewingProposta.endereco_residencia || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">CEP</p>
                    <p className="text-slate-800 font-mono font-medium">{viewingProposta.endereco_cep || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Cidade / UF</p>
                    <p className="text-slate-800 font-medium">
                      {[viewingProposta.endereco_cidade, viewingProposta.endereco_uf].filter(Boolean).join(' / ') || '—'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Telefone Principal</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-slate-800 font-mono font-bold text-base">{viewingProposta.telefone_principal || '—'}</span>
                      {viewingProposta.telefone_principal && validarWhatsapp(viewingProposta.telefone_principal) && (
                        <a
                          href={obterUrlWhatsapp(viewingProposta.telefone_principal, `Olá, ${viewingProposta.contribuinte_nome}. Entramos em contato a respeito da proposta de venda.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full transition-colors shadow-sm cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5 shrink-0 text-emerald-500 fill-emerald-500" />
                          Chamar no WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Telefone Alternativo</p>
                    <p className="text-slate-800 font-mono font-medium">{viewingProposta.telefone_alternativo || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">E-mail</p>
                    <p className="text-slate-800 break-all font-medium">{viewingProposta.email || '—'}</p>
                  </div>
                </div>
              </Card>

              {/* Plano comercial & cobrança */}
              <Card className="p-5 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all duration-300 bg-white md:col-span-2">
                <h5 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                  <CreditCard className="h-4.5 w-4.5 text-indigo-600" />
                  Plano Comercial e Cobrança
                </h5>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5">
                    <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Plano Contratado</p>
                    <p className="text-base font-bold text-blue-900">{viewingProposta.planos?.nome || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Taxa de Adesão Recebida</p>
                    <p className="text-base font-bold text-slate-800">{formatCentavos(viewingProposta.taxa_adesao_recebida_centavos)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">1º Vencimento</p>
                    <p className="text-base font-bold text-slate-800">
                      {viewingProposta.primeiro_vencimento 
                        ? new Date(viewingProposta.primeiro_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') 
                        : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Método de Cobrança</p>
                    <p className="text-sm font-bold text-slate-800">{labelMetodoCobranca(viewingProposta.metodo_cobranca)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">1ª parcela paga no ato? (proposta)</p>
                    <p className="text-sm font-bold text-slate-800">{viewingProposta.primeira_parcela_paga_no_ato ? 'Sim' : 'Não'}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Informação do vendedor — não define comissão</p>
                  </div>
                  <div
                    className={`rounded-xl border p-3.5 ${
                      viewingProposta.confirmada_financeiro
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : propostaContratoGerado(viewingProposta.status)
                          ? 'border-amber-200 bg-amber-50/50'
                          : 'border-slate-100 bg-slate-50/50'
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Confirmação (comissão)
                    </p>
                    <PropostaConfirmacaoBadge
                      status={viewingProposta.status}
                      confirmada={viewingProposta.confirmada_financeiro}
                      dataConfirmacao={viewingProposta.data_confirmacao_financeiro}
                      size="md"
                    />
                    {viewingProposta.confirmada_financeiro && viewingProposta.data_confirmacao_financeiro ? (
                      <p className="text-[11px] text-emerald-800 mt-2 font-medium">
                        Baixa no financeiro em{' '}
                        {new Date(viewingProposta.data_confirmacao_financeiro + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    ) : propostaContratoGerado(viewingProposta.status) ? (
                      <p className="text-[11px] text-amber-800 mt-2">
                        Aguardando quitação da 1ª mensalidade no módulo financeiro.
                      </p>
                    ) : null}
                  </div>
                  {viewingProposta.primeira_parcela_paga_no_ato && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5">
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Parcelas Recebidas</p>
                      <p className="text-sm font-bold text-emerald-800">
                        {viewingProposta.parcelas_recebidas_quantidade || 0}x parcela(s) ({formatCentavos(viewingProposta.parcelas_recebidas_total_centavos)})
                      </p>
                    </div>
                  )}
                  
                  {viewingProposta.metodo_cobranca === 'cobrador' && (
                    <div className="col-span-full rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
                      <p className="font-semibold text-indigo-900 flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" /> Endereço do Cobrador
                      </p>
                      <p className="text-xs text-indigo-800">
                        {viewingProposta.cobrador_endereco_mesmo_residencial !== false
                          ? 'Mesmo endereço residencial cadastrado acima.'
                          : `Endereço de cobrança alternativo: ${[
                              viewingProposta.cobrador_endereco_entrega,
                              viewingProposta.cobrador_endereco_cep,
                              viewingProposta.cobrador_endereco_cidade,
                              viewingProposta.cobrador_endereco_uf
                            ].filter(Boolean).join(' - ') || '—'}`
                        }
                      </p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Dependentes section */}
              <Card className="p-5 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all duration-300 bg-white md:col-span-2">
                <h5 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                  <Users className="h-4.5 w-4.5 text-indigo-600" />
                  Dependentes Vinculados ({viewingProposta.dependentes_detalhes?.length || 0})
                </h5>
                {!viewingProposta.dependentes_detalhes || viewingProposta.dependentes_detalhes.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    Nenhum dependente foi adicionado a esta proposta.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Nome</th>
                          <th className="py-2.5 px-3">Parentesco</th>
                          <th className="py-2.5 px-3">CPF</th>
                          <th className="py-2.5 px-3">Data de Nascimento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700 text-slate-700 dark:text-slate-300">
                        {viewingProposta.dependentes_detalhes.map((dep, idx) => (
                          <tr
                            key={`view-dep-${idx}`}
                            className="hover:bg-slate-50/50 dark:hover:bg-slate-800/60 transition-colors"
                          >
                            <td className="py-3 px-3 font-semibold text-slate-400 dark:text-slate-500">{idx + 1}</td>
                            <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">
                              {dep.nome || '—'}
                            </td>
                            <td className="py-3 px-3 capitalize font-medium text-slate-700 dark:text-slate-300">
                              {dep.parentesco || '—'}
                            </td>
                            <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                              {dep.cpf || '—'}
                            </td>
                            <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                              {dep.data_nascimento 
                                ? new Date(dep.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR') 
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Observações & Pós-Venda */}
              <Card className="p-5 border border-slate-100 hover:border-indigo-100 hover:shadow-md transition-all duration-300 bg-white md:col-span-2">
                <h5 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
                  <FileText className="h-4.5 w-4.5 text-indigo-600" />
                  Observações Gerais / Notas Internas
                </h5>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[80px] font-medium">
                  {viewingProposta.observacoes || 'Nenhuma observação interna registrada para esta proposta.'}
                </div>
                {viewingProposta.pos_venda_observacoes && (
                  <div className="mt-4">
                    <h6 className="text-xs font-bold text-teal-800 uppercase tracking-wider mb-2">Histórico do Pós-venda</h6>
                    <div className="bg-teal-50/50 rounded-xl p-4 border border-teal-100 text-sm text-teal-900 leading-relaxed whitespace-pre-wrap font-medium">
                      {viewingProposta.pos_venda_observacoes}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Modal footer buttons */}
            <div className="flex flex-wrap gap-3 justify-end border-t border-slate-100 pt-4">
              <Button
                variant="outline"
                onClick={() => setViewingProposta(null)}
              >
                Fechar
              </Button>
              <Button
                variant="outline"
                onClick={() => { void handleImprimir(viewingProposta); }}
                disabled={processingActionId === viewingProposta.id}
              >
                <Printer className="h-4 w-4 mr-1.5 text-slate-500" />
                {processingActionId === viewingProposta.id ? 'Gerando PDF...' : 'Imprimir PDF'}
              </Button>
              <Button
                variant="outline"
                onClick={() => { void handleWhatsapp(viewingProposta); }}
                disabled={processingActionId === viewingProposta.id}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <Send className="h-4 w-4 mr-1.5 text-emerald-500" />
                {processingActionId === viewingProposta.id ? 'Preparando...' : 'Mandar por WhatsApp'}
              </Button>
              {canGerarContratoProposta && propostaPodeGerarContrato(viewingProposta.status) && (
                <Button
                  className="bg-teal-700 hover:bg-teal-800 text-white"
                  onClick={() => void handleGerarContrato(viewingProposta)}
                  disabled={processingActionId === viewingProposta.id}
                >
                  <FileSignature className="h-4 w-4 mr-1.5" />
                  {processingActionId === viewingProposta.id ? 'Gerando contrato...' : 'Gerar contrato'}
                </Button>
              )}
              {usuarioPodeEditarProposta(viewingProposta) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    navigate(`/venda/propostas/${viewingProposta.id}/editar`);
                    setViewingProposta(null);
                  }}
                >
                  <MessageCircle className="h-4 w-4 mr-1.5" />
                  {propostaEmPosVenda(viewingProposta.status) ? 'Editar (pós-venda)' : 'Editar proposta'}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ContratoGeradoSucessoModal
        info={contratoGeradoInfo}
        onClose={() => setContratoGeradoInfo(null)}
        onToast={(msg, tipo) => showToast(msg, tipo)}
      />

      {rejeitandoProposta && (
        <Modal
          isOpen
          onClose={() => {
            if (processingActionId === rejeitandoProposta.id) return;
            setRejeitandoProposta(null);
            setTextoMotivoRejeicao('');
          }}
          title={`Rejeitar proposta nº ${String(rejeitandoProposta.sequencial).padStart(3, '0')}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Informe o motivo da rejeição de <strong>{rejeitandoProposta.contribuinte_nome}</strong>.
              Esse texto ficará disponível em <strong>Ações → Ver motivo da rejeição</strong>.
            </p>
            <Textarea
              label="Motivo da rejeição *"
              value={textoMotivoRejeicao}
              onChange={(e) => setTextoMotivoRejeicao(e.target.value)}
              rows={4}
              placeholder="Ex.: documentação incompleta, CPF inválido, titular já possui contrato ativo..."
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejeitandoProposta(null);
                  setTextoMotivoRejeicao('');
                }}
                disabled={processingActionId === rejeitandoProposta.id}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => void confirmarRejeicaoProposta()}
                disabled={processingActionId === rejeitandoProposta.id}
              >
                {processingActionId === rejeitandoProposta.id ? 'Rejeitando...' : 'Confirmar rejeição'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {motivoRejeicaoView && (
        <Modal
          isOpen
          onClose={() => setMotivoRejeicaoView(null)}
          title={`Motivo da rejeição — Proposta nº ${String(motivoRejeicaoView.sequencial).padStart(3, '0')}`}
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">{motivoRejeicaoView.contribuinte_nome}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {motivoRejeicaoView.empresas?.nome || '—'} · Vendedor: {motivoRejeicaoView.users?.nome || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Motivo</p>
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-900 whitespace-pre-wrap leading-relaxed min-h-[72px]">
                {motivoRejeicaoView.motivo_rejeicao?.trim()
                  || motivoRejeicaoView.observacoes?.trim()
                  || 'Motivo não registrado (rejeição anterior ao cadastro de motivos).'}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {motivoRejeicaoView.rejeitada_em
                ? `Rejeitada em ${new Date(motivoRejeicaoView.rejeitada_em).toLocaleString('pt-BR')}`
                : 'Data da rejeição não registrada'}
              {motivoRejeicaoView.rejeitada_user?.nome
                ? ` · por ${motivoRejeicaoView.rejeitada_user.nome}`
                : ''}
            </p>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setMotivoRejeicaoView(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {linhaTempoModal && (() => {
        const lt = calcularLinhaTempoProposta(linhaTempoModal);
        const fmtDias = (n: number | null | undefined) => (
          n == null ? '—' : `${n} dia${n === 1 ? '' : 's'}`
        );
        const fmtData = (iso: string | null | undefined) => (
          iso ? formatarDataProposta(iso) : '—'
        );
        return (
          <Modal
            isOpen
            onClose={() => setLinhaTempoModal(null)}
            title={`Linha do tempo — Proposta nº ${String(linhaTempoModal.sequencial).padStart(3, '0')}`}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-900">{linhaTempoModal.contribuinte_nome}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {labelStatusProposta(linhaTempoModal.status)}
                  {lt?.emAndamento ? ' · em andamento' : ''}
                </p>
              </div>

              {!lt ? (
                <p className="text-sm text-slate-500">Não foi possível calcular o tempo desta proposta.</p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Preenchimento
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {fmtData(lt.datas.criacao)}
                          {lt.datas.liberada ? ` → ${fmtData(lt.datas.liberada)}` : ' → em aberto'}
                        </p>
                      </div>
                      <p className="text-lg font-semibold tabular-nums text-slate-900">
                        {fmtDias(lt.diasPreenchimento)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Fila de contrato
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {lt.datas.liberada
                            ? `${fmtData(lt.datas.liberada)} → ${lt.datas.posVenda ? fmtData(lt.datas.posVenda) : (lt.emAndamento && propostaAguardandoContrato(linhaTempoModal.status) ? 'aguardando' : fmtData(lt.datas.encerramento))}`
                            : 'Proposta ainda não liberada'}
                        </p>
                      </div>
                      <p className="text-lg font-semibold tabular-nums text-slate-900">
                        {fmtDias(lt.diasFilaContrato)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider">
                          Pós-venda
                        </p>
                        <p className="text-xs text-violet-600/80 mt-0.5">
                          {lt.datas.posVenda
                            ? `${fmtData(lt.datas.posVenda)} → ${lt.datas.contrato ? fmtData(lt.datas.contrato) : (propostaEmPosVenda(linhaTempoModal.status) ? 'em andamento' : fmtData(lt.datas.encerramento))}`
                            : 'Pós-venda não iniciada'}
                        </p>
                        {linhaTempoModal.pos_venda_user?.nome && (
                          <p className="text-[10px] text-violet-600/70 mt-1">
                            Responsável: {linhaTempoModal.pos_venda_user.nome}
                          </p>
                        )}
                      </div>
                      <p className="text-lg font-semibold tabular-nums text-violet-900">
                        {fmtDias(lt.diasPosVenda)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                          Total até {lt.datas.contrato ? 'contrato gerado' : 'agora'}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {fmtData(lt.datas.criacao)}
                          {' → '}
                          {lt.datas.contrato
                            ? fmtData(lt.datas.contrato)
                            : (lt.emAndamento ? 'em andamento' : fmtData(lt.datas.encerramento))}
                        </p>
                      </div>
                      <p className="text-2xl font-bold tabular-nums text-primary">
                        {fmtDias(lt.diasTotal)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setLinhaTempoModal(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {filterMenuColumn && filterMenuPosition && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => {
              setFilterMenuColumn(null);
              setFilterMenuPosition(undefined);
              setDropdownSearch('');
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: `${filterMenuPosition.y}px`,
              left: `${filterMenuPosition.x}px`,
            }}
            className="z-50 w-64 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 p-3 max-h-80 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-150"
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Filtro: {getFilterColumnLabel(filterMenuColumn)}
              </span>
              {columnFilters[filterMenuColumn].length > 0 && (
                <button
                  onClick={() =>
                    setColumnFilters((prev) => ({
                      ...prev,
                      [filterMenuColumn]: [],
                    }))
                  }
                  className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Popover Local Search */}
            <div className="relative mb-2 shrink-0">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                className="w-full pl-8 pr-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-slate-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Popover Multi-Select Options List */}
            <div className="flex-1 overflow-y-auto space-y-1 py-1 max-h-48 border-t border-gray-100 dark:border-gray-800">
              {getFilteredDropdownOptions(filterMenuColumn, dropdownSearch).length === 0 ? (
                <div className="text-center py-4 text-xs text-gray-400">
                  Nenhuma opção encontrada
                </div>
              ) : (
                getFilteredDropdownOptions(filterMenuColumn, dropdownSearch).map((opt) => {
                  const isChecked = columnFilters[filterMenuColumn].includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer text-xs select-none transition-colors dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleColumnFilter(filterMenuColumn, opt.value)}
                        className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer dark:bg-slate-800"
                      />
                      <span className="truncate">{opt.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
};

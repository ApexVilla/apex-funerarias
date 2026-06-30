import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  User, Phone, Mail, CreditCard, Shield, Users, 
  ChevronRight, Calendar, MapPin, Search, Plus, 
  Trash2, Edit, Check, X, AlertCircle, FileText, XCircle, Copy,
  History, DollarSign, ArrowRight, Printer, RotateCcw, Eye, CalendarClock, Clock,
  MoreHorizontal,
  Info,
  ClipboardList,
  FileSearch,
  Banknote,
  Wallet,
  Crown,
  Pen,
  MessageCircle,
  Truck,
  UserCheck,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { 
  Button, Card, Badge, Input, Select, 
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Label, Textarea
} from '../../components/ui/Components';
import { ClienteProfileSkeleton } from '../../components/ui/Skeletons';
import { useClienteStore, BeneficiarioSB, AssinaturaSB, TimelineEvent } from '../../lib/ClienteStore';
import { useFinanceiro, ContaReceberDetalhada as MensalidadeSB } from '../../lib/FinanceiroStore';
import { dataHojeIsoLocal, formatarDataIsoPtBr, parcelaEstaVencida } from '../../lib/contratoDatas';
import { useToast } from '../../lib/ToastStore';
import { useAuth } from '../../lib/AuthContext';
import { EnviarParaAssinaturaModal } from '../../components/contratos/EnviarParaAssinaturaModal';
import {
  formatarStatusAssinaturaDigital,
  gerarLinkWhatsApp,
  montarLinkAssinaturaDigital,
  resolverStatusResumoAssinaturaDigital,
  obterSignedUrlAssinatura,
} from '../../lib/assinaturaDigitalService';
import { IndicadorAssinaturaDigital } from '../../components/contratos/IndicadorAssinaturaDigital';
import { Modal } from '../../components/ui/Modal';
import { ReceberPagamentoModal } from '../../components/financeiro/ReceberPagamentoModal';
import { DetalhesBaixaParcelaModal } from '../../components/financeiro/DetalhesBaixaParcelaModal';
import { NovaContaReceberModal } from '../../components/financeiro/NovaContaReceberModal';
import { GerenciarEntregaContratoModal } from '../../components/contratos/GerenciarEntregaContratoModal';
import { generateReciboPDF } from '../../lib/ReciboService';
import { ClientePendenciasCadastro } from '../../components/clientes/ClientePendenciasCadastro';
import { PendenciasCadastroContratoView } from '../../components/clientes/PendenciasCadastroContratoView';
import { ContratoCobrancaView } from '../../components/clientes/ContratoCobrancaView';
import { ContratoCarteirinhaView } from '../../components/clientes/ContratoCarteirinhaView';
import { ContratoVendaView } from '../../components/clientes/ContratoVendaView';
import { calcularCompletudeCadastroCliente } from '../../lib/clienteCompletudeCadastro';
import {
  normalizarContratoSelecionadoId,
  resolverContratoPrincipal,
} from '../../lib/clienteContratoFormLoad';
import {
  buscarNomeVendedorContrato,
  imprimirContratoLocal,
  resolvePlanoContratoAssinatura,
} from '../../lib/ContratoAssinaturaService';
import { carregarBeneficiariosDoContrato, filtrarBeneficiariosContrato } from '../../lib/contratoAtendimentoService';
import { buildFichaCadastroPdfBlob } from '../../lib/FichaCadastroService';
import { downloadPdfBlob, printPdfBlob } from '../../lib/printPdfBlob';
import { CobradorCarteiraClientePanel } from '../../components/cobradores/CobradorCarteiraClientePanel';
import { bairroCobrancaCliente } from '../../lib/cobradorSugestaoBairro';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { ParcelasPorAnoAccordion } from '../../components/clientes/ParcelasPorAnoAccordion';
import {
  BeneficiarioCarenciaInfo,
  BeneficiarioCarenciaPreview,
} from '../../components/clientes/BeneficiarioCarenciaInfo';
import {
  ContratoDependentesPanel,
  filtrarBeneficiariosDoContrato,
} from '../../components/clientes/ContratoDependentesPanel';
import { ParentescoDependenteSelect } from '../../components/clientes/ParentescoDependenteSelect';
import {
  labelParentescoDependente,
  normalizarParentescoDependente,
} from '../../lib/parentescoDependente';
import {
  CARENCIA_DEPENDENTE_PADRAO_DIAS,
  calcularStatusCarenciaDependente,
  limitesDataFiliacaoDependente,
  mensagemLimiteDataFiliacaoDependente,
} from '../../lib/beneficiarioCarencia';
import { promoverBeneficiarioTitular } from '../../lib/promoverBeneficiarioTitularService';
import {
  beneficiarioEstaFalecido,
  labelFalecimentoBeneficiario,
  registrarFalecimentoBeneficiario,
} from '../../lib/beneficiarioFalecimento';
import {
  sincronizarParcelasAssinatura,
  sincronizarParcelasCliente,
} from '../../lib/mensalidadesAssinatura';
import {
  avaliarInerciaAssinatura,
  INERCIA_MESES_SEM_EVENTO,
  reativarContratoInercia,
  resumoInerciaContrato,
} from '../../lib/inerciaContrato';
import { reiniciarCobrancaMigracaoAssinatura } from '../../lib/cobrancaMigracao';
import {
  auditDiffCampos,
  carregarLinhasBaixasParcelasCliente,
  carregarEstornosBaixasParcelasCliente,
  mapEstornosParcelasTimeline,
  mesclarMapasEstornoParcela,
  montarLinhasAuditoriaCliente,
  type EstornoParcelaInfo,
  type LinhaAuditoriaCliente,
} from '../../lib/clienteAuditoria';

type TabKey =
  | 'geral'
  | 'contratos'
  | 'pendencias'
  | 'financeiro'
  | 'venda'
  | 'cobranca'
  | 'carteirinha'
  | 'beneficiarios'
  | 'documentos'
  | 'timeline'
  | 'auditoria';

interface TabItem {
  key: TabKey;
  label: string;
  icon: any;
}

const TABS: TabItem[] = [
  { key: 'geral', label: 'Visão Geral', icon: User },
  { key: 'contratos', label: 'Contratos', icon: Shield },
  { key: 'pendencias', label: 'Dados pendentes', icon: ClipboardList },
  { key: 'financeiro', label: 'Financeiro', icon: CreditCard },
  { key: 'venda', label: 'Venda', icon: DollarSign },
  { key: 'cobranca', label: 'Cobrança', icon: Banknote },
  { key: 'carteirinha', label: 'Carteirinha', icon: Wallet },
  { key: 'beneficiarios', label: 'Beneficiários', icon: Users },
  { key: 'timeline', label: 'Timeline', icon: History },
  { key: 'auditoria', label: 'Auditoria', icon: Shield },
  { key: 'documentos', label: 'Documentos', icon: FileText },
];

const valorMensalAssinatura = (a: AssinaturaSB) => a.valor_mensal_centavos ?? 0;

const VendedorClienteNome: React.FC<{ vendedorId: string }> = ({ vendedorId }) => {
  const [nome, setNome] = useState('');
  useEffect(() => {
    let cancel = false;
    supabase
      .from('users')
      .select('nome')
      .eq('id', vendedorId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancel && data?.nome) setNome(String(data.nome));
      });
    return () => {
      cancel = true;
    };
  }, [vendedorId]);
  if (!nome) return null;
  return <span className="block">Vendedor responsável: {nome}</span>;
};

const PlanoContratoBadge: React.FC<{ assinatura: AssinaturaSB }> = ({ assinatura }) => {
  const plano = resolvePlanoContratoAssinatura(assinatura);
  const variant =
    plano.tipo === 'onix' ? 'bg-slate-800 text-white border-slate-700' : 'bg-amber-500 text-white border-amber-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${variant}`}>
      {plano.sigla}
    </span>
  );
};

const timelineQuando = (log: TimelineEvent) =>
  log.data_evento || log.created_at || '';

const rotuloTipoTimeline = (tipo: string): string => {
  const t = (tipo || '').toLowerCase();
  const map: Record<string, string> = {
    auditoria: 'Auditoria',
    cadastro: 'Cadastro',
    beneficiario_inclusao: 'Dependente incluído',
    beneficiario_exclusao: 'Dependente excluído',
    status: 'Status',
    alteracao: 'Alteração',
    sinistro: 'Sinistro',
    contrato: 'Contrato',
  };
  return map[t] || tipo.replace(/_/g, ' ');
};

const timelineVisivel = (event: TimelineEvent): boolean =>
  (event.tipo_evento || '').toUpperCase() !== 'ALTERACAO_SISTEMA';

const auditUsuarioNome = (
  log: TimelineEvent | undefined,
  usuarioAtual?: { nome?: string; id?: string } | null,
  autoresPorId?: Record<string, string>,
) => {
  if (!log) return 'Sistema';
  if (log.autor?.nome) return log.autor.nome;
  if (log.criado_por && autoresPorId?.[log.criado_por]) return autoresPorId[log.criado_por];
  if (log.criado_por && usuarioAtual?.id === log.criado_por && usuarioAtual.nome) return usuarioAtual.nome;
  if (log.criado_por) return `Usuário ${log.criado_por.slice(0, 8)}`;
  return 'Sistema';
};

const auditModuloLabel = (log?: TimelineEvent, moduloPadrao = 'Contratos'): string => {
  if (!log) return moduloPadrao;
  const categoria = String(log.categoria || '').toLowerCase();
  const referencia = String(log.referencia_tipo || '').toLowerCase();
  const tipo = String(log.tipo_evento || '').toLowerCase();
  const titulo = String(log.titulo || '').toLowerCase();

  if (categoria === 'parcela' || referencia === 'conta_receber' || tipo.includes('financeiro') || tipo.includes('parcela')) {
    return 'Financeiro';
  }
  if (
    categoria === 'contrato' ||
    referencia === 'assinatura' ||
    tipo.includes('contrato') ||
    titulo.includes('contrato')
  ) {
    return 'Contratos';
  }
  if (categoria === 'beneficiario' || referencia === 'beneficiario' || tipo.includes('beneficiario') || tipo.includes('dependente')) {
    return 'Beneficiários';
  }
  if (tipo.includes('cobranca') || titulo.includes('cobran')) return 'Cobrança';
  if (tipo.includes('carteirinha') || titulo.includes('carteirinha')) return 'Carteirinha';
  if (tipo.includes('documento') || titulo.includes('documento')) return 'Documentos';
  if (tipo.includes('venda') || tipo.includes('proposta') || titulo.includes('venda')) return 'Venda';
  return moduloPadrao;
};

function AuditoriaClienteTabela({
  linhas,
  usuarioAtual,
  autoresPorId,
  moduloPadrao,
  titulo,
  subtitulo,
  vazio,
}: {
  linhas: LinhaAuditoriaCliente[];
  usuarioAtual?: { nome?: string; id?: string; email?: string } | null;
  autoresPorId?: Record<string, string>;
  moduloPadrao?: string;
  titulo: string;
  subtitulo: string;
  vazio: string;
}) {
  const ITENS_POR_PAGINA = 12;
  const [pagina, setPagina] = useState(1);

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const linhasPagina = linhas.slice(inicio, inicio + ITENS_POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [linhas.length, titulo]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 dark:border-slate-800">
        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm uppercase tracking-wider">
          <Shield className="h-4 w-4 text-blue-600" /> {titulo}
        </h3>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{subtitulo}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100/50 text-gray-500 dark:text-slate-400 border-b uppercase text-[10px] font-black tracking-widest">
              <th className="px-6 py-4 text-left">Data/Hora</th>
              <th className="px-6 py-4 text-left">Responsável</th>
              <th className="px-6 py-4 text-left">Módulo</th>
              <th className="px-6 py-4 text-left">Ação</th>
              <th className="px-6 py-4 text-left">Descrição</th>
              <th className="px-6 py-4 text-left">Alterações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhasPagina.map((linha) => {
              const log = linha.log;
              const diffs = log ? auditDiffCampos(log) : [];
              const responsavel = auditUsuarioNome(log, usuarioAtual, autoresPorId);
              const modulo = auditModuloLabel(log, moduloPadrao || 'Contratos');
              return (
                <tr key={linha.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-gray-600 dark:text-slate-300 whitespace-nowrap font-medium text-xs">
                    {linha.quando ? new Date(linha.quando).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      <Badge variant="default" className="bg-blue-50 text-blue-700 border-blue-100 w-fit">
                        {responsavel}
                      </Badge>
                      {log?.autor?.email && (
                        <span className="text-[10px] text-gray-400">{log.autor.email}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="default" className="bg-slate-50 text-slate-700 border-slate-200">
                      {modulo}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 rounded text-[10px] font-bold uppercase text-gray-600 dark:text-slate-300">
                      {linha.acao}
                    </span>
                    {linha.categoria === 'beneficiario' && (
                      <p className="text-[10px] text-gray-400 mt-1">Dependente</p>
                    )}
                    {linha.categoria === 'parcela' && (
                      <p className="text-[10px] text-gray-400 mt-1">Parcela</p>
                    )}
                    {linha.contratoCodigo && (
                      <p className="text-[10px] text-gray-400 mt-1">Contrato {linha.contratoCodigo}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-900 dark:text-white font-medium max-w-md">
                    <p className="font-bold text-xs">{linha.titulo}</p>
                    {linha.descricao ? <p className="text-xs text-gray-600 dark:text-slate-300">{linha.descricao}</p> : null}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {diffs.length > 0 ? (
                        diffs.map((d) => (
                          <div key={d.campo} className="flex items-center gap-2 text-[10px] whitespace-nowrap">
                            <span className="font-bold text-gray-500 dark:text-slate-400">{d.campo}:</span>
                            <span className="text-rose-500 line-through">{d.de}</span>
                            <span className="text-emerald-600 font-medium">{d.para}</span>
                          </div>
                        ))
                      ) : linha.descricao ? (
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">{linha.descricao}</span>
                      ) : (
                        <span className="text-gray-300 italic text-[10px]">Nenhum detalhe registrado</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                  {vazio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {linhas.length > 0 && (
        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between text-xs text-gray-600 dark:text-slate-300">
          <span>
            Página {paginaAtual} de {totalPaginas} • {linhas.length} registro(s)
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function resumoParcelas(parcelas: MensalidadeSB[]) {
  const pagas = parcelas.filter((m) => m.status === 'pago');
  const vencidas = parcelas.filter(
    (m) => m.status === 'vencido' || parcelaEstaVencida(m.data_vencimento, m.status),
  );
  const pendentes = parcelas.filter((m) => {
    const s = (m.status || '').toLowerCase();
    return ['aberto', 'pendente'].includes(s) && !parcelaEstaVencida(m.data_vencimento, m.status);
  });
  const totalPagoCentavos = pagas.reduce(
    (acc, m) => acc + (m.valor_pago_centavos || m.valor_original_centavos || 0),
    0,
  );
  return {
    qtdPagas: pagas.length,
    qtdVencidas: vencidas.length,
    qtdPendentes: pendentes.length,
    totalPagoCentavos,
  };
}

function mesesDesdeContrato(dataContratacao?: string, createdAt?: string): string {
  const iso = (dataContratacao || createdAt || '').slice(0, 10);
  if (!iso) return '—';
  const inicio = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(inicio.getTime())) return '—';
  const agora = new Date();
  let meses = (agora.getFullYear() - inicio.getFullYear()) * 12 + (agora.getMonth() - inicio.getMonth());
  if (agora.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 1) return '< 1 mês';
  return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

export const ClienteProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { user, empresa } = useAuth();
  
  const { 
    clienteAtivo, 
    loadClienteById, 
    beneficiarios, 
    loadBeneficiarios,
    assinaturas,
    loadAssinaturas,
    createBeneficiario,
    updateBeneficiario,
    deleteBeneficiario,
    timeline,
    loadTimeline,
    createTimelineEvent
  } = useClienteStore();

  const { estornarContaReceber, prorrogarContaReceber, gerarMensalidadesMes, excluirContaReceber } = useFinanceiro();
  const { empresaIdEfetivo } = useEmpresaContextoAtivo();

  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const [contratosSubAba, setContratosSubAba] = useState<'lista' | 'auditoria'>('lista');
  const [loading, setLoading] = useState(true);
  const [mensalidades, setMensalidades] = useState<MensalidadeSB[]>([]);
  const [linhasBaixasAuditoria, setLinhasBaixasAuditoria] = useState<LinhaAuditoriaCliente[]>([]);
  const [assinaturasDigitais, setAssinaturasDigitais] = useState<any[]>([]);
  const [assinaturaDigitalContrato, setAssinaturaDigitalContrato] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('todas');
  const [contratoFilter, setContratoFilter] = useState<string>('todos');
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState<string>('todos');
  const [autoresAuditoriaPorId, setAutoresAuditoriaPorId] = useState<Record<string, string>>({});
  const [estornosBaixasPorParcela, setEstornosBaixasPorParcela] = useState<
    Map<string, EstornoParcelaInfo>
  >(() => new Map());

  // Modals state
  const [isEditBeneficiarioOpen, setIsEditBeneficiarioOpen] = useState(false);
  const [editingBeneficiario, setEditingBeneficiario] = useState<BeneficiarioSB | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [beneficiarioToDelete, setBeneficiarioToDelete] = useState<string | null>(null);
  const [parcelaSelecionadaId, setParcelaSelecionadaId] = useState<string | null>(null);
  const [openParcelaMenuId, setOpenParcelaMenuId] = useState<string | null>(null);
  const [parcelaMenuPosition, setParcelaMenuPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [showReceberModal, setShowReceberModal] = useState(false);
  const [contaParaReceber, setContaParaReceber] = useState<MensalidadeSB | null>(null);
  const [parcelaDetalheBaixa, setParcelaDetalheBaixa] = useState<MensalidadeSB | null>(null);
  const [showProrrogarModal, setShowProrrogarModal] = useState(false);
  const [parcelaParaProrrogar, setParcelaParaProrrogar] = useState<MensalidadeSB | null>(null);
  const [novaDataProrrogacao, setNovaDataProrrogacao] = useState('');
  const [motivoProrrogacao, setMotivoProrrogacao] = useState('');
  const [salvandoProrrogacao, setSalvandoProrrogacao] = useState(false);
  const [isAddBeneficiarioOpen, setIsAddBeneficiarioOpen] = useState(false);
  const [contratoParaDependente, setContratoParaDependente] = useState<AssinaturaSB | null>(null);
  const [savingBeneficiario, setSavingBeneficiario] = useState(false);
  const [novoBeneficiario, setNovoBeneficiario] = useState({
    nome: '',
    cpf: '',
    parentesco: 'filho',
    data_nascimento: '',
    rg_numero: '',
    data_inclusao: new Date().toISOString().slice(0, 10),
  });
  const [isPromoverTitularOpen, setIsPromoverTitularOpen] = useState(false);
  const [beneficiarioPromover, setBeneficiarioPromover] = useState<BeneficiarioSB | null>(null);

  // Delivery confirmation states
  const [editingEntregaContratoId, setEditingEntregaContratoId] = useState<string | null>(null);
  const [entregaPara, setEntregaPara] = useState('');
  const [entregaRecebedor, setEntregaRecebedor] = useState('');
  const [entregaData, setEntregaData] = useState('');
  const [salvandoEntrega, setSalvandoEntrega] = useState(false);
  const [showNovaParcelaModal, setShowNovaParcelaModal] = useState(false);
  const [contratoEntregaModal, setContratoEntregaModal] = useState<AssinaturaSB | null>(null);
  const [motivoPromoverTitular, setMotivoPromoverTitular] = useState('Falecimento do titular');
  const [registrarExTitular, setRegistrarExTitular] = useState(true);
  const [promovendoTitular, setPromovendoTitular] = useState(false);
  const [isObitoBeneficiarioOpen, setIsObitoBeneficiarioOpen] = useState(false);
  const [beneficiarioObito, setBeneficiarioObito] = useState<BeneficiarioSB | null>(null);
  const [dataObitoBeneficiario, setDataObitoBeneficiario] = useState('');
  const [motivoObitoBeneficiario, setMotivoObitoBeneficiario] = useState('');
  const [registrandoObito, setRegistrandoObito] = useState(false);
  const [isMigracaoCobrancaOpen, setIsMigracaoCobrancaOpen] = useState(false);
  const [reiniciandoCobrancaMigracao, setReiniciandoCobrancaMigracao] = useState(false);
  const [reativandoInerciaContratoId, setReativandoInerciaContratoId] = useState<string | null>(null);
  const inerciaAvaliadaNaAbaRef = useRef('');

  const contratoAtivo = useMemo(
    () => assinaturas.find((a) => a.status === 'ativo') || assinaturas[0] || null,
    [assinaturas],
  );

  const contratoRefDependente = contratoParaDependente || contratoAtivo;

  const dataContratoRefDependente = useMemo(
    () =>
      (contratoRefDependente?.data_contratacao || contratoRefDependente?.created_at || '').slice(
        0,
        10,
      ),
    [contratoRefDependente?.data_contratacao, contratoRefDependente?.created_at],
  );

  const dependentePodeVirarTitular = useCallback((b: BeneficiarioSB) => {
    if (b.ativo === false) return false;
    const parentesco = (b.parentesco || '').toLowerCase();
    if (parentesco.includes('ex-titular')) return false;
    return !!contratoAtivo && contratoAtivo.status === 'ativo';
  }, [contratoAtivo]);

  const abrirRegistrarObito = (b: BeneficiarioSB) => {
    if (beneficiarioEstaFalecido(b)) {
      showToast(labelFalecimentoBeneficiario(b) || 'Este dependente já está registrado como falecido.', 'info');
      return;
    }
    setBeneficiarioObito(b);
    setDataObitoBeneficiario(new Date().toISOString().slice(0, 10));
    setMotivoObitoBeneficiario('');
    setIsObitoBeneficiarioOpen(true);
  };

  const handleConfirmarObitoBeneficiario = async () => {
    if (!beneficiarioObito || !id) return;
    setRegistrandoObito(true);
    try {
      const result = await registrarFalecimentoBeneficiario({
        beneficiarioId: beneficiarioObito.id,
        dataFalecimento: dataObitoBeneficiario,
        motivo: motivoObitoBeneficiario,
        origem: 'manual',
      });
      if (result.ok === false) {
        showToast(result.error, 'error');
        return;
      }
      showToast(
        result.jaRegistrado
          ? `${beneficiarioObito.nome} já constava como falecido no sistema.`
          : `Óbito de ${beneficiarioObito.nome} registrado. Dependente baixado no plano.`,
        result.jaRegistrado ? 'info' : 'success',
      );
      setIsObitoBeneficiarioOpen(false);
      setBeneficiarioObito(null);
      await Promise.all([loadBeneficiarios(id), loadTimeline(id)]);
    } finally {
      setRegistrandoObito(false);
    }
  };

  const abrirPromoverTitular = (b: BeneficiarioSB) => {
    if (!dependentePodeVirarTitular(b)) {
      showToast('Só é possível promover dependente ativo em contrato ativo.', 'warning');
      return;
    }
    setBeneficiarioPromover(b);
    setMotivoPromoverTitular('Falecimento do titular');
    setRegistrarExTitular(true);
    setIsPromoverTitularOpen(true);
  };

  const diasCarenciaDependente = useMemo(
    () => contratoRefDependente?.plano_carencia_dependente_dias ?? CARENCIA_DEPENDENTE_PADRAO_DIAS,
    [contratoRefDependente?.plano_carencia_dependente_dias],
  );

  const limitesFiliacaoDependente = useMemo(
    () => limitesDataFiliacaoDependente(dataContratoRefDependente),
    [dataContratoRefDependente],
  );

  const abrirModalDependente = (contrato?: AssinaturaSB | null) => {
    const alvo = contrato || contratoAtivo;
    if (!alvo) {
      showToast('Cadastre um contrato ativo antes de incluir dependentes.', 'warning');
      return;
    }
    if (alvo.status !== 'ativo') {
      showToast('Só é possível incluir dependentes em contrato ativo.', 'warning');
      return;
    }
    if (alvo.em_inercia) {
      showToast(
        'Contrato em inércia: ao incluir o dependente, o plano será reativado e voltará a gerar mensalidades.',
        'info',
      );
    }
    setContratoParaDependente(alvo);
    const dataCtr = (alvo.data_contratacao || alvo.created_at || '').slice(0, 10);
    setNovoBeneficiario({
      nome: '',
      cpf: '',
      parentesco: 'filho',
      data_nascimento: '',
      rg_numero: '',
      data_inclusao: dataCtr || dataHojeIsoLocal(),
    });
    setIsAddBeneficiarioOpen(true);
  };

  const dataInclusaoBeneficiario = (b: BeneficiarioSB) =>
    (b.data_inclusao || b.created_at || '').slice(0, 10);

  const diasCarenciaDoBeneficiario = (b: BeneficiarioSB) => {
    const ctr = assinaturas.find((a) => a.id === b.assinatura_id) || contratoAtivo;
    return ctr?.plano_carencia_dependente_dias ?? CARENCIA_DEPENDENTE_PADRAO_DIAS;
  };

  const resolverNomeAutor = useCallback(
    (criadoPor: string | undefined | null) => {
      if (!criadoPor) return null;
      if (autoresAuditoriaPorId[criadoPor]) return autoresAuditoriaPorId[criadoPor];
      if (user?.id === criadoPor && user.nome) return user.nome;
      return null;
    },
    [autoresAuditoriaPorId, user?.id, user?.nome],
  );

  const estornosPorParcelaId = useMemo(
    () =>
      mesclarMapasEstornoParcela(
        mapEstornosParcelasTimeline(timeline, resolverNomeAutor),
        estornosBaixasPorParcela,
      ),
    [timeline, estornosBaixasPorParcela, resolverNomeAutor],
  );

  const carregarEstornosParcelas = useCallback(async () => {
    if (!id) return;
    const mapa = await carregarEstornosBaixasParcelasCliente(id);
    setEstornosBaixasPorParcela(mapa);
  }, [id]);

  const linhasAuditoriaContratos = useMemo(
    () =>
      montarLinhasAuditoriaCliente(timeline, assinaturas, {
        somenteContratos: true,
        parcelas: mensalidades,
        linhasExtras: linhasBaixasAuditoria,
      }),
    [timeline, assinaturas, mensalidades, linhasBaixasAuditoria],
  );

  const linhasAuditoriaGeral = useMemo(
    () =>
      montarLinhasAuditoriaCliente(timeline, assinaturas, {
        parcelas: mensalidades,
        linhasExtras: linhasBaixasAuditoria,
      }),
    [timeline, assinaturas, mensalidades, linhasBaixasAuditoria],
  );

  const isProfessional = true;
  const visibleTabs = TABS;

  const fetchMensalidadesLocais = async (clienteId: string) => {
    const { data, error } = await supabase
      .from('fin_contas_receber')
      .select(`
        *,
        assinatura:assinatura_id (
          plano:plano_id (
            nome
          )
        ),
        forma_pagamento:forma_pagamento_id (
          nome,
          tipo
        )
      `)
      .eq('cliente_id', clienteId)
      .is('deleted_at', null)
      .order('data_vencimento', { ascending: true });
    
    if (error) throw error;
    
    const mappedData = (data || []).map((m) => {
      const row = m as Record<string, unknown> & {
        assinatura?: { plano?: { nome?: string } };
        forma_pagamento?: { nome?: string; tipo?: string } | null;
      };
      const fp = row.forma_pagamento;
      const metodo =
        (fp?.nome || fp?.tipo || '').trim().toUpperCase() || null;
      return {
        ...m,
        plano_nome: row.assinatura?.plano?.nome || null,
        metodo_pagamento: metodo,
      };
    });

    return mappedData as MensalidadeSB[];
  };

  const fetchAssinaturasDigitaisLocais = async (clienteId: string) => {
    try {
      const { data, error } = await supabase
        .from('contratos_assinaturas_digitais')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('[ClienteProfile] erro ao carregar assinaturas digitais:', e);
      return [];
    }
  };

  const recarregarAssinaturasDigitais = useCallback(async () => {
    if (!id) return;
    const sigs = await fetchAssinaturasDigitaisLocais(id);
    setAssinaturasDigitais(sigs);
  }, [id]);

  useEffect(() => {
    if (id) {
      const fetchData = async () => {
        setLoading(true);
        try {
          await loadClienteById(id);
          if (isProfessional) {
            await Promise.all([
              loadAssinaturas(id),
              loadBeneficiarios(id),
              loadTimeline(id)
            ]);
            const [m, sigs] = await Promise.all([
              fetchMensalidadesLocais(id),
              fetchAssinaturasDigitaisLocais(id)
            ]);
            setMensalidades(m);
            setAssinaturasDigitais(sigs);
          }
        } catch (error) {
          console.error('Error loading client data:', error);
          showToast('Erro ao carregar dados do cliente.', 'error');
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [id, isProfessional]);

  useEffect(() => {
    const tab = searchParams.get('tab') as TabKey;
    if (tab && visibleTabs.some(t => t.key === tab)) {
      setActiveTab(tab);
    }
    if (searchParams.get('sub') === 'auditoria' && tab === 'contratos') {
      setContratosSubAba('auditoria');
    }
  }, [searchParams, visibleTabs]);

  const recarregarAuditoria = useCallback(async () => {
    if (!id) return;
    await loadTimeline(id);
    const baixas = await carregarLinhasBaixasParcelasCliente(id, assinaturas);
    setLinhasBaixasAuditoria(baixas);
  }, [id, assinaturas, loadTimeline]);

  useEffect(() => {
    if (activeTab === 'financeiro' && id) {
      void loadTimeline(id);
      void carregarEstornosParcelas();
    }
  }, [activeTab, id, loadTimeline, carregarEstornosParcelas]);

  useEffect(() => {
    if ((activeTab === 'auditoria' || contratosSubAba === 'auditoria') && id) {
      void recarregarAuditoria();
    }
  }, [activeTab, contratosSubAba, id, recarregarAuditoria]);

  useEffect(() => {
    const onFinUpdate = () => {
      if (!id) return;
      if (activeTab === 'financeiro') {
        void loadTimeline(id);
        void carregarEstornosParcelas();
      }
      if (activeTab === 'auditoria' || contratosSubAba === 'auditoria') {
        void recarregarAuditoria();
      }
    };
    window.addEventListener('fin-contas-receber-updated', onFinUpdate);
    return () => window.removeEventListener('fin-contas-receber-updated', onFinUpdate);
  }, [id, activeTab, contratosSubAba, recarregarAuditoria, loadTimeline, carregarEstornosParcelas]);

  useEffect(() => {
    const ids = Array.from(
      new Set(
        timeline
          .map((t) => t.criado_por)
          .filter((v): v is string => !!v)
          .filter((uid) => !autoresAuditoriaPorId[uid] && !timeline.find((t) => t.criado_por === uid && t.autor?.nome)),
      ),
    );
    if (ids.length === 0) return;
    let cancel = false;
    void (async () => {
      const { data, error } = await supabase.from('users').select('id, nome').in('id', ids);
      if (cancel || error || !data) return;
      const novos: Record<string, string> = {};
      for (const row of data as Array<{ id: string; nome?: string | null }>) {
        if (row.id && row.nome) novos[row.id] = row.nome;
      }
      if (Object.keys(novos).length > 0) {
        setAutoresAuditoriaPorId((prev) => ({ ...prev, ...novos }));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [timeline, autoresAuditoriaPorId]);

  useEffect(() => {
    const fecharMenus = () => {
      if (openParcelaMenuId) setOpenParcelaMenuId(null);
    };
    window.addEventListener('scroll', fecharMenus, true);
    window.addEventListener('resize', fecharMenus);
    return () => {
      window.removeEventListener('scroll', fecharMenus, true);
      window.removeEventListener('resize', fecharMenus);
    };
  }, [openParcelaMenuId]);

  const recarregarMensalidades = useCallback(async () => {
    if (!id) return;
    const m = await fetchMensalidadesLocais(id);
    setMensalidades(m);
  }, [id]);

  const recarregarDadosContrato = useCallback(async () => {
    if (!id) return;
    await Promise.all([
      loadAssinaturas(id),
      loadBeneficiarios(id),
      recarregarMensalidades(),
      recarregarAuditoria(),
    ]);
  }, [id, loadAssinaturas, loadBeneficiarios, recarregarAuditoria]);

  const enriquecerParcela = (m: MensalidadeSB): MensalidadeSB => ({
    ...m,
    cliente_nome: m.cliente_nome || clienteAtivo?.nome || '',
    dias_atraso: m.dias_atraso ?? 0,
  });

  const parcelaEmMenu = useMemo(
    () => mensalidades.find((m) => m.id === openParcelaMenuId) ?? null,
    [mensalidades, openParcelaMenuId],
  );

  const abrirMenuParcela = (m: MensalidadeSB, event: React.MouseEvent) => {
    event.preventDefault();
    setParcelaSelecionadaId(m.id);
    setParcelaMenuPosition({ x: event.clientX, y: event.clientY });
    setOpenParcelaMenuId(m.id);
  };

  const handleClickParcela = (m: MensalidadeSB, event: React.MouseEvent) => {
    if (parcelaSelecionadaId === m.id) {
      abrirMenuParcela(m, event);
    } else {
      setParcelaSelecionadaId(m.id);
      setOpenParcelaMenuId(null);
    }
  };

  const podeReceberParcela = (status?: string) => {
    const s = (status || '').toLowerCase();
    return ['aberto', 'vencido', 'pago_parcial', 'pendente'].includes(s);
  };

  const handleReceberParcela = (mensalidade: MensalidadeSB) => {
    setContaParaReceber(enriquecerParcela(mensalidade));
    setShowReceberModal(true);
  };

  const handlePaymentSuccess = async () => {
    setShowReceberModal(false);
    const assinaturaId = contaParaReceber?.assinatura_id;
    setContaParaReceber(null);
    showToast('Pagamento registrado com sucesso!', 'success');
    try {
      if (assinaturaId) {
        const geradas = await sincronizarParcelasAssinatura(assinaturaId, gerarMensalidadesMes);
        if (geradas > 0) {
          showToast(`${geradas} nova(s) parcela(s) gerada(s) automaticamente.`, 'info');
        }
      }
    } catch (e) {
      console.warn('[ClienteProfile] sincronizar parcelas após pagamento:', e);
    }
    await recarregarMensalidades();
    if (id) await recarregarAuditoria();
  };

  const handleImprimirContrato = async (assinatura: AssinaturaSB) => {
    if (!clienteAtivo || !id) {
      showToast('Dados do cliente não carregados.', 'error');
      return;
    }
    try {
      const deps = await carregarBeneficiariosDoContrato(id, assinatura.id);
      const vendedorNome = await buscarNomeVendedorContrato(assinatura, clienteAtivo);
      await imprimirContratoLocal(clienteAtivo, assinatura, deps, vendedorNome);
      showToast(
        deps.length > 0
          ? `Contrato enviado para impressão com ${deps.length} dependente(s).`
          : 'Contrato enviado para impressão (sem dependentes cadastrados).',
        'success',
      );
    } catch {
      showToast('Não foi possível gerar o contrato.', 'error');
    }
  };

  const handleImprimirFicha = async () => {
    if (!clienteAtivo || !id) {
      showToast('Dados do cliente não carregados.', 'error');
      return;
    }
    try {
      const [assinaturasRes, deps, parcelasRes] = await Promise.all([
        supabase
          .from('assinaturas')
          .select('*')
          .eq('cliente_id', id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        carregarBeneficiariosDoContrato(id),
        supabase
          .from('fin_contas_receber')
          .select('assinatura_id, status, data_pagamento, valor_pago_centavos, data_vencimento')
          .eq('cliente_id', id)
          .is('deleted_at', null)
          .order('data_vencimento', { ascending: true }),
      ]);

      if (assinaturasRes.error) throw assinaturasRes.error;
      if (parcelasRes.error) throw parcelasRes.error;

      const blob = buildFichaCadastroPdfBlob({
        cliente: clienteAtivo,
        assinaturas: (assinaturasRes.data || assinaturas) as AssinaturaSB[],
        beneficiarios: deps,
        parcelas: parcelasRes.data || [],
        empresaNome: empresa?.nome || 'FENIX FUNERÁRIA',
        empresaCnpj: empresa?.cnpj || '03.617.822/0002-95',
        unidadeNome: empresa?.nome || undefined,
      });

      const matricula = clienteAtivo.codigo || id.slice(0, 8);
      const ok = printPdfBlob(blob, 'Ficha de cadastro');
      if (!ok) {
        downloadPdfBlob(blob, `ficha-cadastro-${matricula}.pdf`);
        showToast('Não foi possível abrir a impressão. O PDF foi baixado.', 'warning');
        return;
      }
      showToast('Ficha de cadastro enviada para impressão.', 'success');
    } catch (err) {
      console.error('[handleImprimirFicha]', err);
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : '';
      showToast(
        msg ? `Erro ao gerar ficha: ${msg}` : 'Erro ao gerar ficha para impressão.',
        'error',
      );
    }
  };

  const handleCopiarDados = () => {
    if (!clienteAtivo) return;
    const statusLabel = clienteAtivo.status || (clienteAtivo as any).status_assinatura;
    const info = [
      `Nome: ${clienteAtivo.nome}`,
      `CPF: ${clienteAtivo.cpf_formatado || clienteAtivo.cpf || 'Não informado'}`,
      `Telefone: ${clienteAtivo.telefone_principal || 'Não informado'}`,
      clienteAtivo.telefone_secundario ? `Telefone 2: ${clienteAtivo.telefone_secundario}` : null,
      `E-mail: ${clienteAtivo.email || 'Não informado'}`,
      contratoPrincipal?.codigo ? `Contrato: ${contratoPrincipal.codigo}` : null,
      `Status: ${(statusLabel || '').toUpperCase()}`,
      clienteAtivo.endereco_logradouro ? `Endereço: ${clienteAtivo.endereco_logradouro}, ${clienteAtivo.endereco_numero || 'S/N'}${clienteAtivo.endereco_complemento ? ` - ${clienteAtivo.endereco_complemento}` : ''}` : null,
      clienteAtivo.endereco_bairro ? `Bairro: ${clienteAtivo.endereco_bairro}` : null,
      clienteAtivo.endereco_cidade ? `Cidade: ${clienteAtivo.endereco_cidade}/${clienteAtivo.endereco_estado || ''}` : null,
      clienteAtivo.endereco_cep ? `CEP: ${clienteAtivo.endereco_cep}` : null,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(info);
    showToast('Dados do cliente copiados para a área de transferência!', 'success');
  };

  const irParaNovoContrato = useCallback(() => {
    if (!id) {
      showToast('Cliente não identificado.', 'error');
      return;
    }
    navigate(`/clientes/novo?modo=contrato&cliente=${encodeURIComponent(id)}`);
  }, [id, navigate, showToast]);

  const handleCreateBeneficiario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !novoBeneficiario.nome.trim()) {
      showToast('Informe o nome do dependente.', 'warning');
      return;
    }
    const contrato = contratoRefDependente;
    if (!contrato?.id) {
      showToast('Cadastre um contrato/plano ativo antes de incluir dependentes.', 'warning');
      return;
    }
    setSavingBeneficiario(true);
    try {
      const { error } = await createBeneficiario({
        cliente_id: id,
        assinatura_id: contrato.id,
        nome: novoBeneficiario.nome.trim(),
        cpf: novoBeneficiario.cpf.trim() || undefined,
        parentesco: normalizarParentescoDependente(novoBeneficiario.parentesco) || 'filho',
        data_nascimento: novoBeneficiario.data_nascimento || new Date().toISOString().slice(0, 10),
        rg_numero: novoBeneficiario.rg_numero.trim() || undefined,
        tipo: 'dependente',
        status: 'ativo',
        ativo: true,
        data_inclusao: novoBeneficiario.data_inclusao,
        carencia_dependente_dias: diasCarenciaDependente,
      });

      if (error) {
        showToast(error, 'error');
        return;
      }

      if (contrato.em_inercia) {
        try {
          const { reativado } = await reativarContratoInercia(
            contrato.id,
            `Inclusão do dependente ${novoBeneficiario.nome.trim()}`,
          );
          if (reativado) {
            await sincronizarParcelasAssinatura(contrato.id, gerarMensalidadesMes);
            await loadAssinaturas(id);
            await recarregarMensalidades();
            showToast(
              'Dependente incluído. Contrato reativado — mensalidades voltaram a ser geradas.',
              'success',
            );
          } else {
            showToast('Dependente adicionado com sucesso.', 'success');
          }
        } catch (reactErr) {
          console.warn('[ClienteProfile] reativar inércia:', reactErr);
          showToast(
            'Dependente incluído, mas não foi possível reativar o contrato automaticamente.',
            'warning',
          );
        }
      } else {
        showToast('Dependente adicionado com sucesso.', 'success');
      }

      setIsAddBeneficiarioOpen(false);
      setContratoParaDependente(null);
      setNovoBeneficiario({
        nome: '',
        cpf: '',
        parentesco: 'filho',
        data_nascimento: '',
        rg_numero: '',
        data_inclusao: new Date().toISOString().slice(0, 10),
      });
      await loadBeneficiarios(id);
      await loadTimeline(id);
    } finally {
      setSavingBeneficiario(false);
    }
  };

  const handleReativarContratoInercia = async (contrato: AssinaturaSB) => {
    if (!id || !contrato.em_inercia) return;
    const codigo = contrato.codigo || contrato.id.slice(0, 8);
    const confirmar = window.confirm(
      `Reativar o contrato ${codigo}? O plano voltará a gerar mensalidades a partir de hoje.`,
    );
    if (!confirmar) return;

    setReativandoInerciaContratoId(contrato.id);
    try {
      const { reativado } = await reativarContratoInercia(
        contrato.id,
        'Reativação manual pelo operador',
      );
      if (!reativado) {
        showToast('Este contrato já não está em inércia.', 'info');
        await loadAssinaturas(id);
        return;
      }
      const geradas = await sincronizarParcelasAssinatura(contrato.id, gerarMensalidadesMes);
      await Promise.all([loadAssinaturas(id), recarregarMensalidades(), loadTimeline(id)]);
      showToast(
        geradas > 0
          ? `Contrato reativado. ${geradas} parcela(s) gerada(s).`
          : 'Contrato reativado. Mensalidades liberadas para geração.',
        'success',
      );
    } catch (e) {
      console.warn('[ClienteProfile] reativar inércia manual:', e);
      showToast(
        e instanceof Error ? e.message : 'Não foi possível reativar o contrato.',
        'error',
      );
    } finally {
      setReativandoInerciaContratoId(null);
    }
  };

  const handlePrintRecibo = (mensalidade: MensalidadeSB) => {
    const cr = enriquecerParcela(mensalidade);
    generateReciboPDF({
      numero: cr.codigo,
      data: cr.data_pagamento
        ? new Date(cr.data_pagamento).toLocaleDateString('pt-BR')
        : new Date().toLocaleDateString('pt-BR'),
      clienteNome: cr.cliente_nome,
      valor: (cr.valor_pago_centavos || cr.valor_total_centavos || 0) / 100,
      referencia: cr.descricao || 'Mensalidade / Parcela',
      descricao: cr.descricao || 'Mensalidade / Parcela',
      vencimento: new Date(cr.data_vencimento).toLocaleDateString('pt-BR'),
      empresaId: cliente?.empresa_id,
    });
  };

  const abrirProrrogarParcela = (m: MensalidadeSB) => {
    const venc = (m.data_vencimento || '').slice(0, 10);
    const base = venc ? new Date(`${venc}T12:00:00`) : new Date();
    base.setDate(base.getDate() + 30);
    setParcelaParaProrrogar(enriquecerParcela(m));
    setNovaDataProrrogacao(base.toISOString().slice(0, 10));
    setMotivoProrrogacao('');
    setShowProrrogarModal(true);
    setOpenParcelaMenuId(null);
  };

  const handleConfirmarProrrogacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parcelaParaProrrogar || !novaDataProrrogacao) return;
    const vencAtual = (parcelaParaProrrogar.data_vencimento || '').slice(0, 10);
    if (novaDataProrrogacao <= vencAtual) {
      showToast('A nova data deve ser posterior ao vencimento atual.', 'warning');
      return;
    }
    setSalvandoProrrogacao(true);
    try {
      const ok = await prorrogarContaReceber(
        parcelaParaProrrogar.id,
        novaDataProrrogacao,
        motivoProrrogacao,
      );
      if (ok) {
        showToast('Vencimento prorrogado com sucesso.', 'success');
        setShowProrrogarModal(false);
        setParcelaParaProrrogar(null);
        await recarregarMensalidades();
        if (id) await recarregarAuditoria();
      } else {
        showToast('Não foi possível prorrogar a parcela.', 'error');
      }
    } catch {
      showToast('Erro ao prorrogar a parcela.', 'error');
    } finally {
      setSalvandoProrrogacao(false);
    }
  };

  const handleEstornarParcela = async (mensalidade: MensalidadeSB) => {
    if (!window.confirm(`Estornar o recebimento da parcela ${mensalidade.codigo || ''}?`)) return;
    const motivo = window.prompt('Qual o motivo do estorno?');
    if (!motivo) return;
    try {
      const ok = await estornarContaReceber(mensalidade.id, motivo);
      if (ok) {
        showToast('Pagamento estornado com sucesso.', 'info');
        await Promise.all([recarregarMensalidades(), loadTimeline(id), carregarEstornosParcelas()]);
        if (id) await recarregarAuditoria();
      } else {
        showToast('Erro ao estornar pagamento.', 'error');
      }
    } catch {
      showToast('Erro ao estornar pagamento.', 'error');
    }
  };

  const handleUpdateBeneficiario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBeneficiario || !id) return;
    const { error } = await updateBeneficiario(editingBeneficiario.id, {
      nome: editingBeneficiario.nome,
      cpf: editingBeneficiario.cpf,
      parentesco: editingBeneficiario.parentesco,
      ativo: editingBeneficiario.ativo ?? true,
    });
    if (error) {
      showToast(error, 'error');
      return;
    }
    showToast('Beneficiário atualizado com sucesso.', 'success');
    setIsEditBeneficiarioOpen(false);
    await loadBeneficiarios(id);
    await loadTimeline(id);
  };

  const handleConfirmarPromoverTitular = async () => {
    if (!beneficiarioPromover || !id) return;
    setPromovendoTitular(true);
    try {
      const result = await promoverBeneficiarioTitular({
        beneficiarioId: beneficiarioPromover.id,
        motivo: motivoPromoverTitular,
        registrarExTitular,
      });
      if (result.ok === false) {
        showToast(result.error, 'error');
        return;
      }
      showToast(
        `${result.titularNovoNome} passou a ser titular do cadastro (antes: ${result.titularAnteriorNome}).`,
        'success',
      );
      setIsPromoverTitularOpen(false);
      setBeneficiarioPromover(null);
      await Promise.all([
        loadClienteById(id),
        loadBeneficiarios(id),
        loadAssinaturas(id),
        loadTimeline(id),
      ]);
    } finally {
      setPromovendoTitular(false);
    }
  };

  const handleDeleteBeneficiario = async () => {
    if (!beneficiarioToDelete || !id) return;
    const { error } = await deleteBeneficiario(beneficiarioToDelete);
    if (error) {
      showToast(error, 'error');
      return;
    }
    showToast('Beneficiário removido do contrato.', 'info');
    setIsDeleteConfirmOpen(false);
    await loadBeneficiarios(id);
    await loadTimeline(id);
  };

  const handleSalvarEntrega = async (contratoId: string) => {
    if (!id) return;
    setSalvandoEntrega(true);
    try {
      const { error: err } = await supabase
        .from('assinaturas')
        .update({
          entrega_para: entregaPara || null,
          entrega_recebedor: entregaRecebedor || null,
          entrega_data: entregaData || null,
        })
        .eq('id', contratoId);

      if (err) throw err;

      showToast('Confirmação de entrega salva com sucesso!', 'success');
      setEditingEntregaContratoId(null);
      await loadAssinaturas(id);
    } catch (e: any) {
      console.error('[ClienteProfile] erro ao salvar confirmacao de entrega:', e);
      showToast(e.message || 'Erro ao salvar confirmação de entrega.', 'error');
    } finally {
      setSalvandoEntrega(false);
    }
  };

  const handleExcluirParcela = async (m: MensalidadeSB) => {
    if (!m.id || !id) return;
    if (!window.confirm(`Tem certeza de que deseja excluir a parcela ${m.codigo || ''} com vencimento em ${formatarDataIsoPtBr(m.data_vencimento)}?`)) return;
    
    try {
      const ok = await excluirContaReceber(m.id);
      if (ok) {
        showToast('Parcela excluída com sucesso!', 'success');
        
        // Registrar na timeline de auditoria
        await createTimelineEvent({
          cliente_id: id,
          tipo_evento: 'AUDITORIA',
          categoria: 'parcela',
          titulo: `Parcela excluída: ${m.codigo || m.id.slice(0, 8)}`,
          descricao: `Exclusão de parcela com vencimento em ${formatarDataIsoPtBr(m.data_vencimento)}. Valor: R$ ${(m.valor_aberto_centavos / 100).toFixed(2)}.`,
          referencia_tipo: 'fin_contas_receber',
          referencia_id: m.id,
          dados_anteriores: {
            status: m.status,
            valor_original_centavos: m.valor_original_centavos,
            data_vencimento: m.data_vencimento,
          }
        });

        await recarregarMensalidades();
        if (id) await recarregarAuditoria();
        await loadTimeline(id);
      } else {
        showToast('Não foi possível excluir a parcela.', 'error');
      }
    } catch (e: any) {
      console.error('[ClienteProfile] erro ao excluir parcela:', e);
      showToast(e.message || 'Erro ao excluir parcela.', 'error');
    }
  };

  const filteredMensalidades = useMemo(() => {
    return mensalidades.filter(m => {
      const matchContrato = contratoFilter === 'todos' || m.assinatura_id === contratoFilter;
      const status = m.status?.toLowerCase();
      const isOverdue = parcelaEstaVencida(m.data_vencimento, m.status);
      
      let matchStatus = true;
      if (statusFilter === 'pagas') matchStatus = status === 'pago';
      else if (statusFilter === 'pendentes')
        matchStatus = ['pendente', 'aberto'].includes(status || '') && !isOverdue;
      else if (statusFilter === 'vencidas') matchStatus = isOverdue || status === 'vencido';
      else if (statusFilter === 'canceladas') matchStatus = status === 'cancelado';
      else if (statusFilter === 'estornadas') matchStatus = estornosPorParcelaId.has(m.id);
      
      return matchContrato && matchStatus;
    }).sort((a, b) => new Date(b.data_vencimento).getTime() - new Date(a.data_vencimento).getTime());
  }, [mensalidades, statusFilter, contratoFilter, estornosPorParcelaId]);

  const mensalidadesEscopo = useMemo(
    () =>
      mensalidades.filter(
        (m) => contratoFilter === 'todos' || m.assinatura_id === contratoFilter,
      ),
    [mensalidades, contratoFilter],
  );

  const resumoFinanceiroCliente = useMemo(
    () => resumoParcelas(mensalidadesEscopo),
    [mensalidadesEscopo],
  );

  const assinaturaResumo = useMemo(() => {
    if (contratoFilter === 'todos' || !assinaturas.length) return null;
    return assinaturas.find((a) => a.id === contratoFilter) || null;
  }, [assinaturas, contratoFilter]);

  const assinaturasDoCliente = useMemo(() => {
    if (!id) return [];
    return assinaturas.filter((a) => !a.cliente_id || a.cliente_id === id);
  }, [assinaturas, id]);

  const contratoPrincipal = useMemo(
    () => resolverContratoPrincipal(assinaturasDoCliente),
    [assinaturasDoCliente],
  );

  useEffect(() => {
    setContratoSelecionadoId('todos');
    setContratoFilter('todos');
  }, [id]);

  useEffect(() => {
    if (!id || assinaturasDoCliente.length === 0) return;
    setContratoSelecionadoId((prev) => normalizarContratoSelecionadoId(prev, assinaturasDoCliente));
  }, [id, assinaturasDoCliente]);

  const dependentesCompletude = useMemo(
    () =>
      beneficiarios.map((b) => ({
        nome: b.nome,
        parentesco: b.parentesco,
        data_nascimento: b.data_nascimento,
        data_inclusao: b.data_inclusao,
        cpf: b.cpf,
        rg_numero: b.rg_numero,
      })),
    [beneficiarios],
  );

  const resumoCadastroPendencias = useMemo(() => {
    if (!clienteAtivo) return null;
    return calcularCompletudeCadastroCliente(clienteAtivo, dependentesCompletude);
  }, [clienteAtivo, dependentesCompletude]);

  const assinaturaMigracaoCobranca = useMemo(() => {
    const assId =
      contratoFilter !== 'todos' ? contratoFilter : contratoPrincipal?.id;
    if (!assId) return null;
    const ass = assinaturas.find((a) => a.id === assId);
    if (!ass?.data_contratacao) return null;
    const anoContrato = Number(ass.data_contratacao.slice(0, 4));
    if (!Number.isFinite(anoContrato) || anoContrato >= new Date().getFullYear() - 1) {
      return null;
    }
    const inicioMesAtual = `${dataHojeIsoLocal().slice(0, 7)}-01`;
    const temParcelasAntigasEmAberto = mensalidades.some(
      (m) =>
        m.assinatura_id === assId &&
        ['aberto', 'vencido', 'pendente', 'pago_parcial'].includes(
          (m.status || '').toLowerCase(),
        ) &&
        (m.data_vencimento || '').slice(0, 10) < inicioMesAtual &&
        (m.valor_pago_centavos ?? 0) === 0,
    );
    return temParcelasAntigasEmAberto ? ass : null;
  }, [assinaturas, contratoFilter, contratoPrincipal?.id, mensalidades]);

  const handleReiniciarCobrancaMigracao = useCallback(async () => {
    if (!assinaturaMigracaoCobranca?.id) return;
    setReiniciandoCobrancaMigracao(true);
    try {
      const res = await reiniciarCobrancaMigracaoAssinatura(
        assinaturaMigracaoCobranca.id,
        gerarMensalidadesMes,
      );
      await recarregarMensalidades();
      await loadAssinaturas(id!);
      setIsMigracaoCobrancaOpen(false);
      showToast(
        `Cobrança reiniciada: ${res.parcelasExcluidas} parcela(s) antiga(s) removida(s), ${res.parcelasGeradas} nova(s) a partir de ${formatarDataIsoPtBr(res.primeiroVencimento)}. O tempo de contrato (${formatarDataIsoPtBr(assinaturaMigracaoCobranca.data_contratacao)}) foi mantido.`,
        'success',
      );
    } catch (e) {
      console.warn('[ClienteProfile] reiniciar cobrança migração:', e);
      showToast(
        e instanceof Error ? e.message : 'Não foi possível reiniciar a cobrança.',
        'error',
      );
    } finally {
      setReiniciandoCobrancaMigracao(false);
    }
  }, [
    assinaturaMigracaoCobranca,
    gerarMensalidadesMes,
    id,
    loadAssinaturas,
    recarregarMensalidades,
    showToast,
  ]);

  const sincronizarParcelasDoCliente = useCallback(async (avisar = true) => {
    if (!id) return 0;
    try {
      const total = await sincronizarParcelasCliente(id, gerarMensalidadesMes);
      if (total > 0) {
        await recarregarMensalidades();
        if (avisar) {
          showToast(
            `${total} parcela(s) gerada(s) para manter o financeiro em dia.`,
            'info',
          );
        }
      }
      return total;
    } catch (e) {
      console.warn('[ClienteProfile] sincronizar parcelas:', e);
      if (avisar) {
        showToast('Não foi possível gerar as parcelas automaticamente.', 'warning');
      }
      return 0;
    }
  }, [id, gerarMensalidadesMes, showToast]);

  useEffect(() => {
    if (!id || !isProfessional) return;
    if (activeTab !== 'financeiro' && activeTab !== 'contratos') return;
    let cancelado = false;
    void (async () => {
      const total = await sincronizarParcelasDoCliente(activeTab === 'financeiro');
      if (!cancelado && total > 0 && activeTab === 'contratos') {
        await loadAssinaturas(id);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id, activeTab, isProfessional, sincronizarParcelasDoCliente, loadAssinaturas]);

  useEffect(() => {
    inerciaAvaliadaNaAbaRef.current = '';
  }, [id, activeTab]);

  useEffect(() => {
    if (!id || !isProfessional || activeTab !== 'contratos') return;
    const chave = `${id}:contratos`;
    if (inerciaAvaliadaNaAbaRef.current === chave) return;
    if (assinaturas.length === 0) return;

    let cancelado = false;
    inerciaAvaliadaNaAbaRef.current = chave;

    void (async () => {
      const candidatos = assinaturas.filter(
        (a) => (a.status === 'ativo' || a.status === 'suspenso') && !a.em_inercia,
      );
      let entrouAlgum = false;
      for (const a of candidatos) {
        if (cancelado) break;
        try {
          if (await avaliarInerciaAssinatura(a.id)) entrouAlgum = true;
        } catch (e) {
          console.warn('[ClienteProfile] avaliar inércia:', e);
        }
      }
      if (!cancelado && entrouAlgum) {
        await loadAssinaturas(id);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [id, activeTab, isProfessional, assinaturas, loadAssinaturas]);

  const bairroCobrancaClienteProfile = useMemo(
    () =>
      clienteAtivo
        ? bairroCobrancaCliente({
            usaEnderecoResidencialCobranca: clienteAtivo.usa_endereco_residencial_cobranca,
            enderecoBairro: clienteAtivo.endereco_bairro,
            enderecoCobBairro: clienteAtivo.endereco_cob_bairro,
          })
        : '',
    [clienteAtivo],
  );

  if (loading || !clienteAtivo) {
    return <ClienteProfileSkeleton />;
  }

  const cliente = clienteAtivo;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Profile */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-3xl font-bold text-white border-4 border-white shadow-xl">
            {cliente.nome.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{cliente.nome}</h1>
              <StatusBadge status={cliente.status || (cliente as any).status_assinatura} />
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-slate-300">
              <span className="flex items-center gap-1"><User className="h-4 w-4 text-blue-500" /> {cliente.cpf_formatado || cliente.cpf}</span>
              <span className="flex items-center gap-1"><Mail className="h-4 w-4 text-blue-500" /> {cliente.email || '—'}</span>
              <span className="flex items-center gap-1"><Phone className="h-4 w-4 text-blue-500" /> {cliente.telefone_principal}</span>
              {contratoPrincipal?.codigo ? (
                <span className="flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  Contrato {contratoPrincipal.codigo}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopiarDados}>
              <Copy className="h-4 w-4 mr-2" /> Copiar Dados
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/clientes/${cliente.id}/editar`)}>
              <Edit className="h-4 w-4 mr-2" /> Editar Perfil
            </Button>
            <Button size="sm" onClick={handleImprimirFicha}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir Ficha
            </Button>
          </div>
        </div>
        {resumoCadastroPendencias && resumoCadastroPendencias.pendentes > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('pendencias')}
            className="mt-4 inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            title="Abrir aba Dados pendentes"
          >
            <ClientePendenciasCadastro variant="badge" resumo={resumoCadastroPendencias} />
          </button>
        )}
      </Card>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-slate-800 px-4 overflow-x-auto md:overflow-visible">
        <nav className="-mb-px flex flex-wrap gap-2 py-2 min-w-0">
          {visibleTabs.map(({ key, label, icon: Icon }) => {
            const countPendencias =
              key === 'pendencias' && resumoCadastroPendencias && resumoCadastroPendencias.pendentes > 0
                ? resumoCadastroPendencias.pendentes
                : 0;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`
                  flex items-center gap-2 py-2 px-4 rounded-lg font-medium text-sm transition-all
                  ${activeTab === key
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'}
                `}
              >
                <Icon className="h-4 w-4" />
                {label}
                {countPendencias > 0 ? (
                  <span
                    className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                      activeTab === key ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {countPendencias}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'geral' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-blue-600" /> Dados Pessoais
              </h3>
              <dl className="space-y-4 text-sm">
                {(cliente.origem_canal || cliente.tipo_vendedor || cliente.vendedor_id) && (
                  <div className="pb-3 mb-1 border-b border-dashed">
                    <dt className="text-gray-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-wider mb-1">CRM</dt>
                    <dd className="text-gray-900 dark:text-white font-semibold space-y-1">
                      {cliente.tipo_vendedor === 'escritorio' || !cliente.vendedor_id ? (
                        <span className="block">Vendedor responsável: Escritório</span>
                      ) : cliente.vendedor_id ? (
                        <VendedorClienteNome vendedorId={cliente.vendedor_id} />
                      ) : null}
                      {cliente.tipo_vendedor && cliente.tipo_vendedor !== 'escritorio' ? (
                        <span className="block">
                          Tipo:{' '}
                          {cliente.tipo_vendedor === 'externo' ? 'Vendedor externo' : 'Vendedor interno'}
                        </span>
                      ) : null}
                      {cliente.origem_canal ? (
                        <span className="block capitalize">Canal: {cliente.origem_canal}</span>
                      ) : null}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-wider">Nascimento</dt>
                  <dd className="text-gray-900 dark:text-white font-semibold">{cliente.data_nascimento ? formatarDataIsoPtBr(cliente.data_nascimento) : '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-wider">RG</dt>
                  <dd className="text-gray-900 dark:text-white font-semibold">{cliente.rg || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-slate-400 font-medium uppercase text-[10px] tracking-wider">Endereço Residencial</dt>
                  <dd className="text-gray-900 dark:text-white leading-relaxed font-semibold">
                    {cliente.endereco_logradouro}, {cliente.endereco_numero}
                    {cliente.endereco_complemento && ` - ${cliente.endereco_complemento}`}
                    <br />
                    {cliente.endereco_bairro} - {cliente.endereco_cidade}/{cliente.endereco_estado}
                    <br />
                    CEP: {cliente.endereco_cep}
                  </dd>
                </div>
                {cliente.usa_endereco_residencial_cobranca === false && (
                  <div className="pt-2 border-t border-dashed">
                    <dt className="text-amber-600 font-bold uppercase text-[10px] tracking-wider flex items-center gap-1">
                      <CreditCard className="h-3 w-3" /> Endereço de Cobrança
                    </dt>
                    <dd className="text-gray-900 dark:text-white leading-relaxed text-xs">
                      {cliente.endereco_cob_logradouro}, {cliente.endereco_cob_numero}
                      {cliente.endereco_cob_complemento && ` - ${cliente.endereco_cob_complemento}`}
                      <br />
                      {cliente.endereco_cob_bairro} - {cliente.endereco_cob_cidade}/{cliente.endereco_cob_uf}
                      <br />
                      CEP: {cliente.endereco_cob_cep}
                    </dd>
                  </div>
                )}
              </dl>
            </Card>

            <Card className="p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-indigo-600">
                <Shield className="h-5 w-5" /> Resumo Contratual
              </h3>
              {assinaturas.length > 0 ? (
                <div className="space-y-4">
                  {assinaturas.map(a => (
                    <div key={a.id} className="p-3 rounded-xl border border-indigo-50 bg-indigo-50/30">
                      <p className="font-bold text-indigo-900 dark:text-indigo-200">{a.plano_nome}</p>
                      <div className="flex justify-between mt-1 text-xs">
                        <span className="text-indigo-600">Mensalidade: R$ {(valorMensalAssinatura(a) / 100).toFixed(2)}</span>
                        <span className="font-medium text-indigo-800 dark:text-indigo-300">Dia {a.dia_vencimento}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Shield className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhum contrato ativo</p>
                </div>
              )}
            </Card>

            <Card className="p-6 border-l-4 border-l-emerald-500">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-emerald-600">
                <CreditCard className="h-5 w-5" /> Situação Financeira
              </h3>
              <div className="text-center py-4 bg-emerald-50/50 rounded-2xl mb-4">
                <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest mb-1">Mensalidade Atual</p>
                <p className="text-3xl font-black text-emerald-900 dark:text-emerald-300">R$ {(mensalidades.find(m => m.status === 'pago')?.valor_pago_centavos ? (mensalidades.find(m => m.status === 'pago')?.valor_pago_centavos! / 100) : (valorMensalAssinatura(assinaturas[0] || {} as AssinaturaSB) / 100) || 0).toFixed(2)}</p>
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setActiveTab('financeiro')}>
                Ver Financeiro Completo
              </Button>
            </Card>

            {id && (cliente.empresa_id || empresaIdEfetivo || user?.empresa_id) ? (
              <>
                <CobradorCarteiraClientePanel
                  clienteId={id}
                  empresaId={(cliente.empresa_id || empresaIdEfetivo || user?.empresa_id || '').trim()}
                  bairroCobranca={bairroCobrancaClienteProfile}
                />
              </>
            ) : null}
          </div>
        )}
        {activeTab === 'contratos' && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" /> Contratos ({assinaturas.length})
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border bg-white p-0.5 text-xs font-bold uppercase">
                  <button
                    type="button"
                    onClick={() => setContratosSubAba('lista')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      contratosSubAba === 'lista' ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50'
                    }`}
                  >
                    Lista
                  </button>
                  <button
                    type="button"
                    onClick={() => setContratosSubAba('auditoria')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      contratosSubAba === 'auditoria' ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50'
                    }`}
                  >
                    Auditoria
                  </button>
                </div>
                {contratosSubAba === 'lista' && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                    onClick={irParaNovoContrato}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Novo Contrato
                  </Button>
                )}
              </div>
            </div>

            {contratosSubAba === 'auditoria' ? (
              <AuditoriaClienteTabela
                linhas={linhasAuditoriaContratos}
                usuarioAtual={user}
                autoresPorId={autoresAuditoriaPorId}
                moduloPadrao="Contratos"
                titulo="Auditoria de contratos"
                subtitulo="Contrato, troca de dependentes, pagamentos, estornos, prorrogações e demais alterações vinculadas ao plano."
                vazio="Nenhuma alteração registrada para os contratos deste cliente."
              />
            ) : assinaturas.length > 0 ? (
              <div className="grid grid-cols-1 gap-6">
                {assinaturas.map(a => {
                  const parcelasContrato = mensalidades
                    .filter((m) => m.assinatura_id === a.id)
                    .sort((x, y) => new Date(x.data_vencimento).getTime() - new Date(y.data_vencimento).getTime());
                  const resumoContrato = resumoParcelas(parcelasContrato);
                  const inercia = resumoInerciaContrato(a);
                  return (
                  <Card key={a.id} className="p-0 overflow-hidden border-indigo-100 shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-indigo-50/50 dark:bg-indigo-950/40 px-6 py-4 border-b border-indigo-100 dark:border-indigo-900/50 flex flex-wrap justify-between items-center gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg border border-indigo-100 shadow-sm">
                          <Shield className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-tight">
                              {resolvePlanoContratoAssinatura(a).label}
                            </h4>
                            <PlanoContratoBadge assinatura={a} />
                            <IndicadorAssinaturaDigital
                              status={resolverStatusResumoAssinaturaDigital(
                                assinaturasDigitais.filter((sig) => sig.assinatura_id === a.id),
                              )}
                              showLabel
                              size="md"
                            />
                          </div>
                          <p className="text-[10px] text-indigo-500 font-bold uppercase mt-0.5">
                            Contrato {a.codigo || a.id.slice(0, 8)} • Modelo {resolvePlanoContratoAssinatura(a).sigla}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() =>
                            navigate(
                              `/financeiro/baixa-parcelas?search=${encodeURIComponent(cliente.nome)}`,
                            )
                          }
                        >
                          <DollarSign className="h-4 w-4 mr-1.5" />
                          Dar baixa
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 bg-white border-indigo-200 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50"
                          onClick={() => handleImprimirContrato(a)}
                        >
                          <Printer className="h-4 w-4 mr-1.5" />
                          Imprimir contrato
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 bg-white border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => setAssinaturaDigitalContrato(a)}
                        >
                          <Pen className="h-4 w-4 mr-1.5" />
                          Assinatura Digital
                        </Button>
                        <StatusBadge status={a.status} />
                        {inercia.emInercia && <StatusBadge status="inercia" />}
                      </div>
                    </div>
                    {inercia.emInercia ? (
                      <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold">Contrato em inércia</p>
                            <p className="mt-1 text-xs text-amber-800">
                              Sem óbito e sem uso do plano funerário há mais de {INERCIA_MESES_SEM_EVENTO} meses
                              (20 anos e 10 meses). Não gera novas mensalidades.
                              {inercia.inerciaDesde
                                ? ` Em inércia desde ${formatarDataIsoPtBr(inercia.inerciaDesde)}.`
                                : ''}{' '}
                              Incluir dependente ou reativar manualmente volta a cobrar.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                            disabled={reativandoInerciaContratoId === a.id}
                            onClick={() => void handleReativarContratoInercia(a)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1.5" />
                            {reativandoInerciaContratoId === a.id ? 'Reativando...' : 'Reativar contrato'}
                          </Button>
                        </div>
                      </div>
                    ) : inercia.mesesRestantesInercia != null && inercia.mesesRestantesInercia <= 24 ? (
                      <div className="mx-6 mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                        Último evento do plano: {formatarDataIsoPtBr(inercia.ultimoEventoEm)}.
                        Faltam {inercia.mesesRestantesInercia} mês(es) para possível inércia ({INERCIA_MESES_SEM_EVENTO} meses sem óbito/uso).
                      </div>
                    ) : null}
                    <div className="px-6 py-3 bg-white dark:bg-slate-800/50 border-b border-indigo-50 dark:border-slate-700 flex flex-wrap gap-3 text-xs">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800">
                        <Check className="h-3.5 w-3.5" />
                        {resumoContrato.qtdPagas} pagas
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800">
                        <Clock className="h-3.5 w-3.5" />
                        {resumoContrato.qtdPendentes} pendentes
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-800">
                        <XCircle className="h-3.5 w-3.5" />
                        {resumoContrato.qtdVencidas} vencidas
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 font-bold text-indigo-800 dark:text-indigo-300">
                        <Calendar className="h-3.5 w-3.5" />
                        {mesesDesdeContrato(a.data_contratacao, a.created_at)}
                      </span>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-5 gap-8 border-b border-gray-100 dark:border-slate-800">
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Plano / Modelo</p>
                        <p className="text-lg font-black text-indigo-800 dark:text-indigo-300 uppercase">{resolvePlanoContratoAssinatura(a).label}</p>
                        <p className="text-[10px] text-gray-500 dark:text-slate-400">
                          Contrato{' '}
                          {resolvePlanoContratoAssinatura(a).tipo === 'onix'
                            ? 'Onix'
                            : resolvePlanoContratoAssinatura(a).tipo === 'catalao_padrao'
                              ? 'Catálão Padrão'
                              : 'Fênix'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Valor Mensal</p>
                        <p className="text-xl font-black text-gray-900 dark:text-white">
                          {valorMensalAssinatura(a) > 0
                            ? `R$ ${(valorMensalAssinatura(a) / 100).toFixed(2)}`
                            : '—'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Vencimento</p>
                        <p className="text-xl font-black text-gray-900 dark:text-white">
                          {a.dia_vencimento != null && String(a.dia_vencimento) !== ''
                            ? `Dia ${a.dia_vencimento}`
                            : '—'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Data Início</p>
                        <p className="text-lg font-bold text-gray-700 dark:text-slate-300">
                          {formatarDataIsoPtBr(a.data_contratacao || a.created_at)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Forma Pagamento</p>
                        <p className="text-lg font-bold text-gray-700 dark:text-slate-300 capitalize">{a.forma_pagamento || '—'}</p>
                      </div>
                    </div>
                    {(() => {
                      const sigsContrato = assinaturasDigitais.filter(sig => sig.assinatura_id === a.id);
                      if (sigsContrato.length === 0) return null;
                      return (
                        <div className="mx-6 mb-4 p-4 rounded-xl border border-blue-100 bg-blue-50/30">
                          <h5 className="text-[11px] font-black uppercase tracking-widest text-blue-800 flex items-center gap-1.5 mb-2">
                            <Pen className="h-3.5 w-3.5" /> Assinaturas Digitais do Contrato
                          </h5>
                          <div className="space-y-2">
                            {sigsContrato.map((sig) => {
                              const statusInfo = formatarStatusAssinaturaDigital(sig.status);
                              const isPendenteOuVisualizado = sig.status === 'pendente' || sig.status === 'visualizado';
                              const linkAssinatura = montarLinkAssinaturaDigital(sig.token);
                              return (
                                <div key={sig.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-lg border border-gray-100 dark:border-slate-800 shadow-sm text-xs">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${statusInfo.bgColor} ${statusInfo.color}`}>
                                        {statusInfo.label}
                                      </span>
                                      <span className="text-gray-500 dark:text-slate-400 text-[10px]">
                                        Enviado em {new Date(sig.enviado_em || sig.created_at).toLocaleString('pt-BR')} via {sig.canal_envio}
                                      </span>
                                    </div>
                                    {sig.status === 'assinado' && (
                                      <div className="mt-1 text-[11px] text-emerald-700 font-medium">
                                        Assinado em {new Date(sig.assinado_em).toLocaleString('pt-BR')} | IP: {sig.ip_assinatura || '—'}
                                      </div>
                                    )}
                                    {isPendenteOuVisualizado && (
                                      <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400 font-medium break-all select-all">
                                        Link: <a href={linkAssinatura} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{linkAssinatura}</a>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 self-end sm:self-center">
                                    {isPendenteOuVisualizado && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-2 text-[10px] font-bold"
                                        onClick={() => {
                                          const linkWp = gerarLinkWhatsApp(sig.titular_telefone || cliente.telefone_principal || '', linkAssinatura, cliente.nome);
                                          window.open(linkWp, '_blank');
                                        }}
                                      >
                                        <MessageCircle className="h-3 w-3 mr-1" /> Reenviar Whats
                                      </Button>
                                    )}
                                    {sig.assinatura_imagem_url && (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const signedUrl = await obterSignedUrlAssinatura(sig.assinatura_imagem_url);
                                          if (signedUrl) {
                                            window.open(signedUrl, '_blank');
                                          } else {
                                            alert('Erro ao obter link seguro para visualizar a assinatura.');
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 pointer-events-auto bg-transparent border-0 cursor-pointer"
                                      >
                                        <Eye className="h-3.5 w-3.5" /> Ver Assinatura
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    <ContratoDependentesPanel
                      assinatura={a}
                      beneficiarios={beneficiarios}
                      contratoAtivoId={contratoAtivo?.id}
                      variant="resumo"
                      onIrBeneficiarios={() => setActiveTab('beneficiarios')}
                      onAdicionarDependente={() => abrirModalDependente(a)}
                    />
                    {/* Rastreamento de Entrega do Contrato */}
                    <div className="px-6 py-4 bg-gray-50/80 dark:bg-slate-800/40 border-t border-gray-100 dark:border-slate-800">
                      <div className="flex items-center justify-between mb-4">
                        <h5 className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-slate-300 flex items-center gap-2">
                          <Truck className="h-4 w-4 text-indigo-500" /> Rastreamento de Entrega Física
                        </h5>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 h-8 flex items-center gap-1 font-bold text-xs"
                          onClick={() => setContratoEntregaModal(a)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Gerenciar Rastreamento
                        </Button>
                      </div>

                      {/* Status Badge */}
                      <div className="mb-4 flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-gray-400">Status físico:</span>
                        {a.entrega_data_retorno ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50">
                            <Check className="h-3 w-3" /> Assinado & Retornado
                          </span>
                        ) : a.entrega_data ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50">
                            <Check className="h-3 w-3" /> Entregue ao Cliente
                          </span>
                        ) : a.entrega_data_saida ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50">
                            <Clock className="h-3 w-3" /> Em Rota de Entrega
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-400 border border-gray-200/50">
                            <AlertCircle className="h-3 w-3" /> Pendente de Saída
                          </span>
                        )}
                      </div>

                      {/* Details Grid */}
                      {(a.entrega_data_saida || a.entrega_data || a.entrega_entregador || a.entrega_para) ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 p-3 bg-white dark:bg-slate-800 rounded-xl border shadow-sm">
                            {a.entrega_data_saida && (
                              <div>
                                <span className="text-gray-400 block text-[9px] uppercase font-bold">Data de Saída</span>
                                <span className="font-semibold text-gray-700 dark:text-slate-300 font-mono">
                                  {formatarDataIsoPtBr(a.entrega_data_saida)}
                                </span>
                              </div>
                            )}
                            {a.entrega_entregador && (
                              <div>
                                <span className="text-gray-400 block text-[9px] uppercase font-bold">Entregador</span>
                                <span className="font-semibold text-gray-700 dark:text-slate-300">
                                  {a.entrega_entregador}
                                </span>
                              </div>
                            )}
                            {a.entrega_data && (
                              <div>
                                <span className="text-gray-400 block text-[9px] uppercase font-bold">Data de Entrega</span>
                                <span className="font-semibold text-gray-700 dark:text-slate-300 font-mono">
                                  {formatarDataIsoPtBr(a.entrega_data)}
                                </span>
                              </div>
                            )}
                            {a.entrega_para && (
                              <div>
                                <span className="text-gray-400 block text-[9px] uppercase font-bold">Entregue para</span>
                                <span className="font-semibold text-gray-700 dark:text-slate-300">
                                  {a.entrega_para}
                                </span>
                              </div>
                            )}
                            {a.entrega_recebedor && (
                              <div>
                                <span className="text-gray-400 block text-[9px] uppercase font-bold">Quem recebeu</span>
                                <span className="font-semibold text-gray-700 dark:text-slate-300">
                                  {a.entrega_recebedor}
                                </span>
                              </div>
                            )}
                            {a.entrega_data_retorno && (
                              <div>
                                <span className="text-gray-400 block text-[9px] uppercase font-bold">Retornado em</span>
                                <span className="font-semibold text-gray-700 dark:text-slate-300 font-mono">
                                  {formatarDataIsoPtBr(a.entrega_data_retorno)}
                                </span>
                              </div>
                            )}
                          </div>
                          {a.entrega_obs && (
                            <div className="p-2.5 bg-indigo-50/30 dark:bg-slate-800/20 rounded-lg border border-dashed text-xs text-gray-600 dark:text-slate-400">
                              <span className="font-bold text-gray-700 dark:text-slate-300 uppercase block text-[9px] mb-0.5">Observações da entrega:</span>
                              <p className="whitespace-pre-line">{a.entrega_obs}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Nenhuma informação de rastreamento de entrega registrada para este contrato.</p>
                      )}
                    </div>
                  </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="p-12 text-center border-dashed border-2">
                <Shield className="h-12 w-12 mx-auto mb-4 text-gray-200" />
                <p className="text-gray-500 dark:text-slate-400 font-medium">Este cliente ainda não possui contratos registrados.</p>
                <Button type="button" className="mt-4 bg-indigo-600" onClick={irParaNovoContrato}>
                  Vincular Primeiro Plano
                </Button>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'pendencias' && resumoCadastroPendencias && (
          <PendenciasCadastroContratoView
            cliente={cliente}
            assinaturas={assinaturas}
            assinaturaId={contratoSelecionadoId}
            onAssinaturaIdChange={setContratoSelecionadoId}
            resumo={resumoCadastroPendencias}
            onCompletarCadastro={() => navigate(`/clientes/${cliente.id}/editar`)}
            onRevisarDependentes={
              contratoAtivo ? () => abrirModalDependente(contratoAtivo) : undefined
            }
            onVerContratos={() => setActiveTab('contratos')}
          />
        )}
        {activeTab === 'pendencias' && !resumoCadastroPendencias && (
          <Card className="p-8 text-center text-gray-500 dark:text-slate-400">Não foi possível calcular as pendências.</Card>
        )}

        {activeTab === 'cobranca' && (
          <ContratoCobrancaView
            cliente={cliente}
            assinaturas={assinaturas}
            assinaturaId={contratoSelecionadoId}
            onAssinaturaIdChange={setContratoSelecionadoId}
            mensalidades={mensalidades}
            empresaNome={empresa?.nome}
          />
        )}

        {activeTab === 'carteirinha' && (
          <ContratoCarteirinhaView
            cliente={cliente}
            assinaturas={assinaturasDoCliente}
            assinaturaId={contratoSelecionadoId}
            onAssinaturaIdChange={setContratoSelecionadoId}
            beneficiarios={beneficiarios}
            empresaNome={empresa?.nome}
          />
        )}

        {activeTab === 'financeiro' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4 bg-emerald-50 border-emerald-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 rounded-lg text-white"><DollarSign className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-bold text-emerald-700 uppercase">Total Pago</p>
                    <p className="text-xl font-black text-emerald-900 dark:text-emerald-300">
                      R$ {(resumoFinanceiroCliente.totalPagoCentavos / 100).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">{resumoFinanceiroCliente.qtdPagas} parcela(s)</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-amber-50 border-amber-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 rounded-lg text-white"><AlertCircle className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-bold text-amber-700 uppercase">Pendentes</p>
                    <p className="text-xl font-black text-amber-900">{resumoFinanceiroCliente.qtdPendentes} parcelas</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-rose-50 border-rose-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-500 rounded-lg text-white"><XCircle className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-bold text-rose-700 uppercase">Vencidas</p>
                    <p className="text-xl font-black text-rose-900">{resumoFinanceiroCliente.qtdVencidas} parcelas</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-indigo-50 border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500 rounded-lg text-white"><Calendar className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase">Tempo Contrato</p>
                    <p className="text-xl font-black text-indigo-900 dark:text-indigo-200">
                      {assinaturaResumo
                        ? mesesDesdeContrato(assinaturaResumo.data_contratacao, assinaturaResumo.created_at)
                        : assinaturas[0]
                          ? mesesDesdeContrato(assinaturas[0].data_contratacao, assinaturas[0].created_at)
                          : '—'}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center justify-between bg-white p-4 rounded-2xl border">
              <div className="flex gap-2">
                {['todas', 'pagas', 'pendentes', 'vencidas', 'canceladas', 'estornadas'].map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                      statusFilter === f ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-100 text-gray-500 dark:text-slate-400 hover:bg-gray-200'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select 
                  value={contratoFilter} 
                  onChange={(e) => setContratoFilter(e.target.value)}
                  className="w-64 h-9 text-xs"
                >
                  <option value="todos">Todos os Contratos</option>
                  {assinaturas.map(a => (
                    <option key={a.id} value={a.id}>{a.plano_nome} - {a.id.slice(0,8)}</option>
                  ))}
                </Select>
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 h-9 text-xs font-bold text-white"
                  onClick={() => setShowNovaParcelaModal(true)}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nova Parcela
                </Button>
                {assinaturaMigracaoCobranca ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-amber-800 border-amber-300 hover:bg-amber-50"
                    onClick={() => setIsMigracaoCobrancaOpen(true)}
                  >
                    Reiniciar cobrança (migração)
                  </Button>
                ) : null}
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-slate-400 px-1">
              Parcelas agrupadas por ano — expanda o ano para ver os meses. Clique na linha para selecionar; clique de novo (ou botão direito) para ações.
            </p>

            <Card className="p-4">
              <ParcelasPorAnoAccordion
                parcelas={filteredMensalidades.map((m) => {
                  const estorno = estornosPorParcelaId.get(m.id);
                  return {
                    ...m,
                    plano_nome:
                      m.plano_nome ||
                      assinaturas.find((a) => a.id === m.assinatura_id)?.plano_nome ||
                      undefined,
                    estorno_em: estorno?.quando || null,
                    estorno_por: estorno?.estornadoPorNome || null,
                    estorno_motivo: estorno?.motivo || null,
                  };
                })}
                selectedId={parcelaSelecionadaId || openParcelaMenuId}
                onRowClick={(p, e) => {
                  const full = mensalidades.find((x) => x.id === p.id);
                  if (full) handleClickParcela(full, e);
                }}
                onRowContextMenu={(p, e) => {
                  const full = mensalidades.find((x) => x.id === p.id);
                  if (full) abrirMenuParcela(full, e);
                }}
              />
            </Card>
          </div>
        )}

        {activeTab === 'venda' && (
          <ContratoVendaView
            cliente={cliente}
            assinaturas={assinaturas}
            mensalidades={mensalidades}
            onAtualizado={recarregarDadosContrato}
          />
        )}

        {activeTab === 'beneficiarios' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" /> Beneficiários / dependentes ({beneficiarios.length})
              </h3>
              <Button
                size="sm"
                onClick={() => abrirModalDependente()}
                disabled={!contratoAtivo}
              >
                <Plus className="h-4 w-4 mr-2" /> Adicionar dependente
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Carência de <strong>{diasCarenciaDependente} dias</strong> por dependente a partir da data de filiação.
              Use as ações para <strong>registrar óbito</strong> (baixa no plano), editar, remover ou tornar titular.
              Falecidos aparecem na lista cinza com a data do óbito.
              Na aba <strong>Contratos</strong> aparece só um resumo.
            </p>

            {!contratoAtivo && (
              <Card className="p-6 text-center text-gray-500 dark:text-slate-400 border-dashed">
                Cadastre um contrato ativo antes de incluir dependentes.
              </Card>
            )}

            {contratoAtivo && (
              <Card className="p-0 overflow-hidden border-blue-100 shadow-sm">
                <ContratoDependentesPanel
                  assinatura={contratoAtivo}
                  beneficiarios={beneficiarios}
                  contratoAtivoId={contratoAtivo.id}
                  variant="completo"
                  onAdicionarDependente={() => abrirModalDependente(contratoAtivo)}
                  onEditarDependente={(b) => {
                    setEditingBeneficiario(b);
                    setIsEditBeneficiarioOpen(true);
                  }}
                  onPromoverTitular={
                    contratoAtivo.status === 'ativo' ? (b) => abrirPromoverTitular(b) : undefined
                  }
                  onRemoverDependente={(b) => {
                    setBeneficiarioToDelete(b.id);
                    setIsDeleteConfirmOpen(true);
                  }}
                  onRegistrarObito={(b) => abrirRegistrarObito(b)}
                  dependentePodeVirarTitular={dependentePodeVirarTitular}
                />
              </Card>
            )}

            {assinaturas.filter((a) => a.id !== contratoAtivo?.id).map((a) => {
              const depsOutro = filtrarBeneficiariosDoContrato(beneficiarios, a, contratoAtivo?.id);
              if (depsOutro.length === 0) return null;
              return (
                <Card key={a.id} className="p-0 overflow-hidden border-gray-200 opacity-95">
                  <div className="px-4 py-2 bg-gray-50 border-b text-[10px] font-bold uppercase text-gray-500 dark:text-slate-400">
                    Outro contrato: {a.codigo || a.id.slice(0, 8)} · {resolvePlanoContratoAssinatura(a).label}
                  </div>
                  <ContratoDependentesPanel
                    assinatura={a}
                    beneficiarios={beneficiarios}
                    contratoAtivoId={contratoAtivo?.id}
                    variant="completo"
                    somenteLeitura={a.status !== 'ativo'}
                    onEditarDependente={(b) => {
                      setEditingBeneficiario(b);
                      setIsEditBeneficiarioOpen(true);
                    }}
                  />
                </Card>
              );
            })}

          </div>
        )}

        {activeTab === 'timeline' && (
          <Card className="p-6">
            <div className="space-y-8 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
              {timeline.filter(timelineVisivel).map((event) => (
                <div key={event.id} className="relative pl-10">
                  <div className="absolute left-0 top-0 h-6 w-6 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center shadow-sm">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900 dark:text-white text-sm">{rotuloTipoTimeline(event.tipo_evento)}</span>
                      <span className="text-[10px] text-gray-400">{timelineQuando(event) ? new Date(timelineQuando(event)).toLocaleString('pt-BR') : '—'}</span>
                    </div>
                    <p className="text-[11px] text-blue-700 font-semibold">
                      Responsável: {auditUsuarioNome(event, user, autoresAuditoriaPorId)}
                    </p>
                    <p className="text-sm font-medium text-gray-800">{event.titulo}</p>
                    {event.descricao ? <p className="text-sm text-gray-600 dark:text-slate-300">{event.descricao}</p> : null}
                  </div>
                </div>
              ))}
              {timeline.filter(timelineVisivel).length === 0 && (
                <p className="text-sm text-gray-500 dark:text-slate-400 pl-10">Nenhum evento registrado na timeline.</p>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'auditoria' && (
          <AuditoriaClienteTabela
            linhas={linhasAuditoriaGeral}
            usuarioAtual={user}
            autoresPorId={autoresAuditoriaPorId}
            moduloPadrao="Contratos"
            titulo="Log de alterações do sistema"
            subtitulo="Contratos, dependentes e demais eventos de auditoria registrados para este cliente."
            vazio="Nenhum registro de auditoria para este cliente."
          />
        )}
      </div>

      {/* Add Beneficiario Modal */}
      <Modal
        isOpen={isAddBeneficiarioOpen}
        onClose={() => {
          setIsAddBeneficiarioOpen(false);
          setContratoParaDependente(null);
        }}
        title="Adicionar dependente"
      >
        <form onSubmit={handleCreateBeneficiario} className="space-y-4">
          {contratoRefDependente && (
            <p className="text-xs text-gray-500 dark:text-slate-400 bg-gray-50 border rounded-lg px-3 py-2">
              Contrato <strong>{contratoRefDependente.codigo || contratoRefDependente.id.slice(0, 8)}</strong>
              {contratoRefDependente.plano_nome ? ` • ${contratoRefDependente.plano_nome}` : ''}
              <br />
              Carência do contrato: <strong>{contratoRefDependente.plano_carencia_dias ?? 0} dias</strong>
              {' • '}
              Carência de dependente: <strong>{diasCarenciaDependente} dias</strong> após a data de filiação.
            </p>
          )}

          {beneficiarios.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Situação dos dependentes já cadastrados
              </p>
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {beneficiarios.map((b) => {
                  const di = dataInclusaoBeneficiario(b);
                  const st = calcularStatusCarenciaDependente(di, diasCarenciaDependente);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-gray-50 pb-2 last:border-0">
                      <span className="font-semibold text-gray-800">{b.nome}</span>
                      <span className="text-gray-500 dark:text-slate-400">Filiação {formatarDataIsoPtBr(di)}</span>
                      <Badge
                        variant="default"
                        className={
                          st?.emCarencia
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }
                      >
                        {st?.emCarencia
                          ? `Em carência (${st.diasRestantes}d restantes)`
                          : 'Cobertura ativa'}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Input
            label="Nome Completo *"
            value={novoBeneficiario.nome}
            onChange={(e) => setNovoBeneficiario((prev) => ({ ...prev, nome: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="CPF"
              value={novoBeneficiario.cpf}
              onChange={(e) => setNovoBeneficiario((prev) => ({ ...prev, cpf: e.target.value }))}
            />
            <Input
              label="RG"
              value={novoBeneficiario.rg_numero}
              onChange={(e) => setNovoBeneficiario((prev) => ({ ...prev, rg_numero: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ParentescoDependenteSelect
              label="Parentesco *"
              required
              value={novoBeneficiario.parentesco}
              onChange={(e) =>
                setNovoBeneficiario((prev) => ({
                  ...prev,
                  parentesco: normalizarParentescoDependente(e.target.value),
                }))
              }
            />
            <Input
              label="Data de Nascimento"
              type="date"
              value={novoBeneficiario.data_nascimento}
              onChange={(e) => setNovoBeneficiario((prev) => ({ ...prev, data_nascimento: e.target.value }))}
            />
          </div>
          <Input
            label="Data de filiação no contrato *"
            type="date"
            min={limitesFiliacaoDependente?.min}
            max={limitesFiliacaoDependente?.max}
            value={novoBeneficiario.data_inclusao}
            onChange={(e) =>
              setNovoBeneficiario((prev) => ({
                ...prev,
                data_inclusao: (e.target.value || '').slice(0, 10),
              }))
            }
            helperText={`${mensagemLimiteDataFiliacaoDependente(dataContratoRefDependente)} Digite (DD/MM/AAAA) ou use o calendário.`}
            required
          />
          <p className="text-[10px] text-gray-500 dark:text-slate-400 -mt-2">
            Data em que o dependente passa a fazer parte do plano. A carência de {diasCarenciaDependente} dias
            começa nesta data.
          </p>
          <BeneficiarioCarenciaPreview
            dataInclusao={novoBeneficiario.data_inclusao}
            diasCarencia={diasCarenciaDependente}
            nome={novoBeneficiario.nome}
          />
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddBeneficiarioOpen(false);
                setContratoParaDependente(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={savingBeneficiario}>
              Salvar Dependente
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Beneficiario Modal */}
      <Modal 
        isOpen={isEditBeneficiarioOpen} 
        onClose={() => setIsEditBeneficiarioOpen(false)}
        title="Editar Dependente"
      >
        <form onSubmit={handleUpdateBeneficiario} className="space-y-4">
          <Input 
            label="Nome Completo" 
            value={editingBeneficiario?.nome || ''} 
            onChange={e => setEditingBeneficiario(prev => prev ? {...prev, nome: e.target.value} : null)}
            required 
          />
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="CPF" 
              value={editingBeneficiario?.cpf || ''} 
              onChange={e => setEditingBeneficiario(prev => prev ? {...prev, cpf: e.target.value} : null)}
            />
            <ParentescoDependenteSelect
              label="Parentesco"
              value={editingBeneficiario?.parentesco || ''}
              onChange={(e) =>
                setEditingBeneficiario((prev) =>
                  prev
                    ? { ...prev, parentesco: normalizarParentescoDependente(e.target.value) }
                    : null,
                )
              }
            />
          </div>
          {editingBeneficiario && (
            <>
              <p className="text-xs text-gray-600 dark:text-slate-300 bg-gray-50 border rounded-lg px-3 py-2">
                <strong>Data de filiação:</strong>{' '}
                {formatarDataIsoPtBr(dataInclusaoBeneficiario(editingBeneficiario))}
                {' '}
                (não alterável aqui — registre novo dependente se a filiação for outra data)
              </p>
              <BeneficiarioCarenciaInfo
                dataInclusao={dataInclusaoBeneficiario(editingBeneficiario)}
                diasCarencia={diasCarenciaDoBeneficiario(editingBeneficiario)}
                dataFimCarencia={editingBeneficiario.data_fim_carencia}
                carenciaAtiva={editingBeneficiario.carencia_ativa}
              />
            </>
          )}
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <input 
              type="checkbox" 
              id="ativo_benef" 
              checked={editingBeneficiario?.ativo ?? true}
              onChange={e => setEditingBeneficiario(prev => prev ? {...prev, ativo: e.target.checked} : null)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <Label htmlFor="ativo_benef" className="mb-0 cursor-pointer">Dependente Ativo no Contrato</Label>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsEditBeneficiarioOpen(false)}>Cancelar</Button>
            <Button type="submit">Salvar Alterações</Button>
          </div>
        </form>
      </Modal>

      {openParcelaMenuId && parcelaEmMenu && parcelaMenuPosition && (
        <DropdownMenuContent
          isOpen
          onClose={() => setOpenParcelaMenuId(null)}
          position={parcelaMenuPosition}
        >
          <div className="px-3 py-2 border-b mb-1">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Ações</p>
            <p className="text-[10px] text-gray-400 truncate font-mono">{parcelaEmMenu.codigo}</p>
          </div>
          {podeReceberParcela(parcelaEmMenu.status) && (
            <DropdownMenuItem
              onClick={() => {
                handleReceberParcela(enriquecerParcela(parcelaEmMenu));
                setOpenParcelaMenuId(null);
              }}
            >
              <DollarSign className="h-4 w-4 mr-2 text-emerald-500" /> Dar baixa / Receber
            </DropdownMenuItem>
          )}
          {podeReceberParcela(parcelaEmMenu.status) && (
            <DropdownMenuItem
              onClick={() => abrirProrrogarParcela(enriquecerParcela(parcelaEmMenu))}
            >
              <CalendarClock className="h-4 w-4 mr-2 text-violet-500" /> Prorrogar vencimento
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              handleReceberParcela(enriquecerParcela(parcelaEmMenu));
              setOpenParcelaMenuId(null);
            }}
          >
            <Eye className="h-4 w-4 mr-2 text-gray-400" /> Ver / editar título
          </DropdownMenuItem>
          {['pago', 'pago_parcial'].includes((parcelaEmMenu.status || '').toLowerCase()) && (
            <DropdownMenuItem
              onClick={() => {
                setParcelaDetalheBaixa(enriquecerParcela(parcelaEmMenu));
                setOpenParcelaMenuId(null);
              }}
            >
              <FileSearch className="h-4 w-4 mr-2 text-indigo-500" /> Detalhes da baixa
            </DropdownMenuItem>
          )}
          {(parcelaEmMenu.status || '').toLowerCase() === 'pago' && (
            <DropdownMenuItem
              onClick={() => {
                handlePrintRecibo(enriquecerParcela(parcelaEmMenu));
                setOpenParcelaMenuId(null);
              }}
            >
              <Printer className="h-4 w-4 mr-2 text-blue-500" /> Reimprimir recibo
            </DropdownMenuItem>
          )}
          {(parcelaEmMenu.status || '').toLowerCase() === 'pago' && (
            <DropdownMenuItem
              onClick={() => {
                void handleEstornarParcela(enriquecerParcela(parcelaEmMenu));
                setOpenParcelaMenuId(null);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2 text-amber-500" /> Estornar baixa
            </DropdownMenuItem>
          )}
          {['aberto', 'vencido', 'pendente', 'cancelado', 'estornado'].includes((parcelaEmMenu.status || '').toLowerCase()) && (
            <DropdownMenuItem
              onClick={() => {
                void handleExcluirParcela(enriquecerParcela(parcelaEmMenu));
                setOpenParcelaMenuId(null);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2 text-rose-500" /> Excluir Parcela
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      )}

      {showReceberModal && contaParaReceber && (
        <ReceberPagamentoModal
          conta={contaParaReceber}
          onClose={() => { setShowReceberModal(false); setContaParaReceber(null); }}
          onSuccess={() => void handlePaymentSuccess()}
        />
      )}

      {parcelaDetalheBaixa && (
        <DetalhesBaixaParcelaModal
          contaReceberId={parcelaDetalheBaixa.id}
          parcelaCodigo={parcelaDetalheBaixa.codigo}
          onClose={() => setParcelaDetalheBaixa(null)}
        />
      )}

      {showNovaParcelaModal && id && (
        <NovaContaReceberModal
          clienteId={id}
          assinaturaId={contratoFilter !== 'todos' ? contratoFilter : (contratoPrincipal?.id || assinaturas[0]?.id)}
          ocultarPagamento={true}
          onClose={() => setShowNovaParcelaModal(false)}
          onSuccess={async () => {
            setShowNovaParcelaModal(false);
            await recarregarMensalidades();
            await recarregarAuditoria();
          }}
        />
      )}

      {contratoEntregaModal && (
        <GerenciarEntregaContratoModal
          isOpen={contratoEntregaModal !== null}
          contrato={contratoEntregaModal}
          onClose={() => setContratoEntregaModal(null)}
          onSuccess={async () => {
            setContratoEntregaModal(null);
            if (id) {
              await loadAssinaturas(id);
              await recarregarAuditoria();
            }
          }}
        />
      )}

      <Modal
        isOpen={showProrrogarModal}
        onClose={() => { if (!salvandoProrrogacao) { setShowProrrogarModal(false); setParcelaParaProrrogar(null); } }}
        title="Prorrogar vencimento"
      >
        {parcelaParaProrrogar && (
          <form onSubmit={handleConfirmarProrrogacao} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Parcela <span className="font-mono font-semibold">{parcelaParaProrrogar.codigo}</span>
              {' · '}vencimento atual:{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {new Date(parcelaParaProrrogar.data_vencimento).toLocaleDateString('pt-BR')}
              </span>
            </p>
            <Input
              label="Nova data de vencimento"
              type="date"
              value={novaDataProrrogacao}
              onChange={(e) => setNovaDataProrrogacao(e.target.value)}
              required
            />
            <Textarea
              label="Motivo (opcional)"
              value={motivoProrrogacao}
              onChange={(e) => setMotivoProrrogacao(e.target.value)}
              placeholder="Ex.: acordo com o cliente, dificuldade financeira..."
              rows={3}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={salvandoProrrogacao}
                onClick={() => { setShowProrrogarModal(false); setParcelaParaProrrogar(null); }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoProrrogacao}>
                {salvandoProrrogacao ? 'Salvando...' : 'Confirmar prorrogação'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={isObitoBeneficiarioOpen}
        onClose={() => {
          if (registrandoObito) return;
          setIsObitoBeneficiarioOpen(false);
          setBeneficiarioObito(null);
        }}
        title="Registrar óbito do dependente"
        size="md"
      >
        {beneficiarioObito && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm text-gray-800">
              <p className="font-semibold">{beneficiarioObito.nome}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                {beneficiarioObito.parentesco || 'Dependente'} — será marcado como <strong>falecido</strong> e{' '}
                <strong>inativado</strong> no plano (baixa). Continua no histórico do contrato.
              </p>
            </div>
            <div>
              <Label>Data do óbito *</Label>
              <Input
                type="date"
                value={dataObitoBeneficiario}
                onChange={(e) => setDataObitoBeneficiario(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Motivo / observação (opcional)</Label>
              <Textarea
                value={motivoObitoBeneficiario}
                onChange={(e) => setMotivoObitoBeneficiario(e.target.value)}
                rows={2}
                placeholder="Ex.: óbito natural, atestado nº..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={registrandoObito}
                onClick={() => {
                  setIsObitoBeneficiarioOpen(false);
                  setBeneficiarioObito(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                loading={registrandoObito}
                disabled={!dataObitoBeneficiario}
                onClick={() => void handleConfirmarObitoBeneficiario()}
              >
                Confirmar óbito e baixa
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isPromoverTitularOpen}
        onClose={() => {
          if (promovendoTitular) return;
          setIsPromoverTitularOpen(false);
          setBeneficiarioPromover(null);
        }}
        title="Tornar dependente titular do contrato"
        size="md"
      >
        {beneficiarioPromover && clienteAtivo && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-amber-950 text-sm">
              <p className="font-semibold flex items-center gap-2">
                <Crown className="h-4 w-4 shrink-0" />
                Troca de titular
              </p>
              <p className="mt-2 text-xs leading-relaxed opacity-90">
                O cadastro e o contrato <strong>continuam com o mesmo número</strong>. Os dados do titular atual (
                <strong>{clienteAtivo.nome}</strong>) serão substituídos pelos do dependente{' '}
                <strong>{beneficiarioPromover.nome}</strong> ({beneficiarioPromover.parentesco || 'dependente'}).
              </p>
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Textarea
                value={motivoPromoverTitular}
                onChange={(e) => setMotivoPromoverTitular(e.target.value)}
                rows={2}
                placeholder="Ex.: falecimento do titular"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={registrarExTitular}
                onChange={(e) => setRegistrarExTitular(e.target.checked)}
              />
              <span>
                Registrar o titular anterior como dependente inativo (&quot;Ex-titular (falecido)&quot;) para histórico
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={promovendoTitular}
                onClick={() => {
                  setIsPromoverTitularOpen(false);
                  setBeneficiarioPromover(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="button" loading={promovendoTitular} onClick={() => void handleConfirmarPromoverTitular()}>
                Confirmar novo titular
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isMigracaoCobrancaOpen}
        onClose={() => !reiniciandoCobrancaMigracao && setIsMigracaoCobrancaOpen(false)}
        title="Reiniciar cobrança — transferência de outra funerária"
      >
        {assinaturaMigracaoCobranca ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
              Use quando o cliente veio de outra funerária e o sistema gerou parcelas retroativas que a Fênix
              não vai cobrar. O <strong>tempo de contrato</strong> (
              {formatarDataIsoPtBr(assinaturaMigracaoCobranca.data_contratacao)}) permanece para histórico e
              carência; apenas a <strong>cobrança</strong> passa a valer a partir de hoje.
            </p>
            <ul className="text-xs text-gray-500 dark:text-slate-400 list-disc pl-5 space-y-1">
              <li>Exclui parcelas em aberto/vencidas anteriores ao mês atual (sem pagamento registrado)</li>
              <li>Gera 12 novas mensalidades a partir do próximo vencimento</li>
            </ul>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={reiniciandoCobrancaMigracao}
                onClick={() => setIsMigracaoCobrancaOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                loading={reiniciandoCobrancaMigracao}
                onClick={() => void handleReiniciarCobrancaMigracao()}
              >
                Reiniciar cobrança
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal 
        isOpen={isDeleteConfirmOpen} 
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Remover Dependente"
      >
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 rounded-2xl flex items-start gap-3 text-rose-800">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold text-sm">Esta ação é irreversível!</p>
              <p className="text-xs opacity-80 leading-relaxed">O dependente será removido permanentemente deste contrato. Todos os benefícios associados serão revogados.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Manter Dependente</Button>
            <Button variant="danger" onClick={handleDeleteBeneficiario}>Remover Permanentemente</Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Assinatura Digital */}
      {assinaturaDigitalContrato && (
        <EnviarParaAssinaturaModal
          open
          onClose={() => setAssinaturaDigitalContrato(null)}
          cliente={cliente}
          assinatura={assinaturaDigitalContrato}
          empresaId={empresaIdEfetivo || assinaturaDigitalContrato.empresa_id}
          onEnviado={() => {
            showToast('Assinatura digital enviada com sucesso!', 'success');
            void recarregarAssinaturasDigitais();
          }}
        />
      )}
    </div>
  );
};
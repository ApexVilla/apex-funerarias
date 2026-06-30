import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CreditCard, MessageCircle } from 'lucide-react';
import { validarWhatsapp } from '../../lib/whatsappValidacao';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Input, Select, Card, Textarea } from '../../components/ui/Components';
import { useClienteStore, ClienteSB, type BeneficiarioSB } from '../../lib/ClienteStore';
import { clienteMatchBusca } from '../../lib/buscaCliente';
import { normalizarSexoCliente } from '../../lib/normalizarSexoCliente';
import { supabase } from '../../lib/supabase';
import { usePlanosStore } from '../../lib/PlanosStore';
import { useFinanceiro } from '../../lib/FinanceiroStore';
import { useToast } from '../../lib/ToastStore';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { useFilial } from '../../lib/FilialContext';
import { unidadeNomeCurto } from '../../lib/contextoUnidadeLabels';
import { validarBeneficiariosOpcionais } from '../../lib/beneficiarioValidacaoCliente';
import { BeneficiarioCarenciaPreview } from '../../components/clientes/BeneficiarioCarenciaInfo';
import { BeneficiariosCadastroTabela } from '../../components/clientes/BeneficiariosCadastroTabela';
import { ParentescoDependenteSelect } from '../../components/clientes/ParentescoDependenteSelect';
import { normalizarParentescoDependente } from '../../lib/parentescoDependente';
import {
  aplicarCarenciaBeneficiarioPayload,
  diasCarenciaDependenteDoPlano,
  formatarResumoCarenciaContrato,
  limitesDataFiliacaoDependente,
  mensagemLimiteDataFiliacaoDependente,
} from '../../lib/beneficiarioCarencia';
import {
  atribuirCobradorCarteiraCliente,
  loadCobradoresAtivosParaUnidade,
  mapaCobradorInfoPorCliente,
  mapaCobradorNomePorCliente,
  type CobradorOpcao,
} from '../../lib/cobradorDisponiveis';
import {
  bairroCobrancaCliente,
  loadCobradoresComBairrosAtivos,
  resolverCobradorSugeridoPorBairro,
  type CobradorComBairros,
} from '../../lib/cobradorSugestaoBairro';
import {
  carregarAssinaturaAtivaCliente,
  carregarBeneficiariosClienteForm,
  patchFormularioContratoDesdeCliente,
  resolverDataInicioContratoDesdeCliente,
  resolverDataInicioContratoParaAssinatura,
  resolverDiaVencimentoForm,
} from '../../lib/clienteContratoFormLoad';
import {
  loadVendedoresDisponiveis,
  normalizarVendedorIdForm,
  rotuloVendedorForm,
  tipoVendedorParaSalvar,
  VENDEDOR_ESCRITORIO_ID,
  vendedorIdParaSalvar,
  type VendedorOpcao,
} from '../../lib/vendedoresDisponiveis';
import {
  mensagemErroCadastroCliente,
  mensagemErroContrato,
  mensagemErroAtualizarCliente,
  mensagemErroDependente,
  mensagemErroSupabase,
} from '../../lib/supabaseErrorMessage';
import { atribuirClienteCarteiraEscritorio } from '../../lib/carteiraEscritorio';
import {
  calcularPrimeiroVencimento30DiasApos,
  contarMensalidadesAte,
  dataHojeIsoLocal,
  detectarPossivelTypoAnoMigracao,
  formatarDataIsoPtBr,
  mensagemPossivelTypoAnoMigracao,
  normalizarDataIso,
  ultimoVencimentoCompetenciaProvavel,
} from '../../lib/contratoDatas';
import { ClientePendenciasCadastro } from '../../components/clientes/ClientePendenciasCadastro';
import { calcularCompletudeCadastroCliente } from '../../lib/clienteCompletudeCadastro';
import {
  buscarClienteDuplicado,
  mensagemClienteDuplicado,
  validarCpfObrigatorioNovoCliente,
  validarCpfSeInformado,
  ORIGEM_CANAL_MIGRACAO,
} from '../../lib/clienteDuplicidade';
import {
  gerarParcelasContratoMigracao,
  resolverDatasContratoMigracao,
} from '../../lib/contratoMigracao';
import {
  usuarioPodeCriarContratoGestao,
  usuarioPodeCriarContratoMigracaoCliente,
} from '../../lib/clienteContratoPermissoes';
import { resolverUfParaSelect, UF_SIGLAS, ufBrasilValida } from '../../lib/ufBrasil';
const CLIENTE_FORM_DRAFT_KEY = 'funeraria_cliente_form_draft';
const CONTRATO_FORM_DRAFT_KEY = 'funeraria_contrato_form_draft';
const ULTIMOS_CLIENTES_NOVO_CONTRATO = 4;

export const ClienteForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { id } = useParams();
  const {
    clientes, loadClientes, buscarClientes, createCliente, updateCliente, loadClienteById,
    createAssinatura, createBeneficiario, updateBeneficiario, deleteBeneficiario,
    assinaturas, loadAssinaturas, error,
  } = useClienteStore();
  const { planos } = usePlanosStore();
  const { gerarMensalidadesMes, gerarMensalidadesComHistorico } = useFinanceiro();
  const { user } = useAuth();
  const {
    empresaIdEfetivo,
    empresasDoGrupo,
    visaoTodasEmpresasGrupo,
    podeAlternarEmpresa,
    empresaIdsParaFiltro,
    dataRevisionEmpresa,
  } = useEmpresaContextoAtivo();
  const { dataRevision: dataRevisionFilial } = useFilial();
  const empresaId = (empresaIdEfetivo || user?.empresa_id || '').trim();
  const multiEmpresa = podeAlternarEmpresa && empresasDoGrupo.length > 1;
  const tokenUnidadeGrupo = useMemo(() => {
    if (visaoTodasEmpresasGrupo) return '';
    const nome = empresasDoGrupo.find((e) => e.id === empresaId)?.nome || '';
    return unidadeNomeCurto(nome);
  }, [visaoTodasEmpresasGrupo, empresasDoGrupo, empresaId]);
  const isEdit = !!id;
  const isContractFlow = useMemo(
    () => new URLSearchParams(location.search).get('modo') === 'contrato' && !isEdit,
    [location.search, isEdit]
  );
  const clienteIdContratoUrl = useMemo(() => {
    if (!isContractFlow) return '';
    return new URLSearchParams(location.search).get('cliente')?.trim() || '';
  }, [isContractFlow, location.search]);

  const maskCpf = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const [loading, setLoading] = useState(false);
  const cepAbortController = useRef<AbortController | null>(null);
  const submitIntentRef = useRef(false);
  const [step, setStep] = useState(1);
  const [criarContratoAgora, setCriarContratoAgora] = useState(false);
  const incluiContratoNoCadastro = !isEdit && !isContractFlow && criarContratoAgora;
  const stepLabels = useMemo(() => {
    if (isContractFlow) {
      return ['Cliente', 'Contrato & Dependentes', 'Revisão'];
    }
    if (isEdit) {
      return ['Dados Pessoais', 'Endereço', 'Dependentes', 'Financeiro', 'Revisão'];
    }
    const labels = ['Dados Pessoais', 'Endereço', 'Dependentes', 'Financeiro'];
    if (criarContratoAgora) labels.push('Contrato');
    labels.push('Revisão');
    return labels;
  }, [isContractFlow, isEdit, criarContratoAgora]);
  const TOTAL_STEPS = stepLabels.length;
  const contratoStepNum = useMemo(() => {
    if (!incluiContratoNoCadastro) return null;
    const idx = stepLabels.indexOf('Contrato');
    return idx >= 0 ? idx + 1 : null;
  }, [incluiContratoNoCadastro, stepLabels]);
  const [clienteBusca, setClienteBusca] = useState('');
  const [clientesBuscaRemota, setClientesBuscaRemota] = useState<ClienteSB[]>([]);
  const [cobradoresDisponiveis, setCobradoresDisponiveis] = useState<CobradorOpcao[]>([]);
  const [vendedoresDisponiveis, setVendedoresDisponiveis] = useState<VendedorOpcao[]>([]);
  const [loadingVendedores, setLoadingVendedores] = useState(false);
  const [loadingCobradores, setLoadingCobradores] = useState(false);
  const [cobradoresComBairros, setCobradoresComBairros] = useState<CobradorComBairros[]>([]);
  const cobradorEscolhidoManualRef = useRef(false);
  const bairroCobradorAnteriorRef = useRef('');
  const [cobradorNomePorClienteId, setCobradorNomePorClienteId] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [loadingClienteContrato, setLoadingClienteContrato] = useState(false);
  const draftRestoredRef = useRef(false);
  const beneficiariosOriginaisRef = useRef<string[]>([]);
  const clienteContratoLoadRef = useRef(0);
  const [rascunhoSalvoEm, setRascunhoSalvoEm] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (cepAbortController.current) {
        cepAbortController.current.abort();
      }
    };
  }, []);

  const [form, setForm] = useState({
    nome: '', nome_social: '', cpf: '', rg: '',
    email: '', telefone_principal: '', whatsapp: '',
    data_nascimento: '', sexo: '', estado_civil: '',
    profissao: '', nome_mae: '', nome_pai: '',
    /** Contrato antigo importado — permite cadastrar sem CPF. */
    cadastro_migracao: false,
    // Endereço
    endereco_cep: '', endereco_logradouro: '', endereco_numero: '',
    endereco_complemento: '', endereco_bairro: '', endereco_cidade: '', endereco_estado: '',
    // Endereço de Cobrança
    usa_endereco_residencial_cobranca: true,
    endereco_cob_cep: '', endereco_cob_logradouro: '', endereco_cob_numero: '',
    endereco_cob_complemento: '', endereco_cob_bairro: '', endereco_cob_cidade: '', endereco_cob_estado: '',
    // Dados comerciais internos
    tipo_cliente: 'titular',
    nivel_relacionamento: 'regular', origem_canal: '', tipo_vendedor: '', vendedor_id: '',
    cliente_vip: false,
    // Financeiro
    forma_pagamento_preferencial: '',
    cobrador_id: '',
    // Observações
    observacoes: '',
    // Contrato (Novo)
    plano_id: '',
    dia_vencimento: '5',
    /** Data de entrada do contato na base (migração / histórico comercial) → `clientes.cliente_desde`. */
    data_entrada_cliente: dataHojeIsoLocal(),
    /** Início formal do contrato; base para `data_contratacao` e primeiro vencimento. */
    data_inicio_contrato: dataHojeIsoLocal(),
    /** Marcar para contrato antigo em migração (histórico de mensalidades pagas). */
    contrato_migracao: false,
    /** Cobrança na Fênix só a partir de hoje (sem parcelas retroativas). */
    migracao_cobrar_apenas_fenix: true,
    /** Vencimento da última mensalidade já quitada (migração). */
    data_ultima_mensalidade_paga: '',
    /** Data em que o cliente efetuou o último pagamento. */
    data_registro_ultimo_pagamento: '',
    beneficiarios: [] as {
      id?: string;
      nome: string;
      parentesco: string;
      data_nascimento: string;
      data_inclusao: string;
      cpf?: string;
      rg?: string;
    }[],
  });

  const diaVencimentoNum = useMemo(() => {
    const d = parseInt(String(form.dia_vencimento || '5'), 10);
    return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 5;
  }, [form.dia_vencimento]);

  /** Contrato novo: início = entrada na base; migração: data histórica informada no plano. */
  const dataInicioContratoEfetiva = useMemo(
    () =>
      resolverDataInicioContratoParaAssinatura({
        contratoMigracao: !!form.contrato_migracao,
        dataEntradaForm: form.data_entrada_cliente,
        dataInicioForm: form.data_inicio_contrato,
      }),
    [form.contrato_migracao, form.data_inicio_contrato, form.data_entrada_cliente],
  );

  const primeiroVencimentoCalc = useMemo(() => {
    if (!dataInicioContratoEfetiva) return '';
    return calcularPrimeiroVencimento30DiasApos(dataInicioContratoEfetiva);
  }, [dataInicioContratoEfetiva]);

  const contratoMigracao = form.contrato_migracao;
  /** Contrato antigo em migração também dispensa CPF (mesmo efeito de "Cadastro de migração"). */
  const migracaoSemCpfObrigatorio =
    form.cadastro_migracao || form.contrato_migracao;

  const migracaoCobrarApenasFenix = form.migracao_cobrar_apenas_fenix;

  const datasContratoMigracao = useMemo(() => {
    if (!dataInicioContratoEfetiva) return null;
    return resolverDatasContratoMigracao({
      contratoMigracao: !!form.contrato_migracao,
      migracaoCobrarApenasFenix,
      dataInicioContrato: dataInicioContratoEfetiva,
      dataUltimaMensalidadePaga: form.data_ultima_mensalidade_paga,
      dataRegistroUltimoPagamento: form.data_registro_ultimo_pagamento,
      diaVencimento: diaVencimentoNum,
    });
  }, [
    form.contrato_migracao,
    migracaoCobrarApenasFenix,
    dataInicioContratoEfetiva,
    form.data_ultima_mensalidade_paga,
    form.data_registro_ultimo_pagamento,
    diaVencimentoNum,
  ]);

  const primeiroVencimentoExibicao =
    contratoMigracao && datasContratoMigracao
      ? datasContratoMigracao.dataPrimeiroVencimento
      : primeiroVencimentoCalc;

  const qtdMensalidadesPagas = useMemo(() => {
    if (!contratoMigracao || migracaoCobrarApenasFenix || !form.data_ultima_mensalidade_paga) return 0;
    if (!primeiroVencimentoExibicao) return 0;
    return contarMensalidadesAte(
      primeiroVencimentoExibicao,
      form.data_ultima_mensalidade_paga,
      diaVencimentoNum,
    );
  }, [
    contratoMigracao,
    migracaoCobrarApenasFenix,
    form.data_ultima_mensalidade_paga,
    primeiroVencimentoExibicao,
    diaVencimentoNum,
  ]);

  useEffect(() => {
    if ((!isContractFlow && !incluiContratoNoCadastro) || !form.plano_id || !form.contrato_migracao) return;
    if (form.migracao_cobrar_apenas_fenix) return;
    const sugestao = ultimoVencimentoCompetenciaProvavel(diaVencimentoNum);
    setForm((p) => ({
      ...p,
      data_ultima_mensalidade_paga: p.data_ultima_mensalidade_paga || sugestao,
      data_registro_ultimo_pagamento: p.data_registro_ultimo_pagamento || dataHojeIsoLocal(),
    }));
  }, [
    isContractFlow,
    incluiContratoNoCadastro,
    form.plano_id,
    form.contrato_migracao,
    form.migracao_cobrar_apenas_fenix,
    diaVencimentoNum,
  ]);
  const draftKey = useMemo(
    () => (isContractFlow ? CONTRATO_FORM_DRAFT_KEY : CLIENTE_FORM_DRAFT_KEY),
    [isContractFlow]
  );

  const salvarRascunhoNoStorage = useCallback(() => {
    if (isEdit || isContractFlow) return false;
    try {
      const savedAt = new Date().toISOString();
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          form,
          step,
          clienteBusca,
          clienteSelecionadoId,
          criarContratoAgora,
          savedAt,
        }),
      );
      setRascunhoSalvoEm(savedAt);
      return true;
    } catch (err) {
      console.error('Erro ao salvar rascunho de cliente/contrato', err);
      return false;
    }
  }, [draftKey, isEdit, isContractFlow, form, step, clienteBusca, clienteSelecionadoId, criarContratoAgora]);

  const handleSalvarRascunho = () => {
    if (salvarRascunhoNoStorage()) {
      showToast('Rascunho salvo. Você pode sair e continuar depois.', 'success');
    } else {
      showToast('Não foi possível salvar o rascunho.', 'error');
    }
  };

  const handleDescartarRascunho = () => {
    if (!window.confirm('Descartar o rascunho deste cadastro? Os dados preenchidos serão apagados.')) return;
    sessionStorage.removeItem(draftKey);
    setRascunhoSalvoEm(null);
    setCriarContratoAgora(false);
    setStep(1);
    setClienteBusca('');
    setClienteSelecionadoId('');
    setForm({
      nome: '', nome_social: '', cpf: '', rg: '',
      email: '', telefone_principal: '', whatsapp: '',
      data_nascimento: '', sexo: '', estado_civil: '',
      profissao: '', nome_mae: '', nome_pai: '',
      cadastro_migracao: false,
      endereco_cep: '', endereco_logradouro: '', endereco_numero: '',
      endereco_complemento: '', endereco_bairro: '', endereco_cidade: '', endereco_estado: '',
      usa_endereco_residencial_cobranca: true,
      endereco_cob_cep: '', endereco_cob_logradouro: '', endereco_cob_numero: '',
      endereco_cob_complemento: '', endereco_cob_bairro: '', endereco_cob_cidade: '', endereco_cob_estado: '',
      tipo_cliente: 'titular',
      nivel_relacionamento: 'regular', origem_canal: '', tipo_vendedor: '', vendedor_id: '',
      cliente_vip: false,
      forma_pagamento_preferencial: '',
    cobrador_id: '',
      observacoes: '',
      plano_id: '',
      dia_vencimento: '5',
      data_entrada_cliente: dataHojeIsoLocal(),
      data_inicio_contrato: dataHojeIsoLocal(),
      contrato_migracao: false,
      migracao_cobrar_apenas_fenix: true,
      data_ultima_mensalidade_paga: '',
      data_registro_ultimo_pagamento: '',
      beneficiarios: [],
    });
    showToast('Rascunho descartado.', 'info');
  };

  const handleCriarContratoToggle = (ativo: boolean) => {
    const revisaoSemContrato = 5;
    const contratoComToggle = 5;
    const revisaoComContrato = 6;
    setCriarContratoAgora(ativo);
    if (!ativo) {
      if (step === contratoComToggle) setStep(4);
      else if (step === revisaoComContrato) setStep(revisaoSemContrato);
      setForm((p) => ({
        ...p,
        plano_id: '',
        dia_vencimento: '5',
        contrato_migracao: false,
        data_inicio_contrato: dataHojeIsoLocal(),
        data_ultima_mensalidade_paga: '',
        data_registro_ultimo_pagamento: '',
      }));
    } else if (step === revisaoSemContrato) {
      setStep(contratoComToggle);
    }
  };

  const handlePularContrato = () => {
    setForm((p) => ({
      ...p,
      plano_id: '',
      dia_vencimento: '5',
      contrato_migracao: false,
      data_inicio_contrato: dataHojeIsoLocal(),
      data_ultima_mensalidade_paga: '',
      data_registro_ultimo_pagamento: '',
    }));
    setCriarContratoAgora(false);
    setStep(5);
  };

  useEffect(() => {
    if (isEdit || isContractFlow || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        form?: Partial<typeof form>;
        step?: number;
        clienteBusca?: string;
        clienteSelecionadoId?: string;
        criarContratoAgora?: boolean;
        savedAt?: string;
      };
      if (typeof draft.criarContratoAgora === 'boolean') {
        setCriarContratoAgora(draft.criarContratoAgora);
      }
      if (draft.form) {
        const df = draft.form as Partial<typeof form>;
        setForm((prev) => ({
          ...prev,
          ...df,
          endereco_estado: resolverUfParaSelect(df.endereco_estado) || resolverUfParaSelect(prev.endereco_estado),
          endereco_cob_estado:
            resolverUfParaSelect(df.endereco_cob_estado) || resolverUfParaSelect(prev.endereco_cob_estado),
          beneficiarios: Array.isArray(df.beneficiarios) ? df.beneficiarios : prev.beneficiarios,
        }));
      }
      if (typeof draft.step === 'number' && draft.step >= 1) {
        const maxStep = draft.criarContratoAgora ? 6 : 5;
        setStep(Math.min(draft.step, maxStep));
      }
      if (typeof draft.clienteBusca === 'string') setClienteBusca(draft.clienteBusca);
      if (typeof draft.clienteSelecionadoId === 'string') setClienteSelecionadoId(draft.clienteSelecionadoId);
      if (typeof draft.savedAt === 'string') setRascunhoSalvoEm(draft.savedAt);
      const tinhaDados =
        Boolean(draft.form?.nome?.trim()) ||
        Boolean(draft.form?.cpf?.trim()) ||
        Boolean(draft.form?.telefone_principal?.trim());
      if (tinhaDados) {
        showToast('Continuando o cadastro de onde você parou.', 'info');
      }
    } catch (err) {
      console.error('Erro ao restaurar rascunho de cliente/contrato', err);
    }
  }, [draftKey, isEdit, isContractFlow, showToast]);

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isEdit || isContractFlow) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      salvarRascunhoNoStorage();
    }, 500);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [isEdit, isContractFlow, salvarRascunhoNoStorage]);

  useEffect(() => {
    if (!isContractFlow) return;
    // Fluxo de novo contrato sempre inicia limpo para evitar pular etapas por rascunho antigo.
    setStep(1);
    setClienteBusca('');
    setClienteSelecionadoId(clienteIdContratoUrl);
    sessionStorage.removeItem(CONTRATO_FORM_DRAFT_KEY);
    const hoje = dataHojeIsoLocal();
    setForm((p) => ({
      ...p,
      plano_id: '',
      dia_vencimento: '5',
      beneficiarios: [],
      data_entrada_cliente: hoje,
      data_inicio_contrato: hoje,
      contrato_migracao: false,
    }));
  }, [isContractFlow, clienteIdContratoUrl]);

  useEffect(() => {
    if (isContractFlow) {
      loadClientes();
    }
  }, [isContractFlow, loadClientes]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const c = await loadClienteById(id);
      if (!c || cancelled) return;

      const bens = await carregarBeneficiariosClienteForm(id);
      if (cancelled) return;
      beneficiariosOriginaisRef.current = bens.map((b) => b.id).filter(Boolean) as string[];

      const assinaturaAtiva = await carregarAssinaturaAtivaCliente(id);
      if (cancelled) return;
      await loadAssinaturas(id);

      const idsConsulta =
        (empresaIdsParaFiltro || []).length > 0
          ? empresaIdsParaFiltro
          : empresaIdEfetivo
            ? [empresaIdEfetivo]
            : c.empresa_id
              ? [c.empresa_id]
              : [];
      const cobInfo =
        idsConsulta.length > 0 ? await mapaCobradorInfoPorCliente(idsConsulta) : new Map();
      if (cancelled) return;

      const cobradorCarteira = cobInfo.get(id);
      let cobradorId = cobradorCarteira?.id || c.cobrador_id || '';
      if (
        !cobradorId &&
        (c.forma_pagamento_preferencial || '') === 'cobrador' &&
        idsConsulta.length > 0
      ) {
        const bairro = bairroCobrancaCliente({
          usaEnderecoResidencialCobranca: c.usa_endereco_residencial_cobranca,
          enderecoBairro: c.endereco_bairro,
          enderecoCobBairro: c.endereco_cob_bairro,
        });
        const sugerido = await resolverCobradorSugeridoPorBairro(
          bairro,
          await loadCobradoresComBairrosAtivos(idsConsulta),
        );
        if (sugerido) cobradorId = sugerido.id;
      }

      if (cobradorId) cobradorEscolhidoManualRef.current = true;

      const diaVencimento = resolverDiaVencimentoForm({
        assinaturaAtiva,
        diaVencimentoPreferido: c.dia_vencimento_preferido,
      });

      setForm({
            nome: c.nome || '',
            nome_social: c.nome_social || '',
            cpf: c.cpf || '',
            rg: c.rg || '',
            email: c.email || '',
            telefone_principal: c.telefone_principal || '',
            whatsapp: c.whatsapp || '',
            data_nascimento: c.data_nascimento || '',
            sexo: normalizarSexoCliente(c.sexo) || '',
            estado_civil: c.estado_civil || '',
            profissao: c.profissao || '',
            nome_mae: c.nome_mae || '',
            nome_pai: c.nome_pai || '',
            cadastro_migracao: (c.origem_canal || '').toLowerCase() === ORIGEM_CANAL_MIGRACAO,
            endereco_cep: c.endereco_cep || '',
            endereco_logradouro: c.endereco_logradouro || '',
            endereco_numero: c.endereco_numero || '',
            endereco_complemento: c.endereco_complemento || '',
            endereco_bairro: c.endereco_bairro || '',
            endereco_cidade: c.endereco_cidade || '',
            endereco_estado: resolverUfParaSelect(c.endereco_estado),
            usa_endereco_residencial_cobranca: c.usa_endereco_residencial_cobranca !== false,
            endereco_cob_cep: c.endereco_cob_cep || '',
            endereco_cob_logradouro: c.endereco_cob_logradouro || '',
            endereco_cob_numero: c.endereco_cob_numero || '',
            endereco_cob_complemento: c.endereco_cob_complemento || '',
            endereco_cob_bairro: c.endereco_cob_bairro || '',
            endereco_cob_cidade: c.endereco_cob_cidade || '',
            endereco_cob_estado: resolverUfParaSelect(c.endereco_cob_uf),
            tipo_cliente: c.tipo_cliente || 'titular',
            nivel_relacionamento: c.nivel_relacionamento || 'regular',
            origem_canal: c.origem_canal || '',
            tipo_vendedor: c.tipo_vendedor || '',
            vendedor_id:
              c.tipo_vendedor === 'escritorio' || !c.vendedor_id
                ? VENDEDOR_ESCRITORIO_ID
                : c.vendedor_id,
            cliente_vip: c.cliente_vip || false,
            forma_pagamento_preferencial: c.forma_pagamento_preferencial || '',
            cobrador_id: cobradorId,
            observacoes: '',
            beneficiarios: bens,
            plano_id: assinaturaAtiva?.plano_id || '',
            dia_vencimento: diaVencimento,
            data_entrada_cliente:
              (c.cliente_desde as string | undefined) ||
              (c.created_at ? String(c.created_at).slice(0, 10) : '') ||
              dataHojeIsoLocal(),
            data_inicio_contrato:
              normalizarDataIso(assinaturaAtiva?.data_contratacao) || dataHojeIsoLocal(),
            contrato_migracao: !!c.contrato_migracao,
            migracao_cobrar_apenas_fenix: true,
            data_ultima_mensalidade_paga: normalizarDataIso(c.data_ultima_mensalidade_paga) || '',
            data_registro_ultimo_pagamento:
              normalizarDataIso(c.data_registro_ultimo_pagamento) || '',
          });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    id,
    loadClienteById,
    loadAssinaturas,
    empresaIdEfetivo,
    empresaIdsParaFiltro,
  ]);

  useEffect(() => {
    if (!isContractFlow) return;
    const termo = clienteBusca.trim();
    if (termo.length < 2) {
      setClientesBuscaRemota([]);
      return;
    }
    const timer = window.setTimeout(() => {
      buscarClientes(termo).then(setClientesBuscaRemota);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [isContractFlow, clienteBusca, buscarClientes]);

  const clientesFiltrados = useMemo(() => {
    const termo = clienteBusca.trim();
    if (termo.length >= 2) {
      return clientesBuscaRemota.filter((c) => clienteMatchBusca(c, termo)).slice(0, 50);
    }
    const baseOrdenada = [...clientes].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    });
    return baseOrdenada.slice(0, ULTIMOS_CLIENTES_NOVO_CONTRATO);
  }, [clientes, clienteBusca, clientesBuscaRemota]);

  const pagamentoViaCobrador = form.forma_pagamento_preferencial === 'cobrador';
  const pagamentoViaEscritorio = form.forma_pagamento_preferencial === 'escritorio';

  const bairroParaCobrador = useMemo(
    () =>
      bairroCobrancaCliente({
        usaEnderecoResidencialCobranca: form.usa_endereco_residencial_cobranca,
        enderecoBairro: form.endereco_bairro,
        enderecoCobBairro: form.endereco_cob_bairro,
      }),
    [
      form.usa_endereco_residencial_cobranca,
      form.endereco_bairro,
      form.endereco_cob_bairro,
    ],
  );

  const cobradorSugerido = useMemo(() => {
    if (!pagamentoViaCobrador || !bairroParaCobrador.trim()) return null;
    return resolverCobradorSugeridoPorBairro(bairroParaCobrador, cobradoresComBairros);
  }, [pagamentoViaCobrador, bairroParaCobrador, cobradoresComBairros]);

  useEffect(() => {
    if (!isContractFlow || !empresaId) {
      setCobradorNomePorClienteId(new Map());
      return;
    }
    const ids =
      (empresaIdsParaFiltro || []).length > 0 ? empresaIdsParaFiltro : [empresaId];
    let cancelled = false;
    mapaCobradorNomePorCliente(ids).then((map) => {
      if (!cancelled) setCobradorNomePorClienteId(map);
    });
    return () => {
      cancelled = true;
    };
  }, [isContractFlow, empresaId, empresaIdsParaFiltro, dataRevisionEmpresa]);

  useEffect(() => {
    if (!pagamentoViaCobrador) {
      setCobradoresDisponiveis([]);
      setCobradoresComBairros([]);
      return;
    }
    let cancelled = false;
    setLoadingCobradores(true);
    const idsEmpresa =
      (empresaIdsParaFiltro || []).length > 0
        ? empresaIdsParaFiltro
        : empresaId
          ? [empresaId]
          : [];
    Promise.all([
      loadCobradoresAtivosParaUnidade({
        empresaIdsParaFiltro: idsEmpresa,
        empresasDoGrupo,
        visaoTodasEmpresasGrupo,
        multiEmpresa,
        tokenUnidadeGrupo,
      }),
      loadCobradoresComBairrosAtivos(idsEmpresa),
    ])
      .then(([lista, comBairros]) => {
        if (!cancelled) {
          setCobradoresDisponiveis(lista);
          setCobradoresComBairros(comBairros);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCobradores(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    pagamentoViaCobrador,
    empresaId,
    empresaIdsParaFiltro,
    empresasDoGrupo,
    visaoTodasEmpresasGrupo,
    multiEmpresa,
    tokenUnidadeGrupo,
    dataRevisionEmpresa,
    dataRevisionFilial,
  ]);

  useEffect(() => {
    if (bairroParaCobrador !== bairroCobradorAnteriorRef.current) {
      bairroCobradorAnteriorRef.current = bairroParaCobrador;
      cobradorEscolhidoManualRef.current = false;
    }
  }, [bairroParaCobrador]);

  useEffect(() => {
    if (!pagamentoViaCobrador || !cobradorSugerido || cobradorEscolhidoManualRef.current) return;
    if (isEdit) return;
    setForm((prev) => {
      if (prev.cobrador_id === cobradorSugerido.id) return prev;
      return { ...prev, cobrador_id: cobradorSugerido.id };
    });
  }, [pagamentoViaCobrador, cobradorSugerido?.id, isEdit]);

  useEffect(() => {
    if (!empresaId) {
      setVendedoresDisponiveis([]);
      return;
    }
    let cancelled = false;
    setLoadingVendedores(true);
    loadVendedoresDisponiveis({
      empresaId,
      empresaIdsParaFiltro: (empresaIdsParaFiltro || []).length ? empresaIdsParaFiltro : undefined,
    })
      .then((lista) => {
        if (cancelled) return;
        setVendedoresDisponiveis(lista);
        setForm((p) => {
          if (
            isEdit ||
            isContractFlow ||
            p.tipo_vendedor === 'escritorio' ||
            (p.vendedor_id && p.vendedor_id !== VENDEDOR_ESCRITORIO_ID)
          ) {
            const vendedorNorm = normalizarVendedorIdForm(p.vendedor_id, lista, p.tipo_vendedor);
            return {
              ...p,
              vendedor_id: vendedorNorm,
              tipo_vendedor: vendedorNorm === VENDEDOR_ESCRITORIO_ID ? 'escritorio' : p.tipo_vendedor,
            };
          }
          if (!p.vendedor_id && user?.id && lista.some((v) => v.id === user.id)) {
            return { ...p, vendedor_id: user.id!, tipo_vendedor: p.tipo_vendedor || 'interno' };
          }
          return p;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingVendedores(false);
      });
    return () => {
      cancelled = true;
    };
  }, [empresaId, empresaIdsParaFiltro, dataRevisionEmpresa, isEdit, isContractFlow, user?.id]);

  const clienteSelecionado = useMemo(() => {
    const pool = new Map<string, ClienteSB>();
    for (const c of clientes) pool.set(c.id, c);
    for (const c of clientesBuscaRemota) pool.set(c.id, c);
    return clienteSelecionadoId ? pool.get(clienteSelecionadoId) || null : null;
  }, [clientes, clientesBuscaRemota, clienteSelecionadoId]);

  const resumoCompletudeCadastro = useMemo(() => {
    const deps = (form.beneficiarios || []).map((b) => ({
      nome: b.nome,
      parentesco: b.parentesco,
      data_nascimento: b.data_nascimento,
      data_inclusao: b.data_inclusao,
      cpf: b.cpf,
      rg: b.rg,
    }));
    if (isContractFlow) {
      if (!clienteSelecionado) return null;
      return calcularCompletudeCadastroCliente(clienteSelecionado, deps);
    }
    return calcularCompletudeCadastroCliente(
      {
        cpf: form.cpf,
        data_nascimento: form.data_nascimento,
        rg: form.rg,
        sexo: form.sexo,
        estado_civil: form.estado_civil,
        email: form.email,
        profissao: form.profissao,
        nome_mae: form.nome_mae,
        whatsapp: form.whatsapp,
        telefone_principal: form.telefone_principal,
        endereco_cep: form.endereco_cep,
        endereco_logradouro: form.endereco_logradouro,
        endereco_numero: form.endereco_numero,
        endereco_bairro: form.endereco_bairro,
        endereco_cidade: form.endereco_cidade,
        endereco_estado: form.endereco_estado,
        usa_endereco_residencial_cobranca: form.usa_endereco_residencial_cobranca,
        endereco_cob_cep: form.endereco_cob_cep,
        endereco_cob_logradouro: form.endereco_cob_logradouro,
        endereco_cob_numero: form.endereco_cob_numero,
        endereco_cob_bairro: form.endereco_cob_bairro,
        endereco_cob_cidade: form.endereco_cob_cidade,
        endereco_cob_uf: form.endereco_cob_estado,
        origem_canal: form.cadastro_migracao ? ORIGEM_CANAL_MIGRACAO : form.origem_canal,
      },
      deps,
    );
  }, [form, isContractFlow, clienteSelecionado]);

  const aplicarDadosClienteNoContrato = useCallback(
    async (clienteId: string, opts?: { avisar?: boolean }) => {
      if (!clienteId) return;
      const token = ++clienteContratoLoadRef.current;
      setLoadingClienteContrato(true);
      try {
        const c = await loadClienteById(clienteId);
        if (token !== clienteContratoLoadRef.current) return;
        if (!c) {
          showToast('Não foi possível carregar os dados do cliente.', 'error');
          return;
        }

        const bens = await carregarBeneficiariosClienteForm(clienteId);
        if (token !== clienteContratoLoadRef.current) return;
        beneficiariosOriginaisRef.current = bens.map((b) => b.id).filter(Boolean) as string[];

        const idsConsulta =
          (empresaIdsParaFiltro || []).length > 0
            ? empresaIdsParaFiltro
            : empresaId
              ? [empresaId]
              : [];
        const cobInfo = await mapaCobradorInfoPorCliente(idsConsulta);
        const cobradorCarteira = cobInfo.get(clienteId);
        let cobradorIdSugerido = cobradorCarteira?.id || '';
        if (!cobradorIdSugerido && (c.forma_pagamento_preferencial || '') === 'cobrador' && idsConsulta.length > 0) {
          const bairro = bairroCobrancaCliente({
            usaEnderecoResidencialCobranca: c.usa_endereco_residencial_cobranca,
            enderecoBairro: c.endereco_bairro,
            enderecoCobBairro: c.endereco_cob_bairro,
          });
          const sugerido = await resolverCobradorSugeridoPorBairro(
            bairro,
            await loadCobradoresComBairrosAtivos(idsConsulta),
          );
          if (sugerido) cobradorIdSugerido = sugerido.id;
        }
        const patch = patchFormularioContratoDesdeCliente(c, {
          cobradorIdCarteira: cobradorIdSugerido || undefined,
        });
        const dataEntradaCliente = resolverDataInicioContratoDesdeCliente(c);
        const diaVencimentoCliente = resolverDiaVencimentoForm({
          diaVencimentoPreferido: c.dia_vencimento_preferido,
        });

        setForm((p) => ({
          ...p,
          forma_pagamento_preferencial: patch.forma_pagamento_preferencial || p.forma_pagamento_preferencial,
          tipo_vendedor: patch.tipo_vendedor || p.tipo_vendedor,
          vendedor_id: patch.vendedor_id
            ? patch.vendedor_id
            : patch.tipo_vendedor === 'escritorio' || !c.vendedor_id
              ? VENDEDOR_ESCRITORIO_ID
              : p.vendedor_id,
          cobrador_id: patch.cobrador_id || p.cobrador_id,
          beneficiarios: bens,
          data_entrada_cliente: dataEntradaCliente,
          data_inicio_contrato: p.contrato_migracao ? p.data_inicio_contrato : dataEntradaCliente,
          dia_vencimento:
            c.dia_vencimento_preferido != null && c.dia_vencimento_preferido >= 1 && c.dia_vencimento_preferido <= 31
              ? String(c.dia_vencimento_preferido)
              : p.dia_vencimento || diaVencimentoCliente,
        }));

        await loadAssinaturas(clienteId);
        if (token !== clienteContratoLoadRef.current) return;

        if (opts?.avisar !== false) {
          if (bens.length > 0) {
            showToast(
              `${bens.length} dependente(s) e dados do cliente carregados do cadastro.`,
              'success',
            );
          } else {
            showToast('Dados do cliente carregados. Nenhum dependente no cadastro ainda.', 'success');
          }
        }
      } catch (err) {
        if (token !== clienteContratoLoadRef.current) return;
        console.error(err);
        showToast(
          mensagemErroSupabase(err, 'Não foi possível carregar os dados do cliente.'),
          'error',
        );
      } finally {
        if (token === clienteContratoLoadRef.current) setLoadingClienteContrato(false);
      }
    },
    [
      empresaId,
      empresaIdsParaFiltro,
      loadAssinaturas,
      loadClienteById,
      showToast,
    ],
  );

  useEffect(() => {
    if (!isContractFlow || !clienteSelecionadoId) return;
    void aplicarDadosClienteNoContrato(clienteSelecionadoId, { avisar: false });
  }, [isContractFlow, clienteSelecionadoId, aplicarDadosClienteNoContrato]);

  const formatDateTime = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
  };

  const validateContratoPlano = () => {
    if (!form.plano_id) {
      showToast('Selecione um plano para continuar.', 'warning');
      return false;
    }
    if (!dataInicioContratoEfetiva) {
      showToast('Informe a data de entrada na base (obrigatória para parcelas e início do contrato).', 'warning');
      return false;
    }
    if (contratoMigracao && !migracaoCobrarApenasFenix) {
      if (!form.data_ultima_mensalidade_paga) {
        showToast(
          'Informe até qual vencimento o cliente já pagou (contrato antigo em migração).',
          'warning',
        );
        return false;
      }
      if (
        primeiroVencimentoExibicao &&
        form.data_ultima_mensalidade_paga < primeiroVencimentoExibicao
      ) {
        showToast(
          'A última mensalidade paga não pode ser anterior ao 1º vencimento do contrato.',
          'warning',
        );
        return false;
      }
    }
    if (contratoMigracao && form.data_inicio_contrato) {
      const msgTypo = mensagemPossivelTypoAnoMigracao(
        form.data_entrada_cliente,
        form.data_inicio_contrato,
      );
      if (msgTypo) {
        showToast(msgTypo, 'warning');
        return false;
      }
    }
    return true;
  };

  type FormSnapshot = typeof form;

  const validateStep = (targetStep: number, formSnapshot: FormSnapshot = form) => {
    const missingFields: string[] = [];

    if (isContractFlow) {
      if (targetStep === 1 && !clienteSelecionadoId) {
        showToast('Selecione um cliente cadastrado para continuar.', 'warning');
        return false;
      }
      if (targetStep === 2 && loadingClienteContrato) {
        showToast('Aguarde o carregamento dos dados do cliente.', 'warning');
        return false;
      }
      if (targetStep === 2) {
        if (!validateContratoPlano()) return false;
        const msgDep = validarBeneficiariosOpcionais(
          form.beneficiarios || [],
          dataInicioContratoEfetiva,
        );
        if (msgDep) {
          showToast(msgDep, 'warning');
          return false;
        }
        if (pagamentoViaCobrador && !form.cobrador_id) {
          showToast('Selecione o cobrador que fará a cobrança.', 'warning');
          return false;
        }
      }
      return true;
    }

    if (incluiContratoNoCadastro && contratoStepNum && targetStep === contratoStepNum) {
      if (!form.plano_id) return true;
      if (!validateContratoPlano()) return false;
      const msgDep = validarBeneficiariosOpcionais(
        form.beneficiarios || [],
        dataInicioContratoEfetiva,
      );
      if (msgDep) {
        showToast(msgDep, 'warning');
        return false;
      }
      if (pagamentoViaCobrador && !form.cobrador_id) {
        showToast('Selecione o cobrador que fará a cobrança.', 'warning');
        return false;
      }
      return true;
    }

    if (targetStep === 3 && !isContractFlow) {
      const msgDep = validarBeneficiariosOpcionais(form.beneficiarios || []);
      if (msgDep) {
        showToast(msgDep, 'warning');
        return false;
      }
    }

    if (targetStep === 4 && !isContractFlow) {
      if (!form.data_entrada_cliente) {
        showToast('Informe a data de entrada do contato na base (útil em migrações).', 'warning');
        return false;
      }
    }

    if (targetStep === 1) {
      const emailPreenchido = form.email.trim();
      const emailValido = !emailPreenchido || /\S+@\S+\.\S+/.test(emailPreenchido);

      if (!form.nome.trim()) missingFields.push('Nome completo');
      const cpfMsg =
        !isEdit && !isContractFlow && !migracaoSemCpfObrigatorio
          ? validarCpfObrigatorioNovoCliente(form.cpf)
          : validarCpfSeInformado(form.cpf);
      if (cpfMsg) missingFields.push(cpfMsg);
      if (emailPreenchido && !emailValido) missingFields.push('E-mail (inválido)');
      if (!form.telefone_principal.trim()) missingFields.push('Telefone principal');

      if (missingFields.length > 0) {
        showToast(
          missingFields.length === 1
            ? missingFields[0]
            : `Não foi possível avançar. Verifique: ${missingFields.join(' · ')}`,
          'warning',
        );
        return false;
      }
    }
    if (targetStep === 2) {
      if (!formSnapshot.endereco_logradouro.trim()) missingFields.push('Logradouro');
      if (!formSnapshot.endereco_numero.trim()) missingFields.push('Número');
      if (!formSnapshot.endereco_bairro.trim()) missingFields.push('Bairro');
      if (!formSnapshot.endereco_cidade.trim()) missingFields.push('Cidade');
      if (!ufBrasilValida(formSnapshot.endereco_estado)) {
        missingFields.push('UF');
      }

      if (missingFields.length > 0) {
        showToast(
          missingFields.length === 1
            ? missingFields[0]
            : `Não foi possível avançar. Verifique: ${missingFields.join(' · ')}`,
          'warning',
        );
        return false;
      }
    }

    return true;
  };

  const handleNextStep = () => {
    let snapshot: FormSnapshot = form;
    if (step === 2) {
      const uf = resolverUfParaSelect(form.endereco_estado);
      snapshot = { ...form, endereco_estado: uf };
      if (uf !== form.endereco_estado) {
        setForm(snapshot);
      }
    }
    if (validateStep(step, snapshot)) {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    if (name === 'forma_pagamento_preferencial') {
      if (value === 'cobrador') {
        cobradorEscolhidoManualRef.current = false;
      } else {
        cobradorEscolhidoManualRef.current = false;
        setForm((prev) => ({ ...prev, [name]: value, cobrador_id: '' }));
        return;
      }
    }
    if (name === 'cobrador_id') {
      cobradorEscolhidoManualRef.current = true;
    }
    if (name === 'cadastro_migracao' && type === 'checkbox') {
      setForm((prev) => ({
        ...prev,
        cadastro_migracao: checked,
        origem_canal: checked
          ? ORIGEM_CANAL_MIGRACAO
          : prev.contrato_migracao
            ? prev.origem_canal
            : prev.origem_canal === ORIGEM_CANAL_MIGRACAO
              ? ''
              : prev.origem_canal,
      }));
      return;
    }
    if (name === 'contrato_migracao' && type === 'checkbox') {
      if (!checked) {
        setForm((prev) => ({
          ...prev,
          contrato_migracao: false,
          migracao_cobrar_apenas_fenix: true,
          data_ultima_mensalidade_paga: '',
          data_registro_ultimo_pagamento: '',
          data_inicio_contrato: prev.data_entrada_cliente || prev.data_inicio_contrato,
          origem_canal: prev.cadastro_migracao
            ? ORIGEM_CANAL_MIGRACAO
            : prev.origem_canal === ORIGEM_CANAL_MIGRACAO
              ? ''
              : prev.origem_canal,
        }));
      } else {
        setForm((prev) => ({
          ...prev,
          contrato_migracao: true,
          migracao_cobrar_apenas_fenix: true,
          cadastro_migracao: true,
          origem_canal: ORIGEM_CANAL_MIGRACAO,
          data_inicio_contrato: prev.data_entrada_cliente || prev.data_inicio_contrato,
        }));
      }
      return;
    }
    if (name === 'endereco_estado' || name === 'endereco_cob_estado') {
      setForm((prev) => ({ ...prev, [name]: resolverUfParaSelect(value) }));
      return;
    }
    if (name === 'data_entrada_cliente') {
      setForm((prev) => {
        const hoje = dataHojeIsoLocal();
        const sincronizarInicio =
          prev.contrato_migracao &&
          (prev.data_inicio_contrato === hoje ||
            detectarPossivelTypoAnoMigracao(value, prev.data_inicio_contrato));
        return {
          ...prev,
          data_entrada_cliente: value,
          data_inicio_contrato: prev.contrato_migracao
            ? sincronizarInicio
              ? value
              : prev.data_inicio_contrato
            : value,
        };
      });
      return;
    }
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const formatCpf = (v: string) => {
    const n = v.replace(/\D/g, '').slice(0, 11);
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatPhone = (v: string) => {
    const n = v.replace(/\D/g, '').slice(0, 11);
    if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const formatCep = (v: string) => {
    return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d{3})/, '$1-$2');
  };

  /** Liga = cobrança igual ao residencial; desliga = exibe campos (copia residencial como base na primeira vez). */
  const definirMesmoEnderecoCobranca = (mesmo: boolean) => {
    setForm((p) => {
      if (mesmo) {
        return { ...p, usa_endereco_residencial_cobranca: true };
      }
      if (p.usa_endereco_residencial_cobranca) {
        return {
          ...p,
          usa_endereco_residencial_cobranca: false,
          endereco_cob_cep: p.endereco_cep,
          endereco_cob_logradouro: p.endereco_logradouro,
          endereco_cob_numero: p.endereco_numero,
          endereco_cob_complemento: p.endereco_complemento || '',
          endereco_cob_bairro: p.endereco_bairro,
          endereco_cob_cidade: p.endereco_cidade,
          endereco_cob_estado: p.endereco_estado,
        };
      }
      return { ...p, usa_endereco_residencial_cobranca: false };
    });
  };

  const criarContratoParaCliente = async (clienteId: string): Promise<string> => {
    if (!form.plano_id) return '';
    const plano = planos.find((p) => p.id === form.plano_id);
    if (!plano || !clienteId) return '';

    const ehMigracaoContrato = !!form.contrato_migracao || form.cadastro_migracao;
    if (ehMigracaoContrato) {
      await updateCliente(clienteId, { origem_canal: ORIGEM_CANAL_MIGRACAO });
    }

    const { data: clienteContratoRow } = await supabase
      .from('clientes')
      .select('cliente_desde, origem_canal')
      .eq('id', clienteId)
      .maybeSingle();

    const dataInicioAutoritativa = resolverDataInicioContratoParaAssinatura({
      contratoMigracao: !!form.contrato_migracao,
      clienteDesdeDb: clienteContratoRow?.cliente_desde,
      dataEntradaForm: form.data_entrada_cliente,
      dataInicioForm: form.data_inicio_contrato,
    });

    if (!form.contrato_migracao && dataInicioAutoritativa) {
      await updateCliente(clienteId, {
        cliente_desde: dataInicioAutoritativa,
        dia_vencimento_preferido: diaVencimentoNum,
      });
    }

    const diaVencimento = diaVencimentoNum;
    const migracaoInput = {
      contratoMigracao: !!form.contrato_migracao,
      migracaoCobrarApenasFenix: !!form.migracao_cobrar_apenas_fenix,
      dataInicioContrato: dataInicioAutoritativa,
      dataUltimaMensalidadePaga: form.data_ultima_mensalidade_paga,
      dataRegistroUltimoPagamento: form.data_registro_ultimo_pagamento,
      diaVencimento,
    };
    const { dataContratacao: dataInicio, dataPrimeiroVencimento: primeiroVencimento } =
      resolverDatasContratoMigracao(migracaoInput);

    const { assinatura: contrato, error: errContrato } = await createAssinatura({
      cliente_id: clienteId,
      plano_id: form.plano_id,
      valor_mensal_centavos: plano.valor_mensal_centavos,
      valor_anual_centavos: plano.valor_anual_centavos,
      taxa_adesao_centavos: plano.taxa_adesao_centavos,
      dia_vencimento: diaVencimento,
      periodicidade: 'mensal',
      forma_pagamento: form.forma_pagamento_preferencial || 'boleto',
      data_contratacao: dataInicio,
      data_primeiro_vencimento: primeiroVencimento,
      status: 'ativo',
      vendedor_id:
        vendedorIdParaSalvar(form.vendedor_id) ||
        vendedorIdParaSalvar(clienteSelecionado?.vendedor_id) ||
        user?.id ||
        undefined,
    });
    if (!contrato) {
      if (errContrato) {
        showToast(
          mensagemErroSupabase(errContrato, 'Não foi possível criar o contrato. Verifique plano e forma de pagamento.'),
          'error',
        );
      }
      return '';
    }

    const parcelasMigracao = await gerarParcelasContratoMigracao(
      contrato.id,
      migracaoInput,
      {
        gerarLote: gerarMensalidadesMes,
        gerarHistorico: gerarMensalidadesComHistorico,
      },
    );
    if (parcelasMigracao.modo === 'historico' && parcelasMigracao.detalhe?.includes('duplicate key')) {
      showToast(
        'Contrato criado, mas falhou ao gerar histórico: código de parcela duplicado. Gere as parcelas no financeiro.',
        'warning',
      );
    } else if (parcelasMigracao.modo === 'historico' && parcelasMigracao.detalhe?.includes('Falha')) {
      showToast(
        `Contrato criado, mas falhou ao gerar mensalidades: ${parcelasMigracao.detalhe}`,
        'warning',
      );
    } else if (parcelasMigracao.modo === 'historico' && parcelasMigracao.detalhe) {
      showToast(`Contrato migrado: ${parcelasMigracao.detalhe}.`, 'success');
    } else if (parcelasMigracao.modo === 'fenix') {
      showToast(
        'Contrato de transferência criado: cobrança na Fênix a partir do próximo vencimento, sem parcelas retroativas.',
        'success',
      );
    }

    if (form.forma_pagamento_preferencial === 'cobrador' && form.cobrador_id?.trim()) {
      const cart = await atribuirCobradorCarteiraCliente(
        empresaId,
        clienteId,
        form.cobrador_id.trim(),
      );
      if (!cart.ok) {
        showToast(
          cart.erro ||
            'Contrato criado, mas o cliente não entrou na carteira do cobrador. Atribua em Cobradores → Carteira.',
          'warning',
        );
      } else {
        showToast('Cliente incluído na carteira do cobrador.', 'success');
      }
    } else if (form.forma_pagamento_preferencial === 'escritorio') {
      const cartEsc = await atribuirClienteCarteiraEscritorio(empresaId, clienteId);
      if (!cartEsc.ok) {
        showToast(
          cartEsc.erro ||
            'Contrato criado, mas o cliente não entrou na carteira do escritório. Atribua em Cobradores → Carteira do escritório.',
          'warning',
        );
      } else {
        showToast('Cliente incluído na carteira do escritório (pagamento na unidade).', 'success');
      }
    }

    return contrato.id;
  };

  const validarTodasEtapasAntesSalvar = (): number | null => {
    for (let s = 1; s < TOTAL_STEPS; s++) {
      if (!validateStep(s)) return s;
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!submitIntentRef.current) return;
    submitIntentRef.current = false;
    // Nunca submeter fora da etapa final
    if (step < TOTAL_STEPS) {
      return;
    }

    setLoading(true);

    try {
    const etapaInvalida = validarTodasEtapasAntesSalvar();
    if (etapaInvalida != null) {
      setStep(etapaInvalida);
      return;
    }

    const vaiCriarContrato =
      (isContractFlow && !!form.plano_id) || (criarContratoAgora && !!form.plano_id);
    const ehMigracaoSubmit = migracaoSemCpfObrigatorio || !!form.contrato_migracao;
    const perms = user?.permissoes as Record<string, unknown> | undefined;
    const podeGestaoContrato = usuarioPodeCriarContratoGestao(user?.role, perms);
    const podeMigracaoContrato = usuarioPodeCriarContratoMigracaoCliente(perms);
    if (vaiCriarContrato) {
      if (ehMigracaoSubmit) {
        if (!podeGestaoContrato && !podeMigracaoContrato) {
          showToast(
            'Sem permissão para confirmar cadastro de migração com contrato. Peça ao administrador liberar "Incluir" em Clientes.',
            'warning',
          );
          return;
        }
      } else if (!podeGestaoContrato) {
        showToast(
          'Contrato novo (fora de migração) só pela supervisão ou pelo fluxo Propostas → gerar contrato.',
          'warning',
        );
        return;
      }
      const msgDepContrato = validarBeneficiariosOpcionais(
        form.beneficiarios || [],
        dataInicioContratoEfetiva,
      );
      if (msgDepContrato) {
        showToast(msgDepContrato, 'warning');
        return;
      }
    }

    const origemCanalPayload = migracaoSemCpfObrigatorio
      ? ORIGEM_CANAL_MIGRACAO
      : form.origem_canal.trim() || undefined;

    const payload: Partial<ClienteSB> = {
      nome: form.nome,
      nome_social: form.nome_social || undefined,
      cpf: form.cpf.trim() || undefined,
      rg: form.rg || undefined,
      email: form.email.trim() || null,
      telefone_principal: form.telefone_principal,
      celular: form.whatsapp || form.telefone_principal, // Map to satisfy DB constraint
      whatsapp: form.whatsapp || undefined,
      data_nascimento: form.data_nascimento || undefined,
      sexo: form.sexo.trim() || undefined,
      estado_civil: form.estado_civil || undefined,
      profissao: form.profissao || undefined,
      nome_mae: form.nome_mae || undefined,
      nome_pai: form.nome_pai || undefined,
      endereco_cep: form.endereco_cep,
      endereco_logradouro: form.endereco_logradouro,
      endereco_numero: form.endereco_numero,
      endereco_complemento: form.endereco_complemento || undefined,
      endereco_bairro: form.endereco_bairro,
      endereco_cidade: form.endereco_cidade,
      endereco_estado: form.endereco_estado,
      // Endereço de Cobrança
      usa_endereco_residencial_cobranca: form.usa_endereco_residencial_cobranca,
      endereco_cob_cep: form.usa_endereco_residencial_cobranca ? form.endereco_cep : form.endereco_cob_cep,
      endereco_cob_logradouro: form.usa_endereco_residencial_cobranca ? form.endereco_logradouro : form.endereco_cob_logradouro,
      endereco_cob_numero: form.usa_endereco_residencial_cobranca ? form.endereco_numero : form.endereco_cob_numero,
      endereco_cob_complemento: form.usa_endereco_residencial_cobranca ? form.endereco_complemento : form.endereco_cob_complemento,
      endereco_cob_bairro: form.usa_endereco_residencial_cobranca ? form.endereco_bairro : form.endereco_cob_bairro,
      endereco_cob_cidade: form.usa_endereco_residencial_cobranca ? form.endereco_cidade : form.endereco_cob_cidade,
      endereco_cob_uf: form.usa_endereco_residencial_cobranca ? form.endereco_estado : form.endereco_cob_estado,
      tipo_cliente: form.tipo_cliente,
      nivel_relacionamento: form.nivel_relacionamento,
      origem_canal: origemCanalPayload,
      tipo_vendedor: tipoVendedorParaSalvar(form.vendedor_id, form.tipo_vendedor),
      vendedor_id: vendedorIdParaSalvar(form.vendedor_id),
      cliente_vip: form.cliente_vip,
      forma_pagamento_preferencial: form.forma_pagamento_preferencial || undefined,
      cliente_desde: form.data_entrada_cliente || undefined,
      dia_vencimento_preferido: diaVencimentoNum,
    };

      let finalId = id;
      let contratoId = '';

      if (isEdit && id) {
        await updateCliente(id, payload);
        const activeAssinatura = (assinaturas || []).find(
          (a) => a.cliente_id === id && a.status === 'ativo',
        );
        if (activeAssinatura) {
          contratoId = activeAssinatura.id;
          const assinaturaUpdate: Record<string, unknown> = {};
          if (activeAssinatura.dia_vencimento !== diaVencimentoNum) {
            assinaturaUpdate.dia_vencimento = diaVencimentoNum;
          }
          const formaPag = form.forma_pagamento_preferencial || undefined;
          if (formaPag && activeAssinatura.forma_pagamento !== formaPag) {
            assinaturaUpdate.forma_pagamento = formaPag;
          }
          if (!form.contrato_migracao) {
            const novaDataContrato = resolverDataInicioContratoParaAssinatura({
              contratoMigracao: false,
              clienteDesdeDb: form.data_entrada_cliente,
              dataEntradaForm: form.data_entrada_cliente,
            });
            if (
              novaDataContrato &&
              normalizarDataIso(activeAssinatura.data_contratacao) !== novaDataContrato
            ) {
              assinaturaUpdate.data_contratacao = novaDataContrato;
            }
          }
          if (Object.keys(assinaturaUpdate).length > 0) {
            const { error: assErr } = await supabase
              .from('assinaturas')
              .update(assinaturaUpdate)
              .eq('id', activeAssinatura.id);
            if (assErr) {
              showToast(
                mensagemErroSupabase(
                  assErr,
                  'Cliente salvo, mas não foi possível atualizar o dia de vencimento do contrato.',
                ),
                'warning',
              );
            }
          }
        }

        if (form.forma_pagamento_preferencial === 'cobrador' && form.cobrador_id?.trim()) {
          const cart = await atribuirCobradorCarteiraCliente(empresaId, id, form.cobrador_id.trim());
          if (!cart.ok) {
            showToast(
              cart.erro ||
                'Cliente salvo, mas não foi possível atualizar a carteira do cobrador.',
              'warning',
            );
          }
        } else if (form.forma_pagamento_preferencial === 'escritorio') {
          const cartEsc = await atribuirClienteCarteiraEscritorio(empresaId, id);
          if (!cartEsc.ok) {
            showToast(
              cartEsc.erro ||
                'Cliente salvo, mas não foi possível atualizar a carteira do escritório.',
              'warning',
            );
          }
        }
      } else if (isContractFlow) {
        finalId = clienteSelecionadoId;
        if (form.plano_id && finalId) {
          contratoId = await criarContratoParaCliente(finalId);
        }
      } else {
        const { data: novo, error: createError, existingId } = await createCliente(payload, {
          cadastroMigracao: !!form.cadastro_migracao,
          contratoMigracao: !!form.contrato_migracao,
        });
        if (novo) {
          finalId = novo.id;
        } else {
          if (existingId) {
            showToast(
              createError || mensagemErroCadastroCliente(createError) || 'Cliente já cadastrado com estes dados.',
              'error',
            );
            if (window.confirm('Já existe um cliente com estes dados. Deseja abrir o cadastro dele?')) {
              navigate(`/clientes/${existingId}`);
            }
            return;
          }
          showToast(mensagemErroCadastroCliente(createError), 'error');
          return;
        }
        if (finalId && criarContratoAgora && form.plano_id) {
          contratoId = await criarContratoParaCliente(finalId);
          if (!contratoId) {
            showToast('Cliente cadastrado, mas o contrato não pôde ser criado. Crie em Contratos.', 'warning');
          }
        }
      }

      const contratoFalhou =
        (isContractFlow || (criarContratoAgora && !!form.plano_id)) && !contratoId;

      if (contratoFalhou) {
        if (!isEdit) sessionStorage.removeItem(draftKey);
        showToast(
          mensagemErroSupabase(
            error,
            'O cliente foi salvo, mas o contrato não foi concluído. Ajuste o contrato na ficha ou tente de novo pela edição.',
          ),
          'error',
        );
        if (finalId) {
          const irFicha = window.confirm(
            'O titular já está no sistema. Deseja abrir a ficha do cliente para concluir o contrato?',
          );
          if (irFicha) {
            navigate(isContractFlow ? `/clientes/${finalId}` : `/clientes/${finalId}/editar`);
          }
        }
        return;
      }

      const beneficiariosParaSalvar = (form.beneficiarios || []).filter((b) => (b.nome || '').trim());

      if (isEdit && finalId) {
        const idsAtuais = new Set(
          beneficiariosParaSalvar.filter((b) => b.id).map((b) => b.id as string),
        );
        for (const oldId of beneficiariosOriginaisRef.current) {
          if (!idsAtuais.has(oldId)) {
            await deleteBeneficiario(oldId);
          }
        }
      }

      let dependentesComErro = 0;
      if (finalId && beneficiariosParaSalvar.length > 0) {
        const vincularContrato = Boolean(contratoId);
        for (const ben of beneficiariosParaSalvar) {
          const benPayload: Record<string, unknown> = {
            nome: ben.nome.trim(),
            parentesco: normalizarParentescoDependente(ben.parentesco) || 'outro',
            cpf: ben.cpf,
            rg_numero: ben.rg,
            tipo: 'dependente',
            status: 'ativo',
            ativo: true,
          };
          const dn = (ben.data_nascimento || '').trim();
          if (dn) benPayload.data_nascimento = dn;

          if (ben.id && (isEdit || isContractFlow)) {
            const updateExtra: Partial<BeneficiarioSB> = { ...benPayload };
            if (vincularContrato && contratoId) {
              updateExtra.assinatura_id = contratoId;
            }
            let payloadUpdate: Partial<BeneficiarioSB> = updateExtra;
            if (isContractFlow) {
              const dataCtrSalvar = dataInicioContratoEfetiva;
              const di = normalizarDataIso(ben.data_inclusao) || dataCtrSalvar;
              const diasCarenciaDep = diasCarenciaDependenteDoPlano(
                planos.find((p) => p.id === form.plano_id)?.carencia_beneficiario_adicional_dias,
              );
              payloadUpdate = aplicarCarenciaBeneficiarioPayload(
                { ...updateExtra, data_inclusao: di },
                diasCarenciaDep,
              ) as Partial<BeneficiarioSB>;
            }
            const { error: benError } = await updateBeneficiario(
              ben.id,
              payloadUpdate,
            );
            if (benError) {
              dependentesComErro += 1;
              showToast(mensagemErroDependente(ben.nome, benError), 'error');
            }
          } else if (!ben.id) {
            const dataCtrSalvar = dataInicioContratoEfetiva;
            const di =
              normalizarDataIso(ben.data_inclusao) ||
              (vincularContrato ? dataCtrSalvar : dataHojeIsoLocal());
            const { error: benError } = await createBeneficiario({
              cliente_id: finalId,
              assinatura_id: vincularContrato ? contratoId : null,
              ...benPayload,
              data_inclusao: di,
              carencia_dependente_dias: diasCarenciaDependenteDoPlano(
                planos.find((p) => p.id === form.plano_id)?.carencia_beneficiario_adicional_dias,
              ),
            });
            if (benError) {
              dependentesComErro += 1;
              showToast(mensagemErroDependente(ben.nome, benError), 'error');
            }
          }
        }
      }

      if (dependentesComErro > 0 && beneficiariosParaSalvar.length > 0) {
        showToast(
          `${dependentesComErro} dependente(s) não foram salvos. Corrija os dados e inclua na ficha do cliente.`,
          'warning',
        );
      }

      const msgSucesso = isEdit
        ? 'Cliente atualizado com sucesso.'
        : isContractFlow
          ? 'Contrato criado com sucesso.'
          : criarContratoAgora && form.plano_id && contratoId
            ? 'Cliente e contrato cadastrados com sucesso.'
            : 'Cliente cadastrado com sucesso.';
      showToast(msgSucesso, 'success');
      if (!isEdit) sessionStorage.removeItem(draftKey);
      if (isContractFlow) {
        navigate('/clientes/contratos');
      } else if (finalId && (isEdit || (criarContratoAgora && form.plano_id))) {
        navigate(`/clientes/${finalId}`);
      } else {
        navigate('/clientes/lista');
      }
    } catch (err) {
      console.error(err);
      const msg = isEdit
        ? mensagemErroAtualizarCliente(err)
        : isContractFlow || (criarContratoAgora && form.plano_id)
          ? mensagemErroContrato(err)
          : mensagemErroCadastroCliente(err);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderCampoDiaVencimento = () => (
    <Select
      label="Dia de vencimento das mensalidades *"
      name="dia_vencimento"
      value={form.dia_vencimento || '5'}
      onChange={handleChange}
      helperText="Todo mês a mensalidade vence neste dia (ex.: 5, 10 ou 15)."
      required
    >
      {Array.from({ length: 31 }, (_, i) => i + 1).map((dia) => (
        <option key={dia} value={String(dia)}>
          Dia {dia} de cada mês
        </option>
      ))}
    </Select>
  );

  const renderSeletorFormaPagamentoECobrador = () => (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      {isContractFlow ? renderCampoDiaVencimento() : null}
      <Select
        label="Forma de pagamento do contrato"
        name="forma_pagamento_preferencial"
        value={form.forma_pagamento_preferencial}
        onChange={handleChange}
      >
        <option value="">Selecionar...</option>
        <option value="pix">PIX</option>
        <option value="boleto">Boleto</option>
        <option value="cobrador">Cobrador</option>
        <option value="escritorio">Escritório (pagamento na unidade)</option>
        <option value="cartao_credito">Cartão de Crédito</option>
        <option value="debito_auto">Débito Automático</option>
        <option value="dinheiro">Dinheiro</option>
      </Select>
      {pagamentoViaCobrador ? (
        <div className="space-y-2">
          <Select
            label="Cobrador responsável pela cobrança *"
            name="cobrador_id"
            value={form.cobrador_id}
            onChange={handleChange}
            required
          >
            <option value="">
              {loadingCobradores ? 'Carregando cobradores...' : 'Selecione o cobrador...'}
            </option>
            {cobradoresDisponiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          {cobradorSugerido && form.cobrador_id === cobradorSugerido.id ? (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              Cobrador sugerido automaticamente pelo bairro <strong>{bairroParaCobrador}</strong>:{' '}
              <strong>{cobradorSugerido.nome}</strong>.
            </p>
          ) : bairroParaCobrador.trim() && !loadingCobradores && cobradoresComBairros.length > 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 rounded-lg px-3 py-2">
              Nenhum cobrador cadastrado para o bairro <strong>{bairroParaCobrador}</strong>. Selecione
              manualmente ou cadastre o bairro na rota do cobrador.
            </p>
          ) : null}
          {!loadingCobradores && cobradoresDisponiveis.length === 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 rounded-lg px-3 py-2">
              Nenhum cobrador ativo nesta unidade. Cadastre em <strong>Cobradores</strong> ou troque a unidade no topo.
            </p>
          ) : null}
          {clienteSelecionadoId && cobradorNomePorClienteId.get(clienteSelecionadoId) ? (
            <p className="text-xs text-violet-800 dark:text-violet-200 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
              Este cliente já está na carteira de{' '}
              <strong>{cobradorNomePorClienteId.get(clienteSelecionadoId)}</strong>. Ao salvar com outro
              cobrador, a carteira será atualizada.
            </p>
          ) : null}
          <p className="text-xs text-gray-500 dark:text-slate-400">
            O cobrador escolhido receberá o cliente na carteira de cobrança após salvar o contrato.
          </p>
        </div>
      ) : null}
      {pagamentoViaEscritorio ? (
        <p className="text-xs text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/50 rounded-lg px-3 py-2">
          O cliente entrará na <strong>carteira do escritório</strong> após salvar — para recebimento presencial na
          unidade. Gerencie em <strong>Cobradores → Carteira do escritório</strong>.
        </p>
      ) : null}
    </div>
  );

  const renderPlanoContratoCard = () => (
    <Card className="p-6 space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 border-b border-gray-200 dark:border-slate-700 pb-3">Seleção de Plano</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Selecione um Plano</label>
          <div className="grid gap-3">
            {planos.filter(p => p.status === 'ativo').map(plano => (
              <div
                key={plano.id}
                onClick={() => setForm(p => ({ ...p, plano_id: plano.id }))}
                className={`cursor-pointer border rounded-lg p-4 transition-all ${form.plano_id === plano.id
                  ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-500 dark:ring-blue-400'
                  : 'border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-slate-100">{plano.nome}</span>
                    <p className="text-sm text-gray-500 dark:text-slate-400 capitalize">{plano.categoria_nome || plano.categoria}</p>
                    <p className="text-[10px] text-indigo-700 dark:text-indigo-300 mt-1 font-medium">
                      Carência contrato: {plano.carencia_dias ?? 0}d • Dependente:{' '}
                      {plano.carencia_beneficiario_adicional_dias ?? 90}d após filiação
                    </p>
                  </div>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {((plano.valor_mensal_centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {form.plano_id && (
          <div className="space-y-4">
            {isContractFlow && !contratoMigracao && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Data de entrada do contato na base *"
                  type="date"
                  name="data_entrada_cliente"
                  value={form.data_entrada_cliente}
                  onChange={handleChange}
                  helperText="Define a data de início do contrato (tempo de casa). Confira com o cadastro do cliente."
                  required
                />
                {renderCampoDiaVencimento()}
              </div>
            )}
            {contratoMigracao ? (
              <Input
                label="Data de início do contrato *"
                type="date"
                name="data_inicio_contrato"
                value={form.data_inicio_contrato}
                onChange={handleChange}
                helperText="Data histórica do contrato na funerária de origem (migração)."
                required
              />
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-3 py-2 text-sm text-gray-700 dark:text-slate-300">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Data de início do contrato</p>
                <p className="font-semibold">
                  {form.data_entrada_cliente
                    ? formatarDataIsoPtBr(form.data_entrada_cliente)
                    : form.data_inicio_contrato
                      ? formatarDataIsoPtBr(form.data_inicio_contrato)
                      : '—'}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Igual à data de entrada na base (etapa Financeiro). Marque migração abaixo para informar data histórica diferente.
                </p>
              </div>
            )}
            {dataInicioContratoEfetiva && (
              <div className="rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50/80 dark:bg-blue-950/50 px-3 py-2 text-sm text-blue-950 dark:text-blue-100 space-y-1">
                <p>
                  Mensalidades vencem todo dia <strong>{diaVencimentoNum}</strong> de cada mês.
                </p>
                <p>
                  1ª cobrança na Fênix:{' '}
                  <strong>
                    {primeiroVencimentoExibicao
                      ? formatarDataIsoPtBr(primeiroVencimentoExibicao)
                      : formatarDataIsoPtBr(primeiroVencimentoCalc)}
                  </strong>
                  {!contratoMigracao || form.migracao_cobrar_apenas_fenix
                    ? ' (30 dias após o início ou a partir de hoje na transferência).'
                    : ' (primeiro vencimento após a última mensalidade quitada).'}
                </p>
              </div>
            )}
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                Contrato vindo de outra funerária (opcional)
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Mantém o tempo de contrato antigo na data de início acima. Também libera cadastro{' '}
                <strong>sem CPF</strong> (marca migração de cadastro automaticamente).
              </p>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-slate-200 cursor-pointer rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3 hover:bg-gray-50 dark:hover:bg-slate-800">
                  <input
                    type="radio"
                    name="modo_contrato_importado"
                    checked={!form.contrato_migracao}
                    onChange={() =>
                      setForm((p) => ({
                        ...p,
                        contrato_migracao: false,
                        migracao_cobrar_apenas_fenix: true,
                        data_ultima_mensalidade_paga: '',
                        data_registro_ultimo_pagamento: '',
                        origem_canal: p.cadastro_migracao
                          ? ORIGEM_CANAL_MIGRACAO
                          : p.origem_canal === ORIGEM_CANAL_MIGRACAO
                            ? ''
                            : p.origem_canal,
                      }))
                    }
                    className="mt-1"
                  />
                  <span>
                    <strong>Contrato novo na Fênix</strong>
                    <span className="block text-xs text-gray-600 dark:text-slate-300">
                      Cliente sem histórico em outra funerária — cobrança padrão a partir da data de início.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-slate-200 cursor-pointer rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3 hover:bg-gray-50 dark:hover:bg-slate-800">
                  <input
                    type="radio"
                    name="modo_contrato_importado"
                    checked={form.contrato_migracao && form.migracao_cobrar_apenas_fenix}
                    onChange={() =>
                      setForm((p) => ({
                        ...p,
                        contrato_migracao: true,
                        migracao_cobrar_apenas_fenix: true,
                        cadastro_migracao: true,
                        origem_canal: ORIGEM_CANAL_MIGRACAO,
                        data_ultima_mensalidade_paga: '',
                        data_registro_ultimo_pagamento: '',
                      }))
                    }
                    className="mt-1"
                  />
                  <span>
                    <strong>Transferência de outra funerária</strong>
                    <span className="block text-xs text-amber-800 dark:text-amber-300">
                      Cobrar só a partir de hoje na Fênix — não gera parcelas retroativas. 1ª cobrança em 30 dias.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-slate-200 cursor-pointer rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3 hover:bg-gray-50 dark:hover:bg-slate-800">
                  <input
                    type="radio"
                    name="modo_contrato_importado"
                    checked={form.contrato_migracao && !form.migracao_cobrar_apenas_fenix}
                    onChange={() =>
                      setForm((p) => ({
                        ...p,
                        contrato_migracao: true,
                        migracao_cobrar_apenas_fenix: false,
                        cadastro_migracao: true,
                        origem_canal: ORIGEM_CANAL_MIGRACAO,
                        data_ultima_mensalidade_paga:
                          p.data_ultima_mensalidade_paga ||
                          ultimoVencimentoCompetenciaProvavel(diaVencimentoNum),
                        data_registro_ultimo_pagamento:
                          p.data_registro_ultimo_pagamento || dataHojeIsoLocal(),
                      }))
                    }
                    className="mt-1"
                  />
                  <span>
                    <strong>Migração de contrato antigo</strong>
                    <span className="block text-xs text-amber-800 dark:text-amber-300">
                      Cliente já pagava na funerária anterior — informe até qual vencimento está quitado; o
                      sistema lança o histórico como pago.
                    </span>
                  </span>
                </label>
              </div>
              {contratoMigracao && !form.migracao_cobrar_apenas_fenix && (
                <>
                  <Input
                    label="Última mensalidade paga (vencimento) *"
                    type="date"
                    name="data_ultima_mensalidade_paga"
                    value={form.data_ultima_mensalidade_paga}
                    onChange={handleChange}
                    required
                  />
                  <Input
                    label="Data do último pagamento"
                    type="date"
                    name="data_registro_ultimo_pagamento"
                    value={form.data_registro_ultimo_pagamento}
                    onChange={handleChange}
                  />
                  {qtdMensalidadesPagas > 0 && (
                    <p className="text-xs text-amber-900 dark:text-amber-200">
                      Serão registradas <strong>{qtdMensalidadesPagas}</strong> mensalidade(s) quitada(s), mais{' '}
                      <strong>12</strong> parcelas futuras em aberto.
                    </p>
                  )}
                </>
              )}
              {contratoMigracao && datasContratoMigracao && (
                <p className="text-xs text-amber-950">
                  1ª cobrança na Fênix:{' '}
                  <strong>{formatarDataIsoPtBr(datasContratoMigracao.dataPrimeiroVencimento)}</strong>
                </p>
              )}
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-lg text-sm text-gray-600 dark:text-slate-300">
              <p><strong>Detalhes do Plano Selecionado:</strong></p>
              <p className="mt-1">{planos.find(p => p.id === form.plano_id)?.descricao}</p>
            </div>
            {renderSeletorFormaPagamentoECobrador()}
          </div>
        )}
      </div>
    </Card>
  );

  const renderBeneficiariosCard = (opts: { requirePlano?: boolean }) => {
    const { requirePlano = false } = opts;
    const clienteRef = isEdit ? id : (isContractFlow ? clienteSelecionadoId : undefined);
    const temContratoAtivo = assinaturas?.some(
      (a) => a.cliente_id === clienteRef && a.status === 'ativo',
    );
    const podeAdicionar = !requirePlano || !!form.plano_id || temContratoAtivo;
    const assinaturaAtivaCliente =
      isEdit && clienteRef
        ? (assinaturas || []).find((a) => a.cliente_id === clienteRef && a.status === 'ativo')
        : undefined;
    const planoSel =
      planos.find((p) => p.id === form.plano_id) ||
      (assinaturaAtivaCliente?.plano_id
        ? planos.find((p) => p.id === assinaturaAtivaCliente.plano_id)
        : undefined);
    const diasCarenciaCtr = planoSel?.carencia_dias ?? 0;
    const diasCarenciaDep = diasCarenciaDependenteDoPlano(
      planoSel?.carencia_beneficiario_adicional_dias,
    );
    const dataInicioCtr =
      (assinaturaAtivaCliente?.data_contratacao || form.data_inicio_contrato || '').slice(0, 10) ||
      dataHojeIsoLocal();
    const limitesFiliacao = limitesDataFiliacaoDependente(dataInicioCtr);
    /** Na 1ª criação do contrato/cadastro, filiação histórica (ex.: migração) sem janela de ±15 dias. */
    const filiacaoDataLivreNoCadastro = !isEdit;
    return (
      <Card className="p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Beneficiários / Dependentes</h3>
            {!requirePlano && (
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Opcional — você pode pular esta etapa.</p>
            )}
            {planoSel && (
              <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                Plano <strong>{planoSel.nome}</strong>: carência do contrato{' '}
                <strong>{diasCarenciaCtr} dias</strong> ({formatarResumoCarenciaContrato(dataInicioCtr, diasCarenciaCtr)}).
                Dependentes: <strong>{diasCarenciaDep} dias</strong> após a <strong>data de filiação</strong>.
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {requirePlano && !podeAdicionar && (
              <span className="text-[10px] text-amber-600 font-medium">Selecione um plano para adicionar dependentes</span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!podeAdicionar}
              onClick={() => {
                setForm((p) => ({
                  ...p,
                  beneficiarios: [
                    ...(p.beneficiarios || []),
                    {
                      nome: '',
                      parentesco: 'filho',
                      data_nascimento: '',
                      data_inclusao: dataHojeIsoLocal(),
                      cpf: '',
                      rg: '',
                    },
                  ],
                }));
              }}
            >
              + Adicionar Dependente
            </Button>
          </div>
        </div>

        <BeneficiariosCadastroTabela
          beneficiarios={form.beneficiarios}
          plano={planoSel ?? null}
          dataInicioContrato={dataInicioCtr}
          titulo="Lista para conferência (vendedor)"
          vazio="Nenhum dependente na lista — adicione acima para ver filiação e carência aqui."
        />

        {form.beneficiarios.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-slate-400 py-4">Nenhum beneficiário adicionado.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              Digitação dos dependentes
            </p>
            {form.beneficiarios.map((ben, idx) => (
              <div
                key={ben.id || idx}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-slate-800">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-slate-300">
                    Dependente {idx + 1}
                  </span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const newList = form.beneficiarios.filter((_, i) => i !== idx);
                      setForm((f) => ({ ...f, beneficiarios: newList }));
                    }}
                  >
                    Remover
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-start">
                  <div className="sm:col-span-2 lg:col-span-6">
                    <Input
                      label="Nome completo (opcional)"
                      autoComplete="off"
                      value={ben.nome}
                      onChange={(e) => {
                        setForm((f) => ({
                          ...f,
                          beneficiarios: f.beneficiarios.map((item, i) =>
                            i === idx ? { ...item, nome: e.target.value } : item,
                          ),
                        }));
                      }}
                    />
                  </div>
                  <div className="sm:col-span-1 lg:col-span-3">
                    <ParentescoDependenteSelect
                      required
                      value={ben.parentesco}
                      onChange={(e) => {
                        const valor = normalizarParentescoDependente(e.target.value);
                        setForm((f) => ({
                          ...f,
                          beneficiarios: f.beneficiarios.map((item, i) =>
                            i === idx ? { ...item, parentesco: valor } : item,
                          ),
                        }));
                      }}
                    />
                  </div>
                  <div className="sm:col-span-1 lg:col-span-3">
                    {ben.id && isEdit ? (
                      <div className="w-full space-y-1.5">
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider ml-1">
                          Data de filiação
                        </label>
                        <div className="flex h-11 w-full items-center rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-100/80 px-4 text-sm text-gray-700 dark:text-slate-300">
                          {ben.data_inclusao
                            ? formatarDataIsoPtBr(ben.data_inclusao)
                            : '—'}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 ml-1">
                          Definida no cadastro — não pode ser alterada na edição.
                        </p>
                      </div>
                    ) : (
                      <Input
                        label="Data de filiação"
                        type="date"
                        min={filiacaoDataLivreNoCadastro ? undefined : limitesFiliacao?.min}
                        max={filiacaoDataLivreNoCadastro ? undefined : limitesFiliacao?.max}
                        helperText={
                          filiacaoDataLivreNoCadastro
                            ? 'Informe a data real de filiação do dependente (qualquer data). Digite (DD/MM/AAAA) ou use o calendário.'
                            : `${mensagemLimiteDataFiliacaoDependente(dataInicioCtr)} Digite (DD/MM/AAAA) ou use o calendário.`
                        }
                        value={ben.data_inclusao || ''}
                        onChange={(e) => {
                          const valor = (e.target.value || '').slice(0, 10);
                          setForm((f) => ({
                            ...f,
                            beneficiarios: f.beneficiarios.map((item, i) =>
                              i === idx ? { ...item, data_inclusao: valor } : item,
                            ),
                          }));
                        }}
                      />
                    )}
                  </div>
                  <div className="sm:col-span-1 lg:col-span-4">
                    <Input
                      label="Nascimento (opcional)"
                      type="date"
                      pickerOnly
                      helperText=""
                      value={ben.data_nascimento}
                      onChange={(e) => {
                        const newList = [...form.beneficiarios];
                        newList[idx].data_nascimento = e.target.value;
                        setForm((f) => ({ ...f, beneficiarios: newList }));
                      }}
                    />
                  </div>
                  <div className="sm:col-span-1 lg:col-span-4">
                    <Input
                      label="CPF (opcional)"
                      value={ben.cpf || ''}
                      onChange={(e) => {
                        const newList = [...form.beneficiarios];
                        newList[idx].cpf = maskCpf(e.target.value);
                        setForm((f) => ({ ...f, beneficiarios: newList }));
                      }}
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div className="sm:col-span-1 lg:col-span-4">
                    <Input
                      label="RG"
                      value={ben.rg || ''}
                      onChange={(e) => {
                        const newList = [...form.beneficiarios];
                        newList[idx].rg = e.target.value;
                        setForm((f) => ({ ...f, beneficiarios: newList }));
                      }}
                      placeholder="RG"
                    />
                  </div>
                </div>

                {planoSel && (ben.data_inclusao || '').trim() && (
                  <BeneficiarioCarenciaPreview
                    dataInclusao={ben.data_inclusao}
                    diasCarencia={diasCarenciaDep}
                    nome={ben.nome}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <PageHeader
        title={isEdit ? 'Editar Cliente' : (isContractFlow ? 'Novo Contrato' : 'Novo Cliente')}
        subtitle={isContractFlow
          ? 'Contrato no titular já cadastrado — dependentes opcionais; informe o cobrador se o pagamento for via cobrador'
          : 'Cadastre o titular e, se quiser, dependentes e contrato no mesmo fluxo.'}
      />

      {!isEdit && !isContractFlow && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
          <div>
            <p className="font-medium text-gray-900 dark:text-slate-100">Rascunho automático ativo</p>
            <p className="text-xs text-blue-800 mt-0.5">
              {rascunhoSalvoEm
                ? `Último salvamento: ${new Date(rascunhoSalvoEm).toLocaleString('pt-BR')}`
                : 'O preenchimento é salvo neste navegador enquanto você edita.'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button type="button" size="sm" variant="outline" onClick={handleSalvarRascunho}>
              Salvar rascunho
            </Button>
            {rascunhoSalvoEm && (
              <Button type="button" size="sm" variant="outline" onClick={handleDescartarRascunho}>
                Descartar
              </Button>
            )}
          </div>
        </div>
      )}

      {resumoCompletudeCadastro && (
        <Card className="p-4 mb-6">
          <ClientePendenciasCadastro variant="barra" resumo={resumoCompletudeCadastro} />
          {resumoCompletudeCadastro.pendentes > 0 && (
            <details className="mt-3 text-xs text-gray-700 dark:text-slate-300">
              <summary className="cursor-pointer font-semibold text-amber-800 dark:text-amber-300">
                Ver lista de dados faltando ({resumoCompletudeCadastro.pendentes})
              </summary>
              <ClientePendenciasCadastro className="mt-2" variant="painel" resumo={resumoCompletudeCadastro} />
            </details>
          )}
        </Card>
      )}

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => setStep(i + 1)}
                disabled={i + 1 > step}
                className={`flex items-center gap-2 ${step === i + 1 ? 'text-blue-600 dark:text-blue-400 font-semibold' :
                  step > i + 1 ? 'text-emerald-600' : 'text-gray-400'
                  }`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step === i + 1 ? 'bg-blue-600 text-white' :
                  step > i + 1 ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' : 'bg-gray-200 text-gray-500 dark:text-slate-400'
                  }`}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span className="hidden md:block text-sm">{label}</span>
              </button>
              {i < stepLabels.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 ${step > i + 1 ? 'bg-emerald-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        onKeyDown={(e) => {
          // Evita submit implícito com Enter durante preenchimento
          if (e.key === 'Enter' && step < TOTAL_STEPS) {
            const target = e.target as HTMLElement;
            if (target?.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }
        }}
      >
        {/* Step 1: Cliente (contrato) / Dados Pessoais (cliente) */}
        {step === 1 && (
          isContractFlow ? (
            <Card className="p-6 space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 border-b border-gray-200 dark:border-slate-700 pb-3">Confirmar Cliente Cadastrado</h3>
              <Input
                label="Buscar cliente por nome, CPF ou e-mail"
                className="normal-case"
                autoComplete="off"
                value={clienteBusca}
                onChange={(e) => setClienteBusca(e.target.value)}
                placeholder="Digite ao menos 2 letras — ex.: Maria, CPF ou e-mail"
              />
              <div className="flex items-center justify-between rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                <span>
                  {clienteBusca.trim().length >= 2
                    ? 'Resultados da busca'
                    : `Últimos ${ULTIMOS_CLIENTES_NOVO_CONTRATO} clientes cadastrados`}
                </span>
                <span>{clientesFiltrados.length} resultado(s)</span>
              </div>
              <div className="max-h-80 overflow-auto border border-gray-200 dark:border-slate-700 rounded-lg divide-y divide-gray-100 dark:divide-slate-800">
                {clientesFiltrados.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-slate-400 p-4">Nenhum cliente encontrado.</p>
                ) : (
                  clientesFiltrados.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClienteSelecionadoId(c.id)}
                      disabled={loadingClienteContrato && clienteSelecionadoId === c.id}
                      className={`w-full text-left p-3 transition-colors ${clienteSelecionadoId === c.id ? 'bg-blue-50 dark:bg-blue-950/50' : 'hover:bg-gray-50 dark:hover:bg-slate-800'} ${loadingClienteContrato && clienteSelecionadoId === c.id ? 'opacity-70' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-slate-100">{c.nome}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{c.cpf || '-'} • {c.email || '-'}</p>
                        </div>
                        <div className="text-right">
                          {!clienteBusca.trim() && (
                            <span className="inline-flex rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                              Recente
                            </span>
                          )}
                          {cobradorNomePorClienteId.get(c.id) && (
                            <p className="mt-1 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                              Cobrador: {cobradorNomePorClienteId.get(c.id)}
                            </p>
                          )}
                          {c.created_at && (
                            <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                              Cad.: {formatDateTime(c.created_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {clienteSelecionado && (
                <div className="rounded-lg border border-green-200 dark:border-emerald-800/50 bg-green-50 dark:bg-emerald-950/40 p-4 text-sm space-y-2">
                  <p className="font-semibold text-green-800 dark:text-emerald-200">Cliente confirmado</p>
                  <p className="text-green-700 dark:text-emerald-300">{clienteSelecionado.nome} • {clienteSelecionado.cpf || '-'}</p>
                  {loadingClienteContrato ? (
                    <p className="text-green-600 dark:text-emerald-400 text-xs">Carregando dependentes e dados do cadastro...</p>
                  ) : (
                    <p className="text-green-700 dark:text-emerald-300 text-xs">
                      {form.beneficiarios.filter((b) => (b.nome || '').trim()).length > 0
                        ? `${form.beneficiarios.filter((b) => (b.nome || '').trim()).length} dependente(s) importado(s) do cadastro — confira na próxima etapa.`
                        : 'Nenhum dependente no cadastro deste cliente (você pode incluir na etapa Contrato).'}
                      {form.forma_pagamento_preferencial
                        ? ` • Pagamento: ${form.forma_pagamento_preferencial}`
                        : ''}
                    </p>
                  )}
                </div>
              )}
              <div className="text-xs text-gray-500 dark:text-slate-400">
                Não encontrou o cliente? Faça o cadastro primeiro em <strong>Novo Cliente</strong>.
              </div>
            </Card>
          ) : (
            <Card className="p-6 space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 border-b border-gray-200 dark:border-slate-700 pb-3">Dados Pessoais</h3>

              {!isEdit && !isContractFlow && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/90 dark:bg-amber-950/50 p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="cadastro_migracao"
                      checked={form.cadastro_migracao}
                      onChange={handleChange}
                      className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-sm leading-snug">
                      <span className="font-semibold text-amber-900 dark:text-amber-200">Cadastro de migração</span>
                      <span className="block text-xs text-amber-800 dark:text-amber-300 mt-1">
                        Marque ao importar contrato antigo que ainda não tinha CPF no sistema.
                        Cadastros novos normais devem permanecer desmarcados e informar CPF.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {isEdit && form.cadastro_migracao && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
                  Cliente importado por migração — CPF pode ser preenchido depois, quando disponível.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Input label="Nome Completo *" name="nome" value={form.nome} onChange={handleChange} required />
                </div>
                <Input label="Nome Social" name="nome_social" value={form.nome_social} onChange={handleChange} placeholder="Opcional" />
                <Input
                  label={
                    isEdit || migracaoSemCpfObrigatorio
                      ? 'CPF (opcional)'
                      : 'CPF *'
                  }
                  name="cpf"
                  value={form.cpf}
                  onChange={(e) => setForm(p => ({ ...p, cpf: formatCpf(e.target.value) }))}
                  placeholder="000.000.000-00"
                  required={!isEdit && !isContractFlow && !migracaoSemCpfObrigatorio}
                  helperText={
                    migracaoSemCpfObrigatorio
                      ? 'Migração: deixe em branco se o contrato antigo não tinha CPF. Preencha quando souber.'
                      : isEdit
                        ? 'Opcional na edição. Se informar, use 11 dígitos válidos.'
                        : 'Obrigatório em cadastros novos (marque migração acima ou use contrato de migração).'
                  }
                />
                <Input label="RG" name="rg" value={form.rg} onChange={handleChange} placeholder="Opcional" />
                <Input
                  label="Data de nascimento (opcional)"
                  name="data_nascimento"
                  type="date"
                  value={form.data_nascimento}
                  onChange={handleChange}
                />
                <Input label="E-mail" name="email" type="email" value={form.email} onChange={handleChange} placeholder="Opcional" />
                <div className="space-y-1">
                  <Input
                    label="Telefone Principal *" name="telefone_principal" value={form.telefone_principal}
                    onChange={(e) => setForm(p => ({ ...p, telefone_principal: formatPhone(e.target.value) }))}
                    placeholder="(00) 00000-0000" required
                  />
                  {validarWhatsapp(form.telefone_principal) && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium px-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <MessageCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>WhatsApp válido</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Input
                    label="WhatsApp" name="whatsapp" value={form.whatsapp}
                    onChange={(e) => setForm(p => ({ ...p, whatsapp: formatPhone(e.target.value) }))}
                    placeholder="(00) 00000-0000"
                  />
                  {validarWhatsapp(form.whatsapp) && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium px-1 animate-in fade-in slide-in-from-top-1 duration-200">
                      <MessageCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>WhatsApp válido</span>
                    </div>
                  )}
                </div>
                <Select label="Sexo" name="sexo" value={form.sexo} onChange={handleChange}>
                  <option value="">Selecionar...</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                  <option value="Outro">Outro</option>
                </Select>
                <Select label="Estado Civil" name="estado_civil" value={form.estado_civil} onChange={handleChange}>
                  <option value="">Selecionar...</option>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                  <option value="uniao_estavel">União Estável</option>
                </Select>
                <Input label="Profissão" name="profissao" value={form.profissao} onChange={handleChange} />
                <Input label="Nome da Mãe" name="nome_mae" value={form.nome_mae} onChange={handleChange} />
                <Input label="Nome do Pai" name="nome_pai" value={form.nome_pai} onChange={handleChange} />
              </div>
            </Card>
          )
        )}

        {/* Step 2: Endereço (somente fluxo de cliente) */}
        {!isContractFlow && step === 2 && (
          <Card className="p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 border-b border-gray-200 dark:border-slate-700 pb-3">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Input label="CEP" name="endereco_cep" value={form.endereco_cep}
                    onChange={(e) => {
                      const val = formatCep(e.target.value);
                      setForm(p => ({ ...p, endereco_cep: val }));
                      const cleanCep = val.replace(/\D/g, '');

                      // Abort previous request if exists
                      if (cepAbortController.current) {
                        cepAbortController.current.abort();
                      }

                      if (cleanCep.length === 8) {
                        setLoading(true);
                        const controller = new AbortController();
                        cepAbortController.current = controller;

                        fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, { signal: controller.signal })
                          .then(res => res.json())
                          .then(data => {
                            if (!data.erro) {
                              setForm(prev => ({
                                ...prev,
                                endereco_logradouro: data.logradouro,
                                endereco_bairro: data.bairro,
                                endereco_cidade: data.localidade,
                                endereco_estado: resolverUfParaSelect(data.uf),
                              }));
                            } else {
                              alert('CEP não encontrado!');
                            }
                          })
                          .catch(err => {
                            if (err.name !== 'AbortError') {
                              console.error("Erro ao buscar CEP", err);
                              alert('Erro ao buscar CEP via ViaCEP.');
                            }
                          })
                          .finally(() => {
                            setLoading(false);
                            cepAbortController.current = null;
                          });
                      }
                    }}
                    placeholder="00000-000"
                  />
                  {loading && <div className="absolute right-3 top-9 animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>}
                </div>
              </div>
              <div className="md:col-span-4">
                <Input label="Logradouro *" name="endereco_logradouro" value={form.endereco_logradouro} onChange={handleChange} required />
              </div>
              <div className="md:col-span-1">
                <Input label="Número *" name="endereco_numero" value={form.endereco_numero} onChange={handleChange} required />
              </div>
              <div className="md:col-span-2">
                <Input label="Complemento" name="endereco_complemento" value={form.endereco_complemento} onChange={handleChange} />
              </div>
              <div className="md:col-span-3">
                <Input label="Bairro *" name="endereco_bairro" value={form.endereco_bairro} onChange={handleChange} required />
              </div>
              <div className="md:col-span-3">
                <Input label="Cidade *" name="endereco_cidade" value={form.endereco_cidade} onChange={handleChange} required />
              </div>
              <div className="md:col-span-2">
                <Select
                  label="UF *"
                  name="endereco_estado"
                  value={form.endereco_estado}
                  onChange={handleChange}
                  required
                >
                  <option value="">Selecione a UF</option>
                  {UF_SIGLAS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Endereço de cobrança</p>
                  <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                    {form.usa_endereco_residencial_cobranca ? (
                      <>
                        <span className="font-medium text-emerald-700 dark:text-emerald-300">Igual ao residencial</span>
                        {' — '}na cobrança e na carteira será usado o endereço que você preencheu acima.
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-amber-800 dark:text-amber-300">Outro endereço</span>
                        {' — '}edite os campos abaixo. Ao ligar de novo, volta a usar só o residencial.
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2 md:flex-row md:items-center md:gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {form.usa_endereco_residencial_cobranca ? 'Ligado' : 'Desligado'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.usa_endereco_residencial_cobranca}
                    aria-label={form.usa_endereco_residencial_cobranca ? 'Desativar mesmo endereço de cobrança' : 'Usar mesmo endereço de cobrança que o residencial'}
                    onClick={() => definirMesmoEnderecoCobranca(!form.usa_endereco_residencial_cobranca)}
                    className={`relative inline-flex h-9 w-[4.25rem] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 ${
                      form.usa_endereco_residencial_cobranca ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute top-0.5 left-0.5 inline-block h-7 w-7 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ease-out ${
                        form.usa_endereco_residencial_cobranca ? 'translate-x-9' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {!form.usa_endereco_residencial_cobranca && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 border-b border-gray-200 dark:border-slate-700 pb-3 flex items-center gap-2">
                   <CreditCard className="h-5 w-5 text-gray-400" /> Endereço de Cobrança
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-2">
                    <Input label="CEP (Cobrança)" name="endereco_cob_cep" value={form.endereco_cob_cep}
                      onChange={(e) => {
                        const val = formatCep(e.target.value);
                        setForm(p => ({ ...p, endereco_cob_cep: val }));
                        const cleanCep = val.replace(/\D/g, '');
                        if (cleanCep.length === 8) {
                          fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
                            .then(res => res.json())
                            .then(data => {
                              if (!data.erro) {
                                setForm(prev => ({
                                  ...prev,
                                  endereco_cob_logradouro: data.logradouro,
                                  endereco_cob_bairro: data.bairro,
                                  endereco_cob_cidade: data.localidade,
                                  endereco_cob_estado: resolverUfParaSelect(data.uf),
                                }));
                              }
                            });
                        }
                      }}
                      placeholder="00000-000"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <Input label="Logradouro" name="endereco_cob_logradouro" value={form.endereco_cob_logradouro} onChange={handleChange} />
                  </div>
                  <div className="md:col-span-1">
                    <Input label="Número" name="endereco_cob_numero" value={form.endereco_cob_numero} onChange={handleChange} />
                  </div>
                  <div className="md:col-span-2">
                    <Input label="Complemento" name="endereco_cob_complemento" value={form.endereco_cob_complemento} onChange={handleChange} />
                  </div>
                  <div className="md:col-span-3">
                    <Input label="Bairro" name="endereco_cob_bairro" value={form.endereco_cob_bairro} onChange={handleChange} />
                  </div>
                  <div className="md:col-span-3">
                    <Input label="Cidade" name="endereco_cob_cidade" value={form.endereco_cob_cidade} onChange={handleChange} />
                  </div>
                  <div className="md:col-span-2">
                    <Select
                      label="UF"
                      name="endereco_cob_estado"
                      value={form.endereco_cob_estado}
                      onChange={handleChange}
                    >
                      <option value="">Selecione a UF</option>
                      {UF_SIGLAS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}


        {/* Step 2 (contrato): Plano & Beneficiários */}
        {isContractFlow && step === 2 && (
          <div className="space-y-6">
            {clienteSelecionado && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">Cliente: {clienteSelecionado.nome}</p>
                <p className="text-xs mt-1 text-emerald-800">
                  CPF {clienteSelecionado.cpf || '—'} • {clienteSelecionado.telefone_principal || '—'} •{' '}
                  {clienteSelecionado.endereco_cidade || '—'}/{clienteSelecionado.endereco_estado || '—'}
                </p>
              </div>
            )}
            {renderPlanoContratoCard()}
            <div className="rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
              Os <strong>dependentes já cadastrados</strong> na ficha do cliente foram trazidos automaticamente.
              Você pode editar, remover ou incluir novos. Informe a forma de pagamento; se for cobrador, escolha quem
              fará a cobrança.
            </div>
            {form.beneficiarios.filter((b) => (b.nome || '').trim()).length > 0 && (
              <BeneficiariosCadastroTabela
                beneficiarios={form.beneficiarios}
                plano={planos.find((p) => p.id === form.plano_id) ?? null}
                dataInicioContrato={dataInicioContratoEfetiva}
                titulo="Dependentes do cadastro do cliente"
              />
            )}
            {renderBeneficiariosCard({ requirePlano: true })}
          </div>
        )}

        {/* Step Contrato (cadastro de cliente com contrato opcional) */}
        {incluiContratoNoCadastro && step === contratoStepNum && (
          <div className="space-y-6">
            <div className="rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
              <strong>Opcional</strong> — selecione um plano só se quiser gerar contrato e mensalidades agora.
              Pode pular esta etapa e cadastrar apenas o cliente; o contrato pode ser criado depois em{' '}
              <strong>Contratos → Novo Contrato</strong>.
            </div>
            {renderPlanoContratoCard()}
            {form.beneficiarios.filter((b) => (b.nome || '').trim()).length > 0 && (
              <BeneficiariosCadastroTabela
                beneficiarios={form.beneficiarios}
                plano={planos.find((p) => p.id === form.plano_id) ?? null}
                dataInicioContrato={dataInicioContratoEfetiva}
                titulo="Dependentes já informados — conferir carência com o plano"
              />
            )}
            {renderBeneficiariosCard({ requirePlano: !!form.plano_id })}
          </div>
        )}

        {/* Step 3: Dependentes (cadastro / edição de cliente — opcional) */}
        {!isContractFlow && step === 3 && (
          <div className="space-y-6">
            <div className="rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
              Dependentes são opcionais. Plano e contrato também — na etapa <strong>Financeiro</strong> você pode
              incluir contrato, mas não é obrigatório.
            </div>
            {renderBeneficiariosCard({ requirePlano: false })}
          </div>
        )}

        {/* Step 4: Financeiro (novo cliente ou edição) */}
        {((isEdit && step === 4) || (!isEdit && !isContractFlow && step === 4)) && (
          <Card className="p-6 space-y-6">
            {!isEdit && (
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
                    checked={criarContratoAgora}
                    onChange={(e) => handleCriarContratoToggle(e.target.checked)}
                  />
                  <div>
                    <span className="font-medium text-gray-900 dark:text-slate-100">Criar contrato e plano neste cadastro (opcional)</span>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      Marque para incluir a etapa <strong>Contrato</strong>. Mesmo marcado, você pode pular sem
                      escolher plano — o cliente será cadastrado normalmente.
                    </p>
                  </div>
                </label>
              </div>
            )}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-800 pb-3">
              Financeiro
            </h3>

            <div className="rounded-xl border-2 border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30 p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">
                  Vencimento das mensalidades
                </p>
                <p className="text-xs text-blue-900/80 dark:text-blue-200/80 mt-1">
                  Defina quando o cliente entrou na base e em qual dia do mês as parcelas vencem.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Data de entrada do contato na base *"
                  type="date"
                  name="data_entrada_cliente"
                  value={form.data_entrada_cliente}
                  onChange={handleChange}
                  helperText="Data em que o cliente passou a constar no sistema. Para contrato novo, também define a data de início do contrato."
                  required
                />
                {renderCampoDiaVencimento()}
              </div>
            </div>

            <div className="md:col-span-2">
              {renderSeletorFormaPagamentoECobrador()}
            </div>

            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 border-b border-gray-200 dark:border-slate-700 pb-3 pt-4">Informações de CRM</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Vendedor responsável"
                name="vendedor_id"
                value={form.vendedor_id || VENDEDOR_ESCRITORIO_ID}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((p) => ({
                    ...p,
                    vendedor_id: v,
                    tipo_vendedor:
                      v === VENDEDOR_ESCRITORIO_ID
                        ? 'escritorio'
                        : p.tipo_vendedor === 'escritorio'
                          ? ''
                          : p.tipo_vendedor,
                  }));
                }}
              >
                {loadingVendedores ? (
                  <option value={VENDEDOR_ESCRITORIO_ID}>Carregando vendedores...</option>
                ) : null}
                {vendedoresDisponiveis.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                    {v.role && v.role !== 'vendedor' ? ` (${v.role})` : ''}
                  </option>
                ))}
              </Select>
              {!loadingVendedores &&
              vendedoresDisponiveis.filter((v) => v.id !== VENDEDOR_ESCRITORIO_ID).length === 0 ? (
                <p className="md:col-span-3 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 rounded-lg px-3 py-2 -mt-2">
                  Nenhum vendedor ativo nesta unidade — use <strong>Escritório</strong> ou cadastre usuários com perfil{' '}
                  <strong>Vendedor</strong> em Configurações → Usuários.
                </p>
              ) : null}
              <Select
                label="Tipo de vendedor"
                name="tipo_vendedor"
                value={form.vendedor_id === VENDEDOR_ESCRITORIO_ID ? 'escritorio' : form.tipo_vendedor}
                onChange={handleChange}
                disabled={form.vendedor_id === VENDEDOR_ESCRITORIO_ID}
              >
                <option value="">Selecionar...</option>
                <option value="escritorio">Escritório</option>
                <option value="interno">Vendedor interno</option>
                <option value="externo">Vendedor externo</option>
              </Select>
              <Select label="Origem / Canal" name="origem_canal" value={form.origem_canal} onChange={handleChange}>
                <option value="">Selecionar...</option>
                <option value={ORIGEM_CANAL_MIGRACAO}>Migração / contrato antigo</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="google">Google Search</option>
                <option value="indicacao">Indicação</option>
                <option value="outdoor">Outdoor / Placa</option>
                <option value="radio">Rádio / Carro de Som</option>
                <option value="panfletagem">Panfletagem</option>
                <option value="outro">Outro</option>
              </Select>
              <Select label="Nível de Relacionamento" name="nivel_relacionamento" value={form.nivel_relacionamento} onChange={handleChange}>
                <option value="frio">Frio (Lead novo)</option>
                <option value="morno">Morno (Em negociação)</option>
                <option value="quente">Quente (Quase fechando)</option>
                <option value="fidelizado">Fidelizado (Cliente antigo)</option>
              </Select>
            </div>
          </Card>
        )}

        {/* Step final: Revisão */}
        {step === TOTAL_STEPS && (
          <Card className="p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 border-b border-gray-200 dark:border-slate-700 pb-3">Revisão Final</h3>

            {resumoCompletudeCadastro && (
              <ClientePendenciasCadastro variant="painel" resumo={resumoCompletudeCadastro} />
            )}

            <div className="border-t pt-6">
              <h4 className="font-medium text-gray-900 dark:text-slate-100 mb-4">{isContractFlow ? 'Resumo da Contratação' : 'Resumo do Cadastro'}</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500 dark:text-slate-400">Nome:</span> <span className="font-medium text-gray-900 dark:text-slate-100">{(isContractFlow ? clienteSelecionado?.nome : form.nome) || '-'}</span></div>
                <div><span className="text-gray-500 dark:text-slate-400">CPF:</span> <span className="font-medium text-gray-900 dark:text-slate-100">{(isContractFlow ? clienteSelecionado?.cpf : form.cpf) || '-'}</span></div>
                <div><span className="text-gray-500 dark:text-slate-400">Email:</span> <span className="font-medium text-gray-900 dark:text-slate-100">{(isContractFlow ? clienteSelecionado?.email : form.email) || '-'}</span></div>
                <div><span className="text-gray-500 dark:text-slate-400">Telefone:</span> <span className="font-medium text-gray-900 dark:text-slate-100">{(isContractFlow ? clienteSelecionado?.telefone_principal : form.telefone_principal) || '-'}</span></div>
                <div><span className="text-gray-500 dark:text-slate-400">Cidade:</span> <span className="font-medium text-gray-900 dark:text-slate-100">{(isContractFlow ? clienteSelecionado?.endereco_cidade : form.endereco_cidade) || '-'} / {(isContractFlow ? clienteSelecionado?.endereco_estado : form.endereco_estado) || '-'}</span></div>
                {isContractFlow && (
                  <>
                    <div><span className="text-gray-500 dark:text-slate-400">Plano:</span> <span className="font-medium text-gray-900 dark:text-slate-100">{planos.find(p => p.id === form.plano_id)?.nome || '-'}</span></div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Pagamento:</span>{' '}
                      <span className="font-medium capitalize">
                        {form.forma_pagamento_preferencial === 'cobrador'
                          ? 'Cobrador'
                          : form.forma_pagamento_preferencial || '-'}
                      </span>
                    </div>
                    {pagamentoViaCobrador && (
                      <div>
                        <span className="text-gray-500 dark:text-slate-400">Cobrador:</span>{' '}
                        <span className="font-medium text-violet-800 dark:text-violet-200">
                          {cobradoresDisponiveis.find((c) => c.id === form.cobrador_id)?.nome || '—'}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Dia vencimento:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-slate-100">Dia {diaVencimentoNum}</span>
                    </div>
                    <div><span className="text-gray-500 dark:text-slate-400">Dependentes:</span> <span className="font-medium text-gray-900 dark:text-slate-100">{form.beneficiarios.filter((b) => (b.nome || '').trim()).length}</span></div>
                  </>
                )}
                {!isContractFlow && (
                  <>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Dependentes:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-slate-100">{form.beneficiarios.filter((b) => (b.nome || '').trim()).length}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Vendedor:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-slate-100">
                        {rotuloVendedorForm(form.vendedor_id, vendedoresDisponiveis)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 dark:text-slate-400">Entrada na base:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-slate-100">
                        {form.data_entrada_cliente
                          ? formatarDataIsoPtBr(form.data_entrada_cliente)
                          : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-slate-400">Dia vencimento:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-slate-100">Dia {diaVencimentoNum}</span>
                    </div>
                    {incluiContratoNoCadastro && form.plano_id && (
                      <>
                        <div><span className="text-gray-500 dark:text-slate-400">Plano:</span> <span className="font-medium text-gray-900 dark:text-slate-100">{planos.find(p => p.id === form.plano_id)?.nome || '-'}</span></div>
                        <div className="col-span-2">
                          <span className="text-gray-500 dark:text-slate-400">Início do contrato:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-slate-100">
                            {dataInicioContratoEfetiva
                              ? formatarDataIsoPtBr(dataInicioContratoEfetiva)
                              : '-'}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-500 dark:text-slate-400">1º vencimento (calculado):</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-slate-100">
                            {primeiroVencimentoExibicao
                              ? formatarDataIsoPtBr(primeiroVencimentoExibicao)
                              : '-'}
                          </span>
                        </div>
                        {contratoMigracao && (
                          <>
                            <div className="col-span-2">
                              <span className="text-gray-500 dark:text-slate-400">Última mensalidade paga (venc.):</span>{' '}
                              <span className="font-medium text-gray-900 dark:text-slate-100">
                                {form.data_ultima_mensalidade_paga
                                  ? formatarDataIsoPtBr(form.data_ultima_mensalidade_paga)
                                  : '-'}
                              </span>
                            </div>
                            <div className="col-span-2 text-amber-800 dark:text-amber-300">
                              <span className="text-gray-500 dark:text-slate-400">Migração:</span>{' '}
                              <span className="font-medium text-gray-900 dark:text-slate-100">
                                {qtdMensalidadesPagas} quitada(s) + 12 futuras em aberto
                              </span>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
                {isContractFlow && (
                  <>
                    <div className="col-span-2">
                      <span className="text-gray-500 dark:text-slate-400">Início do contrato:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-slate-100">
                        {dataInicioContratoEfetiva
                          ? formatarDataIsoPtBr(dataInicioContratoEfetiva)
                          : '-'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 dark:text-slate-400">1º vencimento (calculado):</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-slate-100">
                        {primeiroVencimentoExibicao
                          ? formatarDataIsoPtBr(primeiroVencimentoExibicao)
                          : '-'}
                      </span>
                    </div>
                    {contratoMigracao && (
                      <>
                        <div className="col-span-2">
                          <span className="text-gray-500 dark:text-slate-400">Última mensalidade paga (venc.):</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-slate-100">
                            {form.data_ultima_mensalidade_paga
                              ? formatarDataIsoPtBr(form.data_ultima_mensalidade_paga)
                              : '-'}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-500 dark:text-slate-400">Pagamento registrado em:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-slate-100">
                            {form.data_registro_ultimo_pagamento
                              ? formatarDataIsoPtBr(form.data_registro_ultimo_pagamento)
                              : '-'}
                          </span>
                        </div>
                        <div className="col-span-2 text-amber-800 dark:text-amber-300">
                          <span className="text-gray-500 dark:text-slate-400">Migração:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-slate-100">
                            {qtdMensalidadesPagas} quitada(s) + 12 futuras em aberto
                          </span>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {form.beneficiarios.filter((b) => (b.nome || '').trim()).length > 0 && (
              <div className="border-t pt-6">
                <BeneficiariosCadastroTabela
                  beneficiarios={form.beneficiarios}
                  plano={planos.find((p) => p.id === form.plano_id) ?? null}
                  dataInicioContrato={dataInicioContratoEfetiva}
                  titulo="Revisão — dependentes e carência"
                />
              </div>
            )}

            {!isContractFlow && (
              <Textarea label="Observações" name="observacoes" value={form.observacoes} onChange={handleChange} placeholder="Observações gerais sobre o cliente..." rows={3} />
            )}
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => step === 1 ? navigate(isContractFlow ? '/clientes/contratos' : '/clientes') : setStep(s => s - 1)}>
              {step === 1 ? 'Cancelar' : '← Voltar'}
            </Button>
            {!isEdit && !isContractFlow && (
              <Button type="button" variant="outline" onClick={handleSalvarRascunho}>
                Salvar rascunho
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {incluiContratoNoCadastro && step === contratoStepNum && (
              <Button type="button" variant="outline" onClick={handlePularContrato}>
                Pular contrato
              </Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button type="button" onClick={handleNextStep}>
                {incluiContratoNoCadastro && step === contratoStepNum && !form.plano_id
                  ? 'Continuar sem contrato →'
                  : 'Próximo →'}
              </Button>
            ) : (
              <Button
                type="button"
                loading={loading}
                onClick={() => {
                  submitIntentRef.current = true;
                  void handleSubmit();
                }}
              >
                {isEdit ? 'Salvar Alterações' : (isContractFlow ? 'Confirmar Contrato' : (form.plano_id ? 'Confirmar Cadastro e Contrato' : 'Confirmar Cadastro'))}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div >
  );
};

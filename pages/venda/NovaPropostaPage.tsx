import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ShieldCheck, Loader2, Lock, Sparkles, Calendar, User, Users, MapPin, CreditCard, FileText, Send, AlertCircle, Save, MessageCircle, Phone, Trash2, FileSignature, Headphones
} from 'lucide-react';
import { validarWhatsapp } from '../../lib/whatsappValidacao';
import { PageHeader } from '../../components/common/PageHeader';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { usePlanosStore } from '../../lib/PlanosStore';
import { useClienteStore } from '../../lib/ClienteStore';
import { useToast } from '../../lib/ToastStore';
import type { PlanoCompleto } from '../../lib/PlanosStore';
import {
  buildPropostaPdfBlob,
  downloadPropostaPdf,
  openWhatsAppComMensagem,
} from '../../lib/PropostaDocumentoService';
import { resolverDadosVendedorPropostaPdf } from '../../lib/propostaVendedorPdf';
import { primeiroVencimentoPropostaNovo } from '../../lib/dateInputUtils';
import {
  PROPOSTA_ADESAO_MAX_CENTAVOS,
  PROPOSTA_ADESAO_MIN_CENTAVOS,
  valorAdesaoInicialProposta,
} from '../../lib/propostaAdesaoLimites';
import {
  buscarAlertasCadastroExistenteProposta,
  mensagensAlertaCadastroExistente,
  temAlertaBloqueanteProposta,
  temAlertaCadastroExistente,
  temAvisoSegundoContratoProposta,
  type PropostaAlertaCadastro,
} from '../../lib/propostaCadastroExistente';
import {
  enderecoPropostaPartesFromRow,
  montarEnderecoResidenciaProposta,
} from '../../lib/propostaEndereco';
import { normalizarStatusProposta, PROPOSTA_STATUS } from '../../lib/propostaStatus';
import { ParentescoDependenteSelect } from '../../components/clientes/ParentescoDependenteSelect';
import { normalizarParentescoDependente } from '../../lib/parentescoDependente';
import { labelStatusProposta } from '../../lib/propostaStatusLabels';
import { gerarContratoDesdeProposta } from '../../lib/propostaGerarContratoService';
import {
  bairroCobrancaCliente,
  buscarCobradorSugeridoPorBairro,
} from '../../lib/cobradorSugestaoBairro';
import { usuarioPodeGerarContratoProposta } from '../../lib/propostasVisibilidade';
import { OpcaoSearchSelect } from '../../components/common/OpcaoSearchSelect';
import { RELIGIOES, labelReligiao } from '../../lib/religioes';
import {
  contarMensalidadesPagasMigracao,
  resolverDatasContratoMigracao,
} from '../../lib/contratoMigracao';
import {
  dataHojeIsoLocal,
  formatarDataIsoPtBr,
  normalizarDataIso,
  ultimoVencimentoCompetenciaProvavel,
} from '../../lib/contratoDatas';
import {
  ContratoGeradoSucessoModal,
  type ContratoGeradoSucessoInfo,
} from '../../components/venda/ContratoGeradoSucessoModal';

type DependenteForm = {
  nome: string;
  cpf: string;
  data_nascimento: string;
  parentesco: string;
};

function normalizeParentescoProposta(value: string): string {
  return normalizarParentescoDependente(value) || '';
}

function dependenteFromDetalhesJson(d: Record<string, unknown>): DependenteForm {
  const dataNasc = String(d?.data_nascimento || '').trim();
  return {
    nome: String(d?.nome || ''),
    cpf: String(d?.cpf || ''),
    data_nascimento: dataNasc.length >= 10 ? dataNasc.slice(0, 10) : '',
    parentesco: normalizeParentescoProposta(String(d?.parentesco || '')),
  };
}

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO',
];

const ESTADOS_CIVIS = [
  { value: '', label: 'Selecione' },
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
  { value: 'separado', label: 'Separado(a)' },
  { value: 'separado_jud', label: 'Separado(a) judicialmente' },
  { value: 'convivente', label: 'Convivente' },
  { value: 'nao_informado', label: 'Prefere não informar' },
];

function formatCentavos(c: number) {
  return `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function reaisStringToCentavos(v: string): number {
  const t = v.trim();
  if (!t) return 0;
  const semMilhar = t.replace(/\./g, '');
  const normalized = semMilhar.replace(',', '.');
  const n = parseFloat(normalized);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function centavosToReaisInput(c: number): string {
  if (!c) return '';
  return (c / 100).toFixed(2).replace('.', ',');
}

function isCpfValido(raw: string) {
  const cpf = raw.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigito = (base: string, fatorInicial: number) => {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) {
      total += Number(base[i]) * (fatorInicial - i);
    }
    const resto = total % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calcDigito(cpf.slice(0, 9), 10);
  const d2 = calcDigito(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

function isCnpjValido(raw: string) {
  const cnpj = raw.replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigito = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((acc, n, idx) => acc + Number(n) * pesos[idx], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calcDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigito(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Mantém só dígitos e aplica máscara (XX) XXXXX-XXXX ou (XX) XXXX-XXXX. */
function formatTelefoneBr(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function telefonePrincipalValido(tel: string): boolean {
  const d = tel.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 11;
}

function erroTelefonePrincipal(tel: string): string | undefined {
  const d = tel.replace(/\D/g, '');
  if (!d) return 'Telefone principal é obrigatório.';
  if (d.length < 10) return 'Informe DDD + número (mín. 10 dígitos).';
  if (d.length > 11) return 'Telefone inválido.';
  return undefined;
}

function dependenteTemAlgumDado(d: DependenteForm): boolean {
  return Boolean(
    d.nome.trim()
    || d.cpf.replace(/\D/g, '')
    || d.data_nascimento.trim()
    || d.parentesco.trim(),
  );
}

function erroCpfDependente(cpf: string): string | undefined {
  const cpfDigits = cpf.replace(/\D/g, '');
  if (!cpfDigits) return undefined;
  if (cpfDigits.length < 11) return 'CPF incompleto — deixe em branco ou preencha os 11 dígitos.';
  if (!isCpfValido(cpf)) return 'CPF inválido.';
  return undefined;
}

/** Retorna mensagem específica ou null se o dependente está ok (índice só para mensagem). */
function mensagemErroDependente(d: DependenteForm, idx: number): string | null {
  if (!dependenteTemAlgumDado(d)) return null;
  const n = idx + 1;
  if (!d.nome.trim()) return `Dependente #${n}: informe o nome.`;
  if (!d.parentesco.trim()) return `Dependente #${n}: selecione o parentesco (CPF não é obrigatório).`;
  const erroCpf = erroCpfDependente(d.cpf);
  if (erroCpf) return `Dependente #${n}: ${erroCpf}`;
  const dataNasc = d.data_nascimento.trim();
  if (dataNasc && Number.isNaN(new Date(`${dataNasc}T12:00:00`).getTime())) {
    return `Dependente #${n}: data de nascimento inválida.`;
  }
  return null;
}

function filtrarDependentesPreenchidos(lista: DependenteForm[]): DependenteForm[] {
  return lista.filter(dependenteTemAlgumDado);
}

function normalizarDependenteParaSalvar(d: DependenteForm): DependenteForm {
  const cpfDigits = d.cpf.replace(/\D/g, '');
  const cpf =
    cpfDigits.length === 11 && isCpfValido(d.cpf)
      ? formatCpf(d.cpf)
      : '';
  return { ...d, cpf };
}

export const NovaPropostaPage: React.FC = () => {
  const { id: propostaId } = useParams<{ id?: string }>();
  const isEditMode = Boolean(propostaId);
  const navigate = useNavigate();
  const { user, empresa } = useAuth();
  const {
    empresaIdEfetivo,
    empresasDoGrupo,
    dataRevisionEmpresa,
  } = useEmpresaContextoAtivo();
  const { showToast } = useToast();
  const { getEmpresaId } = useClienteStore();
  const { planos, loadPlanos, loading: planosLoading } = usePlanosStore();

  const [nextNumero, setNextNumero] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const acaoAposSalvarRef = useRef<'listar' | 'gerarContrato'>('listar');
  const clientRequestIdRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [submitIntent, setSubmitIntent] = useState<'save' | 'whatsapp' | 'draft'>('save');
  const [statusPropostaCarregada, setStatusPropostaCarregada] = useState<string | null>(null);
  const [gerandoContrato, setGerandoContrato] = useState(false);
  const [contratoGeradoInfo, setContratoGeradoInfo] = useState<ContratoGeradoSucessoInfo | null>(
    null,
  );

  const statusNorm = normalizarStatusProposta(statusPropostaCarregada);
  const emPosVenda = statusNorm === PROPOSTA_STATUS.EM_POS_VENDA;
  const contratoJaGerado = statusNorm === PROPOSTA_STATUS.CONTRATO_GERADO;
  const canGerarContrato = usuarioPodeGerarContratoProposta(
    user?.role,
    user?.permissoes as Record<string, unknown>,
    user?.roles_extra,
  );
  const modoEdicaoPosVenda = isEditMode && emPosVenda && canGerarContrato;

  const [planoId, setPlanoId] = useState('');
  const [whatsappUnidade, setWhatsappUnidade] = useState('');

  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [rg, setRg] = useState('');
  const [dataNasc, setDataNasc] = useState('');
  const [estadoCivil, setEstadoCivil] = useState('');
  const [natUf, setNatUf] = useState('');
  const [natCidade, setNatCidade] = useState('');
  const [profissao, setProfissao] = useState('');
  const [religiao, setReligiao] = useState('');

  const [enderecoLogradouro, setEnderecoLogradouro] = useState('');
  const [enderecoNumero, setEnderecoNumero] = useState('');
  const [enderecoBairro, setEnderecoBairro] = useState('');
  const [enderecoQuadra, setEnderecoQuadra] = useState('');
  const [enderecoLote, setEnderecoLote] = useState('');
  /** Loteamento: quadra e lote obrigatórios ao finalizar. */
  const [enderecoPorQuadraLote, setEnderecoPorQuadraLote] = useState(false);
  const [cep, setCep] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('SP');
  const [telPrincipal, setTelPrincipal] = useState('');
  const [telAlt, setTelAlt] = useState('');
  const [email, setEmail] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const [adesaoRecebidaStr, setAdesaoRecebidaStr] = useState('');
  const [primeiroVenc, setPrimeiroVenc] = useState('');
  const [parcelaPagaAto, setParcelaPagaAto] = useState(false);
  const [metodoCobranca, setMetodoCobranca] = useState('boleto');
  const [cobradorMesmoEndereco, setCobradorMesmoEndereco] = useState(true);
  const [cobradorLogradouro, setCobradorLogradouro] = useState('');
  const [cobradorNumero, setCobradorNumero] = useState('');
  const [cobradorBairro, setCobradorBairro] = useState('');
  const [cobradorQuadra, setCobradorQuadra] = useState('');
  const [cobradorLote, setCobradorLote] = useState('');
  const [cobradorCep, setCobradorCep] = useState('');
  const [cobradorCidade, setCobradorCidade] = useState('');
  const [cobradorUf, setCobradorUf] = useState('SP');
  const [cobradorCepLoading, setCobradorCepLoading] = useState(false);
  const [dependentes, setDependentes] = useState<DependenteForm[]>([]);
  const [parcelasRecebidasQuantidade, setParcelasRecebidasQuantidade] = useState(1);
  const [observacoes, setObservacoes] = useState('');
  const [contratoMigracao, setContratoMigracao] = useState(false);
  const [dataInicioContrato, setDataInicioContrato] = useState('');
  const [migracaoCobrarApenasFenix, setMigracaoCobrarApenasFenix] = useState(true);
  const [dataUltimaMensalidadePaga, setDataUltimaMensalidadePaga] = useState('');
  const [dataRegistroUltimoPagamento, setDataRegistroUltimoPagamento] = useState('');
  const [loadingProposta, setLoadingProposta] = useState(false);
  const [empresaIdPropostaCarregada, setEmpresaIdPropostaCarregada] = useState<string | null>(null);
  const [empresaNomePropostaCarregada, setEmpresaNomePropostaCarregada] = useState('');
  const [vendedorIdPropostaCarregada, setVendedorIdPropostaCarregada] = useState<string | null>(null);
  const [alertasCadastroExistente, setAlertasCadastroExistente] = useState<PropostaAlertaCadastro[]>([]);
  const [validandoCadastroExistente, setValidandoCadastroExistente] = useState(false);
  const [cienciaCadastroExistente, setCienciaCadastroExistente] = useState(false);
  const [cobradorSugeridoProposta, setCobradorSugeridoProposta] = useState<{
    id: string;
    nome: string;
  } | null>(null);

  const empresaIdOperacional = useMemo(() => {
    if (isEditMode && empresaIdPropostaCarregada) return empresaIdPropostaCarregada;
    return (empresaIdEfetivo || getEmpresaId() || user?.empresa_id || '').trim();
  }, [
    isEditMode,
    empresaIdPropostaCarregada,
    empresaIdEfetivo,
    getEmpresaId,
    user?.empresa_id,
    dataRevisionEmpresa,
  ]);

  const empresaIdsConsultaCadastro = useMemo(() => {
    const fromGrupo = empresasDoGrupo.map((e) => e.id).filter(Boolean);
    if (fromGrupo.length > 0) return [...new Set(fromGrupo)];
    return empresaIdOperacional ? [empresaIdOperacional] : [];
  }, [empresasDoGrupo, empresaIdOperacional]);

  const bloqueioCadastroExistente = temAlertaBloqueanteProposta(alertasCadastroExistente);
  const avisoSegundoContrato = temAvisoSegundoContratoProposta(alertasCadastroExistente);
  const exibirAlertasCadastro = validandoCadastroExistente || temAlertaCadastroExistente(alertasCadastroExistente);

  const nomeUnidadeProposta = useMemo(() => {
    if (isEditMode && empresaNomePropostaCarregada.trim()) return empresaNomePropostaCarregada.trim();
    const id = (empresaIdEfetivo || '').trim();
    const hit = empresasDoGrupo.find((e) => e.id === id);
    return (hit?.nome || empresa?.nome || '').trim();
  }, [
    isEditMode,
    empresaNomePropostaCarregada,
    empresaIdEfetivo,
    empresasDoGrupo,
    empresa?.nome,
    dataRevisionEmpresa,
  ]);

  const hojeIso = useMemo(() => dataHojeIsoLocal(), []);
  const [dataReferenciaContrato, setDataReferenciaContrato] = useState('');

  useEffect(() => {
    if (isEditMode || contratoMigracao) {
      setDataReferenciaContrato('');
      return;
    }
    const doc = documento.replace(/\D/g, '');
    if (doc.length !== 11 || empresaIdsConsultaCadastro.length === 0) {
      setDataReferenciaContrato(hojeIso);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('clientes')
        .select('cliente_desde')
        .in('empresa_id', empresaIdsConsultaCadastro)
        .eq('cpf', doc)
        .is('deleted_at', null)
        .maybeSingle();
      if (cancelled) return;
      setDataReferenciaContrato(normalizarDataIso(data?.cliente_desde) || hojeIso);
    })();
    return () => {
      cancelled = true;
    };
  }, [documento, empresaIdsConsultaCadastro, isEditMode, contratoMigracao, hojeIso]);

  const dataContratoPropostaIso = useMemo(() => {
    if (contratoMigracao && dataInicioContrato) return dataInicioContrato;
    return dataReferenciaContrato || hojeIso;
  }, [contratoMigracao, dataInicioContrato, dataReferenciaContrato, hojeIso]);

  const dataContratoPropostaLabel = useMemo(
    () => formatarDataIsoPtBr(dataContratoPropostaIso),
    [dataContratoPropostaIso],
  );

  const primeiroVencNovoIso = useMemo(
    () => primeiroVencimentoPropostaNovo(dataContratoPropostaIso),
    [dataContratoPropostaIso],
  );
  const primeiroVencNovoLabel = useMemo(
    () => formatarDataIsoPtBr(primeiroVencNovoIso),
    [primeiroVencNovoIso],
  );

  useEffect(() => {
    if (isEditMode) return;
    setPrimeiroVenc(primeiroVencNovoIso);
  }, [isEditMode, primeiroVencNovoIso]);

  useEffect(() => {
    const e = isEditMode
      ? (empresaIdPropostaCarregada || empresaIdEfetivo || user?.empresa_id || '').trim()
      : (empresaIdEfetivo || user?.empresa_id || '').trim();
    if (e) loadPlanos(e);
    else loadPlanos();
  }, [loadPlanos, isEditMode, empresaIdPropostaCarregada, empresaIdEfetivo, user?.empresa_id, dataRevisionEmpresa]);

  useEffect(() => {
    if (isEditMode) return;
    if (!empresaIdOperacional) return;
    (async () => {
      const { data, error } = await supabase.rpc('propostas_venda_proximo_sequencial', {
        p_empresa_id: empresaIdOperacional,
      });
      if (!error && typeof data === 'number' && data > 0) {
        setNextNumero(data);
        return;
      }
      setNextNumero(null);
    })();
  }, [empresaIdOperacional, isEditMode]);

  const planosAtivos = useMemo(
    () => (planos || []).filter((p) => p.status === 'ativo').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [planos]
  );

  const planoSelecionado: PlanoCompleto | undefined = useMemo(
    () => planosAtivos.find((p) => p.id === planoId),
    [planoId, planosAtivos]
  );

  const bairroPropostaCobranca = useMemo(
    () =>
      bairroCobrancaCliente({
        usaEnderecoResidencialCobranca: cobradorMesmoEndereco,
        enderecoBairro: enderecoBairro,
        enderecoCobBairro: cobradorBairro,
      }),
    [cobradorMesmoEndereco, enderecoBairro, cobradorBairro],
  );

  const diaVencimentoMigracao = useMemo(() => {
    const d = parseInt((primeiroVenc || '').slice(8, 10), 10);
    return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 10;
  }, [primeiroVenc]);

  const qtdMensalidadesPagasMigracao = useMemo(() => {
    if (!contratoMigracao || migracaoCobrarApenasFenix || !dataInicioContrato) return 0;
    return contarMensalidadesPagasMigracao({
      contratoMigracao: true,
      migracaoCobrarApenasFenix: false,
      dataInicioContrato,
      dataUltimaMensalidadePaga,
      diaVencimento: diaVencimentoMigracao,
    });
  }, [
    contratoMigracao,
    migracaoCobrarApenasFenix,
    dataInicioContrato,
    dataUltimaMensalidadePaga,
    diaVencimentoMigracao,
  ]);

  const resumoMigracaoDatas = useMemo(() => {
    if (!contratoMigracao || !dataInicioContrato) return null;
    return resolverDatasContratoMigracao({
      contratoMigracao: true,
      migracaoCobrarApenasFenix,
      dataInicioContrato,
      dataUltimaMensalidadePaga,
      dataRegistroUltimoPagamento,
      diaVencimento: diaVencimentoMigracao,
      primeiroVencimentoInformado: primeiroVenc,
    });
  }, [
    contratoMigracao,
    migracaoCobrarApenasFenix,
    dataInicioContrato,
    dataUltimaMensalidadePaga,
    dataRegistroUltimoPagamento,
    diaVencimentoMigracao,
    primeiroVenc,
  ]);

  useEffect(() => {
    if (!contratoMigracao || !planoId) return;
    if (!dataRegistroUltimoPagamento) {
      setDataRegistroUltimoPagamento(dataHojeIsoLocal());
    }
    if (!migracaoCobrarApenasFenix && !dataUltimaMensalidadePaga) {
      setDataUltimaMensalidadePaga(ultimoVencimentoCompetenciaProvavel(diaVencimentoMigracao));
    }
  }, [
    contratoMigracao,
    planoId,
    migracaoCobrarApenasFenix,
    dataUltimaMensalidadePaga,
    dataRegistroUltimoPagamento,
    diaVencimentoMigracao,
  ]);

  useEffect(() => {
    if (metodoCobranca !== 'cobrador' || !bairroPropostaCobranca.trim() || !empresaIdOperacional) {
      setCobradorSugeridoProposta(null);
      return;
    }
    let cancelled = false;
    void buscarCobradorSugeridoPorBairro([empresaIdOperacional], bairroPropostaCobranca).then(
      (sugerido) => {
        if (!cancelled) setCobradorSugeridoProposta(sugerido);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [metodoCobranca, bairroPropostaCobranca, empresaIdOperacional]);

  const taxaPadrao = planoSelecionado?.taxa_adesao_centavos ?? PROPOSTA_ADESAO_MAX_CENTAVOS;
  const minAdesao = PROPOSTA_ADESAO_MIN_CENTAVOS;
  const maxAdesao = PROPOSTA_ADESAO_MAX_CENTAVOS;

  useEffect(() => {
    if (isEditMode) return;
    if (!planoSelecionado) {
      setAdesaoRecebidaStr('');
      return;
    }
    setAdesaoRecebidaStr(
      centavosToReaisInput(valorAdesaoInicialProposta(planoSelecionado.taxa_adesao_centavos)),
    );
  }, [planoSelecionado, isEditMode]);

  useEffect(() => {
    if (!isEditMode || !propostaId) return;
    let cancelado = false;
    (async () => {
      setLoadingProposta(true);
      setEmpresaIdPropostaCarregada(null);
      setEmpresaNomePropostaCarregada('');
      const { data, error } = await supabase
        .from('propostas_venda')
        .select('*')
        .eq('id', propostaId)
        .maybeSingle();

      if (cancelado) return;

      if (error || !data) {
        showToast('Não foi possível carregar a proposta para edição.', 'error');
        setLoadingProposta(false);
        navigate('/venda/propostas');
        return;
      }

      if (cancelado) return;

      const empPid = (data as { empresa_id?: string }).empresa_id || null;
      setVendedorIdPropostaCarregada((data as { vendedor_id?: string | null }).vendedor_id || null);
      setEmpresaIdPropostaCarregada(empPid);
      if (empPid) {
        const { data: empRow } = await supabase.from('empresas').select('nome').eq('id', empPid).maybeSingle();
        if (cancelado) return;
        setEmpresaNomePropostaCarregada((empRow as { nome?: string } | null)?.nome || '');
      } else {
        setEmpresaNomePropostaCarregada('');
      }

      if (cancelado) return;

      setNextNumero(data.sequencial ?? null);
      setPlanoId(data.plano_id || '');
      setWhatsappUnidade(data.whatsapp_unidade || '');
      setNome(data.contribuinte_nome || '');
      setDocumento(data.contribuinte_documento || '');
      setRg(data.contribuinte_rg || '');
      setDataNasc(data.contribuinte_data_nascimento || '');
      setEstadoCivil(data.contribuinte_estado_civil || '');
      setNatUf(data.contribuinte_naturalidade_uf || '');
      setNatCidade(data.contribuinte_naturalidade_cidade || '');
      setProfissao(data.contribuinte_profissao || '');
      setReligiao(data.contribuinte_religiao || '');
      const endParts = enderecoPropostaPartesFromRow(data as Record<string, unknown>);
      setEnderecoLogradouro(endParts.logradouro);
      setEnderecoNumero(endParts.numero);
      setEnderecoBairro(endParts.bairro);
      setEnderecoQuadra(endParts.quadra);
      setEnderecoLote(endParts.lote);
      setEnderecoPorQuadraLote(Boolean(endParts.quadra || endParts.lote));
      setCep(data.endereco_cep || '');
      setCidade(data.endereco_cidade || '');
      setUf(data.endereco_uf || 'SP');
      setTelPrincipal(formatTelefoneBr(data.telefone_principal || ''));
      setTelAlt(formatTelefoneBr(data.telefone_alternativo || ''));
      setEmail(data.email || '');
      setAdesaoRecebidaStr(centavosToReaisInput(data.taxa_adesao_recebida_centavos || 0));
      setPrimeiroVenc(data.primeiro_vencimento || '');
      setParcelaPagaAto(Boolean(data.primeira_parcela_paga_no_ato));
      setMetodoCobranca(data.metodo_cobranca || 'boleto');
      setCobradorMesmoEndereco((data as any).cobrador_endereco_mesmo_residencial !== false);
      const cobParts = enderecoPropostaPartesFromRow({
        endereco_logradouro: (data as any).cobrador_endereco_logradouro,
        endereco_numero: (data as any).cobrador_endereco_numero,
        endereco_bairro: (data as any).cobrador_endereco_bairro,
        endereco_quadra: (data as any).cobrador_endereco_quadra,
        endereco_lote: (data as any).cobrador_endereco_lote,
        endereco_residencia: (data as any).cobrador_endereco_entrega,
      });
      setCobradorLogradouro(cobParts.logradouro);
      setCobradorNumero(cobParts.numero);
      setCobradorBairro(cobParts.bairro);
      setCobradorQuadra(cobParts.quadra);
      setCobradorLote(cobParts.lote);
      setCobradorCep((data as any).cobrador_endereco_cep || '');
      setCobradorCidade((data as any).cobrador_endereco_cidade || '');
      setCobradorUf((data as any).cobrador_endereco_uf || 'SP');
      setParcelasRecebidasQuantidade(Math.max(1, data.parcelas_recebidas_quantidade || 1));
      setDependentes(
        Array.isArray(data.dependentes_detalhes)
          ? data.dependentes_detalhes.map((d: any) => dependenteFromDetalhesJson(d))
          : [],
      );
      setObservacoes(data.observacoes || '');
      setContratoMigracao(Boolean((data as { contrato_migracao?: boolean }).contrato_migracao));
      setDataInicioContrato((data as { data_inicio_contrato?: string }).data_inicio_contrato || '');
      setMigracaoCobrarApenasFenix(
        (data as { migracao_cobrar_apenas_fenix?: boolean }).migracao_cobrar_apenas_fenix !== false,
      );
      setDataUltimaMensalidadePaga(
        (data as { data_ultima_mensalidade_paga?: string }).data_ultima_mensalidade_paga || '',
      );
      setDataRegistroUltimoPagamento(
        (data as { data_registro_ultimo_pagamento?: string }).data_registro_ultimo_pagamento || '',
      );
      const st = data.status || null;
      setStatusPropostaCarregada(st);
      const stNorm = normalizarStatusProposta(st);
      if (stNorm === PROPOSTA_STATUS.CONTRATO_GERADO) {
        showToast('Esta proposta já tem contrato gerado. Abra a lista para consultar.', 'info');
        navigate('/venda/propostas');
        return;
      }
      if (
        stNorm === PROPOSTA_STATUS.EM_POS_VENDA
        && !usuarioPodeGerarContratoProposta(
          user?.role,
          user?.permissoes as Record<string, unknown>,
          user?.roles_extra,
        )
      ) {
        showToast(
          'Proposta em pós-venda com a equipe. O vendedor não edita nesta etapa — aguarde a conclusão.',
          'warning',
        );
        navigate('/venda/propostas');
        return;
      }
      if (Array.isArray(data.cadastro_existente_alertas) && data.cadastro_existente_alertas.length > 0) {
        setAlertasCadastroExistente(
          (data.cadastro_existente_alertas as string[]).map((mensagem) => ({
            tipo: 'cliente_cadastrado' as const,
            mensagem: String(mensagem),
          })),
        );
      } else {
        setAlertasCadastroExistente([]);
      }
      if (!cancelado) setLoadingProposta(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [isEditMode, propostaId, navigate, showToast]);

  useEffect(() => {
    if (isEditMode) return;
    setEmpresaIdPropostaCarregada(null);
    setEmpresaNomePropostaCarregada('');
    setVendedorIdPropostaCarregada(null);
  }, [isEditMode]);

  useEffect(() => {
    setCienciaCadastroExistente(false);
  }, [alertasCadastroExistente]);

  useEffect(() => {
    const titularDoc = documento.replace(/\D/g, '');
    const cpfsDependentes = dependentes
      .map((d) => d.cpf.replace(/\D/g, ''))
      .filter((cpf) => cpf.length === 11);

    if (empresaIdsConsultaCadastro.length === 0 || (titularDoc.length < 11 && cpfsDependentes.length === 0)) {
      setAlertasCadastroExistente([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setValidandoCadastroExistente(true);
      try {
        const alertas = await buscarAlertasCadastroExistenteProposta(supabase, {
          empresaIds: empresaIdsConsultaCadastro,
          titularDocumento: titularDoc,
          dependentesCpfs: cpfsDependentes,
          propostaIdIgnorar: isEditMode ? propostaId : null,
        });
        if (!cancelled) setAlertasCadastroExistente(alertas);
      } catch (err) {
        console.error('[NovaPropostaPage] Erro ao validar cadastro existente:', err);
        if (!cancelled) setAlertasCadastroExistente([]);
      } finally {
        if (!cancelled) setValidandoCadastroExistente(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [empresaIdsConsultaCadastro, documento, dependentes, isEditMode, propostaId]);

  const resolveEmpresaId = async (): Promise<string | null> => {
    let eid = (empresaIdEfetivo || '').trim() || getEmpresaId() || user?.empresa_id || '';
    if (eid) return eid;
    const sessionUserId = sessionStorage.getItem('userId');
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id || sessionUserId;
    if (!uid) return null;
    const { data } = await supabase.from('users').select('empresa_id').eq('id', uid).single();
    return data?.empresa_id || null;
  };

  const resolveVendedorIdAuth = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || user?.id || null;
  };

  const buscarPropostaRecémSalva = async (
    empresaId: string,
    vendedorId: string,
    documento: string,
    planoId?: string | null,
  ): Promise<{ id: string; sequencial: number } | null> => {
    const doc = documento.replace(/\D/g, '');
    if (!doc) return null;
    let q = supabase
      .from('propostas_venda')
      .select('id, sequencial, created_at')
      .eq('empresa_id', empresaId)
      .eq('vendedor_id', vendedorId)
      .eq('contribuinte_documento', doc)
    if (planoId) q = q.eq('plano_id', planoId);
    else q = q.is('plano_id', null);

    const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!data?.id) return null;
    const criada = new Date(data.created_at as string).getTime();
    if (Number.isNaN(criada) || Date.now() - criada > 15 * 60 * 1000) return null;
    return { id: data.id, sequencial: data.sequencial as number };
  };

  const erroCompatColunasProposta = (err: { code?: string; message?: string } | null) => {
    if (!err?.message) return false;
    if (err.code === '23505') return false;
    const msg = err.message.toLowerCase();
    return msg.includes('dependentes_detalhes')
      || msg.includes('parcelas_recebidas_quantidade')
      || msg.includes('parcelas_recebidas_total')
      || msg.includes('cadastro_existente')
      || msg.includes('could not find');
  };

  const erroSequencialDuplicado = (err: { code?: string; message?: string } | null) => {
    if (err?.code === '23505') return true;
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('sequencial')
      || msg.includes('propostas_venda_grupo_sequencial')
      || msg.includes('propostas_venda_empresa');
  };

  const aguardarMs = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    const salvandoRascunho = submitIntent === 'draft';

    const msgTel = erroTelefonePrincipal(telPrincipal);
    if (msgTel) {
      showToast(msgTel, 'warning');
      return;
    }

    if (salvandoRascunho) {
      if (!nome.trim() && !documento.trim()) {
        showToast('Informe ao menos o nome ou o CPF/CNPJ para salvar o rascunho.', 'warning');
        return;
      }
    } else {
      if (!nome.trim()) {
        showToast('Informe o nome do contribuinte.', 'warning');
        return;
      }
      if (!documento.trim() && !contratoMigracao) {
        showToast('Informe o CPF ou CNPJ do titular.', 'warning');
        return;
      }
      if (documento.trim() && !docOk) {
        showToast('CPF ou CNPJ do titular é inválido.', 'warning');
        return;
      }
      if (!natUf) {
        showToast('Selecione a UF da naturalidade do titular.', 'warning');
        return;
      }
      if (!natCidade.trim()) {
        showToast('Informe a cidade da naturalidade do titular.', 'warning');
        return;
      }
      if (!religiao) {
        showToast('Selecione a religião do contribuinte.', 'warning');
        return;
      }
      if (!dataNasc.trim()) {
        showToast('Informe a data de nascimento do titular.', 'warning');
        return;
      }
      if (!planoId) {
        showToast('Selecione um plano.', 'warning');
        return;
      }
      if (!primeiroVenc) {
        showToast('Informe o 1º vencimento.', 'warning');
        return;
      }
      if (contratoMigracao) {
        if (!dataInicioContrato) {
          showToast('Informe a data de início do plano na funerária anterior.', 'warning');
          return;
        }
        if (!migracaoCobrarApenasFenix && !dataUltimaMensalidadePaga) {
          showToast('Informe até qual vencimento o cliente já pagou na funerária anterior.', 'warning');
          return;
        }
      }
      if (!enderecoLogradouro.trim() || !enderecoNumero.trim() || !enderecoBairro.trim()) {
        showToast('Informe logradouro, número da casa e bairro do endereço.', 'warning');
        return;
      }
      if (!enderecoQuadra.trim() || !enderecoLote.trim()) {
        showToast('Informe quadra e lote do endereço.', 'warning');
        return;
      }
      if (!adesaoRecebidaStr.trim()) {
        showToast('Informe o valor recebido da adesão.', 'warning');
        return;
      }
      if (metodoCobranca === 'cobrador' && !cobradorMesmoEndereco) {
        if (
          !cobradorLogradouro.trim()
          || !cobradorNumero.trim()
          || !cobradorBairro.trim()
          || !cobradorCidade.trim()
          || !cobradorUf.trim()
        ) {
          showToast('Preencha o endereço de cobrança do cobrador (rua, nº, bairro, cidade e UF).', 'warning');
          return;
        }
      }
      if (!isEditMode && primeiroVenc !== primeiroVencNovoIso) {
        showToast(
          `O 1º vencimento deve ser ${primeiroVencNovoLabel} (30 dias após a data do contrato: ${dataContratoPropostaLabel}).`,
          'warning',
        );
        return;
      }

      const recebidaCentavosCheck = reaisStringToCentavos(adesaoRecebidaStr);
      if (recebidaCentavosCheck < minAdesao || recebidaCentavosCheck > maxAdesao) {
        showToast(
          `Valor da adesão deve estar entre ${formatCentavos(minAdesao)} e ${formatCentavos(maxAdesao)}.`,
          'warning',
        );
        return;
      }
      for (let i = 0; i < dependentes.length; i += 1) {
        const msgDep = mensagemErroDependente(dependentes[i], i);
        if (msgDep) {
          showToast(msgDep, 'warning');
          return;
        }
      }
      if (bloqueioCadastroExistente && !cienciaCadastroExistente) {
        showToast(
          'Já existe outra proposta em aberto para este titular ou dependente. Marque a confirmação de ciência para continuar.',
          'error',
        );
        return;
      }
    }

    let eid: string | null = null;
    if (isEditMode && propostaId && empresaIdPropostaCarregada) {
      eid = empresaIdPropostaCarregada;
    } else {
      eid = await resolveEmpresaId();
    }
    if (!eid) {
      showToast('Empresa não identificada. Faça login novamente.', 'error');
      return;
    }

    const vendedorId = await resolveVendedorIdAuth();
    if (!vendedorId) {
      showToast('Sessão inválida. Faça login novamente.', 'error');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
    const hoje = hojeIso;
    const valorPlanoCentavos = planoSelecionado?.valor_mensal_centavos ?? 0;
    const quantidadeParcelasRecebidas = parcelaPagaAto ? Math.max(1, parcelasRecebidasQuantidade) : 0;
    const totalParcelasRecebidasCentavos = quantidadeParcelasRecebidas * valorPlanoCentavos;
    const dependentesSalvar = filtrarDependentesPreenchidos(dependentes).map(normalizarDependenteParaSalvar);

    const recebidaCentavos = salvandoRascunho
      ? reaisStringToCentavos(adesaoRecebidaStr) || minAdesao || 0
      : reaisStringToCentavos(adesaoRecebidaStr);
    const docDigitsSalvar = documento.replace(/\D/g, '');
    const nomeSalvar = nome.trim() || (salvandoRascunho ? 'Rascunho' : '');
    const docSalvar = docDigitsSalvar || (salvandoRascunho ? '00000000000' : '');
    const primeiroVencSalvar = primeiroVenc || (salvandoRascunho ? primeiroVencNovoIso : '');
    /** Em edição, não rebaixar pós-venda/contrato ao regravar (evita travar «Gerar contrato»). */
    const statusSalvar = (() => {
      if (salvandoRascunho) return PROPOSTA_STATUS.RASCUNHO;
      if (isEditMode && statusPropostaCarregada) {
        const atual = normalizarStatusProposta(statusPropostaCarregada);
        if (
          atual === PROPOSTA_STATUS.EM_POS_VENDA
          || atual === PROPOSTA_STATUS.CONTRATO_GERADO
          || atual === PROPOSTA_STATUS.CANCELADO
          || atual === PROPOSTA_STATUS.REJEITADA
        ) {
          return atual;
        }
      }
      return PROPOSTA_STATUS.AGUARDANDO_CONTRATO;
    })();
    const mensagensAlerta = mensagensAlertaCadastroExistente(alertasCadastroExistente);
    const sinalizarCadastroExistente = mensagensAlerta.length > 0;

    const enderecoResumo = montarEnderecoResidenciaProposta({
      logradouro: enderecoLogradouro,
      numero: enderecoNumero,
      bairro: enderecoBairro,
      quadra: enderecoQuadra,
      lote: enderecoLote,
      cidade,
      uf,
      cep,
    });
    const cobradorEnderecoResumo =
      metodoCobranca === 'cobrador' && !cobradorMesmoEndereco
        ? montarEnderecoResidenciaProposta({
            logradouro: cobradorLogradouro,
            numero: cobradorNumero,
            bairro: cobradorBairro,
            quadra: cobradorQuadra,
            lote: cobradorLote,
            cidade: cobradorCidade,
            uf: cobradorUf,
            cep: cobradorCep,
          })
        : '';

    const payload = {
      empresa_id: eid,
      plano_id: planoId || null,
      status: statusSalvar,
      cobranca_confirmada: !salvandoRascunho,
      ...(isEditMode ? {} : { vendedor_id: vendedorId }),
      whatsapp_unidade: whatsappUnidade.trim() || null,
      contribuinte_nome: nomeSalvar,
      contribuinte_documento: docSalvar,
      contribuinte_rg: rg.trim() || null,
      contribuinte_data_nascimento: dataNasc || null,
      contribuinte_estado_civil: estadoCivil || null,
      contribuinte_naturalidade_uf: natUf || null,
      contribuinte_naturalidade_cidade: natCidade.trim() || null,
      contribuinte_profissao: profissao.trim() || null,
      contribuinte_religiao: religiao.trim() || null,
      endereco_residencia: enderecoResumo || null,
      endereco_logradouro: enderecoLogradouro.trim() || null,
      endereco_numero: enderecoNumero.trim() || null,
      endereco_bairro: enderecoBairro.trim() || null,
      endereco_quadra: enderecoQuadra.trim() || null,
      endereco_lote: enderecoLote.trim() || null,
      endereco_cep: cep.replace(/\D/g, '') || null,
      endereco_cidade: cidade.trim() || null,
      endereco_uf: uf || null,
      telefone_principal: telPrincipal.trim() || null,
      telefone_alternativo: telAlt.trim() || null,
      email: email.trim() || null,
      taxa_adesao_padrao_centavos: taxaPadrao,
      taxa_adesao_recebida_centavos: recebidaCentavos,
      taxa_adesao_min_centavos: minAdesao,
      taxa_adesao_max_centavos: maxAdesao,
      primeiro_vencimento: primeiroVencSalvar,
      primeira_parcela_paga_no_ato: parcelaPagaAto,
      metodo_cobranca: metodoCobranca,
      cobrador_endereco_mesmo_residencial: metodoCobranca === 'cobrador' ? cobradorMesmoEndereco : null,
      cobrador_endereco_entrega:
        metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorEnderecoResumo || null : null,
      cobrador_endereco_logradouro:
        metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorLogradouro.trim() || null : null,
      cobrador_endereco_numero:
        metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorNumero.trim() || null : null,
      cobrador_endereco_bairro:
        metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorBairro.trim() || null : null,
      cobrador_endereco_quadra:
        metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorQuadra.trim() || null : null,
      cobrador_endereco_lote:
        metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorLote.trim() || null : null,
      cobrador_endereco_cep:
        metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorCep.replace(/\D/g, '') : null,
      cobrador_endereco_cidade:
        metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorCidade.trim() : null,
      cobrador_endereco_uf: metodoCobranca === 'cobrador' && !cobradorMesmoEndereco ? cobradorUf : null,
      ...(isEditMode ? {} : { data_pedido: hoje }),
      parcelas_recebidas_quantidade: quantidadeParcelasRecebidas,
      parcelas_recebidas_total_centavos: totalParcelasRecebidasCentavos,
      dependentes_inclusos: dependentesSalvar.length,
      dependentes_detalhes: dependentesSalvar,
      observacoes: observacoes.trim() || null,
      contrato_migracao: contratoMigracao,
      data_inicio_contrato: contratoMigracao ? dataInicioContrato || null : null,
      migracao_cobrar_apenas_fenix: contratoMigracao ? migracaoCobrarApenasFenix : false,
      data_ultima_mensalidade_paga:
        contratoMigracao && !migracaoCobrarApenasFenix ? dataUltimaMensalidadePaga || null : null,
      data_registro_ultimo_pagamento:
        contratoMigracao && !migracaoCobrarApenasFenix
          ? dataRegistroUltimoPagamento || null
          : null,
      cadastro_existente_alerta: sinalizarCadastroExistente,
      cadastro_existente_alertas: mensagensAlerta,
      ...(!salvandoRascunho ? { liberada_em: new Date().toISOString() } : {}),
    };

    let savedRow: { id: string; sequencial: number } | null = null;
    let error: { code?: string; message?: string } | null = null;

    const parseInserirRpc = (data: unknown): { id: string; sequencial: number } | null => {
      if (!data || typeof data !== 'object') return null;
      const row = data as { id?: string; sequencial?: number };
      if (!row.id || row.sequencial == null) return null;
      return { id: row.id, sequencial: row.sequencial };
    };

    const executarGravacao = async (body: Record<string, unknown>) => {
      if (isEditMode && propostaId) {
        return supabase
          .from('propostas_venda')
          .update(body)
          .eq('id', propostaId)
          .select('id, sequencial')
          .maybeSingle();
      }

      const rpc = await supabase.rpc('propostas_venda_inserir', {
        p_payload: body,
        p_client_request_id: clientRequestIdRef.current,
      });
      if (!rpc.error) {
        const row = parseInserirRpc(rpc.data);
        return { data: row, error: null };
      }

      const rpcMsg = (rpc.error.message || '').toLowerCase();
      if (!rpcMsg.includes('propostas_venda_inserir') && !rpcMsg.includes('could not find')) {
        return { data: null, error: rpc.error };
      }

      return supabase.from('propostas_venda').insert(body).select('id, sequencial').maybeSingle();
    };

    let bodyGravar: Record<string, unknown> = { ...payload };
    const maxTentativas = isEditMode ? 1 : 3;
    for (let tentativa = 0; tentativa < maxTentativas; tentativa += 1) {
      if (tentativa > 0) await aguardarMs(150 * tentativa);

      const res = await executarGravacao(bodyGravar);
      savedRow = res.data;
      error = res.error;

      if (!error) break;

      if (erroCompatColunasProposta(error)) {
        const payloadCompat = { ...bodyGravar };
        if (!isEditMode) {
          delete (payloadCompat as any).dependentes_detalhes;
          delete (payloadCompat as any).parcelas_recebidas_quantidade;
          delete (payloadCompat as any).parcelas_recebidas_total_centavos;
        }
        delete (payloadCompat as any).cadastro_existente_alerta;
        delete (payloadCompat as any).cadastro_existente_alertas;
        const retryCompat = await executarGravacao(payloadCompat);
        savedRow = retryCompat.data;
        error = retryCompat.error;
        if (!error) {
          bodyGravar = payloadCompat;
          break;
        }
      }

      if (erroSequencialDuplicado(error) && !isEditMode) {
        const recuperada = await buscarPropostaRecémSalva(eid, vendedorId, docSalvar, planoId);
        if (recuperada) {
          const numeroRec = String(recuperada.sequencial).padStart(3, '0');
          showToast(`Proposta nº ${numeroRec} já foi salva. Abrindo para continuar.`, 'success');
          navigate(`/venda/propostas/${recuperada.id}/editar`);
          return;
        }
        if (tentativa < maxTentativas - 1) continue;
      }

      const msg = (error.message || '').toLowerCase();
      if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
        if (tentativa < maxTentativas - 1) continue;
      }
      break;
    }

    if (error) {
      console.error(error);
      if (erroSequencialDuplicado(error) && !isEditMode) {
        showToast(
          'Não foi possível concluir o salvamento agora. Aguarde um instante e tente de novo (evite tocar duas vezes no botão).',
          'warning',
        );
        return;
      }
      showToast(error.message || 'Erro ao salvar proposta.', 'error');
      return;
    }

    if (!savedRow?.id) {
      showToast('Proposta salva, mas não foi possível abrir o registro. Atualize a lista de propostas.', 'warning');
      navigate('/venda/propostas');
      return;
    }

    const numeroProposta = String(savedRow?.sequencial ?? nextNumero ?? '').padStart(3, '0');

    if (salvandoRascunho) {
      showToast(
        isEditMode
          ? 'Rascunho atualizado. Continue preenchendo e confirme quando estiver pronto.'
          : `Rascunho nº ${numeroProposta} salvo. Você pode continuar editando.`,
        'success',
      );
      if (sinalizarCadastroExistente) {
        showToast('Rascunho sinalizado: titular ou dependente já possui cadastro no sistema.', 'warning');
      }
      if (!isEditMode && savedRow?.id) {
        navigate(`/venda/propostas/${savedRow.id}/editar`);
      } else {
        setStatusPropostaCarregada('rascunho');
      }
      return;
    }

    let empresaNomePdf = empresa?.nome || null;
    let empresaCnpjPdf = (empresa as any)?.cnpj || null;
    if (eid) {
      const { data: empresaRow } = await supabase
        .from('empresas')
        .select('nome, cnpj')
        .eq('id', eid)
        .maybeSingle();
      if (empresaRow?.nome) empresaNomePdf = empresaRow.nome;
      if ((empresaRow as any)?.cnpj) empresaCnpjPdf = (empresaRow as any).cnpj;
    }

    const unidadePdf = (nomeUnidadeProposta || empresaNomePdf || '').trim();

    const vendedorIdPdf = isEditMode ? (vendedorIdPropostaCarregada || vendedorId) : vendedorId;
    const { nome: vendedorNomePdf, telefone: vendedorDocumentoPdf } =
      await resolverDadosVendedorPropostaPdf(supabase, vendedorIdPdf);

    const pdfBlob = await buildPropostaPdfBlob({
      numero: numeroProposta,
      dataPedido: isEditMode ? (new Date().toISOString().slice(0, 10)) : hoje,
      empresaNome: empresaNomePdf,
      empresaLogoUrl: empresa?.logo_url,
      unidadeEmissoraNome: unidadePdf || null,
      empresaCnpj: empresaCnpjPdf,
      vendedorNome: vendedorNomePdf,
      vendedorDocumento: vendedorDocumentoPdf || null,
      contribuinteNome: nome.trim(),
      contribuinteDocumento: documento.replace(/\D/g, ''),
      contribuinteTelefone: telPrincipal.trim() || null,
      contribuinteEmail: email.trim() || null,
      contribuinteEndereco: enderecoResumo || null,
      enderecoLogradouro: enderecoLogradouro.trim() || null,
      enderecoNumero: enderecoNumero.trim() || null,
      enderecoBairro: enderecoBairro.trim() || null,
      enderecoQuadra: enderecoQuadra.trim() || null,
      enderecoLote: enderecoLote.trim() || null,
      enderecoCidade: cidade.trim() || null,
      enderecoUf: uf || null,
      enderecoCep: cep.replace(/\D/g, '') || null,
      contribuinteRg: rg.trim() || null,
      contribuinteDataNascimento: dataNasc ? dataNasc.split('-').reverse().join('/') : null,
      contribuinteEstadoCivil: estadoCivil || null,
      contribuinteNaturalidade: [natCidade.trim(), natUf].filter(Boolean).join(' - ') || null,
      contribuinteProfissao: profissao.trim() || null,
      contribuinteReligiao: religiao || null,
      planoNome: planoSelecionado?.nome || 'Plano',
      valorAdesaoCentavos: recebidaCentavos,
      primeiroVencimento: primeiroVenc,
      metodoCobranca,
      cobradorMesmoEndereco,
      cobradorEnderecoEntrega: cobradorEnderecoResumo || null,
      cobradorEnderecoCep: cobradorCep.replace(/\D/g, '') || null,
      cobradorEnderecoCidade: cobradorCidade.trim() || null,
      cobradorEnderecoUf: cobradorUf || null,
      observacoes: observacoes.trim() || null,
      dependentesDetalhados: dependentesSalvar.map((d) => ({
        nome: d.nome.trim(),
        parentesco: d.parentesco || '—',
        cpf: d.cpf.replace(/\D/g, '') || '',
        dataNascimento: d.data_nascimento
          ? d.data_nascimento.split('-').reverse().join('/')
          : '',
      })).filter((d) => d.nome),
    });

    if (submitIntent === 'whatsapp') {
      downloadPropostaPdf(pdfBlob, numeroProposta);
      openWhatsAppComMensagem(
        `Segue a proposta nº ${numeroProposta} de ${nome.trim()}. O PDF foi exportado para anexo nesta conversa.`,
        telPrincipal || whatsappUnidade
      );
      showToast('Proposta liberada para contrato. PDF exportado e WhatsApp aberto.', 'success');
      navigate('/venda/propostas');
      return;
    }

    if (
      isEditMode
      && propostaId
      && acaoAposSalvarRef.current === 'gerarContrato'
      && emPosVenda
    ) {
      acaoAposSalvarRef.current = 'listar';
      setGerandoContrato(true);
      try {
        const res = await gerarContratoDesdeProposta(propostaId);
        if (!res.ok) {
          showToast(res.error || 'Não foi possível gerar o contrato.', 'error');
          return;
        }
        if (res.codigoContrato || res.assinaturaId) {
          setContratoGeradoInfo({
            codigoContrato: res.codigoContrato || '—',
            assinaturaId: res.assinaturaId,
            dependentesIncluidos: res.dependentesIncluidos,
            propostaSequencial: nextNumero ?? undefined,
          });
        } else {
          showToast('Contrato gerado com sucesso. Pós-venda concluída.', 'success');
          navigate('/venda/propostas');
        }
      } finally {
        setGerandoContrato(false);
      }
      return;
    }

    showToast(
      isEditMode
        ? emPosVenda
          ? 'Dados salvos. Confira tudo e use «Gerar contrato» para criar cliente e assinatura.'
          : 'Proposta atualizada com sucesso.'
        : 'Proposta liberada. A equipe de pós-venda pode assumir a análise e depois gerar o contrato.',
      'success',
    );
    if (sinalizarCadastroExistente) {
      showToast(
        'Proposta sinalizada na lista: titular ou dependente já constava no cadastro. A equipe deve revisar.',
        'warning',
      );
    }
    if (isEditMode && emPosVenda) {
      return;
    }
    navigate('/venda/propostas');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const preencherCamposViaCep = (
    data: { logradouro?: string; bairro?: string; localidade?: string; uf?: string },
    setters: {
      setLogradouro: (v: string) => void;
      setBairro: (v: string) => void;
      setCidade: (v: string) => void;
      setUf: (v: string) => void;
    },
    atuais: { logradouro: string; bairro: string; cidade: string },
  ) => {
    const rua = data.logradouro || '';
    const bairro = data.bairro || '';
    const cidadeCep = data.localidade || '';
    const ufCep = data.uf || '';
    if (rua && !atuais.logradouro.trim()) setters.setLogradouro(rua);
    if (bairro && !atuais.bairro.trim()) setters.setBairro(bairro);
    if (cidadeCep && !atuais.cidade.trim()) setters.setCidade(cidadeCep);
    if (ufCep) setters.setUf(ufCep);
  };

  const buscarEnderecoPorCep = async () => {
    const cepDigits = cep.replace(/\D/g, '');
    if (cepDigits.length !== 8) return;

    setCepLoading(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      if (!resp.ok) throw new Error('Falha ao consultar CEP.');
      const data = await resp.json();
      if (data?.erro) {
        showToast('CEP não encontrado.', 'warning');
        return;
      }
      preencherCamposViaCep(
        data,
        {
          setLogradouro: setEnderecoLogradouro,
          setBairro: setEnderecoBairro,
          setCidade,
          setUf,
        },
        { logradouro: enderecoLogradouro, bairro: enderecoBairro, cidade },
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao buscar CEP.', 'error');
    } finally {
      setCepLoading(false);
    }
  };

  const buscarCobradorEnderecoPorCep = async () => {
    const cepDigits = cobradorCep.replace(/\D/g, '');
    if (cepDigits.length !== 8) return;

    setCobradorCepLoading(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      if (!resp.ok) throw new Error('Falha ao consultar CEP.');
      const data = await resp.json();
      if (data?.erro) {
        showToast('CEP não encontrado.', 'warning');
        return;
      }
      preencherCamposViaCep(
        data,
        {
          setLogradouro: setCobradorLogradouro,
          setBairro: setCobradorBairro,
          setCidade: setCobradorCidade,
          setUf: setCobradorUf,
        },
        { logradouro: cobradorLogradouro, bairro: cobradorBairro, cidade: cobradorCidade },
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao buscar CEP.', 'error');
    } finally {
      setCobradorCepLoading(false);
    }
  };

  const docDigits = documento.replace(/\D/g, '');
  const docOk =
    docDigits.length === 0
      ? true
      : docDigits.length === 11
        ? isCpfValido(documento)
        : docDigits.length === 14
          ? isCnpjValido(documento)
          : false;
  const telPrincipalOk = telefonePrincipalValido(telPrincipal);

  const handleGerarContratoPosVenda = () => {
    if (!propostaId || !modoEdicaoPosVenda) return;
    const ok = window.confirm(
      `Gerar contrato e cadastro do cliente para a proposta nº ${nextNumero != null ? String(nextNumero).padStart(3, '0') : '···'} (${nome.trim() || 'titular'})?\n\nOs dados do formulário serão salvos antes.`,
    );
    if (!ok) return;
    acaoAposSalvarRef.current = 'gerarContrato';
    setSubmitIntent('save');
    formRef.current?.requestSubmit();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title={isEditMode ? 'Editar Proposta' : 'Nova Proposta'}
        subtitle={
          isEditMode
            ? `Atualize os dados da proposta de venda${nomeUnidadeProposta ? ` · Unidade: ${nomeUnidadeProposta}` : ''}`
            : `Formalize o pedido para solicitar a geração do contrato${nomeUnidadeProposta ? ` · Unidade: ${nomeUnidadeProposta}` : ''}`
        }
      />

      {/* Hero strip */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-white p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-gray-200 text-sm mb-2">
              <Lock className="h-4 w-4" />
              <span>Conexão segura</span>
              <span className="text-white/40">·</span>
              <span>{nomeUnidadeProposta || empresa?.nome || 'APex-Plan'}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2 flex-wrap">
              <Sparkles className="h-6 w-6 text-amber-300" />
              Proposta Nº{' '}
              {nextNumero != null ? String(nextNumero).padStart(3, '0') : '···'}
              {!isEditMode && (
                <span className="text-xs font-normal text-gray-300 w-full sm:w-auto">
                  (numeração única do grupo — todas as unidades e vendedores)
                </span>
              )}
              {statusPropostaCarregada === 'rascunho' && (
                <span className="text-xs font-semibold uppercase tracking-wide bg-amber-400/20 text-amber-200 border border-amber-300/40 px-2 py-0.5 rounded-full">
                  Rascunho
                </span>
              )}
              {emPosVenda && (
                <span className="text-xs font-semibold uppercase tracking-wide bg-teal-400/20 text-teal-100 border border-teal-300/40 px-2 py-0.5 rounded-full">
                  {labelStatusProposta(statusPropostaCarregada)}
                </span>
              )}
            </h2>
            {nomeUnidadeProposta ? (
              <p className="text-xs font-medium text-amber-200/95 mt-1.5 tracking-wide">
                Unidade emissora: {nomeUnidadeProposta}
              </p>
            ) : null}
            <p className="text-sm text-gray-100 mt-2 max-w-xl">
              {modoEdicaoPosVenda
                ? 'Última etapa: confira os dados, salve se precisar ajustar e clique em Gerar contrato para criar o cliente e a assinatura no sistema.'
                : isEditMode
                  ? 'Revise e atualize os dados da proposta selecionada.'
                  : 'Preencha o formulário abaixo para formalizar seu pedido. Os dados serão usados na geração do contrato.'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-emerald-300" />
            </div>
            <div className="text-sm">
              <p className="font-semibold">Seguro & criptografado</p>
              <p className="text-gray-200 text-xs">Ambiente interno APex-Plan</p>
            </div>
          </div>
        </div>
      </div>

      {loadingProposta && (
        <Card className="p-5 text-sm text-gray-600">
          Carregando dados da proposta...
        </Card>
      )}

      {modoEdicaoPosVenda && !loadingProposta && (
        <Card className="p-4 border-2 border-teal-300 bg-teal-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <Headphones className="h-6 w-6 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-teal-900">Pós-venda — confirmar e gerar contrato</p>
                <p className="text-xs text-teal-800 mt-1">
                  Você pode editar os dados abaixo. Quando estiver tudo certo, use{' '}
                  <strong>Gerar contrato</strong> (não apenas salvar) para criar o cliente e o contrato.
                  O vendedor verá o status como pós-venda concluída.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleGerarContratoPosVenda}
              loading={gerandoContrato || (saving && acaoAposSalvarRef.current === 'gerarContrato')}
              disabled={saving || gerandoContrato || !docOk || !telPrincipalOk}
              className="shrink-0 bg-teal-700 hover:bg-teal-800 text-white"
            >
              <FileSignature className="h-4 w-4 mr-2" />
              Gerar contrato
            </Button>
          </div>
        </Card>
      )}

      {(validandoCadastroExistente || exibirAlertasCadastro) && (
        <Card className={`p-4 ${bloqueioCadastroExistente ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
          <div className="flex items-start gap-2">
            <AlertCircle className={`h-5 w-5 mt-0.5 shrink-0 ${bloqueioCadastroExistente ? 'text-red-600' : 'text-amber-600'}`} />
            <div className="space-y-2 flex-1">
              <p className={`text-sm font-bold ${bloqueioCadastroExistente ? 'text-red-800' : 'text-amber-900'}`}>
                {bloqueioCadastroExistente
                  ? 'Proposta em conflito'
                  : avisoSegundoContrato
                    ? 'Segundo contrato no mesmo cadastro'
                    : 'Cadastro já existente no sistema'}
              </p>
              <p className={`text-xs ${bloqueioCadastroExistente ? 'text-red-700' : 'text-amber-800'}`}>
                {bloqueioCadastroExistente
                  ? 'Este CPF já consta em outra proposta aberta. Corrija os dados ou marque a ciência abaixo para revisão.'
                  : avisoSegundoContrato
                    ? 'O titular já está cadastrado. Não crie outro cliente: ao gerar o contrato, o sistema abrirá um novo número (CTR-…) vinculado ao mesmo cadastro, com plano e dependentes desta proposta.'
                    : 'Este CPF já consta no cadastro ou em contrato. Você pode corrigir os dados normalmente.'}
              </p>
              {validandoCadastroExistente ? (
                <p className="text-xs text-red-600">Analisando titular e dependentes...</p>
              ) : (
                <ul className="list-disc list-inside space-y-1">
                  {alertasCadastroExistente.map((aviso, idx) => (
                    <li key={`alerta-cadastro-${idx}`} className={`text-xs ${bloqueioCadastroExistente ? 'text-red-800' : 'text-amber-900'}`}>
                      {aviso.mensagem}
                    </li>
                  ))}
                </ul>
              )}
              {bloqueioCadastroExistente && !validandoCadastroExistente && (
                <label className="flex items-start gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-red-400 text-red-600 focus:ring-red-500"
                    checked={cienciaCadastroExistente}
                    onChange={(e) => setCienciaCadastroExistente(e.target.checked)}
                  />
                  <span className="text-xs text-red-800 font-medium">
                    Estou ciente e confirmo que devo prosseguir mesmo com cadastro existente (proposta será sinalizada).
                  </span>
                </label>
              )}
            </div>
          </div>
        </Card>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="space-y-6"
        autoComplete="off"
        data-lpignore="true"
      >
        {/* Vendedor */}
        <Card className="p-5 md:p-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-blue-600" />
            Identificação do vendedor
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Vendedor logado</p>
              <p className="text-sm font-medium text-gray-900">{user?.nome || '—'}</p>
            </div>
            <Input
              label="WhatsApp da unidade"
              type="tel"
              placeholder="(00) 00000-0000"
              value={whatsappUnidade}
              onChange={(e) => setWhatsappUnidade(e.target.value)}
            />
          </div>
        </Card>

        {/* Contribuinte */}
        <Card className="p-5 md:p-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
            Dados do contribuinte
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="Nome completo *"
              required
              name="contribuinte_nome_proposta"
              autoComplete="off"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
            <Input
              label="CPF / CNPJ *"
              required
              name="contribuinte_documento_proposta"
              autoComplete="off"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              error={
                documento && !docOk
                  ? 'CPF/CNPJ inválido.'
                  : bloqueioCadastroExistente && documento.replace(/\D/g, '').length >= 11
                    ? 'Já existe outra proposta em aberto para este documento.'
                    : undefined
              }
            />
            <Input label="RG" value={rg} onChange={(e) => setRg(e.target.value)} />
            <Input
              label="Data de nascimento *"
              required
              type="date"
              value={dataNasc}
              onChange={(e) => setDataNasc(e.target.value)}
            />
            <Select label="Estado civil" value={estadoCivil} onChange={(e) => setEstadoCivil(e.target.value)}>
              {ESTADOS_CIVIS.map((o) => (
                <option key={o.value || 'estado-civil-vazio'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Naturalidade (UF) *" required value={natUf} onChange={(e) => setNatUf(e.target.value)}>
                <option value="">UF *</option>
                {UFS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
              <Input label="Naturalidade (cidade) *" required value={natCidade} onChange={(e) => setNatCidade(e.target.value)} />
            </div>
            <Input label="Profissão" value={profissao} onChange={(e) => setProfissao(e.target.value)} />
            <OpcaoSearchSelect
              label="Religião *"
              value={religiao}
              onChange={(val) => setReligiao(val)}
              opcoes={RELIGIOES}
              persistir="value"
              resolveDisplay={labelReligiao}
              placeholder="Buscar religião…"
              helperText="Digite para filtrar (ex.: católica, evangélica)."
              portalId="proposta-religiao-search-portal"
            />
          </div>
        </Card>

        {/* Endereço */}
        <Card className="p-5 md:p-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4 text-blue-600" />
            Endereço e contato
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="CEP"
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              onBlur={buscarEnderecoPorCep}
              helperText={cepLoading ? 'Buscando endereço...' : 'Digite o CEP e saia do campo para preencher rua e bairro'}
            />
            <Input
              label="Logradouro (rua / avenida) *"
              value={enderecoLogradouro}
              onChange={(e) => setEnderecoLogradouro(e.target.value)}
              placeholder="Ex.: Rua das Flores"
            />
            <Input
              label="Número da casa *"
              value={enderecoNumero}
              onChange={(e) => setEnderecoNumero(e.target.value)}
              placeholder="Ex.: 123 ou S/N"
            />
            <Input
              label="Bairro *"
              value={enderecoBairro}
              onChange={(e) => setEnderecoBairro(e.target.value)}
            />
            <div className="md:col-span-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
              <input
                id="endereco-quadra-lote"
                type="checkbox"
                className="h-4 w-4 rounded border-amber-400 text-amber-700"
                checked={enderecoPorQuadraLote}
                onChange={(e) => setEnderecoPorQuadraLote(e.target.checked)}
              />
              <label htmlFor="endereco-quadra-lote" className="text-sm text-amber-950 cursor-pointer">
                Endereço em <strong>quadra e lote</strong> (loteamento)
              </label>
            </div>
            <Input
              label="Quadra *"
              required
              value={enderecoQuadra}
              onChange={(e) => setEnderecoQuadra(e.target.value)}
              placeholder="Obrigatório"
            />
            <Input
              label="Lote *"
              required
              value={enderecoLote}
              onChange={(e) => setEnderecoLote(e.target.value)}
              placeholder="Obrigatório"
            />
            <Input label="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            <Select label="UF" value={uf} onChange={(e) => setUf(e.target.value)}>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
            <div className="space-y-1">
              <Input
                label="Telefone principal *"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="(64) 99999-9999"
                value={telPrincipal}
                onChange={(e) => setTelPrincipal(formatTelefoneBr(e.target.value))}
                error={erroTelefonePrincipal(telPrincipal)}
                helperText="Obrigatório — apenas números (DDD + celular ou fixo)"
              />
              {validarWhatsapp(telPrincipal) && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium px-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <MessageCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>WhatsApp válido</span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Input
                label="Telefone alternativo"
                type="tel"
                inputMode="numeric"
                value={telAlt}
                onChange={(e) => setTelAlt(formatTelefoneBr(e.target.value))}
              />
              {validarWhatsapp(telAlt) && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium px-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <MessageCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>WhatsApp válido</span>
                </div>
              )}
            </div>
            <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </Card>

        {/* Plano comercial */}
        <Card className="p-5 md:p-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-blue-600" />
            Plano selecionado
          </h3>

          {!planoId && planosAtivos.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Selecione o <strong>tipo de plano</strong> na tabela abaixo (obrigatório).
            </p>
          )}

          {planosLoading && planosAtivos.length === 0 ? (
            <div className="flex items-center gap-2 text-gray-500 py-6">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando planos...
            </div>
          ) : (
            <div
              className="grid sm:grid-cols-2 gap-3 mb-6"
              role="grid"
              aria-label="Tabela de planos — tipo e valor mensal"
            >
              {planosAtivos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlanoId(p.id)}
                  className={`text-left rounded-xl border p-4 transition-all ${
                    planoId === p.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{p.nome}</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">
                    {formatCentavos(p.valor_mensal_centavos)}
                    <span className="text-sm font-normal text-gray-500">/mês</span>
                  </p>
                </button>
              ))}
            </div>
          )}

          {planoSelecionado && (
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3 text-sm">
              <p>
                <span className="text-gray-500">Valor padrão da adesão (sistema):</span>{' '}
                <strong>{formatCentavos(taxaPadrao)}</strong>
              </p>
              <p className="text-gray-600">
                Faixa permitida para todos os vendedores:{' '}
                <strong>
                  {formatCentavos(minAdesao)} a {formatCentavos(maxAdesao)}
                </strong>
                . O campo abaixo já vem preenchido com o valor sugerido (até o máximo).
              </p>
            </div>
          )}

          {planoSelecionado && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Contrato vindo de outra funerária (opcional)
              </p>
              <p className="text-xs text-amber-900/80">
                Mantém o tempo de contrato antigo (ex.: há 29 anos) e define como a Fênix passa a cobrar.
                CPF do titular fica opcional neste caso.
              </p>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer rounded-lg border border-white/80 bg-white/70 p-3 hover:bg-white">
                  <input
                    type="radio"
                    name="modo-contrato-importado-proposta"
                    checked={!contratoMigracao}
                    onChange={() => {
                      setContratoMigracao(false);
                      setMigracaoCobrarApenasFenix(true);
                      setDataUltimaMensalidadePaga('');
                      setDataRegistroUltimoPagamento('');
                    }}
                    className="mt-1"
                  />
                  <span>
                    <strong>Contrato novo na Fênix</strong>
                    <span className="block text-xs text-gray-600">
                      Cliente sem histórico em outra funerária — cobrança padrão.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer rounded-lg border border-white/80 bg-white/70 p-3 hover:bg-white">
                  <input
                    type="radio"
                    name="modo-contrato-importado-proposta"
                    checked={contratoMigracao && migracaoCobrarApenasFenix}
                    onChange={() => {
                      setContratoMigracao(true);
                      setMigracaoCobrarApenasFenix(true);
                      setDataUltimaMensalidadePaga('');
                      setDataRegistroUltimoPagamento('');
                      if (!dataInicioContrato) setDataInicioContrato('');
                    }}
                    className="mt-1"
                  />
                  <span>
                    <strong>Transferência de outra funerária</strong>
                    <span className="block text-xs text-gray-600">
                      Cobrar só a partir de hoje na Fênix — não gera parcelas retroativas. 1ª cobrança em 30 dias.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer rounded-lg border border-white/80 bg-white/70 p-3 hover:bg-white">
                  <input
                    type="radio"
                    name="modo-contrato-importado-proposta"
                    checked={contratoMigracao && !migracaoCobrarApenasFenix}
                    onChange={() => {
                      setContratoMigracao(true);
                      setMigracaoCobrarApenasFenix(false);
                      if (!dataInicioContrato) setDataInicioContrato('');
                      if (!dataUltimaMensalidadePaga) {
                        setDataUltimaMensalidadePaga(ultimoVencimentoCompetenciaProvavel(diaVencimentoMigracao));
                      }
                      if (!dataRegistroUltimoPagamento) {
                        setDataRegistroUltimoPagamento(dataHojeIsoLocal());
                      }
                    }}
                    className="mt-1"
                  />
                  <span>
                    <strong>Migração de contrato antigo</strong>
                    <span className="block text-xs text-gray-600">
                      Cliente já pagava na funerária anterior — informe até qual vencimento está quitado.
                    </span>
                  </span>
                </label>
              </div>

              {contratoMigracao && (
                <div className="grid md:grid-cols-2 gap-4 pl-1">
                  <Input
                    label="Início do plano na funerária anterior *"
                    type="date"
                    value={dataInicioContrato}
                    onChange={(e) => setDataInicioContrato(e.target.value)}
                    helperText="Pode ser só o ano (ex.: 01/06/1996) — preserva carência e tempo de contrato."
                    required
                  />
                  {!migracaoCobrarApenasFenix && (
                    <>
                      <Input
                        label="Última mensalidade paga (vencimento) *"
                        type="date"
                        value={dataUltimaMensalidadePaga}
                        onChange={(e) => setDataUltimaMensalidadePaga(e.target.value)}
                        required
                      />
                      <Input
                        label="Data do último pagamento"
                        type="date"
                        value={dataRegistroUltimoPagamento}
                        onChange={(e) => setDataRegistroUltimoPagamento(e.target.value)}
                      />
                      {qtdMensalidadesPagasMigracao > 0 && (
                        <p className="md:col-span-2 text-xs text-amber-900">
                          Serão registradas <strong>{qtdMensalidadesPagasMigracao}</strong> mensalidade(s)
                          quitada(s), mais <strong>12</strong> parcelas futuras em aberto.
                        </p>
                      )}
                    </>
                  )}
                  {resumoMigracaoDatas && (
                    <p className="md:col-span-2 text-xs text-amber-950 bg-white/70 border border-amber-100 rounded-lg px-3 py-2">
                      Contrato histórico: <strong>{formatarDataIsoPtBr(resumoMigracaoDatas.dataContratacao)}</strong>
                      {' · '}
                      1ª cobrança na Fênix:{' '}
                      <strong>{formatarDataIsoPtBr(resumoMigracaoDatas.dataPrimeiroVencimento)}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 mt-6">
            <Input
              label={`Valor recebido (adesão) R$ — mín. ${formatCentavos(minAdesao)}, máx. ${formatCentavos(maxAdesao)}`}
              value={adesaoRecebidaStr}
              onChange={(e) => setAdesaoRecebidaStr(e.target.value)}
              placeholder={centavosToReaisInput(maxAdesao)}
              required
            />
            {isEditMode ? (
              <Input
                label="1º vencimento *"
                type="date"
                pickerOnly
                value={primeiroVenc}
                onChange={(e) => setPrimeiroVenc(e.target.value)}
                helperText="Proposta em edição: ajuste somente se necessário."
                required
              />
            ) : (
              <div>
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider ml-1 mb-1.5">
                  1º vencimento *
                </p>
                <div className="flex items-center gap-2 h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <span>
                    <strong>{primeiroVencNovoLabel}</strong>
                    <span className="text-gray-500 ml-2">
                      (30 dias após {dataContratoPropostaLabel !== formatarDataIsoPtBr(hojeIso)
                        ? `a entrada na base (${dataContratoPropostaLabel})`
                        : 'hoje'})
                    </span>
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 ml-1">
                  Dia {diaVencimentoMigracao} de cada mês nas parcelas seguintes.
                </p>
              </div>
            )}
            <div className="flex items-center gap-3 pt-7">
              <input
                id="parcelaAto"
                type="checkbox"
                checked={parcelaPagaAto}
                onChange={(e) => setParcelaPagaAto(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <label htmlFor="parcelaAto" className="text-sm text-gray-800 cursor-pointer">
                1ª parcela paga no ato?
              </label>
            </div>
            {parcelaPagaAto && planoSelecionado && (
              <>
                <div>
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wider ml-1 mb-1.5">Valor da parcela do plano</p>
                  <div className="flex items-center gap-2 h-11 px-4 rounded-xl border border-gray-200 bg-gray-100 text-sm text-gray-700">
                    {formatCentavos(planoSelecionado.valor_mensal_centavos)}
                  </div>
                </div>
                <Input
                  label="Quantidade de parcelas recebidas"
                  type="number"
                  min={1}
                  value={parcelasRecebidasQuantidade}
                  onChange={(e) => setParcelasRecebidasQuantidade(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </>
            )}
            <Select label="Método de cobrança" value={metodoCobranca} onChange={(e) => setMetodoCobranca(e.target.value)}>
              <option value="boleto">Boleto bancário</option>
              <option value="pix">PIX</option>
              <option value="debito_auto">Débito automático</option>
              <option value="cartao_credito">Cartão de crédito</option>
              <option value="cobrador">Cobrador</option>
            </Select>
            {metodoCobranca === 'cobrador' && (
              <div className="md:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-900">Cobrança por cobrador</p>
                {cobradorSugeridoProposta ? (
                  <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    Cobrador sugerido pelo bairro <strong>{bairroPropostaCobranca}</strong>:{' '}
                    <strong>{cobradorSugeridoProposta.nome}</strong>. Será atribuído automaticamente ao gerar o
                    contrato.
                  </p>
                ) : bairroPropostaCobranca.trim() ? (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Nenhum cobrador cadastrado para o bairro <strong>{bairroPropostaCobranca}</strong>. Cadastre o
                    bairro na rota do cobrador em <strong>Cobradores</strong>.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-sm text-blue-900 cursor-pointer">
                    <input
                      type="radio"
                      name="cobrador-mesmo-endereco"
                      checked={cobradorMesmoEndereco}
                      onChange={() => setCobradorMesmoEndereco(true)}
                    />
                    Mesmo endereço do cadastro
                  </label>
                  <label className="flex items-center gap-2 text-sm text-blue-900 cursor-pointer">
                    <input
                      type="radio"
                      name="cobrador-mesmo-endereco"
                      checked={!cobradorMesmoEndereco}
                      onChange={() => setCobradorMesmoEndereco(false)}
                    />
                    Outro endereço para cobrança
                  </label>
                </div>
                {!cobradorMesmoEndereco && (
                  <div className="grid md:grid-cols-2 gap-3">
                    <Input
                      label="CEP"
                      value={cobradorCep}
                      onChange={(e) => setCobradorCep(e.target.value)}
                      onBlur={buscarCobradorEnderecoPorCep}
                      helperText={
                        cobradorCepLoading
                          ? 'Buscando endereço...'
                          : 'CEP preenche rua e bairro automaticamente'
                      }
                    />
                    <Input
                      label="Logradouro *"
                      value={cobradorLogradouro}
                      onChange={(e) => setCobradorLogradouro(e.target.value)}
                    />
                    <Input
                      label="Número da casa *"
                      value={cobradorNumero}
                      onChange={(e) => setCobradorNumero(e.target.value)}
                    />
                    <Input
                      label="Bairro *"
                      value={cobradorBairro}
                      onChange={(e) => setCobradorBairro(e.target.value)}
                    />
                    <Input
                      label="Quadra"
                      value={cobradorQuadra}
                      onChange={(e) => setCobradorQuadra(e.target.value)}
                    />
                    <Input
                      label="Lote"
                      value={cobradorLote}
                      onChange={(e) => setCobradorLote(e.target.value)}
                    />
                    <Input
                      label="Cidade *"
                      value={cobradorCidade}
                      onChange={(e) => setCobradorCidade(e.target.value)}
                    />
                    <Select label="UF *" value={cobradorUf} onChange={(e) => setCobradorUf(e.target.value)}>
                      {UFS.map((u) => (
                        <option key={`cobrador-uf-${u}`} value={u}>
                          {u}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider ml-1 mb-1.5">Data do pedido</p>
              <div className="flex items-center gap-2 h-11 px-4 rounded-xl border border-gray-200 bg-gray-100 text-sm text-gray-700">
                <Calendar className="h-4 w-4 text-gray-400" />
                {new Date().toLocaleDateString('pt-BR')} <span className="text-gray-400">(automática)</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider ml-1 mb-1.5">Quantidade de dependentes</p>
              <div className="flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-gray-200 bg-gray-100 text-lg font-bold text-gray-900 tabular-nums">
                {filtrarDependentesPreenchidos(dependentes).length}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-1">
            Dependentes
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            CPF do dependente é opcional. Se informar, deve estar correto. Linhas totalmente vazias não são salvas.
          </p>
          <div className="space-y-6">
            {dependentes.length === 0 && (
              <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
                Nenhum dependente adicionado. Use o botão abaixo para incluir a primeira pessoa.
              </p>
            )}
            {dependentes.map((dependente, idx) => {
              const numero = idx + 1;
              const msgErro = mensagemErroDependente(dependente, idx);
              const destaquePar = idx % 2 === 0;
              return (
                <div
                  key={`dep-${idx}`}
                  className={`rounded-2xl border-2 shadow-sm overflow-hidden ${
                    destaquePar
                      ? 'border-violet-200 bg-violet-50/40'
                      : 'border-sky-200 bg-sky-50/40'
                  } ${msgErro ? 'ring-2 ring-amber-300/80' : ''}`}
                  aria-label={`Dependente ${numero}`}
                >
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b ${
                      destaquePar
                        ? 'bg-violet-100/90 border-violet-200'
                        : 'bg-sky-100/90 border-sky-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                          destaquePar ? 'bg-violet-600' : 'bg-sky-600'
                        }`}
                        aria-hidden
                      >
                        {numero}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                          <Users className="h-4 w-4 shrink-0 opacity-70" />
                          Dependente {numero}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setDependentes((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  </div>

                  <div className="p-4 md:p-5 bg-white/80">
                    {msgErro && (
                      <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        {msgErro}
                      </p>
                    )}
                    <div className="grid md:grid-cols-2 gap-4">
                      <Input
                        label="Nome *"
                        name={`dependente_nome_${idx}`}
                        autoComplete="off"
                        value={dependente.nome}
                        onChange={(e) =>
                          setDependentes((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, nome: e.target.value } : item)),
                          )
                        }
                      />
                      <ParentescoDependenteSelect
                        label="Parentesco *"
                        required
                        value={dependente.parentesco}
                        onChange={(e) =>
                          setDependentes((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, parentesco: normalizarParentescoDependente(e.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                      <Input
                        label="CPF (opcional)"
                        value={dependente.cpf}
                        onChange={(e) =>
                          setDependentes((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, cpf: formatCpf(e.target.value) } : item)),
                          )
                        }
                        inputMode="numeric"
                        placeholder="Opcional"
                        error={erroCpfDependente(dependente.cpf)}
                      />
                      <Input
                        label="Data de nascimento (opcional)"
                        type="date"
                        value={dependente.data_nascimento}
                        onChange={(e) =>
                          setDependentes((prev) =>
                            prev.map((item, i) =>
                              (i === idx ? { ...item, data_nascimento: e.target.value } : item),
                            ),
                          )
                        }
                      />
                    </div>
                  </div>

                  {idx < dependentes.length - 1 && (
                    <div
                      className="flex items-center gap-3 px-4 py-2 bg-slate-100 border-t border-slate-200"
                      aria-hidden
                    >
                      <div className="flex-1 border-t border-dashed border-slate-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Próximo dependente
                      </span>
                      <div className="flex-1 border-t border-dashed border-slate-400" />
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed border-2 py-3"
              onClick={() =>
                setDependentes((prev) => [
                  ...prev,
                  { nome: '', cpf: '', data_nascimento: '', parentesco: '' },
                ])
              }
            >
              <Users className="h-4 w-4 mr-2" />
              Adicionar outro dependente
            </Button>
          </div>
        </Card>

        <Card className="p-5 md:p-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-blue-600" />
            Observações
          </h3>
          <Textarea
            placeholder="Notas internas para formalização do contrato..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={4}
          />
        </Card>

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {modoEdicaoPosVenda ? (
            <>
              <strong className="text-gray-800">Salvar alterações</strong> — grava correções sem criar contrato.
              {' '}
              <strong className="text-gray-800">Gerar contrato</strong> — salva, cria cliente + assinatura e encerra a pós-venda.
            </>
          ) : (
            <>
              <strong className="text-gray-800">Salvar rascunho</strong> — etapa 1: dados parciais; você continua editando depois.
              {' '}
              <strong className="text-gray-800">Liberar para contrato</strong> — etapa 2: proposta finalizada; entra na fila da pós-venda.
              {' '}
              <strong className="text-gray-800">WhatsApp</strong> — libera, gera PDF e abre o envio.
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-end">
          {!modoEdicaoPosVenda && (
            <>
              <Button
                type="submit"
                variant="outline"
                onClick={() => setSubmitIntent('draft')}
                loading={saving && submitIntent === 'draft'}
                disabled={saving || !telPrincipalOk}
              >
                <Save className="h-4 w-4 mr-1" />
                Salvar rascunho
              </Button>
              <Button
                type="submit"
                variant="outline"
                onClick={() => setSubmitIntent('whatsapp')}
                loading={saving && submitIntent === 'whatsapp'}
                disabled={
                  saving
                  || !docOk
                  || !telPrincipalOk
                  || (bloqueioCadastroExistente && !cienciaCadastroExistente)
                }
              >
                <Send className="h-4 w-4 mr-1" />
                Salvar e WhatsApp
              </Button>
            </>
          )}
          <Button
            type="submit"
            variant={modoEdicaoPosVenda ? 'outline' : 'primary'}
            onClick={() => {
              acaoAposSalvarRef.current = 'listar';
              setSubmitIntent('save');
            }}
            loading={saving && submitIntent === 'save' && !gerandoContrato}
            disabled={
              saving
              || gerandoContrato
              || !docOk
              || !telPrincipalOk
              || (bloqueioCadastroExistente && !cienciaCadastroExistente)
            }
          >
            <Save className="h-4 w-4 mr-1" />
            {modoEdicaoPosVenda ? 'Salvar alterações' : 'Liberar para contrato'}
          </Button>
          {modoEdicaoPosVenda && (
            <Button
              type="button"
              onClick={handleGerarContratoPosVenda}
              loading={gerandoContrato || (saving && acaoAposSalvarRef.current === 'gerarContrato')}
              disabled={
                saving
                || gerandoContrato
                || !docOk
                || !telPrincipalOk
                || (bloqueioCadastroExistente && !cienciaCadastroExistente)
              }
              className="bg-teal-700 hover:bg-teal-800 text-white"
            >
              <FileSignature className="h-4 w-4 mr-1" />
              Gerar contrato
            </Button>
          )}
        </div>
      </form>

      <ContratoGeradoSucessoModal
        info={contratoGeradoInfo}
        onClose={() => {
          setContratoGeradoInfo(null);
          navigate('/venda/propostas');
        }}
        onToast={(msg, tipo) => showToast(msg, tipo)}
      />
    </div>
  );
};

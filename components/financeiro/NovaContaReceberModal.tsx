import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Save,
  AlertCircle,
  RefreshCw,
  Search,
  ChevronDown,
  CheckCircle2,
  User,
  DollarSign,
  Calendar,
  FileText,
  Layers,
  CreditCard,
  Banknote,
  Building2,
  Hash,
} from 'lucide-react';
import { Button, Input, Select, Label } from '../../components/ui/Components';
import { useFinanceiro, ContaReceber } from '../../lib/FinanceiroStore';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { ensureContasDestinoBaixa } from '../../lib/finCaixaAutoAbertura';
import { FILIAL_TODAS_ID } from '../../lib/filialConstants';
import { useFilial } from '../../lib/FilialContext';
import { useEmpresaContextoAtivo } from '../../lib/EmpresaContextoAtivo';
import { montarFiltroOrBuscaCliente } from '../../lib/buscaCliente';
import { ymToDisplayBr } from '../../lib/dateInputUtils';
import {
  centavosParaInputMoeda,
  formatarMoedaInputAoSair,
  parseInputMoedaParaCentavos,
  sanitizarTextoMoedaInput,
} from '../../lib/moedaInputUtils';
import { PixPagadorConfirmacao } from './PixPagadorConfirmacao';
import {
    formaEhPix,
    pixPagadorParaBaixa,
    pixPagadorStateInicial,
    validarPixPagador,
    type PixPagadorState,
} from '../../lib/pixPagadorBaixa';
import { CompetenciaMesAnoInput } from './CompetenciaMesAnoInput';
import { inferirTipoDocumentoReceber } from '../../lib/inferirTipoDocumento';

export interface NovaContaReceberModalProps {
  onClose: () => void;
  onSuccess: () => void;
  /** Cria o título e registra o recebimento imediato nesta conta (ex.: caixa aberto na Tesouraria). */
  caixaDireto?: {
    contaBancariaId: string;
    contaLabel?: string;
  };
  clienteId?: string;
  assinaturaId?: string;
  ocultarPagamento?: boolean;
}

interface PessoaSelectItem {
  id: string;
  nome: string;
  tipo: 'cliente' | 'fornecedor';
  cpf?: string;
  documento?: string;
  telefone_principal?: string;
  empresa_id?: string;
}

const hoje = () => new Date().toISOString().split('T')[0];

const addMeses = (yyyymmdd: string, meses: number): string => {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const data = new Date(y, m - 1 + meses, d);
  return data.toISOString().split('T')[0];
};

const hojeYm = () => hoje().slice(0, 7);

const ymToIsoDate = (ym: string): string => {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return hoje();
  return `${ym}-01`;
};

const addMesesYm = (ym: string, meses: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const data = new Date(y, m - 1 + meses, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
};

type ParcelaRascunho = {
  numero: number;
  valorCentavos: number;
  valorInput: string;
  dataVencimento: string;
  competenciaYm: string;
};

const distribuirValorParcelas = (totalCentavos: number, quantidade: number): number[] => {
  if (quantidade < 1) return [];
  const base = Math.floor(totalCentavos / quantidade);
  const resto = totalCentavos - base * quantidade;
  return Array.from({ length: quantidade }, (_, i) => base + (i === quantidade - 1 ? resto : 0));
};

const gerarParcelasRascunho = (
  quantidade: number,
  totalCentavos: number,
  vencimentoBase: string,
  competenciaBaseYm: string,
): ParcelaRascunho[] => {
  const n = Math.max(2, Math.min(60, quantidade));
  const valores = distribuirValorParcelas(totalCentavos, n);
  return valores.map((valorCentavos, i) => ({
    numero: i + 1,
    valorCentavos,
    valorInput: centavosParaInputMoeda(valorCentavos),
    dataVencimento: i === 0 ? vencimentoBase : addMeses(vencimentoBase, i),
    competenciaYm: i === 0 ? competenciaBaseYm : addMesesYm(competenciaBaseYm, i),
  }));
};

const formatarReais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const NovaContaReceberModal: React.FC<NovaContaReceberModalProps> = ({
  onClose,
  onSuccess,
  caixaDireto,
  clienteId,
  assinaturaId,
  ocultarPagamento = false,
}) => {
  const {
    empresaIdEfetivo,
    empresaIdsParaFiltro,
    loadingEmpresasGrupo,
    visaoTodasEmpresasGrupo,
  } = useEmpresaContextoAtivo();
  const empresaId = empresaIdEfetivo || '';
  const empresaIdsBuscaCliente = useMemo(
    () => (empresaIdsParaFiltro || []).map((id) => id.trim()).filter(Boolean),
    [empresaIdsParaFiltro],
  );
  const aguardandoGrupoCliente =
    visaoTodasEmpresasGrupo && loadingEmpresasGrupo && empresaIdsBuscaCliente.length === 0;
  const {
    criarContaReceber,
    baixarContaReceber,
    planoContas,
    centrosCusto,
    formasPagamento,
    contasBancarias,
    loadPlanoContas,
    loadCentrosCusto,
    loadFormasPagamento,
    loadContasBancarias,
  } = useFinanceiro();
  const { user } = useAuth();
  const { filiais, filialId, isTodasFiliais, dataRevision } = useFilial();
  const precisaEscolherFilialTitulo = isTodasFiliais && filiais.length > 1;
  const [filialTituloId, setFilialTituloId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Form state ───
  const [descricao, setDescricao] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [planoContaId, setPlanoContaId] = useState('');
  const [centroCustoId, setCentroCustoId] = useState('');
  const [formaPagamentoId, setFormaPagamentoId] = useState('');
  const [contaBancariaId, setContaBancariaId] = useState('');

  const [valorInput, setValorInput] = useState('');
  const [valorCentavos, setValorCentavos] = useState(0);

  const [dataVencimento, setDataVencimento] = useState(hoje());
  const [dataRecebimento, setDataRecebimento] = useState(() => (caixaDireto ? hoje() : ''));
  const [dataCompetenciaYm, setDataCompetenciaYm] = useState(hojeYm());

  const [parcelar, setParcelar] = useState(false);
  const [totalParcelas, setTotalParcelas] = useState(2);
  const [parcelasRascunho, setParcelasRascunho] = useState<ParcelaRascunho[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [pixPagador, setPixPagador] = useState<PixPagadorState>(pixPagadorStateInicial);

  // ─── Cliente/Fornecedor search ───
  const [pessoa, setPessoa] = useState<PessoaSelectItem | null>(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [carregandoClientes, setCarregandoClientes] = useState(false);
  const [pessoas, setPessoas] = useState<PessoaSelectItem[]>([]);
  const [listaAberta, setListaAberta] = useState(false);
  const refDropdown = useRef<HTMLDivElement | null>(null);

  // Carrega catálogos
  useEffect(() => {
    loadPlanoContas();
    loadCentrosCusto();
    loadFormasPagamento();
    loadContasBancarias();
  }, [loadPlanoContas, loadCentrosCusto, loadFormasPagamento, loadContasBancarias]);

  useEffect(() => {
    if (precisaEscolherFilialTitulo && filiais.length > 0) {
      setFilialTituloId((prev) => (prev && filiais.some((f) => f.id === prev) ? prev : filiais[0].id));
    } else if (!isTodasFiliais && filialId && filialId !== FILIAL_TODAS_ID) {
      setFilialTituloId(filialId);
    }
  }, [precisaEscolherFilialTitulo, filiais, filialId, isTodasFiliais, dataRevision]);

  useEffect(() => {
    if (!caixaDireto) return;
    setContaBancariaId(caixaDireto.contaBancariaId);
    setParcelar(false);
    setDataRecebimento((prev) => prev || hoje());
  }, [caixaDireto?.contaBancariaId]);

  // ESC fecha
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  // Pre-carrega o cliente quando o clienteId é fornecido
  useEffect(() => {
    if (!clienteId) return;
    const carregarClientePredefinido = async () => {
      try {
        const { data, error: err } = await supabase
          .from('clientes')
          .select('id, nome, cpf, telefone_principal, empresa_id')
          .eq('id', clienteId)
          .maybeSingle();
        if (err) throw err;
        if (data) {
          setPessoa({
            id: data.id,
            nome: data.nome,
            tipo: 'cliente',
            cpf: data.cpf || '',
            telefone_principal: data.telefone_principal || '',
            empresa_id: data.empresa_id,
          });
        }
      } catch (err) {
        console.error('[NovaContaReceberModal] erro ao buscar cliente predefinido:', err);
      }
    };
    carregarClientePredefinido();
  }, [clienteId]);

  // Busca clientes + fornecedores (com debounce) — respeita visão “todas as empresas do grupo”
  useEffect(() => {
    if (aguardandoGrupoCliente) {
      setPessoas([]);
      setCarregandoClientes(false);
      return;
    }
    if (!empresaIdsBuscaCliente.length) return;
    let cancelado = false;
    setCarregandoClientes(true);
    const t = setTimeout(async () => {
      try {
        let clientesQuery = supabase
          .from('clientes')
          .select('id, nome, cpf, telefone_principal, empresa_id')
          .order('nome', { ascending: true })
          .limit(30);
        let fornecedoresQuery = supabase
          .from('fornecedores')
          .select('id, nome, cnpj_cpf, contato, empresa_id')
          .is('deleted_at', null)
          .order('nome', { ascending: true })
          .limit(30);
        if (empresaIdsBuscaCliente.length === 1) {
          clientesQuery = clientesQuery.eq('empresa_id', empresaIdsBuscaCliente[0]);
          fornecedoresQuery = fornecedoresQuery.eq('empresa_id', empresaIdsBuscaCliente[0]);
        } else {
          clientesQuery = clientesQuery.in('empresa_id', empresaIdsBuscaCliente);
          fornecedoresQuery = fornecedoresQuery.in('empresa_id', empresaIdsBuscaCliente);
        }
        if (buscaCliente && buscaCliente.trim().length > 0) {
          const termo = buscaCliente.trim();
          const orCliente = montarFiltroOrBuscaCliente(termo);
          if (orCliente) clientesQuery = clientesQuery.or(orCliente);
          const digits = termo.replace(/\D/g, '');
          if (digits.length >= 3) {
            fornecedoresQuery = fornecedoresQuery.or(`nome.ilike.%${termo}%,cnpj_cpf.ilike.%${digits}%,contato->>telefone.ilike.%${termo}%`);
          } else {
            fornecedoresQuery = fornecedoresQuery.or(
              `nome.ilike.%${termo}%,contato->>telefone.ilike.%${termo}%,contato->>email.ilike.%${termo}%`,
            );
          }
        }
        const [{ data: clientesData, error: clientesErr }, { data: fornecedoresData, error: fornecedoresErr }] = await Promise.all([
          clientesQuery,
          fornecedoresQuery,
        ]);
        if (cancelado) return;
        if (clientesErr || fornecedoresErr) {
          console.error('[NovaContaReceberModal] busca clientes/fornecedores:', clientesErr || fornecedoresErr);
          setPessoas([]);
        } else {
          const clientesMapped: PessoaSelectItem[] = (clientesData || []).map((c: any) => ({
            id: c.id,
            nome: c.nome,
            tipo: 'cliente',
            cpf: c.cpf || '',
            telefone_principal: c.telefone_principal || '',
            empresa_id: c.empresa_id,
          }));
          const fornecedoresMapped: PessoaSelectItem[] = (fornecedoresData || []).map((f: any) => ({
            id: f.id,
            nome: f.nome,
            tipo: 'fornecedor',
            documento: f.cnpj_cpf || '',
            telefone_principal: f?.contato?.telefone || '',
            empresa_id: f.empresa_id,
          }));
          const merged = [...clientesMapped, ...fornecedoresMapped].sort((a, b) =>
            String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'),
          );
          setPessoas(merged);
        }
      } finally {
        if (!cancelado) setCarregandoClientes(false);
      }
    }, 240);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [empresaIdsBuscaCliente, buscaCliente, aguardandoGrupoCliente]);

  // Click fora fecha dropdown
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!refDropdown.current) return;
      if (!refDropdown.current.contains(e.target as Node)) setListaAberta(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const planoContasReceita = useMemo(
    () =>
      planoContas
        .filter(
          (c) =>
            Boolean(c.id) &&
            (String(c.tipo || '').toLowerCase() === 'receita' ||
              String(c.natureza || '').toLowerCase() === 'receita') &&
            c.aceita_lancamento &&
            c.ativo
        )
        .sort((a, b) =>
          String(a.codigo ?? '').localeCompare(String(b.codigo ?? ''), undefined, { numeric: true })
        ),
    [planoContas]
  );

  const centrosAtivos = useMemo(() => centrosCusto.filter((c) => c.ativo), [centrosCusto]);
  const formasAtivas = useMemo(() => formasPagamento.filter((f) => f.ativo), [formasPagamento]);
  const contasAtivas = useMemo(() => contasBancarias, [contasBancarias]);
  const formaSelecionada = useMemo(
    () => formasAtivas.find((f) => f.id === formaPagamentoId),
    [formasAtivas, formaPagamentoId],
  );
  const receberAoSalvar = Boolean(
    caixaDireto || (!parcelar && Boolean(String(dataRecebimento || '').trim())),
  );
  const pagamentoPixRecebimento = receberAoSalvar && formaEhPix(formaSelecionada?.tipo || formaSelecionada?.nome);

  const normalizarTexto = (value: string) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = sanitizarTextoMoedaInput(e.target.value);
    setValorInput(v);
    setValorCentavos(parseInputMoedaParaCentavos(v));
  };

  const handleValorBlur = () => {
    setValorInput((prev) => formatarMoedaInputAoSair(prev));
  };

  const handleParcelaValorChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const v = sanitizarTextoMoedaInput(e.target.value);
    const centavos = parseInputMoedaParaCentavos(v);
    setParcelasRascunho((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, valorCentavos: centavos, valorInput: v } : p,
      ),
    );
  };

  const handleParcelaValorBlur = (index: number) => {
    setParcelasRascunho((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, valorInput: formatarMoedaInputAoSair(p.valorInput) } : p,
      ),
    );
  };

  const ativarParcelamento = (ativo: boolean) => {
    setParcelar(ativo);
    if (!ativo) {
      setParcelasRascunho([]);
      return;
    }
    setDataRecebimento('');
    const n = Math.max(2, totalParcelas);
    setTotalParcelas(n);
    setParcelasRascunho(
      gerarParcelasRascunho(n, valorCentavos, dataVencimento, dataCompetenciaYm),
    );
  };

  const atualizarQuantidadeParcelas = (qtd: number) => {
    const n = Math.max(2, Math.min(60, qtd));
    setTotalParcelas(n);
    setParcelasRascunho(
      gerarParcelasRascunho(n, valorCentavos, dataVencimento, dataCompetenciaYm),
    );
  };

  const redistribuirParcelasIgualmente = () => {
    setParcelasRascunho(
      gerarParcelasRascunho(totalParcelas, valorCentavos, dataVencimento, dataCompetenciaYm),
    );
  };

  const handleParcelaVencimentoChange = (index: number, venc: string) => {
    setParcelasRascunho((prev) =>
      prev.map((p, i) => (i === index ? { ...p, dataVencimento: venc } : p)),
    );
  };

  const somaParcelasCentavos = useMemo(
    () => parcelasRascunho.reduce((s, p) => s + p.valorCentavos, 0),
    [parcelasRascunho],
  );
  const parcelasConferem = !parcelar || somaParcelasCentavos === valorCentavos;
  const diferencaParcelasCentavos = valorCentavos - somaParcelasCentavos;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!descricao.trim()) {
      setError('Informe uma descrição para o lançamento.');
      return;
    }
    if (!planoContaId) {
      setError('Selecione a natureza financeira (Plano de Contas).');
      return;
    }
    if (!dataVencimento) {
      setError('Informe a data de vencimento.');
      return;
    }
    if (receberAoSalvar && !dataRecebimento) {
      setError('Informe a data de recebimento para baixar o título.');
      return;
    }
    if (valorCentavos <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    if (parcelar && !parcelasConferem) {
      setError(
        `A soma das parcelas (R$ ${formatarReais(somaParcelasCentavos)}) deve ser igual ao valor total (R$ ${formatarReais(valorCentavos)}).`,
      );
      return;
    }
    if (parcelar && parcelasRascunho.length < 2) {
      setError('Configure pelo menos 2 parcelas.');
      return;
    }
    if (receberAoSalvar && !formaPagamentoId) {
      setError('Selecione a forma de pagamento para registrar o recebimento.');
      return;
    }
    if (receberAoSalvar && !caixaDireto && !contaBancariaId) {
      setError('Selecione a conta bancária ou caixa para registrar o recebimento.');
      return;
    }
    if (pagamentoPixRecebimento) {
      const erroPix = validarPixPagador(true, pixPagador);
      if (erroPix) {
        setError(erroPix);
        return;
      }
    }
    if (precisaEscolherFilialTitulo && !filialTituloId) {
      setError('Selecione a unidade (filial) do título.');
      return;
    }
    const nParcelas = caixaDireto ? 1 : (parcelar ? parcelasRascunho.length : 1);

    setLoading(true);
    try {
      const parcelasParaCriar = parcelar
        ? parcelasRascunho
        : [{
            numero: 1,
            valorCentavos,
            valorInput: valorInput,
            dataVencimento,
            competenciaYm: dataCompetenciaYm,
          }];

      for (let i = 0; i < parcelasParaCriar.length; i++) {
        const parcela = parcelasParaCriar[i];
        const valor = parcela.valorCentavos;
        const venc = parcela.dataVencimento;
        const comp = ymToIsoDate(parcela.competenciaYm);
        const nParcelasTotal = parcelasParaCriar.length;
        const sufixo = nParcelasTotal > 1 ? ` (${parcela.numero}/${nParcelasTotal})` : '';
        const nomePessoa = String(pessoa?.nome || '').trim();
        const descricaoBase = descricao.trim();
        const descricaoComPessoa =
          pessoa?.tipo === 'fornecedor' && nomePessoa
            ? `${nomePessoa} — ${descricaoBase || 'Receita'}`
            : descricaoBase;
        const assinaturaVinculada =
          pessoa?.tipo === 'cliente' && pessoa.id === clienteId && assinaturaId
            ? assinaturaId
            : undefined;
        const planoConta = planoContasReceita.find((c) => c.id === planoContaId);
        const tipoDocumento = inferirTipoDocumentoReceber({
          assinaturaId: assinaturaVinculada,
          descricao: descricaoComPessoa,
          planoContaNome: planoConta?.nome,
          planoContaCodigo: planoConta?.codigo,
        });
        const payload: Partial<ContaReceber> & {
          plano_conta_id?: string;
          centro_custo_id?: string;
          forma_pagamento_id?: string;
          conta_bancaria_id?: string;
          numero_documento?: string;
          observacoes?: string;
          empresa_id?: string;
          assinatura_id?: string;
        } = {
          empresa_id: pessoa?.empresa_id || empresaId,
          cliente_id: pessoa?.tipo === 'cliente' ? pessoa.id : undefined,
          assinatura_id: assinaturaVinculada,
          tipo_documento: tipoDocumento,
          descricao: `${descricaoComPessoa}${sufixo}`,
          numero_documento: numeroDocumento.trim() || undefined,
          plano_conta_id: planoContaId,
          centro_custo_id: centroCustoId || undefined,
          forma_pagamento_id: formaPagamentoId || undefined,
          conta_bancaria_id: contaBancariaId || undefined,
          valor_original_centavos: valor,
          data_emissao: venc,
          data_vencimento: venc,
          data_competencia: comp,
          parcela_numero: parcela.numero,
          total_parcelas: nParcelasTotal,
          status: 'aberto',
          observacoes: observacoes.trim() || undefined,
          ...((precisaEscolherFilialTitulo && filialTituloId) || (!isTodasFiliais && filialId && filialId !== FILIAL_TODAS_ID)
            ? { filial_id: filialTituloId || filialId }
            : {}),
        };
        const newId = await criarContaReceber(payload);
        if (!newId) {
          throw new Error('Não foi possível criar o título.');
        }

        if (receberAoSalvar) {
          const contaDestinoId = caixaDireto?.contaBancariaId || contaBancariaId;
          const contaCaixa = contasBancarias.find((c) => c.id === contaDestinoId);
          const prepCaixa = await ensureContasDestinoBaixa({
            contas: contaCaixa
              ? [{ id: contaCaixa.id, nome: contaCaixa.nome, tipo: contaCaixa.tipo }]
              : [{ id: contaDestinoId, nome: caixaDireto?.contaLabel || 'Caixa', tipo: 'caixa' }],
            dataPagamento: dataRecebimento,
            usuarioId: user?.id,
            observacaoPrefixo: caixaDireto
              ? `Sessão retroativa — receita no caixa (${caixaDireto.contaLabel || 'caixa'})`
              : 'Sessão retroativa — recebimento no lançamento',
          });
          if (prepCaixa.ok === false) {
            throw new Error(prepCaixa.errorMsg);
          }

          const okBaixa = await baixarContaReceber({
            conta_receber_id: newId,
            valor_pago_centavos: valor,
            forma_pagamento_id: formaPagamentoId || undefined,
            conta_bancaria_id: contaDestinoId,
            observacoes: observacoes.trim() || undefined,
            data_pagamento: dataRecebimento,
            ...(pagamentoPixRecebimento ? pixPagadorParaBaixa(true, pixPagador) : {}),
          });
          if (!okBaixa) {
            throw new Error('Título criado, mas falhou ao registrar o recebimento.');
          }
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao criar conta a receber.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-md shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0 border-l-4 border-emerald-600 pl-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold uppercase tracking-wider text-slate-900">
                {caixaDireto ? 'Receita no Caixa' : 'Lançamento de Conta a Receber'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {caixaDireto
                  ? `Registro automático de recebimento no caixa correspondente à conta ${caixaDireto.contaLabel || ''}.`
                  : 'Informe vencimento, competência (mês/ano) e data de recebimento se for baixar o título na hora (pode ser retroativa).'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded-md transition text-slate-500 hover:text-slate-800"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md flex items-center gap-2 text-xs font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                {error}
              </div>
            )}

            {precisaEscolherFilialTitulo && (
              <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-md space-y-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                  Unidade (Filial) de Origem *
                </label>
                <Select value={filialTituloId} onChange={(e) => setFilialTituloId(e.target.value)}>
                  {filiais.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* SEÇÃO 1: Cliente + Natureza */}
            <div className="bg-slate-50/30 p-4 border border-slate-200/80 rounded-md space-y-4">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Identificação & Classificação
              </div>

              {/* Cliente */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                  Cliente / Fornecedor
                </label>
                {empresaIdsBuscaCliente.length > 1 && (
                  <p className="text-[11px] text-gray-500 -mt-1">
                    Busca em todas as empresas do grupo (ex.: Catalão e matriz).
                  </p>
                )}
                <div className="relative" ref={refDropdown}>
                  <button
                    type="button"
                    onClick={() => setListaAberta((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm hover:border-gray-300 transition"
                  >
                    <span className="truncate text-left">
                      {pessoa ? (
                        <>
                          <span className="font-semibold text-gray-900">{pessoa.nome}</span>
                          <span className="ml-2 text-[10px] uppercase font-semibold rounded-full px-2 py-0.5 bg-gray-100 text-gray-700">
                            {pessoa.tipo}
                          </span>
                          {(pessoa.cpf || pessoa.documento) && (
                            <span className="text-gray-500 ml-2 font-mono text-xs">{pessoa.cpf || pessoa.documento}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">Selecionar cliente/fornecedor — ou deixar em branco</span>
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  </button>
                  {listaAberta && (
                    <div className="absolute left-0 right-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      <div className="px-2 py-2 border-b border-gray-100 flex items-center gap-2">
                        <Search className="h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          autoFocus
                          value={buscaCliente}
                          onChange={(e) => setBuscaCliente(e.target.value)}
                          placeholder="Buscar por nome, CPF/CNPJ ou telefone…"
                          className="flex-1 text-sm outline-none"
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {pessoa && (
                          <button
                            type="button"
                            onClick={() => {
                              setPessoa(null);
                              setListaAberta(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 border-b border-amber-100 font-semibold"
                          >
                            ✕ Remover seleção (lançamento sem vínculo)
                          </button>
                        )}
                        {carregandoClientes ? (
                          <div className="px-3 py-6 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin" /> Carregando…
                          </div>
                        ) : aguardandoGrupoCliente ? (
                          <div className="px-3 py-6 text-center text-sm text-gray-500">
                            Carregando empresas do grupo…
                          </div>
                        ) : pessoas.length === 0 ? (
                          <div className="px-3 py-6 text-center text-sm text-gray-500">
                            Nenhum cliente/fornecedor encontrado.
                          </div>
                        ) : (
                          <ul>
                            {pessoas.map((c) => {
                              const ativo = pessoa?.id === c.id && pessoa?.tipo === c.tipo;
                              return (
                                <li key={`${c.tipo}-${c.id}`}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPessoa(c);
                                      setListaAberta(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2 ${
                                      ativo ? 'bg-blue-50' : ''
                                    }`}
                                  >
                                    {ativo ? (
                                      <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                                    ) : (
                                      <div className="h-4 w-4 rounded-full border border-gray-300 mt-0.5 shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-gray-900 truncate">{c.nome}</p>
                                      <p className="text-[11px] text-gray-500">
                                        <span className="uppercase font-semibold mr-1">{c.tipo}</span>
                                        <span className="font-mono">{c.cpf || c.documento || 'sem documento'}</span>
                                        {c.telefone_principal ? ' • ' + c.telefone_principal : ''}
                                      </p>
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Natureza */}
                <div className="space-y-1.5 md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                  Natureza Financeira (Plano de Contas) *
                </label>
                  <Select
                    value={planoContaId}
                    onChange={(e) => setPlanoContaId(e.target.value)}
                    required
                  >
                    <option value="">Selecione a natureza da receita…</option>
                    {planoContasReceita.map((c) => {
                      const nome = String(c.nome ?? '').trim() || 'Sem nome';
                      return (
                        <option key={c.id} value={c.id}>
                          {nome}
                        </option>
                      );
                    })}
                  </Select>
                  {planoContasReceita.length === 0 && (
                    <p className="text-[11px] text-amber-700">
                      Nenhuma conta de receita cadastrada no Plano de Contas. Cadastre uma para classificar a receita.
                    </p>
                  )}
                </div>

                {/* Centro de custo */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                    Centro de Custo
                  </label>
                  <Select value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)}>
                    <option value="">— Sem centro de custo —</option>
                    {centrosAtivos.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {String(cc.codigo ?? '').trim()
                          ? `${String(cc.codigo).trim()} — ${String(cc.nome ?? '').trim() || 'Sem nome'}`
                          : String(cc.nome ?? '').trim() || 'Centro'}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: Valores & Prazos */}
            <div className="bg-slate-50/30 p-4 border border-slate-200/80 rounded-md space-y-4">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Valores & Datas
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Descrição do Título *</label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Aluguel sala 2, prestação de serviço a terceiros…"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Valor Total (R$) *</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={valorInput}
                    onChange={handleValorChange}
                    onBlur={handleValorBlur}
                    placeholder="0,00"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Nº do Documento</label>
                  <Input
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
                    placeholder="NF, contrato, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                    Data de Vencimento *
                  </label>
                  <Input
                    type="date"
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    required
                  />
                </div>
                {!parcelar && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                      Data de Recebimento
                    </label>
                    <Input
                      type="date"
                      value={dataRecebimento}
                      onChange={(e) => setDataRecebimento(e.target.value)}
                      className="border-emerald-300 focus:border-emerald-600 ring-emerald-100"
                    />
                    <p className="text-[10px] text-emerald-800 font-semibold">
                      Baixar ao salvar (retroativa). Vazio = em aberto.
                    </p>
                  </div>
                )}
                <CompetenciaMesAnoInput
                  value={dataCompetenciaYm}
                  onChange={setDataCompetenciaYm}
                />
              </div>

              {/* Parcelamento */}
              {!caixaDireto && (
              <div className={`rounded-lg border p-4 space-y-4 transition-colors ${
                parcelar ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/60'
              }`}>
                <button
                  type="button"
                  onClick={() => ativarParcelamento(!parcelar)}
                  className="w-full flex items-start gap-3 text-left rounded-md hover:bg-white/60 p-2 -m-2 transition"
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    parcelar ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500'
                  }`}>
                    <Layers className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {parcelar ? 'Parcelamento ativo' : 'Dividir em várias parcelas'}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {parcelar
                        ? 'Edite o valor e o vencimento de cada parcela. A soma deve bater com o valor total.'
                        : 'Clique para gerar 2 ou mais títulos com vencimentos mensais (valores editáveis).'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                    parcelar ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {parcelar ? 'Ligado' : 'Desligado'}
                  </span>
                </button>

                {parcelar && (
                  <div className="space-y-4 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1 w-32">
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                          Qtd. parcelas
                        </label>
                        <Input
                          type="number"
                          min={2}
                          max={60}
                          value={totalParcelas}
                          onChange={(e) => atualizarQuantidadeParcelas(parseInt(e.target.value) || 2)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={redistribuirParcelasIgualmente}
                        className="h-10"
                      >
                        Dividir valor igualmente
                      </Button>
                      <div className={`ml-auto text-right text-xs font-semibold px-3 py-2 rounded-md border ${
                        parcelasConferem
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50 border-amber-300 text-amber-900'
                      }`}>
                        <span className="block text-[10px] uppercase tracking-wide opacity-80">Soma das parcelas</span>
                        <span className="text-sm font-bold tabular-nums">
                          R$ {formatarReais(somaParcelasCentavos)}
                          <span className="text-slate-500 font-medium"> / R$ {formatarReais(valorCentavos)}</span>
                        </span>
                        {!parcelasConferem && (
                          <span className="block text-[10px] mt-0.5">
                            {diferencaParcelasCentavos > 0
                              ? `Faltam R$ ${formatarReais(diferencaParcelasCentavos)}`
                              : `Passou R$ ${formatarReais(Math.abs(diferencaParcelasCentavos))}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                        <div className="col-span-1">#</div>
                        <div className="col-span-4">Valor (R$)</div>
                        <div className="col-span-4">Vencimento</div>
                        <div className="col-span-3">Competência</div>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                        {parcelasRascunho.map((parcela, index) => (
                          <div
                            key={`parcela-${parcela.numero}`}
                            className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm"
                          >
                            <div className="col-span-1 font-bold text-indigo-700 tabular-nums">
                              {parcela.numero}
                            </div>
                            <div className="col-span-4">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={parcela.valorInput}
                                onChange={(e) => handleParcelaValorChange(index, e)}
                                onBlur={() => handleParcelaValorBlur(index)}
                                placeholder="0,00"
                                className="h-9 text-sm font-semibold"
                              />
                            </div>
                            <div className="col-span-4">
                              <Input
                                type="date"
                                value={parcela.dataVencimento}
                                onChange={(e) => handleParcelaVencimentoChange(index, e.target.value)}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="col-span-3 text-xs text-slate-600 font-medium tabular-nums">
                              {ymToDisplayBr(parcela.competenciaYm)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* SEÇÃO 3: Pagamento & Fluxo */}
            {!ocultarPagamento && (
              <div className="bg-slate-50/30 p-4 border border-slate-200/80 rounded-md space-y-4">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                  {receberAoSalvar ? 'Recebimento (obrigatório para baixar)' : 'Pagamento previsto (opcional)'}
                </div>

                {receberAoSalvar && !caixaDireto && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                    Data de recebimento informada — selecione forma e conta abaixo para registrar a baixa ao salvar.
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      {receberAoSalvar ? 'Forma de Pagamento *' : 'Forma de Pagamento Prevista'}
                    </label>
                    <Select
                      value={formaPagamentoId}
                      onChange={(e) => setFormaPagamentoId(e.target.value)}
                      required={receberAoSalvar}
                    >
                      <option value="">{receberAoSalvar ? 'Selecione…' : '— Não definida —'}</option>
                      {formasAtivas.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      {receberAoSalvar ? 'Conta Bancária / Caixa *' : 'Conta Bancária / Caixa Previsto'}
                    </label>
                    {caixaDireto ? (
                      <Input
                        readOnly
                        value={caixaDireto.contaLabel || 'Conta selecionada'}
                        className="bg-gray-50 text-gray-800"
                      />
                    ) : (
                    <Select
                      value={contaBancariaId}
                      onChange={(e) => setContaBancariaId(e.target.value)}
                      required={receberAoSalvar}
                    >
                      <option value="">— Não definida —</option>
                      {contasAtivas.map((cb: any) => (
                        <option key={cb.id} value={cb.id}>
                          {cb.nome || cb.banco_nome || cb.codigo}
                        </option>
                      ))}
                    </Select>
                    )}
                  </div>
                </div>

                {pagamentoPixRecebimento && (
                  <PixPagadorConfirmacao
                    visivel
                    titularNome={pessoa?.nome || 'Cliente'}
                    state={pixPagador}
                    onChange={setPixPagador}
                    idPrefix="nova-receita-pix"
                  />
                )}

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide">Observações Gerais</label>
                  <textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-800 focus:ring-2 focus:ring-slate-100 outline-none resize-none placeholder:text-slate-400"
                    placeholder="Informações adicionais para auditoria interna ou conciliação bancária..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-700 truncate">
              {valorCentavos > 0 ? (
                <>
                  <span className="text-xs text-slate-500">Valor Lançado:</span>{' '}
                  <span className="font-bold text-slate-900 text-base">
                    R$ {(valorCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  {parcelar && totalParcelas > 1 && (
                    <span className={`ml-1.5 font-medium ${parcelasConferem ? 'text-slate-500' : 'text-amber-700'}`}>
                      em {totalParcelas} parcelas
                      {!parcelasConferem && ' — ajuste os valores'}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-slate-400">
                  Preencha o valor e a data de vencimento
                  {caixaDireto ? ' (e a data de recebimento, se retroativa)' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="h-10 px-4 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-md text-sm transition outline-none"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || (parcelar && !parcelasConferem)}
                className="h-10 px-5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-md text-sm transition flex items-center gap-2 outline-none disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {caixaDireto
                  ? 'Salvar e Receber no Caixa'
                  : receberAoSalvar
                    ? 'Salvar e Receber'
                    : parcelar && totalParcelas > 1
                      ? `Criar ${totalParcelas} Parcelas`
                      : 'Salvar Lançamento'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

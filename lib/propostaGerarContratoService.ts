import { supabase } from './supabase';
import { gerarCodigoClienteInterno } from './gerarCodigoClienteInterno';
import { calcularPrimeiroVencimentoDesde, dataHojeIsoLocal, normalizarDataIso } from './contratoDatas';
import {
  PROPOSTA_STATUS,
  propostaAguardandoContrato,
  propostaPodeGerarContrato,
} from './propostaStatus';
import { registrarAuditoriaCliente } from './registrarAuditoriaCliente';
import { buscarClienteDuplicado, normalizarCpfCliente } from './clienteDuplicidade';
import { mensagemErroSupabase } from './supabaseErrorMessage';
import { cpfValidoParaCadastro } from './cpfValidacao';
import { aplicarCarteiraConformeMetodoContrato } from './carteiraEscritorio';
import {
  normalizarFormaPagamentoAssinatura,
  normalizarStatusAssinatura,
} from './assinaturaNorm';
import { enderecoPropostaPartesFromRow } from './propostaEndereco';
import { gerarProximoCodigoContrato } from './proximoCodigoContrato';
import { resolverDataInicioContratoParaAssinatura } from './clienteContratoFormLoad';
import { resolverFilialIdContrato } from './filialContratoResolver';
import { resolveCurrentUserId } from './authUserId';
import {
  atribuirCobradorCarteiraCliente,
} from './cobradorDisponiveis';
import {
  bairroCobrancaCliente,
  buscarCobradorSugeridoPorBairro,
} from './cobradorSugestaoBairro';
import { normalizarPayloadBeneficiario } from './ClienteStore';
import {
  aplicarCarenciaBeneficiarioPayload,
  CARENCIA_DEPENDENTE_PADRAO_DIAS,
} from './beneficiarioCarencia';
import { normalizarParentescoDependente as normalizarParentescoDependenteCanon } from './parentescoDependente';
import { ORIGEM_CANAL_MIGRACAO } from './clienteDuplicidade';
import { normalizarEstadoCivilParaDb } from './estadoCivilNorm';
import { resolverUfParaSelect } from './ufBrasil';
import {
  ajustarEnderecoClientePayload,
  validarLimitesClientePayload,
} from './clienteDbLimites';
import {
  gerarParcelasContratoMigracao,
  resolverDatasContratoMigracao,
  type ContratoMigracaoInput,
} from './contratoMigracao';

export type GerarContratoPropostaResult = {
  ok: boolean;
  clienteId?: string;
  assinaturaId?: string;
  codigoContrato?: string;
  /** Quantidade de dependentes gravados no contrato nesta execução. */
  dependentesIncluidos?: number;
  error?: string;
};

type DependentePropostaDetalhe = {
  nome?: string;
  cpf?: string;
  data_nascimento?: string;
  parentesco?: string;
};

type PropostaRow = {
  id: string;
  empresa_id: string;
  sequencial: number;
  status: string;
  plano_id: string | null;
  vendedor_id: string | null;
  cliente_id: string | null;
  assinatura_id: string | null;
  contribuinte_nome: string;
  contribuinte_documento: string;
  contribuinte_rg?: string | null;
  contribuinte_data_nascimento?: string | null;
  contribuinte_estado_civil?: string | null;
  contribuinte_naturalidade_uf?: string | null;
  contribuinte_naturalidade_cidade?: string | null;
  contribuinte_profissao?: string | null;
  contribuinte_religiao?: string | null;
  endereco_residencia?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_bairro?: string | null;
  endereco_quadra?: string | null;
  endereco_lote?: string | null;
  endereco_cep?: string | null;
  endereco_cidade?: string | null;
  endereco_uf?: string | null;
  cobrador_endereco_logradouro?: string | null;
  cobrador_endereco_numero?: string | null;
  cobrador_endereco_bairro?: string | null;
  cobrador_endereco_quadra?: string | null;
  cobrador_endereco_lote?: string | null;
  telefone_principal?: string | null;
  telefone_alternativo?: string | null;
  email?: string | null;
  taxa_adesao_recebida_centavos?: number | null;
  primeiro_vencimento: string;
  metodo_cobranca: string;
  data_pedido: string;
  contrato_migracao?: boolean | null;
  data_inicio_contrato?: string | null;
  data_ultima_mensalidade_paga?: string | null;
  data_registro_ultimo_pagamento?: string | null;
  migracao_cobrar_apenas_fenix?: boolean | null;
  cobrador_endereco_mesmo_residencial?: boolean | null;
  cobrador_endereco_entrega?: string | null;
  cobrador_endereco_cep?: string | null;
  cobrador_endereco_cidade?: string | null;
  cobrador_endereco_uf?: string | null;
  dependentes_detalhes?: DependentePropostaDetalhe[] | string | null;
};

function normalizarParentescoDependente(value?: string | null): string {
  return normalizarParentescoDependenteCanon(value) || 'outro';
}

/** Lê dependentes_detalhes (jsonb ou string JSON). */
export function parseDependentesDetalhesProposta(
  raw: PropostaRow['dependentes_detalhes'],
): DependentePropostaDetalhe[] {
  if (raw == null) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((d) => d && typeof d === 'object') as DependentePropostaDetalhe[];
}

function diaVencimentoDeIso(iso: string): number {
  const d = parseInt(String(iso || '').slice(8, 10), 10);
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 5;
}

async function resolverOuCriarCliente(
  proposta: PropostaRow,
): Promise<{ clienteId: string; error?: string }> {
  if (proposta.cliente_id) {
    return { clienteId: proposta.cliente_id };
  }

  const cpf = normalizarCpfCliente(proposta.contribuinte_documento);
  if (cpf.length >= 11) {
    const existente = await buscarClienteDuplicado({
      cpf,
      nome: proposta.contribuinte_nome,
      telefone: proposta.telefone_principal || proposta.telefone_alternativo,
      empresaIds: [proposta.empresa_id],
    });
    if (existente?.id) {
      return { clienteId: existente.id };
    }
    if (!cpfValidoParaCadastro(cpf)) {
      return {
        clienteId: '',
        error: 'CPF do titular inválido. Corrija a proposta antes de gerar o contrato.',
      };
    }
  } else if (!proposta.contrato_migracao) {
    return {
      clienteId: '',
      error: 'Informe o CPF do titular na proposta antes de gerar o contrato.',
    };
  }

  const codigo = await gerarCodigoClienteInterno(proposta.empresa_id);
  const usaMesmoEnderecoCob = proposta.metodo_cobranca !== 'cobrador'
    || proposta.cobrador_endereco_mesmo_residencial !== false;

  const endRes = enderecoPropostaPartesFromRow(proposta);
  const endCob = usaMesmoEnderecoCob
    ? endRes
    : enderecoPropostaPartesFromRow({
        endereco_logradouro: proposta.cobrador_endereco_logradouro,
        endereco_numero: proposta.cobrador_endereco_numero,
        endereco_bairro: proposta.cobrador_endereco_bairro,
        endereco_quadra: proposta.cobrador_endereco_quadra,
        endereco_lote: proposta.cobrador_endereco_lote,
        endereco_residencia: proposta.cobrador_endereco_entrega,
      });

  const operadorId = await resolveCurrentUserId();

  const payload: Record<string, unknown> = {
    empresa_id: proposta.empresa_id,
    codigo,
    nome: (proposta.contribuinte_nome || '').trim() || 'Contribuinte',
    cpf,
    rg: proposta.contribuinte_rg || null,
    data_nascimento: proposta.contribuinte_data_nascimento || null,
    estado_civil: normalizarEstadoCivilParaDb(proposta.contribuinte_estado_civil),
    naturalidade_uf: proposta.contribuinte_naturalidade_uf || null,
    naturalidade_cidade: proposta.contribuinte_naturalidade_cidade || null,
    profissao: proposta.contribuinte_profissao || null,
    email: (proposta.email || '').trim() || 'naoinformado@fenix.local',
    telefone_principal: proposta.telefone_principal || proposta.telefone_alternativo || '0000000000',
    celular: proposta.telefone_principal || proposta.telefone_alternativo || '0000000000',
    endereco_cep: proposta.endereco_cep || '00000000',
    endereco_logradouro: endRes.logradouro || proposta.endereco_residencia || 'Não informado',
    endereco_numero: endRes.numero || 'S/N',
    endereco_bairro: endRes.bairro || '—',
    endereco_cidade: proposta.endereco_cidade || '—',
    endereco_estado: resolverUfParaSelect(proposta.endereco_uf) || 'GO',
    status: 'ativo',
    vendedor_id: proposta.vendedor_id,
    criado_por_user_id: operadorId || proposta.vendedor_id,
    forma_pagamento_preferencial: proposta.metodo_cobranca || 'boleto',
    usa_endereco_residencial_cobranca: usaMesmoEnderecoCob,
    origem_canal: proposta.contrato_migracao ? ORIGEM_CANAL_MIGRACAO : 'proposta_venda',
    cliente_desde:
      (proposta.contrato_migracao && normalizarDataIso(proposta.data_inicio_contrato)) ||
      normalizarDataIso(proposta.data_pedido) ||
      dataHojeIsoLocal(),
    dia_vencimento_preferido: diaVencimentoDeIso(proposta.primeiro_vencimento || ''),
  };

  if (!usaMesmoEnderecoCob) {
    payload.endereco_cob_cep = proposta.cobrador_endereco_cep || proposta.endereco_cep;
    payload.endereco_cob_logradouro = endCob.logradouro || proposta.cobrador_endereco_entrega || 'Não informado';
    payload.endereco_cob_numero = endCob.numero || 'S/N';
    payload.endereco_cob_bairro = endCob.bairro || '—';
    payload.endereco_cob_cidade = proposta.cobrador_endereco_cidade || proposta.endereco_cidade;
    payload.endereco_cob_uf =
      resolverUfParaSelect(proposta.cobrador_endereco_uf) ||
      resolverUfParaSelect(proposta.endereco_uf) ||
      'GO';
  }

  ajustarEnderecoClientePayload(payload);
  const erroLimite = validarLimitesClientePayload(payload);
  if (erroLimite) {
    return { clienteId: '', error: erroLimite };
  }

  const { data: novo, error } = await supabase
    .from('clientes')
    .insert(payload)
    .select('id')
    .single();

  if (error || !novo?.id) {
    return {
      clienteId: '',
      error: mensagemErroSupabase(error, 'Não foi possível criar o cliente.'),
    };
  }

  return { clienteId: novo.id };
}

type BeneficiarioInserido = {
  id: string;
  nome: string;
  cpf?: string | null;
  parentesco: string;
  ativo: boolean;
};

async function listarBeneficiariosContrato(assinaturaId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('beneficiarios')
    .select('nome, cpf')
    .eq('assinatura_id', assinaturaId)
    .is('deleted_at', null);
  const chaves = new Set<string>();
  for (const row of data || []) {
    const nome = String((row as { nome?: string }).nome || '')
      .trim()
      .toLowerCase();
    const cpf = String((row as { cpf?: string }).cpf || '').replace(/\D/g, '');
    if (cpf) chaves.add(`cpf:${cpf}`);
    else if (nome) chaves.add(`nome:${nome}`);
  }
  return chaves;
}

function chaveDependenteProposta(dep: DependentePropostaDetalhe): string | null {
  const nome = (dep.nome || '').trim().toLowerCase();
  const cpf = (dep.cpf || '').replace(/\D/g, '');
  if (cpf.length >= 11) return `cpf:${cpf}`;
  if (nome) return `nome:${nome}`;
  return null;
}

/** Grava dependentes da proposta no contrato (beneficiários), sem duplicar os já existentes. */
async function inserirDependentes(
  proposta: PropostaRow,
  clienteId: string,
  assinaturaId: string,
): Promise<BeneficiarioInserido[]> {
  const deps = parseDependentesDetalhesProposta(proposta.dependentes_detalhes);
  if (deps.length === 0) return [];

  const existentes = await listarBeneficiariosContrato(assinaturaId);
  const inseridos: BeneficiarioInserido[] = [];
  const dataInclusao =
    (proposta.contrato_migracao && normalizarDataIso(proposta.data_inicio_contrato)) ||
    normalizarDataIso(proposta.data_pedido) ||
    dataHojeIsoLocal();

  for (const dep of deps) {
    const nome = (dep.nome || '').trim();
    if (!nome) continue;

    const chave = chaveDependenteProposta(dep);
    if (chave && existentes.has(chave)) continue;

    const cpfDigits = (dep.cpf || '').replace(/\D/g, '');
    const dataNasc = (dep.data_nascimento || '').trim();
    const base = normalizarPayloadBeneficiario({
      empresa_id: proposta.empresa_id,
      cliente_id: clienteId,
      assinatura_id: assinaturaId,
      nome,
      cpf: cpfDigits.length >= 11 ? cpfDigits : null,
      data_nascimento: dataNasc.length >= 10 ? dataNasc.slice(0, 10) : undefined,
      parentesco: normalizarParentescoDependente(dep.parentesco),
      tipo: 'dependente',
      status: 'ativo',
      ativo: true,
      data_inclusao: dataInclusao,
    });
    const payload = aplicarCarenciaBeneficiarioPayload(base, CARENCIA_DEPENDENTE_PADRAO_DIAS);

    const { data: novo, error: errDep } = await supabase
      .from('beneficiarios')
      .insert(payload)
      .select('id, nome, cpf, parentesco, ativo')
      .single();

    if (errDep || !novo) {
      console.error('[gerarContratoDesdeProposta] dependente não gravado:', nome, errDep?.message);
      continue;
    }

    if (chave) existentes.add(chave);
    inseridos.push(novo as BeneficiarioInserido);
  }

  return inseridos;
}

async function auditarDependentesIncluidos(
  proposta: PropostaRow,
  clienteId: string,
  codigoContrato: string,
  dependentes: BeneficiarioInserido[],
): Promise<void> {
  for (const dep of dependentes) {
    await registrarAuditoriaCliente({
      empresa_id: proposta.empresa_id,
      cliente_id: clienteId,
      categoria: 'beneficiario',
      referencia_tipo: 'beneficiario',
      referencia_id: dep.id,
      titulo: `Dependente adicionado: ${dep.nome}`,
      descricao: `Dependente incluído no contrato ${codigoContrato} a partir da proposta.`,
      dados_novos: {
        nome: dep.nome,
        cpf: dep.cpf ?? null,
        parentesco: dep.parentesco,
        ativo: dep.ativo,
      },
    });
  }
}

/** Converte proposta (aguardando contrato) em cliente + contrato + mensalidades. */
export async function gerarContratoDesdeProposta(
  propostaId: string,
): Promise<GerarContratoPropostaResult> {
  const { data: raw, error: errLoad } = await supabase
    .from('propostas_venda')
    .select('*')
    .eq('id', propostaId)
    .maybeSingle();

  if (errLoad) {
    return { ok: false, error: errLoad.message };
  }
  if (!raw) {
    return { ok: false, error: 'Proposta não encontrada.' };
  }

  const proposta = raw as PropostaRow;

  if (proposta.assinatura_id) {
    let clienteId = (proposta.cliente_id || '').trim();
    if (!clienteId) {
      const { data: assCli } = await supabase
        .from('assinaturas')
        .select('cliente_id, codigo')
        .eq('id', proposta.assinatura_id)
        .maybeSingle();
      clienteId = String(assCli?.cliente_id || '').trim();
    }
    const { data: assCod } = await supabase
      .from('assinaturas')
      .select('codigo')
      .eq('id', proposta.assinatura_id)
      .maybeSingle();

    let dependentesIncluidos = 0;
    if (clienteId) {
      const deps = await inserirDependentes(proposta, clienteId, proposta.assinatura_id);
      dependentesIncluidos = deps.length;
      if (deps.length > 0) {
        await auditarDependentesIncluidos(
          proposta,
          clienteId,
          assCod?.codigo || '',
          deps,
        );
      }
    }

    return {
      ok: true,
      clienteId: clienteId || undefined,
      assinaturaId: proposta.assinatura_id,
      codigoContrato: assCod?.codigo || undefined,
      dependentesIncluidos,
    };
  }

  if (!propostaPodeGerarContrato(proposta.status)) {
    const msg = propostaAguardandoContrato(proposta.status)
      ? 'Assuma a pós-venda desta proposta antes de gerar o contrato (botão «Assumir pós-venda» na fila).'
      : 'Somente propostas em pós-venda podem gerar cliente e contrato. O vendedor deve liberar a proposta e a equipe deve assumir a análise.';
    return { ok: false, error: msg };
  }

  if (!proposta.plano_id) {
    return { ok: false, error: 'A proposta não tem plano selecionado.' };
  }

  const { data: plano, error: errPlano } = await supabase
    .from('planos')
    .select('id, valor_mensal_centavos, valor_anual_centavos, taxa_adesao_centavos')
    .eq('id', proposta.plano_id)
    .maybeSingle();

  if (errPlano || !plano) {
    return { ok: false, error: 'Plano da proposta não encontrado.' };
  }

  const { clienteId, error: errCliente } = await resolverOuCriarCliente(proposta);
  if (!clienteId) {
    return { ok: false, error: errCliente || 'Cliente não criado.' };
  }

  const { data: clienteContratoRow } = await supabase
    .from('clientes')
    .select('cliente_desde, origem_canal')
    .eq('id', clienteId)
    .maybeSingle();

  if (!proposta.cliente_id) {
    await supabase.from('propostas_venda').update({ cliente_id: clienteId }).eq('id', proposta.id);
  }

  if (proposta.contrato_migracao) {
    await supabase
      .from('clientes')
      .update({ origem_canal: ORIGEM_CANAL_MIGRACAO })
      .eq('id', clienteId);
  }

  const diaVenc = diaVencimentoDeIso(proposta.primeiro_vencimento);
  const dataInicioContrato = resolverDataInicioContratoParaAssinatura({
    contratoMigracao: !!proposta.contrato_migracao,
    clienteDesdeDb: clienteContratoRow?.cliente_desde,
    dataEntradaForm: proposta.data_pedido,
    dataInicioForm: proposta.data_inicio_contrato,
  });
  const migracaoInput: ContratoMigracaoInput = {
    contratoMigracao: !!proposta.contrato_migracao,
    migracaoCobrarApenasFenix: !!proposta.migracao_cobrar_apenas_fenix,
    dataInicioContrato,
    dataUltimaMensalidadePaga: proposta.data_ultima_mensalidade_paga || undefined,
    dataRegistroUltimoPagamento: proposta.data_registro_ultimo_pagamento || undefined,
    diaVencimento: diaVenc,
    primeiroVencimentoInformado: proposta.primeiro_vencimento,
  };
  const { dataContratacao: dataInicio, dataPrimeiroVencimento: primeiroVenc } =
    resolverDatasContratoMigracao(migracaoInput);

  const filialId = await resolverFilialIdContrato(proposta.empresa_id, proposta.endereco_cidade);

  const payloadContrato = {
    empresa_id: proposta.empresa_id,
    cliente_id: clienteId,
    plano_id: proposta.plano_id,
    vendedor_id: proposta.vendedor_id,
    filial_id: filialId,
    valor_mensal_centavos: plano.valor_mensal_centavos,
    valor_anual_centavos: plano.valor_anual_centavos,
    taxa_adesao_centavos: proposta.taxa_adesao_recebida_centavos ?? plano.taxa_adesao_centavos,
    dia_vencimento: diaVenc,
    periodicidade: 'mensal',
    forma_pagamento: normalizarFormaPagamentoAssinatura(proposta.metodo_cobranca),
    data_contratacao: dataInicio,
    data_primeiro_vencimento: primeiroVenc,
    status: normalizarStatusAssinatura('ativo'),
  };

  let assinatura: {
    id: string;
    codigo?: string;
    status?: string;
    plano_id?: string;
    valor_mensal_centavos?: number;
    dia_vencimento?: number;
    forma_pagamento?: string;
  } | null = null;
  let codigoContrato = '';
  let errAss: { message?: string } | null = null;

  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    codigoContrato = await gerarProximoCodigoContrato(proposta.empresa_id);
    const res = await supabase
      .from('assinaturas')
      .insert({ ...payloadContrato, codigo: codigoContrato })
      .select('id, codigo, status, plano_id, valor_mensal_centavos, dia_vencimento, forma_pagamento')
      .single();
    errAss = res.error;
    assinatura = res.data;
    if (!errAss && assinatura?.id) break;
    if (!/duplicate key|unique constraint|assinaturas.*codigo/i.test(errAss?.message || '')) break;
  }

  if (errAss || !assinatura?.id) {
    const msg = errAss?.message || '';
    const amigavel = mensagemErroSupabase(
      errAss,
      /duplicate key|unique constraint/i.test(msg)
        ? 'Número de contrato já em uso nesta unidade. Tente gerar de novo; se persistir, avise o suporte.'
        : 'Não foi possível criar o contrato.',
    );
    return { ok: false, error: amigavel, clienteId };
  }

  // Auditoria do contrato (timeline): garante que a tela de auditoria mostre o responsável real
  // e permite remover a linha sintética "Contrato criado" quando não há log anterior.
  await registrarAuditoriaCliente({
    empresa_id: proposta.empresa_id,
    cliente_id: clienteId,
    categoria: 'contrato',
    referencia_tipo: 'assinatura',
    referencia_id: assinatura.id,
    titulo: `Contrato criado: ${assinatura.codigo || assinatura.id.slice(0, 8)}`,
    descricao: `Plano vinculado ao cliente. Status: ${assinatura.status}.`,
    dados_novos: {
      status: assinatura.status,
      plano_id: assinatura.plano_id,
      valor_mensal_centavos: assinatura.valor_mensal_centavos,
      dia_vencimento: assinatura.dia_vencimento,
      forma_pagamento: assinatura.forma_pagamento,
    },
  });

  const dependentesCriados = await inserirDependentes(proposta, clienteId, assinatura.id);
  await auditarDependentesIncluidos(proposta, clienteId, codigoContrato, dependentesCriados);

  const qtdDepsProposta = parseDependentesDetalhesProposta(proposta.dependentes_detalhes).filter((d) =>
    (d.nome || '').trim(),
  ).length;
  if (qtdDepsProposta > 0 && dependentesCriados.length === 0) {
    return {
      ok: false,
      error:
        'Contrato criado, mas os dependentes da proposta não foram gravados. Tente «Gerar contrato» novamente ou inclua-os manualmente no cadastro do cliente.',
      clienteId,
      assinaturaId: assinatura.id,
      codigoContrato: assinatura.codigo,
      dependentesIncluidos: 0,
    };
  }

  const parcelasMigracao = await gerarParcelasContratoMigracao(assinatura.id, migracaoInput, {
    gerarLote: async (id, meses) => {
      const { data, error } = await supabase.rpc('fn_gerar_mensalidades', {
        p_assinatura_id: id,
        p_meses: meses,
      });
      if (error) throw error;
      return Number(data) || 0;
    },
    gerarHistorico: async (id, ateVencimento, dataPagamento, mesesFuturos = 12) => {
      const { data, error } = await supabase.rpc('fn_gerar_mensalidades_com_historico', {
        p_assinatura_id: id,
        p_ate_vencimento: ateVencimento.slice(0, 10),
        p_data_pagamento: (dataPagamento || dataHojeIsoLocal()).slice(0, 10),
        p_meses_futuros: mesesFuturos,
      });
      if (error) return { pagas: 0, futuras: 0, total: 0, error: error.message };
      const row = data as { pagas?: number; futuras?: number; total?: number } | null;
      return {
        pagas: Number(row?.pagas) || 0,
        futuras: Number(row?.futuras) || 0,
        total: Number(row?.total) || 0,
      };
    },
  });
  if (parcelasMigracao.detalhe?.includes('duplicate key') || parcelasMigracao.detalhe?.includes('Falha')) {
    console.warn('[gerarContratoDesdeProposta] mensalidades:', parcelasMigracao.detalhe);
  }

  await aplicarCarteiraConformeMetodoContrato(
    proposta.empresa_id,
    clienteId,
    proposta.metodo_cobranca,
  );

  if ((proposta.metodo_cobranca || '').toLowerCase() === 'cobrador') {
    const endResProposta = enderecoPropostaPartesFromRow(proposta);
    const bairroCob = bairroCobrancaCliente({
      usaEnderecoResidencialCobranca: proposta.cobrador_endereco_mesmo_residencial,
      enderecoBairro: endResProposta.bairro,
      enderecoCobBairro: proposta.cobrador_endereco_bairro,
    });
    const sugerido = await buscarCobradorSugeridoPorBairro([proposta.empresa_id], bairroCob);
    if (sugerido) {
      await atribuirCobradorCarteiraCliente(proposta.empresa_id, clienteId, sugerido.id);
      await supabase
        .from('clientes')
        .update({ cobrador_id: sugerido.id })
        .eq('id', clienteId);
    }
  }

  const agora = new Date().toISOString();
  const { error: errUpd } = await supabase
    .from('propostas_venda')
    .update({
      status: PROPOSTA_STATUS.CONTRATO_GERADO,
      cliente_id: clienteId,
      assinatura_id: assinatura.id,
      cobranca_confirmada: true,
      contrato_gerado_em: agora,
    })
    .eq('id', proposta.id);

  if (errUpd) {
    return {
      ok: false,
      error: `Contrato ${codigoContrato} criado, mas falhou ao atualizar a proposta: ${errUpd.message}`,
      clienteId,
      assinaturaId: assinatura.id,
      codigoContrato: assinatura.codigo,
    };
  }

  return {
    ok: true,
    clienteId,
    assinaturaId: assinatura.id,
    codigoContrato: assinatura.codigo,
    dependentesIncluidos: dependentesCriados.length,
  };
}

/** Repõe dependentes da proposta no contrato já existente (ex.: contrato gerado antes da correção). */
export async function sincronizarDependentesPropostaNoContrato(
  propostaId: string,
): Promise<GerarContratoPropostaResult> {
  const { data: raw, error: errLoad } = await supabase
    .from('propostas_venda')
    .select('*')
    .eq('id', propostaId)
    .maybeSingle();
  if (errLoad) return { ok: false, error: errLoad.message };
  if (!raw) return { ok: false, error: 'Proposta não encontrada.' };

  const proposta = raw as PropostaRow;
  if (!proposta.assinatura_id) {
    return { ok: false, error: 'Esta proposta ainda não tem contrato vinculado.' };
  }

  let clienteId = (proposta.cliente_id || '').trim();
  if (!clienteId) {
    const { data: assCli } = await supabase
      .from('assinaturas')
      .select('cliente_id, codigo')
      .eq('id', proposta.assinatura_id)
      .maybeSingle();
    clienteId = String(assCli?.cliente_id || '').trim();
  }

  if (!clienteId) {
    return { ok: false, error: 'Cliente do contrato não encontrado.' };
  }

  const { data: assCod } = await supabase
    .from('assinaturas')
    .select('codigo')
    .eq('id', proposta.assinatura_id)
    .maybeSingle();

  const dependentesCriados = await inserirDependentes(proposta, clienteId, proposta.assinatura_id);
  if (dependentesCriados.length > 0) {
    await auditarDependentesIncluidos(
      proposta,
      clienteId,
      assCod?.codigo || '',
      dependentesCriados,
    );
  }

  return {
    ok: true,
    clienteId,
    assinaturaId: proposta.assinatura_id,
    codigoContrato: assCod?.codigo || undefined,
    dependentesIncluidos: dependentesCriados.length,
  };
}

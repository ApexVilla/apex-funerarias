import { supabase } from './supabase';
import { carregarBeneficiariosDoContrato, filtrarBeneficiariosContrato } from './contratoAtendimentoService';
import { buildContratoCatalaoPadraoPdfBlob } from './ContratoCatalaoPadraoService';
import { buildContratoFenixPdfBlob } from './ContratoFenixService';
import { buildContratoOnixPdfBlob } from './ContratoOnixService';
import { clienteEhVendedorEscritorio } from './vendedoresDisponiveis';
import { printPdfBlob } from './printPdfBlob';
import { nomePlanoParaExibicao } from './planoNomeExibicao';
import type { AssinaturaSB, BeneficiarioSB, ClienteSB } from './ClienteStore';
import { dataHojeIsoLocal, formatarDataIsoPtBr, normalizarDataIso } from './contratoDatas';
import { buscarUltimaAssinaturaDigitalContrato } from './contratoAssinaturaDigitalPdf';
import { carregarContratoEmpresaJuridica } from './contratoEmpresaJuridica';
import { labelParentescoDependente } from './parentescoDependente';

export { nomePlanoParaExibicao } from './planoNomeExibicao';

export type TipoPlanoContrato = 'fenix' | 'onix' | 'catalao_padrao' | 'outro';

/** Nome do titular/dependente no contrato impresso (padrão: MAIÚSCULAS). */
export function formatarNomeContrato(nome?: string | null): string {
  return (nome || '').trim().toLocaleUpperCase('pt-BR');
}

const VENDEDOR_CONTRATO_PADRAO = 'FÊNIX FUNERÁRIA';

/** IDs candidatos a vendedor (contrato → cliente). */
export function idsVendedorContrato(
  assinatura?: Pick<AssinaturaSB, 'vendedor_id'> | null,
  cliente?: Pick<ClienteSB, 'vendedor_id' | 'criado_por_user_id'> | null,
): string[] {
  const ids = [
    assinatura?.vendedor_id,
    cliente?.vendedor_id,
    cliente?.criado_por_user_id,
  ].filter((id): id is string => !!id?.trim());
  return [...new Set(ids)];
}

/** Nome do vendedor para o PDF (maiúsculas; fallback empresa). */
export async function buscarNomeVendedorContrato(
  assinatura?: Pick<AssinaturaSB, 'vendedor_id'> | null,
  cliente?: Pick<ClienteSB, 'vendedor_id' | 'criado_por_user_id' | 'tipo_vendedor'> | null,
): Promise<string> {
  if (clienteEhVendedorEscritorio(cliente?.vendedor_id, cliente?.tipo_vendedor)) {
    return 'ESCRITÓRIO';
  }
  for (const userId of idsVendedorContrato(assinatura, cliente)) {
    const { data: vendedor } = await supabase
      .from('users')
      .select('nome')
      .eq('id', userId)
      .maybeSingle();
    if (vendedor?.nome?.trim()) {
      return formatarNomeContrato(vendedor.nome);
    }
  }
  return VENDEDOR_CONTRATO_PADRAO;
}

export interface PlanoContratoResolvido {
  tipo: TipoPlanoContrato;
  /** Rótulo exibido na tela e no PDF (ex.: Plano FÊNIX, Plano ONIX) */
  label: string;
  /** Sigla curta para badges */
  sigla: string;
}

function maiusculasContrato(valor?: string | null): string {
  return (valor || '').trim().toLocaleUpperCase('pt-BR');
}

/** Endereço do titular no contrato impresso (padrão: MAIÚSCULAS). */
export function formatClienteEndereco(
  c: Pick<
    ClienteSB,
    | 'endereco_logradouro'
    | 'endereco_numero'
    | 'endereco_complemento'
    | 'endereco_bairro'
    | 'endereco_cidade'
    | 'endereco_estado'
    | 'endereco_cep'
  >,
): string {
  const linha1 = [c.endereco_logradouro, c.endereco_numero]
    .map((p) => maiusculasContrato(p))
    .filter(Boolean)
    .join(', ');
  const partes = [
    linha1,
    maiusculasContrato(c.endereco_complemento),
    maiusculasContrato(c.endereco_bairro),
    [c.endereco_cidade, c.endereco_estado]
      .map((p) => maiusculasContrato(p))
      .filter(Boolean)
      .join('/'),
    c.endereco_cep ? `CEP ${String(c.endereco_cep).replace(/\D/g, '')}` : '',
  ].filter(Boolean);
  return partes.join(' - ') || '—';
}

/** Tipo/sigla do plano (badge PDF); o rótulo exibido usa o nome real do banco quando disponível. */
export function resolvePlanoContrato(opts: {
  planoNome?: string | null;
  planoCodigo?: string | null;
  valorMensalCentavos?: number | null;
}): PlanoContratoResolvido {
  const nomeRaw = (opts.planoNome || '').trim();
  const nome = nomeRaw.toLowerCase();
  const codigo = (opts.planoCodigo || '').toLowerCase();
  const valor = opts.valorMensalCentavos ?? 0;

  const pareceCatalaoPadrao =
    /catal[aã]o\s*padr[aã]o|catalao\s*padrao/.test(nome) ||
    /catalao.*padrao|catalão.*padrão/.test(codigo);

  const pareceOnix =
    /onix|ônix/.test(nome) ||
    /onix|ônix/.test(codigo) ||
    (!nomeRaw && valor === 6800);

  const pareceFenix =
    !pareceCatalaoPadrao &&
    (/f[eê]nix/.test(nome) ||
      /f[eê]nix/.test(codigo) ||
      (!nomeRaw && valor === 5300));

  const label = nomePlanoParaExibicao(nomeRaw, valor, opts.planoCodigo);

  if (pareceCatalaoPadrao) {
    return { tipo: 'catalao_padrao', label, sigla: 'CAT-PAD' };
  }
  if (pareceOnix && !pareceFenix) {
    return { tipo: 'onix', label, sigla: 'ONIX' };
  }
  if (pareceFenix && !pareceOnix) {
    return { tipo: 'fenix', label, sigla: 'FÊNIX' };
  }
  if (pareceOnix) {
    return { tipo: 'onix', label, sigla: 'ONIX' };
  }
  if (pareceFenix) {
    return { tipo: 'fenix', label, sigla: 'FÊNIX' };
  }
  if (nomeRaw) {
    return { tipo: 'outro', label, sigla: nomeRaw.length > 12 ? nomeRaw.slice(0, 12) : nomeRaw };
  }
  return { tipo: 'fenix', label, sigla: 'FÊNIX' };
}

export function resolvePlanoContratoAssinatura(assinatura: AssinaturaSB): PlanoContratoResolvido {
  return resolvePlanoContrato({
    planoNome: assinatura.plano_nome,
    planoCodigo: assinatura.plano_codigo,
    valorMensalCentavos: assinatura.valor_mensal_centavos,
  });
}

export async function buildContratoPdfFromDados(
  cliente: ClienteSB,
  assinatura: AssinaturaSB,
  beneficiarios: BeneficiarioSB[],
  vendedorNome = VENDEDOR_CONTRATO_PADRAO,
): Promise<{ blob: Blob; filename: string; plano: PlanoContratoResolvido }> {
  const plano = resolvePlanoContratoAssinatura(assinatura);
  const deps = filtrarBeneficiariosContrato(beneficiarios).map(
    (b) =>
      `${formatarNomeContrato(b.nome)}${b.parentesco ? ` (${labelParentescoDependente(b.parentesco, 'completo', b.sexo, b.nome)})` : ''}`,
  );

  const beneficiariosAtivos = filtrarBeneficiariosContrato(beneficiarios);
  const assinaturaDigital = await buscarUltimaAssinaturaDigitalContrato(assinatura.id);
  const empresaId = assinatura.empresa_id || cliente.empresa_id;
  const empresaJuridica = empresaId
    ? await carregarContratoEmpresaJuridica(empresaId)
    : undefined;

  const payload = {
    numeroContrato: assinatura.codigo || assinatura.id.slice(0, 8).toUpperCase(),
    nomePlano: plano.label.toUpperCase(),
    titularNome: formatarNomeContrato(cliente.nome),
    titularCpf: cliente.cpf || '',
    titularRg: cliente.rg,
    titularEndereco: formatClienteEndereco(cliente),
    vendedorNome: formatarNomeContrato(vendedorNome || VENDEDOR_CONTRATO_PADRAO),
    dataContrato: formatarDataIsoPtBr(
      normalizarDataIso(assinatura.data_contratacao) ||
        normalizarDataIso(assinatura.created_at) ||
        dataHojeIsoLocal(),
    ),
    dependentes: deps.length ? deps : ['—'],
    dependentesDetalhados: beneficiariosAtivos.map((b) => ({
        nome: formatarNomeContrato(b.nome),
        parentesco: labelParentescoDependente(b.parentesco, 'completo', b.sexo, b.nome) || 'Outro',
        cpf: b.cpf || '',
        rg: b.rg_numero || '',
        dataNascimento: b.data_nascimento
          ? b.data_nascimento.split('T')[0].split('-').reverse().join('/')
          : '',
      })),
    assinaturaDigital,
    empresaJuridica,
  };

  const blob =
    plano.tipo === 'onix'
      ? await buildContratoOnixPdfBlob(payload)
      : plano.tipo === 'catalao_padrao'
        ? await buildContratoCatalaoPadraoPdfBlob(payload)
        : await buildContratoFenixPdfBlob(payload);
  const prefix =
    plano.tipo === 'onix'
      ? 'Contrato-Onix'
      : plano.tipo === 'catalao_padrao'
        ? 'Contrato-Catalao-Padrao'
        : 'Contrato-Fenix';
  return { blob, filename: `${prefix}-${payload.numeroContrato}.pdf`, plano };
}

export async function imprimirContratoLocal(
  cliente: ClienteSB,
  assinatura: AssinaturaSB,
  beneficiarios: BeneficiarioSB[],
  vendedorNome?: string,
) {
  const { blob } = await buildContratoPdfFromDados(cliente, assinatura, beneficiarios, vendedorNome);
  printPdfBlob(blob, 'Contrato');
}

export async function imprimirContratoAssinatura(
  assinaturaId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: assinatura, error: errA } = await supabase
      .from('assinaturas')
      .select('*')
      .eq('id', assinaturaId)
      .is('deleted_at', null)
      .maybeSingle();

    if (errA || !assinatura) {
      return { ok: false, error: 'Contrato não encontrado.' };
    }

    let planoNome = '';
    let planoCodigo = '';
    if (assinatura.plano_id) {
      const { data: plano } = await supabase
        .from('planos')
        .select('nome, codigo, valor_mensal_centavos')
        .eq('id', assinatura.plano_id)
        .maybeSingle();
      if (plano) {
        planoNome = nomePlanoParaExibicao(
          plano.nome,
          plano.valor_mensal_centavos,
          plano.codigo,
        );
        planoCodigo = plano.codigo || '';
      }
    }

    const { data: cliente, error: errC } = await supabase
      .from('view_clientes_completo')
      .select('*')
      .eq('id', assinatura.cliente_id)
      .maybeSingle();

    if (errC || !cliente) {
      return { ok: false, error: 'Cliente não encontrado para este contrato.' };
    }

    const beneficiarios = await carregarBeneficiariosDoContrato(
      assinatura.cliente_id,
      assinatura.id,
    );

    const vendedorNome = await buscarNomeVendedorContrato(
      assinatura,
      cliente as ClienteSB,
    );

    const assinaturaComPlano = {
      ...assinatura,
      plano_nome: planoNome,
      plano_codigo: planoCodigo,
    } as AssinaturaSB & { plano_codigo?: string };

    await imprimirContratoLocal(
      cliente as ClienteSB,
      assinaturaComPlano,
      beneficiarios,
      vendedorNome,
    );
    return { ok: true };
  } catch (e) {
    console.error('[imprimirContratoAssinatura]', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao gerar o contrato para impressão.' };
  }
}

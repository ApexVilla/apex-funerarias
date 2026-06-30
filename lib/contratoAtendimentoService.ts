import { supabase } from './supabase';
import {
  buildContratoPdfFromDados,
  buscarNomeVendedorContrato,
  resolvePlanoContrato,
  type TipoPlanoContrato,
} from './ContratoAssinaturaService';
import type { AssinaturaSB, BeneficiarioSB, ClienteSB } from './ClienteStore';
import { beneficiarioEstaFalecido } from './beneficiarioFalecimento';

export function filtrarBeneficiariosContrato(beneficiarios: BeneficiarioSB[]): BeneficiarioSB[] {
  return (beneficiarios || []).filter((b) => {
    if ((b as any).deleted_at) return false;
    if (beneficiarioEstaFalecido(b)) return false;
    const status = String(b.status || 'ativo').toLowerCase();
    if (status !== 'ativo') return false;
    if (b.ativo === false) return false;
    return !!(b.nome || '').trim();
  });
}

/** Beneficiários vinculados a um contrato (com fallback por cliente). */
export async function carregarBeneficiariosDoContrato(
  clienteId: string,
  assinaturaId?: string | null,
): Promise<BeneficiarioSB[]> {
  if (assinaturaId) {
    const { data: porContrato } = await supabase
      .from('beneficiarios')
      .select('*')
      .eq('assinatura_id', assinaturaId)
      .is('deleted_at', null)
      .order('nome', { ascending: true });
    const filtrados = filtrarBeneficiariosContrato((porContrato || []) as BeneficiarioSB[]);
    if (filtrados.length > 0) return filtrados;
  }

  const { data: porCliente } = await supabase
    .from('beneficiarios')
    .select('*')
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('nome', { ascending: true });

  return filtrarBeneficiariosContrato((porCliente || []) as BeneficiarioSB[]);
}

export async function carregarDadosContratoCliente(clienteId: string) {
  const { data: cliente, error: errC } = await supabase
    .from('view_clientes_completo')
    .select('*')
    .eq('id', clienteId)
    .maybeSingle();

  if (errC || !cliente) {
    return { ok: false as const, error: 'Cliente não encontrado.' };
  }

  const { data: assinatura } = await supabase
    .from('assinaturas')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('status', 'ativo')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .maybeSingle();

  let planoNome = '';
  let planoCodigo = '';
  let valorMensalCentavos: number | null = null;

  if (assinatura?.plano_id) {
    const { data: plano } = await supabase
      .from('planos')
      .select('nome, codigo, valor_mensal_centavos')
      .eq('id', assinatura.plano_id)
      .maybeSingle();
    if (plano) {
      planoNome = plano.nome || '';
      planoCodigo = plano.codigo || '';
      valorMensalCentavos = plano.valor_mensal_centavos ?? null;
    }
  }

  const beneficiarios = await carregarBeneficiariosDoContrato(clienteId, assinatura?.id);

  const vendedorNome = await buscarNomeVendedorContrato(
    assinatura,
    cliente as ClienteSB,
  );

  const assinaturaComPlano = assinatura
    ? ({
        ...assinatura,
        plano_nome: planoNome,
        plano_codigo: planoCodigo,
        valor_mensal_centavos: valorMensalCentavos ?? assinatura.valor_mensal_centavos,
      } as AssinaturaSB & { plano_codigo?: string })
    : null;

  return {
    ok: true as const,
    cliente: cliente as ClienteSB,
    assinatura: assinaturaComPlano,
    beneficiarios,
    vendedorNome,
    planoResolvido: resolvePlanoContrato({
      planoNome,
      planoCodigo,
      valorMensalCentavos,
    }),
  };
}

export async function gerarContratoPdfPorAtendimento(
  atendimentoId: string,
  tipoForcado?: TipoPlanoContrato,
): Promise<{ blob: Blob; filename: string } | null> {
  const { data: atendimento, error } = await supabase
    .from('ser_atendimentos')
    .select('id, codigo, data_servico, cliente_id')
    .eq('id', atendimentoId)
    .maybeSingle();

  if (error || !atendimento?.cliente_id) return null;

  const dados = await carregarDadosContratoCliente(atendimento.cliente_id);
  if (!dados.ok) return null;

  const { cliente, assinatura, beneficiarios, vendedorNome, planoResolvido } = dados;

  const assinaturaPdf: AssinaturaSB = assinatura || {
    id: atendimento.id,
    codigo: atendimento.codigo || atendimento.id.slice(0, 8).toUpperCase(),
    cliente_id: atendimento.cliente_id,
    data_contratacao: atendimento.data_servico,
    created_at: atendimento.data_servico,
    plano_nome: tipoForcado === 'onix' ? 'Plano ONIX' : 'Plano FÊNIX',
    plano_codigo: tipoForcado || planoResolvido.tipo,
    valor_mensal_centavos: tipoForcado === 'onix' ? 6800 : 5300,
    status: 'ativo',
  } as AssinaturaSB;

  if (tipoForcado) {
    assinaturaPdf.plano_nome = tipoForcado === 'onix' ? 'Plano ONIX' : 'Plano FÊNIX';
    assinaturaPdf.plano_codigo = tipoForcado;
    (assinaturaPdf as any).valor_mensal_centavos = tipoForcado === 'onix' ? 6800 : 5300;
  }

  const { blob, filename } = await buildContratoPdfFromDados(
    cliente,
    assinaturaPdf,
    beneficiarios,
    vendedorNome,
  );

  const prefix =
    (tipoForcado || planoResolvido.tipo) === 'onix' ? 'Contrato-Onix' : 'Contrato-Fenix';
  const numero = assinaturaPdf.codigo || atendimento.codigo || 'sem-codigo';

  return { blob, filename: `${prefix}-${numero}.pdf` };
}

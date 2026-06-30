import { supabase } from './supabase';
import { buscarRecebimentoCampo } from './cobRecebimentosSupabase';
import {
  imprimirReciboBaixaCobrador,
  labelFormaPagamentoRecibo,
  type ModoReciboBaixaCobrador,
} from './ReciboTermicoService';

export async function montarInputReciboRecebimentoCampo(
  recebimentoId: string,
  empresaIds: string[],
): Promise<Parameters<typeof imprimirReciboBaixaCobrador>[0] | null> {
  const rec = await buscarRecebimentoCampo(recebimentoId, empresaIds);
  if (!rec) return null;

  let parcelaNumero = 1;
  let totalParcelas: number | undefined;
  let dataVencimento = rec.data;
  let planoNome = '';
  let parcelaCodigo = '';

  if (rec.cobranca_pendente_id) {
    const { data: pend } = await supabase
      .from('cob_cobrancas_pendentes')
      .select(
        `
        fin_contas_receber (
          codigo, parcela_numero, total_parcelas, data_vencimento, descricao,
          assinaturas ( codigo, planos ( nome ) )
        )
      `,
      )
      .eq('id', rec.cobranca_pendente_id)
      .maybeSingle();
    const fr = pend?.fin_contas_receber as Record<string, unknown> | Record<string, unknown>[] | null;
    const conta = Array.isArray(fr) ? fr[0] : fr;
    if (conta) {
      parcelaNumero = Number(conta.parcela_numero || 1) || 1;
      totalParcelas = Number(conta.total_parcelas) || undefined;
      dataVencimento = String(conta.data_vencimento || rec.data).slice(0, 10);
      parcelaCodigo = String(conta.codigo || '');
      const ass = conta.assinaturas as { planos?: { nome?: string } | { nome?: string }[] } | null;
      const plano = Array.isArray(ass?.planos) ? ass?.planos[0] : ass?.planos;
      planoNome = String(plano?.nome || '');
    }
  } else if (rec.conta_receber_id) {
    const { data: cr } = await supabase
      .from('fin_contas_receber')
      .select(
        'codigo, parcela_numero, total_parcelas, data_vencimento, descricao, assinaturas ( planos ( nome ) )',
      )
      .eq('id', rec.conta_receber_id)
      .maybeSingle();
    if (cr) {
      parcelaNumero = Number(cr.parcela_numero || 1) || 1;
      totalParcelas = Number(cr.total_parcelas) || undefined;
      dataVencimento = String(cr.data_vencimento || rec.data).slice(0, 10);
      parcelaCodigo = String(cr.codigo || '');
      const ass = cr.assinaturas as { planos?: { nome?: string } } | null;
      planoNome = String(ass?.planos?.nome || '');
    }
  }

  return {
    clienteId: rec.cliente_id,
    clienteNome: rec.cliente_nome,
    nomeCobrador: rec.cobrador_nome,
    parcelas: [
      {
        parcela_numero: parcelaNumero,
        total_parcelas: totalParcelas,
        data_vencimento: dataVencimento,
        valorCentavos: rec.valor_centavos,
        descricao: planoNome || 'MENSALIDADE',
        codigo: parcelaCodigo || undefined,
      },
    ],
    totalCentavos: rec.valor_centavos,
    formaPagamento: labelFormaPagamentoRecibo(rec.forma_pagamento),
    planoNome: planoNome || undefined,
    parcelaCodigo: parcelaCodigo || undefined,
    dataVencimento,
    modo: 'termica' as ModoReciboBaixaCobrador,
  };
}

export async function reimprimirReciboRecebimentoCampo(
  recebimentoId: string,
  empresaIds: string[],
  modo: ModoReciboBaixaCobrador = 'termica',
  janelaPdf?: Window | null,
): Promise<'bluetooth' | 'pdf' | 'navegador'> {
  const input = await montarInputReciboRecebimentoCampo(recebimentoId, empresaIds);
  if (!input) throw new Error('Recebimento não encontrado.');
  return imprimirReciboBaixaCobrador({ ...input, modo, janelaPdf });
}

/** Reimprime um ou vários recebimentos de campo no mesmo comprovante térmico. */
export async function reimprimirRecibosRecebimentosCampo(
  recebimentoIds: string[],
  empresaIds: string[],
  modo: ModoReciboBaixaCobrador = 'termica',
  janelaPdf?: Window | null,
): Promise<'bluetooth' | 'pdf' | 'navegador'> {
  const ids = [...new Set(recebimentoIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error('Selecione ao menos um recebimento.');

  if (ids.length === 1) {
    return reimprimirReciboRecebimentoCampo(ids[0], empresaIds, modo, janelaPdf);
  }

  const inputs = (
    await Promise.all(ids.map((id) => montarInputReciboRecebimentoCampo(id, empresaIds)))
  ).filter((x): x is NonNullable<typeof x> => x != null);

  if (inputs.length === 0) throw new Error('Nenhum recebimento encontrado para reimprimir.');

  const clienteId = inputs[0].clienteId;
  if (!inputs.every((i) => i.clienteId === clienteId)) {
    throw new Error('Selecione recebimentos do mesmo cliente.');
  }

  const formas = new Set(inputs.map((i) => i.formaPagamento).filter(Boolean));
  const formaPagamento =
    formas.size === 1 ? [...formas][0] : 'PAGAMENTO';

  const parcelas = inputs.flatMap((i) => i.parcelas);
  const totalCentavos = inputs.reduce((s, i) => s + i.totalCentavos, 0);
  const parcelaCodigo = inputs
    .map((i) => i.parcelaCodigo)
    .filter(Boolean)
    .join(', ');

  return imprimirReciboBaixaCobrador({
    ...inputs[0],
    parcelas,
    totalCentavos,
    formaPagamento,
    parcelaCodigo: parcelaCodigo || inputs[0].parcelaCodigo,
    dataVencimento: inputs[0].dataVencimento,
    modo,
    janelaPdf,
  });
}

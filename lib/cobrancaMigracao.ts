import { supabase } from './supabase';
import {
  calcularPrimeiroVencimento30DiasApos,
  dataHojeIsoLocal,
  normalizarDataIso,
} from './contratoDatas';

const STATUS_EXCLUIVEIS = ['aberto', 'vencido', 'pendente'] as const;

export type ReiniciarCobrancaMigracaoResult = {
  parcelasExcluidas: number;
  parcelasGeradas: number;
  primeiroVencimento: string;
};

/**
 * Cliente transferido de outra funerária: mantém data_contratacao histórica,
 * exclui parcelas em aberto anteriores à cobrança na Fênix e gera novas a partir de hoje.
 */
export async function reiniciarCobrancaMigracaoAssinatura(
  assinaturaId: string,
  gerarLote: (id: string, meses: number) => Promise<number>,
  options?: {
    dataInicioCobranca?: string;
    mesesFuturos?: number;
  },
): Promise<ReiniciarCobrancaMigracaoResult> {
  const { data: assinatura, error: assErr } = await supabase
    .from('assinaturas')
    .select('id, dia_vencimento, data_contratacao, data_primeiro_vencimento, cliente_id')
    .eq('id', assinaturaId)
    .is('deleted_at', null)
    .maybeSingle();

  if (assErr) throw assErr;
  if (!assinatura) throw new Error('Contrato não encontrado.');

  const dataInicioCobranca =
    normalizarDataIso(options?.dataInicioCobranca) || dataHojeIsoLocal();
  const diaVenc = Math.max(1, Math.min(31, Number(assinatura.dia_vencimento) || 5));
  const primeiroVencimento = calcularPrimeiroVencimento30DiasApos(dataInicioCobranca);

  const { data: parcelas, error: parcErr } = await supabase
    .from('fin_contas_receber')
    .select('id, status, valor_pago_centavos, data_vencimento')
    .eq('assinatura_id', assinaturaId)
    .is('deleted_at', null)
    .in('status', [...STATUS_EXCLUIVEIS]);

  if (parcErr) throw parcErr;

  const agora = new Date().toISOString();
  let parcelasExcluidas = 0;

  for (const p of parcelas || []) {
    if ((p.valor_pago_centavos ?? 0) > 0) continue;
    const { error: delErr } = await supabase
      .from('fin_contas_receber')
      .update({ deleted_at: agora, updated_at: agora })
      .eq('id', p.id)
      .is('deleted_at', null);
    if (delErr) throw delErr;
    parcelasExcluidas += 1;
  }

  const { error: updErr } = await supabase
    .from('assinaturas')
    .update({
      data_primeiro_vencimento: primeiroVencimento,
      updated_at: agora,
    })
    .eq('id', assinaturaId);
  if (updErr) throw updErr;

  if (assinatura.cliente_id) {
    await supabase
      .from('clientes')
      .update({ origem_canal: 'migracao', updated_at: agora })
      .eq('id', assinatura.cliente_id);
  }

  const parcelasGeradas = await gerarLote(assinaturaId, options?.mesesFuturos ?? 12);

  return { parcelasExcluidas, parcelasGeradas, primeiroVencimento };
}

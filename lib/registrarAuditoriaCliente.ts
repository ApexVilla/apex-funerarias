import { supabase } from './supabase';
import { resolveCurrentUserId } from './authUserId';

export type RegistrarAuditoriaClienteParams = {
  empresa_id: string;
  cliente_id: string;
  titulo: string;
  descricao?: string;
  categoria: 'contrato' | 'beneficiario' | 'parcela';
  referencia_tipo?: string;
  referencia_id?: string;
  dados_anteriores?: Record<string, unknown>;
  dados_novos?: Record<string, unknown>;
};

/** Grava evento na timeline do cliente (auditoria). */
export async function registrarAuditoriaCliente(
  params: RegistrarAuditoriaClienteParams,
): Promise<void> {
  const userId = await resolveCurrentUserId();
  const { error } = await supabase.from('timeline_clientes').insert({
    empresa_id: params.empresa_id,
    cliente_id: params.cliente_id,
    tipo_evento: 'AUDITORIA',
    categoria: params.categoria,
    titulo: params.titulo,
    descricao: params.descricao ?? null,
    referencia_tipo: params.referencia_tipo ?? params.categoria,
    referencia_id: params.referencia_id ?? null,
    dados_anteriores: params.dados_anteriores ?? null,
    dados_novos: params.dados_novos ?? null,
    criado_por: userId,
    data_evento: new Date().toISOString(),
  });
  if (error) console.warn('[registrarAuditoriaCliente]', error.message);
}

export async function registrarAuditoriaParcela(
  contaReceberId: string,
  titulo: string,
  descricao: string,
  extras?: { dados_anteriores?: Record<string, unknown>; dados_novos?: Record<string, unknown> },
): Promise<void> {
  const { data: conta, error } = await supabase
    .from('fin_contas_receber')
    .select(
      'id, codigo, cliente_id, empresa_id, assinatura_id, parcela_numero, total_parcelas, data_vencimento, status, valor_pago_centavos',
    )
    .eq('id', contaReceberId)
    .maybeSingle();
  if (error || !conta?.cliente_id || !conta.empresa_id) return;

  await registrarAuditoriaCliente({
    empresa_id: conta.empresa_id,
    cliente_id: conta.cliente_id,
    categoria: 'parcela',
    referencia_tipo: 'conta_receber',
    referencia_id: conta.id,
    titulo,
    descricao,
    dados_anteriores: extras?.dados_anteriores,
    dados_novos: {
      assinatura_id: conta.assinatura_id,
      codigo: conta.codigo,
      parcela_numero: conta.parcela_numero,
      total_parcelas: conta.total_parcelas,
      data_vencimento: conta.data_vencimento,
      status: conta.status,
      ...extras?.dados_novos,
    },
  });
}

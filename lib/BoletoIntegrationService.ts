import { supabase } from './supabase';

export type BoletoIntegracaoStatus =
  | 'pendente_envio'
  | 'emitido'
  | 'erro_emissao'
  | 'cancelado'
  | 'baixado';

export interface BoletoIntegracaoRow {
  id: string;
  empresa_id: string;
  assinatura_id: string;
  mensalidade_id: string;
  provedor: string;
  status: BoletoIntegracaoStatus;
  valor_centavos: number;
  vencimento: string;
  linha_digitavel: string | null;
  codigo_barras: string | null;
  url_boleto: string | null;
  url_pdf: string | null;
  nosso_numero: string | null;
  mensagem_erro: string | null;
  payload_envio: Record<string, unknown> | null;
  payload_retorno: Record<string, unknown> | null;
  solicitado_em: string;
  emitido_em: string | null;
}

type SolicitarBoletoParams = {
  empresaId: string;
  assinaturaId: string;
  mensalidadeId: string;
  valorCentavos: number;
  vencimento: string;
  provedor?: string;
  payloadEnvio?: Record<string, unknown>;
};

export async function listarBoletosPorAssinatura(
  assinaturaId: string,
): Promise<BoletoIntegracaoRow[]> {
  const { data, error } = await supabase
    .from('fin_boletos_integracao')
    .select('*')
    .eq('assinatura_id', assinaturaId)
    .order('vencimento', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as BoletoIntegracaoRow[];
}

export async function solicitarEmissaoBoleto(
  params: SolicitarBoletoParams,
): Promise<BoletoIntegracaoRow> {
  const { data, error } = await supabase
    .from('fin_boletos_integracao')
    .insert({
      empresa_id: params.empresaId,
      assinatura_id: params.assinaturaId,
      mensalidade_id: params.mensalidadeId,
      valor_centavos: params.valorCentavos,
      vencimento: params.vencimento,
      provedor: params.provedor || 'gateway_pendente',
      status: 'pendente_envio',
      payload_envio: params.payloadEnvio || {},
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as BoletoIntegracaoRow;
}

type DispararBoletoEdgePayload = {
  boletoIntegracaoId: string;
  mensalidadeId: string;
  assinaturaId: string;
  cliente: {
    nome: string;
    documento: string;
    email?: string | null;
    telefone?: string | null;
  };
  cobranca: {
    valorCentavos: number;
    vencimento: string;
    descricao?: string | null;
  };
};

export async function dispararEmissaoBoletoEdge(payload: DispararBoletoEdgePayload) {
  const { data, error } = await supabase.functions.invoke('fin-emitir-boleto', {
    body: {
      boleto_integracao_id: payload.boletoIntegracaoId,
      mensalidade_id: payload.mensalidadeId,
      assinatura_id: payload.assinaturaId,
      cliente: payload.cliente,
      cobranca: {
        valor_centavos: payload.cobranca.valorCentavos,
        vencimento: payload.cobranca.vencimento,
        descricao: payload.cobranca.descricao || null,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

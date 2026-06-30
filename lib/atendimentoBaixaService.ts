import { supabase } from './supabase';
import { normalizarFormaPagamento } from './caixaFormaPagamento';
import {
  contaExigeSessaoCaixa,
  garantirCaixaAbertoParaData,
} from './finCaixaAutoAbertura';

export type PagamentoAtendimento = { forma: string; valor_centavos: number };

export type AtendimentoBaixaRow = {
  id: string;
  codigo: string;
  empresa_id: string;
  cliente_id: string;
  status: string;
  valor_total_centavos: number;
  valor_pago_centavos: number;
  os_aprovada?: boolean;
  baixa_registrada_em?: string | null;
  pagamentos_divididos?: PagamentoAtendimento[];
  representante_nome?: string | null;
  representante_contato?: string | null;
};

function extrairMensagem(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Erro desconhecido';
}

export async function buscarAtendimentoParaBaixa(id: string): Promise<AtendimentoBaixaRow | null> {
  const { data, error } = await supabase
    .from('ser_atendimentos')
    .select(
      'id, codigo, empresa_id, cliente_id, status, valor_total_centavos, valor_pago_centavos, os_aprovada, baixa_registrada_em, pagamentos_divididos, representante_nome, representante_contato',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as AtendimentoBaixaRow | null;
}

export async function atendimentoPossuiBaixaNoCaixa(atendimentoId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('fin_caixa_movimentos')
    .select('id', { count: 'exact', head: true })
    .eq('referencia_id', atendimentoId)
    .eq('referencia_tipo', 'ser_atendimento');
  if (error) throw error;
  return (count || 0) > 0;
}

export function atendimentoJaRecebido(atd: Pick<AtendimentoBaixaRow, 'status' | 'valor_pago_centavos' | 'valor_total_centavos' | 'baixa_registrada_em'>): boolean {
  if (atd.baixa_registrada_em) return true;
  return atd.status === 'concluido' && Number(atd.valor_pago_centavos || 0) >= Number(atd.valor_total_centavos || 0);
}

export async function aprovarOsAtendimento(
  atendimentoId: string,
  aprovadoPor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const atd = await buscarAtendimentoParaBaixa(atendimentoId);
    if (!atd) return { ok: false, error: 'Atendimento não encontrado.' };
    if (atd.status === 'cancelado') return { ok: false, error: 'Atendimento cancelado não pode ser aprovado.' };
    if (atd.os_aprovada) {
      return { ok: false, error: 'Esta ordem de serviço já foi aprovada e não pode ser aceita novamente.' };
    }

    const { data: atualizado, error } = await supabase
      .from('ser_atendimentos')
      .update({
        os_aprovada: true,
        os_aprovada_em: new Date().toISOString(),
        os_aprovada_por: aprovadoPor.trim() || null,
        status: atd.status === 'aguardando' ? 'em_andamento' : atd.status,
      })
      .eq('id', atendimentoId)
      .eq('os_aprovada', false)
      .neq('status', 'cancelado')
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!atualizado) {
      return { ok: false, error: 'Esta ordem de serviço já foi aprovada por outro usuário.' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: extrairMensagem(err) };
  }
}

export async function darBaixaAtendimento(params: {
  atendimentoId: string;
  empresaId: string;
  userId: string;
  contaBancariaId: string;
  dataPagamento: string;
  pagamentos: PagamentoAtendimento[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const atd = await buscarAtendimentoParaBaixa(params.atendimentoId);
    if (!atd) return { ok: false, error: 'Atendimento não encontrado.' };
    if (atd.status === 'cancelado') return { ok: false, error: 'Atendimento cancelado.' };
    if (!atd.os_aprovada) {
      return { ok: false, error: 'Aprove a ordem de serviço antes de registrar a baixa.' };
    }
    if (atendimentoJaRecebido(atd) || (await atendimentoPossuiBaixaNoCaixa(params.atendimentoId))) {
      return { ok: false, error: 'Este atendimento já possui baixa registrada no caixa.' };
    }

    const pagamentos = params.pagamentos.filter((p) => p.forma && Number(p.valor_centavos) > 0);
    if (pagamentos.length === 0) {
      return { ok: false, error: 'Informe ao menos uma forma de pagamento com valor.' };
    }

    const totalPagamentos = pagamentos.reduce((s, p) => s + Number(p.valor_centavos || 0), 0);
    const totalAtendimento = Number(atd.valor_total_centavos || 0);
    if (totalPagamentos !== totalAtendimento) {
      return {
        ok: false,
        error: `A soma das formas (${(totalPagamentos / 100).toFixed(2)}) deve ser igual ao total do atendimento (${(totalAtendimento / 100).toFixed(2)}).`,
      };
    }

    const dia = params.dataPagamento.slice(0, 10);
    const { data: conta } = await supabase
      .from('fin_contas_bancarias')
      .select('id, nome, tipo, empresa_id')
      .eq('id', params.contaBancariaId)
      .maybeSingle();
    if (!conta) return { ok: false, error: 'Conta/caixa não encontrada.' };

    if (!contaExigeSessaoCaixa(conta.tipo)) {
      return {
        ok: false,
        error: 'Selecione uma conta do tipo Caixa ou Corrente para registrar o recebimento.',
      };
    }

    const sessaoId = await garantirCaixaAbertoParaData({
        contaBancariaId: params.contaBancariaId,
        dataPagamento: dia,
        observacao: `Sessão retroativa — recebimento atendimento ${atd.codigo}`,
        usuarioId: params.userId,
    });
    if (!sessaoId) {
      return {
        ok: false,
        error: `Não foi possível preparar o caixa "${conta.nome}" para ${dia}. Verifique com o financeiro.`,
      };
    }

    const empresaId = params.empresaId || atd.empresa_id;
    const agora = new Date().toISOString();

    const movimentos = pagamentos.map((p) => ({
      empresa_id: empresaId,
      sessao_id: sessaoId,
      tipo: 'entrada' as const,
      descricao: `Recebimento atendimento ${atd.codigo}`,
      valor_centavos: Number(p.valor_centavos),
      forma_pagamento: normalizarFormaPagamento(p.forma) || 'especie',
      referencia_id: params.atendimentoId,
      referencia_tipo: 'ser_atendimento',
      usuario_id: params.userId || null,
      data_movimentacao: dia,
    }));

    const { error: movErr } = await supabase.from('fin_caixa_movimentos').insert(movimentos);
    if (movErr) throw movErr;

    const { error: updErr } = await supabase
      .from('ser_atendimentos')
      .update({
        status: 'concluido',
        valor_pago_centavos: totalPagamentos,
        pagamentos_divididos: pagamentos,
        baixa_registrada_em: agora,
      })
      .eq('id', params.atendimentoId);

    if (updErr) throw updErr;

    try {
      window.dispatchEvent(new CustomEvent('fin-caixa-updated'));
    } catch { /* ignore */ }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: extrairMensagem(err) };
  }
}

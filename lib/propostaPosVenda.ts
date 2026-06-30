import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizarStatusProposta,
  propostaAguardandoContrato,
  propostaEmPosVenda,
  PROPOSTA_STATUS,
} from './propostaStatus';

function erroColunasPosVendaAusentes(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('pos_venda_responsavel')
    || msg.includes('pos_venda_iniciado')
    || msg.includes('pos_venda_observacoes')
    || msg.includes('could not find')
  );
}

export type PropostaPosVendaCampos = {
  status?: string | null;
  pos_venda_responsavel_id?: string | null;
  pos_venda_iniciado_em?: string | null;
  pos_venda_observacoes?: string | null;
  contrato_gerado_em?: string | null;
};

function parseData(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Proposta liberada e ainda na fila (ninguém assumiu pós-venda). */
export function propostaDisponivelPosVenda(status?: string | null): boolean {
  return propostaAguardandoContrato(status);
}

/** Pode assumir: liberada para contrato e sem responsável em pós-venda. */
export function propostaPodeAssumirPosVenda(row: PropostaPosVendaCampos): boolean {
  return propostaDisponivelPosVenda(row.status);
}

export function propostaPodeLiberarPosVenda(
  row: PropostaPosVendaCampos,
  usuarioId?: string | null,
  podeVerTodas = false,
): boolean {
  if (!propostaEmPosVenda(row.status)) return false;
  const resp = (row.pos_venda_responsavel_id || '').trim();
  if (!resp) return podeVerTodas;
  if (podeVerTodas) return true;
  return Boolean(usuarioId && resp === usuarioId);
}

/** Tempo desde o início da pós-venda até agora ou até gerar o contrato. */
export function dataFimPosVenda(row: PropostaPosVendaCampos, agora = new Date()): Date {
  if (propostaEmPosVenda(row.status)) return agora;
  return parseData(row.contrato_gerado_em) || agora;
}

export function minutosEmPosVenda(
  row: PropostaPosVendaCampos,
  agora = new Date(),
): number | null {
  const inicio = parseData(row.pos_venda_iniciado_em);
  if (!inicio) return null;
  if (!propostaEmPosVenda(row.status) && !row.contrato_gerado_em) return null;
  const fim = dataFimPosVenda(row, agora);
  return Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / 60000));
}

/** Ex.: "45 min", "3h 20min", "2 dias". */
export function formatarTempoPosVenda(
  row: PropostaPosVendaCampos,
  agora = new Date(),
): string | null {
  const mins = minutosEmPosVenda(row, agora);
  if (mins == null) return null;
  if (mins < 60) return `${mins} min`;
  const horas = Math.floor(mins / 60);
  const restoMin = mins % 60;
  if (horas < 48) {
    return restoMin > 0 ? `${horas}h ${restoMin}min` : `${horas}h`;
  }
  const dias = Math.floor(horas / 24);
  const restoHoras = horas % 24;
  if (restoHoras > 0) return `${dias}d ${restoHoras}h`;
  return `${dias} dia${dias === 1 ? '' : 's'}`;
}

export function rotuloTempoPosVenda(status?: string | null): string {
  if (propostaEmPosVenda(status)) return 'tempo em pós-venda';
  return 'duração pós-venda';
}

export function isModoFilaPosVenda(searchParams: URLSearchParams): boolean {
  return searchParams.get('fila') === 'pos-venda';
}

export function isModoFilaContratoOuPosVenda(searchParams: URLSearchParams): boolean {
  const f = searchParams.get('fila');
  return f === 'contrato' || f === 'pos-venda';
}

export function payloadAssumirPosVenda(responsavelId: string) {
  return {
    status: PROPOSTA_STATUS.EM_POS_VENDA,
    pos_venda_responsavel_id: responsavelId,
    pos_venda_iniciado_em: new Date().toISOString(),
  };
}

export function payloadLiberarPosVenda() {
  return {
    status: PROPOSTA_STATUS.AGUARDANDO_CONTRATO,
    pos_venda_responsavel_id: null,
    pos_venda_iniciado_em: null,
  };
}

export type AssumirPosVendaResult =
  | { ok: true }
  | { ok: false; error: string; jaAssumida?: boolean; semPermissao?: boolean };

/** Assume pós-venda só se a proposta ainda está liberada (evita sobrescrever outro responsável). */
export async function assumirPosVendaProposta(
  client: SupabaseClient,
  propostaId: string,
  responsavelId: string,
): Promise<AssumirPosVendaResult> {
  const { data, error } = await client
    .from('propostas_venda')
    .update(payloadAssumirPosVenda(responsavelId))
    .eq('id', propostaId)
    .eq('status', PROPOSTA_STATUS.AGUARDANDO_CONTRATO)
    .select('id')
    .maybeSingle();

  if (error) {
    const msg = error.message || 'Não foi possível assumir a pós-venda.';
    if (error.code === '42501' || msg.toLowerCase().includes('permission')) {
      return { ok: false, error: 'Sem permissão para assumir pós-venda e gerar contrato.', semPermissao: true };
    }
    if (erroColunasPosVendaAusentes(msg)) {
      return {
        ok: false,
        error:
          'Campos de pós-venda não existem no banco. Aplique a migration 20260628120000_propostas_venda_pos_venda.sql.',
      };
    }
    return { ok: false, error: msg };
  }

  if (!data?.id) {
    return {
      ok: false,
      jaAssumida: true,
      error: 'Esta proposta já foi assumida por outro usuário ou não está mais na fila.',
    };
  }

  return { ok: true };
}

export type LiberarPosVendaResult = { ok: true } | { ok: false; error: string; naoEncontrada?: boolean };

export async function liberarPosVendaProposta(
  client: SupabaseClient,
  propostaId: string,
): Promise<LiberarPosVendaResult> {
  const { data, error } = await client
    .from('propostas_venda')
    .update(payloadLiberarPosVenda())
    .eq('id', propostaId)
    .eq('status', PROPOSTA_STATUS.EM_POS_VENDA)
    .select('id')
    .maybeSingle();

  if (error) {
    const msg = error.message || 'Não foi possível devolver à fila.';
    if (erroColunasPosVendaAusentes(msg)) {
      return {
        ok: false,
        error: 'Campos de pós-venda não existem no banco. Aplique a migration de pós-venda.',
      };
    }
    return { ok: false, error: msg };
  }

  if (!data?.id) {
    return {
      ok: false,
      naoEncontrada: true,
      error: 'Proposta não está mais em pós-venda ou já foi processada.',
    };
  }

  return { ok: true };
}

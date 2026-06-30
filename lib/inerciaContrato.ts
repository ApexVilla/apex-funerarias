import { supabase } from './supabase';

/** 20 anos e 10 meses sem óbito e sem uso do plano → inércia. */
export const INERCIA_MESES_SEM_EVENTO = 20 * 12 + 10;

export type InerciaContratoResumo = {
  emInercia: boolean;
  inerciaDesde: string | null;
  ultimoEventoEm: string | null;
  mesesSemEvento: number | null;
  mesesRestantesInercia: number | null;
};

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function calcularMesesEntreDatas(de: string | null | undefined, ate: Date = new Date()): number | null {
  const inicio = parseIsoDate(de);
  if (!inicio) return null;
  const fim = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate(), 12);
  let meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
  if (fim.getDate() < inicio.getDate()) meses -= 1;
  return Math.max(0, meses);
}

export function resumoInerciaContrato(params: {
  em_inercia?: boolean | null;
  inercia_desde?: string | null;
  inercia_ultimo_evento_em?: string | null;
  data_contratacao?: string | null;
  created_at?: string | null;
}): InerciaContratoResumo {
  const ultimoEvento =
    params.inercia_ultimo_evento_em?.slice(0, 10) ||
    params.data_contratacao?.slice(0, 10) ||
    params.created_at?.slice(0, 10) ||
    null;

  const mesesSemEvento = calcularMesesEntreDatas(ultimoEvento);
  const mesesRestantes =
    mesesSemEvento == null ? null : Math.max(0, INERCIA_MESES_SEM_EVENTO - mesesSemEvento);

  return {
    emInercia: !!params.em_inercia,
    inerciaDesde: params.inercia_desde?.slice(0, 10) || null,
    ultimoEventoEm: ultimoEvento,
    mesesSemEvento,
    mesesRestantesInercia: params.em_inercia ? null : mesesRestantes,
  };
}

export async function avaliarInerciaAssinatura(assinaturaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_avaliar_inercia_assinatura', {
    p_assinatura_id: assinaturaId,
  });
  if (error) throw error;
  return data === true;
}

export async function reativarContratoInercia(
  assinaturaId: string,
  motivo?: string,
): Promise<{ reativado: boolean }> {
  const { data, error } = await supabase.rpc('fn_reativar_assinatura_inercia', {
    p_assinatura_id: assinaturaId,
    p_motivo: motivo?.trim() || 'Reativação por alteração contratual',
  });
  if (error) throw error;
  const row = (data || {}) as { reativado?: boolean };
  return { reativado: row.reativado === true };
}

export async function atualizarUltimoEventoInercia(
  assinaturaId: string,
  dataEvento?: string,
): Promise<void> {
  const { error } = await supabase.rpc('fn_assinatura_atualizar_ultimo_evento_inercia', {
    p_assinatura_id: assinaturaId,
    p_data_evento: dataEvento?.slice(0, 10) || null,
  });
  if (error) throw error;
}

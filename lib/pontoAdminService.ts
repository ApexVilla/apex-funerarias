import { supabase } from './supabase';
import {
  type BatidaPonto,
  normalizarOrigemBatidaPonto,
  type TipoBatida,
  diaPosteriorLocal,
  intervaloDiaLocal,
  montarChaveStoragePonto,
  timestampFromDiaEHora,
} from './pontoUtils';
import { gravarBatidasLocal } from './pontoSyncService';
import type { PontoDiaOcorrencia, PontoDiaOcorrenciaTipo } from './pontoDiaOcorrencia';

export type HorariosAjusteDia = Partial<
  Record<'entrada' | 'inicio_intervalo' | 'fim_intervalo' | 'saida', string>
>;

const TIPOS_ORDEM: TipoBatida[] = [
  'entrada',
  'inicio_intervalo',
  'fim_intervalo',
  'saida',
];

function mapRowToBatida(row: Record<string, unknown>): BatidaPonto {
  return {
    id: String(row.id),
    tipo: row.tipo as TipoBatida,
    timestamp: String(row.timestamp),
    observacao: typeof row.observacao === 'string' ? row.observacao : undefined,
    foto: typeof row.foto === 'string' ? row.foto : undefined,
    origem: normalizarOrigemBatidaPonto(row.origem),
    ajustado_por: typeof row.ajustado_por === 'string' ? row.ajustado_por : undefined,
    motivo_ajuste: typeof row.motivo_ajuste === 'string' ? row.motivo_ajuste : undefined,
  };
}

/** Remove batidas do dia no servidor e no aparelho (cache local do colaborador). */
export async function excluirBatidasDiaPonto(params: {
  empresaId: string;
  userId: string;
  dataISO: string;
}): Promise<void> {
  const { inicio, fim } = intervaloDiaLocal(params.dataISO);
  const { error } = await supabase
    .from('ponto_registros')
    .delete()
    .eq('empresa_id', params.empresaId)
    .eq('user_id', params.userId)
    .gte('timestamp', inicio)
    .lte('timestamp', fim);

  if (error) throw error;

  const storageKey = montarChaveStoragePonto(params.empresaId, params.userId, params.dataISO);
  gravarBatidasLocal(storageKey, []);
}

/**
 * Substitui o dia inteiro por horários informados pelo gestor.
 * Campos vazios não geram batida; se todos vazios, apenas limpa o dia.
 */
export async function salvarAjusteManualDiaPonto(params: {
  empresaId: string;
  userIdColaborador: string;
  adminUserId: string;
  dataISO: string;
  horarios: HorariosAjusteDia;
  motivo: string;
}): Promise<BatidaPonto[]> {
  const motivo = params.motivo.trim();
  if (!motivo) throw new Error('Informe o motivo do ajuste.');

  const inserir: Array<{ tipo: TipoBatida; timestamp: string }> = [];
  for (const tipo of TIPOS_ORDEM) {
    const hora = (params.horarios[tipo] || '').trim();
    if (!hora) continue;
    const ts = timestampFromDiaEHora(params.dataISO, hora);
    if (!ts) throw new Error(`Horário inválido: ${hora} (${tipo})`);
    inserir.push({ tipo, timestamp: ts });
  }

  const entradaH = (params.horarios.entrada || '').trim();
  const saidaH = (params.horarios.saida || '').trim();
  if (entradaH && saidaH) {
    const saidaItem = inserir.find((i) => i.tipo === 'saida');
    if (saidaItem && saidaH <= entradaH) {
      const tsSaida = timestampFromDiaEHora(diaPosteriorLocal(params.dataISO), saidaH);
      if (!tsSaida) throw new Error(`Horário inválido: ${saidaH} (saida)`);
      saidaItem.timestamp = tsSaida;
    }
  }

  await excluirBatidasDiaPonto({
    empresaId: params.empresaId,
    userId: params.userIdColaborador,
    dataISO: params.dataISO,
  });

  const saidaNoturna = inserir.find((i) => i.tipo === 'saida');
  if (saidaNoturna && entradaH && saidaH && saidaH <= entradaH) {
    const diaSaida = diaPosteriorLocal(params.dataISO);
    const { inicio, fim } = intervaloDiaLocal(diaSaida);
    const { data: batidasProx } = await supabase
      .from('ponto_registros')
      .select('tipo')
      .eq('empresa_id', params.empresaId)
      .eq('user_id', params.userIdColaborador)
      .gte('timestamp', inicio)
      .lte('timestamp', fim);
    const temEntradaProx = (batidasProx || []).some((b) => b.tipo === 'entrada');
    if (!temEntradaProx) {
      await excluirBatidasDiaPonto({
        empresaId: params.empresaId,
        userId: params.userIdColaborador,
        dataISO: diaSaida,
      });
    }
  }

  if (inserir.length === 0) {
    await removerOcorrenciaDiaPonto({
      empresaId: params.empresaId,
      userId: params.userIdColaborador,
      dataISO: params.dataISO,
    });
    return [];
  }

  const rows = inserir.map((item) => ({
    empresa_id: params.empresaId,
    user_id: params.userIdColaborador,
    tipo: item.tipo,
    timestamp: item.timestamp,
    origem: 'ajuste_manual' as const,
    ajustado_por: params.adminUserId,
    motivo_ajuste: motivo,
    observacao: `[Ajuste manual] ${motivo}`,
  }));

  const { data, error } = await supabase.from('ponto_registros').insert(rows).select('*');
  if (error) throw error;

  const batidas = (data || []).map((row) => mapRowToBatida(row as Record<string, unknown>));
  const storageKey = montarChaveStoragePonto(
    params.empresaId,
    params.userIdColaborador,
    params.dataISO,
  );
  gravarBatidasLocal(storageKey, batidas);
  await removerOcorrenciaDiaPonto({
    empresaId: params.empresaId,
    userId: params.userIdColaborador,
    dataISO: params.dataISO,
  });
  return batidas;
}

function mapRowOcorrencia(row: Record<string, unknown>): PontoDiaOcorrencia {
  return {
    id: String(row.id),
    data: String(row.data).slice(0, 10),
    tipo: row.tipo as PontoDiaOcorrenciaTipo,
    motivo: typeof row.motivo === 'string' ? row.motivo : undefined,
  };
}

export async function listarOcorrenciasDiaPonto(params: {
  empresaId: string;
  userId: string;
  dataInicio: string;
  dataFim: string;
}): Promise<PontoDiaOcorrencia[]> {
  const { data, error } = await supabase
    .from('ponto_dia_ocorrencias')
    .select('id, data, tipo, motivo')
    .eq('empresa_id', params.empresaId)
    .eq('user_id', params.userId)
    .gte('data', params.dataInicio.slice(0, 10))
    .lte('data', params.dataFim.slice(0, 10))
    .order('data');

  if (error) throw error;
  return (data || []).map((row) => mapRowOcorrencia(row as Record<string, unknown>));
}

export async function removerOcorrenciaDiaPonto(params: {
  empresaId: string;
  userId: string;
  dataISO: string;
}): Promise<void> {
  const { error } = await supabase
    .from('ponto_dia_ocorrencias')
    .delete()
    .eq('empresa_id', params.empresaId)
    .eq('user_id', params.userId)
    .eq('data', params.dataISO.slice(0, 10));

  if (error) throw error;
}

/** Marca o dia como folga ou atestado e remove batidas existentes. */
export async function salvarOcorrenciaDiaPonto(params: {
  empresaId: string;
  userIdColaborador: string;
  adminUserId: string;
  dataISO: string;
  tipo: PontoDiaOcorrenciaTipo;
  motivo: string;
}): Promise<PontoDiaOcorrencia> {
  const motivo = params.motivo.trim();
  if (!motivo) throw new Error('Informe o motivo da ocorrência.');

  if (params.tipo === 'folga' || params.tipo === 'atestado') {
    await excluirBatidasDiaPonto({
      empresaId: params.empresaId,
      userId: params.userIdColaborador,
      dataISO: params.dataISO,
    });
  }

  const payload = {
    empresa_id: params.empresaId,
    user_id: params.userIdColaborador,
    data: params.dataISO.slice(0, 10),
    tipo: params.tipo,
    motivo,
    registrado_por: params.adminUserId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ponto_dia_ocorrencias')
    .upsert(payload, { onConflict: 'user_id,data' })
    .select('id, data, tipo, motivo')
    .single();

  if (error) throw error;
  return mapRowOcorrencia(data as Record<string, unknown>);
}

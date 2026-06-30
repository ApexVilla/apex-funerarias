import { supabase } from './supabase';
import {
  type BatidaPonto,
  PONTO_STORAGE_PREFIX,
  diaLocalFromTimestamp,
  diaOffsetLocal,
  encontrarDiaInicioJornadaAberta,
  intervaloDiaLocal,
  jornadaAbertaComEntrada,
  mergeBatidasPorId,
  montarChaveStoragePonto,
  normalizarBatidasParsed,
  normalizarOrigemBatidaPonto,
} from './pontoUtils';
import { JORNADA_MULTIDIA_12X36_MAX_DIAS } from './ponto12x36Catalao';

function chavePendentes(empresaId: string, userId: string) {
  return `${PONTO_STORAGE_PREFIX}:pending:${empresaId}:${userId}`;
}

export function lerBatidasLocal(storageKey: string): BatidaPonto[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? normalizarBatidasParsed(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function gravarBatidasLocal(storageKey: string, batidas: BatidaPonto[]) {
  localStorage.setItem(storageKey, JSON.stringify(batidas));
}

export function lerIdsPendentes(empresaId: string, userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(chavePendentes(empresaId, userId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function marcarBatidaPendente(empresaId: string, userId: string, batidaId: string) {
  const set = lerIdsPendentes(empresaId, userId);
  set.add(batidaId);
  localStorage.setItem(chavePendentes(empresaId, userId), JSON.stringify([...set]));
}

export function limparBatidaPendente(empresaId: string, userId: string, batidaId: string) {
  const set = lerIdsPendentes(empresaId, userId);
  set.delete(batidaId);
  localStorage.setItem(chavePendentes(empresaId, userId), JSON.stringify([...set]));
}

export function contarBatidasPendentes(empresaId: string, userId: string): number {
  return lerIdsPendentes(empresaId, userId).size;
}

export async function buscarBatidasServidor(
  userId: string,
  dataISO: string,
): Promise<BatidaPonto[]> {
  const { inicio, fim } = intervaloDiaLocal(dataISO);
  const { data, error } = await supabase
    .from('ponto_registros')
    .select('id, tipo, timestamp, observacao, foto, origem, ajustado_por, motivo_ajuste')
    .eq('user_id', userId)
    .gte('timestamp', inicio)
    .lte('timestamp', fim)
    .order('timestamp');

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    tipo: row.tipo as BatidaPonto['tipo'],
    timestamp: row.timestamp,
    observacao: row.observacao || undefined,
    foto: row.foto || undefined,
    origem: normalizarOrigemBatidaPonto(row.origem),
    ajustado_por: row.ajustado_por || undefined,
    motivo_ajuste: row.motivo_ajuste || undefined,
  }));
}

/** Carrega batidas do dia + dias anteriores se a jornada noturna/multidia ainda estiver aberta. */
export async function carregarBatidasJornadaAtiva(params: {
  empresaId: string;
  userId: string;
  dataISO: string;
  /** 2 = hoje + ontem (padrão). 12x36 Catalão usa até 7 dias. */
  multidiaMaxDias?: number;
}): Promise<{
  batidas: BatidaPonto[];
  jornadaIniciadaOntem: boolean;
  diaInicioJornada: string;
  origemServidor: boolean;
}> {
  const maxDias = Math.max(1, Math.min(params.multidiaMaxDias ?? 2, JORNADA_MULTIDIA_12X36_MAX_DIAS));

  const diasParaCarregar: string[] = [];
  for (let offset = maxDias - 1; offset >= 0; offset--) {
    diasParaCarregar.push(diaOffsetLocal(params.dataISO, -offset));
  }

  const resultados = await Promise.all(
    diasParaCarregar.map((dataISO) => carregarBatidasDia({ ...params, dataISO })),
  );

  let merged: BatidaPonto[] = [];
  let origemServidor = true;
  for (const res of resultados) {
    merged = mergeBatidasPorId(merged, res.batidas);
    origemServidor = origemServidor && res.origemServidor;
  }

  const batidasHoje = resultados[resultados.length - 1]?.batidas || [];

  if (jornadaAbertaComEntrada(merged)) {
    const diaInicio = encontrarDiaInicioJornadaAberta(merged) || params.dataISO;
    return {
      batidas: merged,
      jornadaIniciadaOntem: diaInicio < params.dataISO,
      diaInicioJornada: diaInicio,
      origemServidor,
    };
  }

  return {
    batidas: batidasHoje,
    jornadaIniciadaOntem: false,
    diaInicioJornada: params.dataISO,
    origemServidor: resultados[resultados.length - 1]?.origemServidor ?? true,
  };
}

/** Persiste batidas agrupadas pelo dia local de cada timestamp. */
export function gravarBatidasPorDiaLocal(
  empresaId: string,
  userId: string,
  batidas: BatidaPonto[],
) {
  const porDia = new Map<string, BatidaPonto[]>();
  for (const batida of batidas) {
    const dia = diaLocalFromTimestamp(batida.timestamp);
    if (!dia) continue;
    porDia.set(dia, mergeBatidasPorId(porDia.get(dia) || [], [batida]));
  }
  for (const [dia, lista] of porDia) {
    gravarBatidasLocal(montarChaveStoragePonto(empresaId, userId, dia), lista);
  }
}

/** Une local + servidor; batidas locais ainda não enviadas permanecem. */
export async function carregarBatidasDia(params: {
  empresaId: string;
  userId: string;
  dataISO: string;
}): Promise<{ batidas: BatidaPonto[]; origemServidor: boolean }> {
  const storageKey = montarChaveStoragePonto(params.empresaId, params.userId, params.dataISO);
  const local = lerBatidasLocal(storageKey);

  try {
    const remoto = await buscarBatidasServidor(params.userId, params.dataISO);
    const merged = mergeBatidasPorId(local, remoto);
    gravarBatidasLocal(storageKey, merged);

    for (const b of remoto) {
      limparBatidaPendente(params.empresaId, params.userId, b.id);
    }

    return { batidas: merged, origemServidor: true };
  } catch {
    return { batidas: local, origemServidor: false };
  }
}

export async function enviarBatidaServidor(params: {
  empresaId: string;
  userId: string;
  batida: BatidaPonto;
}): Promise<{ ok: boolean; offline: boolean; error?: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    marcarBatidaPendente(params.empresaId, params.userId, params.batida.id);
    return { ok: true, offline: true };
  }

  try {
    const { error } = await supabase.from('ponto_registros').insert({
      id: params.batida.id,
      empresa_id: params.empresaId,
      user_id: params.userId,
      tipo: params.batida.tipo,
      timestamp: params.batida.timestamp,
      observacao: params.batida.observacao || null,
      foto: params.batida.foto || null,
      origem: 'app',
    });

    if (error) {
      if (error.code === '23505') {
        limparBatidaPendente(params.empresaId, params.userId, params.batida.id);
        return { ok: true, offline: false };
      }
      throw error;
    }
    limparBatidaPendente(params.empresaId, params.userId, params.batida.id);
    return { ok: true, offline: false };
  } catch (err) {
    marcarBatidaPendente(params.empresaId, params.userId, params.batida.id);
    const msg = err instanceof Error ? err.message : 'Falha ao enviar';
    return { ok: true, offline: true, error: msg };
  }
}

/** Envia batidas pendentes de todos os dias guardados no aparelho. */
export async function sincronizarBatidasPendentes(params: {
  empresaId: string;
  userId: string;
}): Promise<{ enviadas: number; falhas: number }> {
  const prefix = `${PONTO_STORAGE_PREFIX}:${params.empresaId}:${params.userId}:`;
  const pendentes = lerIdsPendentes(params.empresaId, params.userId);
  if (pendentes.size === 0) return { enviadas: 0, falhas: 0 };

  let enviadas = 0;
  let falhas = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;

    const batidas = lerBatidasLocal(key);
    for (const batida of batidas) {
      if (!pendentes.has(batida.id)) continue;

      const res = await enviarBatidaServidor({
        empresaId: params.empresaId,
        userId: params.userId,
        batida,
      });

      if (res.offline && res.error) {
        falhas += 1;
        break;
      }
      if (!res.offline) enviadas += 1;
    }
  }

  return { enviadas, falhas };
}

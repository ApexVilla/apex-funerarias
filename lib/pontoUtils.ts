export type TipoBatida = 'entrada' | 'inicio_intervalo' | 'fim_intervalo' | 'saida';

export type OrigemBatidaPonto = 'app' | 'ajuste_manual' | 'afd';

export type BatidaPonto = {
  id: string;
  tipo: TipoBatida;
  timestamp: string;
  observacao?: string;
  foto?: string;
  origem?: OrigemBatidaPonto;
  ajustado_por?: string;
  motivo_ajuste?: string;
};

export function normalizarOrigemBatidaPonto(raw: unknown): OrigemBatidaPonto | undefined {
  if (raw === 'app' || raw === 'ajuste_manual' || raw === 'afd') return raw;
  return undefined;
}

export const PONTO_STORAGE_PREFIX = 'ponto-registros-v1';

/** Lista canônica de tipos de batida — importar daqui em vez de redeclarar. */
export const TODOS_TIPOS_BATIDA: TipoBatida[] = ['entrada', 'inicio_intervalo', 'fim_intervalo', 'saida'];

export function isTipoBatida(v: unknown): v is TipoBatida {
  return typeof v === 'string' && (TODOS_TIPOS_BATIDA as string[]).includes(v);
}

/** Data local YYYY-MM-DD (fuso do navegador — Brasil). */
export function getDataLocalISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Dia local de uma batida ISO. */
export function diaLocalFromTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return getDataLocalISO(d);
}

/** Limites do dia no fuso local, em ISO UTC para consultas Supabase. */
export function intervaloDiaLocal(dataISO: string): { inicio: string; fim: string } {
  const inicio = new Date(`${dataISO}T00:00:00`);
  const fim = new Date(`${dataISO}T23:59:59.999`);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

/** Intervalo do mês (primeiro ao último dia, fuso local). */
export function intervaloMesLocal(ano: number, mesIndex0: number): { inicio: string; fim: string } {
  const ultimoDia = new Date(ano, mesIndex0 + 1, 0).getDate();
  const inicioMes = `${ano}-${String(mesIndex0 + 1).padStart(2, '0')}-01`;
  const fimMes = `${ano}-${String(mesIndex0 + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return {
    inicio: intervaloDiaLocal(inicioMes).inicio,
    fim: intervaloDiaLocal(fimMes).fim,
  };
}

export function montarChaveStoragePonto(empresaId: string, userId: string, dataISO: string) {
  return `${PONTO_STORAGE_PREFIX}:${empresaId}:${userId}:${dataISO}`;
}

export function normalizarBatidasParsed(data: unknown): BatidaPonto[] {
  if (!Array.isArray(data)) return [];
  const out: BatidaPonto[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (!isTipoBatida(r.tipo)) continue;
    if (typeof r.timestamp !== 'string' || Number.isNaN(new Date(r.timestamp).getTime())) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const origem = normalizarOrigemBatidaPonto(r.origem);
    out.push({
      id,
      tipo: r.tipo,
      timestamp: r.timestamp,
      observacao: typeof r.observacao === 'string' ? r.observacao : undefined,
      foto: typeof r.foto === 'string' ? r.foto : undefined,
      origem,
      ajustado_por: typeof r.ajustado_por === 'string' ? r.ajustado_por : undefined,
      motivo_ajuste: typeof r.motivo_ajuste === 'string' ? r.motivo_ajuste : undefined,
    });
  }
  return out;
}

export function mergeBatidasPorId(a: BatidaPonto[], b: BatidaPonto[]): BatidaPonto[] {
  const map = new Map<string, BatidaPonto>();
  [...a, ...b].forEach((batida) => map.set(batida.id, batida));
  return [...map.values()].sort((x, y) => x.timestamp.localeCompare(y.timestamp));
}

/** Lê batidas do localStorage agrupadas por dia (somente empresa + usuário ativos). */
export function carregarBatidasLocalPorDia(
  empresaId: string,
  userId: string,
  diasAlvo?: string[],
): Record<string, BatidaPonto[]> {
  const mapa: Record<string, BatidaPonto[]> = {};
  const diasSet = diasAlvo ? new Set(diasAlvo) : null;
  const prefixEmpresa = `${PONTO_STORAGE_PREFIX}:${empresaId}:${userId}:`;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefixEmpresa)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const batidas = normalizarBatidasParsed(JSON.parse(raw));
      for (const batida of batidas) {
        const dia = diaLocalFromTimestamp(batida.timestamp);
        if (!dia) continue;
        if (diasSet && !diasSet.has(dia)) continue;
        mapa[dia] = mergeBatidasPorId(mapa[dia] || [], [batida]);
      }
    }
  } catch {
    /* ignore */
  }

  return mapa;
}

/** Todas as batidas de um tipo, em ordem cronológica. */
export function batidasDoTipo(batidas: BatidaPonto[], tipo: TipoBatida): BatidaPonto[] {
  return batidas
    .filter((b) => b.tipo === tipo)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function chaveBatidaDuplicata(b: BatidaPonto): string {
  const d = new Date(b.timestamp);
  if (Number.isNaN(d.getTime())) return `${b.tipo}|invalid|${b.id}`;
  const min = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}:${d.getMinutes()}`;
  return `${b.tipo}|${min}`;
}

/** Remove batidas repetidas no mesmo minuto (ex.: app + relógio ou duplo toque). */
export function removerBatidasDuplicadasExatas(batidas: BatidaPonto[]): BatidaPonto[] {
  const visto = new Set<string>();
  const out: BatidaPonto[] = [];
  for (const b of [...batidas].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const chave = chaveBatidaDuplicata(b);
    if (visto.has(chave)) continue;
    visto.add(chave);
    out.push(b);
  }
  return out;
}

/**
 * Mantém uma batida por tipo (entrada/início/fim/saída) para jornada padrão.
 * Evita hora extra inflada quando o app grava dois pontos no mesmo lugar.
 */
export function compactarBatidasJornadaPadrao(batidas: BatidaPonto[]): BatidaPonto[] {
  const limpas = removerBatidasDuplicadasExatas(batidas);
  const pick = (tipo: TipoBatida, first: boolean) => {
    const lista = batidasDoTipo(limpas, tipo);
    if (!lista.length) return null;
    return first ? lista[0] : lista[lista.length - 1];
  };
  const selecionadas = [
    pick('entrada', true),
    pick('inicio_intervalo', true),
    pick('fim_intervalo', false),
    pick('saida', false),
  ].filter(Boolean) as BatidaPonto[];
  return selecionadas.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function prepararBatidasDiaEspelho(batidas: BatidaPonto[]): BatidaPonto[] {
  return compactarBatidasJornadaPadrao(batidas);
}

/** Consolida turnos noturnos e compacta batidas duplicadas por dia. */
export function consolidarEPrepararBatidasEspelho(
  registrosPorDia: Record<string, BatidaPonto[]>,
  diasOrdenados: string[],
  opcoes?: { multidiaMaxDias?: number },
): Record<string, BatidaPonto[]> {
  const consolidado = consolidarJornadasNoturnasEspelho(registrosPorDia, diasOrdenados, opcoes);
  const out: Record<string, BatidaPonto[]> = {};
  for (const dia of diasOrdenados) {
    out[dia] = prepararBatidasDiaEspelho(consolidado[dia] || []);
  }
  return out;
}

export function formatarHoraPonto(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function batidaEhAjusteManual(batida?: BatidaPonto | null): boolean {
  return batida?.origem === 'ajuste_manual';
}

/** Exibe HH:mm com asterisco quando o horário foi lançado manualmente pelo gestor. */
export function formatarHoraPontoExibicao(batida?: BatidaPonto | null): string {
  if (!batida) return '--:--';
  const hora = formatarHoraPonto(batida.timestamp);
  if (hora === '--:--') return hora;
  return batidaEhAjusteManual(batida) ? `${hora}*` : hora;
}

/** Converte data (YYYY-MM-DD) + hora (HH:mm) para ISO UTC. */
export function timestampFromDiaEHora(dataISO: string, horaHHmm: string): string | null {
  const t = horaHHmm.trim();
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const d = new Date(
    `${dataISO}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`,
  );
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function horaFromTimestamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatarDuracaoPonto(minutos: number) {
  const sinal = minutos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sinal}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Dia anterior (YYYY-MM-DD) no fuso local. */
export function diaAnteriorLocal(dataISO: string): string {
  const d = new Date(`${dataISO.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return getDataLocalISO(d);
}

/** Dia seguinte (YYYY-MM-DD) no fuso local. */
export function diaPosteriorLocal(dataISO: string): string {
  return diaOffsetLocal(dataISO, 1);
}

/** Soma dias ao YYYY-MM-DD no fuso local (negativo = voltar). */
export function diaOffsetLocal(dataISO: string, offsetDias: number): string {
  const d = new Date(`${dataISO.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + offsetDias);
  return getDataLocalISO(d);
}

/** Intervalo do mês com margem antes/depois (turnos noturnos / jornada multidia). */
export function intervaloMesComMargemJornada(ano: number, mes: number, diasMargem = 1) {
  const primeiroDia = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  const ultimoDiaNum = new Date(ano, mes + 1, 0).getDate();
  const ultimoDia = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(ultimoDiaNum).padStart(2, '0')}`;
  let ini = primeiroDia;
  let fimDia = ultimoDia;
  for (let i = 0; i < diasMargem; i++) {
    ini = diaAnteriorLocal(ini);
    fimDia = diaPosteriorLocal(fimDia);
  }
  const { inicio: iniIso } = intervaloDiaLocal(ini);
  const { fim: fimIso } = intervaloDiaLocal(fimDia);
  return { inicio: iniIso, fim: fimIso };
}

/** Intervalo do mês + 1 dia antes/depois (turnos noturnos na virada). */
export function intervaloMesComMargemNoturna(ano: number, mes: number) {
  return intervaloMesComMargemJornada(ano, mes, 1);
}

function ordenarBatidasPorTimestamp(batidas: BatidaPonto[]): BatidaPonto[] {
  return [...batidas].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function horaLocalMinutos(timestamp: string): number {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getHours() * 60 + d.getMinutes();
}

/** Entrada noturna (após 17h) com batida de manhã no dia seguinte registrada como entrada por engano. */
function batidaFechamentoNoturnoErronea(
  batida: BatidaPonto,
  batidasJornada: BatidaPonto[],
): BatidaPonto | null {
  if (batida.tipo !== 'entrada') return null;
  if (horaLocalMinutos(batida.timestamp) >= 12 * 60) return null;

  const entradas = batidasDoTipo(batidasJornada, 'entrada');
  const ultimaEntrada = entradas[entradas.length - 1];
  if (!ultimaEntrada) return null;
  if (horaLocalMinutos(ultimaEntrada.timestamp) < 17 * 60) return null;

  return { ...batida, tipo: 'saida' };
}

/**
 * Jornada em aberto que pode absorver batidas do dia seguinte (turno noturno).
 * Se a pessoa já voltou do intervalo no mesmo dia, falta só a saída — não é virada de turno.
 */
export function jornadaNoturnaAbertaParaConsolidar(batidas: BatidaPonto[]): boolean {
  if (!jornadaAbertaComEntrada(batidas)) return false;
  if (batidas.some((b) => b.tipo === 'fim_intervalo')) return false;
  const entradas = batidasDoTipo(batidas, 'entrada');
  const primeiraEntrada = entradas[0];
  if (!primeiraEntrada) return false;
  return horaLocalMinutos(primeiraEntrada.timestamp) >= 17 * 60;
}

function absorverBatidasProximoDia(
  result: Record<string, BatidaPonto[]>,
  dia: string,
  diaAlvo: string,
  diasSet: Set<string>,
  registrosPorDia: Record<string, BatidaPonto[]>,
): boolean {
  const batidasDia = result[dia] || [];
  if (!jornadaNoturnaAbertaParaConsolidar(batidasDia)) return false;

  const pool = ordenarBatidasPorTimestamp([
    ...(result[diaAlvo] || []),
    ...(diasSet.has(diaAlvo) ? [] : registrosPorDia[diaAlvo] || []),
  ]);
  if (!pool.length) return false;

  const movidas: BatidaPonto[] = [];
  const ficam: BatidaPonto[] = [];
  let temp = [...batidasDia];

  for (let pi = 0; pi < pool.length; pi++) {
    const batida = pool[pi];
    if (!jornadaNoturnaAbertaParaConsolidar(temp)) {
      ficam.push(batida);
      continue;
    }
    if (batida.tipo === 'entrada' && movidas.length === 0) {
      const comoSaida = batidaFechamentoNoturnoErronea(batida, temp);
      if (comoSaida) {
        movidas.push(comoSaida);
        temp = mergeBatidasPorId(temp, [comoSaida]);
        continue;
      }
      ficam.push(batida);
      for (let j = pi + 1; j < pool.length; j++) ficam.push(pool[j]);
      break;
    }
    movidas.push(batida);
    temp = mergeBatidasPorId(temp, [batida]);
  }

  if (!movidas.length) return false;

  result[dia] = mergeBatidasPorId(batidasDia, movidas);
  if (diasSet.has(diaAlvo)) {
    result[diaAlvo] = ficam;
  }
  return true;
}

/**
 * No espelho, agrupa turno noturno no dia da entrada:
 * entrada dia 09 às 18:58 + saída dia 10 às 07:31 → contabiliza no dia 09.
 * Com multidiaMaxDias > 1 (12x36 Catalão), absorve saída até N dias depois.
 */
export function consolidarJornadasNoturnasEspelho(
  registrosPorDia: Record<string, BatidaPonto[]>,
  diasOrdenados: string[],
  opcoes?: { multidiaMaxDias?: number },
): Record<string, BatidaPonto[]> {
  const multidiaMax = Math.max(1, Math.min(opcoes?.multidiaMaxDias ?? 1, 14));
  const diasSet = new Set(diasOrdenados);
  const result: Record<string, BatidaPonto[]> = {};

  for (const dia of diasOrdenados) {
    result[dia] = ordenarBatidasPorTimestamp(registrosPorDia[dia] || []);
  }

  for (let i = 0; i < diasOrdenados.length; i++) {
    const dia = diasOrdenados[i];
    for (let offset = 1; offset <= multidiaMax; offset++) {
      if (!jornadaNoturnaAbertaParaConsolidar(result[dia] || [])) break;
      const diaAlvo = diaOffsetLocal(dia, offset);
      const moveu = absorverBatidasProximoDia(result, dia, diaAlvo, diasSet, registrosPorDia);
      if (!moveu) break;
    }
  }

  const primeiro = diasOrdenados[0];
  if (primeiro) {
    const hoje = result[primeiro] || [];
    const temSaida = hoje.some((b) => b.tipo === 'saida');
    const temEntrada = hoje.some((b) => b.tipo === 'entrada');
    if (temSaida && !temEntrada) {
      const diaAnt = diaAnteriorLocal(primeiro);
      const batidasAnt = ordenarBatidasPorTimestamp(registrosPorDia[diaAnt] || []);
      if (jornadaNoturnaAbertaParaConsolidar(batidasAnt)) {
        result[primeiro] = mergeBatidasPorId(batidasAnt, hoje);
      }
    }
  }

  return result;
}

/** Saída (ou outra batida) registrada no dia civil seguinte à linha do espelho. */
export function batidaEmDiaPosterior(batida: BatidaPonto, diaLinha: string): boolean {
  const diaBatida = diaLocalFromTimestamp(batida.timestamp);
  return Boolean(diaBatida && diaBatida > diaLinha.slice(0, 10));
}

/** Jornada ainda em aberto (última batida não é saída). */
export function jornadaAberta(batidas: BatidaPonto[]): boolean {
  if (!batidas.length) return false;
  const ord = [...batidas].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return ord[ord.length - 1].tipo !== 'saida';
}

/** Entrada registrada e jornada ainda sem saída (turno noturno / 12x36). */
export function jornadaAbertaComEntrada(batidas: BatidaPonto[]): boolean {
  if (!batidas.some((b) => b.tipo === 'entrada')) return false;
  return jornadaAberta(batidas);
}

/** Dia civil (YYYY-MM-DD) da entrada que ainda não foi fechada por saída. */
export function encontrarDiaInicioJornadaAberta(batidas: BatidaPonto[]): string | null {
  const ord = ordenarBatidasPorTimestamp(batidas);
  let ultimaEntrada: BatidaPonto | null = null;
  for (const b of ord) {
    if (b.tipo === 'entrada') ultimaEntrada = b;
    if (b.tipo === 'saida') ultimaEntrada = null;
  }
  if (!ultimaEntrada) return null;
  return diaLocalFromTimestamp(ultimaEntrada.timestamp);
}

/** Chave estável userId + dia (YYYY-MM-DD) para dias que já têm batida no banco. */
export function chaveDiaPontoUsuario(userId: string, dataISO: string): string {
  return `${userId}:${dataISO.slice(0, 10)}`;
}

export function calcularTrabalhadoMinutos(batidas: BatidaPonto[]) {
  const ordenadas = [...batidas].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let total = 0;
  let inicioPeriodo: Date | null = null;

  for (const batida of ordenadas) {
    if (batida.tipo === 'entrada' || batida.tipo === 'fim_intervalo') {
      inicioPeriodo = new Date(batida.timestamp);
    }
    if ((batida.tipo === 'inicio_intervalo' || batida.tipo === 'saida') && inicioPeriodo) {
      const fim = new Date(batida.timestamp);
      total += Math.max(0, Math.round((fim.getTime() - inicioPeriodo.getTime()) / 60000));
      inicioPeriodo = null;
    }
  }

  return total;
}

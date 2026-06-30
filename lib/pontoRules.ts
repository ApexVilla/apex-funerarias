import { usuarioPodeVerModulo } from './acessoModulos';
import { lerAcaoPermissao } from './finCaixaPermissoes';
import { horaFromTimestamp, type TipoBatida } from './pontoUtils';

/** Máx. entre início do intervalo e 3ª batida para classificar como volta do almoço (AFD). */
export const AFD_GAP_VOLTA_ALMOCO_MAX_MINUTOS = 180;

/** Marcações AFD anteriores a este ano são ignoradas na importação (evita reprocessar histórico antigo). */
export const AFD_ANO_MINIMO_IMPORTACAO = 2026;

export function marcacoesAfdDentroDoAnoMinimo(anoStr: string): boolean {
  const ano = Number(anoStr);
  return Number.isFinite(ano) && ano >= AFD_ANO_MINIMO_IMPORTACAO;
}

export type PontoRegime = 'padrao_8h' | 'seis_horas' | 'doze_por_trinta_seis' | 'personalizado' | 'cargo_confianca';

export type PontoConfig = {
  regime: PontoRegime;
  carga_horaria_minutos: number;
  pode_editar_proprio_ponto?: boolean;
  /** Primeiro dia em que o colaborador deve registrar ponto (YYYY-MM-DD). */
  data_inicio_ponto?: string;
  /** Dias (YYYY-MM-DD) em que o colaborador 12x36 foi convocado para trabalhar. */
  convocacoes_datas?: string[];
  /** Recepção e similares: sábado sim / sábado não (âncora = primeiro sábado de trabalho). */
  escala_sabado_alternado?: boolean;
  /** Meta no sábado de escala (padrão 4h — não conta como hora extra até essa meta). */
  meta_sabado_minutos?: number;
  /** Primeiro sábado de trabalho da escala alternada (YYYY-MM-DD, deve ser sábado). */
  data_inicio_escala_sabado?: string;
};

const DEFAULT_PONTO_CONFIG: PontoConfig = {
  regime: 'padrao_8h',
  carga_horaria_minutos: 8 * 60,
  pode_editar_proprio_ponto: false,
};

const PONTO_ALLOWED_ROLES = [
  'supervisao',
  'gerente',
  'diretoria',
  'gestor_executivo',
  'gestao_executiva',
  'gestor',
  'admin',
  'admin_sistema',
  'admin_empresa',
  'super_admin',
  'cobrador',
  'rh',
];

export const canAccessPontoByRole = (role?: string | null) =>
  PONTO_ALLOWED_ROLES.includes((role || '').toLowerCase());

/** Cargo de gestão OU permissão granular (ponto_registro / ponto_espelho). */
export const canAccessPonto = (
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
) => usuarioPodeVerModulo(role, permissoes ?? undefined, 'ponto');

/** Cargos de gestão: acessam o módulo ponto (espelho) mas não registram batidas por padrão. */
const CARGOS_GESTAO_SEM_PONTO_OBRIGATORIO = new Set([
  'admin',
  'admin_sistema',
  'admin_empresa',
  'super_admin',
  'administrador_geral',
  'gerente',
  'diretoria',
  'gestor_executivo',
  'gestao_executiva',
  'supervisao',
  'gestor',
  'rh',
  'financeiro',
]);

/** Cargos operacionais que registram ponto por padrão (exceto cargo de confiança). */
const CARGOS_OPERACIONAIS_PONTO = new Set([
  'cobrador',
  'vendedor',
  'atendente',
  'agente_funerario',
  'agentes_funerarios',
  'recepcao',
  'auxiliar_servicos_gerais',
  'motorista',
  'estoquista',
]);

function permissoesPermitemRegistrarPonto(permissoes?: Record<string, unknown> | null): boolean {
  const pr = permissoes?.ponto_registro;
  if (!pr || typeof pr !== 'object' || Array.isArray(pr)) return false;
  const row = pr as Record<string, unknown>;
  if (row.create === true) return true;
  if (row.liberado === true && row.create !== false) return true;
  return false;
}

/**
 * Colaborador deve aparecer na folha de ponto, presença e banco de horas.
 * Exclui cargo de confiança, gestão e quem não tem permissão operacional de batida.
 */
export const colaboradorBatePonto = (
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean => {
  const config = getUserPontoConfig(permissoes);
  if (config.regime === 'cargo_confianca') return false;

  const pr = permissoes?.ponto_registro as Record<string, unknown> | undefined;
  // Se o ponto estiver explicitamente liberado nas permissões granulares (ex: Natacha, mesmo sendo de cargo de gestão/financeiro)
  if (pr && pr.liberado === true) return true;

  const r = (role || '').toLowerCase();
  if (CARGOS_GESTAO_SEM_PONTO_OBRIGATORIO.has(r)) return false;

  // Cargo operacional: folha/AFD mesmo se o registro pelo app estiver desligado (ex.: relógio físico).
  if (CARGOS_OPERACIONAIS_PONTO.has(r)) return true;

  if (pr && pr.create === false) return false;

  if (permissoesPermitemRegistrarPonto(permissoes)) return true;

  return false;
};

type UsuarioListagemPonto = {
  ativo?: boolean | null;
  deleted_at?: string | null;
  role?: string | null;
  permissoes?: Record<string, unknown> | null;
};

/** Usuário ativo no sistema e elegível para folha / presença / AFD. */
export const colaboradorElegivelFolhaPonto = (u: UsuarioListagemPonto): boolean => {
  if (u.ativo === false) return false;
  if (u.deleted_at) return false;
  return colaboradorBatePonto(u.role, u.permissoes);
};

export const getUserPontoConfig = (permissoes: any): PontoConfig => {
  const cfg = permissoes?.ponto_config;
  if (!cfg || typeof cfg !== 'object') return DEFAULT_PONTO_CONFIG;

  const regime: PontoRegime =
    cfg.regime === 'seis_horas' ||
    cfg.regime === 'doze_por_trinta_seis' ||
    cfg.regime === 'personalizado' ||
    cfg.regime === 'cargo_confianca' ||
    cfg.regime === 'padrao_8h'
      ? cfg.regime
      : 'padrao_8h';

  const presetMinutos =
    regime === 'doze_por_trinta_seis'
      ? 12 * 60
      : regime === 'seis_horas'
        ? 6 * 60
        : regime === 'padrao_8h'
          ? 8 * 60
          : regime === 'cargo_confianca'
            ? 0
            : DEFAULT_PONTO_CONFIG.carga_horaria_minutos;

  const minutos = Number(cfg.carga_horaria_minutos);
  let carga =
    regime === 'personalizado'
      ? Number.isFinite(minutos) && minutos > 0
        ? minutos
        : presetMinutos
      : presetMinutos;

  const convocacoesRaw = cfg.convocacoes_datas;
  const convocacoes_datas = Array.isArray(convocacoesRaw)
    ? convocacoesRaw
        .map((d) => String(d).slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [];

  const inicioRaw = String(cfg.data_inicio_ponto ?? '').slice(0, 10);
  const data_inicio_ponto = /^\d{4}-\d{2}-\d{2}$/.test(inicioRaw) ? inicioRaw : undefined;

  const escalaSabadoRaw = String(cfg.data_inicio_escala_sabado ?? '').slice(0, 10);
  const data_inicio_escala_sabado = /^\d{4}-\d{2}-\d{2}$/.test(escalaSabadoRaw)
    ? escalaSabadoRaw
    : undefined;

  const metaSabadoNum = Number(cfg.meta_sabado_minutos);
  const meta_sabado_minutos =
    Number.isFinite(metaSabadoNum) && metaSabadoNum > 0 ? metaSabadoNum : 4 * 60;

  return {
    regime,
    carga_horaria_minutos: carga,
    pode_editar_proprio_ponto: Boolean(cfg.pode_editar_proprio_ponto),
    data_inicio_ponto,
    convocacoes_datas,
    escala_sabado_alternado: Boolean(cfg.escala_sabado_alternado),
    meta_sabado_minutos,
    data_inicio_escala_sabado,
  };
};

const ROLES_EDITAM_FOLHA_PONTO = [
  'admin',
  'admin_sistema',
  'admin_empresa',
  'super_admin',
  'gerente',
  'supervisao',
  'gestor',
  'gestor_executivo',
  'gestao_executiva',
  'diretoria',
  'rh',
] as const;

/** Gestor/administrador pode corrigir horários no espelho de ponto. */
export const canEditarFolhaPonto = (
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
) => {
  if (lerAcaoPermissao(permissoes, 'ponto_espelho', 'edit')) return true;
  return ROLES_EDITAM_FOLHA_PONTO.includes(
    (role || '').toLowerCase() as (typeof ROLES_EDITAM_FOLHA_PONTO)[number],
  );
};

/**
 * Espelho de ponto de outros colaboradores — gestão/RH ou permissão `view_todos`.
 * Cobrador e demais perfis veem apenas o próprio espelho (como "Meu ponto").
 */
export const canVerEspelhoPontoTodosColaboradores = (
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
) => {
  if (lerAcaoPermissao(permissoes, 'ponto_espelho', 'view_todos')) return true;
  return canEditarFolhaPonto(role, permissoes);
};

export const labelRegimePonto = (regime: PontoRegime) => {
  if (regime === 'seis_horas') return '6 horas';
  if (regime === 'doze_por_trinta_seis') return '12x36';
  if (regime === 'personalizado') return 'Personalizado';
  if (regime === 'cargo_confianca') return 'Cargo de Confiança';
  return '8 horas';
};

/** Turno entrada/saída sem intervalo (cobrador em campo, vendedor). Agentes 12x36 usam intervalo de 1h. */
const ROLES_PONTO_ENTRADA_SAIDA = ['cobrador', 'vendedor'] as const;

export const ORDEM_BATIDA_JORNADA_COMPLETA: TipoBatida[] = [
  'entrada',
  'inicio_intervalo',
  'fim_intervalo',
  'saida',
];

export const ORDEM_BATIDA_ENTRADA_SAIDA: TipoBatida[] = ['entrada', 'saida'];

export function usaPontoApenasEntradaSaida(role?: string | null): boolean {
  return ROLES_PONTO_ENTRADA_SAIDA.includes(
    (role || '').toLowerCase() as (typeof ROLES_PONTO_ENTRADA_SAIDA)[number],
  );
}

export function ordemBatidasPonto(role?: string | null): TipoBatida[] {
  return usaPontoApenasEntradaSaida(role)
    ? ORDEM_BATIDA_ENTRADA_SAIDA
    : ORDEM_BATIDA_JORNADA_COMPLETA;
}

/** Próxima batida esperada conforme o cargo (ignora intervalo em modo entrada/saída). */
export function proximaBatidaPonto(
  batidas: { tipo: TipoBatida }[],
  role?: string | null,
): TipoBatida | undefined {
  if (usaPontoApenasEntradaSaida(role)) {
    const temEntrada = batidas.some((b) => b.tipo === 'entrada');
    const temSaida = batidas.some((b) => b.tipo === 'saida');
    if (!temEntrada) return 'entrada';
    if (!temSaida) return 'saida';
    return undefined;
  }
  const ordem = ordemBatidasPonto(role);
  return ordem[batidas.length];
}

export function jornadaPontoFinalizada(
  batidas: { tipo: TipoBatida; timestamp?: string }[],
  _role?: string | null,
): boolean {
  if (!batidas.length) return false;
  const ord = [...batidas].sort((a, b) => {
    if (a.timestamp && b.timestamp) return a.timestamp.localeCompare(b.timestamp);
    return 0;
  });
  return ord[ord.length - 1].tipo === 'saida';
}

/** Dia entra no saldo mensal — o dia atual só após a saída (jornada fechada). */
export function diaFechadoParaSaldoMensal(
  dataISO: string,
  hojeISO: string,
  batidas: { tipo: TipoBatida; timestamp?: string }[],
  role?: string | null,
): boolean {
  if (dataISO > hojeISO) return false;
  if (dataISO < hojeISO) return true;
  return jornadaPontoFinalizada(batidas, role);
}

/** Tipos exibidos no seletor manual de batida. */
export function tiposBatidaParaSelecao(role?: string | null): TipoBatida[] {
  return ordemBatidasPonto(role);
}

/** Minutos entre horários HH:mm no mesmo dia (fim − início). */
function minutosEntreHorariosLocal(inicioHHmm: string, fimHHmm: string): number {
  const parse = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = parse(inicioHHmm);
  const b = parse(fimHHmm);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return b - a;
}

/**
 * Mapeia batidas do relógio físico (AFD) pela quantidade de horários no dia.
 * Relógios não informam tipo — 2 batidas = entrada + saída (não intervalo).
 * Com 3 batidas: se a 3ª ocorre ~1–3h após o intervalo, é volta do almoço (fim_intervalo).
 */
export function mapearTiposBatidaImportacaoRelogio(
  quantidadeBatidas: number,
  horariosOrdenados?: string[],
): TipoBatida[] {
  if (quantidadeBatidas <= 0) return [];
  if (quantidadeBatidas === 1) return ['entrada'];
  if (quantidadeBatidas === 2) return ['entrada', 'saida'];
  if (quantidadeBatidas === 3) {
    if (horariosOrdenados?.length === 3) {
      const gapAlmoco = minutosEntreHorariosLocal(horariosOrdenados[1], horariosOrdenados[2]);
      if (gapAlmoco > 0 && gapAlmoco <= AFD_GAP_VOLTA_ALMOCO_MAX_MINUTOS) {
        return ['entrada', 'inicio_intervalo', 'fim_intervalo'];
      }
    }
    return ['entrada', 'inicio_intervalo', 'saida'];
  }
  return ORDEM_BATIDA_JORNADA_COMPLETA.slice(0, quantidadeBatidas);
}

/**
 * Reclassifica batidas AFD de um dia com base nos horários (proteção contra importação antiga).
 * Ex.: 3 batidas com 3ª ~2h após intervalo → fim_intervalo, não saída.
 */
export function normalizarBatidasAfdDia<
  T extends { id: string; tipo: TipoBatida; timestamp: string; origem?: string },
>(batidas: T[]): T[] {
  if (batidas.length === 0) return batidas;
  if (!batidas.every((b) => b.origem === 'afd')) return batidas;

  const ordenadas = [...batidas].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const horarios = ordenadas.map((b) => horaFromTimestamp(b.timestamp));
  if (horarios.some((h) => !h)) return batidas;

  const tiposCorretos = mapearTiposBatidaImportacaoRelogio(ordenadas.length, horarios);
  if (tiposCorretos.length !== ordenadas.length) return batidas;

  const tipoPorId = new Map(ordenadas.map((b, i) => [b.id, tiposCorretos[i]]));
  let mudou = false;
  const out = batidas.map((b) => {
    const novo = tipoPorId.get(b.id);
    if (novo && novo !== b.tipo) {
      mudou = true;
      return { ...b, tipo: novo };
    }
    return b;
  });
  return mudou ? out : batidas;
}

export const LABEL_TIPO_BATIDA: Record<TipoBatida, string> = {
  entrada: 'Entrada',
  inicio_intervalo: 'Intervalo 1 (início)',
  fim_intervalo: 'Intervalo 2 (fim)',
  saida: 'Saída',
};

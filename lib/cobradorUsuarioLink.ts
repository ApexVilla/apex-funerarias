import { supabase } from './supabase';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimOrEmpty(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizarNomePessoa(s: string): string {
  return trimOrEmpty(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

const GESTOR_COBRANCA_ROLES = new Set([
  'admin',
  'admin_sistema',
  'admin_empresa',
  'administrador_geral',
  'super_admin',
  'gerente',
  'gestor',
  'supervisao',
  'diretoria',
]);

export function usuarioEhGestorCobranca(role?: string | null): boolean {
  return GESTOR_COBRANCA_ROLES.has(trimOrEmpty(role).toLowerCase());
}

export function usuarioEhPerfilCobrador(role?: string | null): boolean {
  return trimOrEmpty(role).toLowerCase() === 'cobrador';
}

/** Gestor/master: vê relatórios, comissões e recebimentos de todos os cobradores. */
export function usuarioPodeVerTodosCobradores(role?: string | null): boolean {
  return usuarioEhGestorCobranca(role);
}

/** Cobrador em campo (não gestor): dados restritos ao próprio cadastro em cobradores. */
export function usuarioEhCobradorCampoRestrito(role?: string | null): boolean {
  return usuarioEhPerfilCobrador(role) && !usuarioEhGestorCobranca(role);
}

export type ResolverCobradorUsuarioParams = {
  empresaIds: string[];
  usuarioId?: string | null;
  email?: string | null;
  nome?: string | null;
};

type CobradorVinculoRow = {
  id: string;
  email?: string | null;
  nome?: string | null;
  usuario_id?: string | null;
  empresa_id?: string | null;
  status?: string | null;
};

/** Amplia ids para todo o grupo econômico (cobradores podem estar na matriz com rota em Catalão). */
async function expandirEmpresaIdsGrupoEconomico(empresaIds: string[]): Promise<string[]> {
  const base = [...new Set(empresaIds.map((id) => id.trim()).filter(Boolean))];
  if (base.length === 0) return [];

  const { data: empresas, error } = await supabase
    .from('empresas')
    .select('id, grupo_empresa_id')
    .in('id', base);
  if (error || !empresas?.length) return base;

  const grupoIds = [
    ...new Set(
      empresas
        .map((e) => trimOrEmpty((e as { grupo_empresa_id?: string | null }).grupo_empresa_id))
        .filter(Boolean),
    ),
  ];
  if (grupoIds.length === 0) return base;

  const { data: grupoEmpresas, error: grupoErr } = await supabase
    .from('empresas')
    .select('id')
    .in('grupo_empresa_id', grupoIds);
  if (grupoErr || !grupoEmpresas?.length) return base;

  return [
    ...new Set([
      ...base,
      ...grupoEmpresas.map((e) => trimOrEmpty((e as { id?: string }).id)).filter(Boolean),
    ]),
  ];
}

/**
 * Resolve o id em `cobradores` para o usuário logado.
 * Ordem: usuario_id (coluna) → e-mail → nome (sem acentos).
 * Busca em todo o grupo econômico das empresas informadas.
 */
export async function resolverCobradorIdDoUsuario(
  params: ResolverCobradorUsuarioParams,
): Promise<string | null> {
  const ids = await expandirEmpresaIdsGrupoEconomico(params.empresaIds);
  if (ids.length === 0) return null;

  const usuarioId = trimOrEmpty(params.usuarioId);
  const emailNorm = trimOrEmpty(params.email).toLowerCase();
  const nomeNorm = normalizarNomePessoa(trimOrEmpty(params.nome));

  let usuarioEmpresaId = '';
  if (usuarioId && UUID_RE.test(usuarioId)) {
    const { data: userRow } = await supabase
      .from('users')
      .select('empresa_id')
      .eq('id', usuarioId)
      .maybeSingle();
    usuarioEmpresaId = trimOrEmpty((userRow as { empresa_id?: string | null } | null)?.empresa_id);
  }

  let q = supabase
    .from('cobradores')
    .select('id, email, nome, usuario_id, empresa_id, status')
    .eq('status', 'ativo');
  q = ids.length === 1 ? q.eq('empresa_id', ids[0]) : q.in('empresa_id', ids);

  const { data: dataFull, error: errorFull } = await q;
  let rows: CobradorVinculoRow[] = (dataFull || []) as CobradorVinculoRow[];
  if (errorFull && supabasePareceErroColunaAusente(errorFull.message, 'usuario_id')) {
    let qLegacy = supabase.from('cobradores').select('id, email, nome, empresa_id').eq('status', 'ativo');
    qLegacy = ids.length === 1 ? qLegacy.eq('empresa_id', ids[0]) : qLegacy.in('empresa_id', ids);
    const legacy = await qLegacy;
    if (legacy.error) throw legacy.error;
    rows = (legacy.data || []).map((r) => ({
      ...r,
      usuario_id: null,
      status: 'ativo',
    })) as CobradorVinculoRow[];
  } else if (errorFull) {
    throw errorFull;
  }
  if (!rows.length) return null;

  if (usuarioId && UUID_RE.test(usuarioId)) {
    const porUsuario = rows.find((c) => trimOrEmpty(c.usuario_id) === usuarioId);
    if (porUsuario?.id) return String(porUsuario.id);
  }

  return resolverPorEmailNome(rows, emailNorm, nomeNorm, usuarioEmpresaId);
}

function resolverPorEmailNome(
  data: CobradorVinculoRow[],
  emailNorm: string,
  nomeNorm: string,
  usuarioEmpresaId?: string,
): string | null {
  if (emailNorm) {
    const porEmail = data.find((c) => trimOrEmpty(c.email).toLowerCase() === emailNorm);
    if (porEmail?.id) return String(porEmail.id);
  }
  if (nomeNorm) {
    const porNome = data.filter((c) => normalizarNomePessoa(trimOrEmpty(c.nome)) === nomeNorm);
    if (porNome.length === 1) return String(porNome[0].id);
    if (porNome.length > 1 && usuarioEmpresaId) {
      const pref = porNome.find((c) => trimOrEmpty(c.empresa_id) === usuarioEmpresaId);
      if (pref?.id) return String(pref.id);
    }
    if (porNome.length > 0) return String(porNome[0].id);
  }
  return null;
}

function supabasePareceErroColunaAusente(message: string, coluna: string): boolean {
  const m = message.toLowerCase();
  return m.includes(coluna.toLowerCase()) && (m.includes('schema cache') || m.includes('could not find'));
}

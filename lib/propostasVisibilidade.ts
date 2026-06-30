/** Regras de visibilidade das propostas de venda (espelha RLS no banco). */

import { usuarioTemAlgumRole } from './userRoles';

const ROLES_VER_TODAS_PROPOSTAS = [
  'admin',
  'admin_empresa',
  'admin_sistema',
  'super_admin',
  'gerente',
  'gestor',
  'gestor_executivo',
  'supervisao',
  'diretoria',
  'financeiro',
] as const;

const ROLES_SO_PROPRIAS_PROPOSTAS = [
  'vendedor',
  'atendente',
  'cobrador',
  'motorista',
  'agentes_funerarios',
  'agente_funerario',
  'estoquista',
] as const;

export function extrairPermVendasPropostas(
  permissoes?: Record<string, unknown> | null,
): Record<string, boolean> {
  const rotina = (permissoes?.vendas_propostas || {}) as Record<string, boolean>;
  const legado = (permissoes?.vendas || {}) as Record<string, boolean>;
  const merged: Record<string, boolean> = { ...rotina };
  for (const [k, v] of Object.entries(legado)) {
    if (v === true) merged[k] = true;
  }
  return merged;
}

/** Acesso ao módulo / lista (vendedor usa para ver as próprias). */
export function usuarioPodeAcessarPropostas(
  permissoes?: Record<string, unknown> | null,
): boolean {
  const p = extrairPermVendasPropostas(permissoes);
  return p.liberado === true || p.view === true || p.create === true || p.edit === true;
}

/**
 * Ver propostas de todos os vendedores do grupo.
 * Vendedor padrão: false (só as dele). Supervisão/gestão ou permissão `view_todos`: true.
 */
function usuarioTemCargoStaffPropostas(
  role?: string | null,
  rolesExtra?: string[] | null,
): boolean {
  return usuarioTemAlgumRole(role, rolesExtra, ROLES_VER_TODAS_PROPOSTAS);
}

export function usuarioPodeVerTodasPropostasVenda(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
  rolesExtra?: string[] | null,
): boolean {
  const r = (role || '').toLowerCase().trim();
  const p = extrairPermVendasPropostas(permissoes);

  if (usuarioTemCargoStaffPropostas(role, rolesExtra)) return true;

  if (p.view_todos === true) return true;

  if ((ROLES_VER_TODAS_PROPOSTAS as readonly string[]).includes(r)) return true;

  if ((ROLES_SO_PROPRIAS_PROPOSTAS as readonly string[]).includes(r)) return false;

  return false;
}

export function usuarioPodeConfirmarProposta(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
  rolesExtra?: string[] | null,
): boolean {
  const p = extrairPermVendasPropostas(permissoes);
  return usuarioPodeVerTodasPropostasVenda(role, permissoes, rolesExtra) || p.confirm === true;
}

/**
 * Assumir pós-venda e gerar contrato no sistema.
 * Alinha com RLS de `propostas_venda` (update staff) e `assinaturas` (insert).
 * Vendedor com `view_todos` vê a lista, mas não gera contrato sem função staff.
 */
export function usuarioPodeGerarContratoProposta(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
  rolesExtra?: string[] | null,
): boolean {
  const p = extrairPermVendasPropostas(permissoes);
  /** Permissão explícita no perfil (Configurações → Propostas). */
  if (p.view_todos === true || p.confirm === true) return true;

  const r = (role || '').toLowerCase().trim();
  if (r === 'vendedor' && !usuarioTemCargoStaffPropostas(role, rolesExtra)) {
    return false;
  }
  return usuarioPodeVerTodasPropostasVenda(role, permissoes, rolesExtra);
}

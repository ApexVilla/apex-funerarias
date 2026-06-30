import { lerAcaoPermissao } from './finCaixaPermissoes';

export const ROTINA_SERVICOS_FUNERARIOS = 'atd_servicos';

const ROLES_ADMIN_TOTAL = new Set([
  'admin',
  'admin_sistema',
  'admin_empresa',
  'super_admin',
]);

function ehAdminTotal(role?: string | null): boolean {
  return ROLES_ADMIN_TOTAL.has((role || '').toLowerCase());
}

function podeAcaoRotina(
  role: string | null | undefined,
  permissoes: Record<string, unknown> | null | undefined,
  acao: 'view' | 'create' | 'edit' | 'delete',
): boolean {
  if (ehAdminTotal(role)) return true;
  if (lerAcaoPermissao(permissoes, ROTINA_SERVICOS_FUNERARIOS, 'liberado')) return true;
  return lerAcaoPermissao(permissoes, ROTINA_SERVICOS_FUNERARIOS, acao);
}

export function usuarioPodeVerServicosFunerarios(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  return podeAcaoRotina(role, permissoes, 'view');
}

export function usuarioPodeIncluirServicoFunerario(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  return podeAcaoRotina(role, permissoes, 'create');
}

export function usuarioPodeEditarServicoFunerario(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  return podeAcaoRotina(role, permissoes, 'edit');
}

export function usuarioPodeExcluirServicoFunerario(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  return podeAcaoRotina(role, permissoes, 'delete');
}

/** Ativar/desativar exige permissão de edição. */
export function usuarioPodeAlterarStatusServicoFunerario(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  return usuarioPodeEditarServicoFunerario(role, permissoes);
}

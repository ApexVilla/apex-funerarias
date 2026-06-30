/** Permissões para criar contrato direto (fora do fluxo proposta → pós-venda). */

import { usuarioPodeVerTodasPropostasVenda } from './propostasVisibilidade';

function permRotina(
  permissoes: Record<string, unknown> | null | undefined,
  rotinaId: string,
): Record<string, boolean> {
  const raw = permissoes?.[rotinaId];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, boolean>;
}

/** Gestão / propostas ou rotina Contratos com inclusão. */
export function usuarioPodeCriarContratoGestao(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  if (usuarioPodeVerTodasPropostasVenda(role, permissoes)) return true;
  const c = permRotina(permissoes, 'cli_contratos');
  return c.create === true || c.liberado === true;
}

/**
 * Cadastro de cliente com migração + contrato (atendente).
 * O banco valida `clientes.origem_canal = migracao` na hora do INSERT em assinaturas.
 */
export function usuarioPodeCriarContratoMigracaoCliente(
  permissoes?: Record<string, unknown> | null,
): boolean {
  const l = permRotina(permissoes, 'cli_lista');
  return l.create === true || l.liberado === true;
}

export function usuarioPodeConfirmarCadastroMigracao(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  return (
    usuarioPodeCriarContratoGestao(role, permissoes) ||
    usuarioPodeCriarContratoMigracaoCliente(permissoes)
  );
}

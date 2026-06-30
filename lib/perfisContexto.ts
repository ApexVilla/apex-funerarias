import { usuarioTemVisaoGrupoEconomico } from './userRoles';

/**
 * Perfis que podem alternar empresa do grupo e usar visão consolidada
 * (todas as unidades / todas as filiais). Abaixo de supervisão ficam na unidade do cadastro.
 */
export function podeVerVisaoConsolidadaGrupo(role?: string | null): boolean {
  return usuarioTemVisaoGrupoEconomico(role);
}

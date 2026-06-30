/** Cargos com acesso administrativo total — não podem ser função adicional. */
const ADMIN_ROLES = new Set([
  'admin',
  'admin_sistema',
  'admin_empresa',
  'super_admin',
  'administrador_geral',
]);

export function normalizarCodigoRole(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

/** Perfis com visão do grupo econômico (troca de unidade / dados consolidados). */
export const ROLES_VISAO_GRUPO_ECONOMICO = [
  'admin_sistema',
  'admin_empresa',
  'admin',
  'diretoria',
  'gerente',
  'supervisao',
  'gestor',
  'gestor_executivo',
  'gestao_executiva',
  'super_admin',
  'administrador_geral',
] as const;

export function usuarioTemVisaoGrupoEconomico(role?: string | null): boolean {
  const r = normalizarCodigoRole(role || '');
  return (ROLES_VISAO_GRUPO_ECONOMICO as readonly string[]).includes(r);
}

export function codigosCargoIguais(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizarCodigoRole(a || '') === normalizarCodigoRole(b || '');
}

export function usuarioPossuiCargo(
  primary: string | null | undefined,
  extras: string[] | null | undefined,
  codigo: string,
): boolean {
  if (codigosCargoIguais(primary, codigo)) return true;
  return (extras || []).some((r) => codigosCargoIguais(r, codigo));
}

export function removerCargoAdicionalUsuario(
  primary: string | null | undefined,
  extras: string[] | null | undefined,
  codigo: string,
): string[] {
  const alvo = normalizarCodigoRole(codigo);
  const filtrados = (extras || []).filter((r) => normalizarCodigoRole(r) !== alvo);
  return normalizarRolesExtra(primary, filtrados);
}

/** Funções adicionais válidas (sem repetir o cargo principal nem perfis admin). */
export function normalizarRolesExtra(
  primary: string | undefined | null,
  extras: string[] | null | undefined,
): string[] {
  const p = normalizarCodigoRole(primary || 'vendedor');
  const seen = new Set<string>([p]);
  const out: string[] = [];

  for (const item of extras || []) {
    const r = normalizarCodigoRole(item);
    if (!r || seen.has(r) || ADMIN_ROLES.has(r)) continue;
    seen.add(r);
    out.push(r);
  }

  return out;
}

/** Cargo principal + funções adicionais (sem duplicatas). */
export function rolesEfetivosUsuario(
  primary: string | undefined | null,
  extras?: string[] | null,
): string[] {
  const p = normalizarCodigoRole(primary || 'vendedor');
  return [p, ...normalizarRolesExtra(p, extras)];
}

export function usuarioTemAlgumRole(
  primary: string | undefined | null,
  extras: string[] | null | undefined,
  candidatos: readonly string[],
): boolean {
  const set = new Set(candidatos.map((c) => c.toLowerCase()));
  return rolesEfetivosUsuario(primary, extras).some((r) => set.has(r));
}

export function labelRolesExtras(
  extras: string[] | null | undefined,
  roleOptions: ReadonlyArray<{ value: string; label: string }>,
): string {
  if (!extras?.length) return '';
  return extras
    .map((r) => roleOptions.find((o) => o.value === r)?.label || r)
    .join(', ');
}

export const CARGO_PRIORITY: Record<string, number> = {
  diretoria: 10,
  gestor_executivo: 12,
  gestao_executiva: 15,
  gestao: 16,
  gerente: 20,
  supervisao: 30,
  financeiro: 40,
  rh: 45,
  atendente: 50,
  vendedor: 60,
  cobrador: 70,
  motorista: 80,
  agente_funerario: 90,
  agentes_funerarios: 91,
  estoquista: 100,
  recepcao: 110,
  auxiliar_servicos_gerais: 120,
  admin: 900,
  admin_empresa: 910,
  super_admin: 920,
  admin_sistema: 1000,
};

export function ordenarCargosPorHierarquia<T extends { codigo: string; nome?: string } | { value: string; label?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const codeA = 'codigo' in a ? a.codigo : (a as any).value;
    const codeB = 'codigo' in b ? b.codigo : (b as any).value;
    
    const priorityA = CARGO_PRIORITY[codeA] ?? 500;
    const priorityB = CARGO_PRIORITY[codeB] ?? 500;
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    const nameA = 'nome' in a ? a.nome : (a as any).label || '';
    const nameB = 'nome' in b ? b.nome : (b as any).label || '';
    return nameA.localeCompare(nameB);
  });
}

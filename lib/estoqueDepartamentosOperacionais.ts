/** Departamentos usados na baixa de estoque (saída) — operacionais da funerária. */
export const DEPARTAMENTOS_OPERACIONAIS_SAIDA = [
  'Almoxarifado',
  'Atendimento',
  'Clínica',
  'Velório',
] as const;

export type DepartamentoOperacionalSaida = (typeof DEPARTAMENTOS_OPERACIONAIS_SAIDA)[number];

export function normalizarNomeDepartamento(nome: string): string {
  return nome.trim().toLowerCase();
}

/** Garante os 4 departamentos operacionais no select (deduplica por nome). */
export function mesclarDepartamentosOperacionaisSaida<T extends { id: string; nome: string }>(
  lista: T[],
): { id: string; nome: string }[] {
  const allow = new Set(DEPARTAMENTOS_OPERACIONAIS_SAIDA.map((n) => normalizarNomeDepartamento(n)));
  const filtrados = lista.filter((d) => allow.has(normalizarNomeDepartamento(d.nome)));
  const porNome = new Map<string, { id: string; nome: string }>();

  for (const d of filtrados) {
    const chave = normalizarNomeDepartamento(d.nome);
    if (!porNome.has(chave)) porNome.set(chave, { id: d.id, nome: d.nome.trim() });
  }

  for (const nome of DEPARTAMENTOS_OPERACIONAIS_SAIDA) {
    const chave = normalizarNomeDepartamento(nome);
    if (!porNome.has(chave)) {
      porNome.set(chave, { id: `fallback-${chave}`, nome });
    }
  }

  return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

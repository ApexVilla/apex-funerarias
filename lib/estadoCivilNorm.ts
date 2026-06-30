/** Limite legado de `clientes.estado_civil` (varchar 20). */
export const ESTADO_CIVIL_MAX_DB = 20;

/** Normaliza estado civil da proposta/cadastro para caber no banco. */
export function normalizarEstadoCivilParaDb(value?: string | null): string | null {
  const bruto = String(value ?? '').trim();
  if (!bruto) return null;

  const chave = bruto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_');

  const aliases: Record<string, string> = {
    separado_judicialmente: 'separado_jud',
    separado_jud: 'separado_jud',
    'separado(a)_judicialmente': 'separado_jud',
    uniao_estavel: 'uniao_estavel',
    nao_informado: 'nao_informado',
    prefere_nao_informar: 'nao_informado',
  };

  const canon = aliases[chave] || chave;
  if (canon.length <= ESTADO_CIVIL_MAX_DB) return canon;
  return canon.slice(0, ESTADO_CIVIL_MAX_DB);
}

export function labelEstadoCivil(value?: string | null): string {
  const v = String(value ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    solteiro: 'Solteiro(a)',
    casado: 'Casado(a)',
    divorciado: 'Divorciado(a)',
    viuvo: 'Viúvo(a)',
    uniao_estavel: 'União estável',
    separado: 'Separado(a)',
    separado_jud: 'Separado(a) judicialmente',
    separado_judicialmente: 'Separado(a) judicialmente',
    convivente: 'Convivente',
    nao_informado: 'Prefere não informar',
  };
  return map[v] || value?.trim() || '—';
}

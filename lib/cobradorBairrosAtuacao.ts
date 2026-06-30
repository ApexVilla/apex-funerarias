/**
 * A partir do valor de área (ex.: "Catalão — GO"), extrai o trecho usado para
 * cruzar `endereco_cidade` / `endereco_cob_cidade` dos clientes e sugerir bairros.
 */
export function extrairTermoBuscaCidade(areaAtuacao: string): string {
  const t = (areaAtuacao || '').trim();
  if (!t) return '';
  const antesDaUf = t.split('—')[0]?.trim() || t;
  return antesDaUf.split(' - ')[0]?.trim() || antesDaUf;
}

/** Normaliza `bairros_atuacao` vindo do Postgres (`jsonb` ou legado em string). */
export function parseBairrosAtuacaoJsonb(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter(Boolean);
      }
    } catch {
      /* ignorar */
    }
  }
  return [];
}

/** Código completo do título (fin_contas_receber.codigo) para tooltip e logs. */
export function codigoCrCompleto(codigo?: string | null): string {
  const s = String(codigo ?? '').trim();
  return s || '—';
}

/**
 * Formato curto para listas (ex.: CR-2EF5…EE089).
 * Títulos antigos com UUID longo continuam únicos pelo sufixo.
 */
export function formatarCodigoCrExibicao(
  codigo?: string | null,
  opts?: { sufixo?: number },
): string {
  const raw = codigoCrCompleto(codigo);
  if (raw === '—') return raw;

  const sufixo = Math.max(4, Math.min(8, opts?.sufixo ?? 6));
  const m = /^CR-(.+)$/i.exec(raw);
  if (!m) {
    return raw.length > 14 ? `${raw.slice(0, 10)}…${raw.slice(-sufixo)}` : raw;
  }

  const corpo = m[1];
  if (corpo.length <= sufixo + 2) return raw.toUpperCase();

  return `CR-${corpo.slice(0, 4)}…${corpo.slice(-sufixo)}`.toUpperCase();
}

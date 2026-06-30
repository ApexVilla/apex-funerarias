/** Exibe centavos como moeda BR (ex.: 17550 → "175,50"). */
export function centavosParaInputMoeda(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Mantém só dígitos, vírgula e ponto. */
export function sanitizarTextoMoedaInput(v: string): string {
  return (v || '').replace(/[^\d,.]/g, '');
}

/**
 * Converte texto em centavos.
 * Sem vírgula/ponto: trata como reais (175 → R$ 175,00), não como centavos acumulados.
 */
export function parseInputMoedaParaCentavos(v: string): number {
  const trimmed = sanitizarTextoMoedaInput((v || '').trim());
  if (!trimmed) return 0;

  if (trimmed.includes(',')) {
    const [parteInteira = '', parteDecimal = ''] = trimmed.split(',');
    const inteiro = parteInteira.replace(/\D/g, '') || '0';
    const dec = parteDecimal.replace(/\D/g, '').slice(0, 2);
    const reais = Number(`${inteiro}.${dec.padEnd(2, '0').slice(0, 2)}`);
    if (Number.isNaN(reais) || reais < 0) return 0;
    return Math.round(reais * 100);
  }

  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length === 2 && parts[1].length <= 2) {
      const reais = Number(trimmed);
      if (Number.isNaN(reais) || reais < 0) return 0;
      return Math.round(reais * 100);
    }
    const reais = Number(trimmed.replace(/\./g, ''));
    if (Number.isNaN(reais) || reais < 0) return 0;
    return Math.round(reais * 100);
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) * 100;
}

/** Formata ao sair do campo (blur). */
export function formatarMoedaInputAoSair(v: string): string {
  const centavos = parseInputMoedaParaCentavos(v);
  if (!v.trim()) return '';
  return centavosParaInputMoeda(centavos);
}

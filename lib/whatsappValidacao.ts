/**
 * Utilitários para validação de número de telefone e identificação de WhatsApp no Brasil.
 */

/**
 * Valida se um número de telefone é um celular brasileiro elegível para WhatsApp.
 * Regras:
 * - Deve ter 10 ou 11 dígitos após remover formatações.
 * - Ignora o código do país '55' no início se estiver presente.
 * - Celular de 11 dígitos no Brasil deve iniciar com '9' após o DDD.
 * - Celular de 10 dígitos (antigo ou em áreas sem 9 extra) geralmente começa com '9', '8', '7' ou '6' após o DDD.
 */
export function validarWhatsapp(telefone?: string | null): boolean {
  if (!telefone) return false;

  const digits = telefone.replace(/\D/g, '');

  let clean = digits;
  if (clean.startsWith('55') && clean.length > 10) {
    clean = clean.substring(2);
  }
  clean = clean.replace(/^0+/, '');

  if (clean.length === 11) {
    return clean[2] === '9';
  }

  if (clean.length === 10) {
    const primeiroDigitoNumero = clean[2];
    return ['9', '8', '7', '6'].includes(primeiroDigitoNumero);
  }

  return false;
}

/**
 * Formato internacional exigido pelo wa.me: 55 + DDD + número (12 ou 13 dígitos no total).
 * Trata máscaras, DDI duplicado e zero à esquerda (ex.: 062...).
 */
export function normalizarNumeroWhatsappInternacional(telefone?: string | null): string {
  if (!telefone) return '';

  let digits = telefone.replace(/\D/g, '');
  if (!digits) return '';

  digits = digits.replace(/^0+/, '');
  if (!digits) return '';

  if (digits.startsWith('55')) {
    const local = digits.slice(2).replace(/^0+/, '');
    if (local.length === 10 || local.length === 11) {
      return `55${local}`;
    }
    if (digits.length === 12 || digits.length === 13) {
      return digits;
    }
    digits = local;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (digits.length >= 12 && digits.startsWith('55')) {
    return digits;
  }

  return `55${digits}`;
}

/** Primeiro telefone informado que normaliza para link wa.me. */
export function resolverTelefoneWhatsapp(
  ...telefones: Array<string | null | undefined>
): string {
  for (const tel of telefones) {
    const norm = normalizarNumeroWhatsappInternacional(tel);
    if (norm.length >= 12) return norm;
  }
  return '';
}

/**
 * Retorna o link para abrir conversa no WhatsApp.
 * Adiciona automaticamente o código de país '55' caso não esteja presente.
 */
export function obterUrlWhatsapp(telefone?: string | null, mensagem?: string): string {
  const digits = normalizarNumeroWhatsappInternacional(telefone);
  if (!digits) return '';

  const base = `https://wa.me/${digits}`;
  if (mensagem) {
    return `${base}?text=${encodeURIComponent(mensagem)}`;
  }
  return base;
}

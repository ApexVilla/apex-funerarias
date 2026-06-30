/**
 * Escapa caracteres HTML perigosos para uso seguro em interpolação de templates
 * que serão injetados via innerHTML / document.write (previne XSS armazenado em
 * nomes de produtos, observações, responsáveis, etc.).
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

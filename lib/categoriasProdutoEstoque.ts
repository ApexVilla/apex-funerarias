/** Categorias padronizadas de produtos do estoque (`ser_produtos.categoria`). */

export const CATEGORIAS_PRODUTO_ESTOQUE = [
  { value: 'urnas', label: 'Urnas' },
  { value: 'floricultura', label: 'Floricultura' },
  { value: 'velorio', label: 'Velório' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'almoxarifado', label: 'Almoxarifado' },
  { value: 'kit_lanche', label: 'Kit Lanche' },
] as const;

export type CategoriaProdutoEstoqueValor = (typeof CATEGORIAS_PRODUTO_ESTOQUE)[number]['value'];

export const VALORES_CATEGORIAS_PRODUTO_ESTOQUE: CategoriaProdutoEstoqueValor[] =
  CATEGORIAS_PRODUTO_ESTOQUE.map((c) => c.value);

export function labelCategoriaProdutoEstoque(value?: string | null): string {
  const v = (value || '').trim();
  const found = CATEGORIAS_PRODUTO_ESTOQUE.find((c) => c.value === v);
  return found?.label || v || '—';
}

import type { CobradorOpcao } from './cobradorDisponiveis';

/** Cobrador virtual para carteira do escritório (pagamento na unidade). */
export const COBRADOR_ESCRITORIO_ID = '__escritorio__';
export const COBRADOR_ESCRITORIO_LABEL = 'Escritório';

export function isCobradorEscritorio(cobradorId: string | null | undefined): boolean {
  return (cobradorId || '').trim() === COBRADOR_ESCRITORIO_ID;
}

/** Inclui Escritório no início da lista de cobradores (como na lista de vendedores). */
export function cobradorOpcoesComEscritorio(lista: CobradorOpcao[]): CobradorOpcao[] {
  const base = lista.filter((c) => c.id !== COBRADOR_ESCRITORIO_ID);
  return [{ id: COBRADOR_ESCRITORIO_ID, nome: COBRADOR_ESCRITORIO_LABEL }, ...base];
}

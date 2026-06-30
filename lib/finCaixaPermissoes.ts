/**
 * Permissões de caixa: catálogo (Config → Permissões) + vínculos por conta (Contas Bancárias → Operadores).
 */

import type { ContaBancaria } from './FinanceiroStore';

const ROLES_GESTAO_FINANCEIRA = [
  'admin',
  'admin_empresa',
  'admin_sistema',
  'administrador_geral',
  'super_admin',
  'gerente',
  'gestor',
  'gestor_executivo',
  'diretoria',
  'supervisao',
  'financeiro',
] as const;

export function lerAcaoPermissao(
  permissoes: Record<string, unknown> | null | undefined,
  rotinaId: string,
  acaoId: string,
): boolean {
  if (!permissoes || typeof permissoes !== 'object') return false;
  const rot = permissoes[rotinaId];
  if (!rot || typeof rot !== 'object' || Array.isArray(rot)) return false;
  return (rot as Record<string, unknown>)[acaoId] === true;
}

export function usuarioEhGestorFinanceiro(role?: string | null): boolean {
  return ROLES_GESTAO_FINANCEIRA.includes(
    (role || '').toLowerCase() as (typeof ROLES_GESTAO_FINANCEIRA)[number],
  );
}

/** Ver e operar todos os caixas da unidade (gestores ou permissão explícita no sistema). */
export function usuarioPodeVerTodosCaixas(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  if (usuarioEhGestorFinanceiro(role)) return true;
  if (lerAcaoPermissao(permissoes, 'fin_tesouraria', 'ver_todos_caixas')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_contas_bancarias', 'liberado')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_contas_bancarias', 'edit')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_contas_bancarias', 'create')) return true;
  return false;
}

export function usuarioPodeAcessarTesouraria(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  if (usuarioPodeVerTodosCaixas(role, permissoes)) return true;
  if (lerAcaoPermissao(permissoes, 'fin_tesouraria', 'view')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_tesouraria', 'liberado')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_tesouraria', 'abrir_caixa')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_tesouraria', 'fechar_caixa')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_tesouraria', 'create')) return true;
  return false;
}

/** Abrir/fechar caixa manualmente na Tesouraria (gestores ou permissão explícita). */
export function usuarioPodeAbrirCaixaManualmente(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  if (usuarioEhGestorFinanceiro(role)) return true;
  if (usuarioPodeVerTodosCaixas(role, permissoes)) return true;
  if (lerAcaoPermissao(permissoes, 'fin_tesouraria', 'abrir_caixa')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_tesouraria', 'fechar_caixa')) return true;
  return false;
}

/** Acesso à tela Baixa de Parcelas (balcão) — independente da Tesouraria. */
export function usuarioPodeAcessarBaixaParcelas(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  if (usuarioEhGestorFinanceiro(role)) return true;
  if (['cobrador', 'recepcao'].includes((role || '').toLowerCase())) return true;
  if (usuarioPodeAcessarTesouraria(role, permissoes)) return true;
  if (lerAcaoPermissao(permissoes, 'fin_baixa_parcelas', 'view')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_baixa_parcelas', 'liberado')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_baixa_parcelas', 'baixar')) return true;
  return false;
}

export function usuarioPodeExecutarBaixaParcelas(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  if (usuarioEhGestorFinanceiro(role)) return true;
  if (['cobrador', 'recepcao'].includes((role || '').toLowerCase())) return true;
  if (lerAcaoPermissao(permissoes, 'fin_baixa_parcelas', 'baixar')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_baixa_parcelas', 'liberado')) return true;
  return usuarioPodeAcessarTesouraria(role, permissoes);
}

/**
 * Balcão (recepção, cobrador, etc.): abre o dia do caixa ao baixar, sem ir à Tesouraria.
 * Quem tem `abrir_caixa` continua vendo o modal de confirmação.
 */
export function usuarioDeveAbrirCaixaAutomaticamenteNaBaixa(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  if (!usuarioPodeExecutarBaixaParcelas(role, permissoes)) return false;
  return !usuarioPodeAbrirCaixaManualmente(role, permissoes);
}

/** Estorno de recebimento (parcela) a partir da Tesouraria ou Contas a Receber. */
export function usuarioPodeEstornarBaixaReceber(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  if (usuarioEhGestorFinanceiro(role)) return true;
  if (lerAcaoPermissao(permissoes, 'fin_receber', 'estornar')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_receber', 'baixar')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_baixa_parcelas', 'baixar')) return true;
  if (lerAcaoPermissao(permissoes, 'fin_baixa_parcelas', 'liberado')) return true;
  return false;
}

type MovimentoCaixaRef = {
  tipo?: string | null;
  referencia_id?: string | null;
  referencia_tipo?: string | null;
  descricao?: string | null;
};

export function movimentoEhBaixaContaReceber(mov: MovimentoCaixaRef): boolean {
  if (mov.tipo !== 'entrada') return false;
  const desc = (mov.descricao || '').toLowerCase();
  if (desc.includes('estorno de recebimento')) return false;
  if (mov.referencia_tipo === 'fin_contas_receber' && mov.referencia_id) return true;
  if (mov.referencia_id && desc.includes('recebimento')) return true;
  return false;
}

export function resolverContaReceberIdDoMovimentoCaixa(mov: MovimentoCaixaRef): string | null {
  if (!mov.referencia_id) return null;
  if (mov.referencia_tipo === 'fin_contas_receber') return mov.referencia_id;
  if (!mov.referencia_tipo && (mov.descricao || '').toLowerCase().includes('recebimento')) {
    return mov.referencia_id;
  }
  return null;
}

export function usuarioPodeGerenciarVinculosCaixa(
  role?: string | null,
  permissoes?: Record<string, unknown> | null,
): boolean {
  return usuarioPodeVerTodosCaixas(role, permissoes);
}

export function usuarioPodeVerConta(
  conta: Pick<ContaBancaria, 'autorizados_visualizacao' | 'autorizados_operacao'>,
  userId?: string | null,
  verTodosCaixas = false,
): boolean {
  if (verTodosCaixas) return true;
  if (!userId) return false;
  const visualizacao = conta.autorizados_visualizacao || [];
  const operacao = conta.autorizados_operacao || [];
  if (visualizacao.length === 0 && operacao.length === 0) return true;
  if (visualizacao.includes(userId)) return true;
  if (operacao.includes(userId)) return true;
  return false;
}

export function usuarioPodeOperarConta(
  conta: Pick<ContaBancaria, 'autorizados_operacao' | 'autorizados_visualizacao'>,
  userId?: string | null,
  verTodosCaixas = false,
): boolean {
  if (verTodosCaixas) return true;
  if (!userId) return false;
  const operacao = conta.autorizados_operacao || [];
  if (operacao.length > 0) return operacao.includes(userId);
  const visualizacao = conta.autorizados_visualizacao || [];
  if (visualizacao.length > 0) return visualizacao.includes(userId);
  return true;
}

export function usuarioPodeTransferirConta(
  conta: Pick<ContaBancaria, 'autorizados_transferencia'>,
  userId?: string | null,
  verTodosCaixas = false,
): boolean {
  if (verTodosCaixas) return true;
  if (!userId) return false;
  const allowed = conta.autorizados_transferencia || [];
  return allowed.length === 0 || allowed.includes(userId);
}

export function filtrarContasVisiveis<T extends ContaBancaria>(
  contas: T[],
  userId?: string | null,
  verTodosCaixas = false,
): T[] {
  return contas.filter((c) => usuarioPodeVerConta(c, userId, verTodosCaixas));
}

export function filtrarContasOperaveis<T extends ContaBancaria>(
  contas: T[],
  userId?: string | null,
  verTodosCaixas = false,
): T[] {
  return contas.filter((c) => c.ativo && usuarioPodeOperarConta(c, userId, verTodosCaixas));
}

/** Conta padrão para recebimento no balcão: caixa do operador, não a corrente principal. */
export function resolverContaCaixaPadrao<T extends ContaBancaria>(
  contas: T[],
  userId?: string | null,
  verTodosCaixas = false,
): T | null {
  const operaveis = filtrarContasOperaveis(contas, userId, verTodosCaixas);
  if (operaveis.length === 0) return null;

  const caixas = operaveis.filter((c) => (c.tipo || '').toLowerCase() === 'caixa');
  if (caixas.length === 1) return caixas[0];
  if (caixas.length > 1) {
    const dedicado = caixas.find((c) => {
      const ops = c.autorizados_operacao || [];
      return ops.length > 0 && userId != null && ops.includes(userId);
    });
    if (dedicado) return dedicado;
    return caixas[0];
  }

  return operaveis.find((c) => c.principal) || operaveis[0];
}

/** Dinheiro/espécie no balcão. */
export function formaEhEspecie(tipoOuNome?: string | null): boolean {
  const t = String(tipoOuNome || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ['dinheiro', 'especie', 'espécie'].includes(t);
}

/**
 * PIX recebido no balcão — entra no caixa da recepção.
 * O lançamento pendente na conta bancária (para conciliação) fica a cargo do financeiro.
 */
export function formaEhPix(tipoOuNome?: string | null): boolean {
  return String(tipoOuNome || '').toLowerCase().includes('pix');
}

/** Conta corrente principal para conciliação bancária (cartão, boleto, transferência). */
export function resolverContaPrincipal<T extends ContaBancaria>(
  contas: T[],
  userId?: string | null,
  verTodosCaixas = false,
): T | null {
  const operaveis = filtrarContasOperaveis(contas, userId, verTodosCaixas);
  return (
    operaveis.find((c) => c.principal) ||
    operaveis.find((c) => (c.tipo || '').toLowerCase() === 'corrente') ||
    operaveis[0] ||
    null
  );
}

/**
 * Destino do saldo na baixa:
 *   espécie / PIX → caixa do operador (recepção controla o físico)
 *   cartão / boleto / outros → conta corrente principal (conciliação bancária direta)
 */
export function resolverContaDestinoBaixa<T extends ContaBancaria>(
  contas: T[],
  formaTipoOuNome: string | null | undefined,
  userId?: string | null,
  verTodosCaixas = false,
): T | null {
  if (formaEhEspecie(formaTipoOuNome) || formaEhPix(formaTipoOuNome)) {
    return resolverContaCaixaPadrao(contas, userId, verTodosCaixas);
  }
  return resolverContaPrincipal(contas, userId, verTodosCaixas);
}

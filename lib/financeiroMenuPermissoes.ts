import { usuarioPodeVerModulo, usuarioPodeVerRotina } from './acessoModulos';
import {
  usuarioEhGestorFinanceiro,
  usuarioPodeAcessarBaixaParcelas,
} from './finCaixaPermissoes';

/** Caminho do menu financeiro → rotina do catálogo de permissões. */
export const FINANCEIRO_PATH_ROTINA: Record<string, string> = {
  '/financeiro/dashboard': 'fin_dashboard',
  '/financeiro/baixa-parcelas': 'fin_baixa_parcelas',
  '/financeiro/importacao-ofx': 'fin_ofx',
  '/financeiro/cobranca': 'fin_cobranca',
  '/financeiro/tesouraria': 'fin_tesouraria',
  '/financeiro/contas-receber': 'fin_receber',
  '/financeiro/contas-pagar': 'fin_pagar',
  '/financeiro/fluxo-caixa': 'fin_fluxo',
  '/financeiro/contas-bancarias': 'fin_contas_bancarias',
  '/financeiro/plano-contas': 'fin_plano_contas',
  '/financeiro/naturezas': 'fin_plano_contas',
  '/financeiro/centros-custo': 'fin_centros_custo',
  '/financeiro/dre': 'fin_dre',
};

export function usuarioPodeAcessarRotinaFinanceiraPorPath(
  role: string | null | undefined,
  permissoes: Record<string, unknown> | null | undefined,
  path: string,
): boolean {
  if (usuarioEhGestorFinanceiro(role)) return true;

  const rotinaId = FINANCEIRO_PATH_ROTINA[path];
  if (!rotinaId) {
    return usuarioPodeVerModulo(role, permissoes, 'financeiro');
  }
  if (rotinaId === 'fin_baixa_parcelas') {
    return usuarioPodeAcessarBaixaParcelas(role, permissoes);
  }
  return usuarioPodeVerRotina(permissoes, rotinaId);
}

/** Menu hub `/financeiro` — gestores ou qualquer rotina financeira liberada (ex.: só baixa). */
export function usuarioPodeAcessarHubFinanceiro(
  role: string | null | undefined,
  permissoes: Record<string, unknown> | null | undefined,
): boolean {
  if (usuarioEhGestorFinanceiro(role)) return true;
  if (usuarioPodeVerModulo(role, permissoes, 'financeiro')) return true;
  return Object.keys(FINANCEIRO_PATH_ROTINA).some((path) =>
    usuarioPodeAcessarRotinaFinanceiraPorPath(role, permissoes, path),
  );
}

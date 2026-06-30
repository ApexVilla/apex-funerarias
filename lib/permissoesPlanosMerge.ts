import type { PermissoesUsuario } from './PlanosStore';
import { usuarioPossuiMatrizGranular } from './acessoModulos';

function rotinaFlags(matriz: Record<string, unknown>, rotinaId: string): Record<string, boolean> | null {
  const v = matriz[rotinaId];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, boolean>;
}

function anyActionTrue(o: Record<string, boolean> | null): boolean {
  if (!o) return false;
  return Object.values(o).some((v) => v === true);
}

function hasOwn(matriz: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(matriz, key);
}

/**
 * Sobrepõe o retorno da RPC `obter_permissoes_usuario` com a matriz JSON de
 * `users.permissoes` (rotinas planos_gerencia, planos_categorias, vendas_propostas, vendas),
 * quando a matriz granular estiver ativa — evita divergência entre Configurações e Planos.
 */
export function mergePermissoesUsuarioComMatrizJson(
  rpc: PermissoesUsuario | null,
  matriz: Record<string, unknown> | null | undefined,
): PermissoesUsuario | null {
  if (!rpc) return null;
  if (!matriz || typeof matriz !== 'object') return rpc;
  if (!usuarioPossuiMatrizGranular(matriz)) return rpc;

  const out: PermissoesUsuario = { ...rpc };

  if (hasOwn(matriz, 'planos_gerencia')) {
    const o = rotinaFlags(matriz, 'planos_gerencia');
    const lib = !!(o?.liberado);
    out.pode_visualizar_plano = lib || !!(o?.view);
    out.pode_criar_plano = lib || !!(o?.create);
    out.pode_editar_plano = lib || !!(o?.edit);
    out.pode_desativar_plano = lib || !!(o?.delete);
  }

  if (hasOwn(matriz, 'planos_categorias')) {
    const o = rotinaFlags(matriz, 'planos_categorias');
    const catView = !!(o && (o.liberado || o.view));
    const catEdit = !!(o && (o.liberado || o.edit));
    out.pode_visualizar_plano = out.pode_visualizar_plano || catView;
    out.pode_editar_plano = out.pode_editar_plano || catEdit;
  }

  if (hasOwn(matriz, 'vendas_propostas') || hasOwn(matriz, 'vendas')) {
    const vp = rotinaFlags(matriz, 'vendas_propostas');
    const leg = matriz.vendas as Record<string, boolean> | undefined;
    const fromVp = anyActionTrue(vp);
    const fromLeg = leg && typeof leg === 'object' && !Array.isArray(leg) ? anyActionTrue(leg) : false;
    out.pode_vender_plano = fromVp || fromLeg;
  }

  return out;
}

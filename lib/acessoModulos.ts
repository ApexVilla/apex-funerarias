/**
 * Matriz de permissões em `users.permissoes` usa IDs de ROTINAS (ex.: fin_receber),
 * igual ao catálogo em `permissoesCatalog.ts`. Este módulo traduz módulo → rotinas
 * e decide se o menu deve aparecer, respeitando desmarcações mesmo quando o perfil
 * (role) liberaria.
 */

import { MODULES, montarSnapshotCompletoPermissoes } from './permissoesCatalog';
import { usuarioPodeAcessarBaixaParcelas } from './finCaixaPermissoes';
import { normalizarRolesExtra, rolesEfetivosUsuario } from './userRoles';
import { CHAVE_NIVEL_PADRAO, extrairNivelPadrao } from './permissoesNiveis';

export const ROLE_DEFAULT_MODULE_ACCESS: Record<string, string[]> = {
  admin: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'config', 'rh', 'comissoes'],
  admin_sistema: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'config', 'rh', 'comissoes'],
  admin_empresa: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'config', 'rh', 'comissoes'],
  gerente: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'rh', 'comissoes'],
  diretoria: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'rh', 'comissoes'],
  gestor_executivo: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'rh', 'comissoes'],
  gestao_executiva: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'rh', 'comissoes'],
  supervisao: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'rh', 'comissoes'],
  gestor: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'rh', 'comissoes'],
  super_admin: ['dashboard', 'atendimentos', 'planos', 'clientes', 'crm', 'vendas', 'estoque', 'frota', 'cobradores', 'ponto', 'documentos', 'financeiro', 'relatorios', 'config', 'rh', 'comissoes'],
  gerente_documentos: ['dashboard', 'documentos'],
  /** Financeiro: módulo financeiro + relatórios; sem painel executivo (Início continua como hub). */
  financeiro: ['financeiro', 'relatorios', 'comissoes'],
  cobrador: ['cobradores', 'ponto', 'vendas', 'comissoes'],
  estoquista: ['dashboard', 'estoque'],
  motorista: ['dashboard', 'frota'],
  rh: ['dashboard', 'rh', 'comissoes', 'ponto'],
  agentes_funerarios: ['atendimentos', 'clientes', 'frota', 'documentos', 'ponto', 'comissoes'],
  agente_funerario: ['atendimentos', 'clientes', 'frota', 'documentos', 'ponto', 'comissoes'],
  /** Vendas + ponto; config (perfil/senha) aparece no menu para qualquer usuário logado. */
  vendedor: ['vendas', 'ponto', 'comissoes'],
  /** Frota: veículos/viagens no fluxo de atendimento; matriz granular continua podendo restringir rotina a rotina. */
  atendente: ['atendimentos', 'clientes', 'frota', 'ponto', 'comissoes'],
  /** Recepção: clientes + baixa no balcão (rotinas financeiras só via defaults explícitos). */
  recepcao: ['clientes'],
};

/** Rotinas por módulo — derivado do catálogo único `MODULES`. */
export const MODULO_PARA_ROTINAS: Record<string, readonly string[]> = Object.fromEntries(
  MODULES.map((m) => [m.id, m.rotinas.map((r) => r.id)] as [string, readonly string[]]),
);

/**
 * Quando o usuário ainda não tem matriz salva no banco: monta o mesmo conjunto de
 * rotinas que o menu usaria pelo cargo (tudo true nas rotinas permitidas, resto false),
 * para o modal de permissões bater com a experiência real da usuária (ex.: gerente).
 */
export function permissoesImplicitasDoCargoParaFormulario(
  role: string | undefined | null,
): Record<string, Record<string, boolean>> {
  const r = (role || '').toLowerCase();
  const perms: Record<string, Record<string, boolean>> = {};

  if (r === 'admin' || r === 'admin_sistema' || r === 'admin_empresa') {
    for (const mod of MODULES) {
      for (const rot of mod.rotinas) {
        perms[rot.id] = rot.acoes.reduce((acc, a) => ({ ...acc, [a.id]: true }), {} as Record<string, boolean>);
      }
    }
    return montarSnapshotCompletoPermissoes(perms as Record<string, unknown>) as Record<
      string,
      Record<string, boolean>
    >;
  }

  const moduleIds = ROLE_DEFAULT_MODULE_ACCESS[r] || [];
  for (const mid of moduleIds) {
    const mod = MODULES.find((m) => m.id === mid);
    if (!mod) continue;
    for (const rot of mod.rotinas) {
      perms[rot.id] = rot.acoes.reduce((acc, a) => ({ ...acc, [a.id]: true }), {} as Record<string, boolean>);
    }
  }
  return montarSnapshotCompletoPermissoes(perms as Record<string, unknown>) as Record<
    string,
    Record<string, boolean>
  >;
}

const IGNORE_CHAVES_MATRIZ = new Set(['ponto_config', 'empresas_contexto', CHAVE_NIVEL_PADRAO]);

const ALL_ROTINAS_IDS = new Set(
  Object.values(MODULO_PARA_ROTINAS).flatMap((ids) => [...ids]),
);

function objetoPermissaoTemAlgumTrue(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.values(obj as Record<string, unknown>).some((v) => v === true);
}

const PONTO_ROLES_PADRAO = [
  'supervisao',
  'gerente',
  'diretoria',
  'gestor_executivo',
  'gestao_executiva',
  'gestor',
  'admin',
  'admin_sistema',
  'admin_empresa',
  'super_admin',
  'cobrador',
  'rh',
] as const;

/** Rotina individual (ex.: ponto_registro) com ao menos uma ação liberada. */
export function usuarioPodeVerRotina(
  permissoes: Record<string, unknown> | null | undefined,
  rotinaId: string,
): boolean {
  if (!permissoes || typeof permissoes !== 'object') return false;
  return objetoPermissaoTemAlgumTrue(permissoes[rotinaId]);
}

/** Alguma rotina do módulo tem ao menos uma ação liberada (view, liberado, etc.) */
export function moduloTemPermissaoExplicita(
  permissoes: Record<string, unknown> | null | undefined,
  moduloId: string,
): boolean {
  if (!permissoes || typeof permissoes !== 'object') return false;
  const rotinas = MODULO_PARA_ROTINAS[moduloId];
  if (!rotinas) return false;
  for (const rid of rotinas) {
    if (objetoPermissaoTemAlgumTrue(permissoes[rid])) return true;
  }
  if (moduloId === 'vendas' && objetoPermissaoTemAlgumTrue(permissoes.vendas)) {
    return true;
  }
  return false;
}

/**
 * True se existe matriz salva com ao menos uma rotina/ação liberada.
 * Chaves só com `false` (snapshot completo vazio) não ativam modo restritivo — o cargo padrão continua valendo.
 */
export function usuarioPossuiMatrizGranular(
  permissoes: Record<string, unknown> | null | undefined,
): boolean {
  if (!permissoes || typeof permissoes !== 'object') return false;
  return Object.keys(permissoes).some((k) => {
    if (IGNORE_CHAVES_MATRIZ.has(k)) return false;
    if (k === 'vendas') return objetoPermissaoTemAlgumTrue(permissoes.vendas);
    if (!ALL_ROTINAS_IDS.has(k)) return false;
    return objetoPermissaoTemAlgumTrue(permissoes[k]);
  });
}

const MODULOS_TETO_VENDEDOR = new Set(['vendas', 'ponto', 'comissoes']);
const MODULOS_TETO_COBRADOR = new Set(['cobradores', 'ponto', 'vendas', 'comissoes', 'financeiro']);

/**
 * Limita cobrador aos módulos operacionais de campo. Rotinas de clientes/CRM só entram
 * se o admin marcou explicitamente no JSON salvo (`rawSalvo`).
 */
export function aplicarTetoPermissoesCobrador(
  permissoes: Record<string, unknown>,
  rawSalvo?: Record<string, unknown>,
): Record<string, unknown> {
  const allowedRotinas = new Set<string>();
  for (const modId of MODULOS_TETO_COBRADOR) {
    for (const rid of MODULO_PARA_ROTINAS[modId] || []) {
      allowedRotinas.add(rid);
    }
  }

  const out = montarSnapshotCompletoPermissoes(permissoes);

  for (const mod of MODULES) {
    for (const rot of mod.rotinas) {
      if (allowedRotinas.has(rot.id)) continue;
      if (rawSalvo && usuarioPodeVerRotina(rawSalvo, rot.id)) continue;
      out[rot.id] = rot.acoes.reduce<Record<string, boolean>>(
        (acc, a) => ({ ...acc, [a.id]: false }),
        {},
      );
    }
  }

  for (const cfgId of ['cfg_empresa', 'cfg_usuarios'] as const) {
    if (rawSalvo && usuarioPodeVerRotina(rawSalvo, cfgId)) continue;
    const cfg = out[cfgId];
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      out[cfgId] = Object.keys(cfg as Record<string, boolean>).reduce<Record<string, boolean>>(
        (acc, k) => ({ ...acc, [k]: false }),
        {},
      );
    }
  }

  return out;
}

/**
 * Limita vendedor a vendas/ponto/comissões por padrão, mas preserva rotinas que o admin
 * liberou explicitamente no banco (`rawSalvo`) e módulos das funções adicionais (`rolesExtra`).
 * Sempre bloqueia ações administrativas sensíveis.
 */
export function aplicarTetoPermissoesVendedor(
  permissoes: Record<string, unknown>,
  rawSalvo?: Record<string, unknown>,
  rolesExtra?: string[] | null,
): Record<string, unknown> {
  const allowedRotinas = new Set<string>();
  const modulosPermitidos = new Set<string>(MODULOS_TETO_VENDEDOR);
  for (const extra of normalizarRolesExtra('vendedor', rolesExtra)) {
    for (const modId of ROLE_DEFAULT_MODULE_ACCESS[extra] || []) {
      modulosPermitidos.add(modId);
    }
  }
  for (const modId of modulosPermitidos) {
    for (const rid of MODULO_PARA_ROTINAS[modId] || []) {
      allowedRotinas.add(rid);
    }
  }

  const out = montarSnapshotCompletoPermissoes(permissoes);

  for (const mod of MODULES) {
    for (const rot of mod.rotinas) {
      if (allowedRotinas.has(rot.id)) continue;
      if (rawSalvo && usuarioPodeVerRotina(rawSalvo, rot.id)) continue;
      out[rot.id] = rot.acoes.reduce<Record<string, boolean>>(
        (acc, a) => ({ ...acc, [a.id]: false }),
        {},
      );
    }
  }

  const propostas = out.vendas_propostas;
  if (propostas && typeof propostas === 'object' && !Array.isArray(propostas)) {
    out.vendas_propostas = {
      ...(propostas as Record<string, boolean>),
      view_todos: false,
      confirm: false,
    };
  }

  const pontoEspelho = out.ponto_espelho;
  if (pontoEspelho && typeof pontoEspelho === 'object' && !Array.isArray(pontoEspelho)) {
    out.ponto_espelho = {
      ...(pontoEspelho as Record<string, boolean>),
      view_todos: false,
    };
  }

  for (const cfgId of ['cfg_empresa', 'cfg_usuarios'] as const) {
    const cfg = out[cfgId];
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      out[cfgId] = Object.keys(cfg as Record<string, boolean>).reduce<Record<string, boolean>>(
        (acc, k) => ({ ...acc, [k]: false }),
        {},
      );
    }
  }

  return out;
}

export function usuarioPodeVerModulo(
  role: string | null | undefined,
  permissoes: Record<string, unknown> | null | undefined,
  moduloId: string,
  rolesExtra?: string[] | null,
): boolean {
  const roles = rolesEfetivosUsuario(role, rolesExtra);
  return roles.some((r) => usuarioPodeVerModuloPorCargo(r, permissoes, moduloId));
}

function usuarioPodeVerModuloPorCargo(
  role: string | null | undefined,
  permissoes: Record<string, unknown> | null | undefined,
  moduloId: string,
): boolean {
  const r = (role || '').toLowerCase();
  const nivelPadrao = extrairNivelPadrao(permissoes);
  const granular = usuarioPossuiMatrizGranular(permissoes);

  /** Com nível padrão + matriz resolvida: menu só pelo JSON de permissões, não pelo cargo. */
  if (nivelPadrao && granular) {
    return moduloTemPermissaoExplicita(permissoes, moduloId);
  }

  /** Administrador geral, administrador de sistema e administrador da empresa: acesso total; matriz não restringe o menu. */
  if (r === 'admin' || r === 'admin_sistema' || r === 'admin_empresa') return true;

  /** Painel executivo: cargos operacionais e financeiro nunca, mesmo com JSON legado na sessão. */
  const semPainelExecutivo =
    r === 'financeiro' ||
    r === 'atendente' ||
    r === 'agentes_funerarios' ||
    r === 'agente_funerario';
  if (semPainelExecutivo && moduloId === 'dashboard') return false;

  /** Ponto: vendedor/atendente etc. entram pela matriz (ponto_registro / ponto_espelho), não só pelo cargo. */
  if (moduloId === 'ponto') {
    if (moduloTemPermissaoExplicita(permissoes, 'ponto')) return true;
    if ((PONTO_ROLES_PADRAO as readonly string[]).includes(r)) return true;
    if (granular) return false;
    return (ROLE_DEFAULT_MODULE_ACCESS[r] || []).includes('ponto');
  }

  /** Cobrador: módulo Financeiro só se tiver ao menos uma rotina financeira (padrão: baixa de parcelas). */
  if (moduloId === 'financeiro' && r === 'cobrador') {
    if (granular) {
      return moduloTemPermissaoExplicita(permissoes, 'financeiro');
    }
    return true;
  }

  /** Atendente / agente: menu Financeiro quando tiver Baixa de parcelas (ou outra rotina fin). */
  if (
    moduloId === 'financeiro'
    && (r === 'atendente' || r === 'agentes_funerarios' || r === 'agente_funerario')
  ) {
    if (usuarioPodeAcessarBaixaParcelas(role, permissoes)) return true;
    if (granular) {
      return moduloTemPermissaoExplicita(permissoes, 'financeiro');
    }
    return false;
  }

  const roleModules = ROLE_DEFAULT_MODULE_ACCESS[r] || [];
  const roleAllows = roleModules.includes(moduloId);
  const explicit = moduloTemPermissaoExplicita(permissoes, moduloId);

  if (granular) {
    return explicit;
  }
  return roleAllows || explicit;
}

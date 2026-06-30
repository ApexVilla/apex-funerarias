/**
 * Uma única fonte de verdade para o JSON de permissões usado no menu / início
 * e no modal de Configurações — evita divergência (ex.: matriz vazia vs preview do cargo).
 */

import { MODULES, montarSnapshotCompletoPermissoes } from './permissoesCatalog';
import { CHAVE_EMPRESAS_CONTEXTO } from './empresasContextoUsuario';
import {
  aplicarTetoPermissoesVendedor,
  aplicarTetoPermissoesCobrador,
  usuarioPossuiMatrizGranular,
  permissoesImplicitasDoCargoParaFormulario,
  usuarioPodeVerRotina,
} from './acessoModulos';
import { rolesEfetivosUsuario } from './userRoles';
import { CHAVE_NIVEL_PADRAO, extrairNivelPadrao, montarPermissoesNivel } from './permissoesNiveis';

/** Defaults por cargo usados quando ainda não há matriz granular salva (espelha ConfigPage). */
export function getDefaultPermsForRole(role: string): Record<string, Record<string, boolean>> {
  const perms: Record<string, Record<string, boolean>> = {};
  const setAll = (rotinaId: string, acoes: Array<{ id: string }>) => {
    perms[rotinaId] = acoes.reduce<Record<string, boolean>>((acc, a) => {
      acc[a.id] = true;
      return acc;
    }, {});
  };
  const setView = (rotinaId: string) => {
    perms[rotinaId] = { view: true };
  };

  const r = (role || '').toLowerCase();

  if (r === 'cobrador') {
    const cobMod = MODULES.find((m) => m.id === 'cobradores');
    cobMod?.rotinas.forEach((rot) => setAll(rot.id, rot.acoes));
    setView('vendas_propostas');
    perms.fin_baixa_parcelas = { liberado: true, view: true, baixar: true };
  } else if (r === 'recepcao') {
    perms.cli_lista = { liberado: true, view: true, create: true, edit: true, delete: false };
    perms.cli_contratos = { liberado: true, view: true, create: false, edit: false, delete: false };
    perms.fin_baixa_parcelas = { liberado: true, view: true, baixar: true };
    perms.fin_receber = { liberado: true, view: true, baixar: true };
  } else if (r === 'financeiro') {
    const finMod = MODULES.find((m) => m.id === 'financeiro');
    finMod?.rotinas.forEach((rot) => setAll(rot.id, rot.acoes));
    setView('cli_lista');
    setView('cli_contratos');
    perms.rel_geral = { view: true, export: true };
  } else if (r === 'vendedor') {
    const vendaMod = MODULES.find((m) => m.id === 'vendas');
    vendaMod?.rotinas.forEach((rot) => {
      perms[rot.id] = rot.acoes.reduce<Record<string, boolean>>((acc, a) => {
        if (a.id === 'view_todos' || a.id === 'confirm') {
          acc[a.id] = false;
        } else if (a.id === 'delete') {
          acc[a.id] = false;
        } else {
          acc[a.id] = true;
        }
        return acc;
      }, {});
    });
    perms.ponto_registro = { liberado: true, view: true, create: true };
    perms.ponto_espelho = { liberado: true, view: true, view_todos: false, edit: false };
    perms.com_vendedores = { liberado: true, view: true };
  } else if (r === 'estoquista') {
    setView('dashboard_view');
    const estMod = MODULES.find((m) => m.id === 'estoque');
    estMod?.rotinas.forEach((rot) => setAll(rot.id, rot.acoes));
  } else if (r === 'motorista') {
    setView('dashboard_view');
    const frotaMod = MODULES.find((m) => m.id === 'frota');
    frotaMod?.rotinas.forEach((rot) => setAll(rot.id, rot.acoes));
  } else if (r === 'atendente' || r === 'agentes_funerarios' || r === 'agente_funerario') {
    const atdMod = MODULES.find((m) => m.id === 'atendimentos');
    atdMod?.rotinas.forEach((rot) => setAll(rot.id, rot.acoes));
    perms.cli_lista = { liberado: true, view: true, create: true, edit: true, delete: false };
    perms.cli_contratos = { liberado: true, view: true, create: false, edit: false, delete: false };
    const frotaMod = MODULES.find((m) => m.id === 'frota');
    frotaMod?.rotinas.forEach((rot) => setAll(rot.id, rot.acoes));
    const docMod = MODULES.find((m) => m.id === 'documentos');
    docMod?.rotinas.forEach((rot) => setView(rot.id));
    perms.ponto_registro = { liberado: true, view: true, create: true };
    perms.ponto_espelho = { liberado: true, view: true, view_todos: false, edit: false };
    perms.fin_tesouraria = {
      liberado: true,
      view: true,
      abrir_caixa: true,
      fechar_caixa: true,
      create: true,
      ver_todos_caixas: false,
    };
    perms.fin_baixa_parcelas = { liberado: true, view: true, baixar: true };
  }

  return perms;
}

const CARGOS_SEM_PAINEL_EXECUTIVO = new Set([
  'financeiro',
  'atendente',
  'agentes_funerarios',
  'agente_funerario',
  'vendedor',
]);

/** Comissões padrão por cargo quando o admin não marcou (ou marcou só outras rotinas). */
const COMISSOES_PADRAO_POR_CARGO: Record<string, readonly string[]> = {
  vendedor: ['com_vendedores'],
  cobrador: ['com_cobradores'],
  atendente: ['com_atendentes'],
  agentes_funerarios: ['com_atendentes'],
  agente_funerario: ['com_atendentes'],
  financeiro: ['com_cobradores', 'com_atendentes', 'com_vendedores'],
  rh: ['com_cobradores', 'com_atendentes', 'com_vendedores'],
  gerente: ['com_cobradores', 'com_atendentes', 'com_vendedores'],
  diretoria: ['com_cobradores', 'com_atendentes', 'com_vendedores'],
  gestor_executivo: ['com_cobradores', 'com_atendentes', 'com_vendedores'],
  gestao_executiva: ['com_cobradores', 'com_atendentes', 'com_vendedores'],
  supervisao: ['com_cobradores', 'com_atendentes', 'com_vendedores'],
  gestor: ['com_cobradores', 'com_atendentes', 'com_vendedores'],
};

function garantirComissoesPadraoCargo(
  role: string,
  out: Record<string, unknown>,
  raw: Record<string, unknown>,
): void {
  const rotinas = COMISSOES_PADRAO_POR_CARGO[role.toLowerCase()];
  if (!rotinas?.length) return;
  for (const rotId of rotinas) {
    if (Object.prototype.hasOwnProperty.call(raw, rotId) && !usuarioPodeVerRotina(raw, rotId)) {
      continue;
    }
    if (!usuarioPodeVerRotina(out, rotId)) {
      out[rotId] = { liberado: true, view: true };
    }
  }
}

function mergeDefaultsRotinas(
  target: Record<string, Record<string, boolean>>,
  source: Record<string, Record<string, boolean>>,
): void {
  for (const [rotId, acoes] of Object.entries(source)) {
    if (!target[rotId]) {
      target[rotId] = { ...acoes };
      continue;
    }
    for (const [acaoId, val] of Object.entries(acoes)) {
      if (val) target[rotId][acaoId] = true;
    }
  }
}

function defaultsCombinadosDosCargos(roles: readonly string[]): Record<string, Record<string, boolean>> {
  const merged: Record<string, Record<string, boolean>> = {};
  for (const cargo of roles) {
    mergeDefaultsRotinas(merged, getDefaultPermsForRole(cargo));
  }
  return merged;
}

/** Nunca Painel executivo (`/dashboard`), mesmo com JSON legado ou merge `{...seeded,...base}`. */
function negarPainelExecutivo(out: Record<string, unknown>): Record<string, unknown> {
  const dashMod = MODULES.find((m) => m.id === 'dashboard');
  const rot = dashMod?.rotinas.find((x) => x.id === 'dashboard_view');
  if (!rot) return out;
  const cleared = rot.acoes.reduce<Record<string, boolean>>((acc, a) => ({ ...acc, [a.id]: false }), {});
  return { ...out, dashboard_view: cleared };
}

const CHAVES_ESPECIAIS_PERMISSOES = new Set(['ponto_config', CHAVE_EMPRESAS_CONTEXTO, CHAVE_NIVEL_PADRAO]);

const ALL_ROTINAS_IDS = new Set(
  MODULES.flatMap((m) => m.rotinas.map((r) => r.id)),
);

function extrairRotinasDoJson(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (CHAVES_ESPECIAIS_PERMISSOES.has(key)) continue;
    if (ALL_ROTINAS_IDS.has(key) || key === 'vendas') {
      out[key] = val;
    }
  }
  return out;
}

/** True quando o usuário já tem matriz salva no banco (independente do cargo). */
export function usuarioTemPermissoesExplicitasSalvas(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (usuarioPossuiMatrizGranular(raw)) return true;
  return Object.keys(extrairRotinasDoJson(raw)).length > 0;
}

/**
 * Matriz para o formulário de permissões: só o que está salvo em users.permissoes.
 * Não mescla defaults do cargo — o admin vê exatamente o que foi ativado/desativado.
 */
export function permissoesParaFormularioUsuario(
  raw: Record<string, unknown> | null | undefined,
): Record<string, Record<string, boolean>> {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? extrairRotinasDoJson({ ...raw }) : {};
  return montarSnapshotCompletoPermissoes(base) as Record<string, Record<string, boolean>>;
}

/** Permissões efetivas na sessão/menu — prioriza matriz salva; senão nível padrão; cargo só como fallback legado. */
export function resolverPermissoesUsuarioParaSessao(
  role: string | null | undefined,
  raw: Record<string, unknown> | null | undefined,
  rolesExtra?: string[] | null,
): Record<string, unknown> {
  const roles = rolesEfetivosUsuario(role, rolesExtra);
  const primary = roles[0] || 'vendedor';
  const base: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const defaultsTodos = defaultsCombinadosDosCargos(roles);
  const nivelPadrao = extrairNivelPadrao(base);
  const explicitas = usuarioTemPermissoesExplicitasSalvas(base);

  let out: Record<string, unknown>;

  if (primary === 'admin' || primary === 'admin_sistema' || primary === 'admin_empresa') {
    if (usuarioPossuiMatrizGranular(base)) {
      out = montarSnapshotCompletoPermissoes(extrairRotinasDoJson(base));
    } else {
      out = {
        ...(permissoesImplicitasDoCargoParaFormulario(primary) as Record<string, unknown>),
        ...base,
      };
    }
  } else if (explicitas) {
    out = montarSnapshotCompletoPermissoes(extrairRotinasDoJson(base));
  } else if (nivelPadrao) {
    const nivelEfetivo = nivelPadrao === 'master' ? 'platina' : nivelPadrao;
    out = montarSnapshotCompletoPermissoes({
      ...(montarPermissoesNivel(nivelEfetivo) as Record<string, unknown>),
      ...extrairRotinasDoJson(base),
    });
  } else if (usuarioPossuiMatrizGranular(base)) {
    out = montarSnapshotCompletoPermissoes(extrairRotinasDoJson(base));
  } else if (Object.keys(defaultsTodos).length > 0) {
    out = montarSnapshotCompletoPermissoes({
      ...(defaultsTodos as Record<string, unknown>),
      ...extrairRotinasDoJson(base),
    });
  } else {
    out = permissoesImplicitasDoCargoParaFormulario(primary) as Record<string, unknown>;
  }

  if (CARGOS_SEM_PAINEL_EXECUTIVO.has(primary) && !explicitas) {
    out = negarPainelExecutivo(out);
  }

  if (primary === 'vendedor' && !explicitas && !nivelPadrao) {
    out = aplicarTetoPermissoesVendedor(out, base, rolesExtra);
  }

  if (primary === 'cobrador' && !explicitas && !nivelPadrao) {
    out = aplicarTetoPermissoesCobrador(out, base);
  }

  if (!explicitas && !nivelPadrao) {
    for (const cargo of roles) {
      garantirComissoesPadraoCargo(cargo, out, base);
    }
  }

  const empCtx = base[CHAVE_EMPRESAS_CONTEXTO];
  if (empCtx && typeof empCtx === 'object' && !Array.isArray(empCtx)) {
    out[CHAVE_EMPRESAS_CONTEXTO] = empCtx;
  }

  const nivelPadraoVal = base[CHAVE_NIVEL_PADRAO];
  if (typeof nivelPadraoVal === 'string' && nivelPadraoVal.trim()) {
    out[CHAVE_NIVEL_PADRAO] = nivelPadraoVal.trim();
  }

  return out;
}

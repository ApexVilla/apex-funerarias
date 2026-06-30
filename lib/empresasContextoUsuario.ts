import { filialCombinaUnidade } from './cobradorUnidadeFiltro';
import { unidadeNomeCurto } from './contextoUnidadeLabels';
import { podeVerVisaoConsolidadaGrupo } from './perfisContexto';

/** Chave em `users.permissoes` — mapa empresa_id → liberado para troca no header. */
export const CHAVE_EMPRESAS_CONTEXTO = 'empresas_contexto';

export type EmpresaGrupoRow = { id: string; nome: string };

export function extrairEmpresasContexto(
  permissoes: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const raw = permissoes?.[CHAVE_EMPRESAS_CONTEXTO];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (id && v === true) out[id] = true;
  }
  return out;
}

export function usuarioTemEmpresasContextoConfiguradas(
  permissoes: Record<string, unknown> | null | undefined,
): boolean {
  return Object.keys(extrairEmpresasContexto(permissoes)).length > 0;
}

/** Ids explicitamente marcados pelo admin (pode estar vazio). */
export function idsEmpresasContextoMarcadas(
  permissoes: Record<string, unknown> | null | undefined,
): string[] {
  return Object.keys(extrairEmpresasContexto(permissoes));
}

/**
 * Estabelecimentos que o usuário pode usar no seletor do topo.
 * • Com `empresas_contexto` preenchido: somente as unidades marcadas (nunca a do cadastro por padrão).
 * • Gestor/diretoria sem mapa: todo o grupo (comportamento anterior).
 * • Demais: só a empresa do cadastro.
 */
export function filtrarEmpresasGrupoParaUsuario(
  empresasGrupo: EmpresaGrupoRow[],
  permissoes: Record<string, unknown> | null | undefined,
  empresaCadastroId: string,
  role?: string | null,
): EmpresaGrupoRow[] {
  const grupo = empresasGrupo || [];
  const cad = (empresaCadastroId || '').trim();
  const marcadas = extrairEmpresasContexto(permissoes);
  const idsMarcados = Object.keys(marcadas).filter((id) => marcadas[id]);

  if (idsMarcados.length > 0) {
    const allow = new Set(idsMarcados);
    /** Empresa do cadastro sempre entra no contexto (evita bloqueio após troca de unidade no usuário). */
    if (cad && grupo.some((e) => e.id === cad)) {
      allow.add(cad);
    }
    const filtradas = grupo.filter((e) => allow.has(e.id));
    if (filtradas.length > 0) return filtradas;
    return idsMarcados.map((id) => {
      const noGrupo = grupo.find((e) => e.id === id);
      return noGrupo || { id, nome: id.slice(0, 8) };
    });
  }

  if (podeVerVisaoConsolidadaGrupo(role) && grupo.length > 0) {
    return grupo;
  }

  if (cad) {
    const uma = grupo.find((e) => e.id === cad);
    if (uma) return [uma];
  }
  return grupo.length === 1 ? [grupo[0]] : [];
}

/** Pode trocar unidade no header ou usar visão “todas as unidades”. */
export function podeAlternarEstabelecimentoUsuario(
  empresasVisiveis: EmpresaGrupoRow[],
  permissoes: Record<string, unknown> | null | undefined,
  role?: string | null,
): boolean {
  if (empresasVisiveis.length <= 1) return false;
  if (usuarioTemEmpresasContextoConfiguradas(permissoes)) {
    return empresasVisiveis.length > 1;
  }
  return podeVerVisaoConsolidadaGrupo(role) && empresasVisiveis.length > 1;
}

type FilialContextoRow = { id: string; nome: string };

/**
 * Com `empresas_contexto` ou perfil sem visão consolidada, restringe filiais ao nome da unidade
 * (ex.: empresa "Fênix de Catalão" → só filial "Catalão", não Aparecida/Ipameri/Matriz).
 */
export function filtrarFiliaisParaUsuario<T extends FilialContextoRow>(
  filiais: T[],
  empresaNome: string,
  permissoes: Record<string, unknown> | null | undefined,
  opts?: { role?: string | null; qtdEmpresasVisiveis?: number },
): T[] {
  const list = filiais || [];
  if (list.length <= 1) return list;

  const token = unidadeNomeCurto(empresaNome || '').trim();
  if (!token) return list;

  const restritoPorPermissao = usuarioTemEmpresasContextoConfiguradas(permissoes);
  const restritoPorPerfil =
    !podeVerVisaoConsolidadaGrupo(opts?.role) &&
    (opts?.qtdEmpresasVisiveis ?? 1) <= 1;
  const deveRestringir = restritoPorPermissao || restritoPorPerfil;

  const matched = list.filter((f) => filialCombinaUnidade(f.nome, token));
  if (matched.length > 0) return matched;

  /** Uma única filial na empresa: usa mesmo sem o nome bater (ex.: filial "Catalão" na unidade Ipameri). */
  if (deveRestringir && list.length === 1) return list;

  return deveRestringir ? [] : list;
}

/** Ao trocar a empresa do cadastro, garante que `empresas_contexto` inclua a nova unidade. */
export function garantirEmpresaNoContextoPermissoes(
  permissoes: Record<string, unknown> | null | undefined,
  empresaId: string,
): Record<string, unknown> {
  const cad = (empresaId || '').trim();
  const base = { ...(permissoes || {}) };
  if (!cad) return base;
  const ctx = extrairEmpresasContexto(base);
  if (Object.keys(ctx).length === 0) return base;
  return {
    ...base,
    [CHAVE_EMPRESAS_CONTEXTO]: { ...ctx, [cad]: true },
  };
}

/** Defaults ao abrir modal de permissões: empresa do cadastro marcada. */
export function empresasContextoDefaultsParaFormulario(
  empresasGrupo: EmpresaGrupoRow[],
  empresaCadastroId: string,
  salvo: Record<string, boolean>,
): Record<string, boolean> {
  if (Object.keys(salvo).some((id) => salvo[id])) {
    const out: Record<string, boolean> = {};
    for (const e of empresasGrupo) {
      out[e.id] = !!salvo[e.id];
    }
    return out;
  }
  const out: Record<string, boolean> = {};
  const cad = (empresaCadastroId || '').trim();
  for (const e of empresasGrupo) {
    out[e.id] = e.id === cad;
  }
  return out;
}

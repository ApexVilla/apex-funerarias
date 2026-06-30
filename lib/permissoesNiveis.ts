/**
 * Níveis de permissão (independentes do cargo do usuário).
 * Servem como modelos/presets para aplicar na matriz granular de users.permissoes.
 */

import { MODULES, montarSnapshotCompletoPermissoes } from './permissoesCatalog';

/** Metadado em `users.permissoes` — categoria do preset (nao substitui a matriz salva). */
export const CHAVE_NIVEL_PADRAO = 'nivel_padrao';

export type NivelPermissaoId = 'bronze' | 'prata' | 'ouro' | 'platina' | 'master';

export interface NivelPermissaoDef {
  id: NivelPermissaoId;
  nome: string;
  descricao: string;
  risco: 'baixo' | 'moderado' | 'alto' | 'critico';
  ordem: number;
}

export const NIVEIS_PERMISSAO: NivelPermissaoDef[] = [
  {
    id: 'bronze',
    nome: 'Bronze',
    descricao: 'Consulta básica — visualizar rotinas operacionais sem alterar dados.',
    risco: 'baixo',
    ordem: 10,
  },
  {
    id: 'prata',
    nome: 'Prata',
    descricao: 'Operacional — incluir e editar no dia a dia, sem exclusões críticas.',
    risco: 'moderado',
    ordem: 20,
  },
  {
    id: 'ouro',
    nome: 'Ouro',
    descricao: 'Supervisão — amplo acesso operacional, sem configurações sensíveis.',
    risco: 'alto',
    ordem: 30,
  },
  {
    id: 'platina',
    nome: 'Platina',
    descricao: 'Nível máximo padrão — quase tudo liberado; ajustes finos no painel administrativo.',
    risco: 'alto',
    ordem: 40,
  },
  {
    id: 'master',
    nome: 'Master',
    descricao: 'Uso interno Apex — acesso total (não é nível padrão de operação).',
    risco: 'critico',
    ordem: 50,
  },
];

/** Níveis oferecidos como preset padrão (Bronze → Platina). */
export const NIVEIS_PERMISSAO_PADRAO = NIVEIS_PERMISSAO.filter((n) => n.id !== 'master');

export function extrairNivelPadrao(
  raw: Record<string, unknown> | null | undefined,
): NivelPermissaoId | null {
  const v = raw?.[CHAVE_NIVEL_PADRAO];
  if (typeof v !== 'string') return null;
  const id = v.trim().toLowerCase();
  return NIVEIS_PERMISSAO.some((n) => n.id === id) ? (id as NivelPermissaoId) : null;
}

function matrizVazia(): Record<string, Record<string, boolean>> {
  const perms: Record<string, Record<string, boolean>> = {};
  for (const mod of MODULES) {
    for (const rot of mod.rotinas) {
      perms[rot.id] = {};
      for (const acao of rot.acoes) {
        perms[rot.id][acao.id] = false;
      }
    }
  }
  return perms;
}

function acaoPermitidaNoNivel(
  nivel: NivelPermissaoId,
  modId: string,
  acaoId: string,
): boolean {
  if (nivel === 'master') return true;

  const leitura = acaoId === 'view' || acaoId === 'liberado';
  const escritaSuave = acaoId === 'create' || acaoId === 'edit' || acaoId === 'import' || acaoId === 'export';
  const sensivel =
    acaoId === 'delete'
    || acaoId === 'estornar'
    || acaoId === 'confirm'
    || acaoId === 'view_todos'
    || acaoId === 'gerenciar_operadores'
    || acaoId === 'ver_todos_caixas';

  const modConfig = modId === 'config';
  const modFinanceiroCritico = modId === 'financeiro' && (acaoId === 'delete' || acaoId === 'estornar');

  if (nivel === 'bronze') {
    if (modConfig) return acaoId === 'view';
    return leitura;
  }

  if (nivel === 'prata') {
    if (modConfig) return acaoId === 'view';
    if (sensivel || modFinanceiroCritico) return false;
    return leitura || escritaSuave || acaoId === 'baixar' || acaoId === 'abrir_caixa' || acaoId === 'fechar_caixa';
  }

  if (nivel === 'ouro') {
    if (modConfig) return acaoId === 'view';
    if (sensivel && modFinanceiroCritico) return false;
    if (acaoId === 'delete' || acaoId === 'estornar') return false;
    if (modConfig && acaoId !== 'view') return false;
    return true;
  }

  // platina
  if (modConfig && rotinaConfigRestrita(acaoId)) return false;
  if (acaoId === 'delete' && modId === 'config') return false;
  return true;
}

function rotinaConfigRestrita(acaoId: string): boolean {
  return acaoId === 'create' || acaoId === 'edit' || acaoId === 'delete' || acaoId === 'liberado';
}

/** Monta matriz completa para um nível (preset independente de cargo). */
export function montarPermissoesNivel(nivel: NivelPermissaoId): Record<string, Record<string, boolean>> {
  const perms = matrizVazia();
  for (const mod of MODULES) {
    for (const rot of mod.rotinas) {
      for (const acao of rot.acoes) {
        perms[rot.id][acao.id] = acaoPermitidaNoNivel(nivel, mod.id, acao.id);
      }
    }
  }
  return montarSnapshotCompletoPermissoes(perms as Record<string, unknown>) as Record<
    string,
    Record<string, boolean>
  >;
}

export function labelNivelPermissao(id: NivelPermissaoId): string {
  return NIVEIS_PERMISSAO.find((n) => n.id === id)?.nome || id;
}

export type ConfigTab = 'perfil' | 'empresa' | 'usuarios' | 'cargos' | 'seguranca' | 'aparencia' | 'permissoes';

const VALID_TABS = new Set<ConfigTab>(['perfil', 'empresa', 'usuarios', 'cargos', 'seguranca', 'aparencia', 'permissoes']);

export function parseConfigTabFromSearch(search: string): ConfigTab {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab');
  if (raw && VALID_TABS.has(raw as ConfigTab)) return raw as ConfigTab;
  return 'perfil';
}

export function buildConfigPath(tab: ConfigTab): string {
  if (tab === 'perfil') return '/config';
  return `/config?tab=${tab}`;
}

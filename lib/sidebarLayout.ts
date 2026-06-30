/** Larguras da barra lateral (desktop) — alinhar Layout, Header e Sidebar. */
export const SIDEBAR_WIDTH_EXPANDED_PX = 280;
export const SIDEBAR_WIDTH_COLLAPSED_PX = 76;
export const SIDEBAR_STORAGE_KEY = 'sidebar_retractable';

export function readSidebarCollapsedFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
}

export function writeSidebarCollapsedToStorage(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
}

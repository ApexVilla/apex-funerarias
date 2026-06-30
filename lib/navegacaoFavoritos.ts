import { useCallback, useEffect, useState } from 'react';

export type FavoritoNav = {
  id: string;
  label: string;
  path: string;
};

const STORAGE_PREFIX = 'apex_nav_favoritos_v2';
const EVENT_NAME = 'apex-nav-favoritos-changed';

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function favoritoIdModulo(moduloId: string) {
  return `mod:${moduloId}`;
}

export function favoritoIdPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return 'path:/';
  const [pathname, search] = trimmed.split('?');
  const norm = pathname.replace(/\/$/, '') || '/';
  return search ? `path:${norm}?${search}` : `path:${norm}`;
}

export function lerFavoritosNav(userId: string | undefined): FavoritoNav[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FavoritoNav =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as FavoritoNav).id === 'string' &&
        typeof (item as FavoritoNav).label === 'string' &&
        typeof (item as FavoritoNav).path === 'string',
    );
  } catch {
    return [];
  }
}

function salvarFavoritosNav(userId: string, items: FavoritoNav[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function alternarFavoritoNav(
  userId: string | undefined,
  item: FavoritoNav,
): FavoritoNav[] {
  if (!userId) return [];
  const atual = lerFavoritosNav(userId);
  const existe = atual.some((f) => f.id === item.id);
  const next = existe ? atual.filter((f) => f.id !== item.id) : [...atual, item];
  salvarFavoritosNav(userId, next);
  return next;
}

export function ordenarComFavoritosPrimeiro<T>(
  items: T[],
  favoritos: FavoritoNav[],
  getId: (item: T) => string,
): T[] {
  const ordem = new Map(favoritos.map((f, i) => [f.id, i]));
  return [...items].sort((a, b) => {
    const fa = ordem.has(getId(a)) ? ordem.get(getId(a))! : Number.MAX_SAFE_INTEGER;
    const fb = ordem.has(getId(b)) ? ordem.get(getId(b))! : Number.MAX_SAFE_INTEGER;
    if (fa !== fb) return fa - fb;
    return 0;
  });
}

export function useNavegacaoFavoritos(userId: string | undefined) {
  const [favoritos, setFavoritos] = useState<FavoritoNav[]>(() => lerFavoritosNav(userId));

  useEffect(() => {
    setFavoritos(lerFavoritosNav(userId));
  }, [userId]);

  useEffect(() => {
    const sync = () => setFavoritos(lerFavoritosNav(userId));
    window.addEventListener(EVENT_NAME, sync);
    return () => window.removeEventListener(EVENT_NAME, sync);
  }, [userId]);

  const isFavorito = useCallback(
    (id: string) => favoritos.some((f) => f.id === id),
    [favoritos],
  );

  const toggle = useCallback(
    (item: FavoritoNav) => {
      const next = alternarFavoritoNav(userId, item);
      setFavoritos(next);
      return next;
    },
    [userId],
  );

  return { favoritos, isFavorito, toggle };
}

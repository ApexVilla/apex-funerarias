import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RETRY_DELAY_MS = 1500;
const MAX_RETRIES = 2;

/** Reimporta chunks após falha de rede (Wi‑Fi instável / timeout no download). */
export async function importWithRetry<T>(
  factory: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await factory();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(factory));
}

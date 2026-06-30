import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Retorna um valor "debounced" que só atualiza depois de `delay` ms sem mudanças.
 *
 * Uso típico em inputs de busca:
 * ```tsx
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebouncedValue(search, 350);
 *
 * useEffect(() => {
 *   if (debouncedSearch) loadResults(debouncedSearch);
 * }, [debouncedSearch]);
 * ```
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Retorna um callback "debounced" que só executa depois de `delay` ms
 * sem novas chamadas.
 *
 * Uso típico para ações imperativas:
 * ```tsx
 * const debouncedSearch = useDebouncedCallback((term: string) => {
 *   loadResults(term);
 * }, 350);
 * ```
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay = 350,
): (...args: Parameters<T>) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Limpa o timer ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay],
  );
}

/** Parse JSON sem derrubar o app se o valor for inválido ou vazio. */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
    if (raw == null || raw === '') return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

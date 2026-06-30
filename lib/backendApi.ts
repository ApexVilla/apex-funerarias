import { supabase } from './supabase';

type ApiMeta = {
  page?: number;
  per_page?: number;
  total?: number;
  total_pages?: number;
  [key: string]: unknown;
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
  meta?: ApiMeta;
  errors?: string[];
};

const PHP_DISABLED_MSG =
  'API PHP desativada temporariamente. Defina VITE_BACKEND_PHP_ENABLED=true no .env e reinicie o Vite para reativar.';

/** Liga/desliga todas as chamadas ao backend-php (cobrança de campo). Padrão: desligado. */
export function isBackendPhpEnabled(): boolean {
  const v = (import.meta.env.VITE_BACKEND_PHP_ENABLED as string | undefined)?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function assertBackendPhpEnabled(): void {
  if (!isBackendPhpEnabled()) {
    throw new Error(PHP_DISABLED_MSG);
  }
}

/**
 * URL do backend-php (cobrança de campo).
 * - Dev sem env: mesma origem do Vite + proxy em vite.config.ts → PHP :8080
 * - Produção: VITE_BACKEND_PHP_URL no build OU nginx proxy no mesmo host
 */
function resolveBackendBaseUrl(): string {
  const raw = (import.meta.env.VITE_BACKEND_PHP_URL as string | undefined)?.trim() ?? '';
  if (raw) return raw.replace(/\/$/, '');
  return '';
}

const baseUrl = resolveBackendBaseUrl();

function backendOriginLabel(): string {
  if (baseUrl) return baseUrl;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `mesmo host (${window.location.origin})`;
  }
  return 'mesmo host';
}

const PHP_DEV_HINT =
  'Inicie o PHP: npm run dev:php (ou: cd backend-php && php -S 0.0.0.0:8080 -t public public/index.php). O Vite encaminha /cobranca e /cobradores para a porta 8080.';

async function buildAuthHeaders(empresaId: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Empresa-Id': empresaId,
  };
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

async function parseApiJson<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<') || trimmed.startsWith('<!')) {
    throw new Error(
      `A API retornou HTML em vez de JSON (servidor PHP provavelmente parado ou rota sem proxy). ${PHP_DEV_HINT}`,
    );
  }
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    if (response.status === 404) {
      throw new Error(
        'Rota da API PHP não encontrada (404). Verifique se o PHP está rodando com router: php -S 0.0.0.0:8080 -t public public/index.php',
      );
    }
    const preview = trimmed.slice(0, 120);
    throw new Error(
      `Resposta inválida da API PHP (${response.status}). ${preview ? `Início: ${preview}` : 'Corpo vazio.'} ${PHP_DEV_HINT}`,
    );
  }
}

function rethrowIfUnreachable(error: unknown): never {
  const msg = error instanceof Error ? error.message : String(error);
  const looksNetwork =
    error instanceof TypeError ||
    msg === 'Failed to fetch' ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed');
  if (looksNetwork) {
    const devHint = import.meta.env.DEV && !baseUrl ? PHP_DEV_HINT : 'Confira VITE_BACKEND_PHP_URL e se o backend-php está no ar.';
    throw new Error(`Não foi possível contactar a API PHP (${backendOriginLabel()}). ${devHint}`);
  }
  throw error instanceof Error ? error : new Error(msg);
}

const toQuery = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

/** Verifica se o backend PHP responde (útil antes de telas de cobrador). */
export async function backendHealthCheck(): Promise<boolean> {
  if (!isBackendPhpEnabled()) return false;
  try {
    const response = await fetch(`${baseUrl}/health`, { method: 'GET' });
    const json = await parseApiJson<{ ok: boolean }>(response);
    return response.ok && json.success === true;
  } catch {
    return false;
  }
}

export async function backendGet<T>(
  path: string,
  empresaId: string,
  params: Record<string, string | number | undefined> = {}
): Promise<ApiResponse<T>> {
  assertBackendPhpEnabled();
  const query = toQuery(params);
  const headers = await buildAuthHeaders(empresaId);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}${query}`, { headers });
  } catch (e) {
    rethrowIfUnreachable(e);
  }
  const json = await parseApiJson<T>(response);
  if (!response.ok || !json.success) {
    throw new Error(json.errors?.[0] || 'Erro ao consultar API');
  }
  return json;
}

export async function backendPost<T>(
  path: string,
  empresaId: string,
  body: Record<string, unknown>
): Promise<ApiResponse<T>> {
  assertBackendPhpEnabled();
  const headers = await buildAuthHeaders(empresaId);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    rethrowIfUnreachable(e);
  }
  const json = await parseApiJson<T>(response);
  if (!response.ok || !json.success) {
    throw new Error(json.errors?.[0] || 'Erro ao enviar para API');
  }
  return json;
}

export async function backendPut<T>(
  path: string,
  empresaId: string,
  body: Record<string, unknown>
): Promise<ApiResponse<T>> {
  assertBackendPhpEnabled();
  const headers = await buildAuthHeaders(empresaId);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    rethrowIfUnreachable(e);
  }
  const json = await parseApiJson<T>(response);
  if (!response.ok || !json.success) {
    throw new Error(json.errors?.[0] || 'Erro ao atualizar na API');
  }
  return json;
}

export async function backendDelete<T>(
  path: string,
  empresaId: string
): Promise<ApiResponse<T>> {
  assertBackendPhpEnabled();
  const headers = await buildAuthHeaders(empresaId);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers,
    });
  } catch (e) {
    rethrowIfUnreachable(e);
  }
  const json = await parseApiJson<T>(response);
  if (!response.ok || !json.success) {
    throw new Error(json.errors?.[0] || 'Erro ao excluir na API');
  }
  return json;
}

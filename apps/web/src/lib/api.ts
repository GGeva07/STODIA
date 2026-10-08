import { Capacitor } from '@capacitor/core';
import type { RuntimeConfig } from '@stodia/shared';

/**
 * ÚNICO cliente HTTP de la app. La URL de la API NO se compila: se lee en runtime
 * desde /config.json ({"apiUrl","licenseKey"}), por eso el mismo build sirve a cualquier cliente.
 * Las pantallas deben usar siempre `api.get/post/put/del`; nunca fetch directo.
 */
let config: RuntimeConfig = { apiUrl: '', licenseKey: '' };

const SERVER_KEY = 'stodia.apiUrl';
const isNative = Capacitor.isNativePlatform();

/** URL de API guardada por el usuario (tiene prioridad sobre /config.json). */
export const getStoredApiUrl = (): string | null => {
  try { return localStorage.getItem(SERVER_KEY); } catch { return null; }
};

export async function setApiUrl(url: string) {
  try { localStorage.setItem(SERVER_KEY, url); } catch { /* ignore */ }
  if (isNative) {
    try { await (await import('@capacitor/preferences')).Preferences.set({ key: SERVER_KEY, value: url }); } catch { /* ignore */ }
  }
  config = { ...config, apiUrl: url };
}

/** Valida un servidor con GET /health y devuelve el nombre de la institución si lo informa. */
export async function probeServer(url: string): Promise<{ name?: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new ApiError(res.status, 'El servidor respondió con error ' + res.status);
    const d = await res.json().catch(() => ({}));
    return { name: d?.institutionName ?? d?.institution ?? d?.name };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new Error('No se pudo conectar. Revisa la dirección y que estés en la misma red.');
  } finally {
    clearTimeout(t);
  }
}

/** App nativa sin servidor guardado y con /config.json apuntando a localhost: hay que pedirlo. */
export const needsServerSetup = () =>
  isNative && !getStoredApiUrl() && (!config.apiUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(config.apiUrl));

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) config = { ...config, ...(await res.json()) };
  } catch {
    console.warn('No se pudo leer /config.json; se usará apiUrl vacío (mismo origen).');
  }
  if (isNative && !getStoredApiUrl()) {
    try {
      const { value } = await (await import('@capacitor/preferences')).Preferences.get({ key: SERVER_KEY });
      if (value) localStorage.setItem(SERVER_KEY, value);
    } catch { /* ignore */ }
  }
  const stored = getStoredApiUrl();
  if (stored) config = { ...config, apiUrl: stored };
  return config;
}

export const getConfig = () => config;

const TOKEN_KEY = 'stodia.token';
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const UNAUTHORIZED_EVENT = 'stodia:unauthorized';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (config.licenseKey) headers['X-License-Key'] = config.licenseKey;
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(config.apiUrl.replace(/\/$/, '') + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data?.error ?? data?.message ?? res.statusText);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

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

const isPhoneBrowser = () => {
  try { return window.matchMedia('(pointer: coarse) and (max-width: 1100px)').matches; } catch { return false; }
};

/**
 * Hay que pedir el servidor antes del login cuando no hay uno guardado y:
 *  - es la app nativa con /config.json apuntando a localhost, o
 *  - /config.json trae askServer: true, o askServer: 'mobile' y el dispositivo es táctil/pequeño.
 */
export const needsServerSetup = () => {
  if (getStoredApiUrl()) return false;
  if (config.askServer === true || (config.askServer === 'mobile' && isPhoneBrowser())) return true;
  return isNative && (!config.apiUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(config.apiUrl));
};

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

/**
 * Ciclo lectivo consultado (Fase 2D). Solo se fija cuando el elegido NO es el activo: entonces TODAS las peticiones llevan `X-Ciclo` (ASCII: «2025-2026»,
 * las cabeceras HTTP no admiten el guion largo); con el ciclo activo no se envia nada y la API se comporta como siempre. Lo maneja `lib/ciclo.tsx`.
 */
let cicloHeader = '';
export const setCicloHeader = (nombre: string) => { cicloHeader = nombre ? nombre.replace(/[–—]/g, '-') : ''; };

export class ApiError extends Error {
  /** `code` = codigo de negocio de la API (p. ej. CICLO_CERRADO). */
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (config.licenseKey) headers['X-License-Key'] = config.licenseKey;
  if (cicloHeader) headers['X-Ciclo'] = cicloHeader;
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(config.apiUrl.replace(/\/$/, '') + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data?.error ?? data?.message ?? res.statusText, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: { signal?: AbortSignal }) => request<T>('GET', path, undefined, opts?.signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

/** Descarga un recurso binario autenticado (p. ej. un .xlsx generado en el servidor). */
export async function apiBlob(path: string, opts?: { signal?: AbortSignal }): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (config.licenseKey) headers['X-License-Key'] = config.licenseKey;
  if (cicloHeader) headers['X-Ciclo'] = cicloHeader;
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(config.apiUrl.replace(/\/$/, '') + path, { headers, signal: opts?.signal });
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    let msg = res.statusText;
    try { msg = (await res.json())?.error ?? msg; } catch { /* sin cuerpo JSON */ }
    throw new ApiError(res.status, msg);
  }
  return res.blob();
}

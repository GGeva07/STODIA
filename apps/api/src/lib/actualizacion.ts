import fs from 'node:fs';
import path from 'node:path';
import type { ActEstado, ActManifiesto, ActResumen, ActSolicitud } from '@stodia/shared';
import { dataDir, version } from './instalacion';

/**
 * Actualizaciones APROBADAS POR EL CLIENTE.
 *  1) La API consulta un manifiesto público (STODIA_UPDATE_URL; JSON { version, fecha, notas[], minClientVersion? }).
 *  2) Si hay una versión mayor, la app se lo muestra al Super Admin. Nada se instala solo.
 *  3) El Super Admin la aprueba: se escribe DATA_DIR/actualizacion-solicitada.json.
 *  4) El script del HOST (actualizar.sh, programado con cron/systemd) ve la solicitud: respaldo -> nueva versión -> /health -> o vuelve atrás.
 *     Deja el resultado en DATA_DIR/actualizacion-estado.json, que la API devuelve a la app.
 */
type Manifiesto = ActManifiesto;
type Solicitud = ActSolicitud;
type EstadoAct = ActEstado;

const MANIFIESTO_TTL = 6 * 3600_000;
let cache: { at: number; m: Manifiesto | null; error?: string } | null = null;

export const urlManifiesto = () => (process.env.STODIA_UPDATE_URL ?? '').trim();

/** Compara versiones x.y.z (ignora 'v' y sufijos). >0 si a > b. */
export function cmpVersion(a: string, b: string): number {
  const p = (v: string) => v.replace(/^v/, '').split(/[.-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

export async function manifiesto(forzar = false): Promise<{ m: Manifiesto | null; error?: string }> {
  const url = urlManifiesto();
  if (!url) return { m: null, error: 'Sin canal de actualizaciones configurado (STODIA_UPDATE_URL)' };
  if (!forzar && cache && Date.now() - cache.at < MANIFIESTO_TTL) return cache;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = (await res.json()) as Manifiesto;
    if (!j || typeof j.version !== 'string' || !/^v?\d+\.\d+\.\d+/.test(j.version)) throw new Error('manifiesto sin versión válida');
    cache = { at: Date.now(), m: { version: j.version.replace(/^v/, ''), fecha: j.fecha, notas: Array.isArray(j.notas) ? j.notas.map(String).slice(0, 50) : [], minClientVersion: j.minClientVersion } };
  } catch (e) {
    cache = { at: Date.now() - MANIFIESTO_TTL + 10 * 60_000, m: null, error: 'No se pudo consultar el canal de actualizaciones (' + (e instanceof Error ? e.message : 'error') + ')' }; // reintenta en 10 min
  } finally { clearTimeout(t); }
  return cache;
}

const archivo = (n: string) => path.join(dataDir(), n);
function leer<T>(n: string): T | null {
  try { return JSON.parse(fs.readFileSync(archivo(n), 'utf8')) as T; } catch { return null; }
}

export const solicitud = () => leer<Solicitud>('actualizacion-solicitada.json');
export const ultimoEstado = () => leer<EstadoAct>('actualizacion-estado.json');

export function solicitar(v: string, usuario: string): Solicitud {
  const s: Solicitud = { version: v, aprobadaPor: usuario, aprobadaEn: new Date().toISOString() };
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(archivo('actualizacion-solicitada.json'), JSON.stringify(s, null, 2), { mode: 0o600 });
  return s;
}
export function cancelar() {
  fs.rmSync(archivo('actualizacion-solicitada.json'), { force: true });
}

export async function resumen(forzar = false): Promise<ActResumen> {
  const actual = version();
  const { m, error } = await manifiesto(forzar);
  const disponible = m && cmpVersion(m.version, actual) > 0 ? m : null;
  return { actual, disponible, solicitud: solicitud(), ultimo: ultimoEstado(), canal: !!urlManifiesto(), error };
}

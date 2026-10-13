import { useEffect, useState } from 'react';
import { api } from './api';
import { soloDigitos } from './rnc';

/** Respuesta de GET /kiosko/rnc/:rnc (DGII manda; si la API externa falla, 'indisponible'). */
export interface RncVerificado { rnc: string; estado: 'ok' | 'no-encontrado' | 'indisponible' | 'longitud'; razonSocial?: string; fuente?: 'dgii' | 'tutor' | 'historial'; estadoDgii?: string; activo?: boolean }
/** Estado derivado de lo escrito: corto/diez = ayuda sin error; validando = esperando (debounce o API); ok/no-encontrado/indisponible = resultado del RNC ACTUAL (nunca de uno anterior). */
export type EstadoLookup = 'vacio' | 'corto' | 'diez' | 'validando' | 'ok' | 'no-encontrado' | 'indisponible';
export interface RncLookup { estado: EstadoLookup; digitos: string; razonSocial?: string; fuente?: RncVerificado['fuente']; estadoDgii?: string; activo?: boolean }

const defaultFetcher = (d: string) => api.get<RncVerificado>('/kiosko/rnc/' + d);

/**
 * Validación automática de RNC (9) / cédula (11) con la API: al llegar a 9 u 11 dígitos consulta tras `debounceMs`; con 10 no consulta y el usuario puede seguir escribiendo.
 * Las respuestas llegan etiquetadas con los dígitos consultados y se ignoran si ya no coinciden con los actuales (carreras 9 → 11); el estado se DERIVA, no se guarda.
 */
export function useRncLookup(rncRaw: string, enabled = true, fetcher: (d: string) => Promise<RncVerificado> = defaultFetcher, debounceMs = 300): RncLookup {
  const digitos = soloDigitos(rncRaw);
  const consultable = enabled && (digitos.length === 9 || digitos.length === 11);
  const [res, setRes] = useState<{ digitos: string; data: RncVerificado | null } | null>(null);

  useEffect(() => {
    if (!consultable) return;
    let vivo = true;
    const t = setTimeout(() => {
      fetcher(digitos)
        .then(data => { if (vivo) setRes({ digitos, data }); })
        .catch(() => { if (vivo) setRes({ digitos, data: null }); });
    }, debounceMs);
    return () => { vivo = false; clearTimeout(t); };
    // fetcher se asume estable (o irrelevante entre renders)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultable, digitos, debounceMs]);

  if (!enabled || !digitos) return { estado: 'vacio', digitos };
  if (digitos.length < 9) return { estado: 'corto', digitos };
  if (digitos.length === 10 || digitos.length > 11) return { estado: 'diez', digitos };
  if (!res || res.digitos !== digitos) return { estado: 'validando', digitos };
  const d = res.data;
  if (!d || d.estado === 'indisponible' || d.estado === 'longitud') return { estado: 'indisponible', digitos };
  if (d.estado === 'no-encontrado') return { estado: 'no-encontrado', digitos };
  return { estado: 'ok', digitos, razonSocial: d.razonSocial, fuente: d.fuente, estadoDgii: d.estadoDgii, activo: d.activo };
}

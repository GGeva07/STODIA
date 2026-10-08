import { useEffect, useState } from 'react';
import type { CfgPerfil, ConfigGlobal } from '@stodia/shared';
import { api } from '../../lib/api';

/** Perfil del cliente (GET /config → perfil): nombre legal, RNC y ciudad para recibos, contratos y tarifarios. */
let cache: CfgPerfil | null = null;
let pending: Promise<CfgPerfil | null> | null = null;
const subs = new Set<(p: CfgPerfil) => void>();

export function loadPerfil(force = false): Promise<CfgPerfil | null> {
  if (cache && !force) return Promise.resolve(cache);
  pending ??= api.get<ConfigGlobal>('/config').then(c => { cache = c.perfil; subs.forEach(f => f(c.perfil)); return cache; }).catch(() => null).finally(() => { pending = null; });
  return pending;
}
export const perfilSync = () => cache;

export function usePerfil(): CfgPerfil | null {
  const [p, setP] = useState<CfgPerfil | null>(cache);
  useEffect(() => { subs.add(setP); void loadPerfil(); return () => { subs.delete(setP); }; }, []);
  return p;
}
/** "COLEGIO LOS PINOS, SRL" → texto de encabezado; vacío si aún no cargó. */
export const nombreLegal = (p: CfgPerfil | null) => p?.nombre ?? '';
export const rncTxt = (p: CfgPerfil | null) => p?.rnc ?? '';
export const ciudadTxt = (p: CfgPerfil | null) => p?.ciudad || (p?.dir ? p.dir.split(',').pop()!.trim() : '');

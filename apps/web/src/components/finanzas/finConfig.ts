import { useEffect, useState } from 'react';
import type { CfgCiclo, CfgFinanzas, ConfigGlobal } from '@stodia/shared';
import { api } from '../../lib/api';

/** Configuración financiera y ciclos de la instancia (GET /config → finanzas, ciclos). Nada de esto va en el código. */
export interface FinCfg { finanzas: CfgFinanzas; ciclos: CfgCiclo[]; ciclo: string; ciclo0: number; ready: boolean }
const VACIO: FinCfg = { finanzas: { matricula: 0, inscripcion: 0, itbis: 0.18, recargoMoraPct: 0, descuentoProntoPct: 0, diaCorte: 0 }, ciclos: [], ciclo: '', ciclo0: new Date().getFullYear(), ready: false };
const mk = (c: ConfigGlobal): FinCfg => {
  const ciclo = c.ciclos.find(x => x.estado === 'Activo')?.n ?? '';
  return { finanzas: { ...VACIO.finanzas, ...c.finanzas }, ciclos: c.ciclos, ciclo, ciclo0: Number(ciclo.slice(0, 4)) || VACIO.ciclo0, ready: true };
};
let cache: FinCfg | null = null;
const subs = new Set<(c: FinCfg) => void>();

export function loadFinCfg(force = false): Promise<FinCfg> {
  if (cache && !force) return Promise.resolve(cache);
  return api.get<ConfigGlobal>('/config').then(c => { cache = mk(c); subs.forEach(f => f(cache!)); return cache; }).catch(() => cache ?? VACIO);
}

export function useFinCfg(): FinCfg {
  const [c, setC] = useState<FinCfg>(cache ?? VACIO);
  useEffect(() => { subs.add(setC); void loadFinCfg(true); return () => { subs.delete(setC); }; }, []);
  return c;
}

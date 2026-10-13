import { cloneElement, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { CfgCiclo, ConfigGlobal } from '@stodia/shared';
import { api, setCicloHeader } from './api';
import { useSession } from './session';

/**
 * CICLO LECTIVO SELECCIONADO (Fase 2D). Estado global de la app de escritorio:
 *  - `cicloSeleccionado`: el que muestra el selector de la barra lateral (por defecto el ACTIVO). Se guarda en localStorage y se valida contra la lista real
 *    de ciclos (GET /config): si el guardado ya no existe, o no es seleccionable, se vuelve al activo.
 *  - `lib/api.ts` envia la cabecera `X-Ciclo` en TODAS las peticiones SOLO cuando el elegido no es el activo (con el activo no cambia nada).
 *  - Un ciclo que no es el activo es SOLO LECTURA (`soloLectura`): las pantallas por ciclo deshabilitan sus acciones con `useSoloLectura()` / `<Mutating>`
 *    y el servidor lo exige igual (409 CICLO_CERRADO / CICLO_NO_ACTIVO). Los catalogos, usuarios, licencia, configuracion... NO son por ciclo y siguen editables.
 *  - Un ciclo Planificado SIEMPRE es seleccionable (pre-inscripcion): Inscripcion, Cobros (POS), Becas y Planes de Pago escriben en el (`soloLecturaFin` = solo Cerrado);
 *    el resto de pantallas por ciclo sigue en solo lectura (`soloLectura` = no es el activo), igual que el servidor (CICLO_NO_ACTIVO).
 *  - El contenido de la pantalla se remonta con `key={cicloSeleccionado}` (AppLayout): recarga sus datos sin tocar la cabecera ni la barra lateral.
 */
export const SL_MSG = 'Ciclo cerrado: solo lectura';
const KEY = 'stodia.ciclo';
/** Pantallas cuyos datos son POR CICLO (el resto ignora el selector). */
export const POR_CICLO = ['dashboard', 'notas', 'asistencia', 'horarios', 'extra', 'directorio', 'expediente', 'tutores', 'inscripcion', 'pos', 'planes', 'becas', 'comunica'];

const leer = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const guardar = (n: string) => { try { if (n) localStorage.setItem(KEY, n); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento: solo en memoria */ } };

export const seleccionable = (_c: CfgCiclo) => true; // todos: el planificado admite trabajo anticipado

interface Ctx {
  cicloSeleccionado: string; ciclos: CfgCiclo[]; cicloActivo: string;
  esActivo: boolean;
  /** Clave estable para remontar el contenido al cambiar de ciclo: 'activo' mientras se ve el activo (no cambia al cargar la lista), si no el nombre del ciclo. */
  clave: string; estado: CfgCiclo['estado'] | ''; soloLectura: boolean;
  /** Solo lectura REAL: ciclo cerrado. Un ciclo planificado admite inscripcion, cobros, becas y planes de pago (trabajo anticipado). */
  soloLecturaFin: boolean;
  cambiar: (n: string) => void; volverAlActivo: () => void; refrescar: () => void;
}
const Ctx = createContext<Ctx | null>(null);

export function CicloProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [ciclos, setCiclos] = useState<CfgCiclo[]>([]);
  const [sel, setSel] = useState<string>(() => { const g = leer(); setCicloHeader(g); return g; }); // cabecera ya fijada para la primera carga de las pantallas
  const activo = ciclos.find(c => c.estado === 'Activo')?.n ?? '';

  const cargar = useCallback(() => {
    if (!user) return;
    api.get<ConfigGlobal>('/config').then(cfg => setCiclos(cfg.ciclos)).catch(() => undefined);
  }, [user]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { // se crea / cierra un ciclo en Configuracion
    window.addEventListener('stodia:ciclos', cargar);
    return () => window.removeEventListener('stodia:ciclos', cargar);
  }, [cargar]);

  // Validacion contra la lista real: sin seleccion o seleccion inexistente / no seleccionable -> ciclo activo.
  useEffect(() => {
    if (!ciclos.length) return;
    const c = ciclos.find(x => x.n === sel);
    if (c && seleccionable(c)) return;
    setSel(activo); guardar(activo); setCicloHeader('');
  }, [ciclos, sel, activo]);
  useEffect(() => { setCicloHeader(sel && sel !== activo ? sel : ''); }, [sel, activo]);

  const cambiar = useCallback((n: string) => { setSel(n); guardar(n); setCicloHeader(n && n !== activo ? n : ''); }, [activo]);
  const volverAlActivo = useCallback(() => cambiar(activo), [cambiar, activo]);

  const v = useMemo<Ctx>(() => {
    const actual = ciclos.find(c => c.n === sel);
    const cicloSeleccionado = actual ? sel : activo || sel;
    const esActivo = actual ? actual.estado === 'Activo' : !sel || sel === activo || !ciclos.length && !sel;
    return { cicloSeleccionado, ciclos, cicloActivo: activo, esActivo, clave: esActivo ? 'activo' : cicloSeleccionado, estado: actual?.estado ?? '', soloLectura: !esActivo, soloLecturaFin: actual?.estado === 'Cerrado', cambiar, volverAlActivo, refrescar: cargar };
  }, [ciclos, sel, activo, cambiar, volverAlActivo, cargar]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useCiclo(): Ctx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCiclo requiere <CicloProvider>');
  return c;
}
/** `true` cuando el ciclo consultado no es el activo: las pantallas por ciclo deshabilitan toda accion que modifique datos. */
export const useSoloLectura = () => useCiclo().soloLectura;
/** Props para un boton/accion que modifica datos: `<button {...slProps(sl)}>` -> disabled + tooltip «Ciclo cerrado: solo lectura» en solo lectura. */
export const slProps = (sl: boolean, extraDisabled = false) => ({ disabled: sl || extraDisabled, title: sl ? SL_MSG : undefined });

/**
 * Envuelve UN boton (o cualquier elemento con `disabled`): en solo lectura lo deshabilita, le pone el tooltip y atenua. `<Mutating><button onClick=...>Cobrar</button></Mutating>`.
 * Un `<span>` envolvente conserva el tooltip aunque el boton deshabilitado no reciba eventos.
 */
export function Mutating({ children }: { children: ReactElement<{ disabled?: boolean; title?: string; className?: string; onClick?: unknown }> }) {
  const sl = useSoloLectura();
  if (!sl) return children;
  const p = children.props;
  return <span title={SL_MSG} className="inline-flex cursor-not-allowed">{cloneElement(children, { disabled: true, title: SL_MSG, className: `${p.className ?? ''} pointer-events-none opacity-50`, onClick: undefined })}</span>;
}

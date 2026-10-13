import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useSession } from './session';
import { PREFIJO, almacen, estaCerrada, leerCiclo, limpiarBorradores, limpiarPrefijo, recien } from './draftStore';

export { limpiarBorradores, limpiarPrefijo };

/**
 * BORRADORES DE FORMULARIO. Ver docs/borradores-formularios.md.
 * `useDraft(clave, inicial, opts?)` funciona como useState pero el valor sobrevive a navegar a otra pantalla, recargar o cerrar el modal.
 *  - Solo sessionStorage (datos personales de alumnos/tutores: se borra al cerrar la pestaña). Clave: `stodia:draft:<usuario>:<ciclo>:<clave>`.
 *  - Escritura con debounce (300 ms), al desmontar y al ocultar la pagina (recarga/cierre). TTL 24 h y version de esquema.
 *  - Si el valor es igual al inicial no se guarda nada (no hay borrador que restaurar).
 *  - `omitir` (claves de primer nivel) y `transformar` impiden persistir campos sensibles (contrasenas, PIN, tokens, archivos, tarjetas, texto de confirmacion).
 *  - Se limpia con `limpiar()` (enviar con exito / Cancelar / Nueva inscripcion), al cerrar sesion y al entrar otro usuario (`limpiarBorradores`).
 *  - Si falla el almacenamiento (privado, cuota, JSON invalido) se comporta como un useState normal.
 */
const TTL_DEF = 24 * 60 * 60 * 1000;
const DEBOUNCE = 300;

export interface DraftOpts<T> {
  /** Claves de primer nivel que NO se guardan (al restaurar toman el valor inicial). */
  omitir?: (keyof T)[];
  /** Saneado adicional antes de guardar (p. ej. vaciar un campo anidado). */
  transformar?: (v: T) => T;
  /** Subir cuando cambie la forma del estado: los borradores de otra version se descartan. */
  version?: number;
  ttlMs?: number;
  /** false = la clave no incluye el ciclo (formularios que no son por ciclo). */
  porCiclo?: boolean;
  /** Huella de la entidad editada (p. ej. updatedAt). Si difiere de la guardada, `meta.obsoleto` = true. */
  firma?: string;
  /** false = no guardar y borrar el borrador existente (p. ej. formulario ya enviado con éxito). */
  activo?: boolean;
  /** true = ni restaura (en el primer render) ni escribe, y NO borra nada (p. ej. un drawer abierto en modo «ver»). */
  pausado?: boolean;
}

export interface DraftMeta { restaurado: boolean; obsoleto: boolean; descartar: () => void }
type Sobre<T> = { v: number; t: number; f?: string; d: T };

function sanear<T>(v: T, o: DraftOpts<T>): T {
  let r = v;
  if (o.omitir?.length && r && typeof r === 'object' && !Array.isArray(r)) { r = { ...(r as object) } as T; for (const k of o.omitir) delete (r as Record<keyof T, unknown>)[k]; }
  return o.transformar ? o.transformar(r) : r;
}

export function useDraft<T>(clave: string, inicial: T | (() => T), opts: DraftOpts<T> = {}): [T, Dispatch<SetStateAction<T>>, () => void, DraftMeta] {
  const { user } = useSession();
  const usuario = user?.usuario ?? '';
  const version = opts.version ?? 1;
  const ttl = opts.ttlMs ?? TTL_DEF;
  const ciclo = opts.porCiclo === false ? '-' : leerCiclo() || 'activo';
  const key = `${PREFIJO}${usuario}:${ciclo}:${clave}`;
  const optsRef = useRef(opts); optsRef.current = opts;
  const inicialRef = useRef<T>(undefined as unknown as T);
  const ini = () => { if (inicialRef.current === undefined) inicialRef.current = typeof inicial === 'function' ? (inicial as () => T)() : inicial; return inicialRef.current; };

  const cargar = (): { v: T; restaurado: boolean; obsoleto: boolean } => {
    const base = ini();
    const s = almacen();
    if (!s || !usuario || opts.pausado) return { v: base, restaurado: false, obsoleto: false };
    try {
      const raw = s.getItem(key);
      if (!raw) return { v: base, restaurado: false, obsoleto: false };
      const e = JSON.parse(raw) as Sobre<T>;
      if (!e || e.v !== version || typeof e.t !== 'number' || Date.now() - e.t > ttl || e.d === undefined) { s.removeItem(key); return { v: base, restaurado: false, obsoleto: false }; }
      const d = e.d && typeof e.d === 'object' && !Array.isArray(e.d) && base && typeof base === 'object' ? ({ ...(base as object), ...(e.d as object) } as T) : e.d;
      return { v: d, restaurado: true, obsoleto: !!opts.firma && !!e.f && e.f !== opts.firma };
    } catch { return { v: base, restaurado: false, obsoleto: false }; }
  };

  const [estado, setEstado] = useState(() => ({ key, ...cargar() }));
  let cur = estado;
  if (estado.key !== key) { cur = { key, ...cargar() }; setEstado(cur); } // la clave cambio (otro plan, otro ciclo): recarga el borrador de esa clave
  const valor = cur.v;
  const valorRef = useRef(valor); valorRef.current = valor;
  const keyRef = useRef(key); keyRef.current = key;
  const firmaRef = useRef(opts.firma); firmaRef.current = opts.firma;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const escribir = useCallback((k: string, v: T) => {
    const s = almacen(); const o = optsRef.current;
    if (!s || k.startsWith(PREFIJO + ':') || o.pausado) return;
    if (estaCerrada()) return;
    const t = recien.get(k);
    if (t && Date.now() - t < 5000) return;
    if (o.activo === false) { try { s.removeItem(k); } catch { /* ignorar */ } return; } // inactivo (enviado / solo lectura): no hay borrador
    try {
      const d = sanear(v, o);
      const base = sanear(inicialRef.current, o);
      if (JSON.stringify(d) === JSON.stringify(base)) { s.removeItem(k); return; }
      const e: Sobre<T> = { v: version, t: Date.now(), f: firmaRef.current, d };
      s.setItem(k, JSON.stringify(e));
    } catch { /* cuota / privado / no serializable: sin persistencia */ }
  }, [version]);

  const vaciarTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => { // debounce
    if (!usuario) return;
    vaciarTimer();
    timer.current = setTimeout(() => { timer.current = null; escribir(key, valor); }, DEBOUNCE);
    return vaciarTimer;
  }, [key, valor, usuario, escribir, opts.activo]);
  useEffect(() => { // flush al ocultar la pagina (recarga / cierre) y al desmontar
    const flush = () => { vaciarTimer(); if (usuario) escribir(keyRef.current, valorRef.current); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [usuario, escribir]);

  const setValor = useCallback<Dispatch<SetStateAction<T>>>(a => {
    recien.delete(keyRef.current); // edición nueva: vuelve a guardarse
    setEstado(p => {
      const v = typeof a === 'function' ? (a as (x: T) => T)(p.v) : a;
      valorRef.current = v;
      return { ...p, v, restaurado: p.restaurado, obsoleto: p.obsoleto };
    });
  }, []);

  const limpiar = useCallback(() => {
    vaciarTimer();
    recien.set(keyRef.current, Date.now());
    const b = inicialRef.current;
    valorRef.current = b; // si se desmonta antes del siguiente render, el flush ve el inicial y no escribe
    try { almacen()?.removeItem(keyRef.current); } catch { /* ignorar */ }
    setEstado(p => ({ ...p, v: b, restaurado: false, obsoleto: false }));
  }, []);

  useLayoutEffect(() => { /* mantiene `valorRef` sincronizado tras restaurar */ valorRef.current = valor; });

  // Si el usuario devuelve el formulario al estado inicial (Nueva inscripción, vaciar campos...) ya no hay nada «restaurado».
  let restaurado = cur.restaurado;
  if (restaurado) { try { restaurado = JSON.stringify(sanear(valor, opts)) !== JSON.stringify(sanear(inicialRef.current, opts)); } catch { /* conserva */ } }
  const meta: DraftMeta = { restaurado, obsoleto: cur.obsoleto, descartar: limpiar };
  return [valor, setValor, limpiar, meta];
}

/** Aviso discreto «Borrador restaurado · Descartar». Renderiza nada si no se restauro nada. */
export function AvisoBorrador({ meta, className = '' }: { meta: DraftMeta; className?: string }) {
  if (!meta.restaurado) return null;
  return (
    <div role="status" className={`flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800 ${className}`}>
      <span>Borrador restaurado{meta.obsoleto ? ' (el registro cambió en el servidor desde entonces)' : ''}</span>
      <span aria-hidden>·</span>
      <button type="button" onClick={meta.descartar} className="font-semibold underline underline-offset-2 hover:text-amber-950">Descartar</button>
    </div>
  );
}

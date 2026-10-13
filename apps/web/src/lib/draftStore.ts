/** Almacén de borradores (sin dependencias de React ni de la sesión: lo usan lib/session.tsx y lib/useDraft.tsx). Ver docs/borradores-formularios.md. */
export const PREFIJO = 'stodia:draft:';

/** Claves descartadas hace poco: evitan que el flush de un desmontaje posterior reescriba un borrador ya limpiado (limpiar() tras guardar puede ejecutarse antes o después del desmontaje). */
export const recien = new Map<string, number>();
/** true tras cerrar sesión hasta el siguiente login: los formularios que se desmontan al salir no deben reescribir su borrador. */
let sesionCerrada = false;
export const estaCerrada = () => sesionCerrada;

export const almacen = (): Storage | null => { try { return window.sessionStorage; } catch { return null; } };
export const leerCiclo = () => { try { return localStorage.getItem('stodia.ciclo') ?? ''; } catch { return ''; } };

/** Borra todos los borradores (cierre de sesion). Con `conservarUsuario` borra los de los demas usuarios. */
export function limpiarBorradores(conservarUsuario?: string) {
  sesionCerrada = !conservarUsuario;
  const s = almacen();
  if (!s) return;
  try {
    const ks: string[] = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIJO)) ks.push(k); }
    for (const k of ks) if (!conservarUsuario || !k.startsWith(PREFIJO + conservarUsuario + ':')) s.removeItem(k);
  } catch { /* ignorar */ }
}

/** Borra los borradores cuyo nombre empieza por el prefijo (p. ej. 'inscripcion:'), tambien los de componentes ya desmontados. */
export function limpiarPrefijo(prefijo: string) {
  const s = almacen();
  if (!s) return;
  try {
    const ks: string[] = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIJO) && k.split(':').slice(4).join(':').startsWith(prefijo)) ks.push(k); }
    ks.forEach(k => s.removeItem(k));
  } catch { /* ignorar */ }
}


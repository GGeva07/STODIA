import { api } from '../../lib/api';
import type { PDoc } from './print';

/**
 * Firmas de documentos (docs/firmas-documentos.md). La imagen NO viaja en el PDoc de las pantallas: `conFirmas` la pide a
 * GET /documentos/firmas justo antes de mostrar la vista previa / generar el PDF y la embebe como data URL en `signImg`
 * (paralelo a `sign`), de modo que html2canvas no depende de CORS. Sin firma cargada o ante cualquier fallo el documento sale como siempre.
 */
export type RolFirma = 'Cajero' | 'Docente' | 'Director';

/** Rol que firma una línea según su etiqueta (null = línea de otra persona: tutor, supervisor, coordinación, auditoría…). */
export function rolDeLinea(l: string): RolFirma | null {
  if (/cajer/i.test(l)) return 'Cajero';
  if (/docente/i.test(l)) return 'Docente';
  if (/direcci[oó]n|director/i.test(l)) return 'Director';
  return null;
}

const sesion = (): { usuario: string; rol: string } | null => {
  try { return JSON.parse(localStorage.getItem('stodia.user') ?? 'null'); } catch { return null; }
};

interface Resp { cajero?: { dataUrl: string } | null; docente?: { dataUrl: string } | null; director?: { dataUrl: string } | null }

/**
 * Devuelve el documento con `signImg` resuelto (idempotente). Firmante por línea:
 *  Cajero = doc.firmaDe.Cajero (quien emitió) o, si no, la sesión cuando es Cajero · Docente = doc.firmaDe.Docente (docente del curso) o la sesión cuando es Docente ·
 *  Director = el Director Académico activo con firma (primero por usuario). La tirilla (sin bloque de firmas) gana una línea «Cajero/a» solo si la cajera tiene firma.
 */
export async function conFirmas(doc: PDoc): Promise<PDoc> {
  if (doc.firmasListas) return doc;
  try {
    const u = sesion();
    const roles = doc.sign.map(rolDeLinea);
    const tirilla = doc.kind === 'tirilla';
    const cajero = doc.firmaDe?.Cajero?.trim() || (u?.rol === 'Cajero' ? u.usuario : '');
    const docente = doc.firmaDe?.Docente?.trim() || (u?.rol === 'Docente' ? u.usuario : '');
    const q = new URLSearchParams();
    if (cajero && (tirilla || roles.includes('Cajero'))) q.set('cajero', cajero);
    if (docente && roles.includes('Docente')) q.set('docente', docente);
    if (roles.includes('Director')) q.set('director', '1');
    if (![...q.keys()].length) return { ...doc, firmasListas: true };
    const r = await api.get<Resp>('/documentos/firmas?' + q.toString());
    if (tirilla) return r.cajero ? { ...doc, sign: ['Cajero/a'], signImg: [r.cajero.dataUrl], firmasListas: true } : { ...doc, firmasListas: true };
    const imgs = roles.map(x => (x === 'Cajero' ? r.cajero : x === 'Docente' ? r.docente : x === 'Director' ? r.director : null)?.dataUrl ?? null);
    return { ...doc, signImg: imgs.some(Boolean) ? imgs : undefined, firmasListas: true };
  } catch {
    return { ...doc, firmasListas: true };
  }
}

import { prisma } from '../db';

export type AuditAccion = 'Insert' | 'Update' | 'Delete';
export interface AuditDetalle { tabla: string; id: string; prev?: unknown; next?: unknown; ip?: string }

/**
 * Servicio de auditoría append-only. Uso desde cualquier módulo:
 *   await audit(req.user, 'Update', { tabla: 'Becas', id: 'EXP-1', prev: 'Pendiente', next: 'Aprobada', ip: req.ip });
 * `user` = string (usuario) o el payload JWT. Nunca lanza: un fallo de auditoría no rompe la operación.
 */
export async function audit(user: string | { usuario: string }, accion: AuditAccion, d: AuditDetalle) {
  try {
    const s = (v: unknown) => (v === undefined || v === null ? '—' : String(v));
    await prisma.sisAudit.create({
      data: {
        t: new Date().toISOString().slice(0, 19).replace('T', ' '),
        usr: typeof user === 'string' ? user : user.usuario,
        accion, tabla: d.tabla, registro: d.id, prev: s(d.prev), next: s(d.next), ip: d.ip ?? '—',
      },
    });
  } catch (e) {
    console.error('audit falló', e);
  }
}
